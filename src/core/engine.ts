// Ponte fra lo stato event-sourced (state.ts) e il motore matematico puro (value-model,
// price-model, ceiling, plan-dp, max-bid). Le schermate UI parlano con QUESTO modulo, mai
// direttamente con i singoli moduli del motore: tiene un unico punto in cui orchestrare il
// ricalcolo "dopo ogni vendita" richiesto da §7.

import { ROLES } from './types.js';
import type { AuctionState, CeilingInfo, MaxBidResult, Player, Role, RoleWeights, SlotWeights } from './types.js';
import {
  DEFAULT_PRICE_CURVES,
  DEFAULT_PRICE_MODEL_CONFIG,
  DEFAULT_RESERVE_FRACTION,
  DEFAULT_ROLE_WEIGHTS,
  DEFAULT_ROLLOUT_CONFIG,
  DEFAULT_SLOTS,
  DEFAULT_VALUE_CURVES,
  normalizeSlotWeights,
} from './config.js';
import { deriveManagerStates, getMyManagerId, getPool } from './state.js';
import { applyRiskToValueCurves, roleWeightedPlayerValue } from './value-model.js';
import type { ValueCurveConfig } from './types.js';
import {
  capByResidualDemand,
  fitOnlinePriceCurves,
  renormalize,
  type FittedPriceCurve,
  type PoolPlayer,
  type SaleObservation,
} from './price-model.js';
import { ceilingForRole, maxSingleBid, operationalMaxBid, expectedPriceFromCeiling } from './ceiling.js';
import { computeMaxBid } from './max-bid.js';
import { combineRoles, computeRolePlan, type DPCandidate, type RoleDPInput } from './plan-dp.js';
import { approxMaxBid, computeDuals, weightAndMuForCandidate } from './base-policy.js';
import type { RolloutInput } from './rollout.js';

/** Curve di valore corrette per la propensione al rischio configurata (§6.8), o quelle di default
 * se manca una configurazione di lega. */
function riskAdjustedCurves(state: AuctionState): ValueCurveConfig {
  return applyRiskToValueCurves(DEFAULT_VALUE_CURVES, state.config?.risk ?? 0);
}

/** Peso per ruolo configurato (§11 Setup), o nessuna preferenza se la lega non lo ha (config
 * salvata prima che esistesse questo controllo). */
function myRoleWeights(state: AuctionState): RoleWeights {
  return state.config?.roleWeights ?? DEFAULT_ROLE_WEIGHTS;
}

/** Pesi di slot configurati (§6.2 Setup), normalizzati contro `config.slots` — copre sia una
 * config salvata prima che questo controllo esistesse (slotWeights assente) sia il caso in cui il
 * numero di slot di un ruolo sia stato cambiato dopo aver personalizzato i pesi (lunghezze
 * disallineate, altrimenti la DP lancerebbe un errore, §13.3). */
function mySlotWeights(state: AuctionState): SlotWeights {
  return normalizeSlotWeights(state.config?.slotWeights, state.config?.slots ?? DEFAULT_SLOTS);
}

export interface MarketSnapshot {
  readonly managers: ReturnType<typeof deriveManagerStates>;
  readonly pool: readonly Player[];
  readonly pHat: ReadonlyMap<string, number>;
  readonly fittedCurves: Record<Role, FittedPriceCurve>;
  readonly myManagerId: string | null;
}

function myScoreOf(state: AuctionState, playerId: string): number {
  return state.scores[playerId]?.score ?? 50;
}

function myPtOverrideOf(state: AuctionState, playerId: string): number | undefined {
  return state.scores[playerId]?.ptOverride ?? undefined;
}

