// §9.2 / §11 — buildRandomArchetypeMix: mix di avversari simulati, mai fisso per "posto".
import { describe, expect, it } from 'vitest';
import { buildRandomArchetypeMix, EXPLOITABLE_ARCHETYPES } from '../src/sim/archetypes.js';
import { mulberry32 } from '../src/core/rng.js';

describe('§9.2/§11 buildRandomArchetypeMix', () => {
  it('ha lunghezza numManagers e il manager 0 ("me") è sempre rational', () => {
    const mix = buildRandomArchetypeMix(10, mulberry32(1));
    expect(mix).toHaveLength(10);
    expect(mix[0]).toBe('rational');
  });

  it('rationalFraction=0 ⇒ nessun avversario razionale oltre a "me"', () => {
    const mix = buildRandomArchetypeMix(10, mulberry32(2), 0);
    expect(mix.slice(1).every((a) => a !== 'rational')).toBe(true);
  });

  it('rationalFraction=1 ⇒ tutti gli avversari sono razionali', () => {
    const mix = buildRandomArchetypeMix(10, mulberry32(3), 1);
    expect(mix.every((a) => a === 'rational')).toBe(true);
  });

  it('con la quota di default, il numero di avversari razionali è quello atteso (arrotondato)', () => {
    const mix = buildRandomArchetypeMix(10, mulberry32(4)); // 9 avversari, default 0.2 ⇒ round(1.8)=2
    const rationalOpponents = mix.slice(1).filter((a) => a === 'rational').length;
    expect(rationalOpponents).toBe(2);
  });

  it('ogni avversario non razionale è uno degli archetipi sfruttabili validi', () => {
    const mix = buildRandomArchetypeMix(10, mulberry32(5), 0);
    for (const a of mix.slice(1)) {
      expect(EXPLOITABLE_ARCHETYPES).toContain(a);
    }
  });

  it('stesso seed ⇒ stesso mix (determinismo, §13.10)', () => {
    const mixA = buildRandomArchetypeMix(10, mulberry32(42));
    const mixB = buildRandomArchetypeMix(10, mulberry32(42));
    expect(mixA).toEqual(mixB);
  });

  it('seed diversi producono disposizioni diverse (non un ordine fisso per posto)', () => {
    const mixes = Array.from({ length: 8 }, (_, i) => buildRandomArchetypeMix(10, mulberry32(1000 + i)).join(','));
    const distinct = new Set(mixes);
    expect(distinct.size).toBeGreaterThan(1);
  });
});
