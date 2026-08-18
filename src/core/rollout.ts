// §6.7 — Monte Carlo. Il modello deterministico (max-bid.ts) assume che i piani futuri siano
// disponibili al prezzo previsto p̂: non è vero, qualcun altro può soffiarli. Il rollout propaga
// l'incertezza stocastica sul resto dell'asta, per un CONFRONTO APPAIATO (stessa continuazione
// casuale, "common random numbers"): "vinco il giocatore corrente a un prezzo ipotetico p" contro
// "lo perdo", esattamente come Φ_win(p) vs Φ_lose di §6.6 ma con Monte Carlo al posto della DP
// esatta per il resto dell'asta.
//
// Nota architetturale: qui in core/ (usato anche dal browser) NON si usano gli archetipi di
// sim/archetypes.ts (quelli sono per il simulatore di calibrazione, in sim/, che dipende da
// core/ e non viceversa). Gli avversari sono modellati con un moltiplicatore di rumore i.i.d.
// attorno a p̂: un'approssimazione ragionevole quando — come nell'app dal vivo — non si conosce
// la vera psicologia di ciascun avversario.

import { ROLES } from './types.js';
import type { ManagerState, Role, RoleWeights, RolloutConfig, RolloutResult, SlotCounts, SlotWeights, ValueCurveConfig } from './types.js';
import { DEFAULT_ROLE_WEIGHTS, DEFAULT_VALUE_CURVES } from './config.js';
import { maxSingleBid } from './ceiling.js';
import { computeDuals, approxMaxBid, shouldRecalcDuals, type DualState } from './base-policy.js';
import type { RoleDPInput, DPCandidate } from './plan-dp.js';
import { surrogateRosterValue, type SurrogatePlayerInput } from './value-surrogate.js';
import { fantamedia, roleWeightedPlayerValue } from './value-model.js';
import { randNormal, shuffle, type Rng } from './rng.js';

const DUALS_BUDGET_GRANULARITY = 20;
const OPPONENT_NOISE_SIGMA = 0.25;

export interface RolloutPoolPlayer {
  readonly id: string;
  readonly role: Role;
  /** Il MIO score percepito (0-100): usato per il mio valore/bidding, non quello del mercato. */
  readonly myScore: number;
  readonly pHat: number;
}

export interface RolloutOwnedPlayer {
  readonly role: Role;
  readonly myScore: number;
}

export interface RolloutInput {
  readonly myManagerId: string;
  readonly managers: readonly ManagerState[]; // stato corrente di TUTTI, incluso il mio
  readonly myOwned: readonly RolloutOwnedPlayer[]; // la mia rosa attuale (prima di questa decisione)
  readonly targetRole: Role;
  readonly targetMyScore: number;
  readonly targetPHat: number;
  /** Pool residuo DOPO l'estrazione del giocatore corrente (non lo contiene). */
  readonly remainingPool: readonly RolloutPoolPlayer[];
  readonly leagueSlots: SlotCounts;
  readonly minPrice: number;
  readonly slotWeights: SlotWeights;
  readonly rolloutConfig: RolloutConfig;
  /** Orizzonte massimo di estrazioni simulate nella continuazione (limite di prestazioni). */
  readonly maxHorizon?: number;
  /** Curve di valore da usare (§6.1), già corrette per il rischio configurato (§6.8) a monte —
   * default alle curve base se non fornite. */
  readonly valueCurves?: ValueCurveConfig;
  /** Peso personale per ruolo (§11 Setup) — default nessuna preferenza se non fornito. */
  readonly roleWeights?: RoleWeights;
}

interface SimManagerState {
  credits: number;
  slots: SlotCounts;
  ownedByRole: Record<Role, number>;
  /** MIEI score percepiti dei posseduti: valorizzato solo per il manager "me". */
  ownedScores: Record<Role, readonly number[]>;
}

function asManagerStateLike(s: SimManagerState, id: string): ManagerState {
  return { manager: { id, name: id, isMe: false }, creditsRemaining: s.credits, slotsRemaining: s.slots, roster: [] };
}

function cloneSimState(s: SimManagerState): SimManagerState {
  return { credits: s.credits, slots: { ...s.slots }, ownedByRole: { ...s.ownedByRole }, ownedScores: { ...s.ownedScores } };
}

function initManagerStates(input: RolloutInput): Map<string, SimManagerState> {
  const map = new Map<string, SimManagerState>();
  for (const m of input.managers) {
    map.set(m.manager.id, {
      credits: m.creditsRemaining,
      slots: { ...m.slotsRemaining },
      ownedByRole: { P: 0, D: 0, C: 0, A: 0 },
      ownedScores: { P: [], D: [], C: [], A: [] },
    });
  }
  const me = map.get(input.myManagerId)!;
  const ownedByRole: Record<Role, number[]> = { P: [], D: [], C: [], A: [] };
  for (const p of input.myOwned) ownedByRole[p.role]!.push(p.myScore);
  for (const role of ROLES) {
    me.ownedByRole[role] = ownedByRole[role]!.length;
    me.ownedScores[role] = ownedByRole[role]!;
  }
  return map;
}

