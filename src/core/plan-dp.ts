// §6.5 — Piano ottimo: programmazione dinamica esatta. Risolve per ruolo (i pesi di slot
// decrescenti e fissi rendono ottima l'assegnazione in ordine di valore decrescente), poi
// ricombina i quattro ruoli su un'unica dimensione di budget.
//
// §13.3: i giocatori già acquistati vanno inclusi come FORZATI a prezzo 0, sul numero di slot
// TOTALE del ruolo (non residuo): altrimenti si sbaglia l'assegnazione dei pesi w_ρ,t.

import { ROLES } from './types.js';
import type { Role } from './types.js';

export interface DPCandidate {
  readonly v: number;
  /** Prezzo di acquisizione nel piano: p̂ per i candidati dal pool, 0 per i già posseduti. */
  readonly price: number;
  /** true per i giocatori già posseduti: la loro inclusione non è opzionale (§13.3). */
  readonly forced: boolean;
}

export interface RoleDPInput {
  readonly candidates: readonly DPCandidate[];
  /** v_ρ(score del 20° percentile del pool): riempi-slot sintetico, prezzo 1, illimitato. */
  readonly fillerValue: number;
  /** slot_ρ TOTALE del ruolo (non residuo), vedi §13.3. */
  readonly slotCount: number;
  /** w_ρ,1 .. w_ρ,slotCount, in ordine decrescente. */
  readonly weights: readonly number[];
}

const NEG_INF = -Infinity;

/**
 * Scarta i candidati dominati — versione SICURA per uno zaino 0/1 multi-selezione.
 *
 * Attenzione (bug reale trovato e corretto durante lo sviluppo, vedi test/plan-dp.test.ts):
 * la regola "letterale" del readme (scarta j se esiste k con v_k ≥ v_j e price_k ≤ price_j) NON
 * è valida in generale quando si scelgono PIÙ giocatori (non un solo slot): se un'ottima
 * combinazione usa SIA il dominatore k SIA il dominato j (per riempire due slot diversi), scartare
 * j a priori spezza l'esattezza della DP — k non può essere usato due volte per sostituire
 * entrambi i ruoli. Controesempio verificato: k=(prezzo 3, v 91.3), j=(prezzo 4, v 30.8); con
 * budget 8 la combinazione ottima usa ENTRAMBI (+1 filler) per un valore di 116.17, ma scartando
 * j "perché dominato da k" la DP trova solo 104.40.
 *
 * Criterio corretto e comunque efficace: j è scartabile solo se esistono ALMENO `slotCount`
 * candidati che lo dominano individualmente (compresi i forzati). In tal caso j non serve MAI:
 * anche nella peggiore delle ipotesi ci sono abbastanza alternative migliori-e-più-economiche da
 * riempire ogni singolo slot senza mai ricorrere a j.
 */
export function pruneCandidates(candidates: readonly DPCandidate[], slotCount: number): DPCandidate[] {
  const kept: DPCandidate[] = [];
  for (const c of candidates) {
    if (c.forced) {
      kept.push(c);
      continue;
    }
    let dominators = 0;
    for (const k of candidates) {
      if (k === c) continue;
      if (k.v >= c.v && k.price <= c.price && (k.v > c.v || k.price < c.price)) {
        dominators++;
        if (dominators >= slotCount) break;
      }
    }
    if (dominators < slotCount) kept.push(c);
  }
  return kept;
}

/**
 * DP di un singolo ruolo. Restituisce g_ρ[β] per β = 0..budget: valore massimo ottenibile
 * scegliendo esattamente slotCount giocatori (candidati + eventuale filler) con spesa ≤ β.
 */
