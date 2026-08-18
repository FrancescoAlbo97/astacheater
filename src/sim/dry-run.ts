// §11 / §12 F12 — Prova a secco: gira molte aste simulate sulla LISTA REALE dell'utente (non un
// pool sintetico) per mostrare che rosa aspettarsi e tarare gli score prima dell'asta vera.
import { ROLES } from '../core/types.js';
import type { AuctionEvent, AuctionState, LeagueConfig, ManagerState, Player, Role, ValueCurveConfig } from '../core/types.js';
import {
  DEFAULT_PRICE_MODEL_CONFIG,
  DEFAULT_ROLE_WEIGHTS,
  DEFAULT_ROLLOUT_CONFIG,
  DEFAULT_VALUE_CURVES,
  normalizeSlotWeights,
} from '../core/config.js';
import { mulberry32 } from '../core/rng.js';
import { getMyManagerId, reduce } from '../core/state.js';
import { applyRiskToValueCurves } from '../core/value-model.js';
import { runAuctionSim, type AuctionSimResult } from './auction-sim.js';
import { buildRealScenario, DEFAULT_OPPONENT_SCORE_JITTER, type Scenario, type ScenarioPlayer } from './generator.js';
import { evaluateFinalRoster } from './metrics.js';
import { buildRandomArchetypeMix } from './archetypes.js';
import { buildPostAuctionReport, type PostAuctionReport } from './post-auction-report.js';

/**
 * Un'iterazione di simulazione (§9.3), condivisa fra l'aggregato di 200 aste (`runDryRun`) e la
 * singola asta di esempio (`runSingleSimulatedAuction`): stesso scenario (jitter dai TUOI
 * punteggi), stesso mix di archetipi rimescolato per questo seed, stessa config personalizzata
 * (peso per ruolo, pesi di slot). `seed` guida sia lo scenario sia il mix, con offset diversi per
 * restare stream indipendenti (§13.10, stesso principio di auction-sim.ts).
 */
function runOneSimulatedAuction(
  config: LeagueConfig,
  players: readonly ScenarioPlayer[],
  myScores: ReadonlyMap<string, number>,
  myValueCurves: ValueCurveConfig,
  seed: number,
): { scenario: Scenario; result: AuctionSimResult } {
  const scenarioRng = mulberry32(seed);
  const scenario = buildRealScenario(players, myScores, config.managers.length, DEFAULT_OPPONENT_SCORE_JITTER, scenarioRng);
  const mixRng = mulberry32(seed + 300_000_007);
  const archetypesByManager = buildRandomArchetypeMix(config.managers.length, mixRng);

  const result = runAuctionSim({
    league: config,
    seed,
    rho: 0, // ignorato: scenarioOverride sotto salta generateScenario (che è l'unico a leggere rho)
    archetypesByManager,
    priceModelConfig: DEFAULT_PRICE_MODEL_CONFIG,
    valueCurves: DEFAULT_VALUE_CURVES,
    myValueCurves,
    roleWeights: config.roleWeights ?? DEFAULT_ROLE_WEIGHTS,
    slotWeights: normalizeSlotWeights(config.slotWeights, config.slots),
    priceNoiseSigma: DEFAULT_ROLLOUT_CONFIG.priceNoiseSigma,
    dualsRecalcEveryDraws: DEFAULT_ROLLOUT_CONFIG.dualsRecalcEveryDraws,
    dualsRecalcOnBudgetDropFraction: DEFAULT_ROLLOUT_CONFIG.dualsRecalcOnBudgetDropFraction,
    scenarioOverride: scenario,
  });

  return { scenario, result };
}

