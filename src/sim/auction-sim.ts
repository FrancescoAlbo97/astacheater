// §9.3 — Motore di simulazione dell'asta. Stessa logica di risoluzione (secondo prezzo + 1) e
// stessi vincoli c_m usati nei rollout (§6.7). Seed esplicito e riproducibile (§13.10): mai
// Math.random() non seminato, per permettere confronti appaiati (§10.1).

import { ROLES, type LeagueConfig, type ManagerState, type Role, type SlotCounts } from '../core/types.js';
import type { Manager, PriceModelConfig, RosterEntry, SlotWeights, ValueCurveConfig } from '../core/types.js';
import { playerValue } from '../core/value-model.js';
import { renormalize, type PoolPlayer } from '../core/price-model.js';
import { maxSingleBid, totalSlotsRemaining } from '../core/ceiling.js';
import { computeDuals, approxMaxBid, shouldRecalcDuals, type DualState } from '../core/base-policy.js';
import type { RoleDPInput, DPCandidate } from '../core/plan-dp.js';
import { mulberry32, randNormal, shuffle, type Rng } from '../core/rng.js';
import { generateScenario, type Scenario } from './generator.js';
import { archetypeWillingness, initArchetypeState, type ArchetypeId, type ArchetypeManagerState } from './archetypes.js';

export interface AuctionSimConfig {
  readonly league: LeagueConfig;
  readonly seed: number;
  readonly rho: number;
  /** Un archetipo per manager, stesso ordine di league.managers. */
  readonly archetypesByManager: readonly ArchetypeId[];
  readonly priceModelConfig: PriceModelConfig;
  readonly valueCurves: ValueCurveConfig;
  readonly slotWeights: SlotWeights;
  readonly priceNoiseSigma: number;
  readonly dualsRecalcEveryDraws: number;
  readonly dualsRecalcOnBudgetDropFraction: number;
  readonly myScoreNoiseStdDev?: number;
  /** Se fornito, sostituisce lo scenario generato internamente (usato dalla prova a secco, F12,
   * per aste sulla lista/punteggi REALI dell'utente invece che su un pool sintetico). */
  readonly scenarioOverride?: Scenario;
}

export interface SaleRecord {
  readonly playerId: string;
  readonly role: Role;
  readonly managerId: string;
  readonly price: number;
  readonly drawIndex: number;
}

export interface AuctionSimResult {
  readonly scenario: Scenario;
  readonly sales: readonly SaleRecord[];
  readonly unsold: readonly string[];
  readonly finalManagers: readonly ManagerState[];
  readonly slotCrisisCount: number;
}

interface RationalCache {
  duals: DualState | null;
  drawsSinceRecalc: number;
  creditsAtLastRecalc: number;
}

const MAX_OPTIONAL_CANDIDATES_FOR_DUALS = 50;

function zeroCounts(): SlotCounts {
  return { P: 0, D: 0, C: 0, A: 0 };
}

