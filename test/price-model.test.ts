// §6.3 / §12 F5+F8 — Modello di prezzo: prior, ancoraggio, aggiornamento online, cappatura.
// DoD F5: renormalize() soddisfa l'asserzione di §6.3.2 in 200 stati casuali.
// DoD F8: MAE su p̂ scende monotonamente con n; un prezzo anomalo (10×) sposta θ_ρ di < 5%.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_PRICE_CURVES, DEFAULT_PRICE_MODEL_CONFIG, DEFAULT_RESERVE_FRACTION } from '../src/core/config.js';
import type { PriceCurveConfig } from '../src/core/types.js';
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

  it('bug reale trovato su un\'asta vera: poche vendite in una fascia di score STRETTA e alta, con prezzi rumorosi/non monotoni, non deve invertire il segno del prezzo (θ < 0)', () => {
    // Sei portieri reali, tutti fra score 86 e 95 (fascia larga solo 9 punti su 100), prezzi
    // bassi e NON correlati con lo score (il più alto in score, 94, è il più economico, 10 cr).
    // Prima del fix: la pendenza grezza usciva negativa (-9.3), l'intercetta esplodeva per
    // compensare (fino a 11.66 in scala log) e sopravviveva al ridge verso il prior, producendo
    // un prezzo PREVISTO di 313 crediti per score 95 e ancora 106 per score 50 — l'esatto
    // contrario del significato di θ_ρ (§6.3.1: derivato da p_top/p_marg, sempre ≥ 1 per
    // definizione). Vedi anche `test/engine.test.ts` per l'effetto end-to-end su "offri fino a".
    const realGoalkeeperSales: SaleObservation[] = [
      { role: 'P', score: 92, price: 30, order: 0 },
      { role: 'P', score: 95, price: 20, order: 1 },
      { role: 'P', score: 92, price: 20, order: 2 },
      { role: 'P', score: 94, price: 10, order: 3 },
      { role: 'P', score: 90, price: 40, order: 4 },
      { role: 'P', score: 86, price: 30, order: 5 },
    ];
    const fitted = fitOnlinePriceCurves(realGoalkeeperSales, DEFAULT_PRICE_CURVES, DEFAULT_PRICE_MODEL_CONFIG).P;

    expect(fitted.theta).toBeGreaterThanOrEqual(0);

    // Il prezzo previsto dalla curva deve restare (debolmente) crescente in score: MAI il
    // contrario, qualunque sia il rumore nel campione osservato.
    const priceAt = (score: number) => fitted.A * Math.exp((fitted.theta * score) / 100);
    expect(priceAt(95)).toBeGreaterThanOrEqual(priceAt(50));
    expect(priceAt(50)).toBeGreaterThanOrEqual(priceAt(10));
  });

  it('la pendenza grezza non è mai negativa nella curva risultante, per qualunque campione piccolo e rumoroso (property-based)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            score: fc.double({ min: 0, max: 100, noNaN: true }),
            price: fc.double({ min: 1, max: 500, noNaN: true }),
          }),
          { minLength: 5, maxLength: 15 },
        ),
        (points) => {
          const obs: SaleObservation[] = points.map((p, i) => ({ role: 'P', score: p.score, price: p.price, order: i }));
          const fitted = fitOnlinePriceCurves(obs, DEFAULT_PRICE_CURVES, DEFAULT_PRICE_MODEL_CONFIG).P;
          return fitted.theta >= 0;
        },
      ),
    );
  });

  // §7 Session 8, parte 4 — bug reale trovato PROSEGUENDO l'indagine sul caso Meret sopra: quel
  // fix impedisce solo il caso ESTREMO (pendenza che esce negativa). Su un'asta simulata intera,
  // tracciando A_ρ/θ_ρ ogni 25 estrazioni, si osservava un'INSTABILITÀ più generale — pendenza
  // positiva ma che oscillava fra 1.10 e 5.95, intercetta che arrivava a esplodere di 14× rispetto
  // al prior (1.21→16.73) — con n=45 osservazioni, un numero che NON fa scattare il ridge n/(n+n0)
  // in modo forte. Causa: n conta le RIGHE, non quanto le righe siano sparse in score — 45 vendite
  // tutte concentrate in una fascia stretta identificano la pendenza molto peggio di 45 vendite
  // sparse su tutto il range, ma ricevevano lo stesso identico peso. Corretto scalando la
  // numerosità effettiva usata nel ridge dalla dispersione osservata (`sxx`, già calcolato per
  // `thetaStdErr`) contro quella di un campione ben distribuito dello stesso peso totale.
  describe('§7 Session 8 — il peso del ridge tiene conto della dispersione dei punteggi, non solo di n', () => {
    // Prior deliberatamente lontano dal θ "vero" che genera i dati: rende inequivocabile se il
    // fit si stia fidando dei dati (si avvicina a 2) o del prior (resta vicino a 8).
    const farPrior: PriceCurveConfig = {
      P: { A: 1, theta: 8 },
      D: { A: 1, theta: 8 },
      C: { A: 1, theta: 8 },
      A: { A: 1, theta: 8 },
    };
    const config = { ...DEFAULT_PRICE_MODEL_CONFIG, priorCurves: farPrior };
    const trueTheta = 2;
    const trueA = 1;

    function noisyObservations(scores: readonly number[]): SaleObservation[] {
      const rng = mulberry32(7);
      return scores.map((score, i) => {
        const noiseMultiplier = 0.85 + rng() * 0.3; // ±15% circa, deterministico
        const price = trueA * Math.exp((trueTheta * score) / 100) * noiseMultiplier;
        return { role: 'P', score, price, order: i };
      });
    }

    it('lo stesso numero di osservazioni, se concentrate in una fascia stretta, produce un fit più vicino al prior che se sparse su tutto il range', () => {
      const wideScores = Array.from({ length: 30 }, (_, i) => 5 + i * 3); // 5..92, spread pieno
      const narrowScores = Array.from({ length: 30 }, (_, i) => 45 + (i % 11)); // 45..55, fascia stretta

      const wideFit = fitOnlinePriceCurves(noisyObservations(wideScores), farPrior, config).P;
      const narrowFit = fitOnlinePriceCurves(noisyObservations(narrowScores), farPrior, config).P;

      // Stesso n (30) per entrambi: se il fit dipendesse solo da n, θ dovrebbe uscire simile. Con
      // la dispersione considerata, il campione stretto deve restare più vicino al prior (8) di
      // quello sparso, che invece deve potersi avvicinare parecchio al θ vero (2).
      const distWideFromPrior = Math.abs(wideFit.theta - farPrior.P.theta);
      const distNarrowFromPrior = Math.abs(narrowFit.theta - farPrior.P.theta);
      expect(distNarrowFromPrior).toBeLessThan(distWideFromPrior);
      // Il campione sparso deve essersi mosso in modo sostanziale verso il θ vero (non solo "un
      // po' meno lontano dal prior" per rumore casuale).
      expect(wideFit.theta).toBeLessThan(5);
    });

    it('property-based: per qualunque θ vero e qualunque fascia stretta, il fit su una fascia stretta non è mai più lontano dal prior di quello su tutto il range, a parità di n e rumore', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0.5, max: 10, noNaN: true }), // θ vero, anche molto diverso dal prior (8)
          fc.integer({ min: 10, max: 80 }), // centro della fascia stretta
          fc.integer({ min: 1, max: 100 }), // seed per il rumore
          (theta, narrowCenter, seed) => {
            const rng = mulberry32(seed);
            const noisyAt = (scores: readonly number[]): SaleObservation[] =>
              scores.map((score, i) => {
                const noiseMultiplier = 0.85 + rng() * 0.3;
                const price = Math.exp((theta * score) / 100) * noiseMultiplier;
                return { role: 'P', score, price, order: i };
              });

            const wideScores = Array.from({ length: 30 }, (_, i) => 2 + i * 3.3);
            const half = 5;
            const narrowScores = Array.from({ length: 30 }, (_, i) =>
              Math.min(100, Math.max(0, narrowCenter + ((i % (2 * half + 1)) - half))),
            );

            const wideFit = fitOnlinePriceCurves(noisyAt(wideScores), farPrior, config).P;
            const narrowFit = fitOnlinePriceCurves(noisyAt(narrowScores), farPrior, config).P;

            const distWide = Math.abs(wideFit.theta - farPrior.P.theta);
            const distNarrow = Math.abs(narrowFit.theta - farPrior.P.theta);
            // Piccola tolleranza: a parità di meccanismo, il rumore campionario può occasionalmente
            // far pareggiare le due distanze quasi esattamente: quello che NON deve succedere è che
            // il campione stretto si allontani chiaramente di più dal prior di quello sparso.
            return distNarrow <= distWide + 1e-6;
          },
        ),
      );
    });
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
