// §6.4 — Tetto avversari (esatto). Il vincolo più redditizio del sistema: aritmetica esatta,
// non una stima, perché ogni manager deve riempire tutti gli slot e ogni giocatore costa ≥ 1.

import type { CeilingInfo, ManagerState, Role } from './types.js';

export function totalSlotsRemaining(m: ManagerState): number {
  return m.slotsRemaining.P + m.slotsRemaining.D + m.slotsRemaining.C + m.slotsRemaining.A;
}

/** c_m = b_m − (k_m − 1): il massimo che il manager m può spendere su un singolo giocatore. */
export function maxSingleBid(m: ManagerState): number {
  return m.creditsRemaining - (totalSlotsRemaining(m) - 1);
}

/**
 * Tetto avversari per un ruolo: C¹ (massimo c_m fra gli avversari con slot libero in quel
 * ruolo), C² (secondo massimo), e chi li detiene. 0 se l'insieme degli eleggibili è vuoto o ha
 * meno di 2 elementi rispettivamente (§6.4).
 */
export function ceilingForRole(
  managers: readonly ManagerState[],
  myManagerId: string,
  role: Role,
): CeilingInfo {
  const me = managers.find((m) => m.manager.id === myManagerId);
  if (!me) {
    throw new Error(`manager non trovato: ${myManagerId}`);
  }

  const eligible = managers
    .filter((m) => m.manager.id !== myManagerId && m.slotsRemaining[role] > 0)
    .map((m) => ({ manager: m, c: maxSingleBid(m) }))
    .sort((a, b) => b.c - a.c);

  return {
    c1: eligible[0]?.c ?? 0,
    c2: eligible[1]?.c ?? 0,
    holder1: eligible[0]?.manager ?? null,
    holder2: eligible[1]?.manager ?? null,
    myMax: maxSingleBid(me),
  };
}

/** Offerta operativa massima (§6.4): non serve mai offrire più di C¹+1, né più del proprio c_0. */
export function operationalMaxBid(pStar: number, ceiling: CeilingInfo): number {
  return Math.min(pStar, ceiling.c1 + 1, ceiling.myMax);
}

/** Prezzo atteso in prima approssimazione (§6.4): fissato dal secondo offerente, non dal primo. */
export function expectedPriceFromCeiling(pHat: number, ceiling: CeilingInfo): number {
  return Math.min(pHat, ceiling.c2 + 1);
}
