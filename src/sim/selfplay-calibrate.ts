// §9.4 — Calibrazione self-play a punto fisso. Sostituisce i prior scelti a mano (§6.3.1) con un
// modello di prezzo coerente con il gioco razionale, ottenuto rigirando l'asta con il motore in
// tutti i posti e rifittando θ_ρ, A_ρ e le quote di budget sui prezzi realizzati.
//
// §9.4 nota: il punto fisso del self-play puro (10/10 razionali) descrive una lega di giocatori
// razionali; la lega reale non lo è. Si calibra come media pesata fra quel punto fisso e quello di
// un self-play con mix realistico di archetipi (peso 0.35 / 0.65).

import { ROLES, type LeagueConfig, type PriceCurveConfig, type Role, type BudgetShares } from '../core/types.js';
import { DEFAULT_PRICE_CURVES, DEFAULT_PRICE_MODEL_CONFIG, DEFAULT_ROLLOUT_CONFIG, DEFAULT_SLOT_WEIGHTS } from '../core/config.js';
import { runAuctionSim, type AuctionSimConfig } from './auction-sim.js';
import type { ArchetypeId } from './archetypes.js';

export interface SelfPlayOptions {
  readonly league: LeagueConfig;
  readonly auctionsPerIteration: number;
  readonly maxIterations: number;
  readonly convergenceTolerance: number;
  readonly rhoValues: readonly number[];
  readonly baseSeed: number;
  readonly archetypesByManager: readonly ArchetypeId[]; // per il mix "realistico"; ignorato in modalità allRational
}

export interface FixedPointResult {
  readonly priceCurves: PriceCurveConfig;
  readonly budgetShares: BudgetShares;
  readonly iterations: number;
  readonly converged: boolean;
  readonly history: readonly { iteration: number; delta: number }[];
}

interface Observation {
  readonly role: Role;
  readonly score: number;
  readonly price: number;
}

/** Regressione log-lineare log(prezzo) = log(A) + θ·(score/100), minimi quadrati ordinari. */
function fitPriceCurveForRole(obs: readonly Observation[], fallback: { A: number; theta: number }) {
  if (obs.length < 5) return fallback;
  const xs = obs.map((o) => o.score / 100);
  const ys = obs.map((o) => Math.log(Math.max(1, o.price)));
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let cov = 0;
  let varX = 0;
  for (let i = 0; i < n; i++) {
    cov += (xs[i]! - meanX) * (ys[i]! - meanY);
    varX += (xs[i]! - meanX) ** 2;
  }
  if (varX < 1e-9) return fallback;
  const theta = cov / varX;
  const logA = meanY - theta * meanX;
  return { A: Math.exp(logA), theta };
}

function fitPriceCurves(observations: readonly Observation[], fallback: PriceCurveConfig): PriceCurveConfig {
  const result = {} as Record<Role, { A: number; theta: number }>;
  for (const role of ROLES) {
    const roleObs = observations.filter((o) => o.role === role);
    result[role] = fitPriceCurveForRole(roleObs, fallback[role]);
  }
  return result as PriceCurveConfig;
}

function fitBudgetShares(observations: readonly Observation[], fallback: BudgetShares): BudgetShares {
  const totals = { P: 0, D: 0, C: 0, A: 0 };
  let grandTotal = 0;
  for (const o of observations) {
    totals[o.role] += o.price;
    grandTotal += o.price;
  }
  if (grandTotal < 1e-6) return fallback;
  return {
    P: totals.P / grandTotal,
    D: totals.D / grandTotal,
    C: totals.C / grandTotal,
    A: totals.A / grandTotal,
  };
}

function curveDistance(a: PriceCurveConfig, b: PriceCurveConfig): number {
  let sumSq = 0;
  for (const role of ROLES) {
    sumSq += (a[role].theta - b[role].theta) ** 2;
    sumSq += (Math.log(a[role].A) - Math.log(b[role].A)) ** 2;
  }
  return Math.sqrt(sumSq);
}

export type SelfPlayMode = 'allRational' | 'realisticMix';

