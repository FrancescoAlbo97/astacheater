// §9.2 — Archetipi di avversario. Il vantaggio del motore viene in buona parte dallo sfruttare
// irrazionalità reali: ogni archetipo, tranne `rational`, calcola una "willingness" (disponibilità
// a spendere) come multiplo di p̂, applicato poi dal motore d'asta con troncamento a c_m e rumore
// (§6.7). `rational` è gestito a parte in auction-sim.ts: usa il motore vero e proprio.

import type { Role } from '../core/types.js';
import type { Rng } from '../core/rng.js';

export type ArchetypeId =
  | 'rational'
  | 'earlyEnthusiast'
  | 'latePanicker'
  | 'fanboy'
  | 'roleCapper'
  | 'anchored'
  | 'budgetSplitter'
  // Politiche naive di confronto per l'ablazione appaiata (§10.1). Non sono "irrazionalità da
  // sfruttare" come le precedenti: sono i benchmark contro cui il motore deve dimostrarsi
  // migliore. `fixedSplit` ha la stessa logica di `budgetSplitter`, nome distinto per allinearsi
  // alla terminologia di §10.1 nei report.
  | 'ratio'
  | 'fixedSplit'
  | 'targetChaser';

export interface ArchetypeContext {
  readonly playerId: string;
  readonly role: Role;
  readonly team: string;
  readonly drawIndex: number; // 0-based, ordine di estrazione nell'asta
  readonly totalDraws: number;
  readonly pHatCurrent: number; // stima corrente di mercato
  readonly pHatInitial: number; // prior iniziale (pre-osservazioni), per `anchored`
  readonly value: number; // v_j secondo il MIO score percepito, per `ratio`
  readonly creditsRemaining: number;
  readonly budget: number; // crediti iniziali di lega, per le quote di `budgetSplitter`/`fixedSplit`
  readonly slotsRemainingInRole: number;
  readonly slotsRemainingTotal: number;
}

/** Stato persistente per manager, assegnato una volta all'inizio dell'asta. */
export interface ArchetypeManagerState {
  readonly archetype: ArchetypeId;
  readonly earlyEnthusiastMultiplier: number; // 1.3–1.6
  readonly favoriteTeam: string;
  readonly roleCaps: Record<Role, number>;
  readonly budgetShares: Record<Role, number>;
  /** Per `targetChaser` (§10.1): i 25 giocatori della propria lista obiettivo (per id). */
  readonly targetIds: ReadonlySet<string>;
}

export function initArchetypeState(
  archetype: ArchetypeId,
  rng: Rng,
  allTeams: readonly string[],
  targetIds: ReadonlySet<string> = new Set(),
): ArchetypeManagerState {
  return {
    archetype,
    earlyEnthusiastMultiplier: 1.3 + rng() * 0.3,
    favoriteTeam: allTeams[Math.floor(rng() * allTeams.length)] ?? 'team-0',
    roleCaps: { P: 25, D: 45, C: 65, A: 100 },
    budgetShares: { P: 0.05, D: 0.15, C: 0.3, A: 0.5 },
    targetIds,
  };
}

const EARLY_ENTHUSIAST_DRAWS = 40;
const LATE_PANIC_SLOT_THRESHOLD = 5;
const LATE_PANIC_BUDGET_FRACTION = 0.5;
const FANBOY_MULTIPLIER = 1.4;
const FANBOY_PICK_PROBABILITY = 1.0; // sovrapprezza sempre i giocatori della squadra preferita

/**
 * Disponibilità a spendere (prima del troncamento a c_m e del rumore stocastico, §6.7): un
 * multiplo di p̂ salvo `anchored` (usa il prior iniziale, non aggiornato) e `budgetSplitter`
 * (usa una quota fissa di budget indipendente da p̂).
 */
export function archetypeWillingness(
  state: ArchetypeManagerState,
  ctx: ArchetypeContext,
  rng: Rng,
): number {
  switch (state.archetype) {
    case 'rational':
      // Gestito a parte da auction-sim.ts tramite il motore (max-bid + ceiling).
      throw new Error("archetypeWillingness non si applica a 'rational': usare il motore.");

    case 'earlyEnthusiast': {
      const m = ctx.drawIndex < EARLY_ENTHUSIAST_DRAWS ? state.earlyEnthusiastMultiplier : 1.0;
      return ctx.pHatCurrent * m;
    }

    case 'latePanicker': {
      const isLate =
        ctx.slotsRemainingTotal <= LATE_PANIC_SLOT_THRESHOLD &&
        ctx.creditsRemaining >= LATE_PANIC_BUDGET_FRACTION * ctx.budget;
      const m = isLate ? 2.0 + rng() * 0.5 : 0.7;
      return ctx.pHatCurrent * m;
    }

    case 'fanboy': {
      const isFavorite = ctx.team === state.favoriteTeam && rng() < FANBOY_PICK_PROBABILITY;
      return ctx.pHatCurrent * (isFavorite ? 1 + FANBOY_MULTIPLIER : 1.0);
    }

    case 'roleCapper': {
      const cap = state.roleCaps[ctx.role];
      return Math.min(ctx.pHatCurrent, cap);
    }

    case 'anchored': {
      // Usa la tabella prezzi "dell'anno scorso": il prior iniziale, mai aggiornato.
      return ctx.pHatInitial;
    }

    case 'budgetSplitter':
    case 'fixedSplit': {
      const roleBudget = state.budgetShares[ctx.role] * ctx.budget;
      // Spende fino a esaurimento quota: qui approssimato come "fino alla quota, non oltre".
      return Math.min(ctx.pHatCurrent, roleBudget);
    }

    case 'ratio': {
      // "Rilancia in ordine di v_j / p̂_j": qui, senza un ordine di estrazione scelto, si
      // approssima con "sono disposto a pagare il prezzo di mercato per chiunque abbia un buon
      // rapporto valore/prezzo", cioè p̂ stesso (paga il giusto, niente sovrapprezzo emotivo).
      const priceRatio = ctx.value / Math.max(1, ctx.pHatCurrent);
      return priceRatio >= 1 ? ctx.pHatCurrent : ctx.pHatCurrent * 0.4;
    }

    case 'targetChaser': {
      // "Rilancia fino a 1.2×p̂ sui 25 della propria lista": imita il comportamento umano più
      // comune, ed è il confronto più significativo (§10.1).
      const isTarget = state.targetIds.has(ctx.playerId);
      return isTarget ? 1.2 * ctx.pHatCurrent : ctx.pHatCurrent * 0.3;
    }
  }
}
