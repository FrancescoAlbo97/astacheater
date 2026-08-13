// §7 — Stato ed event sourcing. Lo stato dell'asta è un log append-only di eventi; ogni stato
// derivato è una funzione pura del log. L'undo rigenera lo stato dal log troncato — NON applica
// mutazioni inverse (§13.6): si risolvono prima gli 'undo' (ognuno cancella l'ultimo evento
// applicato non ancora cancellato), poi si applica in ordine solo la sequenza sopravvissuta.

import { ROLES } from './types.js';
import type {
  AuctionEvent,
  AuctionState,
  LeagueConfig,
  ManagerState,
  ManualOverride,
  Player,
  Role,
  RosterEntry,
  SlotCounts,
} from './types.js';

export const initialAuctionState: AuctionState = {
  config: null,
  players: {},
  scores: {},
  sales: [],
  unsold: [],
  overrides: {},
  notes: [],
  log: [],
};

/** Risolve gli 'undo': ognuno cancella l'ultimo evento applicato non ancora cancellato. Esportata
 * perché chi deve rigiocare il log un evento alla volta (es. il report post-asta) ha bisogno della
 * sequenza EFFETTIVA definitiva, non di scoprire a posteriori che un evento già processato verrà
 * cancellato da un `undo` più avanti nel log grezzo. */
export function resolveUndos(log: readonly AuctionEvent[]): AuctionEvent[] {
  const effective: AuctionEvent[] = [];
  for (const event of log) {
    if (event.t === 'undo') {
      effective.pop();
    } else {
      effective.push(event);
    }
  }
  return effective;
}

function applyEvent(state: AuctionState, event: AuctionEvent): AuctionState {
  switch (event.t) {
    case 'league.setup':
      return { ...state, config: event.config };

    case 'players.load': {
      const players = { ...state.players };
      for (const p of event.players) players[p.id] = p;
      return { ...state, players };
    }

    case 'player.score': {
      return {
        ...state,
        scores: {
          ...state.scores,
          [event.playerId]: { score: event.score, ptOverride: event.ptOverride ?? null },
        },
      };
    }

    case 'sale':
      return {
        ...state,
        sales: [...state.sales, { playerId: event.playerId, managerId: event.managerId, price: event.price }],
      };

    case 'unsold':
      return { ...state, unsold: [...state.unsold, event.playerId] };

    case 'manual.override': {
      const override: ManualOverride = { maxBid: event.maxBid, note: event.note ?? null };
      return { ...state, overrides: { ...state.overrides, [event.playerId]: override } };
    }

    case 'note':
      return { ...state, notes: [...state.notes, event.text] };

    case 'undo':
      // Non dovrebbe mai arrivare qui: resolveUndos() filtra gli 'undo' prima del fold.
      return state;
  }
}

/** reduce(log) → AuctionState: pura e deterministica (§7). */
export function reduce(log: readonly AuctionEvent[]): AuctionState {
  const effective = resolveUndos(log);
  let state = initialAuctionState;
  for (const event of effective) {
    state = applyEvent(state, event);
  }
  return { ...state, log };
}

export function appendEvent(log: readonly AuctionEvent[], event: AuctionEvent): AuctionEvent[] {
  return [...log, event];
}

/** Vero se c'è qualcosa da annullare (almeno un evento sopravvive dopo aver risolto gli undo). */
export function canUndo(log: readonly AuctionEvent[]): boolean {
  return resolveUndos(log).length > 0;
}

// ---------------------------------------------------------------------------
// Selettori derivati (§6.4, §6.5): stato dei manager, pool residuo.
// ---------------------------------------------------------------------------

function emptySlotCounts(): SlotCounts {
  return { P: 0, D: 0, C: 0, A: 0 };
}

/** Stato di ciascun manager (crediti/slot residui, rosa) derivato dal log delle vendite. */
export function deriveManagerStates(state: AuctionState): ManagerState[] {
  if (!state.config) return [];
  const { config } = state;

  return config.managers.map((manager): ManagerState => {
    const mySales = state.sales.filter((s) => s.managerId === manager.id);
    const roster: RosterEntry[] = mySales
      .map((s) => {
        const player = state.players[s.playerId];
        if (!player) return null;
        return { player, price: s.price };
      })
      .filter((r): r is RosterEntry => r !== null);

    const spent = mySales.reduce((sum, s) => sum + s.price, 0);
    const slotsUsed = emptySlotCounts();
    for (const entry of roster) slotsUsed[entry.player.role]++;

    const slotsRemaining = emptySlotCounts();
    for (const role of ROLES) slotsRemaining[role] = Math.max(0, config.slots[role] - slotsUsed[role]);

    return {
      manager,
      creditsRemaining: config.budget - spent,
      slotsRemaining,
      roster,
    };
  });
}

/** Giocatori del listone non ancora venduti né dichiarati non venduti. */
export function getPool(state: AuctionState): Player[] {
  const decided = new Set<string>([...state.sales.map((s) => s.playerId), ...state.unsold]);
  return Object.values(state.players).filter((p) => !decided.has(p.id));
}

export function getScoredPlayers(
  state: AuctionState,
): { player: Player; score: number | null; ptOverride: number | null }[] {
  return Object.values(state.players).map((player) => {
    const scoreEntry = state.scores[player.id];
    return { player, score: scoreEntry?.score ?? null, ptOverride: scoreEntry?.ptOverride ?? null };
  });
}

export function findManagerById(state: AuctionState, managerId: string): ManagerState | undefined {
  return deriveManagerStates(state).find((m) => m.manager.id === managerId);
}

export function getMyManagerId(config: LeagueConfig | null): string | null {
  return config?.managers.find((m) => m.isMe)?.id ?? null;
}
