// §11 / §12 F11 DoD — "partita simulata completa di 250 estrazioni inserita a mano senza errori
// di stato; undo funzionante a qualunque profondità; export/import ripristina lo stato identico".
// Simula un'intera asta REALE inserita evento per evento (come farebbe l'utente dalla UI),
// usando auction-sim.ts solo per generare una sequenza di decisioni plausibile, ma passando
// ESCLUSIVAMENTE dal reducer puro (stesso percorso della UI) per validare che lo stato regga
// fino in fondo senza crash né incoerenze.
import { describe, expect, it } from 'vitest';
import { reduce, appendEvent, deriveManagerStates, getPool, canUndo } from '../src/core/state.js';
import { runAuctionSim } from '../src/sim/auction-sim.js';
import {
  DEFAULT_PRICE_MODEL_CONFIG,
  DEFAULT_ROLLOUT_CONFIG,
  DEFAULT_SLOT_WEIGHTS,
  DEFAULT_VALUE_CURVES,
  makeDefaultLeagueConfig,
} from '../src/core/config.js';
import { ROLES } from '../src/core/types.js';
import type { ArchetypeId } from '../src/sim/archetypes.js';
import type { AuctionEvent, Player } from '../src/core/types.js';

const league = makeDefaultLeagueConfig();

const MIX: ArchetypeId[] = [
  'rational',
  'earlyEnthusiast',
  'latePanicker',
  'fanboy',
  'roleCapper',
  'anchored',
  'budgetSplitter',
  'earlyEnthusiast',
  'latePanicker',
  'fanboy',
];

function simulateRealAuctionEvents(seed: number): { players: Player[]; events: AuctionEvent[] } {
  const result = runAuctionSim({
    league,
    seed,
    rho: 0.8,
    archetypesByManager: MIX,
    priceModelConfig: DEFAULT_PRICE_MODEL_CONFIG,
    valueCurves: DEFAULT_VALUE_CURVES,
    slotWeights: DEFAULT_SLOT_WEIGHTS,
    priceNoiseSigma: DEFAULT_ROLLOUT_CONFIG.priceNoiseSigma,
    dualsRecalcEveryDraws: DEFAULT_ROLLOUT_CONFIG.dualsRecalcEveryDraws,
    dualsRecalcOnBudgetDropFraction: DEFAULT_ROLLOUT_CONFIG.dualsRecalcOnBudgetDropFraction,
  });

  const players: Player[] = result.scenario.players.map((p) => ({ id: p.id, name: p.id, team: p.team, role: p.role }));
  const scoreEvents: AuctionEvent[] = players.map((p) => ({
    t: 'player.score',
    playerId: p.id,
    score: result.scenario.scoresByManager[0]!.get(p.id) ?? 50,
  }));

  // Interleave nell'ordine di estrazione reale (drawIndex), come farebbe l'utente dal vivo:
  // ogni giocatore genera o un evento 'sale' o un evento 'unsold'.
  const byDrawIndex = new Map<number, AuctionEvent>();
  for (const s of result.sales) byDrawIndex.set(s.drawIndex, { t: 'sale', playerId: s.playerId, managerId: s.managerId, price: s.price });
  // gli 'unsold' non hanno drawIndex nel tipo SaleRecord: li accodiamo alla fine (equivalente ai
  // fini della copertura di stato, dato che reduce() non dipende dall'ordine relativo fra sale e
  // unsold di giocatori DIVERSI, solo dall'ordine interno di ciascun tipo).
  const saleEvents = [...byDrawIndex.entries()].sort((a, b) => a[0] - b[0]).map(([, e]) => e);
  const unsoldEvents: AuctionEvent[] = result.unsold.map((playerId) => ({ t: 'unsold', playerId }));

  const events: AuctionEvent[] = [
    { t: 'league.setup', config: league },
    { t: 'players.load', players },
    ...scoreEvents,
    ...saleEvents,
    ...unsoldEvents,
  ];

  return { players, events };
}

describe('§11 F11 DoD — asta completa inserita a mano, nessun errore di stato', () => {
  it('250 slot totali risultano riempiti dopo aver applicato tutti gli eventi', () => {
    const { events } = simulateRealAuctionEvents(1);
    let log: AuctionEvent[] = [];
    for (const e of events) log = appendEvent(log, e);

    expect(() => reduce(log)).not.toThrow();
    const state = reduce(log);
    const managers = deriveManagerStates(state);

    let totalFilled = 0;
    for (const m of managers) {
      for (const role of ROLES) {
        totalFilled += league.slots[role] - m.slotsRemaining[role];
      }
    }
    expect(totalFilled).toBe(250);

    for (const m of managers) {
      expect(m.creditsRemaining).toBeGreaterThanOrEqual(0);
    }
  });

  it('il pool si svuota esattamente (venduti + non venduti = giocatori totali)', () => {
    const { players, events } = simulateRealAuctionEvents(2);
    let log: AuctionEvent[] = [];
    for (const e of events) log = appendEvent(log, e);
    const state = reduce(log);
    expect(getPool(state)).toHaveLength(0);
    expect(state.sales.length + state.unsold.length).toBe(players.length);
  });

  it('undo funziona a qualunque profondità anche su un log di questa scala', () => {
    const { events } = simulateRealAuctionEvents(3);
    let log: AuctionEvent[] = [];
    for (const e of events) log = appendEvent(log, e);

    // annulla gli ultimi 50 eventi, uno alla volta, verificando che non esploda mai
    for (let i = 0; i < 50; i++) {
      log = appendEvent(log, { t: 'undo' });
    }
    expect(() => reduce(log)).not.toThrow();

    // annulla fino a svuotare tutto
    while (canUndo(log)) log = appendEvent(log, { t: 'undo' });
    const emptied = reduce(log);
    expect(emptied.config).toBeNull();
    expect(Object.keys(emptied.players)).toHaveLength(0);
  });

  it('export (JSON) e reimport ripristinano uno stato identico su un log a scala reale', () => {
    const { events } = simulateRealAuctionEvents(4);
    let log: AuctionEvent[] = [];
    for (const e of events) log = appendEvent(log, e);

    const original = reduce(log);
    const exported = JSON.stringify({ version: 1, log });
    const parsed = JSON.parse(exported);
    const reimported = reduce(parsed.log);

    expect(reimported).toEqual(original);
  });

  it('è deterministico: stesso log applicato due volte dà lo stesso stato', () => {
    const { events } = simulateRealAuctionEvents(5);
    let log: AuctionEvent[] = [];
    for (const e of events) log = appendEvent(log, e);
    expect(reduce(log)).toEqual(reduce(log));
  });
});
