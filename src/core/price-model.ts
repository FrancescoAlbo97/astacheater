// §6.3 — Modello di prezzo: prior parametrico (§6.3.1), ancoraggio esatto (§6.3.2), aggiornamento
// online (§6.3.3, fase F8) e cappatura per domanda residua (§6.3.4, fase F8).

import { ROLES } from './types.js';
import type { CeilingInfo, ManagerState, PriceCurveConfig, PriceModelConfig, Role } from './types.js';
import { totalSlotsRemaining } from './ceiling.js';

// ---------------------------------------------------------------------------
// §6.3.1 — Prior
// ---------------------------------------------------------------------------

/** B_j = A_ρ · exp( θ_ρ · s_j / 100 ). */
export function priorPrice(role: Role, score: number, curves: PriceCurveConfig): number {
  const { A, theta } = curves[role];
  return A * Math.exp((theta * score) / 100);
}

// ---------------------------------------------------------------------------
// §6.3.2 — Ancoraggio esatto (vale anche a zero osservazioni)
// ---------------------------------------------------------------------------

export interface PoolPlayer {
  readonly id: string;
  readonly role: Role;
  readonly score: number;
}

export interface RenormalizeResult {
  /** p̂_j per ogni giocatore ancora nel pool. */
  readonly pHat: ReadonlyMap<string, number>;
  readonly reserve: number;
  readonly ctot: number;
  /** |Σ_{buySet} p̂ − (Ctot − riserva)|: deve restare ≤ 0.02·Ctot (asserzione §6.3.2 punto 7). */
  readonly residual: number;
}

/**
 * Procedura renormalize() di §6.3.2, da rieseguire dopo ogni acquisto registrato.
 *
 * Il "ripeti 3–5 tre volte" del readme è un water-filling: ad ogni round, i giocatori il cui
 * prezzo proporzionale scenderebbe sotto 1 vengono fissati a 1 (floor) e ESCLUSI dal calcolo del
 * fattore nel round successivo, cosicché la massa persa per il floor venga riassorbita dai
 * giocatori non ancora fissati (altrimenti la somma finale resterebbe sistematicamente sotto il
 * target, violando l'asserzione del punto 7).
 */
export function renormalize(
  pool: readonly PoolPlayer[],
  managers: readonly ManagerState[],
  priceCurves: PriceCurveConfig,
  reserveFraction: number,
  rounds = 3,
): RenormalizeResult {
  const ctot = managers.reduce((s, m) => s + m.creditsRemaining, 0);
  const reserve = reserveFraction * ctot;
  const target = ctot - reserve;

  const dByRole: Record<Role, number> = { P: 0, D: 0, C: 0, A: 0 };
  for (const m of managers) {
    for (const role of ROLES) dByRole[role] += m.slotsRemaining[role];
  }

  const rawB = new Map<string, number>();
  for (const p of pool) rawB.set(p.id, priorPrice(p.role, p.score, priceCurves));

  const buySetByRole: Record<Role, PoolPlayer[]> = { P: [], D: [], C: [], A: [] };
  for (const role of ROLES) {
    const candidates = pool
      .filter((p) => p.role === role)
      .slice()
      .sort((a, b) => rawB.get(b.id)! - rawB.get(a.id)!);
    buySetByRole[role] = candidates.slice(0, dByRole[role]);
  }
  const buySet = ROLES.flatMap((role) => buySetByRole[role]);
  const buySetIds = new Set(buySet.map((p) => p.id));

  const pHat = new Map<string, number>();
  for (const p of pool) if (!buySetIds.has(p.id)) pHat.set(p.id, 1);

  const fixed = new Set<string>();
  for (let round = 0; round < rounds; round++) {
    const free = buySet.filter((p) => !fixed.has(p.id));
    const remainingMass = free.reduce((s, p) => s + rawB.get(p.id)!, 0);
    const remainingTarget = target - fixed.size * 1;
    const factor = remainingMass > 1e-9 ? remainingTarget / remainingMass : 0;

    for (const p of free) {
      const raw = rawB.get(p.id)! * factor;
      const value = Math.max(1, Math.round(raw));
      pHat.set(p.id, value);
      if (value <= 1) fixed.add(p.id);
    }
  }
  // qualunque residuo non ancora fissato (non dovrebbe accadere dopo `rounds` round) resta al
  // suo ultimo valore calcolato; assicura comunque che tutti i membri del buySet abbiano un p̂.
  for (const p of buySet) if (!pHat.has(p.id)) pHat.set(p.id, 1);

  const buySetSum = buySet.reduce((s, p) => s + pHat.get(p.id)!, 0);
  const residual = Math.abs(buySetSum - target);

  return { pHat, reserve, ctot, residual };
}

