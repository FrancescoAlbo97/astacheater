// §11 / §12 F12 — Prova a secco: gira molte aste simulate sulla LISTA REALE dell'utente (non un
// pool sintetico) per mostrare che rosa aspettarsi e tarare gli score prima dell'asta vera.
import { ROLES } from '../core/types.js';
import type { AuctionState, ManagerState, Role } from '../core/types.js';
import {
  DEFAULT_PRICE_MODEL_CONFIG,
  DEFAULT_ROLLOUT_CONFIG,
  DEFAULT_SLOT_WEIGHTS,
  DEFAULT_VALUE_CURVES,
} from '../core/config.js';
import { mulberry32 } from '../core/rng.js';
import { runAuctionSim } from './auction-sim.js';
import { buildRealScenario, type ScenarioPlayer } from './generator.js';
import { evaluateFinalRoster } from './metrics.js';
import type { ArchetypeId } from './archetypes.js';

const NON_RATIONAL_ARCHETYPES: ArchetypeId[] = [
  'earlyEnthusiast',
  'latePanicker',
  'fanboy',
  'roleCapper',
  'anchored',
  'budgetSplitter',
];

function buildArchetypeMix(numManagers: number): ArchetypeId[] {
  return Array.from({ length: numManagers }, (_, i) =>
    i === 0 ? 'rational' : NON_RATIONAL_ARCHETYPES[(i - 1) % NON_RATIONAL_ARCHETYPES.length]!,
  );
}

export interface RolePlan {
  readonly role: Role;
  readonly avgSlotsFilled: number;
  readonly avgCreditsSpent: number;
  readonly avgScoreOfAcquired: number;
  /** Quota di volte in cui NESSUN giocatore con score ≥ 70 in questo ruolo è stato acquisito. */
  readonly highScoreMissRate: number;
}

export interface DryRunSummary {
  readonly iterations: number;
  readonly byRole: readonly RolePlan[];
  readonly avgFinalValue: number;
  readonly imbalancedRoles: readonly Role[];
}

export interface DryRunProgress {
  readonly done: number;
  readonly total: number;
}

/**
 * Esegue `iterations` aste (default 200, §12 F12) sulla lista reale e aggrega la rosa attesa per
 * ruolo. Asincrona e a chunk (yield fra un blocco e l'altro) per non bloccare la UI durante
 * l'esecuzione, anche se gira sul thread principale (nessun requisito esplicito di Web Worker per
 * questa schermata, a differenza del rollout, §6.7/§13.9).
 */
export async function runDryRun(
  state: AuctionState,
  iterations = 200,
  onProgress?: (p: DryRunProgress) => void,
): Promise<DryRunSummary> {
  const config = state.config;
  if (!config) throw new Error('lega non configurata');

  const players: ScenarioPlayer[] = Object.values(state.players).map((p) => ({
    id: p.id,
    role: p.role,
    team: p.team,
  }));
  const myScores = new Map(Object.entries(state.scores).map(([id, s]) => [id, s.score]));
  const archetypesByManager = buildArchetypeMix(config.managers.length);

  const slotsFilled: Record<Role, number[]> = { P: [], D: [], C: [], A: [] };
  const creditsSpent: Record<Role, number[]> = { P: [], D: [], C: [], A: [] };
  const scoreSums: Record<Role, number[]> = { P: [], D: [], C: [], A: [] };
  const highScoreMisses: Record<Role, number> = { P: 0, D: 0, C: 0, A: 0 };
  const finalValues: number[] = [];
  const evalRng = mulberry32(777);

  const CHUNK = 10;
  for (let i = 0; i < iterations; i++) {
    const seed = 5000 + i;
    const scenarioRng = mulberry32(seed);
    const scenario = buildRealScenario(players, myScores, config.managers.length, 0.8, scenarioRng);

    const result = runAuctionSim({
      league: config,
      seed,
      rho: 0.8,
      archetypesByManager,
      priceModelConfig: DEFAULT_PRICE_MODEL_CONFIG,
      valueCurves: DEFAULT_VALUE_CURVES,
      slotWeights: DEFAULT_SLOT_WEIGHTS,
      priceNoiseSigma: DEFAULT_ROLLOUT_CONFIG.priceNoiseSigma,
      dualsRecalcEveryDraws: DEFAULT_ROLLOUT_CONFIG.dualsRecalcEveryDraws,
      dualsRecalcOnBudgetDropFraction: DEFAULT_ROLLOUT_CONFIG.dualsRecalcOnBudgetDropFraction,
      scenarioOverride: scenario,
    });

    const me: ManagerState = result.finalManagers[0]!;
    const myRealScores = scenario.scoresByManager[0]!;

    for (const role of ROLES) {
      const mine = me.roster.filter((r) => r.player.role === role);
      slotsFilled[role].push(mine.length);
      creditsSpent[role].push(mine.reduce((s, r) => s + r.price, 0));
      scoreSums[role].push(mine.reduce((s, r) => s + (myRealScores.get(r.player.id) ?? 0), 0));
      const gotHighScore = mine.some((r) => (myRealScores.get(r.player.id) ?? 0) >= 70);
      const anyHighScoreExisted = players.some((p) => p.role === role && (myScores.get(p.id) ?? 0) >= 70);
      if (anyHighScoreExisted && !gotHighScore) highScoreMisses[role]++;
    }

    finalValues.push(evaluateFinalRoster(me, myRealScores, config.formations, evalRng, 300, DEFAULT_VALUE_CURVES));

    if ((i + 1) % CHUNK === 0) {
      onProgress?.({ done: i + 1, total: iterations });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  onProgress?.({ done: iterations, total: iterations });

  const avg = (xs: number[]) => (xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  const byRole: RolePlan[] = ROLES.map((role) => {
    const filled = slotsFilled[role];
    const totalScore = scoreSums[role].reduce((a, b) => a + b, 0);
    const totalSlots = filled.reduce((a, b) => a + b, 0);
    return {
      role,
      avgSlotsFilled: avg(filled),
      avgCreditsSpent: avg(creditsSpent[role]),
      avgScoreOfAcquired: totalSlots > 0 ? totalScore / totalSlots : 0,
      highScoreMissRate: highScoreMisses[role] / iterations,
    };
  });

  // Sbilanciata: il ruolo perde sistematicamente i propri migliori obiettivi, oppure lo score
  // medio acquisito è molto più basso che negli altri ruoli (segnale che la lista in quel ruolo
  // è troppo debole o gli score troppo bassi rispetto agli altri).
  const avgScoreAcrossRoles = avg(byRole.map((r) => r.avgScoreOfAcquired));
  const imbalancedRoles = byRole
    .filter((r) => r.highScoreMissRate > 0.6 || r.avgScoreOfAcquired < avgScoreAcrossRoles - 15)
    .map((r) => r.role);

  return { iterations, byRole, avgFinalValue: avg(finalValues), imbalancedRoles };
}
