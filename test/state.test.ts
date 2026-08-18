// §7 / §12 F11 — Event sourcing. DoD: undo funzionante a qualunque profondità; export/import
// (serializzazione JSON del log) ripristina lo stato identico; reduce() pura e deterministica.
import { describe, expect, it } from 'vitest';
import {
  appendEvent,
  canUndo,
  deriveManagerStates,
  getPool,
  initialAuctionState,
  reduce,
} from '../src/core/state.js';
import { makeDefaultLeagueConfig } from '../src/core/config.js';
import type { AuctionEvent, Player } from '../src/core/types.js';

const league = makeDefaultLeagueConfig();
const players: Player[] = [
  { id: 'p1', name: 'Player One', team: 'Team A', role: 'A' },
  { id: 'p2', name: 'Player Two', team: 'Team B', role: 'D' },
  { id: 'p3', name: 'Player Three', team: 'Team C', role: 'C' },
];

function buildLog(events: AuctionEvent[]): AuctionEvent[] {
  let log: AuctionEvent[] = [];
  for (const e of events) log = appendEvent(log, e);
  return log;
}

describe('§7 reduce — purezza e determinismo', () => {
  it('log vuoto ⇒ stato iniziale', () => {
    expect(reduce([])).toEqual({ ...initialAuctionState, log: [] });
  });

  it('stesso log ⇒ stesso stato (nessuna mutazione nascosta)', () => {
    const log = buildLog([
      { t: 'league.setup', config: league },
      { t: 'players.load', players },
      { t: 'player.score', playerId: 'p1', score: 90 },
      { t: 'sale', playerId: 'p1', managerId: 'me', price: 42 },
    ]);
    const a = reduce(log);
    const b = reduce(log);
    expect(a).toEqual(b);
  });

  it('applica gli eventi nell\'ordine corretto', () => {
    const log = buildLog([
      { t: 'league.setup', config: league },
      { t: 'players.load', players },
      { t: 'sale', playerId: 'p1', managerId: 'me', price: 10 },
      { t: 'sale', playerId: 'p2', managerId: 'm2', price: 5 },
      { t: 'unsold', playerId: 'p3' },
    ]);
    const state = reduce(log);
    expect(state.sales).toEqual([
      { playerId: 'p1', managerId: 'me', price: 10 },
      { playerId: 'p2', managerId: 'm2', price: 5 },
    ]);
    expect(state.unsold).toEqual(['p3']);
  });
});

describe('§13.6 / F11 undo — nessuna mutazione inversa, funziona a qualunque profondità', () => {
  it('un singolo undo annulla l\'ultimo evento', () => {
    const log = buildLog([
      { t: 'league.setup', config: league },
      { t: 'players.load', players },
      { t: 'sale', playerId: 'p1', managerId: 'me', price: 10 },
      { t: 'undo' },
    ]);
    const state = reduce(log);
    expect(state.sales).toEqual([]);
  });

  it('più undo consecutivi annullano più eventi, in ordine inverso', () => {
    const log = buildLog([
      { t: 'league.setup', config: league },
      { t: 'players.load', players },
      { t: 'sale', playerId: 'p1', managerId: 'me', price: 10 },
      { t: 'sale', playerId: 'p2', managerId: 'm2', price: 5 },
      { t: 'unsold', playerId: 'p3' },
      { t: 'undo' },
      { t: 'undo' },
    ]);
    const state = reduce(log);
    expect(state.sales).toEqual([{ playerId: 'p1', managerId: 'me', price: 10 }]);
    expect(state.unsold).toEqual([]);
  });

  it('undo fino a svuotare completamente la cronologia riporta allo stato iniziale', () => {
    const events: AuctionEvent[] = [
      { t: 'league.setup', config: league },
      { t: 'players.load', players },
      { t: 'sale', playerId: 'p1', managerId: 'me', price: 10 },
    ];
    const log = buildLog([...events, { t: 'undo' }, { t: 'undo' }, { t: 'undo' }]);
    const state = reduce(log);
    expect(state.config).toBeNull();
    expect(Object.keys(state.players)).toHaveLength(0);
    expect(canUndo(log)).toBe(false);
  });

  it('undo oltre l\'inizio della cronologia non genera errori (resta allo stato iniziale)', () => {
    const log = buildLog([{ t: 'undo' }, { t: 'undo' }, { t: 'league.setup', config: league }, { t: 'undo' }]);
    expect(() => reduce(log)).not.toThrow();
    expect(reduce(log).config).toBeNull();
  });

  it('undo seguito da nuovi eventi riparte correttamente dal punto troncato', () => {
    const log = buildLog([
      { t: 'league.setup', config: league },
      { t: 'players.load', players },
      { t: 'sale', playerId: 'p1', managerId: 'me', price: 10 },
      { t: 'undo' },
      { t: 'sale', playerId: 'p1', managerId: 'm2', price: 99 },
    ]);
    const state = reduce(log);
    expect(state.sales).toEqual([{ playerId: 'p1', managerId: 'm2', price: 99 }]);
  });

  it('canUndo riflette correttamente la disponibilità di storia da annullare', () => {
    expect(canUndo([])).toBe(false);
    expect(canUndo(buildLog([{ t: 'note', text: 'ciao' }]))).toBe(true);
    expect(canUndo(buildLog([{ t: 'note', text: 'ciao' }, { t: 'undo' }]))).toBe(false);
  });
});

