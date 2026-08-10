// §9.1 — Generatore di scenari. Un consenso latente più rumore per manager: troppo poco rumore
// rende la competizione irrealisticamente massima, troppo la rende finta (le liste non si
// sovrappongono). ρ governa quanto i manager sono d'accordo fra loro.

import { ROLES } from '../core/types.js';
import type { Role } from '../core/types.js';
import { randNormal, type Rng } from '../core/rng.js';

/** Dimensione del pool per ruolo (§9.1): ~540 giocatori totali, di cui 250 verranno comprati. */
export const DEFAULT_POOL_SIZES: Record<Role, number> = { P: 60, D: 180, C: 190, A: 110 };

/** s_i = 100 · (1 − (i/n)^0.65): distribuzione realistica degli score per ruolo del pool. */
export function poolScoreAtRank(rank: number, poolSize: number): number {
  return 100 * (1 - Math.pow(rank / poolSize, 0.65));
}

export interface ScenarioPlayer {
  readonly id: string;
  readonly role: Role;
  readonly team: string;
}

export interface Scenario {
  readonly players: readonly ScenarioPlayer[];
  /** Punteggio percepito da ciascun manager (indice 0..M-1) per ciascun giocatore. */
  readonly scoresByManager: readonly ReadonlyMap<string, number>[];
}

export interface GenerateScenarioOptions {
  readonly rng: Rng;
  readonly numManagers: number;
  readonly rho: number;
  readonly poolSizes?: Record<Role, number>;
  /** Rumore aggiuntivo (punti di score) sul manager 0 rispetto al "vero" valore (§9.1, test A7). */
  readonly myScoreNoiseStdDev?: number;
}

/**
 * Genera un pool sintetico e, per ciascun manager, una percezione dello score di ogni giocatore.
 * Modello: latente_m(j) = ρ·consenso_j + √(1−ρ²)·rumore_m(j), entrambi N(0,1) indipendenti;
 * lo score finale di ciascun manager per un ruolo è ottenuto RI-MAPPANDO il rango del latente
 * (decrescente) sulla stessa curva realistica s_i usata per il consenso — così la distribuzione
 * percepita da ogni singolo manager resta realistica anche dopo aver mescolato consenso e rumore
 * (la formula del fattore latente è pensata per variabili N(0,1), non per punteggi 0–100: vanno
 * ri-mappati, non semplicemente sommati e troncati).
 */
export function generateScenario(options: GenerateScenarioOptions): Scenario {
  const { rng, numManagers, rho } = options;
  const poolSizes = options.poolSizes ?? DEFAULT_POOL_SIZES;
  const myNoise = options.myScoreNoiseStdDev ?? 0;

  const players: ScenarioPlayer[] = [];
  const consensusByRole: Record<Role, number[]> = { P: [], D: [], C: [], A: [] };
  const playersByRole: Record<Role, ScenarioPlayer[]> = { P: [], D: [], C: [], A: [] };

  for (const role of ROLES) {
    const n = poolSizes[role];
    for (let i = 0; i < n; i++) {
      const player: ScenarioPlayer = { id: `${role}-${i}`, role, team: `team-${i % 20}` };
      players.push(player);
      playersByRole[role].push(player);
      consensusByRole[role].push(randNormal(rng));
    }
  }

  const scoresByManager: Map<string, number>[] = [];
  for (let m = 0; m < numManagers; m++) {
    const scores = new Map<string, number>();
    for (const role of ROLES) {
      const n = poolSizes[role];
      const consensus = consensusByRole[role]!;
      const latent = consensus.map(
        (c) => rho * c + Math.sqrt(Math.max(0, 1 - rho * rho)) * randNormal(rng),
      );
      const order = latent
        .map((v, i) => ({ v, i }))
        .sort((a, b) => b.v - a.v)
        .map((x) => x.i);
      for (let rank = 0; rank < n; rank++) {
        const playerIdx = order[rank]!;
        const player = playersByRole[role]![playerIdx]!;
        let score = poolScoreAtRank(rank, n);
        if (m === 0 && myNoise > 0) {
          score = Math.min(100, Math.max(0, score + randNormal(rng) * myNoise));
        }
        scores.set(player.id, score);
      }
    }
    scoresByManager.push(scores);
  }

  return { players, scoresByManager };
}

/**
 * Variante di generateScenario() per la "prova a secco" (§11, F12): usa il LISTONE REALE e i
 * punteggi REALI dell'utente (manager 0) invece di generare un pool sintetico. Gli avversari
 * vengono costruiti con lo stesso schema fattore-latente + rumore di generateScenario(), ma
 * applicato al RANGO dei punteggi reali dell'utente (che qui fa da "consenso") anziché a un
 * consenso sintetico indipendente: rho=1 ⇒ tutti vedono la mia stessa classifica, rho=0 ⇒ le
 * liste degli avversari sono scollegate dalla mia.
 */
export function buildRealScenario(
  players: readonly ScenarioPlayer[],
  myScores: ReadonlyMap<string, number>,
  numManagers: number,
  rho: number,
  rng: Rng,
  fallbackScore = 30,
): Scenario {
  const playersByRole: Record<Role, ScenarioPlayer[]> = { P: [], D: [], C: [], A: [] };
  for (const p of players) playersByRole[p.role].push(p);

  const myScoreOf = (id: string): number => myScores.get(id) ?? fallbackScore;

  // "Consenso" per la generazione degli avversari: rango dei MIEI punteggi reali, per ruolo (un
  // punteggio più alto ⇒ rango migliore ⇒ latente più alto), non i punteggi grezzi (la formula
  // del fattore latente è pensata per variabili ~N(0,1), non per punteggi 0–100 diretti).
  const myRankZByRole: Record<Role, Map<string, number>> = { P: new Map(), D: new Map(), C: new Map(), A: new Map() };
  for (const role of ROLES) {
    const list = playersByRole[role];
    const sorted = list.slice().sort((a, b) => myScoreOf(b.id) - myScoreOf(a.id));
    const n = sorted.length;
    for (let rank = 0; rank < n; rank++) {
      // rimappa il rango su un quantile normale approssimato (via inversione della stessa curva
      // di pool, poi su una scala z grezza ma monotona: sufficiente per pilotare il rumore).
      const percentile = n > 1 ? rank / (n - 1) : 0.5;
      myRankZByRole[role]!.set(sorted[rank]!.id, 1 - 2 * percentile); // 1 (migliore) .. -1 (peggiore)
    }
  }

  const scoresByManager: Map<string, number>[] = [];
  const mine = new Map<string, number>();
  for (const p of players) mine.set(p.id, myScoreOf(p.id));
  scoresByManager.push(mine);

  for (let m = 1; m < numManagers; m++) {
    const scores = new Map<string, number>();
    for (const role of ROLES) {
      const list = playersByRole[role];
      const n = list.length;
      const latentByPlayer = list.map((p) => {
        const z = myRankZByRole[role]!.get(p.id) ?? 0;
        return { id: p.id, latent: rho * z + Math.sqrt(Math.max(0, 1 - rho * rho)) * randNormal(rng) };
      });
      const order = latentByPlayer.slice().sort((a, b) => b.latent - a.latent);
      for (let rank = 0; rank < n; rank++) {
        scores.set(order[rank]!.id, poolScoreAtRank(rank, n));
      }
    }
    scoresByManager.push(scores);
  }

  return { players, scoresByManager };
}
