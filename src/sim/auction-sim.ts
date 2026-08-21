// §9.3 — Motore di simulazione dell'asta. Stessa logica di risoluzione (secondo prezzo + 1) e
// stessi vincoli c_m usati nei rollout (§6.7). Seed esplicito e riproducibile (§13.10): mai
// Math.random() non seminato, per permettere confronti appaiati (§10.1).

import { ROLES, type LeagueConfig, type ManagerState, type Role, type SlotCounts } from '../core/types.js';
import type { Manager, PriceCurveConfig, PriceModelConfig, RoleWeights, RosterEntry, SlotWeights } from '../core/types.js';
import { DEFAULT_PRICE_CURVES, DEFAULT_ROLE_WEIGHTS } from '../core/config.js';
import { applyCoverageBonus, playerValue, roleCoverageGapFraction, titolarita } from '../core/value-model.js';
import { renormalize, type PoolPlayer } from '../core/price-model.js';
import { maxSingleBid, totalSlotsRemaining } from '../core/ceiling.js';
import type { RoleDPInput } from '../core/plan-dp.js';
import { mulberry32, randNormal, shuffle, type Rng } from '../core/rng.js';
import {
  buildRationalRoleInputs,
  computeRationalBase,
  applyUrgencyAndNoise,
  freshRationalBidderCache,
  type RationalBidderCache,
  type RationalCandidateInput,
} from '../core/rational-bidder.js';
import { generateScenario, type Scenario } from './generator.js';
import { archetypeWillingness, initArchetypeState, type ArchetypeId, type ArchetypeManagerState } from './archetypes.js';

