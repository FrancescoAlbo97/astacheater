// §11 "La mia rosa" / "Fantallenatori" — organizzazione manuale degli slot: LO SLOT È LA POSIZIONE
// CHE L'UTENTE DECIDE, non l'ordine in cui ha comprato il giocatore né un ordinamento automatico
// per punteggio. Qui si limita a: calcolare l'ordine effettivo (esplicito se impostato, altrimenti
// ordine d'acquisto) e a separare titolari/panchina dentro un ruolo dato il numero di titolari
// previsto dalla formazione. Non decide MAI da solo: segnala solo quando la gerarchia non torna
// con i punteggi (vedi `findHierarchyWarning`), lasciando la scelta finale all'utente.
import { startersCountFor } from './config.js';
import { deriveManagerStates, slotOrderKey } from './state.js';
import { ROLES } from './types.js';
import type { AuctionState, Formation, Role, RosterEntry } from './types.js';

export { startersCountFor };

/** Ordine effettivo dei giocatori di `managerId` nel ruolo `role`: quello impostato esplicitamente
 * (§7, evento `roster.slot`), filtrato ai soli giocatori ANCORA posseduti e con in coda, in ordine
 * d'acquisto, chi è stato comprato ma non è mai stato inserito in un ordine esplicito — questo fa
 * sì che un acquisto nuovo compaia sempre, anche se il manager non ha mai riordinato quel ruolo. */
export function getRosterOrder(state: AuctionState, managerId: string, role: Role): RosterEntry[] {
  const manager = deriveManagerStates(state).find((m) => m.manager.id === managerId);
  if (!manager) return [];
  const owned = manager.roster.filter((r) => r.player.role === role);
  const byId = new Map(owned.map((r) => [r.player.id, r]));

  const explicit = state.slotOrder[slotOrderKey(managerId, role)] ?? [];
  const ordered: RosterEntry[] = [];
  for (const playerId of explicit) {
    const entry = byId.get(playerId);
    if (entry) {
      ordered.push(entry);
      byId.delete(playerId);
    }
  }
  // Chi resta (mai ordinato esplicitamente, o appena comprato) va in coda, in ordine d'acquisto.
  for (const entry of owned) {
    if (byId.has(entry.player.id)) ordered.push(entry);
  }
  return ordered;
}

export interface RoleSlots {
  readonly role: Role;
  readonly titolari: readonly RosterEntry[];
  readonly panchina: readonly RosterEntry[];
  readonly startersCount: number;
  readonly totalSlots: number;
  readonly freeSlots: number;
}

export function getRoleSlots(state: AuctionState, managerId: string, role: Role, formation: Formation): RoleSlots {
  const ordered = getRosterOrder(state, managerId, role);
  const startersCount = startersCountFor(role, formation);
  const totalSlots = state.config?.slots[role] ?? 0;
  return {
    role,
    titolari: ordered.slice(0, startersCount),
    panchina: ordered.slice(startersCount),
    startersCount,
    totalSlots,
    freeSlots: Math.max(0, totalSlots - ordered.length),
  };
}

export function getFormationSplit(state: AuctionState, managerId: string, formation: Formation): Record<Role, RoleSlots> {
  const out = {} as Record<Role, RoleSlots>;
  for (const role of ROLES) out[role] = getRoleSlots(state, managerId, role, formation);
  return out;
}

/** Segnala una gerarchia sospetta: un panchinaro con score più alto di un titolare nello stesso
 * ruolo (score noto per entrambi). Solo un SUGGERIMENTO — l'ultima parola resta all'utente (§11
 * mockup "La mia rosa": "il programma segnala solo quando la gerarchia non torna con i punteggi"). */
export function findHierarchyWarning(
  state: AuctionState,
  slots: RoleSlots,
): { readonly benched: RosterEntry; readonly starter: RosterEntry } | null {
  const scoreOf = (id: string) => state.scores[id]?.score;
  const worstStarter = slots.titolari
    .map((e) => ({ e, score: scoreOf(e.player.id) }))
    .filter((x): x is { e: RosterEntry; score: number } => x.score !== undefined)
    .sort((a, b) => a.score - b.score)[0];
  if (!worstStarter) return null;
  const bestBenched = slots.panchina
    .map((e) => ({ e, score: scoreOf(e.player.id) }))
    .filter((x): x is { e: RosterEntry; score: number } => x.score !== undefined)
    .sort((a, b) => b.score - a.score)[0];
  if (!bestBenched || bestBenched.score <= worstStarter.score) return null;
  return { benched: bestBenched.e, starter: worstStarter.e };
}

/** Nuovo ordine con `playerId` inserito in posizione `index` (0 = primo slot), per dispatchare un
 * evento `roster.slot`. Se `playerId` è già in `currentOrder` viene prima rimosso, così spostarlo
 * funziona come un unico inserimento invece di lasciarne una copia. */
export function reorderWithInsertion(currentOrder: readonly string[], playerId: string, index: number): string[] {
  const withoutPlayer = currentOrder.filter((id) => id !== playerId);
  const clampedIndex = Math.max(0, Math.min(withoutPlayer.length, index));
  return [...withoutPlayer.slice(0, clampedIndex), playerId, ...withoutPlayer.slice(clampedIndex)];
}
