// §7 Session 8, ispirazione 2 (self-play, come `neural_network/`): quando la fiducia sui prezzi
// REALI di QUESTA lega è ancora bassa (poche o zero vendite registrate), `fitOnlinePriceCurves`
// (price-model.ts) ricade su una curva teorica GENERICA — calibrata su un campione di ALTRE leghe
// reali, indifferente al TUO budget, al numero di manager, agli slot che hai configurato in Setup.
// Idea presa in prestito dal prototipo (una sola macchina di valutazione fatta girare contro copie
// di sé stessa) SENZA allenare nulla: si fanno girare alcune aste sintetiche con la CONFIGURAZIONE
// ESATTA di questa lega (stessa macchina di "Prova a secco", `sim/auction-sim.ts`, già scritta,
// già testata) e si legge il prezzo medio a cui i giocatori si sono venduti, per ruolo — una prior
// più su misura invece di quella generica. Il ridge shrinkage già esistente (§6.3.3) fa comunque
// prevalere i dati REALI di questa lega non appena arrivano: questa prior conta SOLO quando quei
// dati non ci sono ancora, mai in sostituzione.
//
// Vincolo duro (§13.9): `computeDecisionForPlayer` deve restare velocissimo SEMPRE. Un'asta
// sintetica costa qualche decina di ms; farne 10 per ottenere una prior costerebbe qualche centinaio
// di ms — troppo per starci dentro una singola decisione. Per questo il calcolo non gira MAI dentro
// il percorso "a caldo": `getLeaguePriorCurves` legge una cache di modulo e restituisce `null` se
// non è ancora pronta (in quel caso il chiamante ricade sulla curva generica, zero rischio per la
// velocità) — è `warmLeaguePriorCache` (chiamata dalla UI in un `useEffect`, fuori dal render) a
// popolarla in background, una volta sola, ricalcolando solo quando cambiano config o punteggi.

import { runAuctionSim } from '../sim/auction-sim.js';
import { buildRealScenario, DEFAULT_OPPONENT_SCORE_JITTER, type ScenarioPlayer } from '../sim/generator.js';
import { buildRandomArchetypeMix } from '../sim/archetypes.js';
import { mulberry32 } from './rng.js';
import { ROLES } from './types.js';
import type { AuctionState, PriceCurveConfig, Role } from './types.js';
import {
  DEFAULT_PRICE_CURVES,
  DEFAULT_PRICE_MODEL_CONFIG,
  DEFAULT_ROLE_WEIGHTS,
  DEFAULT_ROLLOUT_CONFIG,
  DEFAULT_VALUE_CURVES,
  normalizeSlotWeights,
} from './config.js';

const N_SELF_PLAY_AUCTIONS = 10;
/** Sotto questo numero di vendite sintetiche in un ruolo, il campione è troppo piccolo per fidarsi
 * di una pendenza propria: si tiene la curva generica per QUEL ruolo (stessa soglia filosofia di
 * `minObservationsForOwnFit` in price-model.ts, qui più alta perché il campione è sintetico e a
 * basso costo — non c'è motivo di accontentarsi di poco). */
const MIN_SALES_PER_ROLE = 20;

interface RolePoints {
  xs: number[]; // score/100
  ys: number[]; // log(prezzo)
}

/** Stessa regressione pesata di price-model.ts, senza ridge/Huber/decadimento per recency: qui il
 * campione è sintetico, grande e senza un ordine temporale reale a cui dare peso — una OLS semplice
 * con la stessa guardia su pendenza negativa (§6.3.1: un prezzo che scende con lo score non ha senso
 * in questo modello) basta. */
function fitRole(points: RolePoints, fallback: PriceCurveConfig[Role]): PriceCurveConfig[Role] {
  const n = points.xs.length;
  if (n < MIN_SALES_PER_ROLE) return fallback;
  const meanX = points.xs.reduce((s, x) => s + x, 0) / n;
  const meanY = points.ys.reduce((s, y) => s + y, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = points.xs[i]! - meanX;
    sxx += dx * dx;
    sxy += dx * (points.ys[i]! - meanY);
  }
  const slope = sxx > 1e-9 ? sxy / sxx : 0;
  const theta = slope > 0 ? slope : 0;
  const logA = theta > 0 ? meanY - theta * meanX : meanY;
  return { A: Math.exp(logA), theta };
}

