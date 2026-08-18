// §11 / §12 F12 — Schermata "Prova a secco": gira N aste simulate sulla lista reale, mostra la
// rosa attesa per ruolo e la evidenzia se sbilanciata. Serve a tarare gli score prima dell'asta.
import { useState } from 'react';
import { useAuctionStore } from '../state/store.js';
import {
  buildSimulatedAuctionReport,
  runDryRun,
  type BudgetShareRow,
  type CreditsUnspentStats,
  type DryRunSummary,
  type ScorePricePoint,
  type SimulatedAuctionReport,
} from '../../sim/dry-run.js';
import { ROLES } from '../../core/types.js';
import type { Role } from '../../core/types.js';

const ITERATIONS = 200;

const ROLE_BAR_COLOR: Record<Role, string> = {
  P: 'var(--role-p)',
  D: 'var(--role-d)',
  C: 'var(--role-c)',
  A: 'var(--role-a)',
};

/** Scarto oltre il quale la spesa per ruolo si segnala come fuori quota (§9.5: banda ±8pp). */
const BUDGET_SHARE_TOLERANCE = 0.08;

function BudgetShareBars({ rows }: { rows: readonly BudgetShareRow[] }) {
  return (
    <div className="budget-share-bars">
      {rows.map((r) => {
        const offBand = Math.abs(r.actualShare - r.targetShare) > BUDGET_SHARE_TOLERANCE;
        return (
          <div key={r.role} className="role-bar-row">
            <span className={`role-bar-tag role-text-${r.role}`}>{offBand && '⚠ '}{r.role}</span>
            <div className="role-bar-track budget-share-track">
              <div
                className="role-bar-fill"
                style={{ width: `${Math.min(100, r.actualShare * 100)}%`, background: ROLE_BAR_COLOR[r.role] }}
              />
              <div
                className="budget-share-target-marker"
                style={{ left: `${Math.min(100, r.targetShare * 100)}%` }}
                title={`quota attesa: ${(r.targetShare * 100).toFixed(0)}%`}
              />
            </div>
            <div className="role-bar-meta">
              <div className={`role-bar-value ${offBand ? 'ceiling-low' : ''}`}>{(r.actualShare * 100).toFixed(0)}%</div>
              <div className="role-bar-sub">attesa {(r.targetShare * 100).toFixed(0)}%</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CreditsUnspentRange({ stats }: { stats: CreditsUnspentStats }) {
  const offBand = stats.median > 15;
  return (
    <div className={`dry-run-stat-card ${offBand ? 'warn-card' : ''}`}>
      <div className="stat-label">Crediti non spesi a fine asta (io)</div>
      <div className="stat-value">{stats.median.toFixed(0)}</div>
      <div className="stat-meta">
        mediana su {`p10 ${stats.p10.toFixed(0)} · media ${stats.mean.toFixed(0)} · p90 ${stats.p90.toFixed(0)}`} · atteso 0–15
      </div>
    </div>
  );
}

/** Campiona al massimo `cap` punti per ruolo, passo fisso (deterministico: niente Math.random). */
function samplePoints(points: readonly ScorePricePoint[], role: Role, cap: number): ScorePricePoint[] {
  const byRole = points.filter((p) => p.role === role);
  if (byRole.length <= cap) return byRole;
  const stride = byRole.length / cap;
  const out: ScorePricePoint[] = [];
  for (let i = 0; i < cap; i++) out.push(byRole[Math.floor(i * stride)]!);
  return out;
}

const SCATTER_W = 460;
const SCATTER_H = 220;
const SCATTER_PAD = { left: 34, right: 10, top: 10, bottom: 26 };

function ScorePriceScatter({ points }: { points: readonly ScorePricePoint[] }) {
  if (points.length === 0) return <p className="hint">Nessun acquisto registrato nelle simulazioni.</p>;
  const maxPrice = Math.max(10, ...points.map((p) => p.price));
  const plotW = SCATTER_W - SCATTER_PAD.left - SCATTER_PAD.right;
  const plotH = SCATTER_H - SCATTER_PAD.top - SCATTER_PAD.bottom;
  const x = (score: number) => SCATTER_PAD.left + (score / 100) * plotW;
  const y = (price: number) => SCATTER_PAD.top + plotH - (price / maxPrice) * plotH;

  const sampled = ROLES.flatMap((role) => samplePoints(points, role, 120));

  return (
    <figure>
      <svg
        viewBox={`0 0 ${SCATTER_W} ${SCATTER_H}`}
        role="img"
        aria-label="Punteggio assegnato vs prezzo pagato, per ruolo, sulle aste simulate"
        style={{ width: '100%', height: 'auto', maxWidth: `${SCATTER_W}px` }}
      >
        <line x1={SCATTER_PAD.left} y1={SCATTER_PAD.top} x2={SCATTER_PAD.left} y2={SCATTER_PAD.top + plotH} stroke="currentColor" opacity={0.3} />
        <line
          x1={SCATTER_PAD.left}
          y1={SCATTER_PAD.top + plotH}
          x2={SCATTER_PAD.left + plotW}
          y2={SCATTER_PAD.top + plotH}
          stroke="currentColor"
          opacity={0.3}
        />
        {[0, 50, 100].map((s) => (
          <text key={s} x={x(s)} y={SCATTER_H - 8} fontSize={9} textAnchor="middle" fill="currentColor" opacity={0.6}>
            {s}
          </text>
        ))}
        {[0, maxPrice].map((p) => (
          <text key={p} x={SCATTER_PAD.left - 6} y={y(p) + 3} fontSize={9} textAnchor="end" fill="currentColor" opacity={0.6}>
            {Math.round(p)}
          </text>
        ))}
        <text x={SCATTER_W / 2} y={SCATTER_H - 1} fontSize={9} textAnchor="middle" fill="currentColor" opacity={0.5}>
          punteggio
        </text>
        {sampled.map((p, i) => (
          <circle key={i} cx={x(p.score)} cy={y(p.price)} r={2.4} fill={ROLE_BAR_COLOR[p.role]} opacity={0.65} />
        ))}
      </svg>
      <figcaption className="hint">
        Punteggio assegnato vs prezzo pagato per i tuoi acquisti simulati (campione per leggibilità). Se non si vede una
        tendenza crescente per un ruolo, il modello di prezzo per quel ruolo potrebbe essere scalato male.
      </figcaption>
    </figure>
  );
}

function SimulatedAuctionAccuracyView({ simReport }: { simReport: SimulatedAuctionReport }) {
  const { report, firstHalf, secondHalf } = simReport;
  return (
    <>
      <h4 style={{ margin: '1rem 0 0.4rem' }}>Il motore esatto avrebbe seguito questa simulazione?</h4>
      <p className="hint">
        Stesso "Report asta" che vedi dopo un'asta vera, applicato a questa asta simulata: per ogni tuo acquisto,
        confronta cosa avresti visto sullo schermo un istante prima ("offri fino a") con quanto è stato effettivamente
        pagato nella simulazione. <b>Attenzione</b>: dentro la simulazione anche "io" decido con la policy approssimata
        del simulatore, non con questo calcolo esatto — questo report misura QUANTO le due cose divergono, non se il
        simulatore in assoluto è realistico (quello lo misura la Diagnostica sopra, su 200 aste).
      </p>
      <ul className="my-roster-list">
        <li>
          <span>Acquisti in overpay secondo il motore esatto</span>
          <span className="roster-price">
            {report.overpayCount} / {report.myPurchases.length} ({report.totalOverpaidCredits} crediti in più del consigliato)
          </span>
        </li>
        <li>
          <span>Occasioni mancate (giocatori affrontabili presi da altri)</span>
          <span className="roster-price">{report.missedOpportunities.length}</span>
        </li>
      </ul>
      <div className="table-scroll" style={{ marginTop: '0.6rem' }}>
        <table className="managers-table">
          <thead>
            <tr>
              <th></th>
              <th>Acquisti</th>
              <th>In overpay</th>
              <th>Crediti in più</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>1ª metà asta</td>
              <td>{firstHalf.purchaseCount}</td>
              <td>{firstHalf.overpayCount}</td>
              <td>{firstHalf.overpaidCredits}</td>
            </tr>
            <tr>
              <td>2ª metà asta</td>
              <td>{secondHalf.purchaseCount}</td>
              <td>{secondHalf.overpayCount}</td>
              <td>{secondHalf.overpaidCredits}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="hint">
        Se l'overpay è concentrato nella 2ª metà, il simulatore sta spingendo a comprare riempitivi che il motore
        esatto non consiglierebbe man mano che i crediti scarseggiano — un segnale utile per capire DOVE la
        simulazione si allontana dal consiglio dal vivo, non solo QUANTO in totale.
      </p>
    </>
  );
}

function SingleAuctionView({ simReport }: { simReport: SimulatedAuctionReport }) {
  const result = simReport.auction;
  return (
    <>
      <p className="hint">
        Valore finale <b>{formatNum(result.myFinalValue)}</b> pt · spesi <b>{result.myTotalSpent}</b> crediti ·{' '}
        {result.sales.length} vendite in questa asta, {result.unsold.length} rimasti senza acquirente.
      </p>
      <h4 style={{ margin: '0.8rem 0 0.4rem' }}>La tua rosa in questa asta</h4>
      <ul className="my-roster-list">
        {result.myRoster.map((p) => (
          <li key={p.id}>
            <span>
              <span className={`role-tag role-${p.role}`}>{p.role}</span> {p.name} <span className="dim">({p.team}, score {p.score})</span>
            </span>
            <span className="roster-price">{p.price} cr</span>
          </li>
        ))}
      </ul>
      <h4 style={{ margin: '1rem 0 0.4rem' }}>Tutte le vendite, in ordine di estrazione</h4>
      <div className="registro-list">
        {result.sales.map((s) => (
          <div key={s.playerId} className={s.isMe ? 'registro-row registro-row-me' : 'registro-row'}>
            <div className="registro-row-main">
              <div>
                <span className={`role-tag role-${s.role}`}>{s.role}</span> {s.name}
                <div className="dim small">→ {s.isMe ? 'Io' : s.managerName}</div>
              </div>
              <span className="mono strong">{s.price}</span>
            </div>
          </div>
        ))}
        {result.unsold.length > 0 && (
          <div className="registro-row">
            <div className="registro-row-main">
              <div className="dim">{result.unsold.length} giocatori rimasti senza acquirente (slot altrui esauriti)</div>
            </div>
          </div>
        )}
      </div>
      <SimulatedAuctionAccuracyView simReport={simReport} />
    </>
  );
}

export function DryRun() {
  const { state } = useAuctionStore();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState<DryRunSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sampleIndex, setSampleIndex] = useState(1); // default: "tipica (mediana)"
  const [singleAuction, setSingleAuction] = useState<SimulatedAuctionReport | null>(null);
  const [singleAuctionSeedOffset, setSingleAuctionSeedOffset] = useState(0);
  const [singleAuctionError, setSingleAuctionError] = useState<string | null>(null);

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

  function generateSingleAuction() {
    setSingleAuctionError(null);
    try {
      // Contatore crescente, non Date.now()/Math.random() (§13.10): ogni clic dà un'asta diversa,
      // resta comunque riproducibile.
      const seed = 90_000 + singleAuctionSeedOffset;
      const report = buildSimulatedAuctionReport(state, seed);
      if (!report) throw new Error('lega non configurata correttamente');
      setSingleAuction(report);
      setSingleAuctionSeedOffset((n) => n + 1);
    } catch (err) {
      setSingleAuctionError(err instanceof Error ? err.message : "Errore durante la generazione dell'asta di esempio.");
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
            <h3>Diagnostica</h3>
            <p className="hint">
              Non solo "che rosa aspettarti", ma "quanto fidarsi di questi numeri": confronta la simulazione con i
              parametri che dovrebbe rispettare (§9.5), sulla TUA lista reale invece che su un benchmark sintetico.
            </p>
            <div className="dry-run-stat-grid" style={{ marginBottom: '1rem' }}>
              <CreditsUnspentRange stats={summary.creditsUnspent} />
              {summary.targetAcquisition && (
                <div className={`dry-run-stat-card ${summary.targetAcquisition.rate < 0.3 ? 'warn-card' : ''}`}>
                  <div className="stat-label">Obiettivi ★ acquisiti (media)</div>
                  <div className="stat-value">{(summary.targetAcquisition.rate * 100).toFixed(0)}%</div>
                  <div className="stat-meta">
                    {summary.targetAcquisition.avgAcquired.toFixed(1)} di {summary.targetAcquisition.totalTargets} obiettivi · atteso 30–50%
                  </div>
                </div>
              )}
            </div>
            {!summary.targetAcquisition && (
              <p className="hint">
                Segna qualche obiettivo con ★ in Pool giocatori prima di rilanciare la prova a secco, per vedere quanti
                ne prendi davvero in queste simulazioni.
              </p>
            )}
            <h4 style={{ marginBottom: '0.4rem' }}>Spesa per ruolo: reale vs quota attesa dal modello di prezzo</h4>
            <BudgetShareBars rows={summary.budgetShareByRole} />
            <h4 style={{ margin: '1rem 0 0.4rem' }}>Punteggio vs prezzo pagato</h4>
            <ScorePriceScatter points={summary.scoreVsPrice} />
          </section>

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

      <section className="card">
        <h3>Guarda un'asta simulata per intero</h3>
        <p className="hint">
          Non una media su 200 aste, ma UNA asta plausibile vista giocata per giocata: chi ha preso cosa, quando, per
          quanto — con la stessa macchina esatta della Prova a secco (stesso jitter dai tuoi punteggi, stesso mix di
          avversari, la tua configurazione personalizzata). Utile per farsi un'idea concreta di come si potrebbe
          svolgere, non solo vedere numeri aggregati.
        </p>
        <button type="button" className="secondary-button" onClick={generateSingleAuction} disabled={scoredCount === 0}>
          {singleAuction ? "Genera un'altra asta di esempio" : 'Genera un\'asta di esempio'}
        </button>
        {singleAuctionError && <p className="error-banner">{singleAuctionError}</p>}
        {singleAuction && <SingleAuctionView simReport={singleAuction} />}
      </section>
    </div>
  );
}

function formatNum(n: number): string {
  return Number.isFinite(n) ? Math.round(n).toLocaleString('it-IT') : '—';
}