export function computeRolePlan(input: RoleDPInput, budget: number): Float64Array {
  const { slotCount, weights, fillerValue } = input;
  if (weights.length !== slotCount) {
    throw new Error(`weights.length (${weights.length}) deve coincidere con slotCount (${slotCount})`);
  }

  // Più "forzati" di quanti slot esistano nel ruolo: scenario IMPOSSIBILE, non un'occasione per
  // scambiare in silenzio il forzato di valore più basso con uno nuovo (bug reale trovato durante
  // lo sviluppo, via il Report asta: valutare un candidato per un ruolo GIÀ PIENO — es. l'8° D
  // quando ne possiedo già 8/8 — risultava in un "offri fino a" positivo ogni volta che il nuovo
  // giocatore valeva più del peggiore fra quelli già posseduti in quel ruolo, come se si potesse
  // "ripescare" uno slot inesistente. Capita perché chi valuta UN candidato aggiunge un forzato
  // ipotetico ai candidati REALI già posseduti (`max-bid.ts`/`engine.ts`'s `phiForcingTargetAt`) —
  // se il ruolo è già pieno, questo porta `forcedOnly.length` a `slotCount + 1`, non a `slotCount`
  // esatto. Impossibile per definizione: si segnala con NEG_INF ovunque, cosicché il chiamante lo
  // scarti esattamente come farebbe con qualunque altra opzione non affrontabile.
  const forcedOnly = input.candidates.filter((c) => c.forced);
  if (forcedOnly.length > slotCount) {
    return new Float64Array(budget + 1).fill(NEG_INF);
  }

  // Scorciatoia: se tutti gli slot del ruolo sono già occupati da forzati (§13.3), non c'è
  // nessuna scelta da fare — g_ρ[β] è costante per ogni β. Evita di eseguire la DP completa per
  // ruoli già chiusi (frequente verso fine asta, importante per le prestazioni di auction-sim).
  if (forcedOnly.length === slotCount) {
    const sortedForced = forcedOnly.slice().sort((a, b) => b.v - a.v);
    let total = 0;
    for (let t = 0; t < slotCount; t++) total += weights[t]! * sortedForced[t]!.v;
    return new Float64Array(budget + 1).fill(total);
  }

  // Ordine per v decrescente: la DP assegna i pesi w_ρ,t in base al rango, quindi l'ordine di
  // elaborazione dei candidati DEVE essere per v decrescente (pruneCandidates filtra soltanto,
  // non garantisce l'ordine).
  const pruned = pruneCandidates(input.candidates, slotCount).sort((a, b) => b.v - a.v);
  // Punto di inserimento del filler nell'ordine per v decrescente: prima di qualunque candidato
  // (forzato o no) con v ≤ fillerValue, cosicché il filler riceva il rango corretto anche quando
  // un giocatore già posseduto (forzato) ha un valore inferiore al filler. -1 ⇒ il filler va in coda.
  const insertIdx = pruned.findIndex((c) => c.v <= fillerValue);
  const before = insertIdx === -1 ? pruned : pruned.slice(0, insertIdx);
  const after = insertIdx === -1 ? [] : pruned.slice(insertIdx);

  const width = budget + 1;
  let f = new Float64Array((slotCount + 1) * width).fill(NEG_INF);
  f[0] = 0; // f[0][0] = 0

  const idx = (t: number, b: number): number => t * width + b;

  function applyForced(v: number, price: number): void {
    const next = new Float64Array((slotCount + 1) * width).fill(NEG_INF);
    for (let t = 0; t < slotCount; t++) {
      const w = weights[t]!;
      for (let b = 0; b + price <= budget; b++) {
        const cur = f[idx(t, b)]!;
        if (cur === NEG_INF) continue;
        const candidate = cur + w * v;
        const target = idx(t + 1, b + price);
        if (candidate > next[target]!) next[target] = candidate;
      }
    }
    f = next;
  }

  function applyOptional(v: number, price: number): void {
    for (let t = slotCount - 1; t >= 0; t--) {
      const w = weights[t]!;
      for (let b = budget - price; b >= 0; b--) {
        const cur = f[idx(t, b)]!;
        if (cur === NEG_INF) continue;
        const candidate = cur + w * v;
        const target = idx(t + 1, b + price);
        if (candidate > f[target]!) f[target] = candidate;
      }
    }
  }

  function applyFillerUnbounded(): void {
    for (let t = 0; t < slotCount; t++) {
      const w = weights[t]!;
      for (let b = 1; b <= budget; b++) {
        const cur = f[idx(t, b - 1)]!;
        if (cur === NEG_INF) continue;
        const candidate = cur + w * fillerValue;
        const target = idx(t + 1, b);
        if (candidate > f[target]!) f[target] = candidate;
      }
    }
  }

  for (const c of before) {
    if (c.forced) applyForced(c.v, c.price);
    else applyOptional(c.v, c.price);
  }
  applyFillerUnbounded();
  for (const c of after) {
    if (c.forced) applyForced(c.v, c.price);
    else applyOptional(c.v, c.price);
  }

  // g_ρ[β] = inviluppo monotono crescente di f[slotCount][·]
  const g = new Float64Array(width);
  let running = NEG_INF;
  for (let b = 0; b <= budget; b++) {
    const val = f[idx(slotCount, b)]!;
    if (val > running) running = val;
    g[b] = running;
  }
  return g;
}

/** Ricombinazione dei ruoli: h_{k+1}[β] = max_{β'≤β} (h_k[β−β'] + g_ρ[β']). */
export function combineRoles(gByRole: Record<Role, Float64Array>, budget: number): Float64Array {
  const width = budget + 1;
  let h = new Float64Array(width).fill(NEG_INF);
  h[0] = 0;

  for (const role of ROLES) {
    const g = gByRole[role];
    const next = new Float64Array(width).fill(NEG_INF);
    for (let b = 0; b <= budget; b++) {
      let best = NEG_INF;
      for (let bp = 0; bp <= b; bp++) {
        const hv = h[b - bp]!;
        const gv = g[bp]!;
        if (hv === NEG_INF || gv === NEG_INF) continue;
        const val = hv + gv;
        if (val > best) best = val;
      }
      next[b] = best;
    }
    h = next;
  }
  return h;
}

