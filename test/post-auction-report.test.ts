// Report post-asta: rigioca il log reale e confronta ogni vendita con la decisione del motore
// nell'istante immediatamente precedente. Qui si verifica la LOGICA di rilevamento (acquisti miei,
// sovrapprezzo, occasioni mancate, risoluzione degli undo), non la plausibilità economica dei
// prezzi di test (alcuni sono scelti apposta per forzare i casi da verificare).
import { describe, expect, it } from 'vitest';
import { buildPostAuctionReport } from '../src/sim/post-auction-report.js';
import { reduce } from '../src/core/state.js';
import { makeDefaultLeagueConfig } from '../src/core/config.js';
import type { AuctionEvent, Player } from '../src/core/types.js';

const league = makeDefaultLeagueConfig();

function buildPool(n: number, role: 'P' | 'D' | 'C' | 'A'): Player[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${role}${i}`,
    name: `${role}${i}`,
    team: `team-${i % 10}`,
    role,
  }));
}

function baseLog(): AuctionEvent[] {
  const pools: [number, 'P' | 'D' | 'C' | 'A'][] = [
    [60, 'P'],
    [180, 'D'],
    [190, 'C'],
    [110, 'A'],
  ];
  const players = pools.flatMap(([n, role]) => buildPool(n, role));
  // Score decrescente per INDICE DI RUOLO (non indice globale): così "P0"/"C0"/... sono sempre i
  // migliori del proprio ruolo, in modo deterministico e leggibile nei test.
  const scoreEvents: AuctionEvent[] = pools.flatMap(([n]) =>
    Array.from({ length: n }, (_, i) => Math.max(5, 95 - i * 0.5)),
  ).map((score, globalIndex) => ({
    t: 'player.score' as const,
    playerId: players[globalIndex]!.id,
    score,
  }));
  return [{ t: 'league.setup', config: league }, { t: 'players.load', players }, ...scoreEvents];
}

describe('buildPostAuctionReport', () => {
  it('ritorna null se la lega non è configurata', () => {
    expect(buildPostAuctionReport(reduce([]))).toBeNull();
  });

  it('classifica correttamente acquisti miei, sovrapprezzo e occasioni mancate, rispettando gli undo', () => {
    const log: AuctionEvent[] = [
      ...baseLog(),
      // Io compro il miglior portiere al prezzo minimo: qualunque sia il tetto calcolato dal
      // motore, pagare il minimo non può mai risultare sovrapprezzo.
      { t: 'sale', playerId: 'P0', managerId: 'me', price: league.minPrice },
      // Un avversario si aggiudica un centrocampista fortissimo (score alto) per 1 credito: secondo
      // il mio modello, con budget quasi intatto, avrei potuto permettermelo — occasione mancata.
      { t: 'sale', playerId: 'C0', managerId: 'm2', price: 1 },
      // Io pago una cifra spropositata per un difensore scarso: deve risultare sovrapprezzo.
      { t: 'sale', playerId: 'D170', managerId: 'me', price: 120 },
      // Una vendita che viene poi annullata non deve comparire nel report.
      { t: 'sale', playerId: 'A0', managerId: 'me', price: 5 },
      { t: 'undo' },
    ];
    const state = reduce(log);
    const report = buildPostAuctionReport(state);

    expect(report).not.toBeNull();
    // 2 eventi in meno del log grezzo: la vendita annullata e l'`undo` stesso non contano come
    // "successi davvero" una volta risolti gli undo.
    expect(report!.eventsAnalyzed).toBe(log.length - 2);

    const boughtIds = report!.myPurchases.map((p) => p.playerId);
    expect(boughtIds).toContain('P0');
    expect(boughtIds).toContain('D170');
    expect(boughtIds).not.toContain('A0'); // annullato, non deve comparire

    expect(report!.totalSpent).toBe(league.minPrice + 120);

    const overpriced = report!.myPurchases.find((p) => p.playerId === 'D170')!;
    expect(overpriced.overpaidBy).toBeGreaterThan(0);
    expect(report!.overpayCount).toBeGreaterThanOrEqual(1);
    expect(report!.totalOverpaidCredits).toBeGreaterThan(0);

    const cheap = report!.myPurchases.find((p) => p.playerId === 'P0')!;
    expect(cheap.overpaidBy).toBe(0);

    expect(report!.missedOpportunities.some((m) => m.playerId === 'C0')).toBe(true);

    expect(report!.finalRosterValue).toBeGreaterThan(0);
  });
});
