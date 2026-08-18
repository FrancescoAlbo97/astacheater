// §6.4 / §12 F5 — Tetto avversari (esatto). Casi limite obbligatori (§6.4, §13.5).
import { describe, expect, it } from 'vitest';
import {
  ceilingForRole,
  maxSingleBid,
  operationalMaxBid,
  expectedPriceFromCeiling,
  scarceRolesFor,
  threatsByManager,
} from '../src/core/ceiling.js';
import type { ManagerState, Player, SlotCounts } from '../src/core/types.js';

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

function makePlayer(id: string, role: Player['role']): Player {
  return { id, name: id, team: 'T', role };
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

describe('§11 Fantallenatori — threatsByManager (minaccia sui tuoi obiettivi)', () => {
  it('un avversario che può permettersi un obiettivo compare con quel giocatore', () => {
    const me = makeManager('me', 500, slots(3, 8, 8, 6), true);
    const rich = makeManager('rich', 400, slots(0, 8, 8, 6));
    const target = makePlayer('p1', 'D');
    const out = threatsByManager([me, rich], [target], () => 50, 'me');
    expect(out.get('rich')).toEqual([target]);
  });

  it('esclude sempre "me" dai risultati, anche se tecnicamente eleggibile', () => {
    const me = makeManager('me', 500, slots(3, 8, 8, 6), true);
    const target = makePlayer('p1', 'D');
    const out = threatsByManager([me], [target], () => 1, 'me');
    expect(out.has('me')).toBe(false);
  });

  it('un avversario senza slot liberi nel ruolo non è una minaccia', () => {
    const me = makeManager('me', 500, slots(3, 8, 8, 6), true);
    const noSlot = makeManager('noSlot', 400, slots(0, 0, 8, 6)); // 0 slot D
    const target = makePlayer('p1', 'D');
    const out = threatsByManager([me, noSlot], [target], () => 50, 'me');
    expect(out.has('noSlot')).toBe(false);
  });

  it('un avversario che non può coprire il prezzo atteso non è una minaccia', () => {
    const me = makeManager('me', 500, slots(3, 8, 8, 6), true);
    const poor = makeManager('poor', 10, slots(0, 8, 8, 6));
    const target = makePlayer('p1', 'D');
    const out = threatsByManager([me, poor], [target], () => 500, 'me');
    expect(out.has('poor')).toBe(false);
  });

  it('più obiettivi minacciati dallo stesso manager si accumulano nella stessa lista', () => {
    const me = makeManager('me', 500, slots(3, 8, 8, 6), true);
    const rich = makeManager('rich', 400, slots(0, 8, 8, 6));
    const t1 = makePlayer('p1', 'D');
    const t2 = makePlayer('p2', 'C');
    const out = threatsByManager([me, rich], [t1, t2], () => 50, 'me');
    expect(out.get('rich')).toEqual([t1, t2]);
  });
});

describe('§11 Fantallenatori — scarceRolesFor (pressione di ruolo)', () => {
  it('ruolo con pool sufficiente per tutti (> slot suoi + altrui) ⇒ nessuna pressione', () => {
    const me = makeManager('me', 500, slots(3, 0, 0, 0), true);
    const opp = makeManager('opp', 400, slots(3, 0, 0, 0)); // 6 slot P totali
    const pool = Array.from({ length: 7 }, (_, i) => makePlayer(`p${i}`, 'P')); // 7 > 6
    expect(scarceRolesFor([me, opp], pool, 'opp')).toEqual([]);
  });

  it('pool residuo ≤ slot suoi + altrui ⇒ ruolo segnalato con i numeri corretti', () => {
    const me = makeManager('me', 500, slots(1, 0, 0, 0), true);
    const opp = makeManager('opp', 400, slots(1, 0, 0, 0));
    const pool = [makePlayer('p1', 'P')]; // 1 solo portiere per 2 slot P totali (1 mio + 1 avversario)
    const result = scarceRolesFor([me, opp], pool, 'opp');
    expect(result).toEqual([{ role: 'P', mySlots: 1, poolRemaining: 1, othersSlots: 1 }]);
  });

  it('manager senza slot aperti in un ruolo non è mai segnalato per quel ruolo', () => {
    const me = makeManager('me', 500, slots(3, 0, 0, 0), true);
    const opp = makeManager('opp', 400, slots(0, 0, 0, 0));
    const result = scarceRolesFor([me, opp], [], 'opp');
    expect(result.some((p) => p.role === 'P')).toBe(false);
  });

  it('manager id inesistente ⇒ lista vuota', () => {
    const me = makeManager('me', 500, slots(3, 8, 8, 6), true);
    expect(scarceRolesFor([me], [], 'ghost')).toEqual([]);
  });
});