/**
 * Calcola il moltiplicatore di scarsità dinamica per ruolo:
 * Se la domanda di titolari aperti nei manager con budget supera l'offerta di top player rimasti nel pool,
 * il prezzo atteso dei giocatori di fascia alta/titolari sale (fino a +35%).
 * Per i giocatori di fascia bassa o quando l'offerta è abbondante, resta neutro (1.0).
 */
export function computeRoleScarcityMultiplier(
  role: Role,
  score: number,
  managers: readonly ManagerState[],
  pool: readonly PoolPlayer[],
  slotsConfig?: Record<Role, number>,
): number {
  if (score < 60) return 1.0;

  const defaultSlots: Record<Role, number> = { P: 3, D: 8, C: 8, A: 6 };
  const slots = slotsConfig ?? defaultSlots;
  const starterSlotsPerManager: Record<Role, number> = {
    P: 1,
    D: Math.min(4, slots.D),
    C: Math.min(4, slots.C),
    A: Math.min(3, slots.A),
  };

  let openStarterDemand = 0;
  for (const m of managers) {
    const totalRoleSlots = slots[role] ?? 1;
    const remainingRoleSlots = m.slotsRemaining[role] ?? 0;
    const filledInRole = totalRoleSlots - remainingRoleSlots;
    const neededStarter = starterSlotsPerManager[role]!;
    if (filledInRole < neededStarter && m.creditsRemaining >= remainingRoleSlots * 2) {
      openStarterDemand += (neededStarter - filledInRole);
    }
  }

  const topAvailableInPool = pool.filter((p) => p.role === role && p.score >= 65).length;
  if (openStarterDemand <= 0 || topAvailableInPool <= 0) return 1.0;

  const ratio = openStarterDemand / Math.max(1, topAvailableInPool);
  const qualityWeight = Math.min(1, Math.max(0, (score - 60) / 40));
  const scarcityEffect = Math.max(-0.15, Math.min(0.35, (ratio - 1) * 0.25));
  return 1 + scarcityEffect * qualityWeight;
}

/** κ = Σ_venduti prezzo / Σ_venduti B_prior — fattore di inflazione globale (§6.3.3). */
export function inflationFactor(
  sales: readonly { role: Role; score: number; price: number }[],
  priceCurves: PriceCurveConfig,
): number {
  if (sales.length === 0) return 1;
  let sumPrice = 0;
  let sumPrior = 0;
  for (const s of sales) {
    sumPrice += s.price;
    sumPrior += priorPrice(s.role, s.score, priceCurves);
  }
  return sumPrior > 1e-9 ? sumPrice / sumPrior : 1;
}

// ---------------------------------------------------------------------------
// §6.3.3 — Aggiornamento online
// ---------------------------------------------------------------------------

export interface SaleObservation {
  readonly role: Role;
  readonly score: number;
  readonly price: number;
  /** Indice progressivo di vendita nell'asta corrente (0 = prima registrata): usato per il
   * decadimento esponenziale per recency (l'inflazione può derivare durante l'asta). */
  readonly order: number;
}

export interface FittedPriceCurve {
  readonly A: number;
  readonly theta: number;
  readonly n: number;
  readonly thetaStdErr: number;
  readonly confidence: 'bassa' | 'media' | 'alta';
}

function confidenceLabel(
  n: number,
  thresholds: { low: number; medium: number },
): 'bassa' | 'media' | 'alta' {
  if (n < thresholds.low) return 'bassa';
  if (n < thresholds.medium) return 'media';
  return 'alta';
}

interface WeightedFit {
  readonly a: number; // log A
  readonly b: number; // theta
  readonly sigma2: number;
  readonly sxx: number;
  readonly meanX: number;
  readonly meanY: number;
  readonly sumW: number;
}

