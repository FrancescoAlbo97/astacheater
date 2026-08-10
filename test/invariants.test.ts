// §2 — Invarianti della lega. Test di regressione obbligatori (§12 F1).
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BUDGET,
  DEFAULT_FORMATIONS,
  DEFAULT_NUM_MANAGERS,
  DEFAULT_SLOTS,
  DEFAULT_SLOT_WEIGHTS,
  FORMATION_SHAPES,
  totalCreditsInLeague,
  totalSlotWeightSum,
  totalSlotsInLeague,
} from '../src/core/config.js';
import { ROLES } from '../src/core/types.js';

describe('§2 invarianti di lega', () => {
  it('Σ_ρ slot_ρ × M = 250', () => {
    expect(totalSlotsInLeague(DEFAULT_SLOTS, DEFAULT_NUM_MANAGERS)).toBe(250);
  });

  it('B × M = 5000', () => {
    expect(totalCreditsInLeague(DEFAULT_BUDGET, DEFAULT_NUM_MANAGERS)).toBe(5000);
  });

  it('somma dei pesi di slot su tutti i ruoli = 11.00', () => {
    expect(totalSlotWeightSum(DEFAULT_SLOT_WEIGHTS)).toBeCloseTo(11.0, 6);
  });

  it('ogni ruolo ha esattamente slot_ρ pesi', () => {
    for (const role of ROLES) {
      expect(DEFAULT_SLOT_WEIGHTS[role]).toHaveLength(DEFAULT_SLOTS[role]);
    }
  });

  it('i pesi di slot sono monotoni non crescenti dentro ogni ruolo', () => {
    for (const role of ROLES) {
      const w = DEFAULT_SLOT_WEIGHTS[role];
      for (let i = 1; i < w.length; i++) {
        expect(w[i]!).toBeLessThanOrEqual(w[i - 1]!);
      }
    }
  });

  it('ogni formazione ammessa ha 1 P + 10 giocatori di movimento (11 titolari)', () => {
    for (const formation of DEFAULT_FORMATIONS) {
      const shape = FORMATION_SHAPES[formation];
      expect(shape.D + shape.C + shape.A).toBe(10);
    }
  });

  it('nessuna formazione richiede più slot di quelli disponibili per ruolo', () => {
    for (const formation of DEFAULT_FORMATIONS) {
      const shape = FORMATION_SHAPES[formation];
      expect(shape.D).toBeLessThanOrEqual(DEFAULT_SLOTS.D);
      expect(shape.C).toBeLessThanOrEqual(DEFAULT_SLOTS.C);
      expect(shape.A).toBeLessThanOrEqual(DEFAULT_SLOTS.A);
    }
  });
});