export function runSelfPlayFixedPoint(mode: SelfPlayMode, options: SelfPlayOptions): FixedPointResult {
  const M = options.league.managers.length;
  const archetypes: ArchetypeId[] =
    mode === 'allRational' ? Array.from({ length: M }, () => 'rational') : options.archetypesByManager.slice();

  let priceCurves = DEFAULT_PRICE_MODEL_CONFIG.priorCurves;
  let budgetShares = DEFAULT_PRICE_MODEL_CONFIG.budgetShares;
  const history: { iteration: number; delta: number }[] = [];
  let converged = false;
  let iterations = 0;

  for (let iter = 0; iter < options.maxIterations; iter++) {
    iterations = iter + 1;
    const observations: Observation[] = [];

    for (let a = 0; a < options.auctionsPerIteration; a++) {
      const rho = options.rhoValues[a % options.rhoValues.length]!;
      const seed = options.baseSeed + iter * 1_000_000 + a;
      const cfg: AuctionSimConfig = {
        league: options.league,
        seed,
        rho,
        archetypesByManager: archetypes,
        priceModelConfig: { ...DEFAULT_PRICE_MODEL_CONFIG, priorCurves: priceCurves, budgetShares },
        // Percezione di valore degli archetipi NON razionali (`AuctionSimConfig.priceCurves`, solo
        // per 'ratio'): fissa al default teorico, mai al `priceCurves` in calibrazione qui sopra —
        // stesso comportamento di prima del rename (§7 Session 9).
        priceCurves: DEFAULT_PRICE_CURVES,
        slotWeights: DEFAULT_SLOT_WEIGHTS,
        priceNoiseSigma: DEFAULT_ROLLOUT_CONFIG.priceNoiseSigma,
        dualsRecalcEveryDraws: DEFAULT_ROLLOUT_CONFIG.dualsRecalcEveryDraws,
        dualsRecalcOnBudgetDropFraction: DEFAULT_ROLLOUT_CONFIG.dualsRecalcOnBudgetDropFraction,
      };
      const result = runAuctionSim(cfg);
      const marketScores = result.scenario.scoresByManager[0]!;
      for (const sale of result.sales) {
        observations.push({ role: sale.role, score: marketScores.get(sale.playerId) ?? 50, price: sale.price });
      }
    }

    const newCurves = fitPriceCurves(observations, priceCurves);
    const newShares = fitBudgetShares(observations, budgetShares);
    const delta = curveDistance(newCurves, priceCurves);
    history.push({ iteration: iter, delta });

    priceCurves = newCurves;
    budgetShares = newShares;

    if (delta < options.convergenceTolerance) {
      converged = true;
      break;
    }
  }

  return { priceCurves, budgetShares, iterations, converged, history };
}

export interface CombinedCalibrationResult {
  readonly priceCurves: PriceCurveConfig;
  readonly budgetShares: BudgetShares;
  readonly allRational: FixedPointResult;
  readonly realisticMix: FixedPointResult;
}

/** Media pesata 0.35 (self-play puro) / 0.65 (mix realistico), come da §9.4. */
export function calibratePrior(options: SelfPlayOptions): CombinedCalibrationResult {
  const allRational = runSelfPlayFixedPoint('allRational', options);
  const realisticMix = runSelfPlayFixedPoint('realisticMix', options);

  const WEIGHT_SELF_PLAY = 0.35;
  const WEIGHT_REALISTIC = 0.65;

  const priceCurves = {} as Record<Role, { A: number; theta: number }>;
  const budgetShares = {} as BudgetShares as Record<Role, number>;
  for (const role of ROLES) {
    priceCurves[role] = {
      A: WEIGHT_SELF_PLAY * allRational.priceCurves[role].A + WEIGHT_REALISTIC * realisticMix.priceCurves[role].A,
      theta:
        WEIGHT_SELF_PLAY * allRational.priceCurves[role].theta +
        WEIGHT_REALISTIC * realisticMix.priceCurves[role].theta,
    };
    budgetShares[role] =
      WEIGHT_SELF_PLAY * allRational.budgetShares[role] + WEIGHT_REALISTIC * realisticMix.budgetShares[role];
  }

  return {
    priceCurves: priceCurves as PriceCurveConfig,
    budgetShares: budgetShares as BudgetShares,
    allRational,
    realisticMix,
  };
}