function weightedOLS(xs: readonly number[], ys: readonly number[], weights: readonly number[]): WeightedFit {
  const sumW = weights.reduce((s, w) => s + w, 0);
  if (sumW < 1e-9) return { a: ys[0] ?? 0, b: 0, sigma2: 0, sxx: 0, meanX: 0, meanY: ys[0] ?? 0, sumW: 0 };
  const meanX = xs.reduce((s, x, i) => s + weights[i]! * x, 0) / sumW;
  const meanY = ys.reduce((s, y, i) => s + weights[i]! * y, 0) / sumW;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i]! - meanX;
    sxx += weights[i]! * dx * dx;
    sxy += weights[i]! * dx * (ys[i]! - meanY);
  }
  const b = sxx > 1e-9 ? sxy / sxx : 0;
  const a = meanY - b * meanX;
  let sse = 0;
  for (let i = 0; i < xs.length; i++) {
    const resid = ys[i]! - (a + b * xs[i]!);
    sse += weights[i]! * resid * resid;
  }
  const sigma2 = sse / Math.max(1, sumW - 2);
  return { a, b, sigma2, sxx, meanX, meanY, sumW };
}

/**
 * Regressione robusta e pesata di log(prezzo) su score, per ruolo (§6.3.3).
 *
 * - decadimento esponenziale per recency, emivita `halfLifeObservations`;
 * - perdita di Huber (IRLS) con soglia `huberDelta` in scala log: un singolo sovrapprezzo folle
 *   non deve ruotare la curva (§13.4, causa di fallimento più comune per questo stimatore);
 * - prior come ridge: peso dei dati n/(n+n0), il resto va al prior (log A_ρ, θ_ρ) iniziale;
 * - ruoli con n_ρ < minObservationsForOwnFit usano il prior globale riscalato dall'inflazione κ
 *   osservata su TUTTE le vendite (non la propria regressione, troppo pochi dati per stimarla).
 */
