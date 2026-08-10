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
import type { Formation, LeagueConfig, Manager } from '../../core/types.js';

const ALL_FORMATIONS = DEFAULT_FORMATIONS;

function defaultNames(n: number): string[] {
  return Array.from({ length: n }, (_, i) => (i === 0 ? 'Io' : `Avversario ${i}`));
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

  return (
    <form className="screen setup-screen" onSubmit={handleSubmit}>
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
        <div className="manager-names">
          {names.map((name, i) => (
            <label key={i} className="manager-name-row">
              {i === 0 ? <strong>Io</strong> : `Manager ${i + 1}`}
              <input
                type="text"
                value={name}
                onChange={(e) =>
                  setNames((prev) => prev.map((n, idx) => (idx === i ? e.target.value : n)))
                }
              />
            </label>
          ))}
        </div>
      </section>

      <section className="card">
        <h3>Budget e slot</h3>
        <label>
          Budget iniziale (crediti)
          <input type="number" min={1} value={budget} onChange={(e) => setBudget(Number(e.target.value))} />
        </label>
        <div className="slot-inputs">
          {(['P', 'D', 'C', 'A'] as const).map((role) => (
            <label key={role}>
              Slot {role}
              <input
                type="number"
                min={0}
                value={slots[role]}
                onChange={(e) => setSlots((prev) => ({ ...prev, [role]: Number(e.target.value) }))}
              />
            </label>
          ))}
        </div>
        <p className="hint">
          Totale slot per rosa: {totalSlots} {totalSlots !== 25 && '(atteso 25 per il default di lega)'}
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
            <label key={f} className="formation-checkbox">
              <input type="checkbox" checked={formations.includes(f)} onChange={() => toggleFormation(f)} />
              {f}
            </label>
          ))}
        </div>
        <label>
          Modulo primario
          <select
            value={primaryFormation}
            onChange={(e) => setPrimaryFormation(e.target.value as Formation)}
          >
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
          <input
            type="range"
            min={-1}
            max={1}
            step={0.05}
            value={risk}
            onChange={(e) => setRisk(Number(e.target.value))}
          />
        </label>
        <p className="hint">
          Negativo = avversione al rischio (punta alla media), positivo = propensione (punta ai
          top). Default +0.15.
        </p>
      </section>

      <button type="submit" className="primary-button">
        {existing ? 'Aggiorna configurazione' : 'Crea lega e continua'}
      </button>
    </form>
  );
}
