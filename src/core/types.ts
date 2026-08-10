// Tipi condivisi fra motore (core), simulatore (sim) e interfaccia (ui).
// Vedi readme.md §7 (event sourcing) e §8 (schemi dati) per la fonte di verità.

export type Role = 'P' | 'D' | 'C' | 'A';

export const ROLES: readonly Role[] = ['P', 'D', 'C', 'A'];

export type Formation =
  | '4-3-3'
  | '3-4-3'
  | '3-5-2'
  | '4-4-2'
  | '4-5-1'
  | '5-3-2'
  | '5-4-1';

/** Composizione di una formazione: numero di titolari per ruolo (P è sempre 1, non incluso qui). */
export interface FormationShape {
  readonly D: number;
  readonly C: number;
  readonly A: number;
}

export interface Player {
  readonly id: string;
  readonly name: string;
  readonly team: string;
  readonly role: Role;
}

/** Un giocatore del listone con lo score (se assegnato) e l'eventuale override di titolarità. */
export interface ScoredPlayer extends Player {
  readonly score: number | null;
  readonly ptOverride: number | null;
}

export interface Manager {
  readonly id: string;
  readonly name: string;
  readonly isMe: boolean;
}

export type SlotCounts = Record<Role, number>;

export interface LeagueConfig {
  readonly managers: readonly Manager[];
  readonly budget: number;
  readonly slots: SlotCounts;
  readonly formations: readonly Formation[];
  readonly primaryFormation: Formation;
  readonly minPrice: number;
  readonly risk: number;
}

// ---------------------------------------------------------------------------
// Modello di valore (§6.1)
// ---------------------------------------------------------------------------

export interface ValueCurveParams {
  readonly fmMin: number;
  readonly fmMax: number;
  readonly gamma: number;
  readonly ptMin: number;
  readonly ptMax: number;
  readonly delta: number;
}

export type ValueCurveConfig = Record<Role, ValueCurveParams>;

/** Pesi di slot dentro un ruolo, ordine decrescente di valore (§6.2). */
export type SlotWeights = Record<Role, readonly number[]>;

// ---------------------------------------------------------------------------
// Modello di prezzo (§6.3)
// ---------------------------------------------------------------------------

export interface PriceCurveParams {
  readonly A: number; // A_ρ
  readonly theta: number; // θ_ρ
}

export type PriceCurveConfig = Record<Role, PriceCurveParams>;

export type BudgetShares = Record<Role, number>;

export interface PriceModelConfig {
  readonly priorCurves: PriceCurveConfig;
  readonly budgetShares: BudgetShares;
  readonly reserveFraction: number; // frazione di Ctot tenuta da parte in renormalize()
  readonly ridgeN0: number; // n0: peso equivalente del prior nella regressione online
  readonly huberDelta: number; // δ della perdita di Huber in scala log
  readonly halfLifeObservations: number; // emivita del decadimento esponenziale
  readonly minObservationsForOwnFit: number; // n_ρ minimo per usare la regressione del ruolo
  readonly confidenceThresholds: { readonly low: number; readonly medium: number };
}

export interface PriceEstimate {
  readonly playerId: string;
  readonly pHat: number;
  readonly nObservations: number;
  readonly thetaStdErr: number;
  readonly confidence: 'bassa' | 'media' | 'alta';
}

// ---------------------------------------------------------------------------
// Rischio (§6.8)
// ---------------------------------------------------------------------------

export interface RiskConfig {
  readonly eta: number;
  readonly gammaMultiplierPerRisk: number; // 0.4 in γ_ρ ← γ_ρ · (1 + 0.4·risk)
}

// ---------------------------------------------------------------------------
// Simulatore Monte Carlo (§6.7)
// ---------------------------------------------------------------------------

export interface RolloutConfig {
  readonly rollouts: number; // R = 2000
  readonly priceNoiseSigma: number; // σ
  readonly dualsRecalcEveryDraws: number; // ricalcolo duali ogni 20 estrazioni
  readonly dualsRecalcOnBudgetDropFraction: number; // o se il budget cala di oltre il 10%
  readonly bidGridSize: number; // 8 valori di p
}

export interface RolloutResult {
  readonly median: number;
  readonly p10: number;
  readonly p90: number;
}

// ---------------------------------------------------------------------------
// Stato manager derivato (usato da ceiling.ts, plan-dp.ts, ecc.)
// ---------------------------------------------------------------------------

export interface ManagerState {
  readonly manager: Manager;
  readonly creditsRemaining: number; // b_m
  readonly slotsRemaining: SlotCounts; // r_m[ρ]
  readonly roster: readonly RosterEntry[];
}

export interface RosterEntry {
  readonly player: Player;
  readonly price: number;
}

// ---------------------------------------------------------------------------
// Event sourcing (§7)
// ---------------------------------------------------------------------------

export type AuctionEvent =
  | { readonly t: 'league.setup'; readonly config: LeagueConfig }
  | { readonly t: 'players.load'; readonly players: readonly Player[] }
  | {
      readonly t: 'player.score';
      readonly playerId: string;
      readonly score: number;
      readonly ptOverride?: number;
    }
  | {
      readonly t: 'sale';
      readonly playerId: string;
      readonly managerId: string;
      readonly price: number;
    }
  | { readonly t: 'unsold'; readonly playerId: string }
  | {
      readonly t: 'manual.override';
      readonly playerId: string;
      readonly maxBid: number;
      readonly note?: string;
    }
  | { readonly t: 'undo' }
  | { readonly t: 'note'; readonly text: string };

export interface ManualOverride {
  readonly maxBid: number;
  readonly note: string | null;
}

export interface AuctionState {
  readonly config: LeagueConfig | null;
  readonly players: Readonly<Record<string, Player>>;
  readonly scores: Readonly<Record<string, { score: number; ptOverride: number | null }>>;
  readonly sales: readonly { playerId: string; managerId: string; price: number }[];
  readonly unsold: readonly string[];
  readonly overrides: Readonly<Record<string, ManualOverride>>;
  readonly notes: readonly string[];
  /** Log grezzo, esposto per undo/export; reduce() è comunque puro rispetto a questo. */
  readonly log: readonly AuctionEvent[];
}

// ---------------------------------------------------------------------------
// Costi opportunità / tetto avversari (§6.4)
// ---------------------------------------------------------------------------

export interface CeilingInfo {
  readonly c1: number; // C¹_j
  readonly c2: number; // C²_j
  readonly holder1: ManagerState | null;
  readonly holder2: ManagerState | null;
  readonly myMax: number; // c_0
}

// ---------------------------------------------------------------------------
// Piano DP (§6.5, §6.6)
// ---------------------------------------------------------------------------

/** g_ρ[β]: valore massimo ottenibile nel ruolo ρ spendendo esattamente/fino a β. */
export type RolePlan = Float64Array;

export interface PlanResult {
  readonly rolePlans: Record<Role, RolePlan>;
  /** h_4[β]: valore massimo della rosa completa spendendo fino a β crediti. */
  readonly combined: Float64Array;
  readonly lambda: number; // ∂Φ/∂b nel punto di budget corrente
  readonly phi: number; // Φ(b, r, P) al budget corrente
}

export interface MaxBidResult {
  readonly pStar: number;
  readonly phiLose: number;
  readonly reason: 'ok' | 'not-useful' | 'capped-by-ceiling' | 'capped-by-budget';
}
