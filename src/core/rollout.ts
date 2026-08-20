// §6.7 — Monte Carlo. Il modello deterministico (max-bid.ts) assume che i piani futuri siano
// disponibili al prezzo previsto p̂: non è vero, qualcun altro può soffiarli. Il rollout propaga
// l'incertezza stocastica sul resto dell'asta, per un CONFRONTO APPAIATO (stessa continuazione
// casuale, "common random numbers"): "vinco il giocatore corrente a un prezzo ipotetico p" contro
// "lo perdo", esattamente come Φ_win(p) vs Φ_lose di §6.6 ma con Monte Carlo al posto della DP
// esatta per il resto dell'asta.
//
// Riscritto (§7 Session 8, segnalazione dell'utente): fino a questa revisione gli AVVERSARI, dentro
// il rollout, rispondevano con "prezzo di mercato atteso × rumore casuale" — nessun ragionamento
// sulla loro reale scarsità di slot/budget, e l'orizzonte simulato era tagliato a un numero fisso di
// estrazioni (indipendente da quante ne mancassero davvero), oltre il quale gli slot ancora vuoti
// venivano "indovinati" con un valore-filler invece di continuare la simulazione. L'osservazione
// corretta che ha portato al cambio: "quando un fantallenatore ha tanti soldi sarà vicino al prezzo
// reale... se c'è scarsità offrirà tanto, se è l'unico con lo slot libero offrirà pochissimo" — un
// comportamento che il vecchio modello di rumore non calcolava affatto. Ora OGNI manager (me
// compreso) usa la stessa logica di offerta "razionale" già validata su dati reali in
// `sim/auction-sim.ts` (`core/rational-bidder.ts`, condivisa fra i due), e l'orizzonte arriva fino
// alla fine vera del pool residuo per default — il filler resta solo come rete di sicurezza per
// l'eventuale coda oltre `maxHorizon`, non più il meccanismo principale.
//
// Assunzione esplicita, onesta (§7 Session 8, stessa di `estimateOpponentWillingness` in
// engine.ts): non conosciamo le preferenze reali di un avversario, quindi si valuta ogni giocatore
// con IL TUO punteggio percepito (`myScore`) e pesi di ruolo NEUTRI — una stima ragionevole quando
// il giudizio di qualità è condiviso (quotazioni pubbliche), non una certezza.

import { ROLES } from './types.js';
import type { ManagerState, Role, RoleWeights, RolloutConfig, RolloutResult, SlotCounts, SlotWeights, ValueCurveConfig } from './types.js';
import { DEFAULT_BUDGET_SHARES, DEFAULT_ROLE_WEIGHTS, DEFAULT_VALUE_CURVES } from './config.js';
import { maxSingleBid, totalSlotsRemaining } from './ceiling.js';
import {
  buildRationalRoleInputs,
  computeRationalBase,
  applyUrgencyAndNoise,
  freshRationalBidderCache,
  type RationalBidderCache,
  type RationalCandidateInput,
} from './rational-bidder.js';
import { surrogateRosterValue, type SurrogatePlayerInput } from './value-surrogate.js';
import { fantamedia, roleWeightedPlayerValue } from './value-model.js';
import { randNormal, shuffle, type Rng } from './rng.js';

// Bug reale trovato e corretto (§7 Session 8): con granularità 20 (il valore usato dalla VECCHIA
// versione di questo file, tarata per un solo manager con un pool già ridotto a 20 candidati), un
// budget di lega intero (500 crediti / 25 slot) si riduce a soli 25 "crediti" scalati — troppo
// pochi per rappresentare una rosa da 25 slot con candidati che costano quasi tutti 1-3 unità
// scalate: la DP satura, l'inviluppo resta piatto ovunque, e λ collassa a 0 (misurato: phi crollava
// da 2646 a 331 solo cambiando granularità 1→20, con OGNI manager che finiva per offrire sempre e
// solo il minimo, 1 credito, per QUALUNQUE giocatore). Stessa identica scala usata con successo da
// `sim/auction-sim.ts` per lo stesso identico problema (10 manager, rosa da 25 slot): 5, non 20.
const DUALS_BUDGET_GRANULARITY = 10;
/** Ricalcolo dei duali per gli AVVERSARI più rado di quello del manager valutato (sotto): non
 * serve la stessa precisione per 9 manager quanto per quello di cui stiamo decidendo l'offerta —
 * dimezza il numero di DP risolte per estrazione a un costo di realismo marginale. */
