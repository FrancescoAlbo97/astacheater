// §6.1 — Modello di valore: score (0–100) → (fantamedia, titolarità) → valore atteso stagionale.
//
// Attenzione (§13.1): il fattore di titolarità pt_ρ(s) NON è opzionale. Senza di esso λ risulta
// sottostimato di circa il 100% e tutte le offerte massime vengono raddoppiate. Vedi
// test/value-model.test.ts e test/plan-dp.test.ts per i test di regressione che proteggono da
// questa regressione.

import { DEFAULT_RISK_CONFIG, DEFAULT_VALUE_CURVES, SEASON_MATCHDAYS } from './config.js';
import { ROLES } from './types.js';
import type { Role, RiskConfig, RoleWeights, ValueCurveConfig, ValueCurveParams } from './types.js';

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
 * §11 Setup — `playerValue` corretto per la preferenza personale di ruolo: un moltiplicatore
 * diretto, non una distorsione di curva (a differenza del rischio, §6.8, il peso per ruolo non
 * dipende dallo score — è "quanto vale per ME un punto in questo ruolo", non "quanto è incerto
 * questo candidato"). `roleWeights` con tutti i ruoli a 1 restituisce esattamente `playerValue`,
 * senza differenza — comportamento invariato per chi non ha mai toccato il nuovo controllo.
 *
 * Da usare SOLO dove si calcola il valore per allocare IL PROPRIO budget/DP (candidati, offerte,
 * ranking degli slot) — mai per il modello di prezzo (quanto ci si aspetta paghino gli altri) né
 * per la valutazione "verità a terra" di una rosa già fatta (`evaluateFinalRoster`, che deve
 * restare una stima neutra, altrimenti due manager con preferenze diverse non sarebbero mai
 * confrontabili sullo stesso numero — stesso principio già seguito per il rischio, §6.8).
 */
export function roleWeightedPlayerValue(
  role: Role,
  score: number,
  roleWeights: RoleWeights,
  opts: PlayerValueOptions = {},
): number {
  return playerValue(role, score, opts) * (roleWeights[role] ?? 1);
}

/**
 * §6.8 — applica `risk` alle curve di valore: approssimazione esplicitamente ammessa dalla spec
 * per usare `risk` DENTRO la DP (il termine di varianza vero non è decomponibile lì). Un rischio
 * positivo maggiora la convessità (γ_ρ cresce): premia i giocatori di fascia alta rispetto alla
 * media, spingendo a inseguirli più aggressivamente. Un rischio negativo fa l'opposto (punta a
 * rose più "piatte"/sicure). `risk = 0` restituisce le curve invariate.
 *
 * NOTA: misurato empiricamente (self-play su listone reale) che questo meccanismo dà un effetto
 * debole e non sempre monotono, e che rinforzarlo peggiora la prevedibilità invece di migliorarla
 * (satura verso `fmMin` per qualunque score <100 al crescere di γ — vedi MANUALE.md §7). Resta qui
 * come riferimento/rollback e come approssimazione mandata dalla specifica; l'alternativa valutata
 * in alternativa è `riskAdjustedPlayerValue` qui sotto — quale delle due sia effettivamente in uso
 * nei punti di consumo (engine.ts, rollout.ts, dry-run.ts) dipende dall'esito documentato in
 * MANUALE.md §7, non è deciso qui.
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

/**
 * Proxy di deviazione standard STAGIONALE del contributo di un singolo giocatore, in forma chiusa
 * (nessuna simulazione): l'unica fonte di incertezza che il motore modella già per un giocatore è
 * la titolarità Bernoulliana per giornata (o gioca, guadagnando `fm(s)`, o no — vedi il
 * campionamento `rng() < p.pt` in lineup-sim.ts). La NO_VOTE_PENALTY reale è un evento di RUOLO/
 * rosa (nessun titolare disponibile quella giornata in quel ruolo per quel manager), non un esito
 * del singolo giocatore, quindi non decomponibile qui — si approssima l'esito "non gioca" con 0,
 * la semplificazione onesta di un proxy per candidato invece che una vera simulazione di rosa.
 *
 * Var_giornata ≈ pt·(1−pt)·fm²  (due esiti: fm con prob. pt, altrimenti 0)
 * Var_stagione = 38 · Var_giornata  (stesso ridimensionamento di lineup-sim.ts: giornate i.i.d.)
 * SD_stagione  = fm · √(38 · pt · (1−pt))
 */
export function seasonSdProxy(role: Role, score: number, opts: PlayerValueOptions = {}): number {
  const curves = opts.curves ?? DEFAULT_VALUE_CURVES;
  const ptRaw = opts.ptOverride ?? titolarita(role, score, curves);
  const pt = Math.min(1, Math.max(0, ptRaw)); // difesa contro un ptOverride fuori [0,1]
  const fm = fantamedia(role, score, curves);
  return fm * Math.sqrt(SEASON_MATCHDAYS * pt * (1 - pt));
}

/**
 * §6.8 — approssimazione ADDITIVA alternativa a `applyRiskToValueCurves`: invece di distorcere
 * l'intera curva (effetto globale, misurato debole/imprevedibile), aggiunge al valore del
 * candidato un bonus/malus proporzionale alla sua varianza stagionale (`seasonSdProxy`) — una
 * lettura più letterale della formula di specifica `obiettivo = E[punti] + risk·η·SD[punti]`,
 * applicata per candidato perché il vero termine di varianza di ROSA non è decomponibile nella DP.
 * Un candidato "tutto o niente" (pt≈0.5, varianza Bernoulliana massima) riceve più bonus/malus di
 * un titolare quasi certo (pt vicino a `ptMin`/`ptMax`) — l'intento di "cercare varianza" applicato
 * dove il motore può davvero misurarla, invece che deformando la scala di valore per ogni score.
 *
 * `risk = 0` restituisce esattamente `playerValue(...)`, senza alcuna differenza — questa è la
 * garanzia che protegge tutti i chiamanti che non usano il rischio (default `risk` di lega +0.15
 * a parte: qui il confronto è con `risk` letterale, non con l'assenza di configurazione).
 */
export function riskAdjustedPlayerValue(
  role: Role,
  score: number,
  risk: number,
  opts: PlayerValueOptions & { readonly riskConfig?: RiskConfig } = {},
): number {
  const base = playerValue(role, score, opts);
  if (risk === 0) return base;
  const riskConfig = opts.riskConfig ?? DEFAULT_RISK_CONFIG;
  return base + risk * riskConfig.eta * seasonSdProxy(role, score, opts);
}
