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

function parseCsv(text: string): { name: string; role: Role; team: string }[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const out: { name: string; role: Role; team: string }[] = [];
  for (const line of lines) {
    const parts = line.split(',').map((p) => p.trim());
    if (parts.length < 3) continue;
    const [name, roleRaw, team] = parts;
    const role = (roleRaw ?? '').toUpperCase();
    if (!name || !team || !ROLES.includes(role as Role)) continue;
    out.push({ name, role: role as Role, team });
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
        const toLoad: Player[] = rows.map((row) => {
          const existing = existingByNormalizedName.get(normalizeForMatch(row.name));
          const id = existing?.id ?? slugify(row.name, row.team);
          return { id, name: row.name, team: row.team, role: row.role };
        });
        dispatch({ t: 'players.load', players: toLoad });
        setImportMessage(`Importati/aggiornati ${toLoad.length} giocatori (punteggi già assegnati preservati).`);
      })
      .catch(() => setImportMessage('Errore nella lettura del file CSV.'));
  }

  return (
    <div className="screen player-list-screen">
      <h2>Lista giocatori</h2>

      {players.length === 0 && (
        <div className="card">
          <p>Nessun listone caricato.</p>
          <button type="button" className="primary-button" onClick={loadDefaultListone}>
            Carica listone Serie A {(listoneData as { season: string }).season}
          </button>
        </div>
      )}

      <section className="card counters">
        {ROLES.map((role) => (
          <span key={role} className="counter-chip">
            {role}: {countsByRole[role].scored}/{countsByRole[role].total}
          </span>
        ))}
      </section>

      <section className="card filters">
        <input
          type="search"
          placeholder="Cerca nome o squadra…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as Role | 'ALL')}>
          <option value="ALL">Tutti i ruoli</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
          <option value="ALL">Tutte le squadre</option>
          {teams.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={showUnscoredOnly}
            onChange={(e) => setShowUnscoredOnly(e.target.checked)}
          />
          Solo senza punteggio
        </label>
      </section>

      <section className="card">
        <h3>Importa CSV (nome,ruolo,squadra)</h3>
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
        {importMessage && <p className="hint">{importMessage}</p>}
      </section>

      <section className="card">
        <h3>Aggiungi giocatore (estratto e non in lista: max 5 secondi)</h3>
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
          <select value={manualRole} onChange={(e) => setManualRole(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button type="submit">Aggiungi</button>
        </form>
      </section>

      <table className="player-table">
        <thead>
          <tr>
            <th>Ruolo</th>
            <th>Nome</th>
            <th>Squadra</th>
            <th>Score</th>
            <th>Override titolarità</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((p) => {
            const scoreEntry = state.scores[p.id];
            return (
              <tr key={p.id}>
                <td>{p.role}</td>
                <td>{p.name}</td>
                <td>{p.team}</td>
                <td>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={scoreEntry?.score ?? ''}
                    onChange={(e) => setScore(p.id, Number(e.target.value))}
                    className="score-input"
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={scoreEntry?.ptOverride ?? ''}
                    placeholder="—"
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
  );
}