function buildMyRoleInputs(
  me: SimManagerState,
  pool: readonly RolloutPoolPlayer[],
  leagueSlots: SlotCounts,
  slotWeights: SlotWeights,
  valueCurves: ValueCurveConfig,
  roleWeights: RoleWeights,
): Record<Role, RoleDPInput> {
  const roleInputs = {} as Record<Role, RoleDPInput>;
  for (const role of ROLES) {
    const forced: DPCandidate[] = me.ownedScores[role]!.map((score) => ({
      v: roleWeightedPlayerValue(role, score, roleWeights, { curves: valueCurves }),
      price: 0,
      forced: true,
    }));
    const rolePool = pool.filter((p) => p.role === role);
    const optional: DPCandidate[] = rolePool
      .map((p) => ({
        v: roleWeightedPlayerValue(role, p.myScore, roleWeights, { curves: valueCurves }),
        price: Math.max(1, p.pHat),
        forced: false,
      }))
      .sort((a, b) => b.v - a.v)
      .slice(0, 20);
    const scoresSorted = rolePool.map((p) => p.myScore).sort((a, b) => a - b);
    const p20 = scoresSorted[Math.floor(0.2 * scoresSorted.length)] ?? 30;
    roleInputs[role] = {
      candidates: [...forced, ...optional],
      fillerValue: roleWeightedPlayerValue(role, p20, roleWeights, { curves: valueCurves }),
      slotCount: leagueSlots[role],
      weights: slotWeights[role],
    };
  }
  return roleInputs;
}

/**
 * Simula la continuazione dell'asta (fino a `order.length` estrazioni) a partire da uno stato
 * indipendente per variante (§6.6-analogo: `myStart` è il MIO stato dopo aver "pagato" p per il
 * target, oppure dopo averlo perso). Ritorna il valore finale della mia rosa (surrogato, §6.2).
 */
