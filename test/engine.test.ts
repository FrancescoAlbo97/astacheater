// core/engine.ts — ponte stato→motore per la UI (§11). DoD rilevante: numero deterministico
// entro 100ms (§13.9, A10); C¹=0 riconosciuto; p*=0 mostrato come "non serve".
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { applyHedge, computeDecisionForPlayer } from '../src/core/engine.js';
import { reduce } from '../src/core/state.js';
import { makeDefaultLeagueConfig } from '../src/core/config.js';
import { ROLES } from '../src/core/types.js';
import type { AuctionEvent, MaxBidResult, Player } from '../src/core/types.js';

const league = makeDefaultLeagueConfig();

function buildPool(n: number, role: 'P' | 'D' | 'C' | 'A' = 'A'): Player[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${role}${i}`,
    name: `${role}${i}`,
    team: `team-${i % 5}`,
    role,
  }));
}

function scoreEvents(players: readonly Player[], score: (p: Player) => number): AuctionEvent[] {
  return players.map((p) => ({ t: 'player.score', playerId: p.id, score: score(p) }));
}

describe('§11 / §13.9 computeDecisionForPlayer', () => {
  it('risponde entro 100ms su uno stato realistico (A10)', () => {
    const players = [...buildPool(60, 'P'), ...buildPool(180, 'D'), ...buildPool(190, 'C'), ...buildPool(110, 'A')];
    const log: AuctionEvent[] = [
      { t: 'league.setup', config: league },
      { t: 'players.load', players },
      ...scoreEvents(players, () => 20 + Math.random() * 60),
    ];
    const state = reduce(log);
    const target = players.find((p) => p.role === 'A')!;

    const start = performance.now();
    const decision = computeDecisionForPlayer(state, target.id);
    const elapsed = performance.now() - start;

    expect(decision).not.toBeNull();
    expect(elapsed).toBeLessThan(100);
  });

  it('C¹ = 0 viene riconosciuto quando nessun avversario ha slot liberi nel ruolo', () => {
    const players = buildPool(3, 'A');
    const config = {
      ...league,
      managers: [league.managers[0]!, { id: 'm2', name: 'm2', isMe: false }],
    };
    const log: AuctionEvent[] = [
      { t: 'league.setup', config },
      { t: 'players.load', players },
      { t: 'player.score', playerId: players[0]!.id, score: 90 },
      // esaurisco tutti gli slot A dell'avversario "manualmente" vendendogli A slot giocatori fittizi
      ...Array.from({ length: league.slots.A }, (_, i) => {
        const filler: Player = { id: `filler-a-${i}`, name: `filler-a-${i}`, team: 't', role: 'A' };
        return [
          { t: 'players.load' as const, players: [filler] },
          { t: 'sale' as const, playerId: filler.id, managerId: 'm2', price: 1 },
        ];
      }).flat(),
    ];
    const state = reduce(log);
    const decision = computeDecisionForPlayer(state, players[0]!.id);
    expect(decision).not.toBeNull();
    expect(decision!.ceiling.c1).toBe(0);
  });

  it('un giocatore scarso vale sistematicamente meno (p*) di uno forte, a parità di tutto il resto', () => {
    // v_A(score) non è mai letteralmente zero (fmMin/ptMin > 0, §6.1): con offerta scarsa anche un
    // giocatore debole può avere p* > 0 (riempie comunque uno slot). Il DoD verificato qui è quindi
    // relativo — coerente con quanto già provato rigorosamente in test/max-bid.test.ts — non che
    // p* sia letteralmente 0 in assoluto.
    const players = [...buildPool(30, 'A')];
    const log: AuctionEvent[] = [
      { t: 'league.setup', config: league },
      { t: 'players.load', players },
      ...scoreEvents(players.slice(1), () => 85), // molta offerta di alto livello
      { t: 'player.score', playerId: players[0]!.id, score: 85 },
    ];
    const state = reduce(log);
    const strongDecision = computeDecisionForPlayer(state, players[0]!.id)!;

    const weakLog: AuctionEvent[] = [
      ...log.slice(0, -1),
      { t: 'player.score', playerId: players[0]!.id, score: 2 },
    ];
    const weakState = reduce(weakLog);
    const weakDecision = computeDecisionForPlayer(weakState, players[0]!.id)!;

    expect(weakDecision.pStar).toBeLessThan(strongDecision.pStar);
  });

  it('ritorna null se la lega non è ancora configurata', () => {
    const state = reduce([{ t: 'players.load', players: buildPool(1) }]);
    expect(computeDecisionForPlayer(state, 'A0')).toBeNull();
  });
});

describe('§7 Session 8 — i duali (λ) non dipendono da QUALE candidato si sta prezzando', () => {
  // Bug reale segnalato dall'utente ("la parte dello slot del ruolo fa un casino"): computeDuals
  // veniva chiamato su roleInputsWithoutTarget (il target escluso dal pool), quindi ogni query per
  // un giocatore diverso escludeva un candidato diverso — e siccome λ (marginalValue, plan-dp.ts) è
  // una ricerca all'indietro dell'ultimo "gradino" dell'inviluppo, escludere candidati diversi può
  // spostare quel gradino a un budget completamente diverso. Su dati reali λ saltava da 1.05 a 0.42
  // togliendo un solo centrocampista dal pool — qui riprodotto in piccolo: λ deve essere lo stesso
  // qualunque sia il giocatore che si sta valutando nella STESSA istantanea d'asta, esattamente come
  // già fa correttamente sim/auction-sim.ts (duali ricalcolati sul pool intero, mai per-candidato).
  it('due giocatori diversi, stessa istantanea: stesso λ', () => {
    const players = buildPool(40, 'A');
    const log: AuctionEvent[] = [
      { t: 'league.setup', config: league },
      { t: 'players.load', players },
      ...scoreEvents(players, (p) => 20 + (Number(p.id.replace('A', '')) % 40) * 1.7),
    ];
    const state = reduce(log);

    const lambdas = players.map((p) => computeDecisionForPlayer(state, p.id)!.lambda);
    for (const l of lambdas) expect(l).toBeCloseTo(lambdas[0]!, 9);
  });

  it('property-based: λ è invariante rispetto al giocatore scelto come target, su pool casuali', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 1, max: 99, noNaN: true }), { minLength: 8, maxLength: 25 }),
        (scores) => {
          const players = buildPool(scores.length, 'A');
          const log: AuctionEvent[] = [
            { t: 'league.setup', config: league },
            { t: 'players.load', players },
            ...players.map((p, i) => ({ t: 'player.score' as const, playerId: p.id, score: scores[i]! })),
          ];
          const state = reduce(log);
          const lambdas = players.map((p) => computeDecisionForPlayer(state, p.id)!.lambda);
          const [first, ...rest] = lambdas;
          return rest.every((l) => Math.abs(l - first!) < 1e-9);
        },
      ),
      { numRuns: 30 },
    );
  });
});

describe('§11 Setup — peso per ruolo, stessa classe di regressione già trovata una volta per "risk"', () => {
  it('myValue del target scala ESATTAMENTE per il peso del suo ruolo, qualunque esso sia', () => {
    const players = buildPool(30, 'A');
    const baseLog: AuctionEvent[] = [
      { t: 'players.load', players },
      ...scoreEvents(players, () => 30 + Math.random() * 40),
    ];
    const boostedConfig = { ...league, roleWeights: { ...league.roleWeights, A: 2 } };
    const neutralState = reduce([{ t: 'league.setup', config: league }, ...baseLog]);
    const boostedState = reduce([{ t: 'league.setup', config: boostedConfig }, ...baseLog]);

    const target = players[0]!;
    const neutralDecision = computeDecisionForPlayer(neutralState, target.id)!;
    const boostedDecision = computeDecisionForPlayer(boostedState, target.id)!;
    expect(boostedDecision.myValue).toBeCloseTo(neutralDecision.myValue * 2, 6);
  });

  it('per il MIGLIOR candidato del ruolo pesato, p* sale (lo insegui con più aggressività)', () => {
    const players = buildPool(30, 'A');
    const target = players[0]!;
    const baseLog: AuctionEvent[] = [
      { t: 'players.load', players },
      { t: 'player.score', playerId: target.id, score: 95 }, // nettamente il migliore del ruolo
      ...scoreEvents(players.slice(1), () => 30 + Math.random() * 30), // 30-60, tutti sotto
    ];
    const boostedConfig = { ...league, roleWeights: { ...league.roleWeights, A: 2 } };
    const neutralState = reduce([{ t: 'league.setup', config: league }, ...baseLog]);
    const boostedState = reduce([{ t: 'league.setup', config: boostedConfig }, ...baseLog]);

    const neutralDecision = computeDecisionForPlayer(neutralState, target.id)!;
    const boostedDecision = computeDecisionForPlayer(boostedState, target.id)!;
    expect(boostedDecision.pStar).toBeGreaterThanOrEqual(neutralDecision.pStar);
  });

  it('per un candidato MEDIOCRE del ruolo pesato con alternative migliori disponibili, p* può SCENDERE — comportamento reale e voluto, non un bug: pesare di più un ruolo insegue i suoi migliori, non "paga di più chiunque ci giochi"', () => {
    const players = buildPool(30, 'A');
    const target = players[0]!;
    const baseLog: AuctionEvent[] = [
      { t: 'players.load', players },
      { t: 'player.score', playerId: target.id, score: 40 }, // mediocre
      ...scoreEvents(players.slice(1), () => 70 + Math.random() * 30), // 70-100, alternative migliori
    ];
    const boostedConfig = { ...league, roleWeights: { ...league.roleWeights, A: 2 } };
    const neutralState = reduce([{ t: 'league.setup', config: league }, ...baseLog]);
    const boostedState = reduce([{ t: 'league.setup', config: boostedConfig }, ...baseLog]);

    const neutralDecision = computeDecisionForPlayer(neutralState, target.id)!;
    const boostedDecision = computeDecisionForPlayer(boostedState, target.id)!;
    // Il valore grezzo del target raddoppia comunque...
    expect(boostedDecision.myValue).toBeCloseTo(neutralDecision.myValue * 2, 6);
    // ...ma l'offerta scende, perché ora conviene ANCORA di più aspettare uno dei migliori
    // alternativi dello stesso ruolo, anch'essi rivalutati dal peso più alto.
    expect(boostedDecision.pStar).toBeLessThanOrEqual(neutralDecision.pStar);
  });

  it('una config SENZA roleWeights (dati salvati prima di questo controllo) funziona come peso neutro', () => {
    // Simula un export JSON/localStorage precedente all'introduzione del campo: il tipo lo
    // richiede, ma un vecchio salvataggio reale non ce l'ha — verifica il fallback difensivo di
    // myRoleWeights(), non solo il caso "già impostato a 1" (banale per costruzione da
    // makeDefaultLeagueConfig, che imposta sempre {1,1,1,1}).
    const players = buildPool(20, 'D');
    const log: AuctionEvent[] = [{ t: 'players.load', players }, ...scoreEvents(players, () => 55)];

    const { roleWeights: _omit, ...legacyConfig } = league;
    const explicit = reduce([{ t: 'league.setup', config: league }, ...log]);
    const legacy = reduce([{ t: 'league.setup', config: legacyConfig as typeof league }, ...log]);

    const target = players[0]!;
    expect(computeDecisionForPlayer(legacy, target.id)!.myValue).toBe(computeDecisionForPlayer(explicit, target.id)!.myValue);
  });
});

describe('§6.2/§11 Setup — pesi di slot personalizzati (caso concreto: "due portieri titolari")', () => {
  // Serve un pool REALISTICO su tutti i ruoli, non solo P: con gli altri ruoli vuoti la DP non ha
  // nessun vero compromesso di budget da fare e p* satura al tetto per qualunque peso (verificato
  // — un pool degenere, non un test valido di questo comportamento).
  function realisticLog(): AuctionEvent[] {
    const p = buildPool(3, 'P');
    const d = buildPool(20, 'D');
    const c = buildPool(20, 'C');
    const a = buildPool(15, 'A');
    return [
      { t: 'players.load', players: [...p, ...d, ...c, ...a] },
      { t: 'player.score', playerId: p[0]!.id, score: 80 }, // già mio, 1° portiere
      { t: 'player.score', playerId: p[1]!.id, score: 78 }, // candidato: 2° portiere, quasi pari livello
      { t: 'player.score', playerId: p[2]!.id, score: 20 },
      ...d.map((pl, i): AuctionEvent => ({ t: 'player.score', playerId: pl.id, score: 30 + (i % 50) })),
      ...c.map((pl, i): AuctionEvent => ({ t: 'player.score', playerId: pl.id, score: 30 + (i % 50) })),
      ...a.map((pl, i): AuctionEvent => ({ t: 'player.score', playerId: pl.id, score: 30 + (i % 60) })),
      { t: 'sale', playerId: p[0]!.id, managerId: 'me', price: 50 },
    ];
  }
  const targetId = () => 'P1'; // secondo portiere costruito da buildPool(3, 'P') sopra

  it('con pesi di default (2° portiere fortemente scontato), offrire per un 2° portiere quasi pari al primo rende molto meno del tetto', () => {
    const state = reduce([{ t: 'league.setup', config: league }, ...realisticLog()]);
    const decision = computeDecisionForPlayer(state, targetId())!;
    // Peso di default del 2° slot P (0.11) molto più basso del 1° (0.87, §6.2): un secondo
    // portiere quasi pari al primo vale comunque molto meno del tetto assoluto, per costruzione.
    expect(decision.pStar).toBeLessThan(decision.ceiling.myMax * 0.5);
  });

  it('con pesi personalizzati "due titolari comparabili", lo stesso 2° portiere vale sensibilmente di più', () => {
    const log = realisticLog();
    const twoStartersConfig = { ...league, slotWeights: { ...league.slotWeights, P: [0.5, 0.45, 0.05] } };

    const defaultState = reduce([{ t: 'league.setup', config: league }, ...log]);
    const twoStartersState = reduce([{ t: 'league.setup', config: twoStartersConfig }, ...log]);

    const defaultDecision = computeDecisionForPlayer(defaultState, targetId())!;
    const twoStartersDecision = computeDecisionForPlayer(twoStartersState, targetId())!;
    expect(twoStartersDecision.pStar).toBeGreaterThan(defaultDecision.pStar);
  });

  it('una config SENZA slotWeights (dati salvati prima di questo controllo) funziona come i pesi di default', () => {
    const players = buildPool(20, 'C');
    const log: AuctionEvent[] = [{ t: 'players.load', players }, ...scoreEvents(players, () => 60)];

    const { slotWeights: _omit, ...legacyConfig } = league;
    const withDefault = reduce([{ t: 'league.setup', config: league }, ...log]);
    const legacy = reduce([{ t: 'league.setup', config: legacyConfig as typeof league }, ...log]);

    const target = players[0]!;
    const a = computeDecisionForPlayer(withDefault, target.id)!;
    const b = computeDecisionForPlayer(legacy, target.id)!;
    expect(b.pStar).toBe(a.pStar);
    expect(b.myValue).toBe(a.myValue);
  });

  it('slot di un ruolo cambiati DOPO aver personalizzato i suoi pesi non fa esplodere il calcolo (lunghezze disallineate corrette)', () => {
    const players = buildPool(6, 'A');
    const log: AuctionEvent[] = [{ t: 'players.load', players }, ...scoreEvents(players, () => 50)];
    // slotWeights.A ha 3 valori, ma league.slots.A di default è 6: lunghezze deliberatamente disallineate.
    const mismatchedConfig = { ...league, slotWeights: { ...league.slotWeights, A: [0.9, 0.5, 0.1] } };
    const state = reduce([{ t: 'league.setup', config: mismatchedConfig }, ...log]);
    expect(() => computeDecisionForPlayer(state, players[0]!.id)).not.toThrow();
    expect(computeDecisionForPlayer(state, players[0]!.id)!.pStar).toBeGreaterThanOrEqual(0);
  });
});

describe('§6.2/§11 Setup — audit di robustezza su config personalizzate avversariali', () => {
  function realisticLog(): AuctionEvent[] {
    const p = buildPool(3, 'P');
    const d = buildPool(20, 'D');
    const c = buildPool(20, 'C');
    const a = buildPool(15, 'A');
    return [
      { t: 'players.load', players: [...p, ...d, ...c, ...a] },
      ...[...p, ...d, ...c, ...a].map((pl, i): AuctionEvent => ({ t: 'player.score', playerId: pl.id, score: 20 + (i % 70) })),
    ];
  }

  it('pesi di slot tutti a zero per un ruolo non fa esplodere il calcolo (ruolo "spento", non un errore)', () => {
    const zeroConfig = { ...league, slotWeights: { ...league.slotWeights, P: [0, 0, 0] } };
    const state = reduce([{ t: 'league.setup', config: zeroConfig }, ...realisticLog()]);
    const target = Object.values(state.players).find((p) => p.role === 'P')!;
    expect(() => computeDecisionForPlayer(state, target.id)).not.toThrow();
    const decision = computeDecisionForPlayer(state, target.id)!;
    expect(Number.isFinite(decision.pStar)).toBe(true);
    expect(Number.isFinite(decision.myValue)).toBe(true);
  });

  it('zero slot per un ruolo (nessun bisogno) non fa esplodere il calcolo per un giocatore di QUEL ruolo', () => {
    const zeroSlotsConfig = { ...league, slots: { ...league.slots, P: 0 }, slotWeights: { ...league.slotWeights, P: [] } };
    const state = reduce([{ t: 'league.setup', config: zeroSlotsConfig }, ...realisticLog()]);
    const target = Object.values(state.players).find((p) => p.role === 'P')!;
    const decision = computeDecisionForPlayer(state, target.id);
    expect(decision).not.toBeNull();
    expect(Number.isFinite(decision!.pStar)).toBe(true);
    // Nessuno slot P da riempire ⇒ non serve, qualunque punteggio.
    expect(decision!.reason).toBe('not-useful');
  });

  it('peso per ruolo al massimo consentito (3) INSIEME a pesi di slot personalizzati non produce NaN/Infinity', () => {
    const extremeConfig = {
      ...league,
      roleWeights: { P: 3, D: 3, C: 3, A: 3 },
      slotWeights: { P: [0.9, 0.85, 0.8], D: league.slotWeights.D, C: league.slotWeights.C, A: league.slotWeights.A },
    };
    const state = reduce([{ t: 'league.setup', config: extremeConfig }, ...realisticLog()]);
    for (const p of Object.values(state.players).slice(0, 10)) {
      const decision = computeDecisionForPlayer(state, p.id)!;
      expect(Number.isFinite(decision.pStar)).toBe(true);
      expect(Number.isFinite(decision.myValue)).toBe(true);
      expect(Number.isFinite(decision.operationalMax)).toBe(true);
    }
  });

  it('qualunque combinazione valida di peso per ruolo e forma dei pesi di slot produce sempre numeri finiti, mai un errore (property-based)', () => {
    fc.assert(
      fc.property(
        fc.record({
          P: fc.double({ min: 0.3, max: 3, noNaN: true }),
          D: fc.double({ min: 0.3, max: 3, noNaN: true }),
          C: fc.double({ min: 0.3, max: 3, noNaN: true }),
          A: fc.double({ min: 0.3, max: 3, noNaN: true }),
        }),
        fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 3, maxLength: 3 }),
        (roleWeights, pWeightsRaw) => {
          // La UI riordina da sola in decrescente all'uscita dal campo (§11): stesso invariante qui.
          const pWeights = pWeightsRaw.slice().sort((a, b) => b - a);
          const config = { ...league, roleWeights, slotWeights: { ...league.slotWeights, P: pWeights } };
          const state = reduce([{ t: 'league.setup', config }, ...realisticLog()]);
          const target = Object.values(state.players).find((p) => p.role === 'P')!;
          const decision = computeDecisionForPlayer(state, target.id);
          if (!decision) return false;
          return (
            Number.isFinite(decision.pStar) &&
            Number.isFinite(decision.myValue) &&
            Number.isFinite(decision.operationalMax)
          );
        },
      ),
      { numRuns: 30 }, // ogni run rigioca reduce() su ~60 eventi: 30 basta a coprire lo spazio senza appesantire la suite
    );
  });

  it('tutti i ruoli restano validi (length coerente) dopo una combinazione realistica di modifiche in sequenza (slot cambiati, poi pesi personalizzati, come farebbe un utente in Setup)', () => {
    // Simula l'ordine reale con cui la UI di Setup costruisce la config: slot modificati prima,
    // pesi di slot normalizzati di conseguenza (stesso normalizeSlotWeights usato da SetupLeague.tsx).
    const changedSlots = { ...league.slots, D: 5, A: 9 };
    const config = { ...league, slots: changedSlots, slotWeights: { ...league.slotWeights } };
    for (const role of ROLES) {
      expect(() => {
        const state = reduce([{ t: 'league.setup', config }, ...realisticLog()]);
        const target = Object.values(state.players).find((p) => p.role === role);
        if (target) computeDecisionForPlayer(state, target.id);
      }).not.toThrow();
    }
  });
});

describe('§7 Session 8 applyHedge — "non serve" per il piano ottimo non deve azzerare l\'offerta se ho ancora slot liberi', () => {
  // Bug reale segnalato dall'utente da un'asta vera: con TUTTI gli slot di un ruolo ancora liberi
  // e un pool profondo (molti candidati migliori del target), il piano OTTIMO esatto (§6.6) dice
  // "non serve" per un giocatore comunque discreto — perché assume di poter ottenere con CERTEZZA
  // gli N migliori del pool ai loro prezzi attesi, un'ipotesi che non vale contro altri 9 manager
  // che li vogliono anche loro. Misurato su un'asta reale (175 candidati D per 8 slot): un
  // difensore score 62-71 risultava SEMPRE "non serve", pur con tutti gli 8 slot D liberi.
  // "Bisogna fare in modo che quelli forti ci sia sempre un valore d'offerta [...] è inutile
  // scrivere 'non serve': non serve rispetto a cosa?" (dall'utente).
  //
  // Testato direttamente su `applyHedge` (non ricostruendo uno scenario completo): riprodurre in
  // un test unitario le condizioni esatte in cui il piano ottimo diverge dall'approssimazione si è
  // rivelato fragile (il synthetic pool con punteggi sintetici e mercato fresco a 10 manager non
  // riproduce la stessa dinamica di un'asta reale a metà); la funzione pura isola esattamente la
  // decisione che conta, verificabile senza quella fragilità. Il comportamento end-to-end reale è
  // comunque confermato: sullo stesso export dell'asta reale che ha originato la segnalazione,
  // Gila (score 71, 8/8 slot D liberi) passa da pStar=0/"not-useful" a pStar=34/"hedge".
  function notUseful(phiLose = 100): MaxBidResult {
    return { pStar: 0, phiLose, reason: 'not-useful' };
  }

  it('non-useful + slot libero + copertura positiva ⇒ usa la copertura, non azzera', () => {
    const result = applyHedge(notUseful(), 34, true);
    expect(result.reason).toBe('hedge');
    expect(result.pStar).toBe(34);
    expect(result.phiLose).toBe(100);
  });

  it('non-useful + slot libero + copertura ANCH\'ESSA ≤ 0 (candidato genuinamente scarso) ⇒ resta "non serve", non forza un\'offerta per chiunque', () => {
    const result = applyHedge(notUseful(), 0, true);
    expect(result.reason).toBe('not-useful');
    expect(result.pStar).toBe(0);
  });

  it('non-useful + RUOLO REALMENTE PIENO (nessuno slot libero) ⇒ resta "non serve" anche con copertura positiva: è un vincolo vero, non un\'ipotesi da correggere', () => {
    const result = applyHedge(notUseful(), 34, false);
    expect(result.reason).toBe('not-useful');
    expect(result.pStar).toBe(0);
  });

  it('reason diverso da "not-useful" (es. "ok", "capped-by-budget") non viene mai toccato dalla copertura', () => {
    const ok: MaxBidResult = { pStar: 55, phiLose: 100, reason: 'ok' };
    expect(applyHedge(ok, 999, true)).toEqual(ok);
    const capped: MaxBidResult = { pStar: 0, phiLose: 100, reason: 'capped-by-budget' };
    expect(applyHedge(capped, 999, true)).toEqual(capped);
  });

  it('property-based: il risultato è sempre "hedge" con pStar=copertura, oppure identico all\'originale — mai un terzo caso', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<MaxBidResult['reason']>('ok', 'not-useful', 'capped-by-ceiling', 'capped-by-budget'),
        fc.double({ min: -50, max: 500, noNaN: true }),
        fc.boolean(),
        fc.double({ min: 0, max: 500, noNaN: true }),
        (reason, approxPStar, hasOpenSlot, phiLose) => {
          const original: MaxBidResult = { pStar: 0, phiLose, reason };
          const result = applyHedge(original, approxPStar, hasOpenSlot);
          const shouldHedge = reason === 'not-useful' && hasOpenSlot && approxPStar > 0;
          if (shouldHedge) {
            return result.reason === 'hedge' && result.pStar === approxPStar && result.phiLose === phiLose;
          }
          return result === original;
        },
      ),
    );
  });

  it('quando il ruolo è REALMENTE pieno (zero slot in config), "non serve" resta un vincolo vero end-to-end, non viene scavalcato dalla copertura', () => {
    const POOL_SIZE = 70;
    const zeroSlotsConfig = { ...league, slots: { ...league.slots, D: 0 }, slotWeights: { ...league.slotWeights, D: [] } };
    const pool = buildPool(POOL_SIZE, 'D');
    const log: AuctionEvent[] = [
      { t: 'league.setup', config: zeroSlotsConfig },
      { t: 'players.load', players: pool },
      ...scoreEvents(pool, (p) => 96 - Math.round((Number(p.id.replace('D', '')) * 76) / (POOL_SIZE - 1))),
    ];
    const state = reduce(log);
    const target = pool[0]!; // il migliore del pool: sarebbe sicuramente "utile" se ci fosse spazio
    const decision = computeDecisionForPlayer(state, target.id)!;
    expect(decision.reason).toBe('not-useful');
    expect(decision.pStar).toBe(0);
  });
});
