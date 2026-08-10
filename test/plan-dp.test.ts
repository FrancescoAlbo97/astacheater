// §6.5 / §12 F6 — DP esatta. DoD: coincide con forza bruta su istanze piccole (500 istanze
// casuali, ≤12 giocatori, ≤3 slot, budget≤40); Φ monotona non decrescente in b; λ riproduce
// la traiettoria di §6.5 entro ±10%; λ(500) ∈ [0.8,1.4]; DP < 20ms.
import { describe, expect, it } from 'vitest';
import {
  combineRoles,
  computeFullPlan,
  computeRolePlan,
  type DPCandidate,
  type RoleDPInput,
} from '../src/core/plan-dp.js';
import {
  DEFAULT_BUDGET,
  DEFAULT_NUM_MANAGERS,
  DEFAULT_PRICE_CURVES,
  DEFAULT_RESERVE_FRACTION,
  DEFAULT_SLOT_WEIGHTS,
  DEFAULT_SLOTS,
} from '../src/core/config.js';
import { playerValue } from '../src/core/value-model.js';
import { renormalize, type PoolPlayer } from '../src/core/price-model.js';
import { mulberry32, randInt } from '../src/core/rng.js';
import { ROLES } from '../src/core/types.js';
import type { ManagerState, Role } from '../src/core/types.js';

function bruteForceRolePlan(input: RoleDPInput, budget: number): Float64Array {
  const { candidates, fillerValue, slotCount, weights } = input;
  const forced = candidates.filter((c) => c.forced);
  const optional = candidates.filter((c) => !c.forced);
  const n = optional.length;
  const forcedPrice = forced.reduce((s, c) => s + c.price, 0);
  const forcedValues = forced.map((c) => c.v);

  const best: { price: number; value: number }[] = [];

  const maxOptional = slotCount - forced.length;
  for (let mask = 0; mask < 1 << n; mask++) {
    let count = 0;
    for (let i = 0; i < n; i++) if (mask & (1 << i)) count++;
    if (count > maxOptional) continue;
    const fillerCount = slotCount - forced.length - count;
    if (fillerCount < 0) continue;

    let price = forcedPrice;
    const values = forcedValues.slice();
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        price += optional[i]!.price;
        values.push(optional[i]!.v);
      }
    }
    price += fillerCount * 1;
    for (let k = 0; k < fillerCount; k++) values.push(fillerValue);

    if (price > budget) continue;
    values.sort((a, b) => b - a);
    let value = 0;
    for (let t = 0; t < slotCount; t++) value += weights[t]! * values[t]!;
    best.push({ price, value });
  }

  const g = new Float64Array(budget + 1).fill(-Infinity);
  for (const { price, value } of best) {
    for (let b = price; b <= budget; b++) {
      if (value > g[b]!) g[b] = value;
    }
  }
  // eventuali budget non raggiungibili restano -Infinity finché non compare un valore valido;
  // applica comunque l'inviluppo (non dovrebbe servire dato il loop sopra, ma per sicurezza)
  let running = -Infinity;
  for (let b = 0; b <= budget; b++) {
    if (g[b]! > running) running = g[b]!;
    g[b] = running;
  }
  return g;
}

function randomRoleInstance(rng: () => number, seed: number): { input: RoleDPInput; budget: number } {
  const slotCount = 1 + randInt(rng, 3); // 1..3
  const numCandidates = randInt(rng, 13); // 0..12
  const numForced = Math.min(slotCount, randInt(rng, 3));
  const budget = 5 + randInt(rng, 36); // 5..40

  const candidates: DPCandidate[] = [];
  for (let i = 0; i < numCandidates; i++) {
    const forced = i < numForced;
    candidates.push({
      v: 1 + rng() * 100,
      price: forced ? 0 : 1 + randInt(rng, 15),
      forced,
    });
  }
  const weights = Array.from({ length: slotCount }, (_, i) => slotCount - i).map((w) => w / slotCount);
  const fillerValue = 1 + rng() * 20;

  return { input: { candidates, fillerValue, slotCount, weights }, budget };
}

describe('§6.5 / F6 DP vs forza bruta (500 istanze casuali)', () => {
  it('g_ρ[β] coincide con la forza bruta per ogni β', () => {
    const rng = mulberry32(99);
    for (let seed = 0; seed < 500; seed++) {
      const { input, budget } = randomRoleInstance(rng, seed);
      const dp = computeRolePlan(input, budget);
      const brute = bruteForceRolePlan(input, budget);
      for (let b = 0; b <= budget; b++) {
        const dpVal = dp[b]!;
        const bruteVal = brute[b]!;
        if (bruteVal === -Infinity) {
          expect(dpVal, `seed=${seed} b=${b}`).toBe(-Infinity);
        } else {
          expect(dpVal, `seed=${seed} b=${b}`).toBeCloseTo(bruteVal, 6);
        }
      }
    }
  });
});

describe('§6.5 Φ monotona non decrescente in b', () => {
  it('g_ρ[β] non decresce con β (property-based su istanze casuali)', () => {
    const rng = mulberry32(7);
    for (let seed = 0; seed < 100; seed++) {
      const { input, budget } = randomRoleInstance(rng, seed);
      const g = computeRolePlan(input, budget);
      for (let b = 1; b <= budget; b++) {
        if (g[b - 1] === -Infinity) continue;
        expect(g[b]!).toBeGreaterThanOrEqual(g[b - 1]!);
      }
    }
  });
});

