// §6.4 — Tetto avversari (esatto). Il vincolo più redditizio del sistema: aritmetica esatta,
// non una stima, perché ogni manager deve riempire tutti gli slot e ogni giocatore costa ≥ 1.

import { ROLES } from './types.js';
import type { CeilingInfo, ManagerState, Player, Role } from './types.js';

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

/**
 * Offerta operativa massima (§6.4): non serve mai offrire più di C¹+1, né più del proprio c_0.
 *
 * `minPrice` (§11 Setup) entra come pavimento del termine `C¹+1`, non di `pStar`: se `pStar = 0`
 * (il candidato non serve, `min(0, …) = 0` comunque, non forziamo un'offerta per chi non vogliamo)
 * il risultato resta correttamente 0; se invece C¹=0 (nessun avversario eleggibile, "garantito") il
 * prezzo vero non può comunque scendere sotto il minimo di lega — bug reale trovato da un test di
 * robustità al cambio Setup (§7 Session 8): con `minPrice` diverso dal default 1, il banner "Tuo
 * garantito a {minPrice} credito" e il numero "OFFRI FINO A" mostrato accanto potevano disaccordare
 * (quest'ultimo restava fisso a 1). Con `minPrice = 1` (l'unico valore usato in ogni test/config
 * precedente a questo fix) `max(1, C¹+1) = C¹+1` sempre: nessuna differenza di comportamento.
 */
export function operationalMaxBid(pStar: number, ceiling: CeilingInfo, minPrice: number): number {
  return Math.min(pStar, Math.max(minPrice, ceiling.c1 + 1), ceiling.myMax);
}

/** Prezzo atteso in prima approssimazione (§6.4): fissato dal secondo offerente, non dal primo. */
export function expectedPriceFromCeiling(pHat: number, ceiling: CeilingInfo): number {
  return Math.min(pHat, ceiling.c2 + 1);
}

/** §11 "Pool giocatori" — "chi può permetterselo": manager con slot liberi in `role` il cui tetto
 * (aritmetica esatta, non una stima) copre almeno `price`, ordinati dal più ricco. */
export function managersWhoCanAfford(
  managers: readonly ManagerState[],
  role: Role,
  price: number,
): ManagerState[] {
  return managers
    .filter((m) => m.slotsRemaining[role] > 0 && maxSingleBid(m) >= price)
    .sort((a, b) => maxSingleBid(b) - maxSingleBid(a));
}

/** §11 "Fantallenatori" — per ogni manager (esclusi "me"), quali dei tuoi obiettivi (★, ancora nel
 * pool) può ancora permettersi: stessa aritmetica esatta di `managersWhoCanAfford`, aggregata sulla
 * lista di obiettivi invece che su un singolo prezzo. */
export function threatsByManager(
  managers: readonly ManagerState[],
  targets: readonly Player[],
  expectedPrice: (playerId: string) => number,
  myManagerId: string | null,
): ReadonlyMap<string, Player[]> {
  const out = new Map<string, Player[]>();
  for (const target of targets) {
    const price = expectedPrice(target.id);
    for (const m of managersWhoCanAfford(managers, target.role, price)) {
      if (m.manager.id === myManagerId) continue;
      const list = out.get(m.manager.id);
      if (list) list.push(target);
      else out.set(m.manager.id, [target]);
    }
  }
  return out;
}

export interface RolePressure {
  readonly role: Role;
  readonly mySlots: number;
  readonly poolRemaining: number;
  readonly othersSlots: number;
}

/** §11 "Fantallenatori" — ruoli in cui `manager` ha ancora slot aperti e c'è scarsità di pool.
 * La pressione si verifica quando il pool residuo è limitato rispetto alla domanda totale:
 * si segnala quando poolRemaining <= 1.5 * (mySlots + othersSlots), cioè quando inizia a scarseggiare.
 * Questo dà un avviso preventivo prima che diventi critico. */
export function scarceRolesFor(
  managers: readonly ManagerState[],
  pool: readonly Player[],
  managerId: string,
): RolePressure[] {
  const manager = managers.find((m) => m.manager.id === managerId);
  if (!manager) return [];
  return ROLES.map((role) => {
    const mySlots = manager.slotsRemaining[role];
    const poolRemaining = pool.filter((p) => p.role === role).length;
    const othersSlots = managers
      .filter((m) => m.manager.id !== managerId)
      .reduce((sum, m) => sum + m.slotsRemaining[role], 0);
    return { role, mySlots, poolRemaining, othersSlots };
  }).filter((p) => p.mySlots > 0 && p.poolRemaining > 0 && p.poolRemaining <= Math.ceil(1.5 * (p.mySlots + p.othersSlots)));
}
