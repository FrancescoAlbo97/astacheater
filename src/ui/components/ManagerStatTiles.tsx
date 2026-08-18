// Riga di 4 statistiche di un manager (crediti/slot/tetto/cr per slot), usata dalla tabella e dal
// dettaglio di "Fantallenatori" — stesso identico set di numeri in due punti, un solo posto.
import { maxSingleBid, totalSlotsRemaining } from '../../core/ceiling.js';
import type { ManagerState } from '../../core/types.js';

export function ManagerStatTiles({ manager }: { manager: ManagerState }) {
  const slots = totalSlotsRemaining(manager);
  const ceiling = maxSingleBid(manager);
  const crPerSlot = slots > 0 ? manager.creditsRemaining / slots : 0;
  return (
    <div className="manager-stat-tiles">
      <div className="stat-tile">
        <div className="stat-tile-label">Crediti residui</div>
        <div className="stat-tile-value">{manager.creditsRemaining}</div>
      </div>
      <div className="stat-tile">
        <div className="stat-tile-label">Slot da riempire</div>
        <div className="stat-tile-value">{slots}</div>
      </div>
      <div className="stat-tile tile-ceiling">
        <div className="stat-tile-label">Tetto su un giocatore</div>
        <div className="stat-tile-value">{ceiling}</div>
      </div>
      <div className="stat-tile">
        <div className="stat-tile-label">Cr per slot restante</div>
        <div className="stat-tile-value">{crPerSlot.toFixed(1)}</div>
      </div>
    </div>
  );
}
