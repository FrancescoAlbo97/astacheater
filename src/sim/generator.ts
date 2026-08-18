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

/** Jitter di default per gli avversari simulati della prova a secco (§11): ±10 punti di score
 * (su una scala 0–100), scelto insieme all'utente come compromesso fra "abbastanza divergente da
 * dare a ciascun avversario obiettivi propri" e "non così tanto da rendere gli score reali
 * irriconoscibili. Regolabile: vedi `buildRealScenario`. */
export const DEFAULT_OPPONENT_SCORE_JITTER = 0.1;

/**
 * Variante di generateScenario() per la "prova a secco" (§11, F12): usa il LISTONE REALE e i
 * punteggi REALI dell'utente (manager 0) invece di generare un pool sintetico. Gli avversari
 * partono DAI TUOI STESSI punteggi e li perturbano con un jitter additivo casuale, indipendente
 * per ogni coppia (giocatore, avversario): `jitterFraction=0` ⇒ condividono esattamente la tua
 * classifica; più alto ⇒ obiettivi via via più divergenti dai tuoi (§13, scelta esplicita
 * dell'utente — preferita a un fattore di correlazione latente per ruolo perché più diretta da
 * capire e da tarare: "parti dai miei valori, poi cambiali di un tot" invece di un coefficiente
 * di correlazione astratto). Non è un modello di consenso latente come `generateScenario()`: qui
 * non c'è un "vero" score oggettivo verso cui gli avversari convergono, solo la TUA opinione più
 * rumore proprio di ciascuno — coerente con l'idea di "ognuno ha i suoi obiettivi".
 */
export function buildRealScenario(
  players: readonly ScenarioPlayer[],
  myScores: ReadonlyMap<string, number>,
  numManagers: number,
  jitterFraction: number,
  rng: Rng,
  fallbackScore = 30,
): Scenario {
  const myScoreOf = (id: string): number => myScores.get(id) ?? fallbackScore;

  const scoresByManager: Map<string, number>[] = [];
  const mine = new Map<string, number>();
  for (const p of players) mine.set(p.id, myScoreOf(p.id));
  scoresByManager.push(mine);

  for (let m = 1; m < numManagers; m++) {
    const scores = new Map<string, number>();
    for (const p of players) {
      const jitter = (rng() * 2 - 1) * jitterFraction * 100;
      scores.set(p.id, Math.min(100, Math.max(0, myScoreOf(p.id) + jitter)));
    }
    scoresByManager.push(scores);
  }

  return { players, scoresByManager };
}