function simulateContinuation(
  input: RolloutInput,
  othersInit: ReadonlyMap<string, SimManagerState>,
  myStart: SimManagerState,
  order: readonly RolloutPoolPlayer[],
  opponentNoiseByDraw: readonly ReadonlyMap<string, number>[],
  fillerScoreByRole: Readonly<Record<Role, number>>,
): number {
  const managers = new Map<string, SimManagerState>();
  for (const [id, s] of othersInit) managers.set(id, id === input.myManagerId ? myStart : cloneSimState(s));

  const me = managers.get(input.myManagerId)!;
  const valueCurves = input.valueCurves ?? DEFAULT_VALUE_CURVES;
  const roleWeights = input.roleWeights ?? DEFAULT_ROLE_WEIGHTS;
  let dualsCache: DualState | null = null;
  let drawsSinceRecalc = Infinity;
  let creditsAtLastRecalc = me.credits;

  for (let i = 0; i < order.length; i++) {
    const player = order[i]!;
    const role = player.role;
    const noiseMap = opponentNoiseByDraw[i]!;

    const opponentBids = Array.from(managers.entries())
      .filter(([id, s]) => id !== input.myManagerId && s.slots[role] > 0)
      .map(([id, s]) => {
        const cap = maxSingleBid(asManagerStateLike(s, id));
        if (cap < input.minPrice) return null;
        const noise = noiseMap.get(id) ?? 1;
        const raw = player.pHat * noise;
        return { id, bid: Math.max(input.minPrice, Math.min(raw, cap)) };
      })
      .filter((b): b is { id: string; bid: number } => b !== null);

    const myCap = maxSingleBid(asManagerStateLike(me, input.myManagerId));
    const iAmEligible = me.slots[role] > 0 && myCap >= input.minPrice;
    let myBid = 0;
    if (iAmEligible) {
      // L'orizzonte di un rollout è già una finestra troncata e breve (§6.7, limite di
      // prestazioni): si ricalcolano i duali al doppio della cadenza di un'asta intera
      // (dualsRecalcEveryDraws · 2) invece che ogni 20 estrazioni, dato che una finestra di
      // 40-80 estrazioni non giustifica 4 ricalcoli completi (ciascuno una DP a 4 ruoli) quanto
      // un'asta intera da 250; è un compromesso di prestazioni esplicito, non un difetto del
      // modello dei duali in sé (già usato, senza modifiche, in sim/auction-sim.ts).
      const needsRecalc = shouldRecalcDuals(
        drawsSinceRecalc,
        input.rolloutConfig.dualsRecalcEveryDraws * 2,
        creditsAtLastRecalc,
        me.credits,
        input.rolloutConfig.dualsRecalcOnBudgetDropFraction,
      );
      if (needsRecalc || dualsCache === null) {
        const poolFromHere = order.slice(i + 1);
        const roleInputs = buildMyRoleInputs(me, poolFromHere, input.leagueSlots, input.slotWeights, valueCurves, roleWeights);
        const scaledBudget = Math.max(1, Math.floor(me.credits / DUALS_BUDGET_GRANULARITY));
        const duals = computeDuals({ budget: scaledBudget, roleInputs, ownedCountByRole: me.ownedByRole });
        dualsCache = { ...duals, lambda: duals.lambda / DUALS_BUDGET_GRANULARITY };
        drawsSinceRecalc = 0;
        creditsAtLastRecalc = me.credits;
      }
      const v = roleWeightedPlayerValue(role, player.myScore, roleWeights, { curves: valueCurves });
      myBid = Math.max(input.minPrice, Math.min(approxMaxBid(v, role, dualsCache, myCap), myCap));
    }

    const allBids = [...opponentBids, ...(iAmEligible ? [{ id: input.myManagerId, bid: myBid }] : [])].filter(
      (b) => b.bid >= input.minPrice,
    );

    if (allBids.length > 0) {
      allBids.sort((a, b) => b.bid - a.bid);
      const winnerId = allBids[0]!.id;
      const second = allBids[1]?.bid ?? 0;
      const price = allBids.length === 1 ? input.minPrice : Math.max(input.minPrice, Math.round(second) + 1);
      const winner = managers.get(winnerId)!;
      const finalPrice = Math.min(price, maxSingleBid(asManagerStateLike(winner, winnerId)));
      winner.credits -= finalPrice;
      winner.slots = { ...winner.slots, [role]: winner.slots[role] - 1 };
      winner.ownedByRole = { ...winner.ownedByRole, [role]: winner.ownedByRole[role] + 1 };
      if (winnerId === input.myManagerId) {
        winner.ownedScores = { ...winner.ownedScores, [role]: [...winner.ownedScores[role]!, player.myScore] };
      }
    }

    drawsSinceRecalc++;
  }

  // L'orizzonte è troncato (limite di prestazioni, §6.7): la maggior parte degli slot di lega,
  // mio compreso, resta scoperta alla fine della finestra simulata. Valutare surrogateRosterValue
  // sui soli slot EFFETTIVAMENTE riempiti tratterebbe uno slot vuoto come valore zero anziché come
  // "verrà riempito a livello di rimpiazzo", facendo sembrare "avere un giocatore qualsiasi"
  // artificiosamente prezioso (il rango vuoto assegnerebbe comunque il peso più alto disponibile
  // a un singolo giocatore debole). Si completa ogni ruolo incompleto con il valore-filler fino a
  // slotCount, cosicché il confronto vinco/perdo isoli il contributo REALE della decisione.
  const playersByRole = {} as Record<Role, SurrogatePlayerInput[]>;
  for (const role of ROLES) {
    const owned = me.ownedScores[role]!.map((score) => ({
      rankValue: roleWeightedPlayerValue(role, score, roleWeights, { curves: valueCurves }),
      // `potential` resta neutro rispetto al peso di ruolo: è la stima di verità-a-terra usata dal
      // confronto vinco/perdo, non la preferenza — stesso principio già seguito per il rischio.
      potential: 38 * fantamedia(role, score, valueCurves),
    }));
    const fillerV = roleWeightedPlayerValue(role, fillerScoreByRole[role], roleWeights, { curves: valueCurves });
    const fillerPotential = 38 * fantamedia(role, fillerScoreByRole[role], valueCurves);
    const missing = Math.max(0, input.leagueSlots[role] - owned.length);
    const padding = Array.from({ length: missing }, () => ({ rankValue: fillerV, potential: fillerPotential }));
    playersByRole[role] = [...owned, ...padding];
  }
  return surrogateRosterValue(playersByRole, input.slotWeights);
}

function quantile(sorted: readonly number[], q: number): number {
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)));
  return sorted[idx]!;
}