const OPPONENT_RECALC_MULTIPLIER = 4;
const MAX_OPTIONAL_CANDIDATES_FOR_DUALS = 15;
/** Orizzonte di sicurezza quando `maxHorizon` non è specificato — vedi il commento su `horizon`
 * dentro `runRollout` per il perché di questo numero specifico. */
const DEFAULT_MAX_HORIZON = 250;

export interface RolloutPoolPlayer {
  readonly id: string;
  readonly role: Role;
  /** Il TUO score percepito (0-100): usato come proxy di valore per TUTTI i manager (§7 Session 8,
   * stessa assunzione di `estimateOpponentWillingness` — non conosciamo le preferenze reali di un
   * avversario), non solo per il tuo bidding. */
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
  /** Rosa attuale di CIASCUN manager (me compreso), score percepiti — §7 Session 8: prima solo la
   * mia rosa era tracciata con valori reali, quella degli avversari solo per conteggio. Serve per
   * dare a ciascun avversario un ranking di slot coerente con quello che possiede DAVVERO, non un
   * conteggio nudo. */
  readonly ownedByManager: ReadonlyMap<string, readonly RolloutOwnedPlayer[]>;
  readonly targetRole: Role;
  readonly targetMyScore: number;
  readonly targetPHat: number;
  /** Pool residuo DOPO l'estrazione del giocatore corrente (non lo contiene). */
  readonly remainingPool: readonly RolloutPoolPlayer[];
  readonly leagueSlots: SlotCounts;
  /** Budget di partenza di UN manager (§11 Setup, costante per tutta l'asta): serve al rialzo di
   * urgenza condiviso (`core/rational-bidder.ts`) come riferimento fisso di "passo equo" — MAI il
   * budget residuo corrente, che si evolve insieme a `actualPace` e renderebbe l'eccesso sempre
   * ~0 per costruzione se usato come proprio stesso termine di paragone. */
  readonly leagueBudget: number;
  readonly minPrice: number;
  readonly slotWeights: SlotWeights;
  readonly rolloutConfig: RolloutConfig;
  /** Orizzonte massimo di estrazioni simulate nella continuazione — limite di SICUREZZA, non il
   * meccanismo principale (§7 Session 8): di default si simula fino alla fine vera del pool
   * residuo. Utile soprattutto nei test per tenere i tempi bassi. */
  readonly maxHorizon?: number;
  /** Curve di valore da usare (§6.1), già corrette per il rischio configurato (§6.8) a monte —
   * default alle curve base se non fornite. Usate SOLO per te: gli avversari usano sempre le curve
   * neutre (stesso principio di `myValueCurves` in sim/auction-sim.ts — se il rischio si applicasse
   * a tutti, l'effetto sulla TUA competitività relativa si annullerebbe). */
  readonly valueCurves?: ValueCurveConfig;
  /** Peso personale per ruolo (§11 Setup) — SOLO per te, stesso principio di cui sopra. */
  readonly roleWeights?: RoleWeights;
}

interface SimManagerState {
  credits: number;
  slots: SlotCounts;
  ownedByRole: Record<Role, number>;
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
    const owned = input.ownedByManager.get(m.manager.id) ?? [];
    const ownedByRole: Record<Role, number[]> = { P: [], D: [], C: [], A: [] };
    for (const p of owned) ownedByRole[p.role]!.push(p.myScore);
    map.set(m.manager.id, {
      credits: m.creditsRemaining,
      slots: { ...m.slotsRemaining },
      ownedByRole: { P: ownedByRole.P!.length, D: ownedByRole.D!.length, C: ownedByRole.C!.length, A: ownedByRole.A!.length },
      ownedScores: ownedByRole,
    });
  }
  return map;
}

/** Valore di `score` in un ruolo per il manager `managerId`: pesi/curve personalizzati SOLO per
 * "me" (§7 Session 8) — un avversario è valutato con la TUA percezione di qualità ma pesi neutri. */
