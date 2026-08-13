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
import { applyRiskToValueCurves } from '../core/value-model.js';
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
  /** Score medio di TUTTI i giocatori con punteggio assegnato in questo ruolo (non solo quelli
   * acquisiti): il metro di paragone "giusto" per capire se le proprie acquisizioni sono deboli
   * per il ruolo, invece di confrontarle con ruoli diversi che hanno distribuzioni di score
   * strutturalmente diverse (es. gli attaccanti hanno tipicamente pochi punteggi altissimi e molti
   * bassi, i difensori una distribuzione più piatta — non è un'anomalia, è come funziona il gioco). */
  readonly avgPoolScore: number;
  /** Soglia di "obiettivo di fascia alta" per questo ruolo: 80° percentile degli score assegnati
   * nel ruolo, non un valore fisso uguale per tutti i ruoli (che penalizzerebbe sistematicamente i
   * ruoli con punteggi naturalmente più bassi/concentrati). */
  readonly highScoreThreshold: number;
  /** Quota di volte in cui NESSUN giocatore sopra `highScoreThreshold` in questo ruolo è stato
   * acquisito (calcolato solo se in lista esiste almeno un obiettivo di fascia alta per il ruolo). */
  readonly highScoreMissRate: number;
}

export interface RosterPlayerView {
  readonly id: string;
  readonly name: string;
  readonly team: string;
  readonly role: Role;
  readonly price: number;
  readonly score: number;
}

export interface RosterSample {
  /** Es. "tipica" (vicina alla mediana), "sfortunata" (p10), "fortunata" (p90). */
  readonly label: string;
  readonly finalValue: number;
  readonly totalSpent: number;
  readonly players: readonly RosterPlayerView[];
}

export interface DryRunSummary {
  readonly iterations: number;
  readonly byRole: readonly RolePlan[];
  readonly avgFinalValue: number;
  readonly imbalancedRoles: readonly Role[];
  /** Rose finali di esempio, per far vedere all'utente squadre REALMENTE formate dalle
   * simulazioni (non solo medie aggregate): una tipica, una sfortunata (p10) e una fortunata (p90). */
  readonly sampleRosters: readonly RosterSample[];
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
  const playerById = state.players;
  const myScores = new Map(Object.entries(state.scores).map(([id, s]) => [id, s.score]));
  const archetypesByManager = buildArchetypeMix(config.managers.length);
  // Le curve di rischio si applicano SOLO a me (manager 0): se si applicassero a tutti i manager
  // simulati, l'intero mercato diventerebbe più aggressivo insieme a me e l'effetto sulla MIA
  // competitività relativa si annullerebbe quasi del tutto (vedi commento su
  // AuctionSimConfig.myValueCurves in auction-sim.ts).
  const myValueCurves = applyRiskToValueCurves(DEFAULT_VALUE_CURVES, config.risk);

  // Soglia di "fascia alta" e media di riferimento CALCOLATE PER RUOLO dalla lista dell'utente,
  // non un valore fisso condiviso fra ruoli: la distribuzione di score di un attaccante (pochi
  // fenomeni, molte riserve) è strutturalmente diversa da quella di un difensore (più uniforme), e
  // usare lo stesso metro per entrambi segnalava come "sbilanciato" un ruolo semplicemente perché
  // ha meno giocatori assoluti da fascia alta — non perché la simulazione stia facendo qualcosa di
  // sbagliato per quel ruolo (vedi MANUALE.md per l'analisi che ha portato a questo fix).
  function percentile(sorted: readonly number[], q: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
    return sorted[idx]!;
  }
  const scoresByRole: Record<Role, number[]> = { P: [], D: [], C: [], A: [] };
  for (const p of players) {
    const s = myScores.get(p.id);
    if (s !== undefined) scoresByRole[p.role].push(s);
  }
  const highScoreThresholdByRole: Record<Role, number> = { P: 0, D: 0, C: 0, A: 0 };
  const avgPoolScoreByRole: Record<Role, number> = { P: 0, D: 0, C: 0, A: 0 };
  for (const role of ROLES) {
    const sorted = scoresByRole[role].slice().sort((a, b) => a - b);
    highScoreThresholdByRole[role] = percentile(sorted, 0.8);
    avgPoolScoreByRole[role] = sorted.length > 0 ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0;
  }

