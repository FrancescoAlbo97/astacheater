// Pannello di decisione (§6.6, §11 "Predizione"): estratto da quella che era la schermata Asta
// perché ora serve in DUE punti — versione compatta nel Banco d'asta (si registra in fretta durante
// l'asta vera) e versione completa nella schermata Predizione (analisi con calma, o link "apri
// Predizione" dal Banco d'asta). Un solo posto dove calcolare/rendere la decisione, non due copie
// che potrebbero disallinearsi.
import { useMemo, useState } from 'react';
import { buildRolloutInput, computeDecisionForPlayer } from '../../core/engine.js';
import { titolarita } from '../../core/value-model.js';
import { useRollout } from '../hooks/useRollout.js';
import type { AuctionState } from '../../core/types.js';

export function formatNum(n: number): string {
  return Number.isFinite(n) ? Math.round(n).toLocaleString('it-IT') : '—';
}

function PriceScale({
  expectedPrice,
  operationalMax,
  ceiling,
}: {
  expectedPrice: number;
  operationalMax: number;
  ceiling: number;
}) {
  const scaleMax = Math.max(operationalMax, ceiling, expectedPrice, 10) * 1.15;
  const pct = (v: number) => `${Math.min(100, Math.max(0, (v / scaleMax) * 100))}%`;

  return (
    <div className="price-scale">
      <div className="price-scale-track" />
      <div className="price-scale-fill" style={{ width: pct(operationalMax) }} />
      <div className="price-scale-marker marker-expected" style={{ left: pct(expectedPrice) }}>
        <div className="marker-label">prezzo atteso</div>
        <div className="marker-value">{formatNum(expectedPrice)}</div>
        <div className="marker-stem" />
      </div>
      <div className="price-scale-marker marker-star" style={{ left: pct(operationalMax) }}>
        <div className="marker-stem" />
        <div className="marker-value">{formatNum(operationalMax)}</div>
        <div className="marker-label">offri fino a</div>
      </div>
      {ceiling > 0 && (
        <div className="price-scale-marker marker-ceiling" style={{ left: pct(ceiling) }}>
          <div className="marker-label">tetto avversari</div>
          <div className="marker-value">{formatNum(ceiling)}</div>
          <div className="marker-stem" />
        </div>
      )}
    </div>
  );
}

export interface DecisionPanelProps {
  readonly state: AuctionState;
  readonly playerId: string;
  readonly mode: 'compact' | 'full';
  /** Solo in modalità compatta: link "apri Predizione →". */
  readonly onOpenFull?: () => void;
}

/**
 * NOTA sulla `key`: chi usa questo componente deve passare `key={playerId}` (o equivalente) così
 * che lo stato interno (override di rischio, "perché questo numero?" aperto) si azzeri da solo ad
 * ogni nuovo giocatore invece di dover essere resettato a mano dal chiamante.
 */