/** Quanti scatti recenti mediare in `marginalValue` (sotto): più di uno smussa la sensibilità a un
 * singolo gradino idiosincratico dell'inviluppo, meno di `MARGINAL_VALUE_SMOOTHING_WINDOW` se
 * l'inviluppo non ne offre abbastanza prima di appiattirsi del tutto. */
const MARGINAL_VALUE_SMOOTHING_WINDOW = 5;

/**
 * λ = ∂Φ/∂b, media degli ultimi scatti discreti di valore trovati scendendo dal budget disponibile.
 *
 * Non basta guardare l'ultimo singolo credito (bug reale trovato e corretto durante lo sviluppo,
 * causa primaria del sotto-speso osservato in simulazione — vedi test/plan-dp.test.ts e
 * test/base-policy.test.ts). L'inviluppo `h` è per costruzione monotono non decrescente ma NON
 * strettamente crescente: appena il piano ottimo a prezzi FISSI (p̂) diventa affrontabile con il
 * budget residuo, `h` si appiattisce per ogni budget successivo, perché il modello non sa
 * rappresentare "pagare più del p̂ atteso per un candidato specifico" — semplicemente non c'è
 * altro da comprare AGLI STESSI prezzi fissi. Questo NON significa che un credito in più non
 * valga nulla: significa solo che l'ultimo scatto di valore reale è avvenuto a un budget più
 * basso. Si cerca all'indietro il gradino più recente e si usa quel tasso come stima di λ,
 * evitando lo zero artificiale che altrimenti azzererebbe ogni offerta successiva
 * (`approxMaxBid`) indipendentemente da quanto un candidato valga più del suo sostituto.
 *
 * Smussamento (§7 Session 8, ispirato al prototipo `neural_network/`): un valore appreso da una
 * rete generalizza su molte osservazioni, non legge un singolo punto storico — la stessa idea qui,
 * senza bisogno di allenare nulla. Prima si usava LETTERALMENTE solo il primo gradino trovato: un
 * singolo scatto idiosincratico (un candidato che casca esattamente su quel credito) bastava a
 * fissare λ per l'intera istantanea. Ora si mediano fino a `MARGINAL_VALUE_SMOOTHING_WINDOW`
 * scatti consecutivi trovati scendendo — un singolo gradino anomalo pesa meno, il segnale che ne
 * esce è più stabile fra chiamate ravvicinate (stesso principio, non lo stesso meccanismo, del fix
 * di stabilità di `computeDuals` in `engine.ts`: quello eliminava una sensibilità a QUALE candidato
 * è nel pool, questo riduce la sensibilità a QUALE gradino specifico dell'inviluppo si incontra per
 * primo). Con un solo gradino disponibile (il caso comune nei test esistenti) il risultato è
 * identico a prima — nessuna regressione sui casi già coperti.
 *
 * Inquadramento teorico (non necessario per usare la funzione, utile per chi la tocca): λ è quello
 * che la programmazione lineare chiama "shadow price" (prezzo ombra) o variabile duale del vincolo
 * di budget — quanto migliorerebbe l'obiettivo allentando quel vincolo di un'unità. Per problemi
 * CONTINUI questa nozione è pulita e sempre ben definita. Per uno zaino DISCRETO come questo (un
 * giocatore lo compri intero, non a frazioni), la dualità ha "buchi" noti in letteratura: il duale
 * non è sempre unico né continuo nel budget. Il plateau dell'inviluppo gestito sopra è
 * precisamente uno di questi buchi, non una stranezza di questa implementazione — la media mobile
 * all'indietro è un modo pragmatico di scegliere UN valore ragionevole dentro l'intervallo di
 * ambiguità, non "il" valore esatto che una teoria pulita garantirebbe.
 */
export function marginalValue(h: Float64Array, budget: number): number {
  const steps: number[] = [];
  for (let b = budget; b > 0 && steps.length < MARGINAL_VALUE_SMOOTHING_WINDOW; b--) {
    const a = h[b]!;
    const prev = h[b - 1]!;
    if (a === NEG_INF || prev === NEG_INF) continue;
    const diff = a - prev;
    if (diff > 1e-9) steps.push(diff);
  }
  if (steps.length === 0) return 0;
  return steps.reduce((s, v) => s + v, 0) / steps.length;
}

export interface FullPlanInput {
  readonly budget: number;
  readonly roleInputs: Record<Role, RoleDPInput>;
}

export interface FullPlanOutput {
  readonly rolePlans: Record<Role, Float64Array>;
  readonly combined: Float64Array;
  readonly phi: number;
  readonly lambda: number;
}

export function computeFullPlan(input: FullPlanInput): FullPlanOutput {
  const rolePlans = {} as Record<Role, Float64Array>;
  for (const role of ROLES) {
    rolePlans[role] = computeRolePlan(input.roleInputs[role], input.budget);
  }
  const combined = combineRoles(rolePlans, input.budget);
  const phi = combined[input.budget]!;
  const lambda = marginalValue(combined, input.budget);
  return { rolePlans, combined, phi, lambda };
}

