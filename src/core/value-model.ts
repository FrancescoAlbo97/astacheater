// §6.1 — Modello di valore.
//
// §7 Session 9 (richiesta esplicita dell'utente, due cambi):
// 1) `playerValue` non è più punti-stagione attesi (38·pt·fm) ma DIRETTAMENTE il prezzo equo in
//    crediti che pagherei a inizio asta.
// 2) La titolarità (pt) NON entra più direttamente in `playerValue`: pt resta però necessaria
//    altrove: la copertura-titolari per ruolo (`coverageBonusFactor` sotto) la usa per decidere
//    QUANDO e QUANTO premiare un candidato titolare — non più "quanto vale", ma "quanto mi serve
//    ORA, dato quanti titolari ho già assicurato in questo ruolo". Filosofia dell'utente: "se ho
//    già 4 titolari in attacco, gli altri due posso permettermi che abbiano meno titolarità e
//    concentrarmi sul valore".
//
// §7 Session 10 (correzione della Session 9, richiesta esplicita e ripetuta dell'utente): la
// Session 9 implementava il punto 1) facendo passare `punteggio` per la curva di prezzo di
// mercato (§6.3.1, `priorPrice`, calibrata per un input di QUALITÀ 0-100). Bug reale: un
// punteggio importato come stima diretta in crediti (es. 129, da una fonte reale "10 squadre/500
// crediti") non è una qualità 0-100 da tradurre — È GIÀ il prezzo, e la curva esponenziale lo
// amplificava ben oltre il senso (129 diventava myValue≈957, quasi il doppio del budget di
// un'intera lega). Ora `playerValue` è un'identità sul punteggio: vedi il suo commento sotto per
// il dettaglio. Vedi comunque §7 Session 9 sopra per il RESTO del ragionamento (titolarità fuori
// dal valore, dentro solo la copertura), che resta valido e indipendente da questa correzione.
//
// `fantamedia`/`titolarita` restano IDENTICHE a prima: servono ancora alla verità di riferimento
// (lineup-sim.ts, value-surrogate.ts, metrics.ts's evaluateFinalRoster) — quel percorso non cambia,
// è indipendente da `playerValue` e non era nell'ambito di nessuna di queste richieste. Attenzione
// a non confondere le due cose leggendo vecchi commenti altrove nel codice: "valore" da qui in
// avanti significa SEMPRE crediti (playerValue/roleWeightedPlayerValue), mai più punti, salvo dove
// esplicitamente marcato "potential"/"ground truth"/"verità di riferimento". Il modello di PREZZO
// DI MERCATO (§6.3, `priorPrice`/pHat in price-model.ts — quanto pagherebbero gli ALTRI manager)
// resta invece invariato e continua a usare la curva calibrata su dati reali: è un problema
// distinto ("cosa fa il mercato"), fuori dall'ambito di entrambe queste richieste.

import {
  DEFAULT_COVERAGE_BONUS_FRACTION,
  DEFAULT_RISK_CONFIG,
  DEFAULT_VALUE_CURVES,
  requiredRoleCoverage,
} from './config.js';
import { ROLES } from './types.js';
import type {
  Formation,
  PriceCurveConfig,
  PriceCurveParams,
  Role,
  RiskConfig,
  RoleWeights,
  ValueCurveConfig,
  ValueCurveParams,
} from './types.js';

function clampScore(score: number): number {
  if (Number.isNaN(score)) return 0;
  return Math.min(100, Math.max(0, score));
}

/** fm_ρ(s): fantamedia attesa quando il giocatore gioca. Verità di riferimento (lineup-sim.ts):
 * NON entra più in `playerValue`, vedi commento di testa al file. */
export function fantamedia(
  role: Role,
  score: number,
  curves: ValueCurveConfig = DEFAULT_VALUE_CURVES,
): number {
  const p: ValueCurveParams = curves[role];
  const s = clampScore(score);
  return p.fmMin + (p.fmMax - p.fmMin) * Math.pow(s / 100, p.gamma);
}

/** pt_ρ(s): probabilità di essere schierabile (titolarità), prima di un eventuale override. Usata
 * dalla verità di riferimento E dalla copertura-titolari per ruolo (`coverageBonusFactor` sotto) —
 * NON entra più in `playerValue`, vedi commento di testa al file. */
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
  readonly priceCurves?: PriceCurveConfig;
}

