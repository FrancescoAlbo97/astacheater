// §6.6/§6.7 base-policy.ts — regressione per un bug reale trovato durante lo sviluppo: la
// pianificazione statica a prezzi FISSI usata per i "duali" spesso trova che il proprio piano
// ottimo costa MENO del budget residuo (nessun modo di rappresentare "pagare più del p̂ atteso"
// per un candidato specifico), quindi la differenza discreta all'ultimo credito esatto può essere
// zero molto prima che l'asta finisca davvero. Se non gestito, questo azzera `approxMaxBid` per
// QUALUNQUE candidato successivo — indipendentemente da quanto valga più del suo sostituto — ed è
// la causa primaria del sotto-speso osservato in simulazione (crediti non spesi molto oltre la
// banda attesa di §9.5). Vedi il commento in cima a `marginalValue` (plan-dp.ts) e ad
// `approxMaxBid` (base-policy.ts) per la spiegazione completa.
import { describe, expect, it } from 'vitest';
import { marginalValue, computeFullPlan, type RoleDPInput } from '../src/core/plan-dp.js';
import { approxMaxBid, type DualState } from '../src/core/base-policy.js';
import { ROLES } from '../src/core/types.js';
import type { Role } from '../src/core/types.js';

describe('§6.5/§6.6 marginalValue — non deve azzerarsi su un plateau precoce dell’inviluppo', () => {
  it('trova all’indietro l’ultimo scatto di valore reale invece di guardare solo l’ultimo credito', () => {
    // L'inviluppo cresce fino a b=2, poi resta piatto: un manager con budget=5 il cui piano ottimo
    // costa solo 2 ha ancora un λ rappresentativo di "quanto valeva l'ultimo acquisto reale" (5),
    // non zero.
    const h = new Float64Array([0, 5, 10, 10, 10, 10]);
    expect(marginalValue(h, 5)).toBeCloseTo(5, 6);
    expect(marginalValue(h, 2)).toBeCloseTo(5, 6);
    expect(marginalValue(h, 1)).toBeCloseTo(5, 6);
  });

  it('resta 0 se l’intero inviluppo è piatto (niente da comprare a nessun prezzo)', () => {
    const h = new Float64Array([3, 3, 3, 3]);
    expect(marginalValue(h, 3)).toBe(0);
  });

  it('λ resta positivo quando il budget residuo eccede il costo del piano ottimo a prezzi fissi', () => {
    // Scenario deliberatamente "ricco": pochi candidati economici, budget molto più alto del
    // necessario per comprarli tutti — esattamente la situazione che faceva collassare λ a 0.
    const weights = [0.9, 0.5, 0.2];
    const roleInputs = {} as Record<Role, RoleDPInput>;
    for (const role of ROLES) {
      roleInputs[role] = {
        candidates: [
          { v: 200, price: 20, forced: false },
          { v: 150, price: 15, forced: false },
          { v: 80, price: 5, forced: false },
        ],
        fillerValue: 30,
        slotCount: 3,
        weights,
      };
    }
    const plan = computeFullPlan({ budget: 400, roleInputs }); // budget molto oltre il necessario
    expect(plan.lambda).toBeGreaterThan(0);
  });
});

describe('§6.6 approxMaxBid — regressione sotto-speso', () => {
  function duals(overrides: Partial<DualState> = {}): DualState {
    return {
      lambda: 1,
      nextSlotWeight: { P: 0.9, D: 0.9, C: 0.9, A: 0.9 },
      muByRole: { P: 10, D: 10, C: 10, A: 10 },
      ...overrides,
    };
  }

  it('offre di più per un candidato chiaramente sopra il sostituto, non zero, quando λ è piccolo ma positivo', () => {
    const d = duals({ lambda: 0.05 });
    const bid = approxMaxBid(500, 'A', d, 1000);
    expect(bid).toBeGreaterThan(0);
  });

  it('non esplode oltre il massimo affrontabile', () => {
    const d = duals({ lambda: 0.01 });
    const bid = approxMaxBid(500, 'A', d, 250);
    expect(bid).toBeLessThanOrEqual(250);
  });

  it('un candidato peggiore del sostituto (numeratore negativo) resta a 0 anche con λ minuscolo', () => {
    const d = duals({ lambda: 0.05, muByRole: { P: 200, D: 200, C: 200, A: 200 } });
    const bid = approxMaxBid(10, 'A', d, 1000);
    expect(bid).toBe(0);
  });

  it('λ esattamente 0 (caso degenere residuo) non genera NaN/Infinity', () => {
    const d = duals({ lambda: 0 });
    const bid = approxMaxBid(500, 'A', d, 1000);
    expect(Number.isFinite(bid)).toBe(true);
  });
});