function toRosterView(
  playerById: Readonly<Record<string, Player>>,
  roster: ManagerState['roster'],
  myRealScores: ReadonlyMap<string, number>,
): RosterPlayerView[] {
  return roster
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

/** §9.5 — spesa per ruolo REALE (media su tutte le iterazioni) vs quota di budget ATTESA dal
 * modello di prezzo (§6.3.1): il divario fra le due è diagnostico, non solo estetico — dice se il
 * motore sta comprando i ruoli nelle proporzioni che il modello di mercato stesso si aspetta. */
export interface BudgetShareRow {
  readonly role: Role;
  readonly actualShare: number;
  readonly targetShare: number;
}

/** §9.5 — crediti non spesi a fine asta (per me, su tutte le iterazioni): target di riferimento
 * 0–15 (vedi MANUALE.md §7, gap noto e finora non risolto). */
export interface CreditsUnspentStats {
  readonly mean: number;
  readonly p10: number;
  readonly median: number;
  readonly p90: number;
}

/** Quota dei TUOI obiettivi ★ (Pool giocatori) realmente acquisiti nelle simulazioni. `null` se non
 * hai ancora segnato nessun obiettivo (non c'è nulla da misurare). */
export interface TargetAcquisitionStats {
  readonly totalTargets: number;
  readonly avgAcquired: number;
  readonly rate: number;
}

export interface ScorePricePoint {
  readonly role: Role;
  readonly score: number;
  readonly price: number;
}

export interface DryRunSummary {
  readonly iterations: number;
  readonly byRole: readonly RolePlan[];
  readonly avgFinalValue: number;
  readonly imbalancedRoles: readonly Role[];
  /** Rose finali di esempio, per far vedere all'utente squadre REALMENTE formate dalle
   * simulazioni (non solo medie aggregate): una tipica, una sfortunata (p10) e una fortunata (p90). */
  readonly sampleRosters: readonly RosterSample[];
  readonly budgetShareByRole: readonly BudgetShareRow[];
  readonly creditsUnspent: CreditsUnspentStats;
  readonly targetAcquisition: TargetAcquisitionStats | null;
  /** Punteggio vs prezzo pagato per ogni TUO acquisto, su tutte le iterazioni (può essere grande:
   * fino a iterations × slot totali — chi consuma decide se e come campionare per il grafico). */
  readonly scoreVsPrice: readonly ScorePricePoint[];
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

  const creditsUnspentSamples: number[] = [];
  const targetIds = Object.keys(state.targets);
  const targetsAcquiredSamples: number[] = [];
  const scoreVsPrice: ScorePricePoint[] = [];

  const CHUNK = 10;
  for (let i = 0; i < iterations; i++) {
    const seed = 5000 + i;
    const { scenario, result } = runOneSimulatedAuction(config, players, myScores, myValueCurves, seed);

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
    const totalSpentThisIter = me.roster.reduce((s, r) => s + r.price, 0);
    rosterByIteration.push({
      finalValue,
      totalSpent: totalSpentThisIter,
      roster: me.roster,
      myRealScores,
    });

    creditsUnspentSamples.push(config.budget - totalSpentThisIter);
    if (targetIds.length > 0) {
      targetsAcquiredSamples.push(me.roster.filter((r) => state.targets[r.player.id]).length);
    }
    for (const r of me.roster) {
      scoreVsPrice.push({ role: r.player.role, score: myRealScores.get(r.player.id) ?? 0, price: r.price });
    }

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
          players: toRosterView(playerById, pick.roster, pick.myRealScores),
        }));

  const totalAvgSpent = byRole.reduce((s, r) => s + r.avgCreditsSpent, 0);
  const budgetShareByRole: BudgetShareRow[] = ROLES.map((role) => ({
    role,
    actualShare: totalAvgSpent > 0 ? byRole.find((r) => r.role === role)!.avgCreditsSpent / totalAvgSpent : 0,
    targetShare: DEFAULT_PRICE_MODEL_CONFIG.budgetShares[role],
  }));

  const sortedUnspent = creditsUnspentSamples.slice().sort((a, b) => a - b);
  const creditsUnspent: CreditsUnspentStats = {
    mean: avg(creditsUnspentSamples),
    p10: percentile(sortedUnspent, 0.1),
    median: percentile(sortedUnspent, 0.5),
    p90: percentile(sortedUnspent, 0.9),
  };

  const targetAcquisition: TargetAcquisitionStats | null =
    targetIds.length > 0
      ? {
          totalTargets: targetIds.length,
          avgAcquired: avg(targetsAcquiredSamples),
          rate: avg(targetsAcquiredSamples) / targetIds.length,
        }
      : null;

  return {
    iterations,
    byRole,
    avgFinalValue: avg(finalValues),
    imbalancedRoles,
    sampleRosters,
    budgetShareByRole,
    creditsUnspent,
    targetAcquisition,
    scoreVsPrice,
  };
}

