// §6.1 — Modello di valore: score (0–100) → (fantamedia, titolarità) → valore atteso stagionale.
//
// Attenzione (§13.1): il fattore di titolarità pt_ρ(s) NON è opzionale. Senza di esso λ risulta
// sottostimato di circa il 100% e tutte le offerte massime vengono raddoppiate. Vedi
// test/value-model.test.ts e test/plan-dp.test.ts per i test di regressione che proteggono da
// questa regressione.

import { DEFAULT_RISK_CONFIG, DEFAULT_VALUE_CURVES, SEASON_MATCHDAYS } from './config.js';
import { ROLES } from './types.js';
import type { Role, RiskConfig, ValueCurveConfig, ValueCurveParams } from './types.js';

function clampScore(score: number): number {
  if (Number.isNaN(score)) return 0;
  return Math.min(100, Math.max(0, score));
}

/** fm_ρ(s): fantamedia attesa quando il giocatore gioca. */
export function fantamedia(
  role: Role,
  score: number,
  curves: ValueCurveConfig = DEFAULT_VALUE_CURVES,
): number {
  const p: ValueCurveParams = curves[role];
  const s = clampScore(score);
  return p.fmMin + (p.fmMax - p.fmMin) * Math.pow(s / 100, p.gamma);
}

/** pt_ρ(s): probabilità di essere schierabile (titolarità), prima di un eventuale override. */
export function titolarita(
  role: Role,
  score: number,
  curves: ValueCurveConfig = DEFAULT_VALUE_CURVES,
): number {
  const p: ValueCurveParams = curves[role];
  const s = clampScore(score);
  return p.ptMin + (p.ptMax - p.ptMin) * Math.pow(s / 100, p.delta);
}

export interface PlayerValueOptions {
  /** Override manuale della titolarità (§6.1): usare quando lo score non predice bene pt. */
  readonly ptOverride?: number | null;
  readonly curves?: ValueCurveConfig;
}

/** v_j = 38 · pt_ρ(s_j) · fm_ρ(s_j): punti attesi stagionali del giocatore. */
export function playerValue(role: Role, score: number, opts: PlayerValueOptions = {}): number {
  const curves = opts.curves ?? DEFAULT_VALUE_CURVES;
  const pt = opts.ptOverride ?? titolarita(role, score, curves);
  const fm = fantamedia(role, score, curves);
  return SEASON_MATCHDAYS * pt * fm;
}

/**
 * §6.8 — applica `risk` alle curve di valore: approssimazione esplicitamente ammessa dalla spec
 * per usare `risk` DENTRO la DP (il termine di varianza vero non è decomponibile lì). Un rischio
 * positivo maggiora la convessità (γ_ρ cresce): premia i giocatori di fascia alta rispetto alla
 * media, spingendo a inseguirli più aggressivamente. Un rischio negativo fa l'opposto (punta a
 * rose più "piatte"/sicure). `risk = 0` restituisce le curve invariate.
 */
export function applyRiskToValueCurves(
  curves: ValueCurveConfig,
  risk: number,
  riskConfig: RiskConfig = DEFAULT_RISK_CONFIG,
): ValueCurveConfig {
  if (risk === 0) return curves;
  const adjusted = {} as { -readonly [K in Role]: ValueCurveParams };
  for (const role of ROLES) {
    const p = curves[role];
    adjusted[role] = { ...p, gamma: p.gamma * (1 + riskConfig.gammaMultiplierPerRisk * risk) };
  }
  return adjusted;
}
