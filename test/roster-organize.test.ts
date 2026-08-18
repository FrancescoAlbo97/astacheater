// §11 "La mia rosa" — ordine manuale degli slot e split titolari/panchina per formazione.
import { describe, expect, it } from 'vitest';
import { appendEvent, reduce } from '../src/core/state.js';
import { makeDefaultLeagueConfig } from '../src/core/config.js';
import {
  findHierarchyWarning,
  getFormationSplit,
  getRosterOrder,
  reorderWithInsertion,
  startersCountFor,
} from '../src/core/roster-organize.js';
import type { AuctionEvent, Player } from '../src/core/types.js';

const league = makeDefaultLeagueConfig();
const defenders: Player[] = [
  { id: 'd1', name: 'Difensore Uno', team: 'A', role: 'D' },
  { id: 'd2', name: 'Difensore Due', team: 'B', role: 'D' },
  { id: 'd3', name: 'Difensore Tre', team: 'C', role: 'D' },
];

function buildLog(events: AuctionEvent[]): AuctionEvent[] {
  let log: AuctionEvent[] = [];
  for (const e of events) log = appendEvent(log, e);
  return log;
}

describe('getRosterOrder', () => {
  it('senza un ordine esplicito, usa l\'ordine d\'acquisto', () => {
    const state = reduce(
      buildLog([
        { t: 'league.setup', config: league },
        { t: 'players.load', players: defenders },
        { t: 'sale', playerId: 'd2', managerId: 'me', price: 5 },
        { t: 'sale', playerId: 'd1', managerId: 'me', price: 8 },
      ]),
    );
    expect(getRosterOrder(state, 'me', 'D').map((r) => r.player.id)).toEqual(['d2', 'd1']);
  });

  it('con un ordine esplicito, lo rispetta e mette in coda i non ordinati', () => {
    const state = reduce(
      buildLog([
        { t: 'league.setup', config: league },
        { t: 'players.load', players: defenders },
        { t: 'sale', playerId: 'd1', managerId: 'me', price: 5 },
        { t: 'sale', playerId: 'd2', managerId: 'me', price: 8 },
        { t: 'roster.slot', managerId: 'me', role: 'D', order: ['d2', 'd1'] },
        { t: 'sale', playerId: 'd3', managerId: 'me', price: 3 }, // comprato DOPO il riordino
      ]),
    );
    expect(getRosterOrder(state, 'me', 'D').map((r) => r.player.id)).toEqual(['d2', 'd1', 'd3']);
  });

  it('un giocatore rivenduto (revert) sparisce dall\'ordine anche se era stato ordinato esplicitamente', () => {
    const state = reduce(
      buildLog([
        { t: 'league.setup', config: league },
        { t: 'players.load', players: defenders },
        { t: 'sale', playerId: 'd1', managerId: 'me', price: 5 },
        { t: 'roster.slot', managerId: 'me', role: 'D', order: ['d1'] },
        { t: 'revert', playerId: 'd1' },
      ]),
    );
    expect(getRosterOrder(state, 'me', 'D')).toEqual([]);
  });
});

describe('getFormationSplit / startersCountFor', () => {
  it('il portiere ha sempre 1 titolare, indipendentemente dalla formazione', () => {
    expect(startersCountFor('P', '3-4-3')).toBe(1);
    expect(startersCountFor('P', '5-4-1')).toBe(1);
  });

  it('divide titolari e panchina secondo la formazione scelta', () => {
    const state = reduce(
      buildLog([
        { t: 'league.setup', config: league },
        { t: 'players.load', players: defenders },
        { t: 'sale', playerId: 'd1', managerId: 'me', price: 5 },
        { t: 'sale', playerId: 'd2', managerId: 'me', price: 5 },
        { t: 'sale', playerId: 'd3', managerId: 'me', price: 5 },
      ]),
    );
    // 3-4-3 → 3 difensori titolari: tutti e 3 titolari, panchina vuota.
    const split343 = getFormationSplit(state, 'me', '3-4-3');
    expect(split343.D.titolari).toHaveLength(3);
    expect(split343.D.panchina).toHaveLength(0);

    // 5-3-2 → 5 difensori titolari, ma ne abbiamo solo 3: comunque tutti titolari.
    const split532 = getFormationSplit(state, 'me', '5-3-2');
    expect(split532.D.titolari).toHaveLength(3);

    expect(split343.D.freeSlots).toBe(league.slots.D - 3);
  });
});

describe('findHierarchyWarning', () => {
  it('segnala quando un panchinaro ha score più alto di un titolare', () => {
    const state = reduce(
      buildLog([
        { t: 'league.setup', config: league },
        { t: 'players.load', players: defenders },
        { t: 'sale', playerId: 'd1', managerId: 'me', price: 5 },
        { t: 'sale', playerId: 'd2', managerId: 'me', price: 5 },
        { t: 'player.score', playerId: 'd1', score: 60 },
        { t: 'player.score', playerId: 'd2', score: 80 },
      ]),
    );
    // Nessuna formazione reale ha solo 1 titolare D: costruiamo lo split a mano per forzare d2 in
    // panchina (equivalente a startersCount=1) e isolare la sola logica di findHierarchyWarning.
    const slots = {
      role: 'D' as const,
      titolari: [{ player: state.players['d1']!, price: 5 }],
      panchina: [{ player: state.players['d2']!, price: 5 }],
      startersCount: 1,
      totalSlots: league.slots.D,
      freeSlots: league.slots.D - 2,
    };
    const warning = findHierarchyWarning(state, slots);
    expect(warning?.benched.player.id).toBe('d2');
    expect(warning?.starter.player.id).toBe('d1');
  });

  it('nessun avviso se la gerarchia è già corretta', () => {
    const state = reduce(
      buildLog([
        { t: 'league.setup', config: league },
        { t: 'players.load', players: defenders },
        { t: 'sale', playerId: 'd1', managerId: 'me', price: 5 },
        { t: 'sale', playerId: 'd2', managerId: 'me', price: 5 },
        { t: 'player.score', playerId: 'd1', score: 80 },
        { t: 'player.score', playerId: 'd2', score: 60 },
      ]),
    );
    const slots = { role: 'D' as const, titolari: [{ player: state.players['d1']!, price: 5 }], panchina: [{ player: state.players['d2']!, price: 5 }], startersCount: 1, totalSlots: league.slots.D, freeSlots: league.slots.D - 2 };
    expect(findHierarchyWarning(state, slots)).toBeNull();
  });
});

describe('reorderWithInsertion', () => {
  it('inserisce un nuovo elemento alla posizione richiesta', () => {
    expect(reorderWithInsertion(['a', 'b', 'c'], 'x', 1)).toEqual(['a', 'x', 'b', 'c']);
  });

  it('sposta un elemento già presente invece di duplicarlo', () => {
    expect(reorderWithInsertion(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b']);
  });

  it('limita l\'indice ai confini dell\'array', () => {
    expect(reorderWithInsertion(['a', 'b'], 'x', 99)).toEqual(['a', 'b', 'x']);
    expect(reorderWithInsertion(['a', 'b'], 'x', -5)).toEqual(['x', 'a', 'b']);
  });
});