function valueForManager(
  managerId: string,
  role: Role,
  score: number,
  input: RolloutInput,
): number {
  const isMe = managerId === input.myManagerId;
  const roleWeights = isMe ? (input.roleWeights ?? DEFAULT_ROLE_WEIGHTS) : DEFAULT_ROLE_WEIGHTS;
  const valueCurves = isMe ? (input.valueCurves ?? DEFAULT_VALUE_CURVES) : DEFAULT_VALUE_CURVES;
  return roleWeightedPlayerValue(role, score, roleWeights, { curves: valueCurves });
}

function buildRoleInputsForSimManager(
  managerId: string,
  state: SimManagerState,
  poolFromHere: readonly RolloutPoolPlayer[],
  input: RolloutInput,
) {
  const poolByRole = {} as Record<Role, RationalCandidateInput[]>;
  for (const role of ROLES) poolByRole[role] = [];
  for (const p of poolFromHere) poolByRole[p.role]!.push({ score: p.myScore, pHat: p.pHat });
  return buildRationalRoleInputs(
    state.ownedScores,
    poolByRole,
    input.leagueSlots,
    input.slotWeights,
    (role, score) => valueForManager(managerId, role, score, input),
    MAX_OPTIONAL_CANDIDATES_FOR_DUALS,
    DUALS_BUDGET_GRANULARITY,
  );
}

/** Offerta "razionale" di `managerId` per il candidato (`role`, `score`, `pHat`) dato lo stato
 * simulato corrente e il pool ancora disponibile da questo punto in poi — stessa logica (duali
 * ricalcolati periodicamente + rialzo di urgenza + rumore) usata dall'archetipo 'rational' del
 * simulatore offline, ora condivisa (`core/rational-bidder.ts`). */
function computeManagerBid(
  managerId: string,
  state: SimManagerState,
  role: Role,
  score: number,
  cache: RationalBidderCache,
  /** Coppia (ordine, indice) invece del pool-da-qui-in-poi già affettato (§7 Session 8,
   * ottimizzazione): `order.slice(i+1)` costava O(orizzonte) a OGNI singola estrazione anche per i
   * manager che non ricalcolano affatto quel turno — con centinaia di estrazioni e migliaia di
   * iterazioni non è trascurabile. Tagliato solo dentro `buildRoleInputs`, chiamata da
   * `computeRationalBase` SOLO quando serve davvero un ricalcolo. */
  order: readonly RolloutPoolPlayer[],
  drawIndex: number,
  fairPacePerSlot: number,
  input: RolloutInput,
  noiseFactor: number,
): number {
  const cap = maxSingleBid(asManagerStateLike(state, managerId));
  if (cap < input.minPrice) return 0;
  const isMe = managerId === input.myManagerId;
  const recalcEvery = input.rolloutConfig.dualsRecalcEveryDraws * (isMe ? 1 : OPPONENT_RECALC_MULTIPLIER);
  const value = valueForManager(managerId, role, score, input);
  const base = computeRationalBase({
    cache,
    creditsRemaining: state.credits,
    maxSingleBidForManager: cap,
    buildRoleInputs: () => buildRoleInputsForSimManager(managerId, state, order.slice(drawIndex + 1), input),
    targetRole: role,
    targetValue: value,
    budgetGranularity: DUALS_BUDGET_GRANULARITY,
    dualsRecalcEveryDraws: recalcEvery,
    dualsRecalcOnBudgetDropFraction: input.rolloutConfig.dualsRecalcOnBudgetDropFraction,
  });
  return applyUrgencyAndNoise({
    base,
    creditsRemaining: state.credits,
    totalSlotsRemaining: totalSlotsRemaining(asManagerStateLike(state, managerId)),
    fairPacePerSlot,
    roleBudgetShare: DEFAULT_BUDGET_SHARES[role],
    minPrice: input.minPrice,
    maxSingleBidForManager: cap,
    noiseFactor,
  });
}

