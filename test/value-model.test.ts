// §6.1 — Modello di valore. DoD F3 (§12): valori di riferimento entro ±1 punto,
// v monotona crescente in s per ogni ruolo (property-based).
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { playerValue } from '../src/core/value-model.js';
import { ROLES } from '../src/core/types.js';
import type { Role } from '../src/core/types.js';

// Tabella di riferimento esatta dal readme.md §6.1.
const REFERENCE: Record<Role, Record<number, number>> = {
  P: { 20: 43, 40: 81, 60: 125, 75: 165, 85: 195, 95: 228 },
  D: { 20: 36, 40: 70, 60: 115, 75: 159, 85: 193, 95: 231 },
  C: { 20: 36, 40: 70, 60: 120, 75: 170, 85: 211, 95: 260 },
  A: { 20: 33, 40: 65, 60: 116, 75: 173, 85: 223, 95: 285 },
};

describe('§6.1 valori di riferimento', () => {
  for (const role of ROLES) {
    for (const [scoreStr, expected] of Object.entries(REFERENCE[role])) {
      const score = Number(scoreStr);
      it(`v_${role}(${score}) ≈ ${expected} (±1)`, () => {
        expect(playerValue(role, score)).toBeCloseTo(expected, 0);
      });
    }
  }
});

describe('§13.1 test di regressione: titolarità non opzionale', () => {
  it('v_A(95) / v_A(20) ≥ 5', () => {
    const ratio = playerValue('A', 95) / playerValue('A', 20);
    expect(ratio).toBeGreaterThanOrEqual(5);
  });
});

describe('v è monotona crescente in s per ogni ruolo (property-based)', () => {
  for (const role of ROLES) {
    it(`ruolo ${role}`, () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0, max: 100, noNaN: true }),
          fc.double({ min: 0, max: 100, noNaN: true }),
          (a, b) => {
            const [lo, hi] = a <= b ? [a, b] : [b, a];
            return playerValue(role, lo) <= playerValue(role, hi) + 1e-9;
          },
        ),
      );
    });
  }
});

describe('ptOverride', () => {
  it('sostituisce la titolarità dedotta dallo score', () => {
    const withoutOverride = playerValue('A', 50);
    const withOverride = playerValue('A', 50, { ptOverride: 0.95 });
    expect(withOverride).toBeGreaterThan(withoutOverride);
  });
});