/**
 * v_j: il prezzo equo in crediti che pagherei per questo giocatore a inizio asta.
 *
 * §7 Session 10 (richiesta esplicita e ripetuta dell'utente, sempre — non solo sopra i 100 punti):
 * `punteggio` NON è più un input 0-100 che una curva traduce in prezzo (era la versione Session 9,
 * `priorPrice`) — È GIÀ ESSO STESSO il prezzo. Un punteggio importato da una fonte reale (es. una
 * stima "10 squadre/500 crediti" di un sito di quotazioni) deve restare quel numero esatto come
 * valore, non essere amplificato da una curva esponenziale pensata per un input di qualità 0-100
 * (bug reale trovato in questa sessione: punteggio=129 produceva myValue≈957, quasi il doppio del
 * budget di un'intera lega, perché la vecchia `priorPrice` continuava a crescere esponenzialmente
 * anche ben oltre lo score=100 per cui era calibrata). `role`/`opts.priceCurves` sono IGNORATI qui
 * di proposito — mantenuti nella firma solo per compatibilità con i chiamanti esistenti
 * (`roleWeightedPlayerValue`, il bonus di copertura-titolari, i punti che passano ancora una
 * `priceCurves` risk-adjusted senza più alcun effetto). Un `risk` che distorce quella curva
 * (`applyRiskToPriceCurves`) non ha quindi più alcun effetto sul valore di offerta — non c'è più
 * nessuna curva da distorcere. `Math.max(0, ...)` è solo un pavimento di sicurezza contro input
 * negativi, non un tetto: nessun limite superiore, un top player può valere anche più della metà
 * del budget di lega.
 *
 * NOTA: il modello di PREZZO DI MERCATO (§6.3, `priorPrice`/`pHat`/`renormalize` in
 * price-model.ts) resta INVARIATO — stima quanto pagherebbero gli ALTRI manager, un problema
 * distinto ("cosa fa il mercato") da "quanto vale per me", con la propria curva calibrata su dati
 * PMA reali e il proprio aggiornamento online dalle vendite osservate. Non è nell'ambito di questa
 * richiesta, che riguarda esplicitamente il MIO valore.
 */
export function playerValue(_role: Role, score: number, _opts: PlayerValueOptions = {}): number {
  return Math.max(0, score);
}

/**
 * §11 Setup — `playerValue` corretto per la preferenza personale di ruolo: un moltiplicatore
 * diretto, non una distorsione di curva (a differenza del rischio, §6.8, il peso per ruolo non
 * dipende dallo score — è "quanto vale per ME un credito speso in questo ruolo", non "quanto è
 * incerto questo candidato"). `roleWeights` con tutti i ruoli a 1 restituisce esattamente
 * `playerValue`, senza differenza — comportamento invariato per chi non ha mai toccato il nuovo
 * controllo.
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
 * §6.8 — applica `risk` alle curve di VALORE (fantamedia/titolarità, verità di riferimento):
 * approssimazione esplicitamente ammessa dalla spec per usare `risk` DENTRO la DP di lineup-sim
 * (il termine di varianza vero non è decomponibile lì). Un rischio positivo maggiora la convessità
 * (γ_ρ cresce): premia i giocatori di fascia alta rispetto alla media. Un rischio negativo fa
 * l'opposto. `risk = 0` restituisce le curve invariate.
 *
 * Invariata dalla Session 9: questa funzione non tocca `playerValue` (che non usa più
 * `ValueCurveConfig`) — resta per chi valuta ancora la verità di riferimento con rischio applicato
 * (`evaluateFinalRoster` in dry-run.ts/post-auction-report.ts). Per il rischio applicato al VALORE
 * (bidding, crediti) vedi `applyRiskToPriceCurves` sotto.
 *
 * NOTA storica: misurato empiricamente (self-play su listone reale) che questo meccanismo dà un
 * effetto debole e non sempre monotono sulla composizione della rosa, e che rinforzarlo peggiora la
 * prevedibilità invece di migliorarla (satura verso `fmMin` per qualunque score <100 al crescere di
 * γ — vedi MANUALE.md §7). Resta qui come riferimento/rollback e come approssimazione mandata dalla
 * specifica.
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
 * §6.8 Session 9 — equivalente di `applyRiskToValueCurves` ma sulla curva di PREZZO (§6.3.1), da
 * cui ora deriva `playerValue`: un rischio positivo rende la curva più ripida (θ_ρ cresce),
 * premiando i punteggi alti rispetto alla media in termini di crediti che sarei disposto a pagare;
 * un rischio negativo la appiattisce. Stesso principio/stesso `RiskConfig` di prima, applicato al
 * parametro giusto per il nuovo modello di valore invece che a γ (che non influenza più
 * `playerValue`). `risk = 0` restituisce le curve invariate.
 */
export function applyRiskToPriceCurves(
  curves: PriceCurveConfig,
  risk: number,
  riskConfig: RiskConfig = DEFAULT_RISK_CONFIG,
): PriceCurveConfig {
  if (risk === 0) return curves;
  const adjusted = {} as { -readonly [K in Role]: PriceCurveParams };
  for (const role of ROLES) {
    const p = curves[role];
    adjusted[role] = { ...p, theta: p.theta * (1 + riskConfig.gammaMultiplierPerRisk * risk) };
  }
  return adjusted;
}

