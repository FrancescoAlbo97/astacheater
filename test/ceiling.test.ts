// §6.4 / §12 F5 — Tetto avversari (esatto). Casi limite obbligatori (§6.4, §13.5).
import { describe, expect, it } from 'vitest';
import { ceilingForRole, maxSingleBid, operationalMaxBid, expectedPriceFromCeiling } from '../src/core/ceiling.js';
import type { ManagerState, SlotCounts } from '../src/core/types.js';

function slots(p: number, d: number, c: number, a: number): SlotCounts {
  return { P: p, D: d, C: c, A: a };
}

function makeManager(
  id: string,
  credits: number,
  remainingSlots: SlotCounts,
  isMe = false,
): ManagerState {
  return {
    manager: { id, name: id, isMe },
    creditsRemaining: credits,
    slotsRemaining: remainingSlots,
    roster: [],
  };
}

describe('§6.4 c_m = b_m − (k_m − 1)', () => {
  it('caso base', () => {
    const m = makeManager('m1', 100, slots(1, 5, 5, 4)); // k=15
    expect(maxSingleBid(m)).toBe(100 - 14);
  });

  it('§13.5: k_m = 1 ⇒ c_m = b_m (può spendere tutto)', () => {
    const m = makeManager('m1', 42, slots(0, 0, 0, 1));
    expect(maxSingleBid(m)).toBe(42);
  });
});

describe('§6.4 ceilingForRole — casi limite', () => {
  it('nessun avversario eleggibile ⇒ C¹=0, C²=0, holder null', () => {
    const me = makeManager('me', 500, slots(3, 8, 8, 6), true);
    const opp = makeManager('opp1', 400, slots(0, 8, 8, 6)); // 0 slot P residui
    const info = ceilingForRole([me, opp], 'me', 'P');
    expect(info.c1).toBe(0);
    expect(info.c2).toBe(0);
    expect(info.holder1).toBeNull();
    expect(info.holder2).toBeNull();
  });

  it('un solo avversario eleggibile ⇒ C¹ definito, C²=0, holder2 null', () => {
    const me = makeManager('me', 500, slots(3, 8, 8, 6), true);
    const opp1 = makeManager('opp1', 300, slots(1, 8, 8, 6));
    const opp2 = makeManager('opp2', 400, slots(0, 8, 8, 6)); // niente P
    const info = ceilingForRole([me, opp1, opp2], 'me', 'P');
    expect(info.c1).toBe(maxSingleBid(opp1));
    expect(info.c2).toBe(0);
    expect(info.holder1?.manager.id).toBe('opp1');
    expect(info.holder2).toBeNull();
  });

  it('C¹=0 ⇒ giocatore garantito a 1 credito (nessuno può rilanciare)', () => {
    const me = makeManager('me', 500, slots(3, 8, 8, 6), true);
    const info = ceilingForRole([me], 'me', 'A'); // nessun avversario in lega
    expect(info.c1).toBe(0);
    expect(operationalMaxBid(999, info)).toBe(1); // min(pStar, C¹+1=1, c_0)
  });

  it('pareggi fra c_m: C¹ e C² coincidono, entrambi assegnati', () => {
    const me = makeManager('me', 500, slots(3, 8, 8, 6), true);
    const opp1 = makeManager('opp1', 300, slots(1, 8, 8, 6));
    const opp2 = makeManager('opp2', 300, slots(1, 8, 8, 6)); // stesso c_m di opp1
    const info = ceilingForRole([me, opp1, opp2], 'me', 'P');
    expect(info.c1).toBe(info.c2);
    expect(info.holder1).not.toBeNull();
    expect(info.holder2).not.toBeNull();
  });

  it('più avversari: C¹ e C² sono il primo e secondo massimo, non i primi due per id', () => {
    const me = makeManager('me', 500, slots(3, 8, 8, 6), true);
    const low = makeManager('low', 50, slots(1, 8, 8, 6));
    const high = makeManager('high', 490, slots(1, 8, 8, 6));
    const mid = makeManager('mid', 200, slots(1, 8, 8, 6));
    const info = ceilingForRole([me, low, high, mid], 'me', 'P');
    expect(info.c1).toBe(maxSingleBid(high));
    expect(info.c2).toBe(maxSingleBid(mid));
    expect(info.holder1?.manager.id).toBe('high');
    expect(info.holder2?.manager.id).toBe('mid');
  });
});

describe('§13.5 errori di uno sui tetti', () => {
  it('offerta operativa massima = min(p*, C¹+1, c_0), non C¹', () => {
    const me = makeManager('me', 500, slots(3, 8, 8, 6), true);
    const opp = makeManager('opp', 100, slots(1, 8, 8, 6));
    const info = ceilingForRole([me, opp], 'me', 'P');
    const c1 = info.c1;
    expect(operationalMaxBid(9999, info)).toBe(c1 + 1);
  });

  it('prezzo atteso dipende dal secondo tetto C², non dal primo', () => {
    const me = makeManager('me', 500, slots(3, 8, 8, 6), true);
    const opp1 = makeManager('opp1', 400, slots(1, 8, 8, 6));
    const opp2 = makeManager('opp2', 100, slots(1, 8, 8, 6));
    const info = ceilingForRole([me, opp1, opp2], 'me', 'P');
    expect(expectedPriceFromCeiling(9999, info)).toBe(info.c2 + 1);
    expect(info.c2 + 1).not.toBe(info.c1 + 1);
  });
});
