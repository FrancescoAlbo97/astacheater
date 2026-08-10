// F4 (§6.2, §12): fitting dei pesi del surrogato additivo contro lineup-sim.
// Esegue la procedura descritta in test/value-surrogate.test.ts (che ne verifica il DoD) e
// scrive il risultato in data/defaults.json (§8.3), da cui config.ts legge i valori compilati.
//
// Uso: npx tsx scripts/fit-slot-weights.ts
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DEFAULT_SLOTS, SEASON_MATCHDAYS } from '../src/core/config.js';
import { lineupSim } from '../src/core/lineup-sim.js';
import { playerValue, fantamedia, titolarita } from '../src/core/value-model.js';
import { fitSlotWeights, type FitSample, type SurrogatePlayerInput } from '../src/core/value-surrogate.js';
import { mulberry32 } from '../src/core/rng.js';
import { ROLES } from '../src/core/types.js';
import type { Role } from '../src/core/types.js';

const FORMATIONS = ['4-3-3', '3-4-3', '3-5-2', '4-4-2', '4-5-1', '5-3-2', '5-4-1'] as const;
const N_SAMPLES = 3000;
const LINEUP_ITERATIONS = 400;
const SEED = 42;

function randomRoster(rng: () => number) {
  const byRole = {} as Record<Role, { fm: number; pt: number; v: number }[]>;
  for (const role of ROLES) {
    const n = DEFAULT_SLOTS[role];
    byRole[role] = Array.from({ length: n }, () => {
      const score = rng() * 100;
      return { fm: fantamedia(role, score), pt: titolarita(role, score), v: playerValue(role, score) };
    });
  }
  return byRole;
}

function buildSamples(): FitSample[] {
  const rng = mulberry32(SEED);
  const samples: FitSample[] = [];
  for (let i = 0; i < N_SAMPLES; i++) {
    const roster = randomRoster(rng);
    const flat = ROLES.flatMap((role) => roster[role].map((p) => ({ role, fm: p.fm, pt: p.pt })));
    const { mean } = lineupSim(flat, FORMATIONS, rng, LINEUP_ITERATIONS);
    const playersByRole = {} as Record<Role, SurrogatePlayerInput[]>;
    for (const role of ROLES) {
      playersByRole[role] = roster[role].map((p) => ({
        rankValue: p.v,
        potential: SEASON_MATCHDAYS * p.fm,
      }));
    }
    samples.push({ playersByRole, trueValue: mean });
  }
  return samples;
}

const samples = buildSamples();
const { weights, r2 } = fitSlotWeights(samples, DEFAULT_SLOTS);

console.log(`R² (vincolato: monotono per ruolo, somma=11): ${r2.toFixed(4)}`);
for (const role of ROLES) {
  console.log(role, weights[role].map((w) => w.toFixed(4)).join(', '));
}

const here = dirname(fileURLToPath(import.meta.url));
const defaultsPath = join(here, '..', 'data', 'defaults.json');
const existing = existsSync(defaultsPath) ? JSON.parse(readFileSync(defaultsPath, 'utf-8')) : {};

const updated = {
  ...existing,
  slotWeights: {
    method:
      'Minimi quadrati con vincolo di uguaglianza (Σw=11) via sistema KKT, poi proiezione ' +
      'isotona per ruolo (PAVA, non crescente/non negativa), poi riscalatura a somma=11. ' +
      'Feature: rango per v_j (=38·pt·fm, §6.1), termine sommato 38·fm_j (NON v_j: vedi nota).',
    note:
      'Termine sommato = 38·fm_j (senza pt) per evitare di scontare due volte la titolarità: ' +
      'il peso w_ρ,t assorbe già, tramite il fit, la probabilità di copertura dello slot t-esimo ' +
      '(effetto ridondanza fra riserve dello stesso ruolo). Vedi test/value-surrogate.test.ts.',
    sampleCount: N_SAMPLES,
    lineupSimIterationsPerSample: LINEUP_ITERATIONS,
    seed: SEED,
    r2Constrained: r2,
    r2UnconstrainedDiagnostic: 0.9678,
    r2Caveat:
      'R² vincolato (0.84 circa) è sotto la soglia nominale di §6.2 (0.97) su rose di ' +
      'composizione i.i.d. pienamente casuale; il modello non vincolato raggiunge ~0.97. ' +
      'Segnalato come richiesto da §6.2. Vedi commento in testa a test/value-surrogate.test.ts.',
    weights,
  },
};

writeFileSync(defaultsPath, JSON.stringify(updated, null, 2) + '\n');
console.log(`\nScritto in ${defaultsPath}`);
