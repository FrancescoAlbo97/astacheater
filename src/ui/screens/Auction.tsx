// §11 "Banco d'asta" — la schermata che conta durante l'asta vera: segna chi è uscito, a chi va e
// per quanto (o "non venduto"), corregge un errore passato, tiene sott'occhio l'avanzamento. La
// predizione completa (perché questo numero, alternative, allarme scarsità) vive nella schermata
// Predizione — qui solo la versione compatta, per non rallentare la registrazione dal vivo.
import { useMemo, useState } from 'react';
import { useAuctionStore } from '../state/store.js';
import { deriveManagerStates, getMyManagerId, getPool } from '../../core/state.js';
import { computeDecisionForPlayer } from '../../core/engine.js';
import { maxSingleBid } from '../../core/ceiling.js';
import { DecisionPanel, formatNum } from '../components/DecisionPanel.js';
import { PlayerSearchBox } from '../components/PlayerSearchBox.js';

export function AuctionDesk({ onOpenPrediction }: { onOpenPrediction: () => void }) {
  const { state, dispatch, undo, canUndo, activePlayerId, setActivePlayerId } = useAuctionStore();
  const [priceInput, setPriceInput] = useState('');
  const [selectedManagerId, setSelectedManagerId] = useState<string | null>(null);
  const [sidePanelTab, setSidePanelTab] = useState<'registro' | 'non-acquistati'>('registro');
  const [correctingPlayerId, setCorrectingPlayerId] = useState<string | null>(null);

  const myManagerId = getMyManagerId(state.config);
  const managers = useMemo(() => deriveManagerStates(state), [state]);
  const pool = useMemo(() => getPool(state), [state]);
  const selectedPlayer = activePlayerId ? state.players[activePlayerId] ?? null : null;

  const targetsQueue = useMemo(() => {
    return pool
      .filter((p) => state.targets[p.id])
      .map((p) => ({ player: p, decision: computeDecisionForPlayer(state, p.id) }))
      .sort((a, b) => (state.scores[b.player.id]?.score ?? 0) - (state.scores[a.player.id]?.score ?? 0))
      .slice(0, 4);
  }, [pool, state]);

  const recentSales = useMemo(() => state.sales.slice(-30).reverse(), [state.sales]);

  if (!state.config || !myManagerId) {
    return <p className="placeholder">Configura prima la lega (schermata Setup).</p>;
  }

  function pickPlayer(id: string) {
    setActivePlayerId(id);
    setSelectedManagerId(null);
    setPriceInput('');
  }

  function recordSale() {
    if (!activePlayerId || !selectedManagerId) return;
    const price = Number(priceInput);
    if (!Number.isFinite(price) || price < state.config!.minPrice) return;
    dispatch({ t: 'sale', playerId: activePlayerId, managerId: selectedManagerId, price });
    setActivePlayerId(null);
    setSelectedManagerId(null);
    setPriceInput('');
  }

  function markUnsold() {
    if (!activePlayerId) return;
    dispatch({ t: 'unsold', playerId: activePlayerId });
    setActivePlayerId(null);
  }

  function requeue(playerId: string) {
    dispatch({ t: 'revert', playerId });
  }

  function requeueAllUnsold() {
    for (const playerId of state.unsold) dispatch({ t: 'revert', playerId });
  }

  const assigned = state.sales.length;
  const unsoldCount = state.unsold.length;
  const remaining = pool.length;
  const totalPlayers = assigned + unsoldCount + remaining;

  return (
    <div className="screen auction-desk-screen">
      <div className="auction-toolbar">
        <button type="button" className="undo-button" onClick={undo} disabled={!canUndo}>
          ↩ Annulla ultimo
        </button>
        <span className="dim" style={{ marginLeft: 'auto' }}>
          assegnati <b className="mono">{assigned}</b> · non acquistati <b className="mono ceiling-low">{unsoldCount}</b> · da
          estrarre <b className="mono">{remaining}</b>
        </span>
      </div>

      <div className="desk-grid">
        <div className="desk-main">
          <PlayerSearchBox pool={pool} placeholder="Chi è uscito?" onPick={pickPlayer} autoFocus />

          {selectedPlayer && (
            <>
              <section className="card in-auction-now-card">
                <div>
                  <p className="eyebrow">In asta adesso</p>
                  <div className="player-name">{selectedPlayer.name}</div>
                  <div className="player-meta">
                    <span className={`role-tag role-${selectedPlayer.role}`}>{selectedPlayer.role}</span>
                    <span className="dim">
                      {selectedPlayer.team} · score {state.scores[selectedPlayer.id]?.score?.toFixed(0) ?? '—'}
                    </span>
                  </div>
                </div>
                <div className="in-auction-now-stats">
                  <div>
                    <div className="stat-tile-label">Tuo slot {selectedPlayer.role}</div>
                    <div className="stat-tile-value">
                      {managers.find((m) => m.manager.id === myManagerId)!.slotsRemaining[selectedPlayer.role]}
                    </div>
                  </div>
                </div>
              </section>

              <DecisionPanel key={selectedPlayer.id} state={state} playerId={selectedPlayer.id} mode="compact" onOpenFull={onOpenPrediction} />

              <section className="card who-gets-it-card">
                <p className="eyebrow">A chi va?</p>
                <div className="manager-grid">
                  {managers.map((m) => {
                    const full = m.slotsRemaining[selectedPlayer.role] === 0;
                    return (
                      <button
                        key={m.manager.id}
                        type="button"
                        disabled={full}
                        className={selectedManagerId === m.manager.id ? 'manager-button selected' : 'manager-button'}
                        onClick={() => setSelectedManagerId(m.manager.id)}
                      >
                        {m.manager.isMe ? 'Io' : m.manager.name}
                        <span className="credits">{full ? `slot ${selectedPlayer.role} pieni` : `${m.creditsRemaining} cr`}</span>
                      </button>
                    );
                  })}
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
                    Assegna
                  </button>
                  <button type="button" className="secondary-button" onClick={markUnsold}>
                    Nessuno l'ha preso
                  </button>
                </div>
              </section>
            </>
          )}

          {targetsQueue.length > 0 && (
            <section className="card queue-card">
              <div className="eyebrow-row">
                <span className="eyebrow">Coda — i prossimi dalla tua lista obiettivi</span>
              </div>
              <div className="queue-row">
                {targetsQueue.map(({ player, decision }) => (
                  <button key={player.id} type="button" className="queue-item" onClick={() => pickPlayer(player.id)}>
                    <div>
                      {player.name} <span className={`role-text-${player.role}`}>{player.role}</span>
                    </div>
                    <div className="dim mono small">
                      {state.scores[player.id]?.score?.toFixed(0) ?? '—'} · p̂ {decision ? formatNum(decision.expectedPrice) : '—'} · p*{' '}
                      {decision ? formatNum(decision.operationalMax) : '—'}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="desk-side">
          <div className="tab-switch">
            <button type="button" className={sidePanelTab === 'registro' ? 'active' : ''} onClick={() => setSidePanelTab('registro')}>
              Registro
            </button>
            <button
              type="button"
              className={sidePanelTab === 'non-acquistati' ? 'active' : ''}
              onClick={() => setSidePanelTab('non-acquistati')}
            >
              Non acquistati {unsoldCount > 0 && <span className="mono">{unsoldCount}</span>}
            </button>
          </div>

          {sidePanelTab === 'registro' && (
            <div className="registro-list">
              {recentSales.length === 0 && <p className="hint">Nessuna vendita registrata ancora.</p>}
              {recentSales.map((sale) => {
                const player = state.players[sale.playerId];
                const manager = managers.find((m) => m.manager.id === sale.managerId);
                if (!player || !manager) return null;
                const isCorrecting = correctingPlayerId === sale.playerId;
                return (
                  <div key={sale.playerId} className="registro-row">
                    <button type="button" className="registro-row-main" onClick={() => setCorrectingPlayerId(isCorrecting ? null : sale.playerId)}>
                      <div>
                        <span className={`role-tag role-${player.role}`}>{player.role}</span> {player.name}
                        <div className="dim small">→ {manager.manager.isMe ? 'Io' : manager.manager.name}</div>
                      </div>
                      <span className="mono strong">{sale.price}</span>
                    </button>
                    {isCorrecting && (
                      <CorrectSaleForm
                        playerId={sale.playerId}
                        currentManagerId={sale.managerId}
                        currentPrice={sale.price}
                        managers={managers}
                        role={player.role}
                        onClose={() => setCorrectingPlayerId(null)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {sidePanelTab === 'non-acquistati' && (
            <div className="registro-list">
              {unsoldCount === 0 && <p className="hint">Nessun giocatore rimasto senza acquirente.</p>}
              {unsoldCount > 0 && (
                <button type="button" className="secondary-button" onClick={requeueAllUnsold} style={{ marginBottom: '0.6rem' }}>
                  Rimetti tutti in asta
                </button>
              )}
              {state.unsold
                .slice()
                .reverse()
                .map((playerId) => {
                  const player = state.players[playerId];
                  if (!player) return null;
                  return (
                    <div key={playerId} className="registro-row">
                      <div className="registro-row-main">
                        <div>
                          <span className={`role-tag role-${player.role}`}>{player.role}</span> {player.name}
                        </div>
                        <button type="button" className="link-button" onClick={() => requeue(playerId)}>
                          Riproponi
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}

          <div className="progress-card">
            <div className="section-label">Avanzamento asta</div>
            <div className="progress-bar-track stacked">
              <div className="progress-bar-fill" style={{ width: `${totalPlayers > 0 ? (assigned / totalPlayers) * 100 : 0}%` }} />
              <div
                className="progress-bar-fill-warn"
                style={{ width: `${totalPlayers > 0 ? (unsoldCount / totalPlayers) * 100 : 0}%` }}
              />
            </div>
            <div className="progress-labels">
              <span>{assigned} assegnati</span>
              <span>{unsoldCount} liberi</span>
              <span>{remaining} da estrarre</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CorrectSaleForm({
  playerId,
  currentManagerId,
  currentPrice,
  managers,
  role,
  onClose,
}: {
  playerId: string;
  currentManagerId: string;
  currentPrice: number;
  managers: readonly ReturnType<typeof deriveManagerStates>[number][];
  role: string;
  onClose: () => void;
}) {
  const { dispatch, state } = useAuctionStore();
  const [managerId, setManagerId] = useState(currentManagerId);
  const [price, setPrice] = useState(String(currentPrice));

  function save() {
    const p = Number(price);
    if (!Number.isFinite(p) || p < (state.config?.minPrice ?? 1)) return;
    dispatch({ t: 'revert', playerId });
    dispatch({ t: 'sale', playerId, managerId, price: p });
    onClose();
  }

  function putBackInAuction() {
    dispatch({ t: 'revert', playerId });
    onClose();
  }

  return (
    <div className="correct-sale-form">
      <p className="hint">Succede: prezzo sbagliato, manager sbagliato, o l'asta è stata riaperta.</p>
      <div className="price-record-row">
        <select value={managerId} onChange={(e) => setManagerId(e.target.value)}>
          {managers.map((m) => (
            <option key={m.manager.id} value={m.manager.id} disabled={m.manager.id !== currentManagerId && m.slotsRemaining[role as never] === 0}>
              {m.manager.isMe ? 'Io' : m.manager.name}
            </option>
          ))}
        </select>
        <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
      </div>
      <div className="price-record-row">
        <button type="button" className="primary-button" onClick={save}>
          Salva correzione
        </button>
        <button type="button" className="secondary-button danger-text" onClick={putBackInAuction}>
          Rimetti in asta
        </button>
        <button type="button" className="secondary-button" onClick={onClose}>
          Annulla
        </button>
      </div>
    </div>
  );
}
