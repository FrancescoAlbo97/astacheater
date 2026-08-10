// §6.3 / §12 F5+F8 — Modello di prezzo: prior, ancoraggio, aggiornamento online, cappatura.
// DoD F5: renormalize() soddisfa l'asserzione di §6.3.2 in 200 stati casuali.
// DoD F8: MAE su p̂ scende monotonamente con n; un prezzo anomalo (10×) sposta θ_ρ di < 5%.
import { describe, expect, it } from 'vitest';
import { DEFAULT_PRICE_CURVES, DEFAULT_PRICE_MODEL_CONFIG, DEFAULT_RESERVE_FRACTION } from '../src/core/config.js';
import {
  capByResidualDemand,
  fitOnlinePriceCurves,
  inflationFactor,
  priorPrice,
  renormalize,
  type PoolPlayer,
  type SaleObservation,
} from '../src/core/price-model.js';
import { mulberry32, randInt, randNormal } from '../src/core/rng.js';
import { ROLES } from '../src/core/types.js';
import type { CeilingInfo, ManagerState, Role } from '../src/core/types.js';

function randomState(rng: () => number, seed: number) {
  const numManagers = 3 + randInt(rng, 8); // 3..10
  const managers: ManagerState[] = Array.from({ length: numManagers }, (_, i) => {
    const slotsRemaining = {
      P: randInt(rng, 4),
      D: randInt(rng, 9),
      C: randInt(rng, 9),
      A: randInt(rng, 7),
    };
    const k = slotsRemaining.P + slotsRemaining.D + slotsRemaining.C + slotsRemaining.A;
    const creditsRemaining = k === 0 ? 0 : k - 1 + randInt(rng, 500);
    return {
      manager: { id: `m${i}`, name: `m${i}`, isMe: i === 0 },
      creditsRemaining,
      slotsRemaining,
      roster: [],
    };
  });

  const poolSize = 50 + randInt(rng, 200);
  const pool: PoolPlayer[] = Array.from({ length: poolSize }, (_, i) => ({
    id: `p${seed}-${i}`,
    role: ROLES[randInt(rng, ROLES.length)]!,
    score: rng() * 100,
  }));

  return { managers, pool };
}

describe('§6.3.2 renormalize — asserzione su 200 stati casuali', () => {
  it('|Σ_buySet p̂ - (Ctot - riserva)| ≤ 0.02·Ctot in ogni stato', () => {
    const rng = mulberry32(2024);
    for (let seed = 0; seed < 200; seed++) {
      const { managers, pool } = randomState(rng, seed);
      const result = renormalize(pool, managers, DEFAULT_PRICE_CURVES, DEFAULT_RESERVE_FRACTION);
      const tolerance = 0.02 * result.ctot;
      expect(result.residual, `seed=${seed} ctot=${result.ctot}`).toBeLessThanOrEqual(
        tolerance + 1e-6,
      );
    }
  });

  it('ogni p̂ è un intero ≥ 1', () => {
    const rng = mulberry32(7);
    const { managers, pool } = randomState(rng, 0);
    const result = renormalize(pool, managers, DEFAULT_PRICE_CURVES, DEFAULT_RESERVE_FRACTION);
    for (const p of pool) {
      const v = result.pHat.get(p.id)!;
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
    }
  });

  it('a zero manager con slot residui il buySet è vuoto e tutti restano a 1', () => {
    const pool: PoolPlayer[] = [
      { id: 'a', role: 'A', score: 90 },
      { id: 'b', role: 'D', score: 50 },
    ];
    const managers: ManagerState[] = [
      {
        manager: { id: 'm0', name: 'm0', isMe: true },
        creditsRemaining: 100,
        slotsRemaining: { P: 0, D: 0, C: 0, A: 0 },
        roster: [],
      },
    ];
    const result = renormalize(pool, managers, DEFAULT_PRICE_CURVES, DEFAULT_RESERVE_FRACTION);
    expect(result.pHat.get('a')).toBe(1);
    expect(result.pHat.get('b')).toBe(1);
  });
});

describe('§6.3.1 priorPrice', () => {
  it('B_j = A_ρ · exp(θ_ρ · s/100), cresce con lo score', () => {
    const role: Role = 'A';
    const low = priorPrice(role, 10, DEFAULT_PRICE_CURVES);
    const high = priorPrice(role, 90, DEFAULT_PRICE_CURVES);
    expect(high).toBeGreaterThan(low);
  });
});

