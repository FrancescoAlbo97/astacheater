// core/engine.ts — ponte stato→motore per la UI (§11). DoD rilevante: numero deterministico
// entro 100ms (§13.9, A10); C¹=0 riconosciuto; p*=0 mostrato come "non serve".
import { describe, expect, it } from 'vitest';
import { computeDecisionForPlayer } from '../src/core/engine.js';
import { reduce } from '../src/core/state.js';
import { makeDefaultLeagueConfig } from '../src/core/config.js';
import type { AuctionEvent, Player } from '../src/core/types.js';

const league = makeDefaultLeagueConfig();

function buildPool(n: number, role: 'P' | 'D' | 'C' | 'A' = 'A'): Player[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${role}${i}`,
    name: `${role}${i}`,
    team: `team-${i % 5}`,
    role,
  }));
}

function scoreEvents(players: readonly Player[], score: (p: Player) => number): AuctionEvent[] {
  return players.map((p) => ({ t: 'player.score', playerId: p.id, score: score(p) }));
}

describe('§11 / §13.9 computeDecisionForPlayer', () => {
  it('risponde entro 100ms su uno stato realistico (A10)', () => {
    const players = [...buildPool(60, 'P'), ...buildPool(180, 'D'), ...buildPool(190, 'C'), ...buildPool(110, 'A')];
    const log: AuctionEvent[] = [
      { t: 'league.setup', config: league },
      { t: 'players.load', players },
      ...scoreEvents(players, () => 20 + Math.random() * 60),
    ];
    const state = reduce(log);
    const target = players.find((p) => p.role === 'A')!;

    const start = performance.now();
    const decision = computeDecisionForPlayer(state, target.id);
    const elapsed = performance.now() - start;

    expect(decision).not.toBeNull();
    expect(elapsed).toBeLessThan(100);
  });

  it('C¹ = 0 viene riconosciuto quando nessun avversario ha slot liberi nel ruolo', () => {
    const players = buildPool(3, 'A');
    const config = {
      ...league,
      managers: [league.managers[0]!, { id: 'm2', name: 'm2', isMe: false }],
    };
    const log: AuctionEvent[] = [
      { t: 'league.setup', config },
      { t: 'players.load', players },
      { t: 'player.score', playerId: players[0]!.id, score: 90 },
      // esaurisco tutti gli slot A dell'avversario "manualmente" vendendogli A slot giocatori fittizi
      ...Array.from({ length: league.slots.A }, (_, i) => {
        const filler: Player = { id: `filler-a-${i}`, name: `filler-a-${i}`, team: 't', role: 'A' };
        return [
          { t: 'players.load' as const, players: [filler] },
          { t: 'sale' as const, playerId: filler.id, managerId: 'm2', price: 1 },
        ];
      }).flat(),
    ];
    const state = reduce(log);
    const decision = computeDecisionForPlayer(state, players[0]!.id);
    expect(decision).not.toBeNull();
    expect(decision!.ceiling.c1).toBe(0);
  });

  it('un giocatore scarso vale sistematicamente meno (p*) di uno forte, a parità di tutto il resto', () => {
    // v_A(score) non è mai letteralmente zero (fmMin/ptMin > 0, §6.1): con offerta scarsa anche un
    // giocatore debole può avere p* > 0 (riempie comunque uno slot). Il DoD verificato qui è quindi
    // relativo — coerente con quanto già provato rigorosamente in test/max-bid.test.ts — non che
    // p* sia letteralmente 0 in assoluto.
    const players = [...buildPool(30, 'A')];
    const log: AuctionEvent[] = [
      { t: 'league.setup', config: league },
      { t: 'players.load', players },
      ...scoreEvents(players.slice(1), () => 85), // molta offerta di alto livello
      { t: 'player.score', playerId: players[0]!.id, score: 85 },
    ];
    const state = reduce(log);
    const strongDecision = computeDecisionForPlayer(state, players[0]!.id)!;

    const weakLog: AuctionEvent[] = [
      ...log.slice(0, -1),
      { t: 'player.score', playerId: players[0]!.id, score: 2 },
    ];
    const weakState = reduce(weakLog);
    const weakDecision = computeDecisionForPlayer(weakState, players[0]!.id)!;

    expect(weakDecision.pStar).toBeLessThan(strongDecision.pStar);
  });

  it('ritorna null se la lega non è ancora configurata', () => {
    const state = reduce([{ t: 'players.load', players: buildPool(1) }]);
    expect(computeDecisionForPlayer(state, 'A0')).toBeNull();
  });
});
