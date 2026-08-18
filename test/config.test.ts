// §6.2 / §11 Setup — normalizzazione dei pesi di slot personalizzabili. L'invariante protetto qui
// (weights.length === slots[role]) è quello che, se violato, fa lanciare un errore alla DP
// (plan-dp.ts's computeRolePlan, §13.3) — questi test esistono per non scoprirlo lì.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_SLOT_WEIGHTS, DEFAULT_SLOTS, normalizeSlotWeights, resizeSlotWeights } from '../src/core/config.js';
import { ROLES } from '../src/core/types.js';
import type { SlotWeights } from '../src/core/types.js';

describe('§6.2/§11 resizeSlotWeights', () => {
  it('tronca se la nuova lunghezza è minore', () => {
    expect(resizeSlotWeights([0.9, 0.5, 0.1], 2)).toEqual([0.9, 0.5]);
  });

  it('ripete l\'ultimo valore se la nuova lunghezza è maggiore', () => {
    expect(resizeSlotWeights([0.9, 0.5], 4)).toEqual([0.9, 0.5, 0.5, 0.5]);
  });

  it('lunghezza invariata: nessuna modifica', () => {
    expect(resizeSlotWeights([0.9, 0.5, 0.1], 3)).toEqual([0.9, 0.5, 0.1]);
  });

  it('newLength 0 o negativo ⇒ array vuoto', () => {
    expect(resizeSlotWeights([0.9, 0.5], 0)).toEqual([]);
    expect(resizeSlotWeights([0.9, 0.5], -1)).toEqual([]);
  });

  it('array di partenza vuoto e newLength > 0 ⇒ ripete un default ragionevole, mai NaN/undefined', () => {
    const out = resizeSlotWeights([], 3);
    expect(out).toHaveLength(3);
    expect(out.every((w) => Number.isFinite(w))).toBe(true);
  });

  it('la lunghezza del risultato è SEMPRE newLength, qualunque array e lunghezza di partenza (property-based)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { maxLength: 10 }),
        fc.integer({ min: 0, max: 12 }),
        (weights, newLength) => resizeSlotWeights(weights, newLength).length === newLength,
      ),
    );
  });
});

describe('§6.2/§11 normalizeSlotWeights', () => {
  it('weights assente (config salvata prima del controllo) ⇒ riparte da DEFAULT_SLOT_WEIGHTS', () => {
    const result = normalizeSlotWeights(undefined, DEFAULT_SLOTS);
    expect(result).toEqual(DEFAULT_SLOT_WEIGHTS);
  });

  it('weights già della lunghezza giusta ⇒ passano invariati', () => {
    const result = normalizeSlotWeights(DEFAULT_SLOT_WEIGHTS, DEFAULT_SLOTS);
    expect(result).toEqual(DEFAULT_SLOT_WEIGHTS);
  });

  it('slot cambiati DOPO aver personalizzato i pesi (lunghezze disallineate) vengono corretti, non lasciati rotti', () => {
    const customWeights: SlotWeights = { P: [0.6, 0.4], D: DEFAULT_SLOT_WEIGHTS.D, C: DEFAULT_SLOT_WEIGHTS.C, A: DEFAULT_SLOT_WEIGHTS.A };
    const newSlots = { ...DEFAULT_SLOTS, P: 4 }; // P passa da 2 (nei pesi custom) a 4 slot
    const result = normalizeSlotWeights(customWeights, newSlots);
    expect(result.P).toHaveLength(4);
    expect(result.P).toEqual([0.6, 0.4, 0.4, 0.4]);
  });

  it('per OGNI combinazione di pesi e slot, il risultato ha sempre length === slots[role] per ogni ruolo (invariante richiesto dalla DP, property-based)', () => {
    fc.assert(
      fc.property(
        fc.dictionary(
          fc.constantFrom(...ROLES),
          fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { maxLength: 10 }),
        ),
        fc.record({
          P: fc.integer({ min: 0, max: 10 }),
          D: fc.integer({ min: 0, max: 10 }),
          C: fc.integer({ min: 0, max: 10 }),
          A: fc.integer({ min: 0, max: 10 }),
        }),
        (partialWeights, slots) => {
          const weights = {
            P: partialWeights.P ?? [],
            D: partialWeights.D ?? [],
            C: partialWeights.C ?? [],
            A: partialWeights.A ?? [],
          };
          const result = normalizeSlotWeights(weights, slots);
          return ROLES.every((role) => result[role].length === slots[role]);
        },
      ),
    );
  });
});
