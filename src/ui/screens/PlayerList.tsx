// §11 — Schermata "Lista giocatori": listone, filtri, punteggi, import CSV, aggiunta manuale.
import { useMemo, useRef, useState } from 'react';
import { useAuctionStore } from '../state/store.js';
import listoneData from '../../../data/listone.json';
import { ROLES } from '../../core/types.js';
import type { Player, Role } from '../../core/types.js';

const LISTONE_PLAYERS = listoneData.players as readonly Player[];

const COMBINING_DIACRITICS = new RegExp('[̀-ͯ]', 'g');

function normalizeForMatch(name: string): string {
  return name
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function slugify(name: string, team: string): string {
  return `${normalizeForMatch(team)}-${normalizeForMatch(name)}`;
}

interface CsvRow {
  readonly name: string;
  readonly role: Role;
  readonly team: string;
  readonly score?: number;
  readonly ptOverride?: number;
}

const CSV_TEMPLATE = [
  'nome,ruolo,squadra,punteggio,titolarita',
  'Esempio Portiere,P,Esempio FC,72,',
  'Esempio Difensore,D,Esempio FC,68,0.82',
  'Esempio Centrocampista,C,Esempio FC,75,',
  'Esempio Attaccante,A,Esempio FC,80,',
].join('\n');

function parseCsv(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const out: CsvRow[] = [];
  for (const line of lines) {
    const parts = line.split(',').map((p) => p.trim());
    if (parts.length < 3) continue;
    const [name, roleRaw, team, scoreRaw, ptRaw] = parts;
    const role = (roleRaw ?? '').toUpperCase();
    if (!name || !team || !ROLES.includes(role as Role)) continue;
    const row: { -readonly [K in keyof CsvRow]: CsvRow[K] } = { name, role: role as Role, team };
    if (scoreRaw) {
      const score = Number(scoreRaw);
      if (Number.isFinite(score)) row.score = Math.max(0, Math.min(100, score));
    }
    if (ptRaw) {
      const pt = Number(ptRaw);
      if (Number.isFinite(pt)) row.ptOverride = Math.max(0, Math.min(1, pt));
    }
    out.push(row);
  }
  return out;
}

export function PlayerList() {
  const { state, dispatch } = useAuctionStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [roleFilter, setRoleFilter] = useState<Role | 'ALL'>('ALL');
  const [teamFilter, setTeamFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [showUnscoredOnly, setShowUnscoredOnly] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualTeam, setManualTeam] = useState('');
  const [manualRole, setManualRole] = useState<Role>('C');
  const [importMessage, setImportMessage] = useState<string | null>(null);

  const players = useMemo(() => Object.values(state.players), [state.players]);

  function loadDefaultListone() {
    dispatch({ t: 'players.load', players: LISTONE_PLAYERS });
  }

  const teams = useMemo(() => Array.from(new Set(players.map((p) => p.team))).sort(), [players]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return players
      .filter((p) => roleFilter === 'ALL' || p.role === roleFilter)
      .filter((p) => teamFilter === 'ALL' || p.team === teamFilter)
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q))
      .filter((p) => !showUnscoredOnly || state.scores[p.id]?.score === undefined)
      .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));
  }, [players, roleFilter, teamFilter, search, showUnscoredOnly, state.scores]);

  const countsByRole = useMemo(() => {
    const counts: Record<Role, { total: number; scored: number }> = {
      P: { total: 0, scored: 0 },
      D: { total: 0, scored: 0 },
      C: { total: 0, scored: 0 },
      A: { total: 0, scored: 0 },
    };
    for (const p of players) {
      counts[p.role].total++;
      if (state.scores[p.id]?.score !== undefined) counts[p.role].scored++;
    }
    return counts;
  }, [players, state.scores]);

  function setScore(playerId: string, score: number) {
    const clamped = Math.max(0, Math.min(100, score));
    dispatch({ t: 'player.score', playerId, score: clamped, ptOverride: state.scores[playerId]?.ptOverride ?? undefined });
  }

  function setPtOverride(playerId: string, value: number | null) {
    const current = state.scores[playerId];
    if (current === undefined) return;
    dispatch({
      t: 'player.score',
      playerId,
      score: current.score,
      ...(value !== null ? { ptOverride: value } : {}),
    });
  }

  function handleManualAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!manualName.trim() || !manualTeam.trim()) return;
    const id = slugify(manualName, manualTeam);
    dispatch({
      t: 'players.load',
      players: [{ id, name: manualName.trim(), team: manualTeam.trim(), role: manualRole }],
    });
    setManualName('');
    setManualTeam('');
  }

  function handleCsvFile(file: File) {
    file
      .text()
      .then((text) => {
        const rows = parseCsv(text);
        const existingByNormalizedName = new Map(players.map((p) => [normalizeForMatch(p.name), p]));
        const idByRow = new Map<CsvRow, string>();
        const toLoad: Player[] = rows.map((row) => {
          const existing = existingByNormalizedName.get(normalizeForMatch(row.name));
          const id = existing?.id ?? slugify(row.name, row.team);
          idByRow.set(row, id);
          return { id, name: row.name, team: row.team, role: row.role };
        });
        dispatch({ t: 'players.load', players: toLoad });

        let scoredCountFromCsv = 0;
        for (const row of rows) {
          if (row.score === undefined) continue;
          const playerId = idByRow.get(row)!;
          dispatch({ t: 'player.score', playerId, score: row.score, ...(row.ptOverride !== undefined ? { ptOverride: row.ptOverride } : {}) });
          scoredCountFromCsv++;
        }

        setImportMessage(
          `Importati/aggiornati ${toLoad.length} giocatori` +
            (scoredCountFromCsv > 0 ? `, di cui ${scoredCountFromCsv} con punteggio dal CSV` : '') +
            ' (punteggi già assegnati in precedenza restano preservati se non sovrascritti).',
        );
      })
      .catch(() => setImportMessage('Errore nella lettura del file CSV.'));
  }

  function downloadCsvTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fantasta-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  if (players.length === 0) {
    return (
      <div className="onboarding-hero">
        <p className="eyebrow">Primo avvio</p>
        <h2>Nessun listone caricato</h2>
        <p>
          Carica il listone incluso per iniziare subito a valutare i giocatori, oppure importa direttamente il tuo CSV
          (formato <span className="mono">nome,ruolo,squadra,punteggio,titolarita</span> — le ultime due colonne sono
          opzionali) qui sotto.
        </p>
        <button type="button" className="primary-button" onClick={loadDefaultListone} style={{ maxWidth: '20rem', margin: '0 auto' }}>
          Carica listone Serie A {(listoneData as { season: string }).season}
        </button>
        <p className="hint" style={{ marginTop: '1rem' }}>
          oppure{' '}
          <button type="button" className="link-button" style={{ display: 'inline' }} onClick={() => fileInputRef.current?.click()}>
            importa un CSV
          </button>{' '}
          ·{' '}
          <button type="button" className="link-button" style={{ display: 'inline' }} onClick={downloadCsvTemplate}>
            scarica il template
          </button>
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden-file-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleCsvFile(file);
            e.target.value = '';
          }}
        />
        {importMessage && <p className="hint">{importMessage}</p>}
      </div>
    );
  }

  return (
    <div className="screen player-list-screen">
      <div className="player-list-header">
        <h2>Lista giocatori</h2>
        <div className="counters">
          {ROLES.map((role) => (
            <span key={role} className="counter-chip">
              <span className={`role-text-${role}`}>{role}</span>{' '}
              <b>
                {countsByRole[role].scored}/{countsByRole[role].total}
              </b>
            </span>
          ))}
        </div>
      </div>

      <section className="filters">
        <input
          type="search"
          placeholder="Cerca nome o squadra…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="role-filter-pills">
          <button
            type="button"
            className={roleFilter === 'ALL' ? 'role-filter-pill active role-ALL' : 'role-filter-pill'}
            onClick={() => setRoleFilter('ALL')}
          >
            Tutti
          </button>
          {ROLES.map((r) => (
            <button
              key={r}
              type="button"
              className={roleFilter === r ? `role-filter-pill active role-${r}` : 'role-filter-pill'}
              onClick={() => setRoleFilter(r)}
            >
              {r}
            </button>
          ))}
        </div>
        <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
          <option value="ALL">Tutte le squadre</option>
          {teams.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <label className={showUnscoredOnly ? 'checkbox-label active' : 'checkbox-label'}>
          <input
            type="checkbox"
            checked={showUnscoredOnly}
            onChange={(e) => setShowUnscoredOnly(e.target.checked)}
          />
          solo senza punteggio
        </label>
      </section>

      <section className="card">
        <h3>Importa CSV</h3>
        <p className="hint">
          Formato: <span className="mono">nome,ruolo,squadra,punteggio,titolarita</span> — le ultime due colonne sono
          opzionali, se le compili carichi già punteggio (0–100) ed eventuale override di titolarità (0–1) senza doverli
          inserire a mano riga per riga.
        </p>
        <div className="price-record-row">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleCsvFile(file);
              e.target.value = '';
            }}
          />
          <button type="button" className="secondary-button" onClick={downloadCsvTemplate}>
            ⭳ Scarica template CSV
          </button>
        </div>
        {importMessage && <p className="hint">{importMessage}</p>}
      </section>

      <section className="card">
        <h3>Aggiungi giocatore (estratto e non in lista)</h3>
        <form className="manual-add-form" onSubmit={handleManualAdd}>
          <input
            type="text"
            placeholder="Nome"
            value={manualName}
            onChange={(e) => setManualName(e.target.value)}
          />
          <input
            type="text"
            placeholder="Squadra"
            value={manualTeam}
            onChange={(e) => setManualTeam(e.target.value)}
          />
          <div className="role-select-pills">
            {ROLES.map((r) => (
              <button
                key={r}
                type="button"
                className={manualRole === r ? `role-select-pill selected role-${r}` : 'role-select-pill'}
                onClick={() => setManualRole(r)}
              >
                {r}
              </button>
            ))}
          </div>
          <button type="submit" className="secondary-button">
            Aggiungi
          </button>
        </form>
      </section>

      <div className="table-scroll">
        <table className="player-table">
          <thead>
            <tr>
              <th>Ruolo</th>
              <th>Nome</th>
              <th>Squadra</th>
              <th>Punteggio 0–100</th>
              <th>Titolarità</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const scoreEntry = state.scores[p.id];
              const score = scoreEntry?.score;
              return (
                <tr key={p.id}>
                  <td>
                    <span className={`role-tag role-${p.role}`}>{p.role}</span>
                  </td>
                  <td>{p.name}</td>
                  <td className="dim">{p.team}</td>
                  <td>
                    <div className="score-cell">
                      <div className="score-bar-track">
                        <div className="score-bar-fill" style={{ width: `${score ?? 0}%` }} />
                      </div>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={score ?? ''}
                        onChange={(e) => setScore(p.id, Number(e.target.value))}
                        className="score-input"
                      />
                    </div>
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      value={scoreEntry?.ptOverride ?? ''}
                      placeholder={scoreEntry ? 'auto' : '—'}
                      disabled={scoreEntry === undefined}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setPtOverride(p.id, raw === '' ? null : Number(raw));
                      }}
                      className="pt-override-input"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