function computeSignature(state: AuctionState): string | null {
  const config = state.config;
  if (!config) return null;
  const scoreEntries = Object.entries(state.scores)
    .map(([id, s]) => `${id}:${s.score}:${s.ptOverride ?? ''}`)
    .sort();
  const playerIds = Object.keys(state.players).sort();
  return JSON.stringify({ config, playerIds, scoreEntries });
}

let cache: { signature: string; curves: PriceCurveConfig } | null = null;

/** Legge la prior già pronta per QUESTA istantanea (config + punteggi), o `null` se non ancora
 * calcolata / non più valida — MAI calcola sul momento (vedi nota in cima al file). */
export function getLeaguePriorCurves(state: AuctionState): PriceCurveConfig | null {
  const signature = computeSignature(state);
  if (!signature || !cache || cache.signature !== signature) return null;
  return cache.curves;
}

/** Calcola (sincrono, qualche centinaio di ms) e mette in cache la prior per QUESTA istantanea —
 * va chiamata FUORI dal percorso di una singola decisione (§13.9), tipicamente da un `useEffect`
 * della UI. No-op immediato se la cache è già valida per questa identica config+punteggi. */
export function warmLeaguePriorCache(state: AuctionState): void {
  const signature = computeSignature(state);
  if (!signature) return;
  if (cache && cache.signature === signature) return;

  const config = state.config!;
  const players: ScenarioPlayer[] = Object.values(state.players).map((p) => ({ id: p.id, role: p.role, team: p.team }));
  if (players.length === 0) return;
  const myScores = new Map(Object.entries(state.scores).map(([id, s]) => [id, s.score]));

  const pointsByRole: Record<Role, RolePoints> = { P: { xs: [], ys: [] }, D: { xs: [], ys: [] }, C: { xs: [], ys: [] }, A: { xs: [], ys: [] } };
  for (let i = 0; i < N_SELF_PLAY_AUCTIONS; i++) {
    const seed = i + 1; // deterministico (§13.10): nessun Math.random()/Date.now() non seminato
    const scenario = buildRealScenario(players, myScores, config.managers.length, DEFAULT_OPPONENT_SCORE_JITTER, mulberry32(seed));
    const archetypesByManager = buildRandomArchetypeMix(config.managers.length, mulberry32(seed + 300_000_007));
    const result = runAuctionSim({
      league: config,
      seed,
      rho: 0, // ignorato: scenarioOverride sotto salta generateScenario, l'unico a leggere rho
      archetypesByManager,
      priceModelConfig: DEFAULT_PRICE_MODEL_CONFIG,
      valueCurves: DEFAULT_VALUE_CURVES,
      roleWeights: config.roleWeights ?? DEFAULT_ROLE_WEIGHTS,
      slotWeights: normalizeSlotWeights(config.slotWeights, config.slots),
      priceNoiseSigma: DEFAULT_ROLLOUT_CONFIG.priceNoiseSigma,
      dualsRecalcEveryDraws: DEFAULT_ROLLOUT_CONFIG.dualsRecalcEveryDraws,
      dualsRecalcOnBudgetDropFraction: DEFAULT_ROLLOUT_CONFIG.dualsRecalcOnBudgetDropFraction,
      scenarioOverride: scenario,
    });
    for (const sale of result.sales) {
      const score = myScores.get(sale.playerId) ?? 30;
      pointsByRole[sale.role]!.xs.push(score / 100);
      pointsByRole[sale.role]!.ys.push(Math.log(Math.max(1, sale.price)));
    }
  }

  const curves = {} as { -readonly [K in Role]: PriceCurveConfig[Role] };
  for (const role of ROLES) curves[role] = fitRole(pointsByRole[role]!, DEFAULT_PRICE_CURVES[role]);
  cache = { signature, curves };
}
