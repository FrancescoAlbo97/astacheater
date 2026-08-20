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
import fc from 'fast-check';
import { marginalValue, computeFullPlan, type RoleDPInput } from '../src/core/plan-dp.js';
import { approxMaxBid, computeDuals, type DualState } from '../src/core/base-policy.js';
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
  // Un solo slot posseduto vuoto, peso 0.9, filler tale che μ = 0.9 × 100/9 = 10 — stessi numeri
  // qualitativi (mu=10, weight=0.9) delle versioni precedenti di questo test, solo espressi nella
  // nuova forma "rango per valore" invece del vecchio `nextSlotWeight`/`muByRole` per ruolo.
  function duals(overrides: Partial<DualState> = {}): DualState {
    const weights = { P: [0.9], D: [0.9], C: [0.9], A: [0.9] };
    const fillerValueByRole = { P: 100 / 9, D: 100 / 9, C: 100 / 9, A: 100 / 9 };
    return {
      lambda: 1,
      ownedValuesByRole: { P: [], D: [], C: [], A: [] },
      weightsByRole: weights,
      fillerValueByRole,
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
    const d = duals({ lambda: 0.05, fillerValueByRole: { P: 2000 / 9, D: 2000 / 9, C: 2000 / 9, A: 2000 / 9 } });
    const bid = approxMaxBid(10, 'A', d, 1000);
    expect(bid).toBe(0);
  });

  it('λ esattamente 0 (caso degenere residuo) non genera NaN/Infinity', () => {
    const d = duals({ lambda: 0 });
    const bid = approxMaxBid(500, 'A', d, 1000);
    expect(Number.isFinite(bid)).toBe(true);
  });
});

describe('§7 Session 8 — il peso di slot è per RANGO DI VALORE fra i posseduti, non per conteggio', () => {
  // Bug reale segnalato dall'utente: "i calciatori che compro non sono in ordine per peso, quindi
  // considerare il primo acquisto come diretto primo slot è sbagliato". Prima del fix,
  // `nextSlotWeight` era `weights[ownedCount]` — un giocatore ottimo trovato a poco prezzo dopo
  // averne già comprati 6 mediocri riceveva il peso minuscolo del 7° slot, invece di scavalcarli.
  // Alcuni candidati OPZIONALI reali (non solo i posseduti forzati), come nel test "λ resta
  // positivo" più sopra in questo file: senza queste alternative affrontabili la DP statica
  // "satura" subito e λ collassa a 0 — a quel punto `approxMaxBid` ritorna sempre 0 per la guardia
  // di sicurezza (vedi sopra), mascherando qualunque differenza di peso e rendendo il test cieco al
  // bug che dovrebbe intercettare, non perché il fix sia sbagliato.
  const genericOptionalCandidates = [
    { v: 120, price: 20, forced: false },
    { v: 90, price: 12, forced: false },
    { v: 60, price: 6, forced: false },
  ];

  function rolePlanWithOwned(ownedValues: readonly number[], weights: readonly number[]) {
    return {
      candidates: [...ownedValues.map((v) => ({ v, price: 0, forced: true })), ...genericOptionalCandidates],
      fillerValue: 30,
      slotCount: weights.length,
      weights,
    };
  }

  function otherRoleInput() {
    return rolePlanWithOwned([], [0.9, 0.5, 0.3, 0.1]);
  }

  it('un candidato MIGLIORE di tutti i posseduti riceve il peso del 1° slot, non quello del prossimo per conteggio', () => {
    const weights = [0.9, 0.5, 0.3, 0.1];
    // Posseggo già 3 giocatori mediocri (tutti valore 50): per conteggio, il "prossimo" (4°)
    // avrebbe peso 0.1. Ma un candidato di valore 200 è il migliore in assoluto: deve scavalcarli
    // e ricevere il peso del 1° slot (0.9), esattamente come farebbe la DP esatta.
    const roleInputs = { P: rolePlanWithOwned([50, 50, 50], weights), D: otherRoleInput(), C: otherRoleInput(), A: otherRoleInput() };
    const duals = computeDuals({ budget: 400, roleInputs });
    const bidGreat = approxMaxBid(200, 'P', duals, 1000);
    const bidMediocre = approxMaxBid(50, 'P', duals, 1000);
    // Con peso 0.1 (il bug), (0.1*200 - 0.1*30)/λ sarebbe molto più piccolo che con peso 0.9: si
    // verifica il rapporto fra le due offerte per assicurarsi che il candidato ottimo non venga
    // trattato come "quasi indifferente" rispetto a uno mediocre.
    expect(bidGreat).toBeGreaterThan(0);
    expect(bidGreat).toBeGreaterThan(bidMediocre * 2);
  });

  it('un candidato PEGGIORE di tutti i posseduti riceve comunque il peso dell\'ultimo slot, non quello del 1°', () => {
    const weights = [0.9, 0.5, 0.3, 0.1];
    // Posseggo già 3 fenomeni (valore 300): un candidato mediocre (valore 40) è comunque
    // valutato per quello che vale DAVVERO rispetto a loro — il suo rango vero è il 4°, peso 0.1 —
    // non il 4° per conteggio, che qui casualmente coincide, ma la logica dev'essere quella del
    // valore: si verifica confrontando con uno scenario a 0 posseduti dove lo stesso identico
    // candidato riceverebbe il peso del 1° slot (0.9), un'offerta molto più alta.
    const roleInputsOwned = { P: rolePlanWithOwned([300, 300, 300], weights), D: otherRoleInput(), C: otherRoleInput(), A: otherRoleInput() };
    const roleInputsEmpty = { P: rolePlanWithOwned([], weights), D: otherRoleInput(), C: otherRoleInput(), A: otherRoleInput() };
    const dualsOwned = computeDuals({ budget: 400, roleInputs: roleInputsOwned });
    const dualsEmpty = computeDuals({ budget: 400, roleInputs: roleInputsEmpty });
    const bidWhenBehindPhenomena = approxMaxBid(40, 'P', dualsOwned, 1000);
    const bidIfItWereTheBest = approxMaxBid(40, 'P', dualsEmpty, 1000);
    expect(bidWhenBehindPhenomena).toBeLessThan(bidIfItWereTheBest);
  });

  it('l\'ordine con cui i posseduti sono stati acquistati non conta, solo il loro valore (property-based)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 1, max: 300, noNaN: true }), { minLength: 1, maxLength: 6 }),
        fc.double({ min: 1, max: 300, noNaN: true }),
        (ownedValues, candidateValue) => {
          const weights = [0.9, 0.6, 0.4, 0.25, 0.15, 0.1, 0.05];
          const roleInputsInOrder = { P: rolePlanWithOwned(ownedValues, weights), D: otherRoleInput(), C: otherRoleInput(), A: otherRoleInput() };
          const roleInputsShuffled = { P: rolePlanWithOwned(ownedValues.slice().reverse(), weights), D: otherRoleInput(), C: otherRoleInput(), A: otherRoleInput() };
          const dualsInOrder = computeDuals({ budget: 500, roleInputs: roleInputsInOrder });
          const dualsShuffled = computeDuals({ budget: 500, roleInputs: roleInputsShuffled });
          const bidInOrder = approxMaxBid(candidateValue, 'P', dualsInOrder, 100000);
          const bidShuffled = approxMaxBid(candidateValue, 'P', dualsShuffled, 100000);
          return bidInOrder === bidShuffled;
        },
      ),
    );
  });
});
