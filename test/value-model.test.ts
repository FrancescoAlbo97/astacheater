// §6.1 — Modello di valore. DoD F3 (§12): valori di riferimento entro ±1 punto,
// v monotona crescente in s per ogni ruolo (property-based).
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  applyRiskToValueCurves,
  playerValue,
  riskAdjustedPlayerValue,
  roleWeightedPlayerValue,
  seasonSdProxy,
} from '../src/core/value-model.js';
import { DEFAULT_VALUE_CURVES } from '../src/core/config.js';
import { ROLES } from '../src/core/types.js';
import type { Role, RoleWeights } from '../src/core/types.js';

const NEUTRAL_WEIGHTS: RoleWeights = { P: 1, D: 1, C: 1, A: 1 };

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

describe('§6.8 applyRiskToValueCurves', () => {
  it('risk=0 restituisce le curve invariate (stesso riferimento)', () => {
    expect(applyRiskToValueCurves(DEFAULT_VALUE_CURVES, 0)).toBe(DEFAULT_VALUE_CURVES);
  });

  it('un rischio positivo aumenta γ per ogni ruolo, uno negativo lo riduce', () => {
    const up = applyRiskToValueCurves(DEFAULT_VALUE_CURVES, 1);
    const down = applyRiskToValueCurves(DEFAULT_VALUE_CURVES, -1);
    for (const role of ROLES) {
      expect(up[role].gamma).toBeGreaterThan(DEFAULT_VALUE_CURVES[role].gamma);
      expect(down[role].gamma).toBeLessThan(DEFAULT_VALUE_CURVES[role].gamma);
    }
  });

  it('non tocca fmMin/fmMax/pt* (solo γ cambia)', () => {
    const adjusted = applyRiskToValueCurves(DEFAULT_VALUE_CURVES, 1);
    for (const role of ROLES) {
      expect(adjusted[role].fmMin).toBe(DEFAULT_VALUE_CURVES[role].fmMin);
      expect(adjusted[role].fmMax).toBe(DEFAULT_VALUE_CURVES[role].fmMax);
      expect(adjusted[role].ptMin).toBe(DEFAULT_VALUE_CURVES[role].ptMin);
      expect(adjusted[role].ptMax).toBe(DEFAULT_VALUE_CURVES[role].ptMax);
      expect(adjusted[role].delta).toBe(DEFAULT_VALUE_CURVES[role].delta);
    }
  });
});

describe('§6.8 seasonSdProxy — proxy di SD stagionale a forma chiusa', () => {
  it('è esattamente zero ai bordi di Bernoulli (pt=0 o pt=1: nessuna incertezza)', () => {
    expect(seasonSdProxy('A', 60, { ptOverride: 0 })).toBe(0);
    expect(seasonSdProxy('A', 60, { ptOverride: 1 })).toBe(0);
  });

  it('è massima a pt=0.5 e simmetrica attorno ad esso, a fm fisso', () => {
    const sd = (pt: number) => seasonSdProxy('A', 60, { ptOverride: pt });
    expect(sd(0.1)).toBeCloseTo(sd(0.9), 10);
    expect(sd(0.3)).toBeCloseTo(sd(0.7), 10);
    expect(sd(0.1)).toBeLessThan(sd(0.3));
    expect(sd(0.3)).toBeLessThan(sd(0.5));
    expect(sd(0.5)).toBeGreaterThan(sd(0.7));
    expect(sd(0.7)).toBeGreaterThan(sd(0.9));
  });

  it('non è mai negativa (property-based)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ROLES),
        fc.double({ min: 0, max: 100, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (role, score, pt) => seasonSdProxy(role, score, { ptOverride: pt }) >= 0,
      ),
    );
  });

  it('clampa un ptOverride fuori da [0,1] invece di restituire NaN/negativo', () => {
    expect(Number.isFinite(seasonSdProxy('A', 60, { ptOverride: -0.3 }))).toBe(true);
    expect(Number.isFinite(seasonSdProxy('A', 60, { ptOverride: 1.4 }))).toBe(true);
  });
});