export function runRollout(input: RolloutInput, rng: Rng): RolloutResult {
  const myState = input.managers.find((m) => m.manager.id === input.myManagerId);
  if (!myState) throw new Error(`manager non trovato: ${input.myManagerId}`);
  const c0 = maxSingleBid(myState);
  if (c0 < input.minPrice) return { median: 0, p10: 0, p90: 0 };

  const gridSize = Math.max(2, input.rolloutConfig.bidGridSize);
  const grid = Array.from(
    new Set(
      Array.from({ length: gridSize }, (_, i) => Math.max(1, Math.round(1 + (i * (c0 - 1)) / (gridSize - 1)))),
    ),
  );

  const fillerScoreByRole = {} as Record<Role, number>;
  for (const role of ROLES) {
    const scores = input.remainingPool.filter((p) => p.role === role).map((p) => p.myScore).sort((a, b) => a - b);
    fillerScoreByRole[role] = scores.length > 0 ? scores[Math.floor(0.2 * scores.length)]! : 20;
  }

  const horizon = Math.min(input.maxHorizon ?? 80, input.remainingPool.length);
  const managersInit = initManagerStates(input);
  const meInit = managersInit.get(input.myManagerId)!;
  const pStars: number[] = [];

  for (let r = 0; r < input.rolloutConfig.rollouts; r++) {
    const shuffled = shuffle(input.remainingPool, rng).slice(0, horizon);
    const opponentNoiseByDraw: Map<string, number>[] = shuffled.map(() => {
      const m = new Map<string, number>();
      for (const mgr of input.managers) {
        if (mgr.manager.id !== input.myManagerId) m.set(mgr.manager.id, Math.exp(randNormal(rng) * OPPONENT_NOISE_SIGMA));
      }
      return m;
    });

    // "Perdo": il target va al miglior offerente fra gli avversari eleggibili (se ce n'è uno).
    const eligibleForTarget = input.managers.filter(
      (m) => m.manager.id !== input.myManagerId && m.slotsRemaining[input.targetRole] > 0,
    );
    const loseOthersInit = new Map(managersInit);
    if (eligibleForTarget.length > 0) {
      const bids = eligibleForTarget
        .map((m) => {
          const s = managersInit.get(m.manager.id)!;
          const cap = maxSingleBid(asManagerStateLike(s, m.manager.id));
          const noise = Math.exp(randNormal(rng) * OPPONENT_NOISE_SIGMA);
          return { id: m.manager.id, bid: Math.max(input.minPrice, Math.min(input.targetPHat * noise, cap)) };
        })
        .filter((b) => b.bid >= input.minPrice)
        .sort((a, b) => b.bid - a.bid);
      if (bids.length > 0) {
        const winnerId = bids[0]!.id;
        const second = bids[1]?.bid ?? 0;
        const price = bids.length === 1 ? input.minPrice : Math.round(second) + 1;
        const winnerState = cloneSimState(loseOthersInit.get(winnerId)!);
        const finalPrice = Math.min(price, maxSingleBid(asManagerStateLike(winnerState, winnerId)));
        winnerState.credits -= finalPrice;
        winnerState.slots = { ...winnerState.slots, [input.targetRole]: winnerState.slots[input.targetRole] - 1 };
        loseOthersInit.set(winnerId, winnerState);
      }
    }
    const vLose = simulateContinuation(input, loseOthersInit, cloneSimState(meInit), shuffled, opponentNoiseByDraw, fillerScoreByRole);

    const diffs: { p: number; diff: number }[] = [];
    for (const p of grid) {
      const meWin: SimManagerState = {
        credits: meInit.credits - p,
        slots: { ...meInit.slots, [input.targetRole]: meInit.slots[input.targetRole] - 1 },
        ownedByRole: { ...meInit.ownedByRole, [input.targetRole]: meInit.ownedByRole[input.targetRole] + 1 },
        ownedScores: {
          ...meInit.ownedScores,
          [input.targetRole]: [...meInit.ownedScores[input.targetRole]!, input.targetMyScore],
        },
      };
      const vWin = simulateContinuation(input, managersInit, meWin, shuffled, opponentNoiseByDraw, fillerScoreByRole);
      diffs.push({ p, diff: vWin - vLose });
    }

    // Interpolazione dell'incrocio: diffs è (tipicamente) non crescente in p, §6.6.
    let pStar = 0;
    for (let i = 0; i < diffs.length; i++) {
      if (diffs[i]!.diff >= 0) {
        pStar = diffs[i]!.p;
      } else {
        if (i > 0 && diffs[i - 1]!.diff > diffs[i]!.diff) {
          const d0 = diffs[i - 1]!;
          const d1 = diffs[i]!;
          const frac = d0.diff / (d0.diff - d1.diff);
          pStar = Math.round(d0.p + frac * (d1.p - d0.p));
        }
        break;
      }
    }
    pStars.push(Math.max(0, Math.min(c0, pStar)));
  }

  pStars.sort((a, b) => a - b);
  return { median: quantile(pStars, 0.5), p10: quantile(pStars, 0.1), p90: quantile(pStars, 0.9) };
}
