// §6.2 — Surrogato additivo: approssimazione decomponibile del valore di rosa, usata dalla DP
// (§6.5). Contiene sia la funzione di valutazione a runtime (veloce, usata ad ogni passo della
// DP) sia la procedura di fitting dei pesi contro lineup-sim (calibrazione offline, fase F4).
//
// Punto cruciale, non ovvio (verificato empiricamente contro lineup-sim, vedi test):
// il ranking dentro un ruolo usa v_j = 38·pt_j·fm_j (il valore §6.1, che include la titolarità),
// ma il termine sommato nel modello pesato usa 38·fm_j (SENZA pt). Motivo: in un ruolo con più
// slot posseduti che titolari richiesti dalla formazione, chi finisce in campo un certo giorno
// dipende da CHI, fra i posseduti, è disponibile quel giorno — è una scelta "il migliore fra i
// disponibili", non "il giocatore j specifico se disponibile". Questo crea un effetto di
// ridondanza (OR logico fra riserve) che il peso w_ρ,t deve assorbire: w_ρ,t converge, tramite il
// fit, verso "quanto spesso lo slot t-esimo (per rango di v) risulta coperto da qualcuno di quel
// livello", che è sistematicamente più alto della probabilità pt del singolo giocatore che occupa
// quel rango. Usare v_j (già scontato da pt) come termine sommato sconterebbe la titolarità DUE
// VOLTE (una nel ranking/nel peso, una nel termine), producendo una sottostima sistematica di
// Φ_rosa e un R² fortemente negativo contro lineup-sim (verificato: R² < -20 con la formulazione
// naive, R² ≈ 0.97 con questa). Vedi test/value-surrogate.test.ts.

import { ROLES } from './types.js';
import type { Role, SlotCounts, SlotWeights } from './types.js';

// ---------------------------------------------------------------------------
// Valutazione a runtime
// ---------------------------------------------------------------------------

export interface SurrogatePlayerInput {
  /** v_j (§6.1): usato SOLO per stabilire il rango dentro il ruolo (chi è il t-esimo migliore). */
  readonly rankValue: number;
  /** 38·fm_j: rendimento atteso stagionale SE il giocatore scende in campo. È il termine sommato. */
  readonly potential: number;
}

/**
 * Φ_rosa ≈ Σ_ρ Σ_t  w_ρ,t · potential_(t-esimo giocatore del ruolo ρ ordinato per rankValue
 * decrescente). Giocatori oltre `weights[ρ].length` non contribuiscono (in una rosa completa
 * non ce ne sono).
 */
export function surrogateRosterValue(
  playersByRole: Readonly<Record<Role, readonly SurrogatePlayerInput[]>>,
  weights: SlotWeights,
): number {
  let total = 0;
  for (const role of ROLES) {
    const sorted = playersByRole[role].slice().sort((a, b) => b.rankValue - a.rankValue);
    const w = weights[role];
    const n = Math.min(sorted.length, w.length);
    for (let t = 0; t < n; t++) {
      total += w[t]! * sorted[t]!.potential;
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// Fitting dei pesi (fase F4, §6.2): minimi quadrati vincolati contro lineup-sim.
//
// Vincoli: pesi monotoni non crescenti dentro ogni ruolo, non negativi, somma totale = 11.
// Procedura in due passi (non è un vero solver QP generico, ma è esatta per il vincolo di
// uguaglianza e ottima per il progetto rispetto al costo di uno):
//   1. minimi quadrati con vincolo di uguaglianza Σw = 11 (sistema KKT, soluzione esatta);
//   2. proiezione isotona per ruolo (PAVA) per imporre la monotonia, poi riscalatura per
//      ripristinare esattamente la somma a 11.
// ---------------------------------------------------------------------------

export interface FitSample {
  readonly playersByRole: Readonly<Record<Role, readonly SurrogatePlayerInput[]>>;
  readonly trueValue: number;
}

export interface FitResult {
  readonly weights: SlotWeights;
  readonly r2: number;
}

function solveLinearSystem(A: Float64Array, b: Float64Array, n: number): Float64Array {
  // Gauss-Jordan con pivoting parziale. A è n×n in row-major, b ha lunghezza n. Muta entrambi.
  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let pivotVal = Math.abs(A[col * n + col]!);
    for (let row = col + 1; row < n; row++) {
      const v = Math.abs(A[row * n + col]!);
      if (v > pivotVal) {
        pivotVal = v;
        pivotRow = row;
      }
    }
    if (pivotRow !== col) {
      for (let k = 0; k < n; k++) {
        const tmp = A[col * n + k]!;
        A[col * n + k] = A[pivotRow * n + k]!;
        A[pivotRow * n + k] = tmp;
      }
      const tmpB = b[col]!;
      b[col] = b[pivotRow]!;
      b[pivotRow] = tmpB;
    }
    const pivot = A[col * n + col]!;
    if (Math.abs(pivot) < 1e-12) continue; // matrice quasi singolare: salta (residuo gestito a valle)
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = A[row * n + col]! / pivot;
      if (factor === 0) continue;
      for (let k = col; k < n; k++) {
        A[row * n + k] = A[row * n + k]! - factor * A[col * n + k]!;
      }
      b[row] = b[row]! - factor * b[col]!;
    }
  }
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const pivot = A[i * n + i]!;
    x[i] = Math.abs(pivot) < 1e-12 ? 0 : b[i]! / pivot;
  }
  return x;
}