/** Ricalcola il modello di mercato (§7: "dopo ogni sale"): online fit + ancoraggio esatto. */
export function computeMarketSnapshot(state: AuctionState): MarketSnapshot {
  const managers = deriveManagerStates(state);
  const pool = getPool(state);
  const myManagerId = getMyManagerId(state.config);

  if (!state.config) {
    const empty = {} as Record<Role, FittedPriceCurve>;
    for (const role of ROLES) empty[role] = { ...DEFAULT_PRICE_CURVES[role], n: 0, thetaStdErr: Infinity, confidence: 'bassa' };
    return { managers, pool, pHat: new Map(), fittedCurves: empty, myManagerId };
  }

  const observations: SaleObservation[] = state.sales.map((s, i) => ({
    role: state.players[s.playerId]?.role ?? 'C',
    score: myScoreOf(state, s.playerId),
    price: s.price,
    order: i,
  }));
  const fittedCurves = fitOnlinePriceCurves(observations, DEFAULT_PRICE_CURVES, DEFAULT_PRICE_MODEL_CONFIG);
  const priceCurves = ROLES.reduce(
    (acc, role) => {
      acc[role] = { A: fittedCurves[role].A, theta: fittedCurves[role].theta };
      return acc;
    },
    {} as Record<Role, { A: number; theta: number }>,
  );

  const poolPlayers: PoolPlayer[] = pool.map((p) => ({ id: p.id, role: p.role, score: myScoreOf(state, p.id) }));
  const { pHat } = renormalize(
    poolPlayers,
    managers,
    priceCurves as typeof DEFAULT_PRICE_CURVES,
    DEFAULT_RESERVE_FRACTION,
  );

  return { managers, pool, pHat, fittedCurves, myManagerId };
}

function percentile20Score(pool: readonly Player[], role: Role, state: AuctionState): number {
  const scores = pool.filter((p) => p.role === role).map((p) => myScoreOf(state, p.id)).sort((a, b) => a - b);
  if (scores.length === 0) return 20;
  return scores[Math.floor(0.2 * scores.length)]!;
}

/** Candidati per la DP del ruolo `role`, ESCLUDENDO `excludePlayerId` (il giocatore in asta). */
function buildRoleInputsForMe(
  state: AuctionState,
  snapshot: MarketSnapshot,
  excludePlayerId: string | null,
  valueCurves: ValueCurveConfig,
): Record<Role, RoleDPInput> {
  const me = snapshot.managers.find((m) => m.manager.id === snapshot.myManagerId);
  const config = state.config!;
  const roleWeights = myRoleWeights(state);
  const slotWeights = mySlotWeights(state);
  const roleInputs = {} as Record<Role, RoleDPInput>;

  for (const role of ROLES) {
    const forced: DPCandidate[] = (me?.roster ?? [])
      .filter((r) => r.player.role === role)
      .map((r) => ({
        v: roleWeightedPlayerValue(role, myScoreOf(state, r.player.id), roleWeights, {
          ptOverride: myPtOverrideOf(state, r.player.id),
          curves: valueCurves,
        }),
        price: 0,
        forced: true,
      }));
    const optional: DPCandidate[] = snapshot.pool
      .filter((p) => p.role === role && p.id !== excludePlayerId)
      .map((p) => ({
        v: roleWeightedPlayerValue(role, myScoreOf(state, p.id), roleWeights, {
          ptOverride: myPtOverrideOf(state, p.id),
          curves: valueCurves,
        }),
        price: Math.max(1, snapshot.pHat.get(p.id) ?? 1),
        forced: false,
      }));
    roleInputs[role] = {
      candidates: [...forced, ...optional],
      fillerValue: roleWeightedPlayerValue(role, percentile20Score(snapshot.pool, role, state), roleWeights, { curves: valueCurves }),
      slotCount: config.slots[role],
      weights: slotWeights[role],
    };
  }
  return roleInputs;
}

export interface DecisionAlternative {
  readonly player: Player;
  readonly score: number;
  readonly expectedPrice: number;
}

export interface ScarcityAlert {
  readonly role: Role;
  readonly mySlotsRemaining: number;
  readonly poolRemaining: number;
  readonly opponentsSlotsRemaining: number;
}

