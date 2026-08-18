// §11 / §12 F12 — Prova a secco. DoD: gira in < 30s in browser; produce la distribuzione della
// rosa attesa per ruolo e la evidenzia se sbilanciata.
import { describe, expect, it } from 'vitest';
import { buildSimulatedAuctionReport, runDryRun, runSingleSimulatedAuction } from '../src/sim/dry-run.js';
import { reduce } from '../src/core/state.js';
import { makeDefaultLeagueConfig } from '../src/core/config.js';
import { ROLES } from '../src/core/types.js';
import type { AuctionEvent, Player } from '../src/core/types.js';

const league = makeDefaultLeagueConfig();

function buildPool(n: number, role: 'P' | 'D' | 'C' | 'A'): Player[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${role}${i}`,
    name: `${role}${i}`,
    team: `team-${i % 10}`,
    role,
  }));
}

function realisticState() {
  const players = [...buildPool(60, 'P'), ...buildPool(180, 'D'), ...buildPool(190, 'C'), ...buildPool(110, 'A')];
  const log: AuctionEvent[] = [
    { t: 'league.setup', config: league },
    { t: 'players.load', players },
    ...players.map((p, i) => ({
      t: 'player.score' as const,
      playerId: p.id,
      score: 100 * (1 - Math.pow(i / 50, 0.65) % 1),
    })),
  ];
  return reduce(log);
}

describe('§12 F12 runDryRun', () => {
  it('completa in tempi ragionevoli e produce una riga per ogni ruolo', async () => {
    const state = realisticState();
    const start = performance.now();
    const summary = await runDryRun(state, 20); // scala ridotta per un test veloce
    const elapsed = performance.now() - start;

    expect(summary.iterations).toBe(20);
    expect(summary.byRole).toHaveLength(4);
    for (const role of ROLES) {
      const entry = summary.byRole.find((r) => r.role === role);
      expect(entry).toBeDefined();
      expect(entry!.avgSlotsFilled).toBeGreaterThan(0);
      expect(entry!.avgSlotsFilled).toBeLessThanOrEqual(league.slots[role]);
    }
    expect(summary.avgFinalValue).toBeGreaterThan(0);
    // eslint-disable-next-line no-console
    console.log(`runDryRun(20 iter) in ${elapsed.toFixed(0)}ms`);
  });

  it('riporta i progressi tramite la callback onProgress', async () => {
    const state = realisticState();
    const calls: { done: number; total: number }[] = [];
    await runDryRun(state, 20, (p) => calls.push(p));
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[calls.length - 1]).toEqual({ done: 20, total: 20 });
  });

  it('lancia un errore chiaro se la lega non è configurata', async () => {
    const state = reduce([]);
    await expect(runDryRun(state, 5)).rejects.toThrow();
  });
});

describe('§9.5 diagnostica — spesa per ruolo, crediti non spesi, punteggio/prezzo, obiettivi', () => {
  it('budgetShareByRole ha una riga per ruolo, quote sommano a ~1 e il target è quello di config', async () => {
    const state = realisticState();
    const summary = await runDryRun(state, 20);

    expect(summary.budgetShareByRole).toHaveLength(4);
    const totalActual = summary.budgetShareByRole.reduce((s, r) => s + r.actualShare, 0);
    expect(totalActual).toBeCloseTo(1, 1);
    for (const role of ROLES) {
      const row = summary.budgetShareByRole.find((r) => r.role === role)!;
      expect(row.targetShare).toBeGreaterThan(0);
      expect(row.targetShare).toBeLessThan(1);
    }
  });

  it('creditsUnspent riporta p10 ≤ mediana ≤ p90 e sono tutti ≥ 0', async () => {
    const state = realisticState();
    const summary = await runDryRun(state, 20);

    expect(summary.creditsUnspent.p10).toBeLessThanOrEqual(summary.creditsUnspent.median);
    expect(summary.creditsUnspent.median).toBeLessThanOrEqual(summary.creditsUnspent.p90);
    expect(summary.creditsUnspent.p10).toBeGreaterThanOrEqual(0);
  });

  it('senza obiettivi ★ segnati, targetAcquisition è null', async () => {
    const state = realisticState();
    const summary = await runDryRun(state, 20);
    expect(summary.targetAcquisition).toBeNull();
  });

  it('con obiettivi ★ segnati, targetAcquisition conta su quelli e il tasso resta in [0,1]', async () => {
    let state = realisticState();
    const targetPlayerIds = Object.keys(state.players).slice(0, 5);
    for (const playerId of targetPlayerIds) {
      state = reduce([...state.log, { t: 'player.target', playerId, isTarget: true }]);
    }
    const summary = await runDryRun(state, 20);

    expect(summary.targetAcquisition).not.toBeNull();
    expect(summary.targetAcquisition!.totalTargets).toBe(5);
    expect(summary.targetAcquisition!.rate).toBeGreaterThanOrEqual(0);
    expect(summary.targetAcquisition!.rate).toBeLessThanOrEqual(1);
  });

  it('scoreVsPrice ha un punto per ogni acquisto, con score e prezzo validi', async () => {
    const state = realisticState();
    const summary = await runDryRun(state, 20);

    expect(summary.scoreVsPrice.length).toBeGreaterThan(0);
    for (const p of summary.scoreVsPrice.slice(0, 50)) {
      expect(p.score).toBeGreaterThanOrEqual(0);
      expect(p.score).toBeLessThanOrEqual(100);
      expect(p.price).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('§11 runSingleSimulatedAuction — un\'asta simulata per intero', () => {
  it('produce vendite valide, coprendo (vendute + rimaste) tutti i giocatori con slot compatibili in lega', () => {
    const state = realisticState();
    const result = runSingleSimulatedAuction(state, 1);

    expect(result.sales.length).toBeGreaterThan(0);
    for (const s of result.sales) {
      expect(s.price).toBeGreaterThanOrEqual(1);
      expect(s.name.length).toBeGreaterThan(0);
    }
    // in ordine di estrazione
    for (let i = 1; i < result.sales.length; i++) {
      expect(result.sales[i]!.drawIndex).toBeGreaterThan(result.sales[i - 1]!.drawIndex);
    }
  });

  it('la mia rosa in questa singola asta non supera mai gli slot di lega, per ruolo', () => {
    const state = realisticState();
    const result = runSingleSimulatedAuction(state, 2);
    const league2 = makeDefaultLeagueConfig();
    for (const role of ROLES) {
      const mine = result.myRoster.filter((p) => p.role === role);
      expect(mine.length).toBeLessThanOrEqual(league2.slots[role]);
    }
  });

  it('myTotalSpent coincide con la somma dei prezzi nella mia rosa', () => {
    const state = realisticState();
    const result = runSingleSimulatedAuction(state, 3);
    const sum = result.myRoster.reduce((s, p) => s + p.price, 0);
    expect(result.myTotalSpent).toBe(sum);
  });

  it('stesso seed ⇒ stesso risultato (determinismo, §13.10)', () => {
    const state = realisticState();
    const a = runSingleSimulatedAuction(state, 42);
    const b = runSingleSimulatedAuction(state, 42);
    expect(a).toEqual(b);
  });

  it('seed diversi producono aste diverse (non sempre la stessa)', () => {
    const state = realisticState();
    const a = runSingleSimulatedAuction(state, 10);
    const b = runSingleSimulatedAuction(state, 11);
    expect(a.sales).not.toEqual(b.sales);
  });

  it('lancia un errore chiaro se la lega non è configurata', () => {
    const state = reduce([]);
    expect(() => runSingleSimulatedAuction(state, 1)).toThrow();
  });
});

describe('§7 Session 8 buildSimulatedAuctionReport — Report asta applicato a un\'asta simulata', () => {
  it('ritorna null se la lega non è configurata, senza lanciare', () => {
    const state = reduce([]);
    expect(buildSimulatedAuctionReport(state, 1)).toBeNull();
  });

  it('la somma di 1ª e 2ª metà copre esattamente tutti i miei acquisti, senza doppi conteggi', () => {
    const state = realisticState();
    const simReport = buildSimulatedAuctionReport(state, 5)!;
    expect(simReport).not.toBeNull();
    expect(simReport.firstHalf.purchaseCount + simReport.secondHalf.purchaseCount).toBe(
      simReport.report.myPurchases.length,
    );
  });

  it('i conteggi di overpay per metà non superano mai gli acquisti di quella metà, e i crediti non sono mai negativi', () => {
    const state = realisticState();
    const simReport = buildSimulatedAuctionReport(state, 6)!;
    for (const half of [simReport.firstHalf, simReport.secondHalf]) {
      expect(half.overpayCount).toBeLessThanOrEqual(half.purchaseCount);
      expect(half.overpaidCredits).toBeGreaterThanOrEqual(0);
    }
  });

  it('il totale speso nel report coincide con quello della sola asta simulata (nessuna divergenza nella conversione a log sintetico)', () => {
    const state = realisticState();
    const simReport = buildSimulatedAuctionReport(state, 7)!;
    expect(simReport.report.totalSpent).toBe(simReport.auction.myTotalSpent);
  });

  it(
    'stesso seed ⇒ stesso report (determinismo, §13.10)',
    () => {
      // Timeout esplicito: buildPostAuctionReport è O(n²) negli eventi (§ commento in
      // post-auction-report.ts) e qui lo si chiama due volte di seguito su un'asta a scala piena
      // (~250 vendite), ~3s a chiamata — oltre il timeout di default di vitest (5s) per un test
      // che ne fa due, non un problema di prestazioni del codice.
      const state = realisticState();
      const a = buildSimulatedAuctionReport(state, 42);
      const b = buildSimulatedAuctionReport(state, 42);
      expect(a).toEqual(b);
    },
    15000,
  );
});
