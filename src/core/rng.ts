// §13.10 — Mai Math.random() non seminato nel simulatore: rende impossibili i confronti
// appaiati. Un unico PRNG esplicito, passato per parametro, condiviso da tutto il progetto.

export type Rng = () => number;

/** mulberry32: PRNG a 32 bit, veloce, qualità sufficiente per Monte Carlo, deterministico. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function rng(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Campiona un intero uniforme in [0, n). */
export function randInt(rng: Rng, n: number): number {
  return Math.floor(rng() * n);
}

/** Campione gaussiano standard N(0,1) via Box-Muller, usando il rng fornito. */
export function randNormal(rng: Rng): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Permutazione uniforme (Fisher–Yates) usando il rng fornito; non muta l'array in input. */
export function shuffle<T>(arr: readonly T[], rng: Rng): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}
