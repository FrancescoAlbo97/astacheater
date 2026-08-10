// §9.1 / F12 — Generatore di scenari, incluso buildRealScenario() (usato dalla prova a secco).
import { describe, expect, it } from 'vitest';
import { buildRealScenario, generateScenario, poolScoreAtRank, type ScenarioPlayer } from '../src/sim/generator.js';
import { mulberry32 } from '../src/core/rng.js';
import { ROLES } from '../src/core/types.js';

describe('§9.1 poolScoreAtRank', () => {
  it('è 100 al rango 0 e decresce con il rango', () => {
    expect(poolScoreAtRank(0, 100)).toBeCloseTo(100, 6);
    expect(poolScoreAtRank(50, 100)).toBeLessThan(poolScoreAtRank(10, 100));
  });
});

describe('§9.1 generateScenario', () => {
  it('a ρ=1 tutti i manager condividono lo stesso ordinamento per ruolo', () => {
    const rng = mulberry32(1);
    const scenario = generateScenario({ rng, numManagers: 5, rho: 1 });
    const role = 'A';
    const rolePlayers = scenario.players.filter((p) => p.role === role);
    const orderFor = (m: number) =>
      rolePlayers
        .slice()
        .sort((a, b) => (scenario.scoresByManager[m]!.get(b.id) ?? 0) - (scenario.scoresByManager[m]!.get(a.id) ?? 0))
        .map((p) => p.id);
    const order0 = orderFor(0);
    for (let m = 1; m < 5; m++) {
      expect(orderFor(m)).toEqual(order0);
    }
  });
});

describe('§12 F12 buildRealScenario', () => {
  const players: ScenarioPlayer[] = [
    ...Array.from({ length: 10 }, (_, i) => ({ id: `A${i}`, role: 'A' as const, team: 't' })),
    ...Array.from({ length: 10 }, (_, i) => ({ id: `D${i}`, role: 'D' as const, team: 't' })),
  ];
  const myScores = new Map(players.map((p, i) => [p.id, 100 - i * 5]));

  it('il manager 0 usa esattamente i punteggi reali forniti', () => {
    const rng = mulberry32(2);
    const scenario = buildRealScenario(players, myScores, 6, 0.8, rng);
    for (const p of players) {
      expect(scenario.scoresByManager[0]!.get(p.id)).toBe(myScores.get(p.id));
    }
  });

  it('usa un fallback per i giocatori senza punteggio assegnato', () => {
    const rng = mulberry32(3);
    const partial = new Map([[players[0]!.id, 90]]);
    const scenario = buildRealScenario(players, partial, 3, 0.8, rng, 25);
    expect(scenario.scoresByManager[0]!.get(players[0]!.id)).toBe(90);
    expect(scenario.scoresByManager[0]!.get(players[1]!.id)).toBe(25);
  });

  it('a ρ=1 gli avversari condividono il mio stesso ordinamento per ruolo', () => {
    const rng = mulberry32(4);
    const scenario = buildRealScenario(players, myScores, 4, 1, rng);
    const aPlayers = players.filter((p) => p.role === 'A');
    const myOrder = aPlayers.slice().sort((a, b) => myScores.get(b.id)! - myScores.get(a.id)!).map((p) => p.id);
    for (let m = 1; m < 4; m++) {
      const order = aPlayers
        .slice()
        .sort((a, b) => (scenario.scoresByManager[m]!.get(b.id) ?? 0) - (scenario.scoresByManager[m]!.get(a.id) ?? 0))
        .map((p) => p.id);
      expect(order).toEqual(myOrder);
    }
  });

  it('gli score generati per gli avversari restano in [0, 100] per ogni ruolo', () => {
    const rng = mulberry32(5);
    const scenario = buildRealScenario(players, myScores, 5, 0.6, rng);
    for (let m = 1; m < 5; m++) {
      for (const p of players) {
        const s = scenario.scoresByManager[m]!.get(p.id)!;
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(100);
      }
    }
  });

  it('copre tutti i ruoli presenti nel listone fornito', () => {
    const rng = mulberry32(6);
    const scenario = buildRealScenario(players, myScores, 3, 0.7, rng);
    const rolesPresent = new Set(scenario.players.map((p) => p.role));
    for (const role of ROLES) {
      if (players.some((p) => p.role === role)) expect(rolesPresent.has(role)).toBe(true);
    }
  });
});
