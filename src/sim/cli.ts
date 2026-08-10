#!/usr/bin/env node
// §9.3 entry point Node. Comandi:
//   npx tsx src/sim/cli.ts bench [N]        — N aste (default 200), tempo e controlli §9.5
//   npx tsx src/sim/cli.ts calibrate [...]  — self-play (§9.4), scrive data/defaults.json
//   npx tsx src/sim/cli.ts validate [N]     — ablazione appaiata (§10.1), oracolo (§10.2), A1-A5

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  DEFAULT_PRICE_MODEL_CONFIG,
  DEFAULT_ROLLOUT_CONFIG,
  DEFAULT_SLOT_WEIGHTS,
  DEFAULT_VALUE_CURVES,
  makeDefaultLeagueConfig,
} from '../core/config.js';
import { ROLES } from '../core/types.js';
import { mulberry32 } from '../core/rng.js';
import { runAuctionSim, type AuctionSimConfig } from './auction-sim.js';
import type { ArchetypeId } from './archetypes.js';
import { calibratePrior } from './selfplay-calibrate.js';
import { computeOracleValue } from './oracle.js';
import { evaluateFinalRoster, summarizeAblation } from './metrics.js';

const REALISTIC_MIX: ArchetypeId[] = [
  'rational',
  'earlyEnthusiast',
  'latePanicker',
  'fanboy',
  'roleCapper',
  'anchored',
  'budgetSplitter',
  'earlyEnthusiast',
  'latePanicker',
  'fanboy',
];

function baseConfig(seed: number, rho: number): AuctionSimConfig {
  return {
    league: makeDefaultLeagueConfig(),
    seed,
    rho,
    archetypesByManager: REALISTIC_MIX,
    priceModelConfig: DEFAULT_PRICE_MODEL_CONFIG,
    valueCurves: DEFAULT_VALUE_CURVES,
    slotWeights: DEFAULT_SLOT_WEIGHTS,
    priceNoiseSigma: DEFAULT_ROLLOUT_CONFIG.priceNoiseSigma,
    dualsRecalcEveryDraws: DEFAULT_ROLLOUT_CONFIG.dualsRecalcEveryDraws,
    dualsRecalcOnBudgetDropFraction: DEFAULT_ROLLOUT_CONFIG.dualsRecalcOnBudgetDropFraction,
  };
}

function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function cmdBench(n: number): void {
  const rhos = [0.5, 0.65, 0.8, 0.9, 0.95];
  console.log(`Eseguo ${n} aste (mix realistico di archetipi, ρ variabile)...`);
  const start = performance.now();
  const results = Array.from({ length: n }, (_, i) => runAuctionSim(baseConfig(i, rhos[i % rhos.length]!)));
  const elapsedSec = (performance.now() - start) / 1000;
  const perAuctionMs = (elapsedSec * 1000) / n;

  console.log(`\nTempo totale: ${elapsedSec.toFixed(1)}s (${perAuctionMs.toFixed(1)}ms/asta)`);
  console.log(`Proiezione 5.000 aste: ${((perAuctionMs * 5000) / 1000).toFixed(1)}s`);

  const slotCrises = results.filter((r) => r.slotCrisisCount > 0).length;
  console.log(`\n§9.5 controlli di realismo:`);
  console.log(`  Aste con crisi di slot: ${slotCrises}/${n} (atteso: 0)`);

  const unspent = results.flatMap((r) => r.finalManagers.map((m) => m.creditsRemaining));
  console.log(`  Crediti non spesi per manager, mediana: ${median(unspent)} (atteso: 0-15)`);

  const maxPrices = results.map((r) => Math.max(...r.sales.map((s) => s.price)));
  console.log(`  Prezzo più caro per asta, mediana: ${median(maxPrices)} (atteso: 120-260)`);

  const oneCreditCounts = results.map((r) => r.sales.filter((s) => s.price === 1).length);
  console.log(`  Venduti a 1 credito per asta, mediana: ${median(oneCreditCounts)} (atteso: 60-110)`);

  const totalsByRole: Record<string, number> = { P: 0, D: 0, C: 0, A: 0 };
  let total = 0;
  for (const r of results) for (const s of r.sales) {
    totalsByRole[s.role] = (totalsByRole[s.role] ?? 0) + s.price;
    total += s.price;
  }
  console.log(`  Quota di budget per ruolo:`);
  for (const role of ROLES) {
    console.log(`    ${role}: ${((totalsByRole[role]! / total) * 100).toFixed(1)}%`);
  }
}

