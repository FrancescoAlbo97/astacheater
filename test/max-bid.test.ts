// §6.6 / §12 F6 — p* per bisezione. DoD: p* in < 100ms; coerenza con la definizione (Φ_win(p*) ≥
// Φ_lose e, se p* < c_0, Φ_win(p*+1) < Φ_lose); p*=0 quando il giocatore non serve nemmeno gratis.
import { describe, expect, it } from 'vitest';
import { computeMaxBid, type MaxBidInput } from '../src/core/max-bid.js';
import { combineRoles, computeRolePlan, type DPCandidate, type RoleDPInput } from '../src/core/plan-dp.js';
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
import { mulberry32 } from '../src/core/rng.js';
import { ROLES } from '../src/core/types.js';
import type { ManagerState, Role } from '../src/core/types.js';

const POOL_SIZE_BY_ROLE: Record<Role, number> = { P: 60, D: 180, C: 190, A: 110 };

function buildFreshLeagueState(): ManagerState[] {
  return Array.from({ length: DEFAULT_NUM_MANAGERS }, (_, i) => ({
    manager: { id: `m${i}`, name: `m${i}`, isMe: i === 0 },
    creditsRemaining: DEFAULT_BUDGET,
    slotsRemaining: { ...DEFAULT_SLOTS },
    roster: [],
  }));
}

function buildRoleInputsWithoutTarget(
  rng: () => number,
  targetRole: Role,
): { roleInputs: Record<Role, RoleDPInput>; targetValue: number } {
  const pool: PoolPlayer[] = ROLES.flatMap((role) =>
    Array.from({ length: POOL_SIZE_BY_ROLE[role] }, (_, i) => ({
      id: `${role}-${i}`,
      role,
      score: 100 * (1 - Math.pow(rng(), 0.65)),
    })),
  );
  const managers = buildFreshLeagueState();
  const { pHat } = renormalize(pool, managers, DEFAULT_PRICE_CURVES, DEFAULT_RESERVE_FRACTION);

  // Il giocatore target è il migliore del proprio ruolo: viene rimosso dal pool (P∖{i}).
  const rolePool = pool.filter((p) => p.role === targetRole);
  const best = rolePool.reduce((a, b) => (a.score > b.score ? a : b));
  const targetValue = playerValue(targetRole, best.score);

  const roleInputs = {} as Record<Role, RoleDPInput>;
  for (const role of ROLES) {
    const candidatesPool = pool.filter((p) => p.role === role && p.id !== best.id);
    const candidates: DPCandidate[] = candidatesPool.map((p) => ({
      v: playerValue(role, p.score),
      price: pHat.get(p.id)!,
      forced: false,
    }));
    const sortedScores = pool
      .filter((p) => p.role === role)
      .map((p) => p.score)
      .sort((a, b) => a - b);
    const p20 = sortedScores[Math.floor(0.2 * sortedScores.length)]!;
    roleInputs[role] = {
      candidates,
      fillerValue: playerValue(role, p20),
      slotCount: DEFAULT_SLOTS[role],
      weights: DEFAULT_SLOT_WEIGHTS[role],
    };
  }
  return { roleInputs, targetValue };
}

function phiFor(roleInputs: Record<Role, RoleDPInput>, budget: number): number {
  const plans = {} as Record<Role, Float64Array>;
  for (const role of ROLES) plans[role] = computeRolePlan(roleInputs[role], budget);
  return combineRoles(plans, budget)[budget]!;
}

