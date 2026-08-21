// Test di robustità alla CONFIGURAZIONE (§7 Session 8, richiesti esplicitamente dall'utente dopo i
// 12 scenari "da metà asta" di `integration-scenarios.test.ts`): quei 12 verificavano situazioni
// concrete su UNA configurazione fissa; questi 20 verificano invece che le stesse proprietà restino
// vere quando CAMBIANO i valori di Setup — budget, numero di slot, numero di manager, prezzo
// minimo, rischio, pesi di ruolo/slot personalizzati. Molti sono a proprietà casuale (fast-check):
// non un singolo numero di esempio, ma "per QUALUNQUE valore ragionevole di questo parametro, la
// proprietà deve reggere" — il modo più diretto di rispondere a "verifico che quando cambio i
// valori di setup vengono rispettati questi test, e quindi il sistema è affidabile".
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { reduce, deriveManagerStates } from '../src/core/state.js';
import { computeDecisionForPlayer, estimateOpponentWillingness, computeMarketSnapshot } from '../src/core/engine.js';
import {
  makeDefaultLeagueConfig,
  DEFAULT_SLOT_WEIGHTS,
  DEFAULT_ROLE_WEIGHTS,
  DEFAULT_PRICE_CURVES,
  normalizeSlotWeights,
} from '../src/core/config.js';
import { ROLES } from '../src/core/types.js';
import type { AuctionEvent, LeagueConfig, Player, Role, RoleWeights, SlotCounts, SlotWeights } from '../src/core/types.js';

const BASE = makeDefaultLeagueConfig();

function buildConfig(overrides: Partial<LeagueConfig>): LeagueConfig {
  return { ...BASE, ...overrides };
}

function managersOf(n: number): LeagueConfig['managers'] {
  return Array.from({ length: n }, (_, i) => ({ id: i === 0 ? 'me' : `m${i + 1}`, name: `M${i}`, isMe: i === 0 }));
}

function mkPlayer(id: string, role: Role): Player {
  return { id, name: id, team: 'T', role };
}

function loadEvent(players: readonly Player[]): AuctionEvent {
  return { t: 'players.load', players };
}

function scoreEvent(id: string, score: number, ptOverride?: number): AuctionEvent {
  return { t: 'player.score', playerId: id, score, ptOverride };
}

function saleEvent(playerId: string, managerId: string, price: number): AuctionEvent {
  return { t: 'sale', playerId, managerId, price };
}

/** Pool generico di N candidati per ruolo, punteggi distribuiti su un range realistico. */
function genericPool(role: Role, n: number, minScore: number, maxScore: number): { players: Player[]; events: AuctionEvent[] } {
  const players: Player[] = Array.from({ length: n }, (_, i) => mkPlayer(`${role}-pool-${i}`, role));
  const events: AuctionEvent[] = [loadEvent(players)];
  players.forEach((p, i) => {
    const score = maxScore - ((maxScore - minScore) * i) / Math.max(1, n - 1);
    events.push(scoreEvent(p.id, score));
  });
  return { players, events };
}

/** Vende ai manager (esclusa "me") abbastanza filler in `role` da saturare TUTTI i loro slot. */
function fillOthersRole(config: LeagueConfig, role: Role): AuctionEvent[] {
  const others = config.managers.filter((m) => !m.isMe);
  const players: Player[] = [];
  for (const mgr of others) {
    for (let s = 0; s < config.slots[role]; s++) players.push(mkPlayer(`fill-${role}-${mgr.id}-${s}`, role));
  }
  const events: AuctionEvent[] = [loadEvent(players)];
  for (const p of players) events.push(scoreEvent(p.id, 30));
  for (const mgr of others) {
    for (const p of players.filter((pl) => pl.id.includes(`-${mgr.id}-`))) events.push(saleEvent(p.id, mgr.id, 1));
  }
  return events;
}

