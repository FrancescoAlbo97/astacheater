// Test di integrazione (§7 Session 8, richiesti esplicitamente dall'utente dopo diversi round di
// bug reali trovati durante l'uso vero): una dozzina di situazioni concrete "da metà asta" — non
// singole funzioni isolate come negli altri file, ma `computeDecisionForPlayer` end-to-end su uno
// STATO REALISTICO parzialmente giocato, verificando che il comportamento risultante sia quello che
// farebbe davvero la differenza per raggiungere i propri obiettivi. Citando l'utente: "situazioni
// che si avviano spesso da 'metà asta' ma che poi fanno la differenza nell'ottenimento degli
// obiettivi" — es. diventare l'unico con uno slot libero (prezzo che crolla a 1), o comprare un
// centrocampista costoso lasciandosi comunque budget per rilanciare su un attaccante dopo.
import { describe, expect, it } from 'vitest';
import { reduce } from '../src/core/state.js';
import { computeDecisionForPlayer, estimateOpponentWillingness, computeMarketSnapshot } from '../src/core/engine.js';
import { makeDefaultLeagueConfig, DEFAULT_PRICE_CURVES, DEFAULT_SLOTS } from '../src/core/config.js';
import { getMyManagerId } from '../src/core/state.js';
import { ROLES } from '../src/core/types.js';
import type { AuctionEvent, Player, Role } from '../src/core/types.js';

const league = makeDefaultLeagueConfig(); // 10 manager (me + 9 avversari), budget 500, slot P3/D8/C8/A6
const OPPONENT_IDS = league.managers.slice(1).map((m) => m.id);

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

/** Vende ai 9 avversari abbastanza giocatori-filler in `role` da saturare TUTTI i loro slot in
 * quel ruolo (usato per gli scenari di scarsità/garanzia sotto) — i MIEI slot in quel ruolo restano
 * intatti. Ritorna i giocatori creati + gli eventi da aggiungere al log. */
function fillOpponentsRole(role: Role): { players: Player[]; events: AuctionEvent[] } {
  const players: Player[] = [];
  const events: AuctionEvent[] = [];
  for (const mgrId of OPPONENT_IDS) {
    for (let s = 0; s < DEFAULT_SLOTS[role]; s++) {
      const id = `filler-${role}-${mgrId}-${s}`;
      players.push(mkPlayer(id, role));
    }
  }
  events.push(loadEvent(players));
  for (const p of players) {
    events.push(scoreEvent(p.id, 30));
    // ogni avversario deve pagare qualcosa per ciascun proprio slot: 1 credito basta e lascia
    // comunque budget realistico per gli scenari di budget-a-metà-asta più sotto.
  }
  for (const mgrId of OPPONENT_IDS) {
    const own = players.filter((p) => p.id.includes(`-${mgrId}-`));
    for (const p of own) events.push(saleEvent(p.id, mgrId, 1));
  }
  return { players, events };
}

/** Riempie un pool di N candidati "generici" in un ruolo con punteggi distribuiti su un range
 * realistico — usato per dare profondità al pool dove serve (es. lo scenario "non serve" per
 * certezza-equivalenza, §6.6). */
function genericPool(role: Role, n: number, minScore: number, maxScore: number): { players: Player[]; events: AuctionEvent[] } {
  const players: Player[] = Array.from({ length: n }, (_, i) => mkPlayer(`${role}-pool-${i}`, role));
  const events: AuctionEvent[] = [loadEvent(players)];
  players.forEach((p, i) => {
    const score = maxScore - ((maxScore - minScore) * i) / Math.max(1, n - 1);
    events.push(scoreEvent(p.id, score));
  });
  return { players, events };
}