function cmdCalibrate(auctionsPerIteration: number, maxIterations: number): void {
  console.log(
    `Calibrazione self-play: ${auctionsPerIteration} aste/iterazione, fino a ${maxIterations} iterazioni, due modalità (allRational + realisticMix)...`,
  );
  const start = performance.now();
  const result = calibratePrior({
    league: makeDefaultLeagueConfig(),
    auctionsPerIteration,
    maxIterations,
    convergenceTolerance: 0.05,
    rhoValues: [0.5, 0.65, 0.8, 0.9, 0.95],
    baseSeed: 1,
    archetypesByManager: REALISTIC_MIX,
  });
  const elapsedSec = (performance.now() - start) / 1000;

  console.log(`\nCompletato in ${elapsedSec.toFixed(1)}s.`);
  console.log(
    `  allRational: ${result.allRational.iterations} iterazioni, convergenza=${result.allRational.converged}`,
  );
  console.log(
    `  realisticMix: ${result.realisticMix.iterations} iterazioni, convergenza=${result.realisticMix.converged}`,
  );
  console.log('\nθ_ρ / A_ρ calibrati (media pesata 0.35/0.65):');
  for (const role of ROLES) {
    console.log(
      `  ${role}: A=${result.priceCurves[role].A.toFixed(3)} θ=${result.priceCurves[role].theta.toFixed(3)} quota budget=${(result.budgetShares[role] * 100).toFixed(1)}%`,
    );
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const defaultsPath = join(here, '..', '..', 'data', 'defaults.json');
  const existing = existsSync(defaultsPath) ? JSON.parse(readFileSync(defaultsPath, 'utf-8')) : {};
  const updated = {
    ...existing,
    priceModel: {
      method: 'Calibrazione self-play a punto fisso (§9.4): media pesata 0.35 allRational / 0.65 realisticMix.',
      auctionsPerIteration,
      maxIterations,
      priceCurves: result.priceCurves,
      budgetShares: result.budgetShares,
      allRational: { iterations: result.allRational.iterations, converged: result.allRational.converged },
      realisticMix: { iterations: result.realisticMix.iterations, converged: result.realisticMix.converged },
    },
  };
  writeFileSync(defaultsPath, JSON.stringify(updated, null, 2) + '\n');
  console.log(`\nScritto in ${defaultsPath}`);
}

const NAIVE_POLICIES: ArchetypeId[] = ['ratio', 'fixedSplit', 'targetChaser'];

function cmdValidate(n: number): void {
  const league = makeDefaultLeagueConfig();
  const rhos = [0.5, 0.65, 0.8, 0.9, 0.95];
  const evalRng = mulberry32(999); // valutazione finale (lineup-sim): stream separato dall'asta

  console.log(`Validazione ad ablazione appaiata: ${n} seed, motore vs ${NAIVE_POLICIES.join('/')}, oracolo (§10.1-10.2)...`);
  const start = performance.now();

  const gapFilledSamples: number[] = [];
  const gapFilledByRho = new Map<number, number[]>();
  const winsVsEach: Record<string, number> = { ratio: 0, fixedSplit: 0, targetChaser: 0 };
  let slotCrises = 0;
  const unspentSamples: number[] = [];

  for (let i = 0; i < n; i++) {
    const seed = 10_000 + i;
    const rho = rhos[i % rhos.length]!;
    const cfg = (archetypesByManager: ArchetypeId[]) => ({ ...baseConfig(seed, rho), archetypesByManager });

    const motoreMix: ArchetypeId[] = ['rational', ...REALISTIC_MIX.slice(1)];
    const motoreResult = runAuctionSim(cfg(motoreMix));
    if (motoreResult.slotCrisisCount > 0) slotCrises++;
    unspentSamples.push(motoreResult.finalManagers[0]!.creditsRemaining);

    const scoresById = motoreResult.scenario.scoresByManager[0]!;
    const motoreValue = evaluateFinalRoster(motoreResult.finalManagers[0]!, scoresById, league.formations, evalRng, 500);
    const oracleValue = computeOracleValue({
      sales: motoreResult.sales,
      scoresById,
      leagueSlots: league.slots,
      budget: league.budget,
      slotWeights: DEFAULT_SLOT_WEIGHTS,
    });

    const naiveValues: Record<string, number> = {};
    for (const naive of NAIVE_POLICIES) {
      const mix: ArchetypeId[] = [naive, ...REALISTIC_MIX.slice(1)];
      const result = runAuctionSim(cfg(mix));
      const value = evaluateFinalRoster(result.finalManagers[0]!, scoresById, league.formations, evalRng, 500);
      naiveValues[naive] = value;
      if (motoreValue > value) winsVsEach[naive] = (winsVsEach[naive] ?? 0) + 1;
    }

    const summary = summarizeAblation(motoreValue, naiveValues, oracleValue);
    gapFilledSamples.push(summary.gapFilled);
    const byRho = gapFilledByRho.get(rho) ?? [];
    byRho.push(summary.gapFilled);
    gapFilledByRho.set(rho, byRho);
  }

  const elapsedSec = (performance.now() - start) / 1000;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

  console.log(`\nCompletato in ${elapsedSec.toFixed(1)}s (${n} seed).\n`);
  console.log('§10.3 criteri di accettazione numerici:');
  const a1 = mean(gapFilledSamples);
  console.log(`  A1 quotaGapColmata media: ${a1.toFixed(3)} (soglia ≥ 0.50) → ${a1 >= 0.5 ? 'OK' : 'NON SODDISFATTO'}`);
  const a2 = (winsVsEach.targetChaser ?? 0) / n;
  console.log(`  A2 vittorie vs targetChaser: ${(a2 * 100).toFixed(1)}% (soglia ≥ 70%) → ${a2 >= 0.7 ? 'OK' : 'NON SODDISFATTO'}`);
  console.log('  A3 media di gapFilled per ρ (positiva ovunque richiesta come proxy di vittoria media):');
  let a3ok = true;
  for (const rho of rhos) {
    const vals = gapFilledByRho.get(rho) ?? [];
    const m = vals.length > 0 ? mean(vals) : NaN;
    if (!(m > 0)) a3ok = false;
    console.log(`    ρ=${rho}: ${m.toFixed(3)}`);
  }
  console.log(`  A3 → ${a3ok ? 'OK' : 'NON SODDISFATTO'}`);
  console.log(`  A4 crisi di slot: ${slotCrises}/${n} (soglia 0) → ${slotCrises === 0 ? 'OK' : 'NON SODDISFATTO'}`);
  const a5 = median(unspentSamples);
  console.log(`  A5 mediana crediti non spesi (motore): ${a5} (soglia ≤ 8) → ${a5 <= 8 ? 'OK' : 'NON SODDISFATTO'}`);
  console.log(
    '\n  A6-A9 non calcolati da questo comando: A6 richiede il report diagnostico completo (in sviluppo),',
  );
  console.log('  A7 richiede una passata con rumore sui propri score, A8 richiede 9 motori + 1 naive,');
  console.log('  A9 (R² del surrogato) è già misurato in F4/test/value-surrogate.test.ts: ≈0.84 vincolato,');
  console.log('  sotto la soglia 0.97 nominale — scostamento documentato in quel file.');
}

const [, , command, ...rest] = process.argv;

switch (command) {
  case 'bench':
    cmdBench(Number(rest[0] ?? 200));
    break;
  case 'calibrate':
    cmdCalibrate(Number(rest[0] ?? 300), Number(rest[1] ?? 6));
    break;
  case 'validate':
    cmdValidate(Number(rest[0] ?? 100));
    break;
  default:
    console.log('Uso: tsx src/sim/cli.ts <bench [N]|calibrate [auctionsPerIteration] [maxIterations]|validate [N]>');
    process.exit(1);
}
