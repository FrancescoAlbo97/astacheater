// §11 / §12 F12 — Schermata "Prova a secco": gira N aste simulate sulla lista reale, mostra la
// rosa attesa per ruolo e la evidenzia se sbilanciata. Serve a tarare gli score prima dell'asta.
import { useState } from 'react';
import { useAuctionStore } from '../state/store.js';
import { runDryRun, type DryRunSummary } from '../../sim/dry-run.js';
import { ROLES } from '../../core/types.js';

const ITERATIONS = 200;

export function DryRun() {
  const { state } = useAuctionStore();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState<DryRunSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scoredCount = Object.keys(state.scores).length;

  async function start() {
    setRunning(true);
    setError(null);
    setSummary(null);
    setProgress(0);
    try {
      const result = await runDryRun(state, ITERATIONS, (p) => setProgress(p.done / p.total));
      setSummary(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore durante la prova a secco.');
    } finally {
      setRunning(false);
    }
  }

  if (!state.config) {
    return <p className="placeholder">Configura prima la lega (schermata Setup).</p>;
  }

  return (
    <div className="screen dry-run-screen">
      <h2>Prova a secco</h2>
      <p className="hint">
        Gira {ITERATIONS} aste simulate sulla tua lista reale (score assegnati finora: {scoredCount}) per
        mostrare che rosa aspettarsi e segnalare ruoli sbilanciati. Più score assegni, più il
        risultato è affidabile.
      </p>

      <button type="button" className="primary-button" onClick={start} disabled={running || scoredCount === 0}>
        {running ? `Simulazione in corso… ${Math.round(progress * 100)}%` : 'Avvia prova a secco'}
      </button>

      {scoredCount === 0 && <p className="hint">Assegna almeno qualche punteggio nella Lista giocatori prima di iniziare.</p>}
      {error && <p className="error-banner">{error}</p>}

      {summary && (
        <>
          <section className="card">
            <h3>Rosa attesa per ruolo (media su {summary.iterations} aste)</h3>
            <table className="opponents-table">
              <thead>
                <tr>
                  <th>Ruolo</th>
                  <th>Slot riempiti</th>
                  <th>Crediti spesi</th>
                  <th>Score medio acquisito</th>
                </tr>
              </thead>
              <tbody>
                {summary.byRole.map((r) => (
                  <tr key={r.role} className={summary.imbalancedRoles.includes(r.role) ? 'imbalanced-row' : ''}>
                    <td>
                      {r.role} {summary.imbalancedRoles.includes(r.role) && '⚠'}
                    </td>
                    <td>{r.avgSlotsFilled.toFixed(1)}</td>
                    <td>{r.avgCreditsSpent.toFixed(0)}</td>
                    <td>{r.avgScoreOfAcquired.toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {summary.imbalancedRoles.length > 0 && (
            <section className="card">
              <p className="scarcity-alert">
                ⚠ Ruoli potenzialmente sbilanciati: {summary.imbalancedRoles.join(', ')}. In queste
                aste simulate perdi spesso i tuoi obiettivi migliori in questo ruolo, oppure lo
                score medio dei giocatori acquisiti è molto più basso che negli altri ruoli:
                valuta se alzare gli score dei migliori candidati o se la lista è oggettivamente
                più debole lì rispetto agli altri ruoli.
              </p>
            </section>
          )}

          <section className="card">
            <h3>Valore atteso di stagione della rosa</h3>
            <p className="big-number">{Math.round(summary.avgFinalValue)} pt</p>
            <p className="hint">
              Media, su {summary.iterations} aste simulate, del valore stagionale della rosa finale
              (verità di riferimento §6.2, non il surrogato).
            </p>
          </section>

          <section className="card">
            <h3>Dettaglio per ruolo</h3>
            <ul className="my-roster-list">
              {ROLES.map((role) => {
                const r = summary.byRole.find((x) => x.role === role)!;
                return (
                  <li key={role}>
                    {role}: {(r.highScoreMissRate * 100).toFixed(0)}% delle aste senza nessun
                    giocatore di fascia alta (score ≥ 70) acquisito in questo ruolo
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