export interface PlayerDecision {
  readonly playerId: string;
  readonly role: Role;
  readonly myValue: number;
  readonly pHat: number;
  readonly pStar: number;
  readonly reason: MaxBidResult['reason'];
  readonly ceiling: CeilingInfo;
  readonly operationalMax: number;
  readonly expectedPrice: number;
  /** §6.6: "se lo prendi → rosa finale X pt" / "se lo lasci → rosa finale Y pt". */
  readonly phiWinAtOperational: number;
  readonly phiLose: number;
  /** Scomposizione al primo ordine per la riga "perché" (§6.6, spiegazione, non il numero). */
  readonly lambda: number;
  readonly muRole: number;
  readonly nextSlotWeight: number;
  readonly approxPStar: number;
  readonly alternatives: readonly DecisionAlternative[];
  readonly scarcity: ScarcityAlert;
  readonly priceConfidence: FittedPriceCurve;
  readonly kappa: number;
}

/**
 * Bug reale segnalato dall'utente da un'asta vera: "non serve" per il piano OTTIMO esatto (§6.6)
 * significa "esiste una combinazione di ALTRI candidati del pool, tutti ottenibili al loro prezzo
 * atteso p̂, strettamente migliore" — un'ipotesi di CERTEZZA (nessuna concorrenza reale su QUEI
 * candidati) che non vale in un'asta vera con altri 9 manager che li vogliono anche loro. Misurato
 * su un'asta reale: con TUTTI e 8 gli slot D ancora liberi (zero posseduti, quindi "certamente
 * ottengo gli 8 migliori del pool" è l'ipotesi più fragile possibile), un difensore via via
 * discreto (score 62-71) risultava SEMPRE "non serve" — semplicemente perché il pool ha ≥8
 * difensori più forti, non perché il giocatore non serva davvero. "È inutile scrivere 'non serve':
 * non serve rispetto a cosa? […] Bisogna fare in modo che quelli forti ci sia sempre un valore
 * d'offerta" (dall'utente). Quando ho ancora slot liberi in quel ruolo (altrimenti "non serve" è un
 * vincolo VERO, non un'ipotesi: lo slot non esiste fisicamente — mai scavalcato), si usa la stima
 * approssimata `approxPStar` come COPERTURA invece di azzerare — usa solo il rango fra i giocatori
 * che possiedo GIÀ (certi), non fra quelli che spero ancora di prendere, quindi non eredita la
 * stessa ipotesi di certezza. Il piano ottimo esatto resta comunque calcolato e disponibile
 * (`phiLose`/`phiWinAtOperational`), non viene scartato: la spiegazione "perché questo numero" può
 * ancora mostrare che il piano teoricamente migliore non include questo giocatore, ferma restando
 * la copertura come offerta operativa. Non forza un'offerta per chiunque: un candidato genuinamente
 * scarso ha `approxPStar` anch'esso ≤ 0 (stesso conto, valore reale troppo basso), quindi resta
 * "non serve" — la copertura scatta solo quando le due stime DIVERGONO.
 */
export function applyHedge(maxBidResult: MaxBidResult, approxPStar: number, hasOpenSlotInRole: boolean): MaxBidResult {
  const useHedge = maxBidResult.reason === 'not-useful' && hasOpenSlotInRole && approxPStar > 0;
  return useHedge ? { pStar: approxPStar, phiLose: maxBidResult.phiLose, reason: 'hedge' } : maxBidResult;
}

/**
 * Il numero deterministico da mostrare nella schermata di asta (§6.6, §11): p* esatto per
 * bisezione, tetto avversari, offerta operativa massima. Deve restare velocissimo (§13.9): niente
 * Monte Carlo qui dentro (quello è il rollout, in un Web Worker separato).
 */
