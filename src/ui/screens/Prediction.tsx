// §11 "Predizione": l'analisi completa per un giocatore, con calma — la versione compatta vive nel
// Banco d'asta per non rallentare la registrazione durante l'asta vera, questa è quella estesa
// (perché questo numero, alternative, allarme scarsità), raggiungibile anche direttamente da qui
// tramite ricerca, senza dover passare dal Banco d'asta.
import { useAuctionStore } from '../state/store.js';
import { getPool } from '../../core/state.js';
import { DecisionPanel } from '../components/DecisionPanel.js';
import { PlayerSearchBox } from '../components/PlayerSearchBox.js';

export function Prediction() {
  const { state, activePlayerId, setActivePlayerId } = useAuctionStore();
  const pool = getPool(state);
  const player = activePlayerId ? state.players[activePlayerId] : null;

  if (!state.config) {
    return <p className="placeholder">Configura prima la lega (schermata Setup).</p>;
  }

  return (
    <div className="screen prediction-screen">
      <h2>Predizione</h2>
      <PlayerSearchBox pool={pool} placeholder="Cerca un giocatore da analizzare…" onPick={setActivePlayerId} />

      {!player && <p className="placeholder">Cerca un giocatore, oppure selezionane uno dal Banco d'asta.</p>}

      {player && (
        <div className="prediction-grid" key={player.id}>
          <DecisionPanel state={state} playerId={player.id} mode="full" />
        </div>
      )}
    </div>
  );
}