describe('§7 Session 8 — 20 scenari di robustità al cambio di Setup', () => {
  // --- Slot per ruolo -----------------------------------------------------------------------
  it('1) la garanzia "unico con slot libero" regge per QUALUNQUE numero di slot per ruolo (1-15), non solo il default 3/8/8/6', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 15 }), (slotCount) => {
        const config = buildConfig({ slots: { P: slotCount, D: slotCount, C: slotCount, A: slotCount } });
        const log: AuctionEvent[] = [{ t: 'league.setup', config }, ...fillOthersRole(config, 'D'), loadEvent([mkPlayer('t', 'D')]), scoreEvent('t', 70)];
        const decision = computeDecisionForPlayer(reduce(log), 't')!;
        return decision.ceiling.c1 === 0 && decision.operationalMax === config.minPrice;
      }),
      { numRuns: 15 },
    );
  });

  it('2) con UN SOLO slot per ruolo, comprarne uno rende IMMEDIATAMENTE "non serve" ogni altro candidato dello stesso ruolo — caso limite realistico (leghe piccole)', () => {
    const config = buildConfig({ slots: { P: 1, D: 1, C: 1, A: 1 } });
    const bought = mkPlayer('bought-p', 'P');
    const other = mkPlayer('other-p', 'P');
    const log: AuctionEvent[] = [
      { t: 'league.setup', config },
      loadEvent([bought, other]),
      scoreEvent(bought.id, 60),
      scoreEvent(other.id, 95), // molto più forte, non deve cambiare nulla: lo slot fisico non c'è più
      saleEvent(bought.id, 'me', 5),
    ];
    const decision = computeDecisionForPlayer(reduce(log), other.id)!;
    expect(decision.reason).toBe('not-useful');
    expect(decision.pStar).toBe(0);
  });

  // --- Budget --------------------------------------------------------------------------------
  it('3) la garanzia "unico con slot libero" regge per QUALUNQUE budget (50-2000), il prezzo garantito è sempre il minPrice configurato', () => {
    fc.assert(
      fc.property(fc.integer({ min: 50, max: 2000 }), (budget) => {
        const config = buildConfig({ budget });
        const log: AuctionEvent[] = [{ t: 'league.setup', config }, ...fillOthersRole(config, 'A'), loadEvent([mkPlayer('t', 'A')]), scoreEvent('t', 80)];
        const decision = computeDecisionForPlayer(reduce(log), 't')!;
        return decision.operationalMax === config.minPrice;
      }),
      { numRuns: 15 },
    );
  });

  it('4) con budget MOLTO basso rispetto agli slot residui, il sistema resta coerente: mai NaN/Infinity, mai un\'offerta oltre il vero massimo per slot', () => {
    const config = buildConfig({ budget: 30 }); // 25 slot totali, 30 crediti: al limite
    const { events: pool } = genericPool('C', 20, 40, 95);
    const log: AuctionEvent[] = [{ t: 'league.setup', config }, ...pool, loadEvent([mkPlayer('t', 'C')]), scoreEvent('t', 90)];
    const decision = computeDecisionForPlayer(reduce(log), 't')!;
    expect(Number.isFinite(decision.operationalMax)).toBe(true);
    expect(decision.operationalMax).toBeLessThanOrEqual(decision.ceiling.myMax);
    expect(decision.operationalMax).toBeGreaterThanOrEqual(0);
  });

  it('5) operationalMax non supera MAI il vero massimo per singolo slot (c_0 = budget − slot residui + 1), per qualunque combinazione casuale di budget/slot/punteggio', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 20, max: 800 }),
        fc.integer({ min: 4, max: 30 }),
        fc.integer({ min: 1, max: 99 }),
        (budget, totalSlots, score) => {
          const perRole = Math.max(1, Math.floor(totalSlots / 4));
          const config = buildConfig({ budget, slots: { P: perRole, D: perRole, C: perRole, A: perRole } });
          const { events: pool } = genericPool('A', 15, 20, 96);
          const log: AuctionEvent[] = [{ t: 'league.setup', config }, ...pool, loadEvent([mkPlayer('t', 'A')]), scoreEvent('t', score)];
          const decision = computeDecisionForPlayer(reduce(log), 't')!;
          return decision.operationalMax <= decision.ceiling.myMax && Number.isFinite(decision.operationalMax);
        },
      ),
      { numRuns: 25 },
    );
  });

  // --- Numero di manager -----------------------------------------------------------------------
  it('6) il tetto avversari considera SEMPRE tutti gli avversari tranne me, qualunque sia il numero di manager in lega (4-20)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 4, max: 20 }), (n) => {
        const config = buildConfig({ managers: managersOf(n) });
        const { events: pool } = genericPool('D', 20, 30, 90);
        const log: AuctionEvent[] = [{ t: 'league.setup', config }, ...pool, loadEvent([mkPlayer('t', 'D')]), scoreEvent('t', 70)];
        const state = reduce(log);
        const decision = computeDecisionForPlayer(state, 't')!;
        const managers = deriveManagerStates(state);
        const expectedC1 = Math.max(0, ...managers.filter((m) => m.manager.id !== 'me').map((m) => m.creditsRemaining - (m.slotsRemaining.P + m.slotsRemaining.D + m.slotsRemaining.C + m.slotsRemaining.A - 1)));
        return decision.ceiling.c1 === expectedC1;
      }),
      { numRuns: 15 },
    );
  });

  it('7) più manager in lega non fa mai salire il tetto avversari oltre il massimo INDIVIDUALE di un singolo manager — nessuna somma indebita di budget altrui', () => {
    const config = buildConfig({ managers: managersOf(16) });
    const { events: pool } = genericPool('C', 20, 30, 90);
    const log: AuctionEvent[] = [{ t: 'league.setup', config }, ...pool, loadEvent([mkPlayer('t', 'C')]), scoreEvent('t', 70)];
    const state = reduce(log);
    const decision = computeDecisionForPlayer(state, 't')!;
    const managers = deriveManagerStates(state);
    const maxIndividual = Math.max(...managers.filter((m) => m.manager.id !== 'me').map((m) => m.creditsRemaining - (m.slotsRemaining.P + m.slotsRemaining.D + m.slotsRemaining.C + m.slotsRemaining.A - 1)));
    expect(decision.ceiling.c1).toBe(maxIndividual);
  });

  // --- minPrice --------------------------------------------------------------------------------
  it('8) cambiare il prezzo minimo di lega sposta correttamente il pavimento del prezzo garantito (non resta fisso a 1)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 }), (minPrice) => {
        const config = buildConfig({ minPrice });
        const log: AuctionEvent[] = [{ t: 'league.setup', config }, ...fillOthersRole(config, 'P'), loadEvent([mkPlayer('t', 'P')]), scoreEvent('t', 75)];
        const decision = computeDecisionForPlayer(reduce(log), 't')!;
        return decision.operationalMax === minPrice;
      }),
      { numRuns: 10 },
    );
  });

  // --- Rischio ----------------------------------------------------------------------------------
  it('9) qualunque valore di rischio in [-1, 1] produce sempre myValue/pStar finiti, mai NaN/Infinity — nessun crash da Setup', () => {
    fc.assert(
      fc.property(fc.double({ min: -1, max: 1, noNaN: true }), fc.integer({ min: 1, max: 99 }), (risk, score) => {
        const config = buildConfig({ risk });
        const { events: pool } = genericPool('A', 15, 20, 96);
        const log: AuctionEvent[] = [{ t: 'league.setup', config }, ...pool, loadEvent([mkPlayer('t', 'A')]), scoreEvent('t', score)];
        const decision = computeDecisionForPlayer(reduce(log), 't')!;
        return Number.isFinite(decision.myValue) && Number.isFinite(decision.pStar) && Number.isFinite(decision.lambda);
      }),
      { numRuns: 25 },
    );
  });

  // --- Pesi di ruolo personalizzati --------------------------------------------------------------
  it('10) λ resta identico per due bersagli diversi nella stessa istantanea ANCHE con pesi di ruolo personalizzati (non solo con i pesi neutri di default)', () => {
    const roleWeights: RoleWeights = { P: 0.5, D: 1.2, C: 2.5, A: 0.8 };
    const config = buildConfig({ roleWeights });
    const { events: pool } = genericPool('C', 30, 30, 95);
    const log: AuctionEvent[] = [
      { t: 'league.setup', config },
      ...pool,
      loadEvent([mkPlayer('t1', 'C'), mkPlayer('t2', 'C')]),
      scoreEvent('t1', 88),
      scoreEvent('t2', 61),
    ];
    const state = reduce(log);
    const d1 = computeDecisionForPlayer(state, 't1')!;
    const d2 = computeDecisionForPlayer(state, 't2')!;
    expect(d1.lambda).toBeCloseTo(d2.lambda, 9);
  });

  it('11) un peso di ruolo estremo (3×, il massimo permesso in Setup) non produce mai un p* negativo o non finito per nessun candidato del ruolo pesato', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 99 }), (score) => {
        const config = buildConfig({ roleWeights: { P: 1, D: 1, C: 1, A: 3 } });
        const { events: pool } = genericPool('A', 20, 20, 96);
        const log: AuctionEvent[] = [{ t: 'league.setup', config }, ...pool, loadEvent([mkPlayer('t', 'A')]), scoreEvent('t', score)];
        const decision = computeDecisionForPlayer(reduce(log), 't')!;
        return Number.isFinite(decision.pStar) && decision.pStar >= 0;
      }),
      { numRuns: 20 },
    );
  });

  // --- Pesi di slot personalizzati ----------------------------------------------------------------
  it('12) λ resta identico per due bersagli diversi ANCHE con pesi di slot fortemente personalizzati', () => {
    const slotWeights: SlotWeights = { P: [1, 0.01, 0.001], D: [1, 0.9, 0.5, 0.3, 0.2, 0.1, 0.05, 0.01], C: [1, 0.9, 0.5, 0.3, 0.2, 0.1, 0.05, 0.01], A: [1, 0.6, 0.3, 0.1, 0.05, 0.01] };
    const config = buildConfig({ slotWeights });
    const { events: pool } = genericPool('D', 30, 30, 95);
    const log: AuctionEvent[] = [
      { t: 'league.setup', config },
      ...pool,
      loadEvent([mkPlayer('t1', 'D'), mkPlayer('t2', 'D')]),
      scoreEvent('t1', 85),
      scoreEvent('t2', 55),
    ];
    const state = reduce(log);
    const d1 = computeDecisionForPlayer(state, 't1')!;
    const d2 = computeDecisionForPlayer(state, 't2')!;
    expect(d1.lambda).toBeCloseTo(d2.lambda, 9);
  });

  // Pool su TUTTI e 4 i ruoli: senza alternative reali dove spendere il budget, il costo-opportunità
  // di pagare tanto per uno slot scontato sarebbe artificialmente vicino a zero (niente su cui
  // altrimenti "risparmiare" quei crediti) — un mondo vuoto farebbe superare qualunque sconto di
  // peso, mascherando esattamente il meccanismo che i test 13/14 vogliono verificare.
  function allRolesPool(): AuctionEvent[] {
    return ROLES.flatMap((r) => genericPool(r, 25, 25, 92).events);
  }

  it('13) con pesi di slot fortemente decrescenti, un secondo titolare comparabile al primo vale sensibilmente MENO — la personalizzazione "un solo titolare netto" funziona davvero', () => {
    const slotWeights: SlotWeights = { P: [1, 0.02, 0.01], D: DEFAULT_SLOT_WEIGHTS.D, C: DEFAULT_SLOT_WEIGHTS.C, A: DEFAULT_SLOT_WEIGHTS.A };
    const config = buildConfig({ slotWeights });
    const owned = mkPlayer('p-owned', 'P');
    const second = mkPlayer('p-second', 'P');
    const log: AuctionEvent[] = [
      { t: 'league.setup', config },
      ...allRolesPool(),
      loadEvent([owned, second]),
      scoreEvent(owned.id, 90),
      scoreEvent(second.id, 88), // quasi identico per valore
      saleEvent(owned.id, 'me', 50),
    ];
    const decision = computeDecisionForPlayer(reduce(log), second.id)!;
    // peso 0.02 sul secondo slot: anche un secondo portiere quasi identico deve valere una frazione
    // piccola del primo, non un'offerta comparabile a un titolare vero — QUI, con altre alternative
    // reali per il budget, lo sconto di peso ha un vero costo-opportunità da rispettare. Soglia
    // alzata da 15 a 25 dopo la Session 10 (playerValue = identità sul punteggio, niente più curva
    // esponenziale): con valori più piccoli in assoluto lo sconto di peso si traduce in un numero
    // di crediti leggermente più alto in proporzione, ma resta comunque una frazione piccola del
    // valore "nudo" del candidato (88) — il meccanismo (sconto reale, non finto) continua a valere.
    expect(decision.pStar).toBeLessThan(25);
  });

  it('14) contraltare del 13: con pesi di slot QUASI uguali ("due titolari comparabili"), lo stesso secondo portiere vale sensibilmente di più', () => {
    const slotWeights: SlotWeights = { P: [0.55, 0.45, 0.3], D: DEFAULT_SLOT_WEIGHTS.D, C: DEFAULT_SLOT_WEIGHTS.C, A: DEFAULT_SLOT_WEIGHTS.A };
    const config = buildConfig({ slotWeights });
    const owned = mkPlayer('p-owned-2', 'P');
    const second = mkPlayer('p-second-2', 'P');
    const log: AuctionEvent[] = [
      { t: 'league.setup', config },
      ...allRolesPool(),
      loadEvent([owned, second]),
      scoreEvent(owned.id, 90),
      scoreEvent(second.id, 88),
      saleEvent(owned.id, 'me', 50),
    ];
    const decision = computeDecisionForPlayer(reduce(log), second.id)!;
    expect(decision.pStar).toBeGreaterThan(15);
  });

  it('15) cambiare `slots` DOPO aver personalizzato `slotWeights` (lunghezze disallineate) non fa mai esplodere il calcolo — copre il caso reale "utente cambia idea a metà Setup"', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 12 }), (newSlotCount) => {
        // slotWeights personalizzati per 8 slot D, ma la config ha newSlotCount slot D: disallineato.
        const config = buildConfig({ slots: { ...BASE.slots, D: newSlotCount } });
        const normalized = normalizeSlotWeights({ ...DEFAULT_SLOT_WEIGHTS, D: [0.9, 0.5, 0.3, 0.2, 0.1, 0.05, 0.02, 0.01] }, config.slots);
        const configWithWeights = buildConfig({ slots: config.slots, slotWeights: normalized });
        const { events: pool } = genericPool('D', 10, 30, 90);
        const log: AuctionEvent[] = [{ t: 'league.setup', config: configWithWeights }, ...pool, loadEvent([mkPlayer('t', 'D')]), scoreEvent('t', 70)];
        const decision = computeDecisionForPlayer(reduce(log), 't')!;
        return decision !== null && Number.isFinite(decision.pStar);
      }),
      { numRuns: 12 },
    );
  });

  // --- Ruolo completamente pieno, indipendentemente da rischio/pesi -------------------------------
  it('16) un ruolo DAVVERO pieno per me resta "non serve" SEMPRE — qualunque combinazione casuale di rischio e pesi di ruolo/slot personalizzati', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1, max: 1, noNaN: true }),
        fc.double({ min: 0.2, max: 3, noNaN: true }),
        (risk, roleWeight) => {
          const slots: SlotCounts = { P: 2, D: 2, C: 2, A: 2 };
          const config = buildConfig({ slots, risk, roleWeights: { P: roleWeight, D: 1, C: 1, A: 1 } });
          const owned: Player[] = [mkPlayer('me-p0', 'P'), mkPlayer('me-p1', 'P')];
          const target = mkPlayer('phenomenon', 'P');
          const log: AuctionEvent[] = [
            { t: 'league.setup', config },
            loadEvent(owned),
            ...owned.map((p) => scoreEvent(p.id, 50)),
            saleEvent(owned[0]!.id, 'me', 5),
            saleEvent(owned[1]!.id, 'me', 5),
            loadEvent([target]),
            scoreEvent(target.id, 99),
          ];
          const decision = computeDecisionForPlayer(reduce(log), target.id)!;
          return decision.reason === 'not-useful' && decision.pStar === 0;
        },
      ),
      { numRuns: 20 },
    );
  });

  // --- Stima interesse avversari, robustezza ------------------------------------------------------
  it('17) la stima di interesse degli avversari non supera MAI il loro tetto fisico individuale, per rose/budget casuali fra gli avversari', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 400 }), { minLength: 9, maxLength: 9 }), (spentByOpponent) => {
        const config = buildConfig({});
        const { events: pool } = genericPool('D', 25, 30, 90);
        const others = config.managers.filter((m) => !m.isMe);
        const spendEvents: AuctionEvent[] = others.flatMap((mgr, i) =>
          spentByOpponent[i]! > 0 ? [saleEvent(`D-pool-${i}`, mgr.id, Math.min(spentByOpponent[i]!, 470))] : [],
        );
        const target = mkPlayer('t', 'D');
        const log: AuctionEvent[] = [{ t: 'league.setup', config }, ...pool, ...spendEvents, loadEvent([target]), scoreEvent(target.id, 75)];
        const state = reduce(log);
        const decision = computeDecisionForPlayer(state, target.id)!;
        const snapshot = computeMarketSnapshot(state);
        const willingness = estimateOpponentWillingness(state, snapshot, 'D', target.id, decision.myValue, DEFAULT_PRICE_CURVES);
        if (!willingness.managerId) return true;
        const mgr = snapshot.managers.find((m) => m.manager.id === willingness.managerId)!;
        const physicalMax = mgr.creditsRemaining - (mgr.slotsRemaining.P + mgr.slotsRemaining.D + mgr.slotsRemaining.C + mgr.slotsRemaining.A - 1);
        return willingness.value <= physicalMax;
      }),
      { numRuns: 15 },
    );
  });

  it('18) un avversario che riempie il ruolo A METÀ SCENARIO (durante l\'asta, non a fine Setup) esce comunque dalla stima di interesse non appena il suo ultimo slot si chiude', () => {
    const config = buildConfig({});
    const { events: pool } = genericPool('D', 20, 30, 90);
    const opp = config.managers[1]!.id;
    const target = mkPlayer('t', 'D');
    const fillOpp: AuctionEvent[] = [];
    for (let s = 0; s < config.slots.D; s++) fillOpp.push(saleEvent(`D-pool-${s}`, opp, 1));
    const log: AuctionEvent[] = [{ t: 'league.setup', config }, ...pool, ...fillOpp, loadEvent([target]), scoreEvent(target.id, 75)];
    const state = reduce(log);
    const decision = computeDecisionForPlayer(state, target.id)!;
    const snapshot = computeMarketSnapshot(state);
    const willingness = estimateOpponentWillingness(state, snapshot, 'D', target.id, decision.myValue, DEFAULT_PRICE_CURVES);
    expect(willingness.managerId).not.toBe(opp);
  });

  // --- Formazioni / manager "me" non in prima posizione -------------------------------------------
  it('19) chi sono "io" nella lega non deve mai dipendere dalla posizione nell\'array `managers` — solo dal flag `isMe`', () => {
    const shuffled: LeagueConfig['managers'] = [
      { id: 'm2', name: 'Avversario', isMe: false },
      { id: 'me', name: 'Francesco', isMe: true },
      { id: 'm3', name: 'Avversario 2', isMe: false },
    ];
    const config = buildConfig({ managers: shuffled });
    const { events: pool } = genericPool('C', 10, 30, 90);
    const log: AuctionEvent[] = [{ t: 'league.setup', config }, ...pool, loadEvent([mkPlayer('t', 'C')]), scoreEvent('t', 70)];
    const decision = computeDecisionForPlayer(reduce(log), 't')!;
    expect(decision).not.toBeNull();
    expect(Number.isFinite(decision!.pStar)).toBe(true);
  });

  it('20) una config SENZA slotWeights/roleWeights personalizzati (dati salvati prima che questi controlli esistessero) si comporta come i pesi neutri di default, per qualunque numero di slot', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 10 }), (slotCount) => {
        const slots: SlotCounts = { P: slotCount, D: slotCount, C: slotCount, A: slotCount };
        const legacyConfig = { ...BASE, slots, roleWeights: undefined as unknown as RoleWeights, slotWeights: undefined as unknown as SlotWeights };
        const modernConfig = buildConfig({ slots, roleWeights: DEFAULT_ROLE_WEIGHTS, slotWeights: normalizeSlotWeights(undefined, slots) });
        const { events: pool } = genericPool('A', 15, 20, 96);
        const target = mkPlayer('t', 'A');
        const logLegacy: AuctionEvent[] = [{ t: 'league.setup', config: legacyConfig }, ...pool, loadEvent([target]), scoreEvent(target.id, 70)];
        const logModern: AuctionEvent[] = [{ t: 'league.setup', config: modernConfig }, ...pool, loadEvent([target]), scoreEvent(target.id, 70)];
        const dLegacy = computeDecisionForPlayer(reduce(logLegacy), target.id)!;
        const dModern = computeDecisionForPlayer(reduce(logModern), target.id)!;
        return dLegacy.pStar === dModern.pStar && dLegacy.myValue === dModern.myValue;
      }),
      { numRuns: 10 },
    );
  });
});