export function computeDecisionForPlayer(state: AuctionState, playerId: string): PlayerDecision | null {
  if (!state.config) return null;
  const myManagerId = getMyManagerId(state.config);
  if (!myManagerId) return null;
  const player = state.players[playerId];
  if (!player) return null;

  const snapshot = computeMarketSnapshot(state);
  const meOrUndefined = snapshot.managers.find((m) => m.manager.id === myManagerId);
  if (!meOrUndefined) return null;
  const me = meOrUndefined;

  const valueCurves = riskAdjustedCurves(state);
  const role = player.role;
  const myScore = myScoreOf(state, playerId);
  const myValue = roleWeightedPlayerValue(role, myScore, myRoleWeights(state), {
    ptOverride: myPtOverrideOf(state, playerId),
    curves: valueCurves,
  });
  const pHat = snapshot.pHat.get(playerId) ?? 1;

  const ceiling = ceilingForRole(snapshot.managers, myManagerId, role);
  const roleInputsWithoutTarget = buildRoleInputsForMe(state, snapshot, playerId, valueCurves);

  const maxBidResult = computeMaxBid({
    budget: me.creditsRemaining,
    roleInputsWithoutTarget,
    targetRole: role,
    targetValue: myValue,
    maxAffordable: maxSingleBid(me),
  });

  // Duali e stima approssimata (§6.6), calcolati QUI perché servono anche per l'aggiustamento
  // "copertura" subito sotto, non solo per la riga "perché questo numero" più in basso.
  //
  // Bug reale segnalato dall'utente ("la parte dello slot del ruolo fa un casino"): questi duali
  // NON vanno calcolati sul pool con il target ESCLUSO (`roleInputsWithoutTarget`, che serve solo
  // al DP esatto sopra per poterlo poi reinserire a un prezzo di prova, §6.6). λ è la derivata
  // dell'inviluppo dell'INTERO mercato (`marginalValue` in plan-dp.ts, ricerca all'indietro
  // dell'ultimo gradino) ed è per costruzione sensibile a QUALE candidato è nel pool: escludere un
  // giocatore diverso per ogni singola query lo fa saltare anche del 2-3× fra un candidato e
  // l'altro nella STESSA istantanea d'asta (misurato su dati reali: λ passava da 1.05 a 0.42
  // togliendo un solo centrocampista dal pool, producendo una "STIMA RAPIDA" nel pannello "perché
  // questo numero" di 350+ crediti per un giocatore il cui p* esatto era 30) — non un caso limite
  // raro, capitava per un giocatore su dieci nel listone reale. auction-sim.ts già calcola questi
  // stessi duali sul pool COMPLETO, senza esclusioni per-candidato (ricalcolati periodicamente,
  // §6.7): qui si allinea allo stesso pattern, corretto e già in uso altrove.
  const roleInputsForDuals = buildRoleInputsForMe(state, snapshot, null, valueCurves);
  const duals = computeDuals({ budget: me.creditsRemaining, roleInputs: roleInputsForDuals });
  const lambda = duals.lambda;
  const { weight: nextSlotWeight, mu: muRole } = weightAndMuForCandidate(myValue, role, duals);
  const approxPStar = approxMaxBid(myValue, role, duals, maxSingleBid(me));

  const effectiveMaxBidResult = applyHedge(maxBidResult, approxPStar, me.slotsRemaining[role] > 0);

  const operationalMax = operationalMaxBid(effectiveMaxBidResult.pStar, ceiling);
  const expectedPrice = expectedPriceFromCeiling(capByResidualDemand(pHat, ceiling), ceiling);

  // Φ_win / Φ_lose per la riga "se lo prendi / se lo lasci" (§6.6, ricalcolo esatto e veloce:
  // la DP a scala di lega risolve in pochi ms, §6.5).
  const otherRolePlans = {} as Record<Role, Float64Array>;
  for (const r of ROLES) {
    if (r !== role) otherRolePlans[r] = computeRolePlan(roleInputsWithoutTarget[r], me.creditsRemaining);
  }
  function phiForcingTargetAt(price: number | null): number {
    const base = roleInputsWithoutTarget[role];
    const withTarget: RoleDPInput =
      price === null ? base : { ...base, candidates: [...base.candidates, { v: myValue, price, forced: true }] };
    const rolePlan = computeRolePlan(withTarget, me.creditsRemaining);
    const combined = combineRoles({ ...otherRolePlans, [role]: rolePlan }, me.creditsRemaining);
    return combined[me.creditsRemaining]!;
  }
  const phiLose = phiForcingTargetAt(null);
  const phiWinAtOperational = operationalMax > 0 ? phiForcingTargetAt(operationalMax) : phiLose;

  // Alternative dopo di lui: i migliori 3 rimasti nello stesso ruolo per il mio score.
  const alternatives: DecisionAlternative[] = snapshot.pool
    .filter((p) => p.role === role && p.id !== playerId)
    .map((p) => ({ player: p, score: myScoreOf(state, p.id), expectedPrice: snapshot.pHat.get(p.id) ?? 1 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  // Allarme di scarsità: slot che mi mancano vs pool residuo vs slot che mancano agli avversari.
  const poolRemaining = snapshot.pool.filter((p) => p.role === role).length;
  const opponentsSlotsRemaining = snapshot.managers
    .filter((m) => m.manager.id !== myManagerId)
    .reduce((sum, m) => sum + m.slotsRemaining[role], 0);
  const scarcity: ScarcityAlert = {
    role,
    mySlotsRemaining: me.slotsRemaining[role],
    poolRemaining,
    opponentsSlotsRemaining,
  };

  const kappa =
    state.sales.length > 0
      ? state.sales.reduce((s, sale) => s + sale.price, 0) /
        state.sales.reduce((s, sale) => {
          const p = state.players[sale.playerId];
          return s + (p ? Math.exp((DEFAULT_PRICE_CURVES[p.role].theta * myScoreOf(state, sale.playerId)) / 100) * DEFAULT_PRICE_CURVES[p.role].A : 1);
        }, 0)
      : 1;

  return {
    playerId,
    role,
    myValue,
    pHat,
    pStar: effectiveMaxBidResult.pStar,
    reason: effectiveMaxBidResult.reason,
    ceiling,
    operationalMax,
    expectedPrice,
    phiWinAtOperational,
    phiLose,
    lambda,
    muRole,
    nextSlotWeight,
    approxPStar,
    alternatives,
    scarcity,
    priceConfidence: snapshot.fittedCurves[role],
    kappa,
  };
}

/**
 * Costruisce l'input per il rollout Monte Carlo (§6.7) a partire dallo stato corrente e dal
 * giocatore in asta. Il numero deterministico (computeDecisionForPlayer) resta il valore mostrato
 * subito (§13.9); questo serve solo per raffinarlo con la banda, tipicamente in un Web Worker.
 */
export function buildRolloutInput(state: AuctionState, playerId: string): RolloutInput | null {
  if (!state.config) return null;
  const myManagerId = getMyManagerId(state.config);
  if (!myManagerId) return null;
  const player = state.players[playerId];
  if (!player) return null;

  const snapshot = computeMarketSnapshot(state);
  const me = snapshot.managers.find((m) => m.manager.id === myManagerId);
  if (!me) return null;

  const myOwned = me.roster.map((entry) => ({
    role: entry.player.role,
    myScore: myScoreOf(state, entry.player.id),
  }));

  const remainingPool = snapshot.pool
    .filter((p) => p.id !== playerId)
    .map((p) => ({
      id: p.id,
      role: p.role,
      myScore: myScoreOf(state, p.id),
      pHat: Math.max(1, snapshot.pHat.get(p.id) ?? 1),
    }));

  return {
    myManagerId,
    managers: snapshot.managers,
    myOwned,
    targetRole: player.role,
    targetMyScore: myScoreOf(state, playerId),
    targetPHat: Math.max(1, snapshot.pHat.get(playerId) ?? 1),
    remainingPool,
    leagueSlots: state.config.slots,
    minPrice: state.config.minPrice,
    slotWeights: mySlotWeights(state),
    rolloutConfig: DEFAULT_ROLLOUT_CONFIG,
    maxHorizon: 80,
    valueCurves: riskAdjustedCurves(state),
    roleWeights: myRoleWeights(state),
  };
}