// --- Istanza realistica a scala di lega, per λ e tempo di esecuzione ---
//
// I prezzi grezzi del prior (§6.3.1) NON sono utilizzabili direttamente come p̂ per la DP: sono
// su una scala arbitraria (a score=100 possono valere migliaia di crediti) e vanno sempre fatti
// passare da renormalize() (§6.3.2), che li ancora ai crediti realmente in circolazione. Usare
// il prior grezzo qui produceva un λ(500) artificiosamente basso (~0.45), indistinguibile a
// prima vista dal sintomo del bug di §13.1 ma in realtà dovuto solo a un generatore di test
// non calibrato: la lezione è che ogni test "a scala realistica" deve passare da renormalize().
const POOL_SIZE_BY_ROLE: Record<Role, number> = { P: 60, D: 180, C: 190, A: 110 };

function buildFreshLeagueState(): ManagerState[] {
  return Array.from({ length: DEFAULT_NUM_MANAGERS }, (_, i) => ({
    manager: { id: `m${i}`, name: `m${i}`, isMe: i === 0 },
    creditsRemaining: DEFAULT_BUDGET,
    slotsRemaining: { ...DEFAULT_SLOTS },
    roster: [],
  }));
}

function buildRealisticRoleInputs(rng: () => number): Record<Role, RoleDPInput> {
  const pool: PoolPlayer[] = ROLES.flatMap((role) =>
    Array.from({ length: POOL_SIZE_BY_ROLE[role] }, (_, i) => ({
      id: `${role}-${i}`,
      role,
      score: 100 * (1 - Math.pow(rng(), 0.65)),
    })),
  );
  const managers = buildFreshLeagueState();
  const { pHat } = renormalize(pool, managers, DEFAULT_PRICE_CURVES, DEFAULT_RESERVE_FRACTION);

  const roleInputs = {} as Record<Role, RoleDPInput>;
  for (const role of ROLES) {
    const rolePool = pool.filter((p) => p.role === role);
    const candidates: DPCandidate[] = rolePool.map((p) => ({
      v: playerValue(role, p.score),
      price: pHat.get(p.id)!,
      forced: false,
    }));
    const sortedScores = rolePool.map((p) => p.score).sort((a, b) => a - b);
    const p20 = sortedScores[Math.floor(0.2 * sortedScores.length)]!;
    roleInputs[role] = {
      candidates,
      fillerValue: playerValue(role, p20),
      slotCount: DEFAULT_SLOTS[role],
      weights: DEFAULT_SLOT_WEIGHTS[role],
    };
  }
  return roleInputs;
}

describe('§6.5 / F6 scala di lega: λ e tempo di esecuzione', () => {
  it('DP completa in < 20ms per ruolo a scala realistica', () => {
    const roleInputs = buildRealisticRoleInputs(mulberry32(1));
    for (const role of ROLES) {
      const start = performance.now();
      computeRolePlan(roleInputs[role], 500);
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(20);
    }
  });

  it('λ(500) ∈ [0.8, 1.4] con parametri di default (§6.5, §13.1 test di regressione)', () => {
    const roleInputs = buildRealisticRoleInputs(mulberry32(2));
    const plan = computeFullPlan({ budget: 500, roleInputs });
    expect(plan.lambda).toBeGreaterThanOrEqual(0.8);
    expect(plan.lambda).toBeLessThanOrEqual(1.4);
  });

  it('λ decresce in modo regolare al crescere del budget', () => {
    const roleInputs = buildRealisticRoleInputs(mulberry32(3));
    const rolePlans = {} as Record<Role, Float64Array>;
    for (const role of ROLES) rolePlans[role] = computeRolePlan(roleInputs[role], 500);
    const combined = combineRoles(rolePlans, 500);

    const lambdas = [150, 250, 350, 500].map((b) => {
      if (combined[b] === -Infinity || combined[b - 1] === -Infinity) return NaN;
      return combined[b]! - combined[b - 1]!;
    });
    for (let i = 1; i < lambdas.length; i++) {
      expect(lambdas[i]!).toBeLessThanOrEqual(lambdas[i - 1]! + 1e-6);
    }
  });

  it('Φ è monotona non decrescente in b sulla ricombinazione completa', () => {
    const roleInputs = buildRealisticRoleInputs(mulberry32(4));
    const plan = computeFullPlan({ budget: 500, roleInputs });
    for (let b = 1; b <= 500; b++) {
      if (plan.combined[b - 1] === -Infinity) continue;
      expect(plan.combined[b]!).toBeGreaterThanOrEqual(plan.combined[b - 1]!);
    }
  });
});

describe('§13.1 test di regressione: titolarità non opzionale nella DP', () => {
  it('λ(500) resta ben sopra 0.5 (0.47 indicherebbe la reintroduzione del bug §13.1)', () => {
    const roleInputs = buildRealisticRoleInputs(mulberry32(5));
    const plan = computeFullPlan({ budget: 500, roleInputs });
    expect(plan.lambda).toBeGreaterThan(0.6);
  });
});

