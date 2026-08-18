// Barra di ricerca giocatore, condivisa fra Banco d'asta e Predizione (prima duplicata in Asta
// soltanto, ora serve in due schermate: un solo posto dove tenerla).
import { useMemo, useState } from 'react';
import type { Player } from '../../core/types.js';

export interface PlayerSearchBoxProps {
  readonly pool: readonly Player[];
  readonly placeholder?: string;
  readonly onPick: (playerId: string) => void;
  readonly autoFocus?: boolean;
}

export function PlayerSearchBox({ pool, placeholder, onPick, autoFocus }: PlayerSearchBoxProps) {
  const [search, setSearch] = useState('');

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return pool.filter((p) => p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q)).slice(0, 8);
  }, [search, pool]);

  return (
    <section className="card player-search">
      <input
        type="search"
        autoFocus={autoFocus}
        placeholder={placeholder ?? 'Cerca giocatore…'}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {results.length > 0 && (
        <ul className="search-results">
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(p.id);
                  setSearch('');
                }}
              >
                <span className={`role-tag role-${p.role}`}>{p.role}</span> {p.name} <span className="dim">({p.team})</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
