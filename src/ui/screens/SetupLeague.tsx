// §11 — Schermata "Setup lega": manager, budget, slot, moduli, rischio.
import { useState } from 'react';
import { useAuctionStore } from '../state/store.js';
import {
  DEFAULT_BUDGET,
  DEFAULT_FORMATIONS,
  DEFAULT_MIN_PRICE,
  DEFAULT_NUM_MANAGERS,
  DEFAULT_PRIMARY_FORMATION,
  DEFAULT_RISK,
  DEFAULT_SLOTS,
} from '../../core/config.js';
import { ROLES } from '../../core/types.js';
import type { Formation, LeagueConfig, Manager, Role } from '../../core/types.js';

const ALL_FORMATIONS = DEFAULT_FORMATIONS;

function defaultNames(n: number): string[] {
  return Array.from({ length: n }, (_, i) => (i === 0 ? 'Io' : `Avversario ${i}`));
}

function ChecklistItem({
  state,
  title,
  desc,
}: {
  state: 'done' | 'warn' | 'todo';
  title: string;
  desc: string;
}) {
  const mark = state === 'done' ? '✓' : state === 'warn' ? '!' : '';
  return (
    <div className="checklist-item">
      <span className={`checklist-badge ${state}`}>{mark}</span>
      <div>
        <div className="checklist-title">{title}</div>
        <div className="checklist-desc">{desc}</div>
      </div>
    </div>
  );
}