export interface SingleAuctionSale {
  readonly playerId: string;
  readonly name: string;
  readonly team: string;
  readonly role: Role;
  readonly price: number;
  readonly managerName: string;
  readonly isMe: boolean;
  readonly drawIndex: number;
}

export interface SingleAuctionUnsold {
  readonly playerId: string;
  readonly name: string;
  readonly team: string;
  readonly role: Role;
}

export interface SingleAuctionResult {
  readonly seed: number;
  /** Tutte le vendite dell'asta simulata, in ordine di estrazione — non solo le tue. */
  readonly sales: readonly SingleAuctionSale[];
  readonly unsold: readonly SingleAuctionUnsold[];
  readonly myRoster: readonly RosterPlayerView[];
  readonly myTotalSpent: number;
  readonly myFinalValue: number;
}

/**
 * Un'UNICA asta simulata per intero (§11), non 200 aggregate come `runDryRun`: per "vedere con i
 * propri occhi" come si sarebbe svolta una singola asta plausibile — chi ha preso cosa, quando,
 * per quanto — invece di solo medie. Stessa macchina esatta di `runDryRun` (stesso jitter dagli
 * score reali, stesso mix di archetipi rimescolato, stessa config personalizzata), un solo seed.
 * Sincrona: un'asta sola gira in pochi millisecondi, non serve il chunking asincrono di `runDryRun`.
 */
export function runSingleSimulatedAuction(state: AuctionState, seed: number): SingleAuctionResult {
  const config = state.config;
  if (!config) throw new Error('lega non configurata');

  const players: ScenarioPlayer[] = Object.values(state.players).map((p) => ({
    id: p.id,
    role: p.role,
    team: p.team,
  }));
  const playerById = state.players;
  const myScores = new Map(Object.entries(state.scores).map(([id, s]) => [id, s.score]));
  const myValueCurves = applyRiskToValueCurves(DEFAULT_VALUE_CURVES, config.risk);

  const { scenario, result } = runOneSimulatedAuction(config, players, myScores, myValueCurves, seed);

  const myManagerId = config.managers[0]!.id; // manager 0 è sempre "me" (§9.3, buildRealScenario)
  const managerNameById = new Map(result.finalManagers.map((m) => [m.manager.id, m.manager.name]));

  const sales: SingleAuctionSale[] = result.sales
    .slice()
    .sort((a, b) => a.drawIndex - b.drawIndex)
    .map((s) => {
      const p = playerById[s.playerId];
      return {
        playerId: s.playerId,
        name: p?.name ?? s.playerId,
        team: p?.team ?? '',
        role: s.role,
        price: s.price,
        managerName: managerNameById.get(s.managerId) ?? s.managerId,
        isMe: s.managerId === myManagerId,
        drawIndex: s.drawIndex,
      };
    });

  const unsold: SingleAuctionUnsold[] = result.unsold.map((id) => {
    const p = playerById[id];
    return { playerId: id, name: p?.name ?? id, team: p?.team ?? '', role: p?.role ?? 'A' };
  });

  const me = result.finalManagers.find((m) => m.manager.id === myManagerId)!;
  const myRealScores = scenario.scoresByManager[0]!;
  const myRoster = toRosterView(playerById, me.roster, myRealScores);
  const myTotalSpent = me.roster.reduce((s, r) => s + r.price, 0);
  const myFinalValue = evaluateFinalRoster(me, myRealScores, config.formations, mulberry32(seed + 999), 2000, myValueCurves);

  return { seed, sales, unsold, myRoster, myTotalSpent, myFinalValue };
}

export interface SimulatedAuctionHalfSummary {
  readonly purchaseCount: number;
  readonly overpayCount: number;
  readonly overpaidCredits: number;
}

