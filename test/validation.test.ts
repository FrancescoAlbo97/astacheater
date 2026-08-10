// §10 / §12 F10 — Validazione: oracolo, metriche, criteri A1-A9.
//
// ATTENZIONE — stato onesto dei criteri A1-A9, misurato con `npx tsx src/sim/cli.ts validate 60`
// (riproducibile, vedi src/sim/cli.ts):
//
//   A1 quotaGapColmata media           ≥ 0.50   → misurato 0.91   → OK
//   A2 vittorie vs targetChaser        ≥ 70%    → misurato 46.7%  → NON SODDISFATTO
//   A3 media di gapFilled positiva a ogni ρ      → misurato: negativa a ρ=0.65 → NON SODDISFATTO
//   A4 crisi di slot                   = 0       → misurato 0/60  → OK
//   A5 mediana crediti non spesi       ≤ 8       → misurato 238   → NON SODDISFATTO
//   A6 (residui di calibrazione)       — non ancora misurato in un report completo
//   A7 (robustezza al rumore ±10 pt)   — non ancora misurato
//   A8 (non sfruttabilità 9+1)         — non ancora misurato
//   A9 (R² del surrogato) ≥ 0.97       → misurato ≈0.84 vincolato (vedi test/value-surrogate.test.ts)
//
// A2/A3/A5 condividono la stessa causa radice già isolata e documentata in test/sim.test.ts
// (§9.5): la dinamica competitiva del simulatore non è ancora ben calibrata (troppi crediti
// inutilizzati, differenziazione di prezzo insufficiente sui top). A1 e A4 passano già: il motore
// batte nettamente la peggiore politica naive in media, e non si verificano mai crisi di slot.
// Il debito tecnico è nella CALIBRAZIONE del simulatore, non nell'infrastruttura di validazione
// (oracolo, metriche, ablazione appaiata) testata qui, che è corretta e riproducibile.
//
// Questo file copre quindi la CORRETTEZZA delle funzioni di oracle.ts/metrics.ts in isolamento
// (con istanze piccole e verificabili a mano), non la validazione a scala piena su 5.000 aste,
// che resta un comando CLI riproducibile ma richiede una calibrazione migliore per essere
// significativa come gate di accettazione.
import { describe, expect, it } from 'vitest';
import { computeOracleValue } from '../src/sim/oracle.js';
import { evaluateFinalRoster, quotaGapColmata, summarizeAblation } from '../src/sim/metrics.js';
import { computeFullPlan, type RoleDPInput } from '../src/core/plan-dp.js';
import { playerValue } from '../src/core/value-model.js';
import { DEFAULT_SLOTS, makeDefaultLeagueConfig } from '../src/core/config.js';
import { mulberry32 } from '../src/core/rng.js';
import { ROLES } from '../src/core/types.js';
import type { ManagerState, Role } from '../src/core/types.js';

describe('§10.2 computeOracleValue', () => {
  it('coincide con la DP esatta calcolata a mano sugli stessi prezzi realizzati', () => {
    const sales = [
      { playerId: 'a1', role: 'A' as Role, managerId: 'x', price: 50, drawIndex: 0 },
      { playerId: 'a2', role: 'A' as Role, managerId: 'y', price: 10, drawIndex: 1 },
      { playerId: 'd1', role: 'D' as Role, managerId: 'x', price: 5, drawIndex: 2 },
    ];
    const scoresById = new Map([
      ['a1', 90],
      ['a2', 40],
      ['d1', 60],
    ]);
    const leagueSlots = { P: 0, D: 1, C: 0, A: 1 };
    // Pesi su misura per questo scenario ridotto: la lunghezza deve coincidere con leagueSlots
    // (DEFAULT_SLOT_WEIGHTS è pensato per la lega standard 3/8/8/6, non per slot arbitrari).
    const slotWeights = { P: [], D: [1.0], C: [], A: [1.0] };
    const budget = 100;

    const oracle = computeOracleValue({ sales, scoresById, leagueSlots, budget, slotWeights });

    // Verifica indipendente: costruisco la stessa DP a mano con plan-dp.ts direttamente.
    const roleInputs = {} as Record<Role, RoleDPInput>;
    for (const role of ROLES) {
      const roleSales = sales.filter((s) => s.role === role);
      roleInputs[role] = {
        candidates: roleSales.map((s) => ({ v: playerValue(role, scoresById.get(s.playerId)!), price: s.price, forced: false })),
        fillerValue: playerValue(role, 20),
        slotCount: leagueSlots[role],
        weights: slotWeights[role],
      };
    }
    const expected = computeFullPlan({ budget, roleInputs }).phi;
    expect(oracle).toBeCloseTo(expected, 6);
  });

  it('è monotona non decrescente nel budget disponibile', () => {
    const sales = [{ playerId: 'a1', role: 'A' as Role, managerId: 'x', price: 30, drawIndex: 0 }];
    const scoresById = new Map([['a1', 80]]);
    const leagueSlots = { P: 0, D: 0, C: 0, A: 1 };
    const slotWeights = { P: [], D: [], C: [], A: [1.0] };
    const low = computeOracleValue({ sales, scoresById, leagueSlots, budget: 30, slotWeights });
    const high = computeOracleValue({ sales, scoresById, leagueSlots, budget: 100, slotWeights });
    expect(high).toBeGreaterThanOrEqual(low);
  });
});