describe('§6.6 / F6 max-bid', () => {
  it('p* è coerente: Φ_win(p*) ≥ Φ_lose e Φ_win(p*+1) < Φ_lose (se p* < c_0)', () => {
    const rng = mulberry32(10);
    const targetRole: Role = 'A';
    const { roleInputs, targetValue } = buildRoleInputsWithoutTarget(rng, targetRole);
    const budget = 500;
    const maxAffordable = 100;

    const input: MaxBidInput = {
      budget,
      roleInputsWithoutTarget: roleInputs,
      targetRole,
      targetValue,
      maxAffordable,
      minPrice: 1,
    };
    const result = computeMaxBid(input);
    expect(result.reason).toBe('ok');
    expect(result.pStar).toBeGreaterThan(0);
    expect(result.pStar).toBeLessThanOrEqual(maxAffordable);

    function phiWin(p: number): number {
      const base = roleInputs[targetRole]!;
      const withTarget: RoleDPInput = {
        ...base,
        candidates: [...base.candidates, { v: targetValue, price: p, forced: true }],
      };
      const merged = { ...roleInputs, [targetRole]: withTarget };
      return phiFor(merged, budget);
    }

    expect(phiWin(result.pStar)).toBeGreaterThanOrEqual(result.phiLose - 1e-9);
    if (result.pStar < maxAffordable) {
      expect(phiWin(result.pStar + 1)).toBeLessThan(result.phiLose + 1e-9);
    }
  });

  it('p* = 0 ("non serve") quando il valore del giocatore è nullo', () => {
    const rng = mulberry32(11);
    const targetRole: Role = 'D';
    const { roleInputs } = buildRoleInputsWithoutTarget(rng, targetRole);

    const input: MaxBidInput = {
      budget: 500,
      roleInputsWithoutTarget: roleInputs,
      targetRole,
      targetValue: 0,
      maxAffordable: 500,
      minPrice: 1,
    };
    const result = computeMaxBid(input);
    expect(result.pStar).toBe(0);
    expect(result.reason).toBe('not-useful');
  });

  it('p* = 0 ("non serve") quando il ruolo è GIÀ PIENO, anche se il candidato vale più del peggiore già posseduto', () => {
    // Bug reale trovato durante lo sviluppo (via il Report asta, §11): valutare un candidato per
    // un ruolo dove possiedo già tutti gli slot risultava in un "offri fino a" positivo ogni volta
    // che il nuovo giocatore valeva più del peggiore fra quelli già posseduti in quel ruolo — come
    // se si potesse scambiare in silenzio uno slot già occupato con uno nuovo, invece di segnalare
    // che comprare è semplicemente impossibile (non c'è nessuno slot libero). Vedi il commento su
    // `computeRolePlan` in plan-dp.ts per la causa esatta.
    const targetRole: Role = 'D';
    const slotCount = DEFAULT_SLOTS[targetRole];
    // Possiedo già ESATTAMENTE slotCount difensori (ruolo pieno), con valori bassi apposta.
    const forcedOwned: DPCandidate[] = Array.from({ length: slotCount }, (_, i) => ({
      v: 50 + i, // tutti modesti: il peggiore vale 50
      price: 0,
      forced: true,
    }));
    const roleInputs = {} as Record<Role, RoleDPInput>;
    for (const role of ROLES) {
      roleInputs[role] = {
        candidates: role === targetRole ? forcedOwned : [],
        fillerValue: 10,
        slotCount: DEFAULT_SLOTS[role],
        weights: DEFAULT_SLOT_WEIGHTS[role],
      };
    }
    const input: MaxBidInput = {
      budget: 400,
      roleInputsWithoutTarget: roleInputs,
      targetRole,
      targetValue: 500, // molto più alto di TUTTI i difensori già posseduti
      maxAffordable: 400,
      minPrice: 1,
    };
    const result = computeMaxBid(input);
    expect(result.reason).toBe('not-useful');
    expect(result.pStar).toBe(0);
  });

  it('p* = 0 con reason "capped-by-budget" se non posso permettermi nemmeno 1 credito', () => {
    const rng = mulberry32(12);
    const targetRole: Role = 'C';
    const { roleInputs, targetValue } = buildRoleInputsWithoutTarget(rng, targetRole);
    const input: MaxBidInput = {
      budget: 500,
      roleInputsWithoutTarget: roleInputs,
      targetRole,
      targetValue,
      maxAffordable: 0,
      minPrice: 1,
    };
    const result = computeMaxBid(input);
    expect(result.pStar).toBe(0);
    expect(result.reason).toBe('capped-by-budget');
  });

  it('p* non supera mai c_0 (maxAffordable)', () => {
    const rng = mulberry32(13);
    const targetRole: Role = 'A';
    const { roleInputs, targetValue } = buildRoleInputsWithoutTarget(rng, targetRole);
    const input: MaxBidInput = {
      budget: 500,
      roleInputsWithoutTarget: roleInputs,
      targetRole,
      targetValue,
      maxAffordable: 5, // molto vincolante
      minPrice: 1,
    };
    const result = computeMaxBid(input);
    expect(result.pStar).toBeLessThanOrEqual(5);
  });

  it('tempo di calcolo di p* < 100ms', () => {
    const rng = mulberry32(14);
    const targetRole: Role = 'A';
    const { roleInputs, targetValue } = buildRoleInputsWithoutTarget(rng, targetRole);
    const input: MaxBidInput = {
      budget: 500,
      roleInputsWithoutTarget: roleInputs,
      targetRole,
      targetValue,
      maxAffordable: 300,
      minPrice: 1,
    };
    const start = performance.now();
    computeMaxBid(input);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });
});