export function SetupLeague({ onDone }: { onDone: () => void }) {
  const { state, dispatch } = useAuctionStore();
  const existing = state.config;

  const [numManagers, setNumManagers] = useState(existing?.managers.length ?? DEFAULT_NUM_MANAGERS);
  const [names, setNames] = useState<string[]>(existing?.managers.map((m) => m.name) ?? defaultNames(DEFAULT_NUM_MANAGERS));
  const [budget, setBudget] = useState(existing?.budget ?? DEFAULT_BUDGET);
  const [slots, setSlots] = useState(existing?.slots ?? DEFAULT_SLOTS);
  const [formations, setFormations] = useState<Formation[]>(existing?.formations.slice() ?? ALL_FORMATIONS.slice());
  const [primaryFormation, setPrimaryFormation] = useState<Formation>(existing?.primaryFormation ?? DEFAULT_PRIMARY_FORMATION);
  const [minPrice, setMinPrice] = useState(existing?.minPrice ?? DEFAULT_MIN_PRICE);
  const [risk, setRisk] = useState(existing?.risk ?? DEFAULT_RISK);

  function updateNumManagers(n: number) {
    const clamped = Math.max(2, Math.min(20, n));
    setNumManagers(clamped);
    setNames((prev) => {
      const next = prev.slice(0, clamped);
      while (next.length < clamped) next.push(`Avversario ${next.length}`);
      return next;
    });
  }

  function toggleFormation(f: Formation) {
    setFormations((prev) => {
      if (prev.includes(f)) {
        if (f === primaryFormation) return prev; // il modulo primario resta sempre ammesso
        return prev.filter((x) => x !== f);
      }
      return [...prev, f];
    });
  }

  const totalSlots = slots.P + slots.D + slots.C + slots.A;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const managers: Manager[] = names.map((name, i) => ({
      id: i === 0 ? 'me' : `m${i}`,
      name: name.trim() || (i === 0 ? 'Io' : `Avversario ${i}`),
      isMe: i === 0,
    }));
    const config: LeagueConfig = {
      managers,
      budget,
      slots,
      formations,
      primaryFormation,
      minPrice,
      risk,
    };
    dispatch({ t: 'league.setup', config });
    onDone();
  }

  const playerCount = Object.keys(state.players).length;
  const scoredCount = Object.keys(state.scores).length;

  return (
    <div className="setup-layout">
      <form className="screen setup-screen setup-main" onSubmit={handleSubmit}>
        <h2>Setup lega</h2>

        <section className="card">
          <h3>Manager</h3>
          <label>
            Numero di partecipanti
            <input
              type="number"
              min={2}
              max={20}
              value={numManagers}
              onChange={(e) => updateNumManagers(Number(e.target.value))}
            />
          </label>
          <div className="manager-grid-setup">
            {names.map((name, i) => (
              <div key={i} className={i === 0 ? 'manager-tile me' : 'manager-tile'}>
                <span className="manager-slot-label">{i === 0 ? 'Io' : `Manager ${i + 1}`}</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setNames((prev) => prev.map((n, idx) => (idx === i ? e.target.value : n)))}
                />
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <h3>Budget e slot</h3>
          <label>
            Budget iniziale (crediti)
            <input type="number" min={1} value={budget} onChange={(e) => setBudget(Number(e.target.value))} />
          </label>
          <div className="slot-tiles">
            {ROLES.map((role) => (
              <div key={role} className="slot-tile">
                <span className={`role-label role-text-${role}`}>{role}</span>
                <input
                  type="number"
                  min={0}
                  value={slots[role]}
                  onChange={(e) => setSlots((prev) => ({ ...prev, [role]: Number(e.target.value) }))}
                />
              </div>
            ))}
          </div>
          <p className="hint">
            Totale slot per rosa: {totalSlots} {totalSlots !== 25 && '(atteso 25 per il default di lega)'} · budget totale di
            lega {budget * numManagers} crediti
          </p>
          <label>
            Prezzo minimo
            <input type="number" min={1} value={minPrice} onChange={(e) => setMinPrice(Number(e.target.value))} />
          </label>
        </section>

        <section className="card">
          <h3>Moduli ammessi</h3>
          <div className="formation-list">
            {ALL_FORMATIONS.map((f) => (
              <label
                key={f}
                className={
                  'formation-pill' +
                  (formations.includes(f) ? ' checked' : '') +
                  (f === primaryFormation ? ' primary' : '')
                }
              >
                <input type="checkbox" checked={formations.includes(f)} onChange={() => toggleFormation(f)} />
                {f}
              </label>
            ))}
          </div>
          <label>
            Modulo primario
            <select value={primaryFormation} onChange={(e) => setPrimaryFormation(e.target.value as Formation)}>
              {formations.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="card">
          <h3>Rischio</h3>
          <label>
            Propensione al rischio: {risk.toFixed(2)}
          </label>
          <div className="risk-slider-wrap">
            <input
              type="range"
              min={-1}
              max={1}
              step={0.05}
              value={risk}
              onChange={(e) => setRisk(Number(e.target.value))}
            />
            <div className="risk-scale-labels">
              <span>−1 rosa più sicura in media</span>
              <span>0</span>
              <span>+1 più varianza</span>
            </div>
          </div>
          <p className="hint">
            Negativo = avversione al rischio (punta alla media), positivo = propensione (punta ai top). Default +0.15.
          </p>
        </section>

        <button type="submit" className="primary-button">
          {existing ? 'Aggiorna configurazione' : 'Crea lega e continua'}
        </button>
      </form>

      <aside className="checklist-sidebar">
        <p className="eyebrow">Checklist prima dell'asta vera</p>

        <ChecklistItem
          state={existing ? 'done' : 'todo'}
          title="Setup completo"
          desc={existing ? `${existing.managers.length} manager · ${existing.budget} cr · ${totalSlots} slot` : 'compila e salva il form a sinistra'}
        />
        <ChecklistItem
          state={playerCount > 0 ? 'warn' : 'todo'}
          title="Aggiorna il listone"
          desc={
            playerCount > 0
              ? `${playerCount} giocatori in lista — verifica che sia aggiornato a ridosso della tua asta (importa un CSV nome,ruolo,squadra)`
              : 'carica il listone dalla schermata Lista giocatori'
          }
        />
        <ChecklistItem
          state={scoredCount === 0 ? 'todo' : scoredCount >= playerCount * 0.3 ? 'done' : 'warn'}
          title={`Punteggi: ${scoredCount}/${playerCount || '—'}`}
          desc="bastano i primi 40–50 per ruolo per avere numeri affidabili"
        />
        <ChecklistItem state="todo" title="Prova a secco ×2" desc="sulla lista definitiva, poco prima dell'asta" />
        <ChecklistItem state="todo" title="Verifica un export JSON" desc="per saperlo fare sotto pressione durante l'asta vera" />
        <ChecklistItem state="todo" title="Ricalibra i prezzi (opzionale)" desc="npx tsx src/sim/cli.ts calibrate 500 8" />

        <div className="checklist-note">
          <strong>Backup:</strong> lo stato si salva da solo nel browser ad ogni azione, ma non basta (memoria piena, modalità
          privata, chiusura accidentale). Esporta un JSON ogni tanto durante l'asta: è l'unica garanzia certa.
        </div>
        <div className="checklist-note limits">
          <strong>Limiti noti:</strong> il modello di valore-rosa spiega l'84% della variabilità (contro il 97% auspicato) —
          i numeri assoluti sono buone stime, non verità al fantapunto. Il simulatore interno per l'auto-taratura lascia
          troppi crediti inutilizzati agli avversari sintetici: non riguarda i calcoli esatti che vedi in asta (tetto
          avversari, p*).
        </div>
      </aside>
    </div>
  );
}