describe('§6.3.3 / F8 fitOnlinePriceCurves', () => {
  const TRUE_A = 2.0;
  const TRUE_THETA = 9.0;
  const ROLE: Role = 'A';

  function trueCurvePrice(score: number): number {
    return TRUE_A * Math.exp((TRUE_THETA * score) / 100);
  }

  function generateObservations(rng: () => number, count: number, noiseSigma: number): SaleObservation[] {
    return Array.from({ length: count }, (_, i) => {
      const score = rng() * 100;
      const price = Math.max(1, trueCurvePrice(score) * Math.exp(randNormal(rng) * noiseSigma));
      return { role: ROLE, score, price, order: i };
    });
  }

  it('l\'errore medio assoluto su p̂ scende (in media) al crescere di n', () => {
    const sampleSizes = [5, 10, 20, 40, 80, 160];
    const queryScores = [10, 25, 40, 55, 70, 85, 95];
    const maeBySample: number[] = sampleSizes.map(() => 0);
    const seeds = 8;

    for (let seed = 0; seed < seeds; seed++) {
      const rng = mulberry32(1000 + seed);
      const allObs = generateObservations(rng, sampleSizes[sampleSizes.length - 1]!, 0.4);
      sampleSizes.forEach((n, idx) => {
        const curves = fitOnlinePriceCurves(allObs.slice(0, n), DEFAULT_PRICE_CURVES, DEFAULT_PRICE_MODEL_CONFIG);
        const fitted = curves[ROLE];
        const mae =
          queryScores.reduce((s, score) => {
            const predicted = fitted.A * Math.exp((fitted.theta * score) / 100);
            return s + Math.abs(predicted - trueCurvePrice(score));
          }, 0) / queryScores.length;
        maeBySample[idx] = maeBySample[idx]! + mae / seeds;
      });
    }

    // eslint-disable-next-line no-console
    console.log('MAE per n osservazioni:', sampleSizes.map((n, i) => `n=${n}:${maeBySample[i]!.toFixed(2)}`).join(' '));
    // Monotonicità in media (non punto a punto, il rumore lo impedirebbe): il primo campione
    // (n minimo) deve avere MAE chiaramente più alto dell'ultimo (n massimo).
    expect(maeBySample[0]!).toBeGreaterThan(maeBySample[maeBySample.length - 1]!);
    // E la tendenza complessiva non deve invertirsi grossolanamente a metà.
    const mid = Math.floor(maeBySample.length / 2);
    expect(maeBySample[0]!).toBeGreaterThanOrEqual(maeBySample[mid]!);
  });

  it('un singolo prezzo anomalo (10×) sposta θ_ρ di meno del 5% (§13.4)', () => {
    const rng = mulberry32(42);
    const obs = generateObservations(rng, 30, 0.15);
    const baseline = fitOnlinePriceCurves(obs, DEFAULT_PRICE_CURVES, DEFAULT_PRICE_MODEL_CONFIG)[ROLE];

    const withAnomaly = obs.slice();
    withAnomaly[0] = { ...withAnomaly[0]!, price: withAnomaly[0]!.price * 10 };
    const perturbed = fitOnlinePriceCurves(withAnomaly, DEFAULT_PRICE_CURVES, DEFAULT_PRICE_MODEL_CONFIG)[ROLE];

    const relativeShift = Math.abs(perturbed.theta - baseline.theta) / Math.abs(baseline.theta);
    // eslint-disable-next-line no-console
    console.log(`θ baseline=${baseline.theta.toFixed(4)} con anomalia=${perturbed.theta.toFixed(4)} shift=${(relativeShift * 100).toFixed(2)}%`);
    expect(relativeShift).toBeLessThan(0.05);
  });

  it('ruoli con n < minObservationsForOwnFit usano il prior globale riscalato da κ, non una regressione propria', () => {
    const fewObs: SaleObservation[] = [
      { role: 'P', score: 50, price: 20, order: 0 },
      { role: 'P', score: 60, price: 25, order: 1 },
    ];
    const result = fitOnlinePriceCurves(fewObs, DEFAULT_PRICE_CURVES, DEFAULT_PRICE_MODEL_CONFIG);
    expect(result.P.theta).toBe(DEFAULT_PRICE_CURVES.P.theta);
    expect(result.P.confidence).toBe('bassa');
  });

  it('etichette di confidenza rispettano le soglie n_ρ < 8 / < 25 / ≥ 25', () => {
    const rng = mulberry32(3);
    for (const n of [10, 15, 30]) {
      const obs = generateObservations(rng, n, 0.2);
      const fitted = fitOnlinePriceCurves(obs, DEFAULT_PRICE_CURVES, DEFAULT_PRICE_MODEL_CONFIG)[ROLE];
      if (n < 25) expect(fitted.confidence).toBe('media');
      else expect(fitted.confidence).toBe('alta');
    }
  });
});

describe('§6.3.4 capByResidualDemand', () => {
  it('p̂ non supera mai C² + 1', () => {
    const ceiling: CeilingInfo = { c1: 100, c2: 40, holder1: null, holder2: null, myMax: 200 };
    expect(capByResidualDemand(999, ceiling)).toBe(41);
    expect(capByResidualDemand(10, ceiling)).toBe(10);
  });
});

describe('§6.3.3 inflationFactor', () => {
  it('vale 1 con nessuna vendita registrata', () => {
    expect(inflationFactor([], DEFAULT_PRICE_CURVES)).toBe(1);
  });

  it('> 1 se i prezzi realizzati superano sistematicamente il prior (raw, pre-ancoraggio)', () => {
    // priorPrice() non è ancora ancorato ai crediti reali (lo fa renormalize()): per testare
    // inflationFactor in isolamento si costruiscono prezzi come multiplo esplicito del prior.
    const sales = [
      { role: 'A' as Role, score: 80 },
      { role: 'D' as Role, score: 50 },
    ].map((s) => ({ ...s, price: 1.5 * priorPrice(s.role, s.score, DEFAULT_PRICE_CURVES) }));
    const kappa = inflationFactor(sales, DEFAULT_PRICE_CURVES);
    expect(kappa).toBeCloseTo(1.5, 6);
  });
});