export function fitOnlinePriceCurves(
  observations: readonly SaleObservation[],
  priorCurves: PriceCurveConfig,
  config: PriceModelConfig,
): Record<Role, FittedPriceCurve> {
  const kappa = inflationFactor(
    observations.map((o) => ({ role: o.role, score: o.score, price: o.price })),
    priorCurves,
  );
  const maxOrder = observations.reduce((m, o) => Math.max(m, o.order), 0);

  const result = {} as Record<Role, FittedPriceCurve>;
  for (const role of ROLES) {
    const obs = observations.filter((o) => o.role === role);
    const prior = priorCurves[role];

    if (obs.length < config.minObservationsForOwnFit) {
      result[role] = {
        A: prior.A * kappa,
        theta: prior.theta,
        n: obs.length,
        thetaStdErr: Infinity,
        confidence: 'bassa',
      };
      continue;
    }

    const xs = obs.map((o) => o.score / 100);
    const ys = obs.map((o) => Math.log(Math.max(1, o.price)));
    const recencyWeights = obs.map((o) => Math.pow(0.5, (maxOrder - o.order) / config.halfLifeObservations));

    let huberWeights = obs.map(() => 1);
    let fit: WeightedFit = {
      a: Math.log(prior.A),
      b: prior.theta,
      sigma2: 0,
      sxx: 0,
      meanX: 0,
      meanY: Math.log(prior.A),
      sumW: 0,
    };
    for (let iter = 0; iter < 5; iter++) {
      const combined = recencyWeights.map((w, i) => w * huberWeights[i]!);
      fit = weightedOLS(xs, ys, combined);
      huberWeights = ys.map((y, i) => {
        const resid = y - (fit.a + fit.b * xs[i]!);
        const absResid = Math.abs(resid);
        return absResid <= config.huberDelta ? 1 : config.huberDelta / absResid;
      });
    }

    // §6.3.1 definisce θ_ρ come rapporto p_top/p_marg (sempre ≥ 1): un prezzo che DIMINUISCE con
    // lo score non ha senso in questo modello per costruzione. Su un campione piccolo e/o con uno
    // score range stretto (es. sei portieri tutti fra 86 e 95 punti) la pendenza grezza può uscire
    // negativa per puro rumore — e siccome pendenza e intercetta sono correlate quando lo score
    // range è stretto, l'intercetta compensa esplodendo verso l'alto per far tornare i punti
    // osservati, restando poi enorme quando extrapolata a score più bassi (bug reale trovato su
    // un'asta vera: 6 portieri fra score 86-95 con prezzi rumorosi 10-40 producevano un prezzo
    // PREVISTO di 313 per score 95 e ancora 106 per score 50 — l'esatto opposto del prior, che
    // resta comunque a malapena scalfito dal ridge perché l'intercetta estrema domina la media
    // pesata). Si riporta la pendenza a 0 (nessuna relazione affidabile score→prezzo in questo
    // campione, non "il prezzo scende con lo score") e si ricalcola l'intercetta in modo coerente
    // come media pesata di log(prezzo) — non semplicemente troncando la pendenza tenendo la vecchia
    // intercetta, che lascerebbe l'estrapolazione comunque distorta.
    if (fit.b < 0) {
      fit = { ...fit, a: fit.meanY, b: 0 };
    }

    // Il peso dei dati non può dipendere solo da n: n osservazioni tutte concentrate in una fascia
    // di punteggio stretta identificano la pendenza molto peggio delle stesse n osservazioni
    // sparse su tutto il range — eppure ottenevano lo stesso identico dataWeight (bug reale,
    // trovato proseguendo l'indagine sul caso Meret: durante un'unica asta simulata, con n=45
    // osservazioni ma raggruppate in una fascia stretta in un certo momento dell'asta, A_ρ
    // oscillava di oltre 10× e θ_ρ crollava a un quarto — instabile, ma non abbastanza da far
    // scattare il guardrail esistente sulla pendenza negativa qualche riga sopra, che intercetta
    // solo il caso estremo, non questa via di mezzo).
    //
    // `fit.sxx` (già calcolato da weightedOLS) è la somma pesata degli scarti al quadrato di
    // x = score/100 dalla loro media: è la STESSA quantità che compare al denominatore della
    // varianza della pendenza (Var(b) = σ²/sxx), quindi misura direttamente quanta informazione
    // sulla pendenza il campione porta davvero — non solo quante righe ha. Un campione ben speso su
    // tutto il range possibile di score/100 ([0,1]) con peso totale `sumW` avrebbe, per una
    // distribuzione uniforme, sxx ≈ sumW/12 (varianza di Uniforme[0,1]): si usa questo come
    // riferimento di "quanto sarebbe disperso un campione ben distribuito di quel peso totale", e
    // si scala la numerosità effettiva usata nel ridge dal rapporto fra la dispersione osservata e
    // quella di riferimento — mai oltre n (un campione compatto ma fortunatamente più disperso del
    // solito non deve valere più della sua numerosità reale).
    const n = obs.length;
    const referenceSxx = fit.sumW / 12;
    const spreadRatio = referenceSxx > 1e-9 ? Math.min(1, fit.sxx / referenceSxx) : 0;
    const effectiveN = n * spreadRatio;
    const dataWeight = effectiveN / (effectiveN + config.ridgeN0);
    const priorWeight = 1 - dataWeight;
    const theta = dataWeight * fit.b + priorWeight * prior.theta;
    const logA = dataWeight * fit.a + priorWeight * Math.log(prior.A);
    const thetaStdErr = fit.sxx > 1e-9 ? Math.sqrt(fit.sigma2 / fit.sxx) : Infinity;

    result[role] = {
      A: Math.exp(logA),
      theta,
      n,
      thetaStdErr,
      confidence: confidenceLabel(n, config.confidenceThresholds),
    };
  }
  return result;
}

// ---------------------------------------------------------------------------
// §6.3.4 — Cappatura per domanda residua
// ---------------------------------------------------------------------------

/**
 * p̂_j ← min(p̂_j, C²_j + 1): in un'asta a rialzo il prezzo è fissato dal secondo offerente, non
 * dal primo, quindi la previsione non deve mai superare quello che il secondo tetto può imporre.
 */
export function capByResidualDemand(pHat: number, ceiling: CeilingInfo): number {
  return Math.min(pHat, ceiling.c2 + 1);
}

export { totalSlotsRemaining };