/**
 * Proxy di deviazione standard STAGIONALE del contributo di un singolo giocatore, in forma chiusa
 * (nessuna simulazione) — verità di riferimento, non bidding: Var_giornata ≈ pt·(1−pt)·fm².
 *
 * ATTENZIONE (Session 9): `riskAdjustedPlayerValue` sotto, che usa questa funzione, somma questo
 * proxy (scala punti-stagione) a `playerValue` (ora scala crediti) — da quando `playerValue` è
 * cambiato, quella combinazione mescola due unità diverse e NON va più interpretata come "valore in
 * crediti + rischio". Nessun percorso live la usa (era già solo un'alternativa di ricerca
 * documentata come non-in-uso, §7 Session 6) — lasciata qui con questo avviso invece di essere
 * cancellata, ma da NON ri-attivare senza prima riconciliare le unità.
 */
export function seasonSdProxy(role: Role, score: number, opts: PlayerValueOptions & { readonly ptOverride?: number | null; readonly curves?: ValueCurveConfig } = {}): number {
  const curves = opts.curves ?? DEFAULT_VALUE_CURVES;
  const ptRaw = opts.ptOverride ?? titolarita(role, score, curves);
  const pt = Math.min(1, Math.max(0, ptRaw));
  const fm = fantamedia(role, score, curves);
  return fm * Math.sqrt(38 * pt * (1 - pt));
}

/**
 * §6.8 — approssimazione ADDITIVA alternativa a `applyRiskToValueCurves`/`applyRiskToPriceCurves`.
 * Vedi l'avviso su `seasonSdProxy` sopra: da Session 9 mescola crediti (playerValue) e punti-stagione
 * (seasonSdProxy) nella stessa somma. Mai wired in un percorso live (§7 Session 6), lasciata per
 * riferimento/test storici.
 */
export function riskAdjustedPlayerValue(
  role: Role,
  score: number,
  risk: number,
  opts: PlayerValueOptions & { readonly ptOverride?: number | null; readonly riskConfig?: RiskConfig } = {},
): number {
  const base = playerValue(role, score, opts);
  if (risk === 0) return base;
  const riskConfig = opts.riskConfig ?? DEFAULT_RISK_CONFIG;
  return base + risk * riskConfig.eta * seasonSdProxy(role, score, opts);
}

// ---------------------------------------------------------------------------
// §11 Session 9 — Copertura titolari per ruolo
// ---------------------------------------------------------------------------

/**
 * Quanto manca, in frazione [0,1], a raggiungere la copertura-titolari richiesta per `role`
 * (`requiredRoleCoverage`, §11 Setup): 0 = copertura piena o superata, 1 = nessuna copertura
 * (nessun titolare posseduto, o soglia non definita per formazioni degeneri). `ownedPts` è la
 * titolarità (già dedotta dallo score, o l'override) di ciascun giocatore GIÀ posseduto in questo
 * ruolo — la copertura è la loro somma ("quanti titolari attesi ho già in cassa"), non un conteggio
 * secco, così un ruolo con più mezze-certezze può coprire quanto un titolare quasi certo.
 */
export function roleCoverageGapFraction(
  role: Role,
  ownedPts: readonly number[],
  formation: Formation,
): number {
  const target = requiredRoleCoverage(role, formation);
  if (target <= 0) return 0;
  const coverage = ownedPts.reduce((s, pt) => s + pt, 0);
  const gap = Math.max(0, target - coverage);
  return Math.min(1, gap / target);
}

/**
 * Frazione di bonus da applicare al valore BASE di un candidato non ancora posseduto, dato la sua
 * titolarità (`pt`) e quanto il ruolo è ancora scoperto (`gapFraction`, da
 * `roleCoverageGapFraction`): 0 se il ruolo è già coperto (`gapFraction=0`, qualunque `pt`) o se
 * `pt=0`; cresce con entrambi fino a `bonusFraction` quando il ruolo è scoperto (`gapFraction=1`) e
 * il candidato è un titolare quasi certo (`pt` vicino a 1). Additivo sul valore, non sulla curva —
 * stesso schema già usato per il rischio (`riskAdjustedPlayerValue`): sfuma a zero senza scatti, non
 * un filtro netto.
 */
export function coverageBonusFactor(
  pt: number,
  gapFraction: number,
  bonusFraction: number = DEFAULT_COVERAGE_BONUS_FRACTION,
): number {
  if (gapFraction <= 0) return 0;
  const clampedPt = Math.min(1, Math.max(0, pt));
  return Math.min(1, Math.max(0, gapFraction)) * clampedPt * bonusFraction;
}

/**
 * Applica il bonus di copertura-titolari a un valore base già calcolato (§11 Session 9): il
 * chiamante decide COME `baseValue` è stato calcolato (playerValue semplice, roleWeighted,
 * risk-adjusted...) — questa funzione si limita a scalarlo, componendo con qualunque altra leva
 * già applicata a monte.
 */
export function applyCoverageBonus(
  baseValue: number,
  pt: number,
  gapFraction: number,
  bonusFraction?: number,
): number {
  return baseValue * (1 + coverageBonusFactor(pt, gapFraction, bonusFraction));
}