/** Isotonic regression (PAVA), minimi quadrati, vincolo non-decrescente. */
function isotonicNonDecreasing(y: readonly number[]): number[] {
  const stack: { value: number; weight: number }[] = [];
  for (const yi of y) {
    let value = yi;
    let weight = 1;
    while (stack.length > 0 && stack[stack.length - 1]!.value > value) {
      const top = stack.pop()!;
      value = (top.value * top.weight + value * weight) / (top.weight + weight);
      weight += top.weight;
    }
    stack.push({ value, weight });
  }
  const result: number[] = [];
  for (const block of stack) {
    for (let k = 0; k < block.weight; k++) result.push(block.value);
  }
  return result;
}

function isotonicNonIncreasingNonNegative(y: readonly number[]): number[] {
  const reversed = y.slice().reverse();
  const fitted = isotonicNonDecreasing(reversed).reverse();
  return fitted.map((v) => Math.max(0, v));
}

export function fitSlotWeights(samples: readonly FitSample[], slots: SlotCounts): FitResult {
  const roleOffsets: Record<Role, number> = { P: 0, D: 0, C: 0, A: 0 };
  let dim = 0;
  for (const role of ROLES) {
    roleOffsets[role] = dim;
    dim += slots[role];
  }

  const XtX = new Float64Array(dim * dim);
  const Xty = new Float64Array(dim);

  for (const sample of samples) {
    const row = new Float64Array(dim);
    for (const role of ROLES) {
      const sorted = sample.playersByRole[role].slice().sort((a, b) => b.rankValue - a.rankValue);
      const offset = roleOffsets[role];
      const n = Math.min(sorted.length, slots[role]);
      for (let t = 0; t < n; t++) {
        row[offset + t] = sorted[t]!.potential;
      }
    }

    for (let i = 0; i < dim; i++) {
      const ri = row[i]!;
      if (ri === 0) continue;
      Xty[i] = Xty[i]! + ri * sample.trueValue;
      for (let j = 0; j < dim; j++) {
        const rj = row[j]!;
        if (rj === 0) continue;
        XtX[i * dim + j] = XtX[i * dim + j]! + ri * rj;
      }
    }
  }

  // Sistema KKT per minimi quadrati con vincolo di uguaglianza Σw = 11:
  // [ XtX  1 ] [w ]   [ Xty ]
  // [ 1^T  0 ] [mu] = [ 11  ]
  const kktN = dim + 1;
  const A = new Float64Array(kktN * kktN);
  const b = new Float64Array(kktN);
  for (let i = 0; i < dim; i++) {
    for (let j = 0; j < dim; j++) {
      A[i * kktN + j] = XtX[i * dim + j]!;
    }
    A[i * kktN + dim] = 1;
    A[dim * kktN + i] = 1;
    b[i] = Xty[i]!;
  }
  b[dim] = 11;

  const solution = solveLinearSystem(A, b, kktN);

  const weights = {} as Record<Role, number[]>;
  for (const role of ROLES) {
    const offset = roleOffsets[role];
    const raw: number[] = [];
    for (let t = 0; t < slots[role]; t++) raw.push(solution[offset + t]!);
    weights[role] = isotonicNonIncreasingNonNegative(raw);
  }

  const sumBeforeRescale = ROLES.reduce((s, r) => s + weights[r].reduce((a, c) => a + c, 0), 0);
  const scale = sumBeforeRescale > 1e-9 ? 11 / sumBeforeRescale : 1;
  for (const role of ROLES) {
    weights[role] = weights[role].map((w) => w * scale);
  }

  const finalWeights = weights as SlotWeights;
  const r2 = computeR2(samples, finalWeights);

  return { weights: finalWeights, r2 };
}

export function computeR2(samples: readonly FitSample[], weights: SlotWeights): number {
  const yMean = samples.reduce((s, x) => s + x.trueValue, 0) / samples.length;
  let ssRes = 0;
  let ssTot = 0;
  for (const sample of samples) {
    const predicted = surrogateRosterValue(sample.playersByRole, weights);
    ssRes += (sample.trueValue - predicted) ** 2;
    ssTot += (sample.trueValue - yMean) ** 2;
  }
  return ssTot > 1e-9 ? 1 - ssRes / ssTot : 1;
}
