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
  /** Peso che si applicherebbe al PROSSIMO slot da riempire in ciascun ruolo. */
  readonly nextSlotWeight: Record<Role, number>;
  /** μ_ρ: valore ombra approssimato di uno slot del ruolo (contributo del filler a quel rango). */
  readonly muByRole: Record<Role, number>;
}

export interface ComputeDualsInput {
  readonly budget: number;
  readonly roleInputs: Record<Role, RoleDPInput>;
  /** Quanti slot di ciascun ruolo sono già occupati (forzati): determina il "prossimo" rango. */
  readonly ownedCountByRole: Record<Role, number>;
}

export function computeDuals(input: ComputeDualsInput): DualState {
  const { budget, roleInputs, ownedCountByRole } = input;
  const plan = computeFullPlan({ budget, roleInputs });

  const nextSlotWeight = {} as Record<Role, number>;
  const muByRole = {} as Record<Role, number>;
  for (const role of ROLES) {
    const weights = roleInputs[role].weights;
    const idx = Math.min(ownedCountByRole[role], weights.length - 1);
    const w = weights[idx] ?? 0;
    nextSlotWeight[role] = w;
    muByRole[role] = w * roleInputs[role].fillerValue;
  }

  return { lambda: plan.lambda, nextSlotWeight, muByRole };
}

/** p* ≈ (w_ρ,t · v_i − μ_ρ) / λ (§6.6), arrotondato e troncato a [0, maxAffordable]. */
export function approxMaxBid(
  v: number,
  role: Role,
  duals: DualState,
  maxAffordable: number,
): number {
  if (duals.lambda <= 1e-9) return 0;
  const raw = (duals.nextSlotWeight[role] * v - duals.muByRole[role]) / duals.lambda;
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
