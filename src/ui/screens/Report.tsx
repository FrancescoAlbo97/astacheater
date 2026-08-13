// Report asta: risponde alla domanda "questo meccanismo mi sta davvero aiutando?" rigiocando la
// TUA asta reale (già giocata, o in corso) e confrontando ogni vendita con quello che il motore
// diceva un istante prima. A differenza della Prova a secco (che stima una rosa attesa su tante
// aste ipotetiche), qui non c'è nessuna simulazione: solo i fatti del tuo log.
import { useState } from 'react';
import { useAuctionStore } from '../state/store.js';
import { buildPostAuctionReport, type PostAuctionReport } from '../../sim/post-auction-report.js';

function formatNum(n: number): string {
  return Number.isFinite(n) ? Math.round(n).toLocaleString('it-IT') : '—';
}

// In un'asta quasi finita con 10 manager le "occasioni mancate" possono facilmente superare il
// centinaio (trovato testando con le fixture di scripts/make-fixtures.ts, non solo un'ipotesi):
// un elenco così lungo non aiuta a rivedere le proprie decisioni, diventa solo scorrimento. Si
// mostrano i migliori per score — i giocatori forti persi contano più di un tappabuchi economico
// che comunque non avresti inseguito.
const MAX_MISSED_OPPORTUNITIES_SHOWN = 15;

export function Report() {
  const { state } = useAuctionStore();
  const [report, setReport] = useState<PostAuctionReport | null>(null);
  const [generating, setGenerating] = useState(false);

  if (!state.config) {
    return <p className="placeholder">Configura prima la lega (schermata Setup).</p>;
  }

  const hasSales = state.sales.length > 0;

  async function generate() {
    setGenerating(true);
    // Un tick per lasciar comparire "generazione in corso…" prima del calcolo sincrono pesante
    // (rigioca l'intero log, §6.6 per ogni vendita — pochi secondi su un'asta completa).
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      setReport(buildPostAuctionReport(state));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="screen report-screen">
      <h2>Report asta</h2>
      <p className="hint">
        Rigioca la tua asta (anche se ancora in corso) e confronta ogni tuo acquisto con quello che il motore
        consigliava un istante prima di comprarlo — per capire se il meccanismo ti sta davvero aiutando, non solo se
        "sembra funzionare". Non è una simulazione: sono i fatti del tuo log.
      </p>

      <button type="button" className="primary-button" onClick={generate} disabled={generating || !hasSales}>
        {generating ? 'Generazione in corso…' : 'Genera report'}
      </button>
      {!hasSales && <p className="hint">Registra almeno una vendita nella schermata Asta prima di generare il report.</p>}

      {report && (
        <>
          <div className="dry-run-stat-grid">
            <div className="dry-run-stat-card accent">
              <div className="stat-label">Valore di stagione atteso</div>
              <div className="stat-value">{formatNum(report.finalRosterValue)}</div>
              <div className="stat-meta">fantapunti attesi dalla tua rosa reale</div>
            </div>
            <div className="dry-run-stat-card">
              <div className="stat-label">Crediti spesi</div>
              <div className="stat-value">{formatNum(report.totalSpent)}</div>
              <div className="stat-meta">su {state.config.budget} per manager · {report.myPurchases.length} acquisti</div>
            </div>
            <div className={`dry-run-stat-card ${report.overpayCount > 0 ? 'warn-card' : ''}`}>
              <div className="stat-label">Volte sopra il tuo tetto</div>
              <div className="stat-value">{report.overpayCount}</div>
              <div className="stat-meta">
                {report.totalOverpaidCredits > 0
                  ? `${formatNum(report.totalOverpaidCredits)} crediti oltre "offri fino a" in totale`
                  : 'mai superato il tuo massimo calcolato'}
              </div>
            </div>
            <div className={`dry-run-stat-card ${report.missedOpportunities.length > 0 ? 'warn-card' : ''}`}>
              <div className="stat-label">Occasioni mancate</div>
              <div className="stat-value">{report.missedOpportunities.length}</div>
              <div className="stat-meta">giocatori che potevi permetterti, presi da avversari</div>
            </div>
          </div>

          <section className="card">
            <h3>I tuoi acquisti</h3>
            <p className="hint">
              Per ognuno: prezzo pagato, "offri fino a" e "prezzo atteso" calcolati dal motore un istante prima di
              quella vendita (con lo stato di allora, non quello di adesso).
            </p>
            <ul className="my-roster-list">
              {report.myPurchases.map((p) => (
                <li key={p.playerId}>
                  <span>
                    <span className={`role-tag role-${p.role}`}>{p.role}</span> {p.playerName}{' '}
                    <span className="dim">
                      ({p.team}) · tetto {formatNum(p.operationalMaxAtTime)} · atteso {formatNum(p.expectedPriceAtTime)}
                    </span>
                  </span>
                  <span className="roster-price">
                    {p.price} cr{p.overpaidBy > 0 && <span className="overpaid-amount"> (+{formatNum(p.overpaidBy)})</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {report.missedOpportunities.length > 0 && (
            <section className="card">
              <h3>Occasioni mancate</h3>
              <p className="hint">
                Giocatori finiti a un avversario a un prezzo che, secondo il tuo modello in quel momento, potevi
                permetterti senza peggiorare la rosa finale. Non significa che avresti dovuto vincerli per forza (magari
                stavi seguendo un altro obiettivo in quell'istante) — è un elenco da rivedere, non un verdetto.
                {report.missedOpportunities.length > MAX_MISSED_OPPORTUNITIES_SHOWN &&
                  ` Mostrate le ${MAX_MISSED_OPPORTUNITIES_SHOWN} con lo score più alto per te, su ${report.missedOpportunities.length} totali.`}
              </p>
              <ul className="my-roster-list">
                {report.missedOpportunities
                  .slice()
                  .sort((a, b) => b.myScore - a.myScore)
                  .slice(0, MAX_MISSED_OPPORTUNITIES_SHOWN)
                  .map((m) => (
                    <li key={m.playerId}>
                      <span>
                        <span className={`role-tag role-${m.role}`}>{m.role}</span> {m.playerName}{' '}
                        <span className="dim">
                          ({m.team}, tuo score {m.myScore.toFixed(0)}) · preso da {m.wonByManagerName} a {m.price} · il
                          tuo tetto era {formatNum(m.myOperationalMaxAtTime)}
                        </span>
                      </span>
                    </li>
                  ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
