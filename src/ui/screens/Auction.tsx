// §11 — Schermata "Asta (live)". La schermata che conta: numero deterministico entro 100ms,
// registrazione di un acquisto in due tap più un numero, undo sempre visibile, nessun dialog
// modale bloccante (§13.9, requisiti trasversali).
import { useMemo, useState } from 'react';
import { useAuctionStore } from '../state/store.js';
import { buildRolloutInput, computeDecisionForPlayer } from '../../core/engine.js';
import { deriveManagerStates, getMyManagerId, getPool } from '../../core/state.js';
import { maxSingleBid } from '../../core/ceiling.js';
import { titolarita } from '../../core/value-model.js';
import { useRollout } from '../hooks/useRollout.js';
import type { Player } from '../../core/types.js';

function formatNum(n: number): string {
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

export function Auction() {
  const { state, dispatch, undo, canUndo } = useAuctionStore();
  const [search, setSearch] = useState('');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState('');
  const [selectedManagerId, setSelectedManagerId] = useState<string | null>(null);
  const [showWhy, setShowWhy] = useState(false);
  const [overrideInput, setOverrideInput] = useState('');
  // Aggressività temporanea per QUESTA decisione soltanto (non tocca il config di lega): `null`
  // significa "usa il valore di Setup lega". Si azzera ad ogni nuovo giocatore estratto, così non
  // resta accidentalmente impostata per l'asta successiva.
  const [riskOverride, setRiskOverride] = useState<number | null>(null);

  const myManagerId = getMyManagerId(state.config);
  const managers = useMemo(() => deriveManagerStates(state), [state]);
  const pool = useMemo(() => getPool(state), [state]);

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return pool.filter((p) => p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q)).slice(0, 8);
  }, [search, pool]);

  // Stato "effettivo" usato solo per calcolare la decisione: se c'è un override attivo, sostituisce
  // il rischio di lega SOLO per questo calcolo. Tutto il resto (rose, avversari, dispatch) continua
  // a usare `state` normale.
  const decisionState = useMemo(() => {
    if (riskOverride === null || !state.config) return state;
    return { ...state, config: { ...state.config, risk: riskOverride } };
  }, [state, riskOverride]);

  const selectedPlayer: Player | null = selectedPlayerId ? state.players[selectedPlayerId] ?? null : null;
  const decision = selectedPlayerId ? computeDecisionForPlayer(decisionState, selectedPlayerId) : null;
  const myScore = selectedPlayerId ? state.scores[selectedPlayerId]?.score ?? null : null;

  // Il rollout gira in un Web Worker (§13.9): l'input è memoizzato perché non cambi identità ad
  // ogni render (altrimenti riavvierebbe il calcolo in continuazione), solo quando lo stato o il
  // giocatore selezionato cambiano davvero.
  const rolloutInput = useMemo(
    () => (selectedPlayerId ? buildRolloutInput(decisionState, selectedPlayerId) : null),
    [decisionState, selectedPlayerId],
  );
  const { result: rolloutBand, loading: rolloutLoading } = useRollout(rolloutInput, 1);

  if (!state.config || !myManagerId) {
    return <p className="placeholder">Configura prima la lega (schermata Setup).</p>;
  }

  function pickPlayer(id: string) {
    setSelectedPlayerId(id);
    setSearch('');
    setSelectedManagerId(null);
    setPriceInput('');
    setShowWhy(false);
    setOverrideInput('');
    setRiskOverride(null);
  }

  function recordSale() {
    if (!selectedPlayerId || !selectedManagerId) return;
    const price = Number(priceInput);
    if (!Number.isFinite(price) || price < state.config!.minPrice) return;
    dispatch({ t: 'sale', playerId: selectedPlayerId, managerId: selectedManagerId, price });
    setSelectedPlayerId(null);
  }

  function markUnsold() {
    if (!selectedPlayerId) return;
    dispatch({ t: 'unsold', playerId: selectedPlayerId });
    setSelectedPlayerId(null);
  }

  function applyOverride() {
    if (!selectedPlayerId) return;
    const value = Number(overrideInput);
    if (!Number.isFinite(value)) return;
    dispatch({ t: 'manual.override', playerId: selectedPlayerId, maxBid: value });
  }

  const myState = managers.find((m) => m.manager.id === myManagerId);
  const sortedOpponents = managers
    .filter((m) => m.manager.id !== myManagerId)
    .map((m) => ({ ...m, c: maxSingleBid(m) }))
    .sort((a, b) => b.c - a.c);

  const isGuaranteed = decision !== null && decision.ceiling.c1 === 0;
  const isNotUseful = decision !== null && decision.reason === 'not-useful';

  return (
    <div className="screen auction-screen">
      <div className="auction-toolbar">
        <button type="button" className="undo-button" onClick={undo} disabled={!canUndo}>
          ↩ Annulla ultimo
        </button>
      </div>

      <section className="card player-search">
        <input
          type="search"
          autoFocus
          placeholder="Cerca il giocatore appena estratto…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {searchResults.length > 0 && (
          <ul className="search-results">
            {searchResults.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => pickPlayer(p.id)}>
                  <span className={`role-tag role-${p.role}`}>{p.role}</span> {p.name}{' '}
                  <span className="dim">({p.team})</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selectedPlayer && decision && (
        <div className="auction-grid">
          {/* ---- colonna sinistra: giocatore estratto + scarsità ---- */}
          <div>
            <section className="card player-info-card">
              <p className="eyebrow">Giocatore estratto</p>
              <div className="player-name">{selectedPlayer.name}</div>
              <div className="player-meta">
                <span className={`role-tag role-${selectedPlayer.role}`}>{selectedPlayer.role}</span>
                <span className="dim">{selectedPlayer.team}</span>
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
                      ? (
                          state.scores[selectedPlayer.id]?.ptOverride ??
                          titolarita(selectedPlayer.role, myScore)
                        ).toFixed(2)
                      : '—'}
                  </div>
                </div>
              </div>
            </section>

            {decision.scarcity.mySlotsRemaining > 0 &&
              decision.scarcity.poolRemaining <=
                decision.scarcity.mySlotsRemaining + decision.scarcity.opponentsSlotsRemaining && (
                <section className="card scarcity-card">
                  <p className="eyebrow">Allarme scarsità · ruolo {decision.role}</p>
                  <p className="scarcity-alert">
                    ti restano {decision.scarcity.mySlotsRemaining} slot {decision.role} e{' '}
                    {decision.scarcity.poolRemaining} {decision.role} nel pool ({decision.scarcity.opponentsSlotsRemaining}{' '}
                    slot mancanti agli avversari)
                  </p>
                </section>
              )}

            {decision.alternatives.length > 0 && (
              <section className="card">
                <p className="eyebrow">Alternative dopo di lui</p>
                <p className="alternatives">
                  {decision.alternatives
                    .map((a) => `${a.player.name} ${a.score.toFixed(0)}@${formatNum(a.expectedPrice)}`)
                    .join(' · ')}
                </p>
              </section>
            )}
          </div>

          {/* ---- colonna centrale: decisione ---- */}
          <div>
            {isGuaranteed && (
              <div className="banner banner-good">
                🎉 Tuo garantito a {state.config.minPrice} credito
                <span className="banner-sub">
                  tetto avversari = 0 sul ruolo {decision.role}: nessun altro manager può fisicamente offrire.
                </span>
              </div>
            )}

            <section className="card risk-override-card">
              <div className="risk-override-row">
                <span className="eyebrow" style={{ margin: 0 }}>
                  Aggressività per questo giocatore: {(riskOverride ?? state.config.risk).toFixed(2)}
                  {riskOverride === null && <span className="dim"> (di lega)</span>}
                </span>
                {riskOverride !== null && (
                  <button type="button" className="link-button" onClick={() => setRiskOverride(null)}>
                    ripristina
                  </button>
                )}
              </div>
              <div className="risk-slider-wrap">
                <input
                  type="range"
                  min={-1}
                  max={1}
                  step={0.05}
                  value={riskOverride ?? state.config.risk}
                  onChange={(e) => setRiskOverride(Number(e.target.value))}
                />
                <div className="risk-scale-labels">
                  <span>−1 più sicuro</span>
                  <span>+1 più aggressivo</span>
                </div>
              </div>
            </section>

            <section className={`card decision-hero ${isNotUseful ? 'hero-bad' : 'hero-ok'}`}>
              <div className="hero-label">OFFRI FINO A</div>
              {isNotUseful ? (
                <div className="big-number">non serve</div>
              ) : (
                <div className="big-number">{formatNum(decision.operationalMax)}</div>
              )}
              <div className="band-placeholder">
                {rolloutBand
                  ? `banda (worker) ${formatNum(rolloutBand.p10)} – ${formatNum(rolloutBand.p90)}`
                  : rolloutLoading
                    ? 'banda in calcolo…'
                    : ''}
              </div>

              {isNotUseful && (
                <p className="hint" style={{ marginTop: '0.6rem' }}>
                  Non conviene nemmeno al prezzo minimo: uno slot speso qui peggiorerebbe la rosa finale rispetto alla
                  miglior alternativa disponibile.
                </p>
              )}

              {!isNotUseful && (
                <PriceScale
                  expectedPrice={decision.expectedPrice}
                  operationalMax={decision.operationalMax}
                  ceiling={decision.ceiling.c1}
                />
              )}

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
                </div>
                <div className="stat-tile">
                  <div className="stat-tile-label">Secondo tetto</div>
                  <div className="stat-tile-value">{formatNum(decision.ceiling.c2)}</div>
                  <div className="stat-tile-meta">{decision.ceiling.holder2 ? `← ${decision.ceiling.holder2.manager.name}` : '—'}</div>
                </div>
              </div>

              <div className="decision-outcome">
                <div>
                  se lo prendi a {formatNum(decision.operationalMax)} → rosa finale{' '}
                  {formatNum(decision.phiWinAtOperational)} pt
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
                    Approssimazione al primo ordine — il numero esatto sopra viene dalla programmazione dinamica
                    completa, questa è solo la catena esplicativa:
                  </p>
                  <div className="why-grid">
                    <div className="why-step">
                      <div className="step-label">1 · PESO SLOT</div>
                      <div className="step-value">{decision.nextSlotWeight.toFixed(2)}</div>
                      <div className="step-desc">peso del prossimo slot da riempire in {decision.role}</div>
                    </div>
                    <div className="why-step">
                      <div className="step-label">2 · VALORE PER TE</div>
                      <div className="step-value">{formatNum(decision.myValue)}</div>
                      <div className="step-desc">score × titolarità</div>
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
                modello prezzo: {decision.priceConfidence.n} osservazioni · confidenza {decision.priceConfidence.confidence}{' '}
                · inflazione κ = {decision.kappa.toFixed(2)}
              </p>
            </section>

            <section className="card record-sale">
              <h3>Chi l'ha preso?</h3>
              <div className="manager-grid">
                {managers.map((m) => (
                  <button
                    key={m.manager.id}
                    type="button"
                    className={selectedManagerId === m.manager.id ? 'manager-button selected' : 'manager-button'}
                    onClick={() => setSelectedManagerId(m.manager.id)}
                  >
                    {m.manager.name}
                    <span className="credits">{m.creditsRemaining} cr</span>
                  </button>
                ))}
              </div>
              <div className="price-record-row">
                <div className="price-input-wrap">
                  <span className="price-input-label">PREZZO</span>
                  <input
                    type="number"
                    min={state.config.minPrice}
                    placeholder="—"
                    value={priceInput}
                    onChange={(e) => setPriceInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') recordSale();
                    }}
                  />
                </div>
                <button type="button" className="primary-button" onClick={recordSale} disabled={!selectedManagerId || !priceInput}>
                  Registra
                </button>
                <button type="button" className="secondary-button" onClick={markUnsold}>
                  Non venduto
                </button>
              </div>
              <details className="override-details">
                <summary>Override manuale del massimo</summary>
                <div className="price-record-row">
                  <input
                    type="number"
                    placeholder="Nuovo massimo"
                    value={overrideInput}
                    onChange={(e) => setOverrideInput(e.target.value)}
                  />
                  <button type="button" className="secondary-button" onClick={applyOverride}>
                    Applica
                  </button>
                </div>
              </details>
            </section>
          </div>

          {/* ---- colonna destra: avversari + mia rosa ---- */}
          <div>
            <section className="card opponents-panel">
              <p className="eyebrow">Avversari · ordinati per tetto</p>
              {sortedOpponents.map((m) => (
                <div key={m.manager.id} className="opponent-tile">
                  <div className="opponent-top">
                    <span>{m.manager.name}</span>
                    <span className={`opponent-ceiling ${m.c === 0 ? 'ceiling-zero' : m.c < 15 ? 'ceiling-low' : ''}`}>
                      {m.c}
                    </span>
                  </div>
                  <div className="opponent-meta">
                    {m.creditsRemaining} cr · {m.slotsRemaining.P}/{m.slotsRemaining.D}/{m.slotsRemaining.C}/
                    {m.slotsRemaining.A} slot
                  </div>
                </div>
              ))}
            </section>

            {myState && (
              <section className="card my-roster-panel">
                <p className="eyebrow">
                  La mia rosa · c₀ = {maxSingleBid(myState)} · {myState.creditsRemaining} cr residui
                </p>
                <div className="roster-summary-tiles">
                  {(['P', 'D', 'C', 'A'] as const).map((role) => (
                    <div key={role} className="slot-tile">
                      <span className={`role-label role-text-${role}`}>{role}</span>
                      <div className="value">{myState.slotsRemaining[role]}</div>
                    </div>
                  ))}
                </div>
                <ul className="my-roster-list">
                  {myState.roster.map((entry) => (
                    <li key={entry.player.id}>
                      <span>
                        <span className={`role-tag role-${entry.player.role}`}>{entry.player.role}</span> {entry.player.name}
                      </span>
                      <span className="roster-price">{entry.price}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      )}

      {!selectedPlayer && (
        <div className="auction-grid">
          <div />
          <div />
          <div>
            <section className="card opponents-panel">
              <p className="eyebrow">Avversari · ordinati per tetto</p>
              {sortedOpponents.map((m) => (
                <div key={m.manager.id} className="opponent-tile">
                  <div className="opponent-top">
                    <span>{m.manager.name}</span>
                    <span className="opponent-ceiling">{m.c}</span>
                  </div>
                  <div className="opponent-meta">
                    {m.creditsRemaining} cr · {m.slotsRemaining.P}/{m.slotsRemaining.D}/{m.slotsRemaining.C}/
                    {m.slotsRemaining.A} slot
                  </div>
                </div>
              ))}
            </section>
            {myState && (
              <section className="card my-roster-panel">
                <p className="eyebrow">
                  La mia rosa · c₀ = {maxSingleBid(myState)} · {myState.creditsRemaining} cr residui
                </p>
                <div className="roster-summary-tiles">
                  {(['P', 'D', 'C', 'A'] as const).map((role) => (
                    <div key={role} className="slot-tile">
                      <span className={`role-label role-text-${role}`}>{role}</span>
                      <div className="value">{myState.slotsRemaining[role]}</div>
                    </div>
                  ))}
                </div>
                <ul className="my-roster-list">
                  {myState.roster.map((entry) => (
                    <li key={entry.player.id}>
                      <span>
                        <span className={`role-tag role-${entry.player.role}`}>{entry.player.role}</span> {entry.player.name}
                      </span>
                      <span className="roster-price">{entry.price}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
