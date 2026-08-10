// §11 / §12 F12 — Prova a secco. DoD: gira in < 30s in browser; produce la distribuzione della
// rosa attesa per ruolo e la evidenzia se sbilanciata.
import { describe, expect, it } from 'vitest';
import { runDryRun } from '../src/sim/dry-run.js';
import { reduce } from '../src/core/state.js';
import { makeDefaultLeagueConfig } from '../src/core/config.js';
import { ROLES } from '../src/core/types.js';
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

function realisticState() {
  const players = [...buildPool(60, 'P'), ...buildPool(180, 'D'), ...buildPool(190, 'C'), ...buildPool(110, 'A')];
  const log: AuctionEvent[] = [
    { t: 'league.setup', config: league },
    { t: 'players.load', players },
    ...players.map((p, i) => ({
      t: 'player.score' as const,
      playerId: p.id,
      score: 100 * (1 - Math.pow(i / 50, 0.65) % 1),
    })),
  ];
  return reduce(log);
}

describe('§12 F12 runDryRun', () => {
  it('completa in tempi ragionevoli e produce una riga per ogni ruolo', async () => {
    const state = realisticState();
    const start = performance.now();
    const summary = await runDryRun(state, 20); // scala ridotta per un test veloce
    const elapsed = performance.now() - start;

    expect(summary.iterations).toBe(20);
    expect(summary.byRole).toHaveLength(4);
    for (const role of ROLES) {
      const entry = summary.byRole.find((r) => r.role === role);
      expect(entry).toBeDefined();
      expect(entry!.avgSlotsFilled).toBeGreaterThan(0);
      expect(entry!.avgSlotsFilled).toBeLessThanOrEqual(league.slots[role]);
    }
    expect(summary.avgFinalValue).toBeGreaterThan(0);
    // eslint-disable-next-line no-console
    console.log(`runDryRun(20 iter) in ${elapsed.toFixed(0)}ms`);
  });

  it('riporta i progressi tramite la callback onProgress', async () => {
    const state = realisticState();
    const calls: { done: number; total: number }[] = [];
    await runDryRun(state, 20, (p) => calls.push(p));
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[calls.length - 1]).toEqual({ done: 20, total: 20 });
  });

  it('lancia un errore chiaro se la lega non è configurata', async () => {
    const state = reduce([]);
    await expect(runDryRun(state, 5)).rejects.toThrow();
  });
});
