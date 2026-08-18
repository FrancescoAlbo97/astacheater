// Genera fixture di stato-asta REALISTICO da importare nella UI per testare senza dover fare
// un'asta completa a mano (troppo lento come metodo di debug/QA). Usa il simulatore già esistente
// (§9, la stessa macchina della Prova a secco/`cli.ts`) per giocare UNA asta realistica sul listone
// vero in pochi millisecondi, poi tronca la sequenza di vendite in 4 punti per ottenere 4 istantanee
// a diversi stadi dell'asta — dalla lista appena caricata a quasi finita.
//
// Uso: npx tsx scripts/make-fixtures.ts
// Rigenera `src/fixtures/*.json`, in formato IDENTICO all'export JSON della UI (`{version, log}`):
// importabili sia con il pulsante "Importa" in produzione, sia in automatico in `npm run dev` con
// `?fixture=<nome-file-senza-estensione>` nell'URL (solo build di sviluppo, vedi store.tsx).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runAuctionSim } from '../src/sim/auction-sim.js';
import { buildRealScenario, DEFAULT_OPPONENT_SCORE_JITTER, type ScenarioPlayer } from '../src/sim/generator.js';
import { buildRandomArchetypeMix } from '../src/sim/archetypes.js';
import {
  DEFAULT_PRICE_MODEL_CONFIG,
  DEFAULT_ROLLOUT_CONFIG,
  DEFAULT_SLOT_WEIGHTS,
  DEFAULT_VALUE_CURVES,
  makeDefaultLeagueConfig,
} from '../src/core/config.js';
import { mulberry32 } from '../src/core/rng.js';
import { ROLES } from '../src/core/types.js';
import type { AuctionEvent, Player, Role } from '../src/core/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '../src/fixtures');

const listoneData = JSON.parse(readFileSync(join(__dirname, '../data/listone.json'), 'utf8')) as {
  players: readonly Player[];
};
const players = listoneData.players;

// Score sintetici ma plausibili (§9.1: stessa forma della distribuzione di pool usata nelle
// diagnostiche di sviluppo): le squadre "big" tendono ad avere i punteggi più alti per ruolo,
// con una coda lunga di riserve/comprimari a punteggio basso. Deterministico (rng seedato):
// rigenerare la fixture dà sempre lo stesso risultato, comodo per screenshot/test stabili.
const BIG_TEAMS = new Set([
  'Inter', 'Juventus', 'Milan', 'Napoli', 'Roma', 'Lazio', 'Atalanta', 'Fiorentina', 'Bologna', 'Torino',
]);
function buildScores(rng: () => number): Map<string, number> {
  const byRole: Record<Role, Player[]> = { P: [], D: [], C: [], A: [] };
  for (const p of players) byRole[p.role].push(p);
  const scores = new Map<string, number>();
  for (const role of ROLES) {
    const list = byRole[role]
      .map((p) => ({ p, jitter: rng() }))
      .sort((a, b) => (BIG_TEAMS.has(b.p.team) ? 1 : 0) - (BIG_TEAMS.has(a.p.team) ? 1 : 0) || a.jitter - b.jitter);
    const n = list.length;
    list.forEach(({ p }, i) => {
      const base = 100 * (1 - Math.pow(i / n, 0.65));
      scores.set(p.id, Math.max(1, Math.round(base)));
    });
  }
  return scores;
}

const SEED = 20260811;
const league = makeDefaultLeagueConfig();
const myScores = buildScores(mulberry32(SEED));
const scenarioPlayers: ScenarioPlayer[] = players.map((p) => ({ id: p.id, role: p.role, team: p.team }));

const scenario = buildRealScenario(scenarioPlayers, myScores, league.managers.length, DEFAULT_OPPONENT_SCORE_JITTER, mulberry32(SEED + 1));
const result = runAuctionSim({
  league,
  seed: SEED,
  rho: 0, // ignorato: scenarioOverride sotto salta generateScenario (che è l'unico a leggere rho)
  archetypesByManager: buildRandomArchetypeMix(league.managers.length, mulberry32(SEED + 300_000_007)),
  priceModelConfig: DEFAULT_PRICE_MODEL_CONFIG,
  valueCurves: DEFAULT_VALUE_CURVES,
  slotWeights: DEFAULT_SLOT_WEIGHTS,
  priceNoiseSigma: DEFAULT_ROLLOUT_CONFIG.priceNoiseSigma,
  dualsRecalcEveryDraws: DEFAULT_ROLLOUT_CONFIG.dualsRecalcEveryDraws,
  dualsRecalcOnBudgetDropFraction: DEFAULT_ROLLOUT_CONFIG.dualsRecalcOnBudgetDropFraction,
  scenarioOverride: scenario,
});

const orderedSales = result.sales.slice().sort((a, b) => a.drawIndex - b.drawIndex);

const baseEvents: AuctionEvent[] = [
  { t: 'league.setup', config: league },
  { t: 'players.load', players: [...players] },
  ...Array.from(myScores.entries()).map(([playerId, score]): AuctionEvent => ({ t: 'player.score', playerId, score })),
];

function saleEventsUpTo(fraction: number): AuctionEvent[] {
  const count = Math.round(orderedSales.length * fraction);
  return orderedSales.slice(0, count).map(
    (s): AuctionEvent => ({ t: 'sale', playerId: s.playerId, managerId: s.managerId, price: s.price }),
  );
}

const FIXTURES: { name: string; fraction: number; description: string }[] = [
  { name: '00-vuota', fraction: 0, description: 'lega configurata, listone e punteggi caricati, nessuna vendita ancora' },
  { name: '01-iniziale', fraction: 0.15, description: 'primi minuti d’asta' },
  { name: '02-meta', fraction: 0.5, description: 'circa a metà, stato generico per test quotidiani' },
  { name: '03-quasi-finita', fraction: 0.9, description: 'quasi finita: budget/slot scarsi, buona per allarmi di scarsità e per il Report asta' },
];

for (const fixture of FIXTURES) {
  const log = [...baseEvents, ...saleEventsUpTo(fixture.fraction)];
  const payload = { version: 1, log };
  const path = join(OUT_DIR, `${fixture.name}.json`);
  writeFileSync(path, JSON.stringify(payload));
  console.log(`${fixture.name}: ${log.length} eventi (${fixture.description}) -> ${path}`);
}
