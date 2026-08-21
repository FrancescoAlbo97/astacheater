// §6.7/§9.3 — Logica di offerta "razionale" condivisa fra il simulatore offline (sim/auction-sim.ts,
// archetipo 'rational') e il rollout Monte Carlo dal vivo (rollout.ts). Fino a questa revisione le
// due copie erano indipendenti: sim/auction-sim.ts calcolava un'offerta vera basata sul valore
// (duali ricalcolati periodicamente + un "rialzo di urgenza" calibrato su dati reali — vedi sotto),
// mentre rollout.ts faceva rispondere gli AVVERSARI con un modello molto più povero (prezzo di
// mercato atteso × rumore casuale, nessun ragionamento sulla loro reale scarsità di slot/budget).
// Segnalato dall'utente da un'osservazione corretta: "quando ha tanti soldi sarà vicino al prezzo
// reale... se ha scarsità offrirà tanto, se è l'unico con lo slot libero offrirà pochissimo" — un
// comportamento che il vecchio modello di rollout non calcolava affatto per gli avversari.
//
// Diviso in due funzioni componibili invece di una sola, perché `auction-sim.ts` applica il rialzo
// di urgenza + rumore a QUALUNQUE archetipo (anche quelli non razionali, che calcolano `base` con
// `archetypeWillingness`, non con questa DP) — solo il calcolo di `base` è specifico al ragionamento
// "razionale" (duali + approxMaxBid), il resto (urgenza/rumore/tetto) è condiviso da tutti.
//
// Il rialzo di urgenza non è un dettaglio: è stato calibrato su un'asta reale (bug reale, vedi il
// commento esteso ancora presente in auction-sim.ts) per correggere un sotto-speso sistematico.
// Riusarlo anche nel rollout, non solo in sim/, è il punto centrale di questa estrazione — un
// avversario simulato che non lo avesse si comporterebbe in modo artificialmente più remissivo di
// un vero manager a fine asta con crediti in eccesso.

import { ROLES } from './types.js';
import type { Formation, Role } from './types.js';
import { computeDuals, approxMaxBid, shouldRecalcDuals, type DualState } from './base-policy.js';
import type { DPCandidate, RoleDPInput } from './plan-dp.js';
import { applyCoverageBonus, roleCoverageGapFraction, titolarita } from './value-model.js';

export interface RationalBidderCache {
  duals: DualState | null;
  drawsSinceRecalc: number;
  creditsAtLastRecalc: number;
}

export function freshRationalBidderCache(initialCredits: number): RationalBidderCache {
  return { duals: null, drawsSinceRecalc: Infinity, creditsAtLastRecalc: initialCredits };
}

/** Candidato generico per la DP di un ruolo, prima della potatura (§6.5: "riduce tipicamente a
 * 30-50 candidati"). `pHat` è il prezzo ATTESO, non ancora scalato per la granularità. */
export interface RationalCandidateInput {
  readonly score: number;
  readonly pHat: number;
}

/**
 * Costruisce i `RoleDPInput` per un manager qualunque dato il suo roster (score posseduti per
 * ruolo) e il pool di candidati opzionali ancora disponibili — stessa potatura (`maxOptional` per
 * valore decrescente) già usata da `auction-sim.ts`, ora condivisa. `scoreToValue` disaccoppia
 * questa funzione dalla curva di valore/rischio/peso-ruolo specifica del chiamante.
 *
 * `budgetGranularity` scala i prezzi ATTESI qui dentro (non solo il budget in `computeRationalBase`
 * sotto): la DP confronta prezzi e budget nella STESSA unità, quindi le due scale non possono
 * essere impostate in punti diversi senza disallinearsi — un bug facile da introdurre altrimenti.
 *
 * §11 Session 9 — copertura titolari per ruolo: applicata QUI, non dentro `scoreToValue`, perché
 * dipende dal roster GIÀ POSSEDUTO (`ownedScoresByRole`) che questa funzione ha già sotto mano.
 * Solo i candidati OPZIONALI (non ancora posseduti) ricevono il bonus — i FORZATI (già posseduti)
 * restano al loro valore base: la copertura serve a orientare la PROSSIMA scelta, non a
 * rivalutare chi è già in rosa (non lo si può più "scambiare"), e comunque i forzati compaiono
 * identici in Φ_win e Φ_lose, quindi un bonus anche lì non cambierebbe alcuna decisione — solo la
 * loro classifica per peso-slot, che non è il bersaglio di questa leva.
 */
export function buildRationalRoleInputs(
  ownedScoresByRole: Record<Role, readonly number[]>,
  poolByRole: Record<Role, readonly RationalCandidateInput[]>,
  leagueSlots: Record<Role, number>,
  slotWeights: Record<Role, readonly number[]>,
  formation: Formation,
  scoreToValue: (role: Role, score: number) => number,
  maxOptionalCandidates: number,
  budgetGranularity: number,
): Record<Role, RoleDPInput> {
  const roleInputs = {} as Record<Role, RoleDPInput>;
  for (const role of ROLES) {
    const ownedScores = ownedScoresByRole[role]!;
    const forced: DPCandidate[] = ownedScores.map((score) => ({
      v: scoreToValue(role, score),
      price: 0,
      forced: true,
    }));
    const gapFraction = roleCoverageGapFraction(role, ownedScores.map((score) => titolarita(role, score)), formation);
    const rolePool = poolByRole[role]!;
    const optional: DPCandidate[] = rolePool
      .map((c) => ({
        v: applyCoverageBonus(scoreToValue(role, c.score), titolarita(role, c.score), gapFraction),
        price: Math.max(1, Math.ceil(c.pHat / budgetGranularity)),
        forced: false,
      }))
      .sort((a, b) => b.v - a.v)
      .slice(0, maxOptionalCandidates);
    const scoresSorted = rolePool.map((c) => c.score).sort((a, b) => a - b);
    const p20 = scoresSorted.length > 0 ? scoresSorted[Math.floor(0.2 * scoresSorted.length)]! : 0;
    roleInputs[role] = {
      candidates: [...forced, ...optional],
      fillerValue: scoreToValue(role, p20),
      slotCount: leagueSlots[role],
      weights: slotWeights[role],
    };
  }
  return roleInputs;
}

