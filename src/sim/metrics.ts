// §10 — Metriche di validazione. La quota di gap colmata (§10.2) è la metrica principale del
// progetto: (valore_motore − valore_naive_migliore) / (valore_oracolo − valore_naive_migliore).

import type { Formation, ManagerState, Role, ValueCurveConfig } from '../core/types.js';
import { fantamedia, titolarita } from '../core/value-model.js';
import { lineupSim, type LineupPlayer } from '../core/lineup-sim.js';
import type { Rng } from '../core/rng.js';

/**
 * Valore (media stagionale) della rosa di un manager, con la VERITÀ DI RIFERIMENTO (lineup-sim,
 * §6.2), non il surrogato: qui si valuta UNA VOLTA a fine asta, non dentro un ciclo caldo, quindi
 * il costo del simulatore esatto è accettabile e la maggiore fedeltà preferibile.
 */
export function evaluateFinalRoster(
  manager: ManagerState,
  scoresById: ReadonlyMap<string, number>,
  allowedFormations: readonly Formation[],
  rng: Rng,
  iterations = 2000,
  valueCurves?: ValueCurveConfig,
): number {
  const players: LineupPlayer[] = manager.roster.map((entry) => {
    const role = entry.player.role;
    const score = scoresById.get(entry.player.id) ?? 50;
    return {
      role,
      fm: fantamedia(role, score, valueCurves),
      pt: titolarita(role, score, valueCurves),
    };
  });
  return lineupSim(players, allowedFormations, rng, iterations).mean;
}

/** (valore_motore − valore_naive_migliore) / (valore_oracolo − valore_naive_migliore), §10.2. */
export function quotaGapColmata(motore: number, naiveBest: number, oracle: number): number {
  const denom = oracle - naiveBest;
  if (Math.abs(denom) < 1e-9) return 0;
  return (motore - naiveBest) / denom;
}

export interface CalibrationCell {
  readonly scoreDecile: number; // 0-9
  readonly phase: 'iniziale' | 'centrale' | 'finale';
  readonly meanResidualFraction: number; // (prezzo - p̂) / p̂ medio nella cella
  readonly n: number;
}

/**
 * Residui medi per decile di score × fase d'asta (§10.4, criterio A6): i residui devono essere
 * centrati sullo zero in ogni cella entro ±15%. Un errore sistematico sui top nella fase iniziale
 * si vede QUI e solo qui.
 */
export function calibrationResiduals(
  observations: readonly { score: number; price: number; pHat: number; drawIndex: number }[],
  totalDraws: number,
): CalibrationCell[] {
  const cells = new Map<string, { sum: number; n: number }>();
  for (const obs of observations) {
    const decile = Math.min(9, Math.floor(obs.score / 10));
    const fraction = obs.drawIndex / totalDraws;
    const phase: CalibrationCell['phase'] = fraction < 60 / 250 ? 'iniziale' : fraction > 190 / 250 ? 'finale' : 'centrale';
    const key = `${decile}-${phase}`;
    const residualFraction = obs.pHat > 0 ? (obs.price - obs.pHat) / obs.pHat : 0;
    const cell = cells.get(key) ?? { sum: 0, n: 0 };
    cell.sum += residualFraction;
    cell.n += 1;
    cells.set(key, cell);
  }
  const result: CalibrationCell[] = [];
  for (const [key, { sum, n }] of cells) {
    const [decileStr, phase] = key.split('-') as [string, CalibrationCell['phase']];
    result.push({ scoreDecile: Number(decileStr), phase, meanResidualFraction: sum / n, n });
  }
  return result;
}

export interface AblationSummary {
  readonly motoreValue: number;
  readonly naiveValues: Readonly<Record<string, number>>;
  readonly naiveBest: number;
  readonly oracleValue: number;
  readonly gapFilled: number;
  readonly motoreWinsVsEach: Readonly<Record<string, boolean>>;
}

export function summarizeAblation(
  motoreValue: number,
  naiveValues: Readonly<Record<string, number>>,
  oracleValue: number,
): AblationSummary {
  const entries = Object.entries(naiveValues);
  const naiveBest = entries.reduce((best, [, v]) => Math.max(best, v), -Infinity);
  const motoreWinsVsEach: Record<string, boolean> = {};
  for (const [name, v] of entries) motoreWinsVsEach[name] = motoreValue > v;
  return {
    motoreValue,
    naiveValues,
    naiveBest,
    oracleValue,
    gapFilled: quotaGapColmata(motoreValue, naiveBest, oracleValue),
    motoreWinsVsEach,
  };
}
