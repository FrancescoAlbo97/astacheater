// §6.7 / §12 F9 — Monte Carlo. DoD: rollout completo in < 3s per 2000 iterazioni; p10 ≤ mediana ≤
// p90; il motore con Monte Carlo è coerente con l'intuizione economica di base.
import { describe, expect, it } from 'vitest';
import { runRollout, type RolloutInput, type RolloutPoolPlayer } from '../src/core/rollout.js';
import {
  DEFAULT_BUDGET,
  DEFAULT_NUM_MANAGERS,
  DEFAULT_ROLLOUT_CONFIG,
  DEFAULT_SLOT_WEIGHTS,
  DEFAULT_SLOTS,
} from '../src/core/config.js';
import { mulberry32 } from '../src/core/rng.js';
import { ROLES } from '../src/core/types.js';
import type { ManagerState, Role } from '../src/core/types.js';

function freshManagers(): ManagerState[] {
  return Array.from({ length: DEFAULT_NUM_MANAGERS }, (_, i) => ({
    manager: { id: `m${i}`, name: `m${i}`, isMe: i === 0 },
    creditsRemaining: DEFAULT_BUDGET,
    slotsRemaining: { ...DEFAULT_SLOTS },
    roster: [],
  }));
}

function realisticPool(rng: () => number, size = 200): RolloutPoolPlayer[] {
  const roles: Role[] = ['P', 'D', 'C', 'A'];
  return Array.from({ length: size }, (_, i) => {
    const role = roles[i % roles.length]!;
    const score = 100 * (1 - Math.pow(rng(), 0.65));
    return { id: `p${i}`, role, myScore: score, pHat: Math.max(1, Math.round(score / 3)) };
  });
}

function baseInput(overrides: Partial<RolloutInput> = {}): RolloutInput {
  const rng = mulberry32(1);
  return {
    myManagerId: 'm0',
    managers: freshManagers(),
    ownedByManager: new Map(),
    targetRole: 'A',
    targetMyScore: 90,
    targetPHat: 60,
    remainingPool: realisticPool(rng),
    leagueSlots: DEFAULT_SLOTS,
    leagueBudget: DEFAULT_BUDGET,
    minPrice: 1,
    slotWeights: DEFAULT_SLOT_WEIGHTS,
    rolloutConfig: { ...DEFAULT_ROLLOUT_CONFIG, rollouts: 50 },
    maxHorizon: 40,
    ...overrides,
  };
}

describe('§6.7 / F9 runRollout — sanità di base', () => {
  it('p10 ≤ mediana ≤ p90', () => {
    const result = runRollout(baseInput(), mulberry32(7));
    expect(result.p10).toBeLessThanOrEqual(result.median);
    expect(result.median).toBeLessThanOrEqual(result.p90);
  });

  it('un giocatore inutile (score molto basso) ha p* mediano basso', () => {
    const result = runRollout(baseInput({ targetMyScore: 2, targetPHat: 1 }), mulberry32(8));
    expect(result.median).toBeLessThanOrEqual(5);
  });

  it('un giocatore di valore alto con budget ampio ha p* mediano positivo e sostanziale', () => {
    const result = runRollout(baseInput({ targetMyScore: 95, targetPHat: 80 }), mulberry32(9));
    expect(result.median).toBeGreaterThan(10);
  });

  it('p* non supera mai c_0 (il mio massimo su un singolo giocatore)', () => {
    const managers = freshManagers();
    managers[0] = {
      ...managers[0]!,
      creditsRemaining: 30,
      slotsRemaining: { P: 1, D: 1, C: 1, A: 1 }, // k=4 ⇒ c_0 = 30-3 = 27
    };
    const result = runRollout(baseInput({ managers, targetMyScore: 99, targetPHat: 90 }), mulberry32(10));
    expect(result.p90).toBeLessThanOrEqual(27);
  });

  it('se non posso permettermi nemmeno 1 credito, ritorna 0/0/0', () => {
    const managers = freshManagers();
    managers[0] = {
      ...managers[0]!,
      creditsRemaining: 5,
      slotsRemaining: { P: 3, D: 8, C: 8, A: 6 }, // k=25 ⇒ c_0 = 5-24 < 0
    };
    const result = runRollout(baseInput({ managers }), mulberry32(11));
    expect(result).toEqual({ median: 0, p10: 0, p90: 0 });
  });
});

describe('§12 F9 prestazioni: rollout completo entro un budget di tempo ragionevole', () => {
  // §7 Session 8: DoD storico "< 3s per 2000 iterazioni" non è più il punto di riferimento giusto —
  // OGNI manager (non solo "me") ora ricalcola duali a base di valore vero periodicamente, su un
  // orizzonte molto più profondo (di default fino alla fine vera del pool residuo, §7 sopra, non
  // più 80 estrazioni fisse): un costo per iterazione reale e voluto, non una regressione da
  // rincorrere. Per restare in un budget di tempo sensato per una schermata dal vivo (tipicamente
  // eseguito in un Web Worker, non blocca la UI), `DEFAULT_ROLLOUT_CONFIG.rollouts` è sceso da 2000
  // a 150 nello stesso cambio — misurato qui con la CONFIGURAZIONE DI PRODUZIONE reale (nessun
  // override di `rollouts`/`maxHorizon`), non uno scenario ottimistico scelto apposta.
  it(
    'con la configurazione di produzione reale (nessun override)',
    () => {
      const input = baseInput({ rolloutConfig: DEFAULT_ROLLOUT_CONFIG, maxHorizon: undefined });
      const start = performance.now();
      runRollout(input, mulberry32(42));
      const elapsedMs = performance.now() - start;
      // eslint-disable-next-line no-console
      console.log(`rollout completo (config di produzione, pool 200): ${elapsedMs.toFixed(0)}ms`);
      // Misurato isolato: ~5-7s su un pool di 200 (orizzonte pieno, dato che 200 < DEFAULT_MAX_
      // HORIZON 250). Soglia larga per assorbire la contesa della suite intera in parallelo, stessa
      // logica già applicata altrove in questo file — il timeout del test (terzo argomento sotto)
      // deve essere ANCORA più largo della soglia stessa, altrimenti vitest interrompe la funzione
      // prima ancora che l'assert venga valutato.
      expect(elapsedMs).toBeLessThan(20000);
    },
    25000,
  );
});

describe('determinismo (§13.10)', () => {
  it('stesso seed ⇒ stesso risultato', () => {
    const a = runRollout(baseInput(), mulberry32(123));
    const b = runRollout(baseInput(), mulberry32(123));
    expect(a).toEqual(b);
  });
});

describe('§11 Setup — peso per ruolo dentro il rollout', () => {
  it('pesare di più il ruolo del target alza la mediana di p*, a parità di seed (confronto appaiato)', () => {
    const neutral = runRollout(baseInput({ roleWeights: { P: 1, D: 1, C: 1, A: 1 } }), mulberry32(55));
    const boosted = runRollout(baseInput({ roleWeights: { P: 1, D: 1, C: 1, A: 2 } }), mulberry32(55));
    expect(boosted.median).toBeGreaterThanOrEqual(neutral.median);
  });

  it('roleWeights non fornito equivale a nessuna preferenza (fallback difensivo)', () => {
    const withDefault = runRollout(baseInput(), mulberry32(9));
    const withExplicitNeutral = runRollout(baseInput({ roleWeights: { P: 1, D: 1, C: 1, A: 1 } }), mulberry32(9));
    expect(withDefault).toEqual(withExplicitNeutral);
  });
});