export interface AuctionSimConfig {
  readonly league: LeagueConfig;
  readonly seed: number;
  readonly rho: number;
  /** Un archetipo per manager, stesso ordine di league.managers. */
  readonly archetypesByManager: readonly ArchetypeId[];
  readonly priceModelConfig: PriceModelConfig;
  /** Curve di prezzo "di mercato" (§6.3.1, §7 Session 9): usate come valore per come gli ARCHETIPI
   * non razionali percepiscono il valore (`value()`, solo per l'archetipo 'ratio'). Rappresentano
   * una base neutra, non la mia propensione al rischio personale. Default `DEFAULT_PRICE_CURVES`
   * se non fornite. */
  readonly priceCurves?: PriceCurveConfig;
  /** Curve di prezzo usate SOLO dal manager con archetipo 'rational' per calcolare il proprio
   * valore/offerta (§6.8: già corrette per `league.risk` a monte, se serve, via
   * `applyRiskToPriceCurves`). Tenerle separate da `priceCurves` è voluto: se il rischio venisse
   * applicato a TUTTI i manager simulati, l'intero mercato diventerebbe più aggressivo insieme a me
   * e l'effetto sulla MIA competitività relativa si annullerebbe quasi del tutto. Default a
   * `priceCurves` se non fornite. */
  readonly myPriceCurves?: PriceCurveConfig;
  /** Peso personale per ruolo (§11 Setup), applicato SOLO al manager/i con archetipo 'rational' —
   * stessa scelta di `myPriceCurves` sopra. Default nessuna preferenza se non fornito. */
  readonly roleWeights?: RoleWeights;
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

// OPTIMIZATION §F1.1: Ridotto da 50 a 20 candidati opzionali per i duali.
// Il simulatore self-play non richiede la massima precisione del motore esatto della UI.
// Questo riduce significativamente il costo computazionale della DP senza impattare
// sensibilmente il realismo della simulazione.
const MAX_OPTIONAL_CANDIDATES_FOR_DUALS = 20;

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
  const rationalCaches: RationalBidderCache[] = config.archetypesByManager.map(() => freshRationalBidderCache(league.budget));

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
    return playerValue(role, score, { priceCurves: config.priceCurves ?? DEFAULT_PRICE_CURVES });
  }

  // Curve usate SOLO per il calcolo di valore/offerta del manager 'rational' (v. commento sul
  // campo `myPriceCurves` sopra): separata da `value()` così il rischio non "trapela" agli
  // archetipi non razionali, che devono restare una base di mercato stabile e indipendente. Non
  // include il bonus di copertura-titolari (§11 Session 9): quello dipende dal roster GIÀ
  // posseduto dal manager, applicato al punto di chiamata (vedi `computeWillingness` e
  // `buildRoleInputsForManager` sotto), non qui dove non è disponibile.
  function myValue(role: Role, score: number): number {
    const priceCurves = config.myPriceCurves ?? config.priceCurves ?? DEFAULT_PRICE_CURVES;
    const weight = (config.roleWeights ?? DEFAULT_ROLE_WEIGHTS)[role] ?? 1;
    return playerValue(role, score, { priceCurves }) * weight;
  }

  function ownedScoresInRole(m: number, role: Role): number[] {
    const mgr = managers[m]!;
    const scores = scenario.scoresByManager[m]!;
    return mgr.roster
      .filter((r) => roleByPlayer.get(r.player.id) === role)
      .map((r) => scores.get(r.player.id) ?? 50);
  }

  function gapFractionFor(m: number, role: Role): number {
    return roleCoverageGapFraction(role, ownedScoresInRole(m, role).map((score) => titolarita(role, score)), league.primaryFormation);
  }

  // Granularità del budget usata SOLO per la DP approssimata dei duali (§6.7): il costo della
  // ricombinazione cresce con budget², quindi lavorare a blocchi di DUALS_BUDGET_GRANULARITY
  // crediti anziché a credito singolo riduce quel costo di un fattore ~granularità². Non tocca il
  // calcolo ESATTO di p* (max-bid.ts, §6.6), che resta a risoluzione di 1 credito.
  // OPTIMIZATION §F1.1: Granularità ridotta da 5 a 4 per migliorare le prestazioni.
  const DUALS_BUDGET_GRANULARITY = 4;

  function buildRoleInputsForManager(m: number): Record<Role, RoleDPInput> {
    const scores = scenario.scoresByManager[m]!;
    const ownedScoresByRole = {} as Record<Role, readonly number[]>;
    for (const role of ROLES) ownedScoresByRole[role] = ownedScoresInRole(m, role);
    const poolCandidatesByRole = {} as Record<Role, RationalCandidateInput[]>;
    for (const role of ROLES) {
      poolCandidatesByRole[role] = poolByRole(role).map((p) => ({
        score: scores.get(p.id) ?? 50,
        pHat: pHat.get(p.id) ?? 1,
      }));
    }
    return buildRationalRoleInputs(
      ownedScoresByRole,
      poolCandidatesByRole,
      league.slots,
      config.slotWeights,
      league.primaryFormation,
      myValue,
      MAX_OPTIONAL_CANDIDATES_FOR_DUALS,
      DUALS_BUDGET_GRANULARITY,
    );
  }

  function computeWillingness(m: number, playerId: string, role: Role, drawIndex: number): number {
    const mgr = managers[m]!;
    const archetype = config.archetypesByManager[m]!;
    const currentPHat = pHat.get(playerId) ?? 1;

    let base: number;
    if (archetype === 'rational') {
      const cache = rationalCaches[m]!;
      const score = scenario.scoresByManager[m]!.get(playerId) ?? 50;
      const v = applyCoverageBonus(myValue(role, score), titolarita(role, score), gapFractionFor(m, role));
      base = computeRationalBase({
        cache,
        creditsRemaining: mgr.creditsRemaining,
        maxSingleBidForManager: maxSingleBid(mgr),
        buildRoleInputs: () => buildRoleInputsForManager(m),
        targetRole: role,
        targetValue: v,
        budgetGranularity: DUALS_BUDGET_GRANULARITY,
        dualsRecalcEveryDraws: config.dualsRecalcEveryDraws,
        dualsRecalcOnBudgetDropFraction: config.dualsRecalcOnBudgetDropFraction,
      });
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
    // accumulando un surplus che, nella realtà, spinge a rilanci più aggressivi — i crediti
    // avanzati a fine asta hanno valore ZERO, quindi spenderne una parte anche per un vantaggio
    // marginale piccolo batte sempre sprecarli.
    //
    // Additivo, non moltiplicativo (bug reale trovato e corretto durante lo sviluppo, stesso
    // principio del fix di approxMaxBid/marginalValue): per gli ultimi slot di un ruolo il peso
    // w_ρ,t è molto piccolo (es. 0.02–0.05 per l'ultimo slot di un ruolo profondo), quindi
    // `base = (w·v − μ)/λ` resta minuscolo ANCHE per un candidato ottimo — un moltiplicatore
    // applicato a un numero già schiacciato vicino a zero resta vicino a zero. Il rialzo si
    // applica solo se il candidato vale già più del sostituto (base > 0): non deve rendere
    // appetibile un giocatore che il modello giudica comunque peggiore del filler.
    //
    // Scalato sulla quota di budget ATTESA del ruolo (§6.3.1, già nella config), non fisso: un
    // rialzo uguale in crediti per tutti i ruoli gonfia sproporzionatamente quelli con più slot
    // "profondi" a peso basso (D e C ne hanno di più di A — anche questo un bug osservato e
    // corretto: la quota di budget per ruolo usciva fuori dalla banda attesa di §9.5, pur con un
    // totale speso realistico). Un attaccante vale per definizione più di un centrocampista anche
    // quando si tratta solo di smaltire il surplus, non solo quando si valuta un candidato.
    //
    // Addendum (post-F14, ricalibro θ/A su dati reali): il ricalibro dei prior di prezzo (§6.3.1)
    // ha alzato λ a lega intera da ~1 a ~2.3 (§6.5) — e siccome `base = (w·v − μ)/λ`, un λ più
    // grande SCHIACCIA `base` per ogni candidato, quindi il gate `base > 0` sopra ora si attiva
    // per molti più candidati di prima, azzerando il rialzo esattamente dove servirebbe di più.
    // Misurato con un'asta reale: all'ultimo slot dell'intera rosa, con 27 crediti/slot di surplus
    // reale, il modello risultava ANCORA `base = 0` e quindi rialzo zero, offerta al minimo (1
    // credito) — il sintomo esatto segnalato dall'utente ("dovremmo spendere 480-490, spendiamo
    // 400-450"). **Prima ipotesi testata e SCARTATA con dati reali**: allargare IL GATE (farlo
    // valere anche a base ≤ 0) peggiora la spesa non spesa invece di migliorarla (misurato: 53→67
    // crediti non spesi mediani rimuovendo il gate del tutto) — il rialzo, applicato anche a
    // candidati che il modello giudica a valore zero, spinge ANCHE i manager 'rational' avversari a
    // rilanciare di più sugli stessi pochi giocatori marginali, e vincere una gara al rialzo più
    // dura non è la stessa cosa che spendere di più: spesso si perde lo stesso giocatore a un
    // prezzo più alto pagato da qualcun altro, senza spendere nulla quel turno. **Fix che invece
    // funziona, misurato**: lasciare il gate `base > 0` intatto (continua a impedire aste al rialzo
    // su giocatori a valore zero) ma AUMENTARE quanto il rialzo pesa sui candidati che il gate
    // lascia già passare, da 0.9 a 20 — cioè spendere il surplus più aggressivamente sui candidati
    // che il modello riconosce già come validi, invece di provare a farlo apprezzare candidati che
    // non lo sono. Su un'asta reale: crediti non spesi mediani 51→17 (asta simulata singola, "me"),
    // e sull'intera lega sintetica (bench, tutti i manager) 146→33, con "prezzo più caro" che si
    // sposta da 124 a 178 (dentro la banda attesa 120-260, §9.5) — miglioramento su PIÙ bande
    // contemporaneamente, non un compromesso che ne aggiusta una peggiorandone un'altra. Quota di
    // budget per ruolo si sposta un po' (specialmente A, che scende di alcuni punti percentuali)
    // ma resta dentro la tolleranza già accettata (±12pp, `test/sim.test.ts`).
    // Un manager "eligible" (slot libero, può permettersi almeno minPrice) è per definizione
    // disposto a pagare almeno il prezzo minimo pur di riempire uno slot che gli serve: altrimenti
    // rose non necessariamente scarse restano con slot vuoti solo perché la willingness calcolata
    // scende sotto 1 credito, violando "slot riempiti 250/250 sempre" (§9.5). Applicato dentro
    // `applyUrgencyAndNoise` (`minPrice`/tetto fisico), non ripetuto qui.
    return applyUrgencyAndNoise({
      base,
      creditsRemaining: mgr.creditsRemaining,
      totalSlotsRemaining: totalSlotsRemaining(mgr),
      fairPacePerSlot,
      roleBudgetShare: config.priceModelConfig.budgetShares[role],
      minPrice: league.minPrice,
      maxSingleBidForManager: maxSingleBid(mgr),
      noiseFactor: Math.exp(randNormal(decisionRngs[m]!) * config.priceNoiseSigma),
    });
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