/**
 * Simula la continuazione dell'asta (fino a `order.length` estrazioni) a partire da uno stato
 * indipendente per variante (§6.6-analogo: `myStart` è il MIO stato dopo aver "pagato" p per il
 * target, oppure dopo averlo perso). Ritorna il valore finale della mia rosa (surrogato, §6.2).
 * `caches` è UNA per manager, creata fresca a ogni chiamata (i due rami "vinco"/"perdo" di una
 * stessa iterazione sono universi indipendenti, non devono condividere cache).
 */
function simulateContinuation(
  input: RolloutInput,
  othersInit: ReadonlyMap<string, SimManagerState>,
  myStart: SimManagerState,
  order: readonly RolloutPoolPlayer[],
  /** Rumore pre-campionato per manager e posizione di estrazione (§6.7, "common random numbers"):
   * generato UNA volta per iterazione esterna e riusato identico sia nel ramo "perdo" sia in
   * ciascun ramo "vinco(p)" della STESSA iterazione — un `Rng` consumato qui dentro renderebbe i
   * due rami non più confrontabili a varianza ridotta, perché avanzerebbe lo stato del generatore
   * in modo diverso a seconda di quanti manager sono eleggibili in un ramo rispetto all'altro. */
  noiseByManagerByDraw: ReadonlyMap<string, readonly number[]>,
  fairPacePerSlot: number,
  sortedScoresByRole: Readonly<Record<Role, readonly number[]>>,
  referenceCreditsPerSlot: number,
): number {
  const managers = new Map<string, SimManagerState>();
  for (const [id, s] of othersInit) managers.set(id, id === input.myManagerId ? myStart : cloneSimState(s));
  const caches = new Map<string, RationalBidderCache>();
  for (const [id, s] of managers) caches.set(id, freshRationalBidderCache(s.credits));

  for (let i = 0; i < order.length; i++) {
    const player = order[i]!;
    const role = player.role;

    const bids: { id: string; bid: number }[] = [];
    for (const [id, state] of managers) {
      if (state.slots[role] <= 0) continue;
      const noiseFactor = noiseByManagerByDraw.get(id)![i]!;
      const cache = caches.get(id)!;
      const bid = computeManagerBid(id, state, role, player.myScore, cache, order, i, fairPacePerSlot, input, noiseFactor);
      if (bid >= input.minPrice) bids.push({ id, bid });
    }

    if (bids.length > 0) {
      bids.sort((a, b) => b.bid - a.bid);
      const winnerId = bids[0]!.id;
      const second = bids[1]?.bid ?? 0;
      const price = bids.length === 1 ? input.minPrice : Math.max(input.minPrice, Math.round(second) + 1);
      const winner = managers.get(winnerId)!;
      const finalPrice = Math.min(price, maxSingleBid(asManagerStateLike(winner, winnerId)));
      winner.credits -= finalPrice;
      winner.slots = { ...winner.slots, [role]: winner.slots[role] - 1 };
      winner.ownedByRole = { ...winner.ownedByRole, [role]: winner.ownedByRole[role] + 1 };
      winner.ownedScores = { ...winner.ownedScores, [role]: [...winner.ownedScores[role]!, player.myScore] };
    }

    // Chi non ha partecipato a questa estrazione (slot già pieno nel ruolo) non ricalcola comunque
    // i propri duali più spesso solo perché il conteggio delle estrazioni prosegue per tutti.
    for (const cache of caches.values()) cache.drawsSinceRecalc++;
  }

  const me = managers.get(input.myManagerId)!;
  const roleWeights = input.roleWeights ?? DEFAULT_ROLE_WEIGHTS;
  const valueCurves = input.valueCurves ?? DEFAULT_VALUE_CURVES;

  // L'orizzonte può comunque essere troncato (limite di sicurezza, `maxHorizon`): se lo è, gli slot
  // ancora scoperti a fine finestra vengono completati con un valore-filler invece di trattarli come
  // valore zero — vedi il commento esteso sotto (§7 Session 8, bug reale già corretto in una
  // sessione precedente, invariato qui: la logica non cambia, cambia solo quanto spesso serve).
  const ownedByRoleForPadding = {} as Record<Role, SurrogatePlayerInput[]>;
  let totalMissingAtEnd = 0;
  for (const role of ROLES) {
    const owned = me.ownedScores[role]!.map((score) => ({
      rankValue: roleWeightedPlayerValue(role, score, roleWeights, { curves: valueCurves }),
      potential: 38 * fantamedia(role, score, valueCurves),
    }));
    ownedByRoleForPadding[role] = owned;
    totalMissingAtEnd += Math.max(0, input.leagueSlots[role] - owned.length);
  }

  const creditsPerSlotAtEnd = totalMissingAtEnd > 0 ? me.credits / totalMissingAtEnd : referenceCreditsPerSlot;
  const affordabilityRatio = referenceCreditsPerSlot > 0 ? Math.max(0, Math.min(2, creditsPerSlotAtEnd / referenceCreditsPerSlot)) : 1;
  const effectivePercentile = Math.max(0, Math.min(0.5, 0.2 * affordabilityRatio));

  const playersByRole = {} as Record<Role, SurrogatePlayerInput[]>;
  for (const role of ROLES) {
    const owned = ownedByRoleForPadding[role]!;
    const scores = sortedScoresByRole[role]!;
    const fillerScore = scores.length > 0 ? scores[Math.min(scores.length - 1, Math.floor(effectivePercentile * scores.length))]! : 20;
    const fillerV = roleWeightedPlayerValue(role, fillerScore, roleWeights, { curves: valueCurves });
    const fillerPotential = 38 * fantamedia(role, fillerScore, valueCurves);
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
      Array.from({ length: gridSize }, (_, i) => {
        const fraction = i / (gridSize - 1);
        const curved = Math.pow(fraction, 2.2);
        return Math.max(1, Math.round(1 + curved * (c0 - 1)));
      }),
    ),
  ).sort((a, b) => a - b);

  const sortedScoresByRole = {} as Record<Role, readonly number[]>;
  for (const role of ROLES) {
    sortedScoresByRole[role] = input.remainingPool.filter((p) => p.role === role).map((p) => p.myScore).sort((a, b) => a - b);
  }

  // §7 Session 8: l'orizzonte arriva MOLTO più in profondità di prima (80 estrazioni fisse, che
  // costringevano il filler-padding sopra a coprire la MAGGIOR PARTE della rosa — l'"euristica
  // invece di una vera simulazione" segnalata dall'utente). Non letteralmente infinito: ogni
  // manager reso "razionale" (duali ricalcolati periodicamente, §7 sopra) costa una DP per
  // ricalcolo, e con 10 manager anche solo poche centinaia di estrazioni × qualche centinaio di
  // iterazioni ha un costo reale (misurato: ~250 estrazioni, 150 iterazioni ≈ 8s). `DEFAULT_MAX_
  // HORIZON` è quindi un limite di SICUREZZA per l'inizio asta (pool residuo al suo massimo), non
  // il meccanismo principale: per la maggior parte di un'asta reale (pool residuo via via più
  // piccolo mano a mano che si vende) il `Math.min` sotto lo rende comunque IRRILEVANTE — si
  // arriva alla fine vera del pool naturalmente, non a un taglio arbitrario.
  const horizon = Math.min(input.maxHorizon ?? DEFAULT_MAX_HORIZON, input.remainingPool.length);
  const managersInit = initManagerStates(input);
  const meInit = managersInit.get(input.myManagerId)!;

  const missingAtStart = ROLES.reduce((s, r) => s + Math.max(0, input.leagueSlots[r] - meInit.ownedByRole[r]), 0);
  const referenceCreditsPerSlot = missingAtStart > 0 ? meInit.credits / missingAtStart : 1;
  // Stesso identico riferimento di sim/auction-sim.ts: budget/slot di UN manager alla PARTENZA
  // dell'asta (costante), non aggregato su tutta la lega e non il residuo corrente.
  const totalSlotsPerManager = ROLES.reduce((s, r) => s + input.leagueSlots[r], 0);
  const fairPacePerSlot = totalSlotsPerManager > 0 ? input.leagueBudget / totalSlotsPerManager : 1;

  const pStars: number[] = [];

  for (let r = 0; r < input.rolloutConfig.rollouts; r++) {
    const shuffled = shuffle(input.remainingPool, rng).slice(0, horizon);

    // Rumore pre-campionato una volta per iterazione, riusato IDENTICO nel ramo "perdo" e in
    // ciascun ramo "vinco(p)" (§6.7, "common random numbers" — vedi il commento su
    // `simulateContinuation`). Un array per manager, indicizzato per posizione di estrazione: così
    // resta ben definito anche se in un ramo un manager diventa eleggibile prima/dopo che
    // nell'altro (niente sfasamento fra i due rami dovuto a un consumo diverso del generatore).
    const noiseByManagerByDraw = new Map<string, number[]>(
      input.managers.map((m) => [
        m.manager.id,
        Array.from({ length: horizon }, () => Math.exp(randNormal(rng) * input.rolloutConfig.priceNoiseSigma)),
      ]),
    );
    const targetNoiseByManager = new Map<string, number>(
      input.managers.map((m) => [m.manager.id, Math.exp(randNormal(rng) * input.rolloutConfig.priceNoiseSigma)]),
    );

    // "Perdo": il target va al miglior offerente fra gli avversari eleggibili (se ce n'è uno) —
    // stessa logica di offerta razionale, con cache fresche (decisione isolata, non ancora dentro
    // la continuazione vera e propria).
    const eligibleForTarget = input.managers.filter(
      (m) => m.manager.id !== input.myManagerId && m.slotsRemaining[input.targetRole] > 0,
    );
    const loseOthersInit = new Map(managersInit);
    if (eligibleForTarget.length > 0) {
      const targetBids = eligibleForTarget
        .map((m) => {
          const state = managersInit.get(m.manager.id)!;
          const cache = freshRationalBidderCache(state.credits);
          const bid = computeManagerBid(
            m.manager.id,
            state,
            input.targetRole,
            input.targetMyScore,
            cache,
            input.remainingPool,
            -1, // nessuna estrazione ancora consumata: order.slice(0) è l'intero pool residuo
            fairPacePerSlot,
            input,
            targetNoiseByManager.get(m.manager.id)!,
          );
          return { id: m.manager.id, bid };
        })
        .filter((b) => b.bid >= input.minPrice)
        .sort((a, b) => b.bid - a.bid);
      if (targetBids.length > 0) {
        const winnerId = targetBids[0]!.id;
        const second = targetBids[1]?.bid ?? 0;
        const price = targetBids.length === 1 ? input.minPrice : Math.max(input.minPrice, Math.round(second) + 1);
        const winnerState = cloneSimState(loseOthersInit.get(winnerId)!);
        const finalPrice = Math.min(price, maxSingleBid(asManagerStateLike(winnerState, winnerId)));
        winnerState.credits -= finalPrice;
        winnerState.slots = { ...winnerState.slots, [input.targetRole]: winnerState.slots[input.targetRole] - 1 };
        winnerState.ownedByRole = { ...winnerState.ownedByRole, [input.targetRole]: winnerState.ownedByRole[input.targetRole] + 1 };
        winnerState.ownedScores = {
          ...winnerState.ownedScores,
          [input.targetRole]: [...winnerState.ownedScores[input.targetRole]!, input.targetMyScore],
        };
        loseOthersInit.set(winnerId, winnerState);
      }
    }
    const vLose = simulateContinuation(
      input,
      loseOthersInit,
      cloneSimState(meInit),
      shuffled,
      noiseByManagerByDraw,
      fairPacePerSlot,
      sortedScoresByRole,
      referenceCreditsPerSlot,
    );

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
      const vWin = simulateContinuation(
        input,
        managersInit,
        meWin,
        shuffled,
        noiseByManagerByDraw,
        fairPacePerSlot,
        sortedScoresByRole,
        referenceCreditsPerSlot,
      );
      diffs.push({ p, diff: vWin - vLose });
    }

    // Interpolazione dell'incrocio: diffs è (tipicamente) non crescente in p, §6.6.
    let pStar = 0;
    if (diffs[0]!.diff > 1e-4) {
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
    }
    pStars.push(Math.max(0, Math.min(c0, pStar)));
  }

  pStars.sort((a, b) => a - b);
  return { median: quantile(pStars, 0.5), p10: quantile(pStars, 0.1), p90: quantile(pStars, 0.9) };
}