export interface RationalBaseInput {
  /** Mutata in place: stessa cache riusata estrazione dopo estrazione per lo stesso manager. */
  readonly cache: RationalBidderCache;
  readonly creditsRemaining: number;
  readonly maxSingleBidForManager: number;
  /** Costruisce i `RoleDPInput` SOLO se serve davvero un ricalcolo (§6.7): ricostruirli a ogni
   * estrazione anche quando i duali restano quelli di prima sarebbe uno spreco puro — nessun
   * risparmio nel farlo comunque, dato che vengono usati solo dentro `computeDuals`. */
  readonly buildRoleInputs: () => Record<Role, RoleDPInput>;
  readonly targetRole: Role;
  readonly targetValue: number;
  readonly budgetGranularity: number;
  readonly dualsRecalcEveryDraws: number;
  readonly dualsRecalcOnBudgetDropFraction: number;
}

/**
 * `base` del ragionamento "razionale": duali ricalcolati periodicamente (§6.7, mai a ogni
 * estrazione — costerebbe una DP a 4 ruoli per manager per estrazione) + `approxMaxBid` (§6.6).
 * Senza rialzo di urgenza né rumore: quelli sono comuni a QUALUNQUE archetipo, vedi
 * `applyUrgencyAndNoise` sotto.
 */
export function computeRationalBase(input: RationalBaseInput): number {
  const { cache } = input;
  const needsRecalc = shouldRecalcDuals(
    cache.drawsSinceRecalc,
    input.dualsRecalcEveryDraws,
    cache.creditsAtLastRecalc,
    input.creditsRemaining,
    input.dualsRecalcOnBudgetDropFraction,
  );
  if (needsRecalc || cache.duals === null) {
    const scaledBudget = Math.max(1, Math.floor(input.creditsRemaining / input.budgetGranularity));
    const duals = computeDuals({ budget: scaledBudget, roleInputs: input.buildRoleInputs() });
    cache.duals = { ...duals, lambda: duals.lambda / input.budgetGranularity };
    cache.drawsSinceRecalc = 0;
    cache.creditsAtLastRecalc = input.creditsRemaining;
  }
  return approxMaxBid(input.targetValue, input.targetRole, cache.duals, input.maxSingleBidForManager);
}

export interface UrgencyAndNoiseInput {
  readonly base: number;
  readonly creditsRemaining: number;
  readonly totalSlotsRemaining: number;
  /** budget di lega / slot totali di lega — costante per tutta l'asta, calcolabile una volta sola. */
  readonly fairPacePerSlot: number;
  /** Quota di budget attesa per il ruolo target (§6.3.1): un attaccante vale di più anche solo per
   * smaltire un surplus di crediti, non solo come valutazione diretta. */
  readonly roleBudgetShare: number;
  readonly minPrice: number;
  readonly maxSingleBidForManager: number;
  /** Fattore moltiplicativo di rumore GIÀ campionato dal chiamante (`Math.exp(randNormal(rng) *
   * sigma)`), non un `Rng` da consumare qui dentro: chi chiama decide COME campionarlo — un flusso
   * indipendente per manager (`sim/auction-sim.ts`, nessun vincolo di riproducibilità appaiata) o un
   * valore pre-generato condiviso fra rami "vinco"/"perdo" (`core/rollout.ts`, dove serve lo stesso
   * rumore in entrambi i rami per un confronto a varianza ridotta — "common random numbers", §6.7).
   * Un `Rng` consumato qui dentro renderebbe impossibile la seconda modalità. */
  readonly noiseFactor: number;
}

/**
 * Rialzo di urgenza (spendere il surplus di crediti-per-slot prima che valga zero a fine asta,
 * calibrato su dati reali — vedi il commento esteso in auction-sim.ts) + rumore log-normale +
 * tetto fisico. Comune a qualunque archetipo, non solo a quello razionale.
 */
export function applyUrgencyAndNoise(input: UrgencyAndNoiseInput): number {
  const actualPace = input.totalSlotsRemaining > 0 ? input.creditsRemaining / input.totalSlotsRemaining : 0;
  const excessPerSlot = Math.max(0, actualPace - input.fairPacePerSlot);
  const avgBudgetShare = 0.25; // media su 4 ruoli equipesati, per normalizzare il moltiplicatore
  const roleShareMultiplier = input.roleBudgetShare / avgBudgetShare;

  // OPTIMIZATION §F2: Aumentato il fattore di urgenza da 20 a 35 per migliorare il budget burning.
  // Il valore precedente lasciava troppi crediti non spesi a fine asta (gap noto §9.5).
  const urgencyBoost = input.base > 0 ? excessPerSlot * 35 * roleShareMultiplier : 0;
  
  // OPTIMIZATION §F2: Aggiunto un boost minimo assoluto quando i crediti sono molti e gli slot pochi.
  // Questo aiuta a bruciare crediti residui nelle fasi finali dell'asta.
  const endgameBoost = input.totalSlotsRemaining <= 3 && input.creditsRemaining > 50
    ? Math.min(30, input.creditsRemaining / input.totalSlotsRemaining)
    : 0;
  const noisy = (input.base + urgencyBoost + endgameBoost) * input.noiseFactor;
  return Math.max(input.minPrice, Math.min(noisy, input.maxSingleBidForManager));
}
