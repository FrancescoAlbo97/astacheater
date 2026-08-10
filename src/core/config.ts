// Parametri di default della lega e dei modelli. Vedi readme.md §2, §6.1, §6.2, §6.3.1, §6.8.
// Sostituiti a runtime da data/defaults.json dopo la calibrazione self-play (fase F7, §9.4).

import type {
  BudgetShares,
  Formation,
  FormationShape,
  LeagueConfig,
  PriceCurveConfig,
  PriceModelConfig,
  Role,
  RiskConfig,
  RolloutConfig,
  SlotCounts,
  SlotWeights,
  ValueCurveConfig,
} from './types.js';
import { ROLES } from './types.js';

// ---------------------------------------------------------------------------
// §2 — Parametri della lega
// ---------------------------------------------------------------------------

export const DEFAULT_NUM_MANAGERS = 10;
export const DEFAULT_BUDGET = 500;

export const DEFAULT_SLOTS: SlotCounts = { P: 3, D: 8, C: 8, A: 6 };

export const DEFAULT_FORMATIONS: readonly Formation[] = [
  '4-3-3',
  '3-4-3',
  '3-5-2',
  '4-4-2',
  '4-5-1',
  '5-3-2',
  '5-4-1',
];

export const DEFAULT_PRIMARY_FORMATION: Formation = '4-3-3';

export const FORMATION_SHAPES: Record<Formation, FormationShape> = {
  '4-3-3': { D: 4, C: 3, A: 3 },
  '3-4-3': { D: 3, C: 4, A: 3 },
  '3-5-2': { D: 3, C: 5, A: 2 },
  '4-4-2': { D: 4, C: 4, A: 2 },
  '4-5-1': { D: 4, C: 5, A: 1 },
  '5-3-2': { D: 5, C: 3, A: 2 },
  '5-4-1': { D: 5, C: 4, A: 1 },
};

export const DEFAULT_MIN_PRICE = 1;
export const DEFAULT_RISK = 0.15;

export function makeDefaultLeagueConfig(
  managerNames: readonly string[] = defaultManagerNames(),
): LeagueConfig {
  return {
    managers: managerNames.map((name, i) => ({
      id: i === 0 ? 'me' : `m${i + 1}`,
      name,
      isMe: i === 0,
    })),
    budget: DEFAULT_BUDGET,
    slots: DEFAULT_SLOTS,
    formations: DEFAULT_FORMATIONS,
    primaryFormation: DEFAULT_PRIMARY_FORMATION,
    minPrice: DEFAULT_MIN_PRICE,
    risk: DEFAULT_RISK,
  };
}

function defaultManagerNames(): string[] {
  return ['Francesco', ...Array.from({ length: DEFAULT_NUM_MANAGERS - 1 }, (_, i) => `Avversario ${i + 1}`)];
}

/** Penalità "senza voto" applicata quando un ruolo non ha abbastanza disponibili (§6.2). */
export const NO_VOTE_PENALTY = 4.0;

/** Numero di giornate simulate in lineup-sim per stagione (38 giornate di Serie A). */
export const SEASON_MATCHDAYS = 38;

// ---------------------------------------------------------------------------
// §6.1 — Modello di valore
// ---------------------------------------------------------------------------

export const DEFAULT_VALUE_CURVES: ValueCurveConfig = {
  P: { fmMin: 4.8, fmMax: 6.8, gamma: 1.8, ptMin: 0.05, ptMax: 0.95, delta: 1.0 },
  D: { fmMin: 5.0, fmMax: 7.2, gamma: 1.7, ptMin: 0.08, ptMax: 0.92, delta: 1.3 },
  C: { fmMin: 5.0, fmMax: 8.2, gamma: 2.0, ptMin: 0.08, ptMax: 0.92, delta: 1.3 },
  A: { fmMin: 5.0, fmMax: 9.2, gamma: 2.4, ptMin: 0.08, ptMax: 0.92, delta: 1.4 },
};

// ---------------------------------------------------------------------------
// §6.2 — Pesi di slot (surrogato additivo), somma totale = 11.00
// ---------------------------------------------------------------------------