export function runAuctionSim(config: AuctionSimConfig): AuctionSimResult {
  const { league } = config;
  const M = league.managers.length;

  // Stream indipendenti (§10.1, §13.10): lo scenario e l'ordine di estrazione devono restare
  // IDENTICI a parità di seed indipendentemente da quali politiche occupano i vari posti (è la
  // base del confronto appaiato). Ogni manager ha inoltre il proprio stream decisionale dedicato:
  // se tutti i manager condividessero un unico stream, un archetipo che consuma un rng() in più
  // per estrazione (es. 'fanboy', 'latePanicker') sfaserebbe il rumore di TUTTI gli altri manager
  // nelle estrazioni successive, cambiandone il comportamento effettivo fra le due corse appaiate
  // pur non avendo cambiato la LORO politica — vanificando la riduzione di varianza del confronto.
  const scenarioRng: Rng = mulberry32(config.seed);
  const decisionRngs: Rng[] = Array.from({ length: M }, (_, i) => mulberry32(config.seed + 1_000_000_007 + i * 7919));
  const totalSlotsInRoster = ROLES.reduce((s, r) => s + league.slots[r], 0);
  const fairPacePerSlot = league.budget / totalSlotsInRoster;

  const scenario =
    config.scenarioOverride ??
    generateScenario({
      rng: scenarioRng,
      numManagers: M,
      rho: config.rho,
      myScoreNoiseStdDev: config.myScoreNoiseStdDev,
    });

  // Rappresentazione mutabile per la simulazione (il tipo pubblico ManagerState è di sola
  // lettura, coerente con lo stile event-sourcing usato altrove: qui serve un accumulatore).
  interface MutableManagerState {
    manager: Manager;
    creditsRemaining: number;
    slotsRemaining: SlotCounts;
    roster: RosterEntry[];
  }
  const managers: MutableManagerState[] = league.managers.map((manager) => ({
    manager,
    creditsRemaining: league.budget,
    slotsRemaining: { ...league.slots },
    roster: [],
  }));

  const ownedCountByRole: SlotCounts[] = managers.map(() => zeroCounts());
  const allTeams = Array.from({ length: 20 }, (_, t) => `team-${t}`);
  // Lista obiettivo per `targetChaser` (§10.1): i 25 giocatori con lo score percepito più alto
  // dal punto di vista di QUEL manager, calcolata una volta sola per manager.
  function targetIdsFor(managerIndex: number): Set<string> {
    const scores = scenario.scoresByManager[managerIndex]!;
    return new Set(
      scenario.players
        .slice()
        .sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0))
        .slice(0, 25)
        .map((p) => p.id),
    );
  }
  const archetypeStates: (ArchetypeManagerState | null)[] = config.archetypesByManager.map((a, i) =>
    a === 'rational' ? null : initArchetypeState(a, decisionRngs[i]!, allTeams, a === 'targetChaser' ? targetIdsFor(i) : undefined),
  );
  const rationalCaches: RationalCache[] = config.archetypesByManager.map(() => ({
    duals: null,
    drawsSinceRecalc: Infinity,
    creditsAtLastRecalc: league.budget,
  }));

  // Lo score in PoolPlayer serve solo al PRIOR (§6.3.1), che è "pubblico": usiamo la percezione
  // del manager 0 come proxy di mercato. Non è usato altrove: il valore v_j di ciascun manager
  // per la propria DP usa sempre scoresByManager[m], mai questo campo.
  let pool: PoolPlayer[] = scenario.players.map((p) => ({
    id: p.id,
    role: p.role,
    score: scenario.scoresByManager[0]!.get(p.id) ?? 50,
  }));

  const teamByPlayer = new Map(scenario.players.map((p) => [p.id, p.team]));
  const roleByPlayer = new Map(scenario.players.map((p) => [p.id, p.role]));

  let pHat = renormalize(pool, managers, config.priceModelConfig.priorCurves, config.priceModelConfig.reserveFraction)
    .pHat;
  const pHatInitial = new Map(pHat);

  const drawOrder = shuffle(scenario.players, scenarioRng);
  const sales: SaleRecord[] = [];
  const unsold: string[] = [];
  let slotCrisisCount = 0;

  function poolByRole(role: Role): PoolPlayer[] {
    return pool.filter((p) => p.role === role);
  }

  function percentile20(role: Role, scores: (id: string) => number): number {
    const ids = poolByRole(role).map((p) => p.id);
    if (ids.length === 0) return 0;
    const sorted = ids.map(scores).sort((a, b) => a - b);
    return sorted[Math.floor(0.2 * sorted.length)] ?? sorted[0]!;
  }

  function value(role: Role, score: number): number {
    return playerValue(role, score, { curves: config.valueCurves });
  }

  // Granularità del budget usata SOLO per la DP approssimata dei duali (§6.7): il costo della
  // ricombinazione cresce con budget², quindi lavorare a blocchi di DUALS_BUDGET_GRANULARITY
  // crediti anziché a credito singolo riduce quel costo di un fattore ~granularità². Non tocca il
  // calcolo ESATTO di p* (max-bid.ts, §6.6), che resta a risoluzione di 1 credito.
  const DUALS_BUDGET_GRANULARITY = 5;

  function buildRoleInputsForManager(m: number): Record<Role, RoleDPInput> {
    const scores = scenario.scoresByManager[m]!;
    const mgr = managers[m]!;
    const roleInputs = {} as Record<Role, RoleDPInput>;
    for (const role of ROLES) {
      const forced: DPCandidate[] = mgr.roster
        .filter((r) => roleByPlayer.get(r.player.id) === role)
        .map((r) => ({ v: value(role, scores.get(r.player.id) ?? 50), price: 0, forced: true }));
      // La DP dei "duali" (base-policy.ts) è una politica APPROSSIMATA ricalcolata periodicamente
      // (§6.7): tenere solo i migliori MAX_OPTIONAL_CANDIDATES_FOR_DUALS per v è coerente con
      // l'assunzione della spec ("riduce tipicamente a 30-50 candidati", §6.5) e necessario per le
      // prestazioni (fino a 190 candidati per ruolo altrimenti, ricalcolati ~12 volte/asta per
      // manager razionale). Il calcolo ESATTO di p* (§6.6, max-bid.ts) non usa questa scorciatoia.
      const optional: DPCandidate[] = poolByRole(role)
        .map((p) => ({
          v: value(role, scores.get(p.id) ?? 50),
          price: Math.max(1, Math.ceil((pHat.get(p.id) ?? 1) / DUALS_BUDGET_GRANULARITY)),
          forced: false,
        }))
        .sort((a, b) => b.v - a.v)
        .slice(0, MAX_OPTIONAL_CANDIDATES_FOR_DUALS);
      const p20score = percentile20(role, (id) => scores.get(id) ?? 50);
      roleInputs[role] = {
        candidates: [...forced, ...optional],
        fillerValue: value(role, p20score),
        slotCount: league.slots[role],
        weights: config.slotWeights[role],
      };
    }
    return roleInputs;
  }

  function computeWillingness(m: number, playerId: string, role: Role, drawIndex: number): number {
    const mgr = managers[m]!;
    const archetype = config.archetypesByManager[m]!;
    const currentPHat = pHat.get(playerId) ?? 1;

    let base: number;
    if (archetype === 'rational') {
      const cache = rationalCaches[m]!;
      const needsRecalc = shouldRecalcDuals(
        cache.drawsSinceRecalc,
        config.dualsRecalcEveryDraws,
        cache.creditsAtLastRecalc,
        mgr.creditsRemaining,
        config.dualsRecalcOnBudgetDropFraction,
      );
      if (needsRecalc || cache.duals === null) {
        const roleInputs = buildRoleInputsForManager(m);
        const scaledBudget = Math.max(1, Math.floor(mgr.creditsRemaining / DUALS_BUDGET_GRANULARITY));
        const duals = computeDuals({ budget: scaledBudget, roleInputs, ownedCountByRole: ownedCountByRole[m]! });
        // λ è un valore per credito: ricalcolato sulla scala grezza (blocchi da
        // DUALS_BUDGET_GRANULARITY crediti), va riportato alla scala reale dividendo.
        cache.duals = { ...duals, lambda: duals.lambda / DUALS_BUDGET_GRANULARITY };
        cache.drawsSinceRecalc = 0;
        cache.creditsAtLastRecalc = mgr.creditsRemaining;
      }
      const v = value(role, scenario.scoresByManager[m]!.get(playerId) ?? 50);
      base = approxMaxBid(v, role, cache.duals, maxSingleBid(mgr));
    } else {
      const state = archetypeStates[m]!;
      base = archetypeWillingness(state, {
        playerId,
        role,
        team: teamByPlayer.get(playerId) ?? 'team-0',
        drawIndex,
        totalDraws: drawOrder.length,
        pHatCurrent: currentPHat,
        pHatInitial: pHatInitial.get(playerId) ?? currentPHat,
        value: value(role, scenario.scoresByManager[m]!.get(playerId) ?? 50),
        creditsRemaining: mgr.creditsRemaining,
        budget: league.budget,
        slotsRemainingInRole: mgr.slotsRemaining[role],
        slotsRemainingTotal: totalSlotsRemaining(mgr),
      }, decisionRngs[m]!);
    }

    // Pressione a spendere (§9.5: crediti non spesi attesi 0–15 per manager, non centinaia): un
    // manager con più crediti per slot residuo della "media di lega" (budget/slot totali) sta
    // accumulando un surplus che, nella realtà, spinge a rilanci più aggressivi (nessuno vuole
    // finire l'asta con centinaia di crediti inutilizzati). Si applica a TUTTI gli archetipi,
    // 'rational' incluso: quest'ultimo lo ottiene già in parte tramite λ (che scende quando il
    // budget è alto rispetto agli slot), ma non abbastanza da solo nei casi limite osservati.
    const slotsLeft = totalSlotsRemaining(mgr);
    const actualPace = slotsLeft > 0 ? mgr.creditsRemaining / slotsLeft : 0;
    const urgency = slotsLeft > 0 ? Math.max(1, actualPace / fairPacePerSlot) : 1;

    const noisy = base * urgency * Math.exp(randNormal(decisionRngs[m]!) * config.priceNoiseSigma);
    // Un manager "eligible" (slot libero, può permettersi almeno minPrice) è per definizione
    // disposto a pagare almeno il prezzo minimo pur di riempire uno slot che gli serve: altrimenti
    // rose non necessariamente scarse restano con slot vuoti solo perché la willingness calcolata
    // scende sotto 1 credito, violando "slot riempiti 250/250 sempre" (§9.5).
    return Math.max(league.minPrice, Math.min(noisy, maxSingleBid(mgr)));
  }

  for (let drawIndex = 0; drawIndex < drawOrder.length; drawIndex++) {
    const player = drawOrder[drawIndex]!;
    const role = player.role;

    const eligible = managers
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => m.slotsRemaining[role] > 0 && maxSingleBid(m) >= league.minPrice);

    if (eligible.length === 0) {
      unsold.push(player.id);
      pool = pool.filter((p) => p.id !== player.id);
      for (const cache of rationalCaches) cache.drawsSinceRecalc++;
      continue;
    }

    const bids = eligible
      .map(({ i }) => ({ i, willingness: computeWillingness(i, player.id, role, drawIndex) }))
      .filter((b) => b.willingness >= league.minPrice)
      .sort((a, b) => b.willingness - a.willingness);

    if (bids.length === 0) {
      unsold.push(player.id);
    } else {
      const winner = bids[0]!;
      const second = bids[1]?.willingness ?? 0;
      const price = bids.length === 1 ? league.minPrice : Math.max(league.minPrice, Math.round(second) + 1);
      const finalPrice = Math.min(price, maxSingleBid(managers[winner.i]!));

      const mgr = managers[winner.i]!;
      mgr.roster.push({ player: { id: player.id, name: player.id, team: player.team, role }, price: finalPrice });
      mgr.creditsRemaining -= finalPrice;
      mgr.slotsRemaining[role] -= 1;
      ownedCountByRole[winner.i]![role] += 1;

      sales.push({ playerId: player.id, role, managerId: mgr.manager.id, price: finalPrice, drawIndex });
    }

    pool = pool.filter((p) => p.id !== player.id);
    for (const cache of rationalCaches) cache.drawsSinceRecalc++;

    if (pool.length > 0) {
      pHat = renormalize(pool, managers, config.priceModelConfig.priorCurves, config.priceModelConfig.reserveFraction)
        .pHat;
    }
  }

  for (const mgr of managers) {
    for (const role of ROLES) {
      if (mgr.slotsRemaining[role] > 0) slotCrisisCount++;
    }
  }

  return { scenario, sales, unsold, finalManagers: managers, slotCrisisCount };
}
