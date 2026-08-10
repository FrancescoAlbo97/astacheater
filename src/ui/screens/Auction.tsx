// §11 — Schermata "Asta (live)". La schermata che conta: numero deterministico entro 100ms,
// registrazione di un acquisto in due tap più un numero, undo sempre visibile, nessun dialog
// modale bloccante (§13.9, requisiti trasversali).
import { useMemo, useState } from 'react';
import { useAuctionStore } from '../state/store.js';
import { buildRolloutInput, computeDecisionForPlayer } from '../../core/engine.js';
import { deriveManagerStates, getMyManagerId, getPool } from '../../core/state.js';
import { maxSingleBid } from '../../core/ceiling.js';
import { useRollout } from '../hooks/useRollout.js';
import type { Player } from '../../core/types.js';

function formatNum(n: number): string {
  return Number.isFinite(n) ? Math.round(n).toLocaleString('it-IT') : '—';
}

export function Auction() {
  const { state, dispatch, undo, canUndo } = useAuctionStore();
  const [search, setSearch] = useState('');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState('');
  const [selectedManagerId, setSelectedManagerId] = useState<string | null>(null);
  const [showWhy, setShowWhy] = useState(false);
  const [overrideInput, setOverrideInput] = useState('');

  const myManagerId = getMyManagerId(state.config);
  const managers = useMemo(() => deriveManagerStates(state), [state]);
  const pool = useMemo(() => getPool(state), [state]);

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return pool.filter((p) => p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q)).slice(0, 8);
  }, [search, pool]);

  const selectedPlayer: Player | null = selectedPlayerId ? state.players[selectedPlayerId] ?? null : null;
  const decision = selectedPlayerId ? computeDecisionForPlayer(state, selectedPlayerId) : null;
  const myScore = selectedPlayerId ? state.scores[selectedPlayerId]?.score ?? null : null;

  // Il rollout gira in un Web Worker (§13.9): l'input è memoizzato perché non cambi identità ad
  // ogni render (altrimenti riavvierebbe il calcolo in continuazione), solo quando lo stato o il
  // giocatore selezionato cambiano davvero.
  const rolloutInput = useMemo(
    () => (selectedPlayerId ? buildRolloutInput(state, selectedPlayerId) : null),
    [state, selectedPlayerId],
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
                  {p.name} <span className="dim">({p.role}, {p.team})</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selectedPlayer && decision && (
        <section className="card decision-panel">
          <header className="decision-header">
            <h2>{selectedPlayer.name.toUpperCase()}</h2>
            <span className="dim">
              ({selectedPlayer.role}, {selectedPlayer.team}) score {myScore ?? '—'}
            </span>
          </header>

          {decision.ceiling.c1 === 0 && (
            <div className="banner banner-good">🎉 Tuo a 1 credito, garantito: nessun avversario può rilanciare.</div>
          )}

          <div className="decision-numbers">
            <div className="decision-main">
              <span className="label">OFFRI FINO A</span>
              {decision.reason === 'not-useful' ? (
                <span className="big-number dim">non serve</span>
              ) : (
                <span className="big-number">{formatNum(decision.operationalMax)}</span>
              )}
              <span className="band-placeholder">
                {rolloutBand
                  ? `banda ${formatNum(rolloutBand.p10)} – ${formatNum(rolloutBand.p90)}`
                  : rolloutLoading
                    ? 'banda in calcolo…'
                    : ''}
              </span>
            </div>
            <div className="decision-secondary">
              <div>
                <span className="label">prezzo atteso</span> <strong>{formatNum(decision.expectedPrice)}</strong>
              </div>
              <div>
                <span className="label">tetto avversari</span> <strong>{formatNum(decision.ceiling.c1)}</strong>
                {decision.ceiling.holder1 && (
                  <span className="dim">
                    {' '}
                    ← {decision.ceiling.holder1.manager.name} ({formatNum(decision.ceiling.holder1.creditsRemaining)} cr,{' '}
                    {decision.ceiling.holder1.slotsRemaining[decision.role]} {decision.role} liberi)
                  </span>
                )}
              </div>
              <div>
                <span className="label">secondo tetto</span> <strong>{formatNum(decision.ceiling.c2)}</strong>
                {decision.ceiling.holder2 && <span className="dim"> ← {decision.ceiling.holder2.manager.name}</span>}
              </div>
            </div>
          </div>

          <div className="decision-outcome">
            <div>se lo prendi a {formatNum(decision.operationalMax)} → rosa finale {formatNum(decision.phiWinAtOperational)} pt</div>
            <div>se lo lasci → rosa finale {formatNum(decision.phiLose)} pt</div>
            <div>
              λ = {decision.lambda.toFixed(2)} pt/credito (1 credito ≈ {decision.lambda.toFixed(1)} fantapunti)
            </div>
          </div>

          <button type="button" className="link-button" onClick={() => setShowWhy((v) => !v)}>
            {showWhy ? '▾' : '▸'} perché questo numero?
          </button>
          {showWhy && (
            <div className="why-box">
              <p>
                Approssimazione al primo ordine: p* ≈ (peso_slot · valore − valore_ombra_ruolo) / λ ={' '}
                ({decision.nextSlotWeight.toFixed(2)} · {formatNum(decision.myValue)} − {formatNum(decision.muRole)}) /{' '}
                {decision.lambda.toFixed(2)} ≈ {formatNum(decision.approxPStar)}.
              </p>
              <p>Il numero esatto mostrato sopra viene dalla programmazione dinamica completa, non da questa formula (che è solo esplicativa).</p>
            </div>
          )}

          {decision.alternatives.length > 0 && (
            <p className="alternatives">
              alternative dopo di lui:{' '}
              {decision.alternatives
                .map((a) => `${a.player.name} ${a.score.toFixed(0)}@${formatNum(a.expectedPrice)}`)
                .join(' · ')}
            </p>
          )}

          {decision.scarcity.mySlotsRemaining > 0 &&
            decision.scarcity.poolRemaining <= decision.scarcity.mySlotsRemaining + decision.scarcity.opponentsSlotsRemaining && (
              <p className="scarcity-alert">
                ⚠ ti restano {decision.scarcity.mySlotsRemaining} slot {decision.role} e {decision.scarcity.poolRemaining}{' '}
                {decision.role} nel pool ({decision.scarcity.opponentsSlotsRemaining} slot mancanti agli avversari)
              </p>
            )}

          <p className="price-model-info">
            modello prezzo: {decision.priceConfidence.n} osservazioni · confidenza {decision.priceConfidence.confidence} ·
            inflazione κ = {decision.kappa.toFixed(2)}
          </p>

          <div className="record-sale">
            <h3>Registra acquisto</h3>
            <div className="manager-grid">
              {managers.map((m) => (
                <button
                  key={m.manager.id}
                  type="button"
                  className={selectedManagerId === m.manager.id ? 'manager-button selected' : 'manager-button'}
                  onClick={() => setSelectedManagerId(m.manager.id)}
                >
                  {m.manager.name}
                  <span className="dim">{m.creditsRemaining} cr</span>
                </button>
              ))}
            </div>
            <div className="price-record-row">
              <input
                type="number"
                min={state.config.minPrice}
                placeholder="Prezzo"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') recordSale();
                }}
              />
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
                <button type="button" onClick={applyOverride}>
                  Applica
                </button>
              </div>
            </details>
          </div>
        </section>
      )}

      <section className="card opponents-panel">
        <h3>Avversari (ordinati per tetto)</h3>
        <table className="opponents-table">
          <thead>
            <tr>
              <th>Manager</th>
              <th>Crediti</th>
              <th>Slot P/D/C/A</th>
              <th>c_m</th>
            </tr>
          </thead>
          <tbody>
            {sortedOpponents.map((m) => (
              <tr key={m.manager.id}>
                <td>{m.manager.name}</td>
                <td>{m.creditsRemaining}</td>
                <td>
                  {m.slotsRemaining.P}/{m.slotsRemaining.D}/{m.slotsRemaining.C}/{m.slotsRemaining.A}
                </td>
                <td>{m.c}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {myState && (
        <section className="card my-roster-panel">
          <h3>
            La mia rosa — c_0 = {maxSingleBid(myState)} — {myState.creditsRemaining} crediti residui
          </h3>
          <ul className="my-roster-list">
            {myState.roster.map((entry) => (
              <li key={entry.player.id}>
                {entry.player.role} — {entry.player.name} @ {entry.price}
              </li>
            ))}
          </ul>
          <p className="dim">
            Slot mancanti: P {myState.slotsRemaining.P} · D {myState.slotsRemaining.D} · C {myState.slotsRemaining.C} · A{' '}
            {myState.slotsRemaining.A}
          </p>
        </section>
      )}
    </div>
  );
}