  const slotsFilled: Record<Role, number[]> = { P: [], D: [], C: [], A: [] };
  const creditsSpent: Record<Role, number[]> = { P: [], D: [], C: [], A: [] };
  const scoreSums: Record<Role, number[]> = { P: [], D: [], C: [], A: [] };
  const highScoreMisses: Record<Role, number> = { P: 0, D: 0, C: 0, A: 0 };
  const finalValues: number[] = [];
  const rosterByIteration: { finalValue: number; totalSpent: number; roster: ManagerState['roster']; myRealScores: ReadonlyMap<string, number> }[] = [];
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
      myValueCurves,
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
      const threshold = highScoreThresholdByRole[role];
      const gotHighScore = mine.some((r) => (myRealScores.get(r.player.id) ?? 0) >= threshold);
      const anyHighScoreExisted = players.some((p) => p.role === role && (myScores.get(p.id) ?? 0) >= threshold);
      if (anyHighScoreExisted && !gotHighScore) highScoreMisses[role]++;
    }

    const finalValue = evaluateFinalRoster(me, myRealScores, config.formations, evalRng, 300, myValueCurves);
    finalValues.push(finalValue);
    rosterByIteration.push({
      finalValue,
      totalSpent: me.roster.reduce((s, r) => s + r.price, 0),
      roster: me.roster,
      myRealScores,
    });

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
      avgPoolScore: avgPoolScoreByRole[role],
      highScoreThreshold: highScoreThresholdByRole[role],
      highScoreMissRate: highScoreMisses[role] / iterations,
    };
  });

  // Sbilanciata: il ruolo perde sistematicamente i propri migliori obiettivi (soglia calcolata sul
  // SUO ruolo, non un valore fisso), oppure lo score medio acquisito è molto più basso della media
  // dello stesso ruolo NELLA TUA LISTA — non della media di ruoli diversi, che hanno distribuzioni
  // di score strutturalmente diverse e renderebbero "sbilanciato" un ruolo solo perché ha di natura
  // meno fenomeni assoluti (tipicamente gli attaccanti, in un fantacalcio reale).
  const imbalancedRoles = byRole
    .filter((r) => r.highScoreMissRate > 0.6 || (r.avgPoolScore > 0 && r.avgScoreOfAcquired < r.avgPoolScore * 0.8))
    .map((r) => r.role);

  const toRosterView = (roster: ManagerState['roster'], myRealScores: ReadonlyMap<string, number>): RosterPlayerView[] =>
    roster
      .map((r) => {
        const p = playerById[r.player.id];
        return {
          id: r.player.id,
          name: p?.name ?? r.player.name,
          team: p?.team ?? r.player.team,
          role: r.player.role,
          price: r.price,
          score: myRealScores.get(r.player.id) ?? 0,
        };
      })
      .sort((a, b) => a.role.localeCompare(b.role) || b.price - a.price);

  // Rose di esempio (non solo medie): la vicina alla mediana, quella nel 10° e nel 90° percentile
  // del valore finale, per far vedere il RANGE di squadre realmente formate dalle simulazioni.
  function pickByPercentile(q: number): (typeof rosterByIteration)[number] {
    const sorted = rosterByIteration.slice().sort((a, b) => a.finalValue - b.finalValue);
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
    return sorted[idx]!;
  }
  const sampleRosters: RosterSample[] =
    rosterByIteration.length === 0
      ? []
      : (
          [
            { label: 'sfortunata (p10)', pick: pickByPercentile(0.1) },
            { label: 'tipica (mediana)', pick: pickByPercentile(0.5) },
            { label: 'fortunata (p90)', pick: pickByPercentile(0.9) },
          ] as const
        ).map(({ label, pick }) => ({
          label,
          finalValue: pick.finalValue,
          totalSpent: pick.totalSpent,
          players: toRosterView(pick.roster, pick.myRealScores),
        }));

  return { iterations, byRole, avgFinalValue: avg(finalValues), imbalancedRoles, sampleRosters };
}