describe('§10.2 quotaGapColmata', () => {
  it('= 1 quando il motore eguaglia l\'oracolo', () => {
    expect(quotaGapColmata(100, 50, 100)).toBeCloseTo(1, 6);
  });

  it('= 0 quando il motore eguaglia la peggiore naive', () => {
    expect(quotaGapColmata(50, 50, 100)).toBeCloseTo(0, 6);
  });

  it('= 0.5 a metà strada', () => {
    expect(quotaGapColmata(75, 50, 100)).toBeCloseTo(0.5, 6);
  });

  it('gestisce senza eccezioni un denominatore quasi nullo', () => {
    expect(() => quotaGapColmata(50, 50, 50)).not.toThrow();
    expect(quotaGapColmata(50, 50, 50)).toBe(0);
  });
});

describe('§10 summarizeAblation', () => {
  it('identifica correttamente la peggiore naive e le vittorie del motore', () => {
    const summary = summarizeAblation(100, { ratio: 60, fixedSplit: 80, targetChaser: 90 }, 120);
    expect(summary.naiveBest).toBe(90);
    expect(summary.motoreWinsVsEach.ratio).toBe(true);
    expect(summary.motoreWinsVsEach.targetChaser).toBe(true);
    expect(summary.gapFilled).toBeCloseTo((100 - 90) / (120 - 90), 6);
  });
});

describe('§10 evaluateFinalRoster', () => {
  it('una rosa migliore (score più alti) vale di più di una rosa peggiore', () => {
    const league = makeDefaultLeagueConfig();
    const rng = mulberry32(1);

    function buildRoster(scoreFn: (role: Role, i: number) => number): ManagerState {
      const roster = ROLES.flatMap((role) =>
        Array.from({ length: DEFAULT_SLOTS[role] }, (_, i) => ({
          player: { id: `${role}-${i}`, name: `${role}-${i}`, team: 't', role },
          price: 1,
        })),
      );
      return {
        manager: { id: 'me', name: 'me', isMe: true },
        creditsRemaining: 0,
        slotsRemaining: { P: 0, D: 0, C: 0, A: 0 },
        roster,
      };
    }

    const weak = buildRoster(() => 20);
    const strong = buildRoster(() => 80);
    const scoresById = new Map<string, number>();
    for (const role of ROLES) {
      for (let i = 0; i < DEFAULT_SLOTS[role]; i++) {
        scoresById.set(`${role}-${i}`, 20);
      }
    }
    const scoresByIdStrong = new Map<string, number>();
    for (const role of ROLES) {
      for (let i = 0; i < DEFAULT_SLOTS[role]; i++) {
        scoresByIdStrong.set(`${role}-${i}`, 80);
      }
    }

    const weakValue = evaluateFinalRoster(weak, scoresById, league.formations, rng, 300);
    const strongValue = evaluateFinalRoster(strong, scoresByIdStrong, league.formations, rng, 300);
    expect(strongValue).toBeGreaterThan(weakValue);
  });
});
