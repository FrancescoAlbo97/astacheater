// §11 / §12 F12 — Schermata "Prova a secco": gira N aste simulate sulla lista reale, mostra la
// rosa attesa per ruolo e la evidenzia se sbilanciata. Serve a tarare gli score prima dell'asta.
import { useState } from 'react';
import { useAuctionStore } from '../state/store.js';
import { runDryRun, type DryRunSummary } from '../../sim/dry-run.js';
import { ROLES } from '../../core/types.js';
import type { Role } from '../../core/types.js';

const ITERATIONS = 200;

const ROLE_BAR_COLOR: Record<Role, string> = {
  P: 'var(--role-p)',
  D: 'var(--role-d)',
  C: 'var(--role-c)',
  A: 'var(--role-a)',
};

export function DryRun() {
  const { state } = useAuctionStore();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState<DryRunSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sampleIndex, setSampleIndex] = useState(1); // default: "tipica (mediana)"

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
        Gira {ITERATIONS} aste simulate sulla tua lista reale (score assegnati finora: {scoredCount}) per mostrare che
        rosa aspettarsi e segnalare ruoli sbilanciati. Da usare prima dell'asta vera, sulla lista definitiva — lanciala
        due volte. Più score assegni, più il risultato è affidabile.
      </p>

      <button type="button" className="primary-button" onClick={start} disabled={running || scoredCount === 0}>
        {running ? `Simulazione in corso… ${Math.round(progress * 100)}%` : 'Avvia prova a secco'}
      </button>

      {scoredCount === 0 && <p className="hint">Assegna almeno qualche punteggio nella Lista giocatori prima di iniziare.</p>}
      {error && <p className="error-banner">{error}</p>}

      {summary && (
        <>
          <div className="dry-run-stat-grid">
            <div className="dry-run-stat-card accent">
              <div className="stat-label">Valore di stagione atteso</div>
              <div className="stat-value">{formatNum(summary.avgFinalValue)}</div>
              <div className="stat-meta">fantapunti medi su {summary.iterations} aste</div>
            </div>
            <div className="dry-run-stat-card">
              <div className="stat-label">Crediti spesi (media)</div>
              <div className="stat-value">{formatNum(summary.byRole.reduce((s, r) => s + r.avgCreditsSpent, 0))}</div>
              <div className="stat-meta">su {state.config.budget} crediti per manager</div>
            </div>
            <div className="dry-run-stat-card">
              <div className="stat-label">Slot riempiti (media)</div>
              <div className="stat-value">{summary.byRole.reduce((s, r) => s + r.avgSlotsFilled, 0).toFixed(1)}</div>
              <div className="stat-meta">
                su {ROLES.reduce((s, r) => s + state.config!.slots[r], 0)} totali
              </div>
            </div>
            <div
              className={`dry-run-stat-card ${summary.imbalancedRoles.length > 0 ? 'warn-card' : ''}`}
              title="Un ruolo è 'segnalato' se, in queste simulazioni, prendi sistematicamente i tuoi obiettivi più deboli in quel ruolo — confrontato con la TUA lista per quel ruolo, non con altri ruoli (che hanno naturalmente distribuzioni di score diverse, es. gli attaccanti)."
            >
              <div className="stat-label">Ruoli segnalati</div>
              <div className="stat-value">{summary.imbalancedRoles.length}</div>
              <div className="stat-meta">{summary.imbalancedRoles.join(', ') || 'nessuno'}</div>
            </div>
          </div>

          <section className="card">
            <h3>Rosa attesa per ruolo (media su {summary.iterations} aste)</h3>
            {summary.byRole.map((r) => {
              const imbalanced = summary.imbalancedRoles.includes(r.role);
              const totalSlotsForRole = state.config!.slots[r.role];
              return (
                <div key={r.role} className="role-bar-row">
                  <span className={`role-bar-tag role-text-${r.role}`}>
                    {imbalanced && '⚠ '}
                    {r.role}
                  </span>
                  <div className="role-bar-track">
                    <div
                      className="role-bar-fill"
                      style={{
                        width: `${Math.max(4, r.avgScoreOfAcquired)}%`,
                        background: ROLE_BAR_COLOR[r.role],
                      }}
                    >
                      score medio {r.avgScoreOfAcquired.toFixed(0)}
                    </div>
                  </div>
                  <div className="role-bar-meta">
                    <div className="role-bar-value">{r.avgCreditsSpent.toFixed(0)} cr</div>
                    <div className="role-bar-sub">
                      {r.avgSlotsFilled.toFixed(1)}/{totalSlotsForRole} slot
                    </div>
                  </div>
                </div>
              );
            })}
            {summary.imbalancedRoles.length > 0 && (
              <p className="scarcity-alert" style={{ marginTop: '0.6rem' }}>
                ⚠ Ruoli potenzialmente sbilanciati: {summary.imbalancedRoles.join(', ')}. In queste aste simulate perdi
                spesso i tuoi migliori obiettivi in questo ruolo (confrontati con la tua stessa lista per quel ruolo,
                non con gli altri ruoli — è normale che un attaccante abbia meno "fenomeni" assoluti di un
                centrocampista, non è di per sé un problema). Se un ruolo resta segnalato anche dopo aver ricontrollato
                gli score dei migliori candidati, è probabile che la tua lista sia oggettivamente più debole lì.
              </p>
            )}
          </section>

          {summary.sampleRosters.length > 0 && (
            <section className="card">
              <h3>Rose finali di esempio</h3>
              <p className="hint">
                Non solo medie: queste sono squadre REALMENTE formate nelle simulazioni, per farti vedere il ventaglio di
                esiti possibili, non solo il numero aggregato.
              </p>
              <div className="role-filter-pills" style={{ marginBottom: '0.8rem' }}>
                {summary.sampleRosters.map((s, i) => (
                  <button
                    key={s.label}
                    type="button"
                    className={i === sampleIndex ? 'role-filter-pill active role-ALL' : 'role-filter-pill'}
                    onClick={() => setSampleIndex(i)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              {summary.sampleRosters[sampleIndex] && (
                <>
                  <p className="hint">
                    valore finale {formatNum(summary.sampleRosters[sampleIndex]!.finalValue)} pt · spesi{' '}
                    {summary.sampleRosters[sampleIndex]!.totalSpent} crediti
                  </p>
                  <ul className="my-roster-list">
                    {summary.sampleRosters[sampleIndex]!.players.map((p) => (
                      <li key={p.id}>
                        <span>
                          <span className={`role-tag role-${p.role}`}>{p.role}</span> {p.name}{' '}
                          <span className="dim">({p.team}, score {p.score})</span>
                        </span>
                        <span className="roster-price">{p.price} cr</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}

          <section className="card">
            <h3>Obiettivi di fascia alta persi più spesso</h3>
            <ul className="my-roster-list">
              {ROLES.map((role) => {
                const r = summary.byRole.find((x) => x.role === role)!;
                return (
                  <li key={role}>
                    <span>
                      <span className={`role-tag role-${role}`}>{role}</span> score ≥ 70 mai acquisito
                    </span>
                    <span className="roster-price">{(r.highScoreMissRate * 100).toFixed(0)}%</span>
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

function formatNum(n: number): string {
  return Number.isFinite(n) ? Math.round(n).toLocaleString('it-IT') : '—';
}