// Tabella del readme §6.2, usata come default operativo. La procedura di fit indipendente di
// F4 (scripts/fit-slot-weights.ts, verificata in test/value-surrogate.test.ts) valida
// l'architettura del modello (rango per v_j, termine sommato 38·fm_j) ma su un benchmark di
// rose i.i.d. pienamente casuali produce pesi "a blocchi" (frutto della proiezione isotona su
// dati rumorosi) che non è chiaro generalizzino meglio di questa tabella su rose REALI. Si tiene
// questa come default fino a una validazione con rose da self-play vero (fase F7); i risultati
// del fit sono comunque riportati in data/defaults.json per riferimento.
export const DEFAULT_SLOT_WEIGHTS: SlotWeights = {
  P: [0.87, 0.11, 0.02],
  D: [0.95, 0.92, 0.88, 0.78, 0.15, 0.07, 0.03, 0.02],
  C: [0.94, 0.9, 0.82, 0.4, 0.18, 0.09, 0.05, 0.02],
  A: [0.93, 0.88, 0.72, 0.17, 0.07, 0.03],
};

// ---------------------------------------------------------------------------
// §6.3.1 — Prior del modello di prezzo
// ---------------------------------------------------------------------------

/** θ_ρ di default, calibrati da p_top/p_marg con p_marg = 1 (§6.3.1). Provvisori: sostituiti in F7. */
export const DEFAULT_THETA: Record<Role, number> = { P: 7.1, D: 8.1, C: 9.0, A: 10.1 };

/** Quote iniziali di budget per ruolo: P 5%, D 15%, C 30%, A 50%. */
export const DEFAULT_BUDGET_SHARES: BudgetShares = { P: 0.05, D: 0.15, C: 0.3, A: 0.5 };

export const DEFAULT_RESERVE_FRACTION = 0.015;
export const DEFAULT_RIDGE_N0 = 15;
export const DEFAULT_HUBER_DELTA = 1.0;
export const DEFAULT_HALF_LIFE_OBSERVATIONS = 40;
export const DEFAULT_MIN_OBSERVATIONS_FOR_OWN_FIT = 5;

export const DEFAULT_CONFIDENCE_THRESHOLDS = { low: 8, medium: 25 };

/**
 * A_ρ derivato dalla quota di budget media implicita: A_ρ è il prezzo prior a score 0,
 * fissato in modo che il prezzo medio ponderato sul pool osservato riproduca la quota di
 * budget target. Valore di partenza prudente (score medio ~50): ricalibrato in F7/F8.
 */
export const DEFAULT_A: Record<Role, number> = { P: 1.2, D: 1.1, C: 1.3, A: 1.6 };

export const DEFAULT_PRICE_CURVES: PriceCurveConfig = ROLES.reduce((acc, role) => {
  acc[role] = { A: DEFAULT_A[role], theta: DEFAULT_THETA[role] };
  return acc;
}, {} as Record<Role, { A: number; theta: number }>) as PriceCurveConfig;

export const DEFAULT_PRICE_MODEL_CONFIG: PriceModelConfig = {
  priorCurves: DEFAULT_PRICE_CURVES,
  budgetShares: DEFAULT_BUDGET_SHARES,
  reserveFraction: DEFAULT_RESERVE_FRACTION,
  ridgeN0: DEFAULT_RIDGE_N0,
  huberDelta: DEFAULT_HUBER_DELTA,
  halfLifeObservations: DEFAULT_HALF_LIFE_OBSERVATIONS,
  minObservationsForOwnFit: DEFAULT_MIN_OBSERVATIONS_FOR_OWN_FIT,
  confidenceThresholds: DEFAULT_CONFIDENCE_THRESHOLDS,
};

// ---------------------------------------------------------------------------
// §6.8 — Rischio
// ---------------------------------------------------------------------------

export const DEFAULT_RISK_CONFIG: RiskConfig = {
  eta: 1.0, // ricalibrato in fase 6/F7 sulla simulazione di campionato
  gammaMultiplierPerRisk: 0.4,
};

// ---------------------------------------------------------------------------
// §6.7 — Monte Carlo
// ---------------------------------------------------------------------------

export const DEFAULT_ROLLOUT_CONFIG: RolloutConfig = {
  rollouts: 2000,
  priceNoiseSigma: 0.25, // ricalibrato in F7 sui residui della regressione
  dualsRecalcEveryDraws: 20,
  dualsRecalcOnBudgetDropFraction: 0.1,
  bidGridSize: 8,
};

// ---------------------------------------------------------------------------
// Invarianti di lega (§2) — usate anche a runtime dopo il setup, non solo nei test.
// ---------------------------------------------------------------------------

export function totalSlotsInLeague(slots: SlotCounts, numManagers: number): number {
  return (slots.P + slots.D + slots.C + slots.A) * numManagers;
}

export function totalCreditsInLeague(budget: number, numManagers: number): number {
  return budget * numManagers;
}

export function totalSlotWeightSum(weights: SlotWeights): number {
  return ROLES.reduce((sum, role) => sum + weights[role].reduce((a, b) => a + b, 0), 0);
}
