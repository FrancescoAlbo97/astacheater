// §6.2 — Verità di riferimento: il valore di una rosa NON è la somma dei valori dei suoi
// giocatori. Solo 11 scendono in campo ogni giornata; chi non gioca va sostituito dalla
// panchina, che a sua volta può non giocare. Questa funzione è corretta ma non decomponibile:
// non è usabile dentro la DP (§6.5). Per quello serve il surrogato additivo (value-surrogate.ts).

import { FORMATION_SHAPES, NO_VOTE_PENALTY, SEASON_MATCHDAYS } from './config.js';
import { ROLES } from './types.js';
import type { Formation, FormationShape, Role } from './types.js';
import type { Rng } from './rng.js';

export interface LineupPlayer {
  readonly role: Role;
  /** fm_ρ(s): fantamedia attesa quando il giocatore gioca. */
  readonly fm: number;
  /** pt_ρ(s) (o ptOverride): probabilità di essere disponibile/titolare in una giornata. */
  readonly pt: number;
}

export interface LineupSimResult {
  /** Punti attesi stagionali (38 giornate). */
  readonly mean: number;
  /** Deviazione standard stagionale stimata (§6.8: serve al termine di rischio). */
  readonly sd: number;
}

function slotPoints(sortedFmDesc: readonly number[], slots: number, penalty: number): number {
  let total = 0;
  for (let i = 0; i < slots; i++) {
    total += i < sortedFmDesc.length ? sortedFmDesc[i]! : penalty;
  }
  return total;
}

function bestFormationPoints(
  availableByRole: Record<Role, readonly number[]>,
  allowedFormations: readonly Formation[],
  shapes: Record<Formation, FormationShape>,
  penalty: number,
): number {
  const pPoints = slotPoints(availableByRole.P, 1, penalty);
  let best = -Infinity;
  for (const formation of allowedFormations) {
    const shape = shapes[formation];
    const points =
      pPoints +
      slotPoints(availableByRole.D, shape.D, penalty) +
      slotPoints(availableByRole.C, shape.C, penalty) +
      slotPoints(availableByRole.A, shape.A, penalty);
    if (points > best) best = points;
  }
  return best;
}

/**
 * valoreRosa(rosa, moduliAmmessi, N): simula N giornate indipendenti (Bernoulli(pt_j) per
 * ogni giocatore), sceglie ad ogni giornata la formazione legale migliore fra quelle ammesse,
 * applica la penalità "senza voto" quando un ruolo non ha abbastanza disponibili, e restituisce
 * la proiezione stagionale (media e deviazione standard).
 *
 * La deviazione standard stagionale assume giornate i.i.d.: Var(stagione) = 38 · Var(giornata),
 * quindi SD scala con √38 (non con 38, che scalerebbe la varianza anziché la SD).
 */
export function lineupSim(
  roster: readonly LineupPlayer[],
  allowedFormations: readonly Formation[],
  rng: Rng = Math.random,
  iterations = 2000,
  noVotePenalty: number = NO_VOTE_PENALTY,
): LineupSimResult {
  const byRole: Record<Role, LineupPlayer[]> = { P: [], D: [], C: [], A: [] };
  for (const p of roster) byRole[p.role].push(p);

  let sum = 0;
  let sumSq = 0;
  const scratch: Record<Role, number[]> = { P: [], D: [], C: [], A: [] };

  for (let iter = 0; iter < iterations; iter++) {
    for (const role of ROLES) {
      const avail = scratch[role];
      avail.length = 0;
      for (const p of byRole[role]) {
        if (rng() < p.pt) avail.push(p.fm);
      }
      avail.sort((a, b) => b - a);
    }
    const dayPoints = bestFormationPoints(scratch, allowedFormations, FORMATION_SHAPES, noVotePenalty);
    sum += dayPoints;
    sumSq += dayPoints * dayPoints;
  }

  const meanPerMatchday = sum / iterations;
  const varPerMatchday = Math.max(0, sumSq / iterations - meanPerMatchday * meanPerMatchday);
  const sdPerMatchday = Math.sqrt(varPerMatchday);

  return {
    mean: SEASON_MATCHDAYS * meanPerMatchday,
    sd: Math.sqrt(SEASON_MATCHDAYS) * sdPerMatchday,
  };
}
