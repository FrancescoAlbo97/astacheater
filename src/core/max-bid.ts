// §6.6 — Prezzo massimo p* per bisezione. Φ_win è concava non crescente in p, quindi l'insieme
// {p : Φ_win(p) ≥ Φ_lose} è un intervallo [1, p*] e la bisezione è corretta.

import { ROLES } from './types.js';
import type { MaxBidResult, Role } from './types.js';
import { combineRoles, computeRolePlan, type RoleDPInput } from './plan-dp.js';

export interface MaxBidInput {
  readonly budget: number; // b_0
  /** Stato corrente per ruolo, con il giocatore target NON incluso in nessuna lista (P∖{i}). */
  readonly roleInputsWithoutTarget: Record<Role, RoleDPInput>;
  readonly targetRole: Role;
  readonly targetValue: number; // v_i
  /** c_0: limite superiore per la bisezione (il mio massimo su un singolo giocatore). */
  readonly maxAffordable: number;
}

export function computeMaxBid(input: MaxBidInput): MaxBidResult {
  const { budget, roleInputsWithoutTarget, targetRole, targetValue, maxAffordable } = input;

  const otherPlans = {} as Record<Role, Float64Array>;
  for (const role of ROLES) {
    if (role !== targetRole) {
      otherPlans[role] = computeRolePlan(roleInputsWithoutTarget[role], budget);
    }
  }

  const loseRolePlan = computeRolePlan(roleInputsWithoutTarget[targetRole], budget);
  const loseCombined = combineRoles({ ...otherPlans, [targetRole]: loseRolePlan }, budget);
  const phiLose = loseCombined[budget]!;

  function phiWin(p: number): number {
    const base = roleInputsWithoutTarget[targetRole];
    const withTarget: RoleDPInput = {
      ...base,
      candidates: [...base.candidates, { v: targetValue, price: p, forced: true }],
    };
    const rolePlan = computeRolePlan(withTarget, budget);
    const combined = combineRoles({ ...otherPlans, [targetRole]: rolePlan }, budget);
    return combined[budget]!;
  }

  if (maxAffordable < 1) {
    return { pStar: 0, phiLose, reason: 'capped-by-budget' };
  }

  if (phiWin(1) < phiLose) {
    return { pStar: 0, phiLose, reason: 'not-useful' };
  }

  // Bisezione: invariante phiWin(lo) ≥ phiLose, si cerca il massimo p con questa proprietà.
  let lo = 1;
  let hi = maxAffordable;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (phiWin(mid) >= phiLose) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }

  return { pStar: lo, phiLose, reason: 'ok' };
}