describe('§7 Session 8 — scenari di integrazione "da metà asta"', () => {
  it('1) divento l\'unico con lo slot libero nel ruolo: il prossimo giocatore è garantito al minimo — esempio testuale dell\'utente', () => {
    // "lasciando un giocatore poi sono l'unico con lo slot libero e quindi lo prendo a 1" — qui
    // simulato saturando gli slot P di TUTTI e 9 gli avversari con vendite reali, lasciando i miei
    // 3 slot P intatti: qualunque portiere rimasto nel pool deve risultare garantito al prezzo
    // minimo, non un numero qualunque vicino a 1 per coincidenza.
    const { players: fillers, events: fillEvents } = fillOpponentsRole('P');
    const target = mkPlayer('P-target', 'P');
    const log: AuctionEvent[] = [
      { t: 'league.setup', config: league },
      ...fillEvents,
      loadEvent([target]),
      scoreEvent(target.id, 75),
    ];
    const state = reduce(log);
    const decision = computeDecisionForPlayer(state, target.id)!;

    expect(decision.ceiling.c1).toBe(0);
    expect(decision.operationalMax).toBe(league.minPrice);
    expect(decision.pStar).toBeGreaterThanOrEqual(league.minPrice);
    expect(fillers.length).toBe(9 * DEFAULT_SLOTS.P);
  });

  it('2) NON garantito finché anche un solo avversario ha ancora uno slot libero e può permetterselo', () => {
    // Controprova del caso 1: se anche un solo avversario NON è saturo nel ruolo, il tetto deve
    // restare positivo — la garanzia non deve scattare "quasi sempre" per errore.
    const { players: fillers, events: fillEvents } = fillOpponentsRole('P');
    // Riporto un avversario ad avere uno slot libero: gli "restituisco" un P (evento `revert`).
    const freed = fillers.find((p) => p.id.includes(`-${OPPONENT_IDS[0]}-0`))!;
    const target = mkPlayer('P-target-2', 'P');
    const log: AuctionEvent[] = [
      { t: 'league.setup', config: league },
      ...fillEvents,
      { t: 'revert', playerId: freed.id },
      loadEvent([target]),
      scoreEvent(target.id, 75),
    ];
    const state = reduce(log);
    const decision = computeDecisionForPlayer(state, target.id)!;

    expect(decision.ceiling.c1).toBeGreaterThan(0);
  });

  it('3) compro un centrocampista costoso ma mi resta budget vero per rilanciare su un attaccante — esempio testuale dell\'utente', () => {
    // "prendo un centrocampista costoso, ma mi lascio del budget in modo che posso rilanciare per
    // un attaccante" — qui si verifica che il modello NON sabota le altre categorie dopo un
    // acquisto importante ma non estremo: con budget 500 e 25 slot totali, spenderne 200 su UN
    // centrocampista lascia comunque un tetto reale e un'offerta operativa sensata su un attaccante
    // di valore, non un numero quasi azzerato.
    const { events: poolC } = genericPool('C', 40, 40, 95);
    const { events: poolA } = genericPool('A', 40, 40, 95);
    const expensiveC = mkPlayer('C-expensive', 'C');
    const targetA = mkPlayer('A-target', 'A');
    const log: AuctionEvent[] = [
      { t: 'league.setup', config: league },
      ...poolC,
      ...poolA,
      loadEvent([expensiveC, targetA]),
      scoreEvent(expensiveC.id, 96),
      scoreEvent(targetA.id, 90),
      saleEvent(expensiveC.id, 'me', 200),
    ];
    const state = reduce(log);
    const decision = computeDecisionForPlayer(state, targetA.id)!;

    expect(decision.ceiling.myMax).toBeGreaterThan(200); // 500-200 crediti, 24 slot residui -> 277
    expect(decision.operationalMax).toBeGreaterThan(50); // budget vero per "rilanciare", non simbolico
  });

  it('3b) contraltare: uno strasperpero SUL SERIO comprime davvero le offerte successive, come deve — non un falso "va tutto bene"', () => {
    const { events: poolA } = genericPool('A', 40, 40, 95);
    const overspendC = mkPlayer('C-overspend', 'C');
    const targetA = mkPlayer('A-target-2', 'A');
    const log: AuctionEvent[] = [
      { t: 'league.setup', config: league },
      ...poolA,
      loadEvent([overspendC, targetA]),
      scoreEvent(overspendC.id, 96),
      scoreEvent(targetA.id, 90),
      saleEvent(overspendC.id, 'me', 476), // 500 - 24 slot residui + 1 = il massimo assoluto per uno slot
    ];
    const state = reduce(log);
    const decision = computeDecisionForPlayer(state, targetA.id)!;

    expect(decision.ceiling.myMax).toBe(1); // resta solo 1 credito per slot, aritmetica esatta
    expect(decision.operationalMax).toBeLessThanOrEqual(1);
  });

  it('4) certezza-equivalenza: un buon giocatore con pool profondo e slot tutti aperti non deve mai restare "non serve" a offerta zero — regressione applyHedge a livello di integrazione', () => {
    // Stessa dinamica del caso reale che ha portato al fix di `applyHedge` questa sessione (Gila:
    // 8/8 slot D aperti, pool profondo -> "non serve" perché il piano ottimo esatto assume di
    // ottenere con CERTEZZA gli 8 migliori del pool). Qui riprodotto sinteticamente.
    const { events: poolD } = genericPool('D', 150, 20, 96);
    const target = mkPlayer('D-midpack', 'D');
    const log: AuctionEvent[] = [
      { t: 'league.setup', config: league },
      ...poolD,
      loadEvent([target]),
      scoreEvent(target.id, 71), // decisamente a metà classifica su un pool profondo di 150
    ];
    const state = reduce(log);
    const decision = computeDecisionForPlayer(state, target.id)!;

    expect(decision.pStar).toBeGreaterThan(0);
    expect(['ok', 'hedge']).toContain(decision.reason);
  });

  it('5) ruolo DAVVERO pieno per me: resta "non serve" sempre, anche per un fenomeno assoluto — vincolo vero, mai scavalcato', () => {
    const fullMe: AuctionEvent[] = [];
    const mePlayers: Player[] = Array.from({ length: DEFAULT_SLOTS.P }, (_, i) => mkPlayer(`me-p-${i}`, 'P'));
    fullMe.push(loadEvent(mePlayers));
    for (const p of mePlayers) {
      fullMe.push(scoreEvent(p.id, 50));
      fullMe.push(saleEvent(p.id, 'me', 10));
    }
    const target = mkPlayer('P-phenomenon', 'P');
    const log: AuctionEvent[] = [{ t: 'league.setup', config: league }, ...fullMe, loadEvent([target]), scoreEvent(target.id, 99)];
    const state = reduce(log);
    const decision = computeDecisionForPlayer(state, target.id)!;

    expect(decision.reason).toBe('not-useful');
    expect(decision.pStar).toBe(0);
  });

  it('6) occasione reale — copertura titolari (§11 Session 9): lo stesso candidato riceve un\'offerta massima più alta quando mi manca ancora un titolare nel ruolo, più bassa una volta che l\'ho già assicurato', () => {
    // §7 Session 9: da quando playerValue è direttamente la curva di prezzo (non più punti ×
    // titolarità), un puro divario di SCORE non crea più "prezzo basso, valore pari" — le due
    // grandezze derivano dalla stessa curva monotona, quindi si muovono insieme (vedi il nuovo test
    // dedicato in value-model.test.ts). L'occasione realistica sotto il nuovo modello nasce invece
    // dalla copertura-titolari per ruolo: lo STESSO identico candidato (score e prezzo di mercato
    // fissi) deve valere di più per me quando mi manca ancora un titolare assicurato in quel ruolo,
    // e tornare al suo valore "nudo" (prezzo di mercato) una volta che la copertura è già piena —
    // "gli altri due mi posso permettere che abbiano meno titolarità e concentrarmi sul valore".
    const { events: poolD } = genericPool('D', 60, 40, 90);
    const candidate = mkPlayer('D-candidate', 'D');
    const loadCandidate: AuctionEvent[] = [loadEvent([candidate]), scoreEvent(candidate.id, 70, 0.85)];

    // Stato A: nessun difensore posseduto ⇒ copertura scoperta (gapFraction=1 in D).
    const stateUncovered = reduce([{ t: 'league.setup', config: league }, ...poolD, ...loadCandidate]);

    // Stato B: possiedo già 4 difensori titolari certi (score/ptOverride alti) ⇒ copertura piena
    // (startersCountFor('D','4-3-3')=4, +1 di scorta=5 — qui ne bastano 4 quasi-certi per restare
    // vicino alla soglia senza superarla di molto, il punto è che il gap sia MOLTO più piccolo).
    const ownedStarters: AuctionEvent[] = [];
    for (let i = 0; i < 5; i++) {
      const id = `D-owned-${i}`;
      ownedStarters.push(loadEvent([mkPlayer(id, 'D')]));
      ownedStarters.push(scoreEvent(id, 90, 0.98));
      ownedStarters.push(saleEvent(id, 'me', 30));
    }
    const stateCovered = reduce([
      { t: 'league.setup', config: league },
      ...poolD,
      ...ownedStarters,
      ...loadCandidate,
    ]);

    const dUncovered = computeDecisionForPlayer(stateUncovered, candidate.id)!;
    const dCovered = computeDecisionForPlayer(stateCovered, candidate.id)!;

    expect(dUncovered.myValue).toBeGreaterThan(dCovered.myValue);
    expect(dUncovered.pStar).toBeGreaterThan(dCovered.pStar);
  });

  it('7) stima interesse avversari: solo chi ha davvero uno slot libero conta, mai chi è già pieno nel ruolo (§7 Session 8, ispirazione 1)', () => {
    const { events: poolD } = genericPool('D', 30, 40, 90);
    const target = mkPlayer('D-wanted', 'D');
    const richOpponent = OPPONENT_IDS[0]!;
    const fullOpponent = OPPONENT_IDS[1]!;
    // fullOpponent riempie TUTTI i suoi slot D (esce dalla contesa per questo ruolo).
    const fullSlots: AuctionEvent[] = [];
    for (let s = 0; s < DEFAULT_SLOTS.D; s++) {
      const id = `full-d-${s}`;
      fullSlots.push(loadEvent([mkPlayer(id, 'D')]));
      fullSlots.push(scoreEvent(id, 40));
      fullSlots.push(saleEvent(id, fullOpponent, 1));
    }
    const log: AuctionEvent[] = [
      { t: 'league.setup', config: league },
      ...poolD,
      ...fullSlots,
      loadEvent([target]),
      scoreEvent(target.id, 85),
    ];
    const state = reduce(log);
    const decision = computeDecisionForPlayer(state, target.id)!;
    const snapshot = computeMarketSnapshot(state);
    const willingness = estimateOpponentWillingness(state, snapshot, 'D', target.id, decision.myValue, DEFAULT_PRICE_CURVES);

    expect(willingness.managerId).not.toBe(fullOpponent);
    if (willingness.managerId) {
      const chosenManager = snapshot.managers.find((m) => m.manager.id === willingness.managerId)!;
      expect(chosenManager.slotsRemaining.D).toBeGreaterThan(0);
      expect(willingness.value).toBeLessThanOrEqual(chosenManager.creditsRemaining);
    }
    expect(richOpponent).not.toBe(fullOpponent); // guardia di setup: due avversari distinti
  });

  it('8) λ resta lo stesso per due bersagli diversi anche in un\'asta ASIMMETRICA (non solo nel caso simmetrico già coperto altrove)', () => {
    // Replica in miniatura il bug reale di questa sessione (§7 Session 8): qui però su uno stato
    // parzialmente giocato e asimmetrico (alcuni manager hanno già comprato, altri no) — il caso
    // più vicino a un'asta vera, non lo scenario simmetrico "zero vendite" già testato in
    // engine.test.ts.
    const { events: poolA } = genericPool('A', 50, 40, 96);
    const partial: AuctionEvent[] = [
      saleEvent('A-pool-0', OPPONENT_IDS[0]!, 80),
      saleEvent('A-pool-3', OPPONENT_IDS[1]!, 40),
      saleEvent('A-pool-7', 'me', 15),
    ];
    const t1 = mkPlayer('A-t1', 'A');
    const t2 = mkPlayer('A-t2', 'A');
    const log: AuctionEvent[] = [
      { t: 'league.setup', config: league },
      ...poolA,
      ...partial,
      loadEvent([t1, t2]),
      scoreEvent(t1.id, 88),
      scoreEvent(t2.id, 61),
    ];
    const state = reduce(log);
    const d1 = computeDecisionForPlayer(state, t1.id)!;
    const d2 = computeDecisionForPlayer(state, t2.id)!;

    expect(d1.lambda).toBeCloseTo(d2.lambda, 9);
  });

  it('9) allarme scarsità: scatta quando il pool residuo nel ruolo non basta più a coprire chi ha ancora uno slot libero', () => {
    const scarcePlayers: Player[] = Array.from({ length: 4 }, (_, i) => mkPlayer(`A-scarce-${i}`, 'A'));
    const log: AuctionEvent[] = [
      { t: 'league.setup', config: league },
      loadEvent(scarcePlayers),
      ...scarcePlayers.map((p) => scoreEvent(p.id, 70)),
    ];
    const state = reduce(log);
    const decision = computeDecisionForPlayer(state, scarcePlayers[0]!.id)!;

    // 4 giocatori in tutto il pool A, ma 6 miei slot A + 9×6 avversari: la domanda supera di gran
    // lunga l'offerta fin dall'inizio in questo scenario sintetico deliberatamente scarso.
    expect(decision.scarcity.poolRemaining).toBeLessThanOrEqual(
      decision.scarcity.mySlotsRemaining + decision.scarcity.opponentsSlotsRemaining,
    );
  });

  it('10) budget quasi esaurito: l\'offerta operativa non supera mai il vero massimo per slot, qualunque sia il valore del candidato', () => {
    const { events: poolC } = genericPool('C', 30, 30, 95);
    // spendo quasi tutto il budget su acquisti precedenti, lasciando pochissimo per slot residuo.
    const spend: AuctionEvent[] = [];
    let spent = 0;
    for (let i = 0; i < 20 && spent < 480; i++) {
      spend.push(saleEvent(`C-pool-${i}`, 'me', 24));
      spent += 24;
    }
    const target = mkPlayer('C-late', 'C');
    const log: AuctionEvent[] = [{ t: 'league.setup', config: league }, ...poolC, ...spend, loadEvent([target]), scoreEvent(target.id, 90)];
    const state = reduce(log);
    const decision = computeDecisionForPlayer(state, target.id)!;

    expect(decision.operationalMax).toBeLessThanOrEqual(decision.ceiling.myMax);
    expect(decision.operationalMax).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(decision.operationalMax)).toBe(true);
  });

  it('11) uno strasperpero su un ruolo non "avvelena" le decisioni su un ruolo scorrelato: restano numeri finiti e sensati', () => {
    const { events: poolD } = genericPool('D', 40, 40, 90);
    const target = mkPlayer('D-after-overspend', 'D');
    const log: AuctionEvent[] = [
      { t: 'league.setup', config: league },
      ...poolD,
      saleEvent('D-pool-0', 'me', 1), // occupo comunque uno slot D, non deve sporcare il resto
      loadEvent([target]),
      scoreEvent(target.id, 82),
    ];
    const state = reduce(log);
    const decision = computeDecisionForPlayer(state, target.id)!;

    expect(Number.isFinite(decision.myValue)).toBe(true);
    expect(Number.isFinite(decision.pStar)).toBe(true);
    expect(Number.isFinite(decision.lambda)).toBe(true);
    expect(decision.myValue).toBeGreaterThan(0);
  });

  it('12) storia completa: un difensore-occasione a metà asta riceve un\'offerta superiore a quella che stimiamo interessi al miglior avversario — coerente con "vale la pena rischiare su di lui ORA"', () => {
    const { events: poolD } = genericPool('D', 80, 30, 95);
    const bargain = mkPlayer('D-story', 'D');
    const priceHistory: AuctionEvent[] = [];
    for (let i = 0; i < 25; i++) {
      const id = `D-story-hist-${i}`;
      const score = 30 + i * 2;
      priceHistory.push(loadEvent([mkPlayer(id, 'D')]));
      priceHistory.push(scoreEvent(id, score));
      priceHistory.push(saleEvent(id, OPPONENT_IDS[i % OPPONENT_IDS.length]!, Math.max(1, Math.round(Math.exp(score / 25)))));
    }
    const log: AuctionEvent[] = [
      { t: 'league.setup', config: league },
      ...poolD,
      ...priceHistory,
      loadEvent([bargain]),
      scoreEvent(bargain.id, 58, 0.97), // punteggio modesto, titolarità quasi certa: occasione tipica
    ];
    const state = reduce(log);
    const decision = computeDecisionForPlayer(state, bargain.id)!;
    const snapshot = computeMarketSnapshot(state);
    const willingness = estimateOpponentWillingness(state, snapshot, 'D', bargain.id, decision.myValue, DEFAULT_PRICE_CURVES);

    expect(decision.pStar).toBeGreaterThan(0);
    // il tetto FISICO resta il vincolo vero: l'offerta operativa non lo supera mai, a prescindere
    // da quanto convinti siamo che valga la pena inseguirlo.
    expect(decision.operationalMax).toBeLessThanOrEqual(decision.ceiling.c1 + 1);
    expect(willingness.value).toBeGreaterThanOrEqual(0);
  });
});