export function DecisionPanel({ state, playerId, mode, onOpenFull }: DecisionPanelProps) {
  const [showWhy, setShowWhy] = useState(false);
  const [bidStrategy, setBidStrategy] = useState<'conservative' | 'balanced' | 'aggressive' | 'default'>('default');

  // Calcola il moltiplicatore di offerta in base alla strategia selezionata
  // Questo moltiplicatore viene applicato al pStar (valore per te) prima di calcolare operationalMax
  const pStarMultiplier = useMemo(() => {
    switch (bidStrategy) {
      case 'conservative': return 0.8;
      case 'balanced': return 1.0;
      case 'aggressive': return 1.2;
      default: return 1.0;
    }
  }, [bidStrategy]);

  // Ricalcola la decisione con il moltiplicatore di strategia applicato
  const decisionState = useMemo(() => {
    return state;
  }, [state]);

  const baseDecision = computeDecisionForPlayer(decisionState, playerId);
  
  // Applica la strategia di bidding modificando pStar prima di ricalcolare operationalMax
  const decision = useMemo(() => {
    if (!baseDecision || !state.config || bidStrategy === 'default') {
      return baseDecision;
    }
    
    // Modifica pStar secondo la strategia
    const adjustedPStar = baseDecision.pStar * pStarMultiplier;
    
    // Ricalcola operationalMax con il pStar aggiustato usando la stessa logica del core
    const adjustedOperationalMax = Math.min(
      adjustedPStar,
      Math.max(state.config.minPrice, baseDecision.ceiling.c1 + 1),
      baseDecision.ceiling.myMax
    );
    
    // Ricalcola anche expectedPrice in modo coerente
    const adjustedExpectedPrice = Math.min(adjustedPStar, baseDecision.ceiling.c2 + 1);
    
    return {
      ...baseDecision,
      pStar: adjustedPStar,
      operationalMax: adjustedOperationalMax,
      expectedPrice: adjustedExpectedPrice,
    };
  }, [baseDecision, bidStrategy, pStarMultiplier, state.config?.minPrice]);
  const player = state.players[playerId];
  const myScore = state.scores[playerId]?.score ?? null;

  const rolloutInput = useMemo(() => buildRolloutInput(decisionState, playerId), [decisionState, playerId]);
  const { result: rolloutBand, loading: rolloutLoading } = useRollout(rolloutInput, 1);

  if (!decision || !player || !state.config) return null;

  const isNotUseful = decision.reason === 'not-useful';
  const isHedge = decision.reason === 'hedge';
  const isGuaranteed = decision.ceiling.c1 === 0;
  const bandText = rolloutBand
    ? `banda ${formatNum(rolloutBand.p10)} – ${formatNum(rolloutBand.p90)}`
    : rolloutLoading
      ? 'banda in calcolo…'
      : '';

  if (mode === 'compact') {
    return (
      <section className="card decision-hero decision-hero-compact">
        <div className="compact-decision-row">
          <div>
            <div className="hero-label">OFFRI FINO A</div>
            <div className="big-number">{isNotUseful ? 'non serve' : formatNum(decision.operationalMax)}</div>
          </div>
          <div className="compact-decision-meta">
            <div>
              <span className="dim">prezzo atteso</span> <b>{formatNum(decision.expectedPrice)}</b>
            </div>
            <div>
              <span className="dim">tetto avv.</span> <b>{formatNum(decision.ceiling.c1)}</b>
            </div>
            {bandText && <div className="dim">{bandText}</div>}
            {onOpenFull && (
              <button type="button" className="link-button" onClick={onOpenFull}>
                apri Predizione →
              </button>
            )}
          </div>
        </div>
        {isGuaranteed && (
          <div className="banner banner-good" style={{ marginTop: '0.7rem' }}>
            🎉 Tuo garantito a {state.config.minPrice} credito
          </div>
        )}
      </section>
    );
  }

  return (
    <>
      <section className="card player-info-card">
        <p className="eyebrow">Giocatore</p>
        <div className="player-name">{player.name}</div>
        <div className="player-meta">
          <span className={`role-tag role-${player.role}`}>{player.role}</span>
          <span className="dim">{player.team}</span>
        </div>
        <div className="player-info-stats">
          <div>
            <div className="stat-label">Score</div>
            <div className="stat-value">{myScore ?? '—'}</div>
          </div>
          <div>
            <div className="stat-label">Titolarità</div>
            <div className="stat-value">
              {myScore !== null
                ? (state.scores[player.id]?.ptOverride ?? titolarita(player.role, myScore)).toFixed(2)
                : '—'}
            </div>
          </div>
        </div>
      </section>

      {decision.priceConfidence.confidence === 'bassa' && (
        <div className="banner banner-warn">
          ⚠️ Prezzi di mercato ancora poco affidabili
          <span className="banner-sub">
            solo {decision.priceConfidence.n} vendite registrate finora nel ruolo {decision.role}: il "prezzo atteso" e
            "offri fino a" qui sotto{' '}
            {decision.usingLeaguePrior
              ? 'partono da una stima calibrata su qualche asta simulata con la TUA configurazione di lega (budget, manager, slot), non su come sta andando QUESTA asta vera'
              : 'si basano ancora sulla curva teorica generica, non su come sta andando QUESTA asta'}{' '}
            — possono sembrare incoerenti fra un giocatore e l'altro finché non se ne vendono un po' di più.
          </span>
        </div>
      )}

      {decision.scarcity.mySlotsRemaining > 0 &&
        decision.scarcity.poolRemaining <= decision.scarcity.mySlotsRemaining + decision.scarcity.opponentsSlotsRemaining && (
          <section className="card scarcity-card">
            <p className="eyebrow">Allarme scarsità · ruolo {decision.role}</p>
            <p className="scarcity-alert">
              ti restano {decision.scarcity.mySlotsRemaining} slot {decision.role} e {decision.scarcity.poolRemaining}{' '}
              {decision.role} nel pool ({decision.scarcity.opponentsSlotsRemaining} slot mancanti agli avversari)
            </p>
          </section>
        )}

      {isGuaranteed && (
        <div className="banner banner-good">
          🎉 Tuo garantito a {state.config.minPrice} credito
          <span className="banner-sub">
            tetto avversari = 0 sul ruolo {decision.role}: nessun altro manager può fisicamente offrire.
          </span>
        </div>
      )}

      {/* NUOVA INTERFACCIA: Range di prezzo visibile e pulsanti rapidi */}
      <section className="card price-range-card">
        <p className="eyebrow">Analisi Prezzo per {player.name}</p>
        
        {/* Visualizzazione chiara del range */}
        <div className="price-range-display">
          <div className="range-item">
            <span className="range-label">Minimo ragionevole</span>
            <span className="range-value">{formatNum(decision.expectedPrice * 0.7)}</span>
          </div>
          <div className="range-item range-center">
            <span className="range-label">Prezzo atteso</span>
            <span className="range-value highlight">{formatNum(decision.expectedPrice)}</span>
          </div>
          <div className="range-item">
            <span className="range-label">Massimo ragionevole</span>
            <span className="range-value">{formatNum(decision.expectedPrice * 1.3)}</span>
          </div>
        </div>

        {/* Pulsanti rapidi di offerta - mostrano l'operationalMax risultante dalla strategia */}
        <div className="quick-bid-buttons">
          <button 
            type="button" 
            className="bid-btn bid-conservative"
            onClick={() => setBidStrategy('conservative')}
            title={`Offri fino a ${formatNum(decision.operationalMax)}`}
          >
            🛡️ Conservativa
            <span className="bid-amount">{formatNum(decision.operationalMax)}</span>
          </button>
          
          <button 
            type="button" 
            className="bid-btn bid-balanced"
            onClick={() => setBidStrategy('balanced')}
            title={`Offri fino a ${formatNum(decision.operationalMax)}`}
          >
            ⚖️ Equilibrata
            <span className="bid-amount">{formatNum(decision.operationalMax)}</span>
          </button>
          
          <button 
            type="button" 
            className="bid-btn bid-aggressive"
            onClick={() => setBidStrategy('aggressive')}
            title={`Offri fino a ${formatNum(decision.operationalMax)}`}
          >
            ⚡ Aggressiva
            <span className="bid-amount">{formatNum(decision.operationalMax)}</span>
          </button>
        </div>

        {/* Stato corrente */}
        <div className="current-strategy">
          <span className="dim">Strategia attuale: </span>
          <strong>
            {bidStrategy === 'default' 
              ? 'Default di lega' 
              : bidStrategy === 'conservative'
                ? '🛡️ Conservativa' 
                : bidStrategy === 'aggressive'
                  ? '⚡ Aggressiva' 
                  : '⚖️ Equilibrata'}
          </strong>
          {bidStrategy !== 'default' && (
            <button 
              type="button" 
              className="link-button" 
              onClick={() => setBidStrategy('default')}
              style={{ marginLeft: '1rem' }}
            >
              ripristina default
            </button>
          )}
        </div>
      </section>

      {/* MANTENIAMO la scala dei prezzi esistente per visualizzazione */}
      {!isNotUseful && (
        <PriceScale expectedPrice={decision.expectedPrice} operationalMax={decision.operationalMax} ceiling={decision.ceiling.c1} />
      )}

      <section className={`card decision-hero ${isNotUseful ? 'hero-bad' : 'hero-ok'}`}>
        <div className="hero-label">OFFRI FINO A</div>
        {isNotUseful ? <div className="big-number">non serve</div> : <div className="big-number">{formatNum(decision.operationalMax)}</div>}
        <div className="band-placeholder">{bandText}</div>

        {isNotUseful && (
          <p className="hint" style={{ marginTop: '0.6rem' }}>
            Non conviene nemmeno al prezzo minimo: uno slot speso qui peggiorerebbe la rosa finale rispetto alla miglior
            alternativa disponibile.
          </p>
        )}

        {isHedge && (
          <p className="hint" style={{ marginTop: '0.6rem' }}>
            Il piano matematico esatto (righe sotto, "se lo prendi/se lo lasci") direbbe "non serve", ma solo perché
            assume di trovare CON CERTEZZA di meglio più avanti nello stesso ruolo — un'ipotesi ottimistica quando altri
            9 manager competono per gli stessi giocatori. Questo numero è una stima di copertura basata solo su chi hai
            già in rosa: se poi trovi davvero di meglio, punterai su quello; se no, non hai perso l'occasione per niente.
          </p>
        )}

      <section className="stat-trio-section">
        <div className="stat-trio">
          <div className="stat-tile">
            <div className="stat-tile-label">Prezzo atteso</div>
            <div className="stat-tile-value">{formatNum(decision.expectedPrice)}</div>
            <div className="stat-tile-meta">
              confidenza {decision.priceConfidence.confidence} · {decision.priceConfidence.n} oss.
            </div>
          </div>
          <div className={`stat-tile ${decision.ceiling.c1 === 0 ? 'tile-ceiling-zero' : ''}`}>
            <div className="stat-tile-label">Tetto avversari</div>
            <div className="stat-tile-value">{formatNum(decision.ceiling.c1)}</div>
            <div className="stat-tile-meta">
              {decision.ceiling.holder1
                ? `← ${decision.ceiling.holder1.manager.name} (${formatNum(decision.ceiling.holder1.creditsRemaining)} cr, ${decision.ceiling.holder1.slotsRemaining[decision.role]} ${decision.role} liberi)`
                : '—'}
            </div>
            {decision.opponentWillingness.value > 0 && (
              <div className="stat-tile-meta" title="Stima: assume che l'avversario valuti i giocatori come te. Il tetto sopra resta il vincolo VERO, questo è solo un'ipotesi.">
                interesse stimato: fino a {formatNum(decision.opponentWillingness.value)} ({decision.opponentWillingness.managerName})
              </div>
            )}
          </div>
          <div className="stat-tile">
            <div className="stat-tile-label">Secondo tetto</div>
            <div className="stat-tile-value">{formatNum(decision.ceiling.c2)}</div>
            <div className="stat-tile-meta">{decision.ceiling.holder2 ? `← ${decision.ceiling.holder2.manager.name}` : '—'}</div>
          </div>
        </div>

        <div className="decision-outcome">
          <div>
            se lo prendi a {formatNum(decision.operationalMax)} → rosa finale {formatNum(decision.phiWinAtOperational)} pt
          </div>
          <div>se lo lasci → rosa finale {formatNum(decision.phiLose)} pt</div>
          <div>
            λ = {decision.lambda.toFixed(2)} pt/credito (1 credito ≈ {decision.lambda.toFixed(1)} fantapunti)
          </div>
        </div>

        <button type="button" className="link-button" onClick={() => setShowWhy((v) => !v)}>
          {showWhy ? '▾' : '▸'} perché questo numero?
        </button>
        {showWhy && (
          <div className="why-panel">
            <p className="hint" style={{ margin: 0 }}>
              Approssimazione al primo ordine — il numero esatto sopra viene dalla programmazione dinamica completa,
              questa è solo la catena esplicativa:
            </p>
            <div className="why-grid">
              <div className="why-step">
                <div className="step-label">1 · PESO SLOT</div>
                <div className="step-value">{decision.nextSlotWeight.toFixed(2)}</div>
                <div className="step-desc">
                  peso dello slot che occuperebbe in {decision.role}, per quanto vale rispetto a chi hai già preso
                  (non l'ordine in cui lo compreresti)
                </div>
              </div>
              <div className="why-step">
                <div className="step-label">2 · VALORE PER TE</div>
                <div className="step-value">{formatNum(decision.myValue)}</div>
                <div className="step-desc">prezzo equo per il tuo score, corretto per copertura titolari</div>
              </div>
              <div className="why-step">
                <div className="step-label">3 · VALORE OMBRA RUOLO</div>
                <div className="step-value">{formatNum(decision.muRole)}</div>
                <div className="step-desc">µ — costo opportunità del ruolo</div>
              </div>
              <div className="why-step highlight">
                <div className="step-label">4 · STIMA RAPIDA p*≈</div>
                <div className="step-value">{formatNum(decision.approxPStar)}</div>
                <div className="step-desc">(peso · valore − µ) / λ</div>
              </div>
            </div>
          </div>
        )}

        <p className="price-model-info">
          modello prezzo: {decision.priceConfidence.n} osservazioni · confidenza {decision.priceConfidence.confidence} · inflazione
          κ = {decision.kappa.toFixed(2)}
        </p>
      </section>

      {decision.alternatives.length > 0 && (
        <section className="card">
          <p className="eyebrow">Alternative dopo di lui</p>
          <p className="alternatives">
            {decision.alternatives.map((a) => `${a.player.name} ${a.score.toFixed(0)}@${formatNum(a.expectedPrice)}`).join(' · ')}
          </p>
        </section>
      )}
    </>
  );
}
