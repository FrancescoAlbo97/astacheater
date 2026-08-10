// §10.2 — Benchmark oracolo. A fine simulazione tutti i prezzi realizzati sono noti: si risolve
// il problema OFFLINE con la stessa DP di §6.5 usando i prezzi realizzati, ottenendo la miglior
// rosa che era comprabile con 500 crediti a quei prezzi. È il tetto teorico contro cui si misura
// la quota di gap colmata (§10.2, metrica principale del progetto).

import { ROLES } from '../core/types.js';
import type { Role, SlotCounts, SlotWeights, ValueCurveConfig } from '../core/types.js';
import { playerValue } from '../core/value-model.js';
import { computeFullPlan, type DPCandidate, type RoleDPInput } from '../core/plan-dp.js';
import type { SaleRecord } from './auction-sim.js';

export interface OracleInput {
  readonly sales: readonly SaleRecord[];
  /** Score "di mercato" (stesso usato per il prior, §9.3) di ogni giocatore venduto, per id. */
  readonly scoresById: ReadonlyMap<string, number>;
  readonly leagueSlots: SlotCounts;
  readonly budget: number;
  readonly slotWeights: SlotWeights;
  readonly valueCurves?: ValueCurveConfig;
}

/**
 * Φ ottimo raggiungibile con `budget` crediti, sapendo ex post tutti i prezzi realizzati
 * dell'intera lega (non solo i propri acquisti): è il tetto teorico, non un piano eseguibile
 * (nella realtà i prezzi non si conoscono in anticipo e altri manager competono per gli stessi
 * giocatori) — serve solo come termine di paragone per §10.2.
 */
export function computeOracleValue(input: OracleInput): number {
  const roleInputs = {} as Record<Role, RoleDPInput>;
  for (const role of ROLES) {
    const roleSales = input.sales.filter((s) => s.role === role);
    const candidates: DPCandidate[] = roleSales.map((s) => ({
      v: playerValue(role, input.scoresById.get(s.playerId) ?? 50, { curves: input.valueCurves }),
      price: s.price,
      forced: false,
    }));
    const scoresSorted = roleSales
      .map((s) => input.scoresById.get(s.playerId) ?? 50)
      .sort((a, b) => a - b);
    const p20 = scoresSorted[Math.floor(0.2 * scoresSorted.length)] ?? 20;
    roleInputs[role] = {
      candidates,
      fillerValue: playerValue(role, p20, { curves: input.valueCurves }),
      slotCount: input.leagueSlots[role],
      weights: input.slotWeights[role],
    };
  }
  return computeFullPlan({ budget: input.budget, roleInputs }).phi;
}