describe('§7 export/import — round-trip JSON del log', () => {
  it('serializzare e deserializzare il log ripristina uno stato identico', () => {
    const log = buildLog([
      { t: 'league.setup', config: league },
      { t: 'players.load', players },
      { t: 'player.score', playerId: 'p1', score: 88, ptOverride: 0.7 },
      { t: 'sale', playerId: 'p1', managerId: 'me', price: 55 },
      { t: 'manual.override', playerId: 'p2', maxBid: 30, note: 'occasione' },
      { t: 'note', text: 'asta iniziata' },
    ]);
    const original = reduce(log);
    const roundTripped = reduce(JSON.parse(JSON.stringify(log)));
    expect(roundTripped).toEqual(original);
  });
});

describe('§6.4/§6.5 selettori derivati', () => {
  it('deriveManagerStates calcola correttamente crediti e slot residui', () => {
    const log = buildLog([
      { t: 'league.setup', config: league },
      { t: 'players.load', players },
      { t: 'sale', playerId: 'p1', managerId: 'me', price: 50 }, // ruolo A
    ]);
    const state = reduce(log);
    const managers = deriveManagerStates(state);
    const me = managers.find((m) => m.manager.id === 'me')!;
    expect(me.creditsRemaining).toBe(league.budget - 50);
    expect(me.slotsRemaining.A).toBe(league.slots.A - 1);
    expect(me.slotsRemaining.D).toBe(league.slots.D);
    expect(me.roster).toEqual([{ player: players[0], price: 50 }]);
  });

  it('getPool esclude venduti e non venduti', () => {
    const log = buildLog([
      { t: 'league.setup', config: league },
      { t: 'players.load', players },
      { t: 'sale', playerId: 'p1', managerId: 'me', price: 10 },
      { t: 'unsold', playerId: 'p2' },
    ]);
    const pool = getPool(reduce(log));
    expect(pool.map((p) => p.id)).toEqual(['p3']);
  });
});

describe('§11 Banco d\'asta / Pool giocatori — revert, obiettivi, ordine slot', () => {
  it('revert rimette in pool un giocatore venduto', () => {
    const log = buildLog([
      { t: 'league.setup', config: league },
      { t: 'players.load', players },
      { t: 'sale', playerId: 'p1', managerId: 'me', price: 10 },
      { t: 'revert', playerId: 'p1' },
    ]);
    const state = reduce(log);
    expect(state.sales).toEqual([]);
    expect(getPool(state).map((p) => p.id)).toContain('p1');
  });

  it('revert rimette in pool un giocatore segnato non acquistato ("riproponi")', () => {
    const log = buildLog([
      { t: 'league.setup', config: league },
      { t: 'players.load', players },
      { t: 'unsold', playerId: 'p2' },
      { t: 'revert', playerId: 'p2' },
    ]);
    const state = reduce(log);
    expect(state.unsold).toEqual([]);
    expect(getPool(state).map((p) => p.id)).toContain('p2');
  });

  it('revert su un giocatore mai deciso non ha effetto (idempotente)', () => {
    const log = buildLog([
      { t: 'league.setup', config: league },
      { t: 'players.load', players },
      { t: 'revert', playerId: 'p1' },
    ]);
    expect(() => reduce(log)).not.toThrow();
    expect(getPool(reduce(log)).map((p) => p.id)).toContain('p1');
  });

  it('una correzione si fa con revert + una nuova sale, non con un evento dedicato', () => {
    const log = buildLog([
      { t: 'league.setup', config: league },
      { t: 'players.load', players },
      { t: 'sale', playerId: 'p1', managerId: 'me', price: 10 },
      { t: 'revert', playerId: 'p1' },
      { t: 'sale', playerId: 'p1', managerId: 'm2', price: 25 },
    ]);
    const state = reduce(log);
    expect(state.sales).toEqual([{ playerId: 'p1', managerId: 'm2', price: 25 }]);
  });

  it('player.target aggiunge e rimuove un obiettivo personale', () => {
    const log = buildLog([
      { t: 'league.setup', config: league },
      { t: 'players.load', players },
      { t: 'player.target', playerId: 'p1', isTarget: true },
    ]);
    expect(reduce(log).targets).toEqual({ p1: true });

    const untargeted = buildLog([...log, { t: 'player.target', playerId: 'p1', isTarget: false }]);
    expect(reduce(untargeted).targets).toEqual({});
  });

  it('roster.slot sostituisce sempre l\'intero ordine per quel manager+ruolo', () => {
    const log = buildLog([
      { t: 'league.setup', config: league },
      { t: 'players.load', players },
      { t: 'roster.slot', managerId: 'me', role: 'D', order: ['p2', 'p9'] },
    ]);
    expect(reduce(log).slotOrder['me:D']).toEqual(['p2', 'p9']);

    const replaced = buildLog([...log, { t: 'roster.slot', managerId: 'me', role: 'D', order: ['p9'] }]);
    expect(reduce(replaced).slotOrder['me:D']).toEqual(['p9']);
  });
});
