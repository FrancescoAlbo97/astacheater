// §6.6 (approssimazione al primo ordine) + §6.7 ("politica base rapida dentro i rollout").
// Ricalcolare la DP esatta (bisezione, §6.6) ad ogni giocatore estratto è troppo lento per un
// rollout o per un'asta simulata (250 estrazioni × migliaia di aste): si ricalcolano i "duali"
// periodicamente e si usa la formula approssimata p* ≈ (w_ρ,t · v − μ_ρ) / λ fra un ricalcolo e
// l'altro. Usato da sim/auction-sim.ts (motore e archetipo 'rational') e da core/rollout.ts.

import { ROLES } from './types.js';
import type { Role } from './types.js';
import { computeFullPlan, type RoleDPInput } from './plan-dp.js';

export interface DualState {
  readonly lambda: number;
  /** Valori (v) dei giocatori GIÀ POSSEDUTI per ruolo, ordinati per valore DECRESCENTE — non il
   * semplice conteggio (§7 Session 8: bug reale, vedi sotto). Presi direttamente dai candidati
   * `forced` di `roleInputs`, quindi sempre coerenti con quello che la DP esatta considera
   * posseduto in quel ruolo. */
  readonly ownedValuesByRole: Record<Role, readonly number[]>;
  readonly weightsByRole: Record<Role, readonly number[]>;
  readonly fillerValueByRole: Record<Role, number>;
}

export interface ComputeDualsInput {
  readonly budget: number;
  readonly roleInputs: Record<Role, RoleDPInput>;
}

export function computeDuals(input: ComputeDualsInput): DualState {
  const { budget, roleInputs } = input;
  const plan = computeFullPlan({ budget, roleInputs });

  const ownedValuesByRole = {} as Record<Role, readonly number[]>;
  const weightsByRole = {} as Record<Role, readonly number[]>;
  const fillerValueByRole = {} as Record<Role, number>;
  for (const role of ROLES) {
    ownedValuesByRole[role] = roleInputs[role].candidates
      .filter((c) => c.forced)
      .map((c) => c.v)
      .sort((a, b) => b - a);
    weightsByRole[role] = roleInputs[role].weights;
    fillerValueByRole[role] = roleInputs[role].fillerValue;
  }

  return { lambda: plan.lambda, ownedValuesByRole, weightsByRole, fillerValueByRole };
}

/**
 * Peso di slot che si applicherebbe a un candidato di valore `v` in questo ruolo, e il μ_ρ
 * corrispondente — calcolato per RANGO DI VALORE fra i posseduti, non per quanti se ne possiedono
 * (§7 Session 8, bug reale trovato dall'utente: "i calciatori che compro non sono in ordine per
 * peso"). Prima di questo fix, `nextSlotWeight` era `weights[ownedCount]` — assumeva che il
 * PROSSIMO acquisto in un ruolo occupasse sempre lo slot "numero N+1", indipendentemente da quanto
 * valesse rispetto a quelli già posseduti: un giocatore ottimo trovato a poco prezzo dopo aver già
 * comprato 6 mediocri in quel ruolo veniva valutato con il peso minuscolo del 7° slot, invece del
 * peso alto che gli spetterebbe scavalcando i mediocri (esattamente come fa già la DP esatta,
 * `plan-dp.ts`, che ordina SEMPRE tutti i candidati — posseduti e no — per valore decrescente prima
 * di assegnare i pesi, mai per ordine di acquisto). Qui si fa lo stesso: si inserisce `v` nella
 * lista (già ordinata) dei valori posseduti e si usa il rango risultante.
 */
function slotWeightForCandidate(v: number, role: Role, duals: DualState): number {
  const owned = duals.ownedValuesByRole[role];
  const weights = duals.weightsByRole[role];
  let rank = 0;
  while (rank < owned.length && owned[rank]! >= v) rank++;
  const idx = Math.min(rank, weights.length - 1);
  return weights[idx] ?? 0;
}

/** Peso di slot e μ_ρ per un candidato di valore `v`, esposti per la riga "perché questo numero"
 * (§6.6 UI) — `approxMaxBid` usa la stessa logica internamente ma non espone i due termini
 * separatamente. */
export function weightAndMuForCandidate(v: number, role: Role, duals: DualState): { weight: number; mu: number } {
  const weight = slotWeightForCandidate(v, role, duals);
  return { weight, mu: weight * duals.fillerValueByRole[role] };
}

/**
 * p* ≈ (w_ρ,t · v_i − μ_ρ) / λ (§6.6), arrotondato e troncato a [0, maxAffordable].
 *
 * Nota su λ ≈ 0 — NON è un caso limite raro, va gestito con cura (bug reale trovato e corretto
 * durante lo sviluppo, causa primaria del sotto-speso osservato in simulazione, vedi
 * test/base-policy.test.ts). La pianificazione statica a prezzi FISSI (p̂) dietro `computeDuals`
 * spesso conclude che il proprio piano ottimo "a prezzi di mercato attesi" costa MENO del budget
 * residuo: un credito in più, in quel piano, non compra nulla, perché il modello non sa
 * rappresentare "pagare più del p̂ atteso per anticipare un rivale su un candidato specifico".
 * λ = 0 NON significa che i crediti non valgano più nulla: matematicamente il rapporto
 * (numeratore positivo)/λ tende a +∞ quando λ → 0, cioè un candidato che vale più del suo
 * sostituto andrebbe inseguito fino al massimo permesso, non abbandonato. La vecchia guardia
 * (`lambda <= eps ⇒ return 0` incondizionato) faceva l'opposto: azzerava l'offerta anche per
 * candidati chiaramente sopra la media, non appena il piano statico si "saturava" — cosa che
 * capita spesso ben prima che l'asta finisca davvero.
 */
export function approxMaxBid(
  v: number,
  role: Role,
  duals: DualState,
  maxAffordable: number,
): number {
  if (duals.lambda <= 1e-9) return 0;
  const w = slotWeightForCandidate(v, role, duals);
  const mu = w * duals.fillerValueByRole[role];
  const raw = (w * v - mu) / duals.lambda;
  return Math.max(0, Math.min(maxAffordable, Math.round(raw)));
}

/** Vero se conviene ricalcolare i duali (§6.7): ogni N estrazioni o se il budget cala molto. */
export function shouldRecalcDuals(
  drawsSinceRecalc: number,
  recalcEveryDraws: number,
  creditsAtLastRecalc: number,
  creditsNow: number,
  recalcOnBudgetDropFraction: number,
): boolean {
  if (drawsSinceRecalc >= recalcEveryDraws) return true;
  if (creditsAtLastRecalc <= 0) return false;
  const drop = (creditsAtLastRecalc - creditsNow) / creditsAtLastRecalc;
  return drop >= recalcOnBudgetDropFraction;
}