export interface SimulatedAuctionReport {
  readonly auction: SingleAuctionResult;
  readonly report: PostAuctionReport;
  /** Prima/seconda metà dell'asta simulata, divise per indice di estrazione (§7 Session 8: "il
   * motore si comporta bene soprattutto da metà in poi?"). */
  readonly firstHalf: SimulatedAuctionHalfSummary;
  readonly secondHalf: SimulatedAuctionHalfSummary;
}

/**
 * Applica lo STESSO identico "Report asta" già usato per le aste vere (`post-auction-report.ts`,
 * motore esatto rigiocato istante per istante) a UN'asta simulata (`runSingleSimulatedAuction`),
 * per rispondere a "questa simulazione riflette davvero quello che il motore consiglierebbe dal
 * vivo?" invece di solo "quanto ho speso in totale" (§9.5, che misura il simulatore in aggregato,
 * non le singole decisioni). Costruisce un log sintetico (config/listone/punteggi REALI dell'utente
 * + le vendite della simulazione, in ordine di estrazione) e lo fa rigiocare da
 * `buildPostAuctionReport` — nessuna nuova logica di analisi, solo un nuovo modo di alimentarla.
 *
 * Avvertenza onesta, da mostrare in UI: gli AVVERSARI simulati (e "io" stesso, dentro la
 * simulazione) decidono con la policy approssimata del simulatore (`auction-sim.ts`,
 * `computeWillingness`/`approxMaxBid`), non con la bisezione esatta di `computeMaxBid` che vedi dal
 * vivo — sono deliberatamente due motori diversi (§9.3, mai stati la stessa cosa). Questo report
 * misura quindi "se avessi seguito il consiglio ESATTO in questa asta plausibile, quanto sarebbe
 * stato diverso da quello che il simulatore ha fatto", non "il simulatore è realistico in
 * assoluto" (quella è la domanda di §9.5, con il suo scostamento già documentato altrove).
 */
export function buildSimulatedAuctionReport(state: AuctionState, seed: number): SimulatedAuctionReport | null {
  if (!state.config) return null;
  const myManagerId = getMyManagerId(state.config);
  if (!myManagerId) return null;

  const auction = runSingleSimulatedAuction(state, seed);
  const managerIdByName = new Map(state.config.managers.map((m) => [m.name, m.id]));

  const syntheticLog: AuctionEvent[] = [
    { t: 'league.setup', config: state.config },
    { t: 'players.load', players: Object.values(state.players) },
    ...Object.entries(state.scores).map(
      ([playerId, s]): AuctionEvent => ({
        t: 'player.score',
        playerId,
        score: s.score,
        ptOverride: s.ptOverride ?? undefined,
      }),
    ),
    ...auction.sales.map(
      (s): AuctionEvent => ({
        t: 'sale',
        playerId: s.playerId,
        managerId: s.isMe ? myManagerId : (managerIdByName.get(s.managerName) ?? s.managerName),
        price: s.price,
      }),
    ),
  ];

  const report = buildPostAuctionReport(reduce(syntheticLog));
  if (!report) return null;

  const maxDraw = auction.sales.reduce((m, s) => Math.max(m, s.drawIndex), 0);
  const halfDraw = maxDraw / 2;
  const drawIndexByPlayerId = new Map(auction.sales.filter((s) => s.isMe).map((s) => [s.playerId, s.drawIndex]));

  function summarizeHalf(inHalf: (drawIndex: number) => boolean): SimulatedAuctionHalfSummary {
    const purchases = report!.myPurchases.filter((p) => inHalf(drawIndexByPlayerId.get(p.playerId) ?? -1));
    const overpaid = purchases.filter((p) => p.overpaidBy > 0);
    return {
      purchaseCount: purchases.length,
      overpayCount: overpaid.length,
      overpaidCredits: overpaid.reduce((s, p) => s + p.overpaidBy, 0),
    };
  }

  return {
    auction,
    report,
    firstHalf: summarizeHalf((d) => d < halfDraw),
    secondHalf: summarizeHalf((d) => d >= halfDraw),
  };
}