describe('§6.8 riskAdjustedPlayerValue — alternativa additiva a applyRiskToValueCurves', () => {
  it('risk=0 è un no-op esatto rispetto a playerValue: guardia di regressione principale', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ROLES),
        fc.double({ min: 0, max: 100, noNaN: true }),
        (role, score) => riskAdjustedPlayerValue(role, score, 0) === playerValue(role, score),
      ),
    );
  });

  it('rischio positivo aumenta il valore, negativo lo riduce, per un candidato "tutto o niente"', () => {
    const base = playerValue('A', 60, { ptOverride: 0.5 });
    const positive = riskAdjustedPlayerValue('A', 60, 1, { ptOverride: 0.5 });
    const negative = riskAdjustedPlayerValue('A', 60, -1, { ptOverride: 0.5 });
    expect(positive).toBeGreaterThan(base);
    expect(negative).toBeLessThan(base);
  });

  it('il bonus/malus è maggiore per un candidato "tutto o niente" (pt=0.5) che per un titolare quasi certo (pt=0.9)', () => {
    const bonusAt = (risk: number, pt: number) =>
      riskAdjustedPlayerValue('A', 60, risk, { ptOverride: pt }) - playerValue('A', 60, { ptOverride: pt });
    expect(bonusAt(1, 0.5)).toBeGreaterThan(bonusAt(1, 0.9));
    expect(Math.abs(bonusAt(-1, 0.5))).toBeGreaterThan(Math.abs(bonusAt(-1, 0.9)));
  });

  it('è monotona in risk, a parità di ruolo/score/pt (property-based)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ROLES),
        fc.double({ min: 0, max: 100, noNaN: true }),
        fc.double({ min: 0.01, max: 0.99, noNaN: true }),
        fc.double({ min: -1, max: 1, noNaN: true }),
        fc.double({ min: -1, max: 1, noNaN: true }),
        (role, score, pt, r1, r2) => {
          const [lo, hi] = r1 <= r2 ? [r1, r2] : [r2, r1];
          const opts = { ptOverride: pt };
          return riskAdjustedPlayerValue(role, score, lo, opts) <= riskAdjustedPlayerValue(role, score, hi, opts) + 1e-9;
        },
      ),
    );
  });
});

describe('§11 Setup — roleWeightedPlayerValue', () => {
  it('pesi tutti a 1 è un no-op esatto rispetto a playerValue: guardia di regressione principale', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ROLES),
        fc.double({ min: 0, max: 100, noNaN: true }),
        (role, score) => roleWeightedPlayerValue(role, score, NEUTRAL_WEIGHTS) === playerValue(role, score),
      ),
    );
  });

  it('un peso di 2 raddoppia esattamente il valore di quel ruolo, altri ruoli invariati', () => {
    const weights: RoleWeights = { P: 1, D: 1, C: 1, A: 2 };
    const base = playerValue('A', 70);
    expect(roleWeightedPlayerValue('A', 70, weights)).toBeCloseTo(base * 2, 9);
    expect(roleWeightedPlayerValue('C', 70, weights)).toBe(playerValue('C', 70));
  });

  it('un peso < 1 riduce il valore, > 1 lo aumenta, rispetto al peso neutro', () => {
    const base = playerValue('D', 55);
    expect(roleWeightedPlayerValue('D', 55, { ...NEUTRAL_WEIGHTS, D: 0.5 })).toBeLessThan(base);
    expect(roleWeightedPlayerValue('D', 55, { ...NEUTRAL_WEIGHTS, D: 1.5 })).toBeGreaterThan(base);
  });

  it('compone correttamente con curve già corrette per il rischio (opts.curves passato invariato)', () => {
    const riskCurves = applyRiskToValueCurves(DEFAULT_VALUE_CURVES, 1);
    const withoutWeight = playerValue('A', 80, { curves: riskCurves });
    const withWeight = roleWeightedPlayerValue('A', 80, { ...NEUTRAL_WEIGHTS, A: 1.3 }, { curves: riskCurves });
    expect(withWeight).toBeCloseTo(withoutWeight * 1.3, 9);
  });
});
