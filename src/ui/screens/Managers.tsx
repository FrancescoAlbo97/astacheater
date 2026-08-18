// §11 "Fantallenatori": le rose a confronto in un colpo d'occhio (crediti, slot, tetto, minaccia
// sui tuoi obiettivi, pressione di ruolo), con un dettaglio per manager — "per ognuno, la sua
// situazione" (richiesta esplicita: non solo la propria rosa, anche quella di tutti gli avversari).
import { useMemo, useState } from 'react';
import { useAuctionStore } from '../state/store.js';
import { deriveManagerStates, getMyManagerId } from '../../core/state.js';
import { computeMarketSnapshot } from '../../core/engine.js';
import { maxSingleBid, scarceRolesFor, threatsByManager, totalSlotsRemaining } from '../../core/ceiling.js';
import type { RolePressure } from '../../core/ceiling.js';
import { getFormationSplit } from '../../core/roster-organize.js';
import { ManagerStatTiles } from '../components/ManagerStatTiles.js';
import { RosterByRole } from '../components/RosterByRole.js';
import { ROLES } from '../../core/types.js';
import type { ManagerState, Player, Role } from '../../core/types.js';

const ROLE_COLOR_VAR: Record<Role, string> = { P: 'var(--role-p)', D: 'var(--role-d)', C: 'var(--role-c)', A: 'var(--role-a)' };

function RoleMiniBars({ manager, slots }: { manager: ManagerState; slots: import('../../core/types.js').SlotCounts }) {
  return (
    <div className="role-mini-bars">
      {ROLES.map((role) => {
        const total = slots[role];
        const filled = total - manager.slotsRemaining[role];
        const pct = total > 0 ? (filled / total) * 100 : 0;
        return (
          <div key={role} className="role-mini-bar">
            <div className="role-mini-bar-head">
              <span className={`role-text-${role}`}>{role}</span>
              <span className="mono">
                {filled}/{total}
              </span>
            </div>
            <div className="role-mini-bar-track">
              <div className="role-mini-bar-fill" style={{ width: `${pct}%`, background: ROLE_COLOR_VAR[role] }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ThreatBadge({ targets }: { targets: readonly Player[] }) {
  if (targets.length === 0) return <span className="dim mono">—</span>;
  return (
    <span className="threat-badge threat-badge-active mono" title={targets.map((p) => p.name).join(', ')}>
      {targets.length}
    </span>
  );
}

function PressureTags({ pressure }: { pressure: readonly RolePressure[] }) {
  if (pressure.length === 0) return <span className="dim mono">—</span>;
  return (
    <span className="pressure-tags">
      {pressure.map((p) => (
        <span
          key={p.role}
          className={`role-tag role-${p.role}`}
          title={`${p.mySlots} slot aperti, nel pool restano ${p.poolRemaining} ${p.role}, agli altri manager ne servono ancora ${p.othersSlots}`}
        >
          {p.role}
        </span>
      ))}
    </span>
  );
}

export function Managers() {
  const { state } = useAuctionStore();
  const [selectedManagerId, setSelectedManagerId] = useState<string | null>(null);

  const managers = useMemo(() => deriveManagerStates(state), [state]);
  const myManagerId = getMyManagerId(state.config);
  const sorted = useMemo(() => [...managers].sort((a, b) => b.creditsRemaining - a.creditsRemaining), [managers]);
  const snapshot = useMemo(() => computeMarketSnapshot(state), [state]);
  const targetPlayers = useMemo(() => snapshot.pool.filter((p) => state.targets[p.id]), [snapshot.pool, state.targets]);
  const threats = useMemo(
    () => threatsByManager(managers, targetPlayers, (id) => snapshot.pHat.get(id) ?? 1, myManagerId),
    [managers, targetPlayers, snapshot.pHat, myManagerId],
  );

  if (!state.config) {
    return <p className="placeholder">Configura prima la lega (schermata Setup).</p>;
  }

  const selected = selectedManagerId ? managers.find((m) => m.manager.id === selectedManagerId) : null;

  if (selected) {
    return (
      <ManagerDetail
        manager={selected}
        isMe={selected.manager.id === myManagerId}
        me={managers.find((m) => m.manager.id === myManagerId) ?? null}
        managers={managers}
        pool={snapshot.pool}
        threats={threats.get(selected.manager.id) ?? []}
        onBack={() => setSelectedManagerId(null)}
      />
    );
  }

  const creditsInPlay = managers.reduce((s, m) => s + m.creditsRemaining, 0);
  const slotsOpen = managers.reduce((s, m) => s + totalSlotsRemaining(m), 0);
  const highestCeiling = managers.reduce<{ m: ManagerState; c: number } | null>((best, m) => {
    const c = maxSingleBid(m);
    return !best || c > best.c ? { m, c } : best;
  }, null);

  return (
    <div className="screen managers-screen">
      <div className="screen-header-row">
        <div>
          <h2>Fantallenatori</h2>
          <p className="hint">
            Il <b>tetto</b> è il massimo che quel manager può offrire su un singolo giocatore: crediti residui meno gli
            slot che gli restano da riempire. <b>Minaccia</b> conta quanti dei tuoi obiettivi ★ può ancora permettersi;{' '}
            <b>pressione</b> segnala i ruoli dove i suoi slot aperti rischiano di restare senza pool.
          </p>
        </div>
        <div className="header-stat-row">
          <div className="dry-run-stat-card">
            <div className="stat-label">Crediti ancora in gioco</div>
            <div className="stat-value">{creditsInPlay.toLocaleString('it-IT')}</div>
          </div>
          <div className="dry-run-stat-card">
            <div className="stat-label">Slot ancora aperti</div>
            <div className="stat-value">{slotsOpen}</div>
          </div>
          {highestCeiling && (
            <div className="dry-run-stat-card warn-card">
              <div className="stat-label">Tetto più alto in lega</div>
              <div className="stat-value">
                {highestCeiling.c} <span className="stat-meta">{highestCeiling.m.manager.name}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="table-scroll">
        <table className="managers-table">
          <thead>
            <tr>
              <th>Fantallenatore</th>
              <th>Crediti</th>
              <th>Slot</th>
              <th>Tetto</th>
              <th>Slot per ruolo</th>
              <th title="Quanti dei tuoi obiettivi ★ ancora nel pool questo manager può ancora permettersi">Minaccia</th>
              <th title="Ruoli dove i suoi slot aperti rischiano di restare senza pool residuo">Pressione</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((m) => {
              const slots = totalSlotsRemaining(m);
              const spent = m.roster.reduce((s, r) => s + r.price, 0);
              return (
                <tr
                  key={m.manager.id}
                  className={m.manager.id === myManagerId ? 'managers-row-me' : ''}
                  onClick={() => setSelectedManagerId(m.manager.id)}
                >
                  <td>
                    <div className="managers-name">{m.manager.isMe ? 'Io' : m.manager.name}</div>
                    <div className="dim small">
                      {m.roster.length} giocatori · {spent} spesi
                    </div>
                  </td>
                  <td className="mono strong">{m.creditsRemaining}</td>
                  <td className="mono">{slots}</td>
                  <td className={`mono strong ${maxSingleBid(m) < 20 ? 'ceiling-low' : ''}`}>{maxSingleBid(m)}</td>
                  <td>
                    <RoleMiniBars manager={m} slots={state.config!.slots} />
                  </td>
                  <td>
                    <ThreatBadge targets={threats.get(m.manager.id) ?? []} />
                  </td>
                  <td>
                    <PressureTags pressure={scarceRolesFor(managers, snapshot.pool, m.manager.id)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="hint">Clic su una riga per vedere la rosa completa di quel fantallenatore, ruolo per ruolo.</p>
    </div>
  );
}

function ManagerDetail({
  manager,
  isMe,
  me,
  managers,
  pool,
  threats,
  onBack,
}: {
  manager: ManagerState;
  isMe: boolean;
  me: ManagerState | null;
  managers: readonly ManagerState[];
  pool: readonly Player[];
  threats: readonly Player[];
  onBack: () => void;
}) {
  const { state } = useAuctionStore();
  const formation = state.config!.primaryFormation;
  const slotsByRole = useMemo(() => getFormationSplit(state, manager.manager.id, formation), [state, manager.manager.id, formation]);

  const footNoteByRole: Partial<Record<Role, string>> = {};
  for (const role of ROLES) {
    const s = slotsByRole[role];
    if (s.titolari.length < s.startersCount) {
      footNoteByRole[role] = `Manca almeno un titolare in ${role}: ${s.freeSlots} slot ancora liberi.`;
    }
  }

  const overlapRoles = me && !isMe ? ROLES.filter((r) => manager.slotsRemaining[r] > 0 && me.slotsRemaining[r] > 0) : [];
  const pressure = useMemo(() => (isMe ? [] : scarceRolesFor(managers, pool, manager.manager.id)), [isMe, managers, pool, manager.manager.id]);

  return (
    <div className="screen managers-screen">
      <button type="button" className="link-button" onClick={onBack}>
        ← Fantallenatori
      </button>
      <div className="screen-header-row" style={{ marginTop: '0.6rem' }}>
        <div>
          <p className="eyebrow">Fantallenatore · {isMe ? 'tu' : 'avversario'}</p>
          <h1 style={{ margin: '0.2rem 0 0' }}>{isMe ? 'Io' : manager.manager.name}</h1>
          <p className="hint">
            {manager.roster.length} giocatori su {ROLES.reduce((s, r) => s + state.config!.slots[r], 0)} ·{' '}
            {manager.roster.reduce((s, r) => s + r.price, 0)} crediti spesi
          </p>
        </div>
        <ManagerStatTiles manager={manager} />
      </div>

      <RosterByRole state={state} slotsByRole={slotsByRole} footNoteByRole={footNoteByRole} />

      {!isMe && overlapRoles.length > 0 && (
        <section className="card competes-with-me-card">
          <p className="eyebrow">Su cosa compete ancora con te</p>
          <p>
            {overlapRoles.map((r) => `${r} (${manager.slotsRemaining[r]} slot)`).join(' · ')} — con {manager.creditsRemaining}{' '}
            crediti {maxSingleBid(manager) >= (me ? maxSingleBid(me) : 0) ? 'è un avversario pericoloso' : 'ha meno margine di te'}{' '}
            sui tuoi stessi obiettivi.
          </p>
        </section>
      )}

      {!isMe && (threats.length > 0 || pressure.length > 0) && (
        <section className="card competes-with-me-card">
          <p className="eyebrow">Minaccia e pressione</p>
          {threats.length > 0 && (
            <p>
              Può ancora permettersi <b>{threats.length}</b> dei tuoi obiettivi ★:{' '}
              {threats.map((p) => `${p.name} (${p.role})`).join(', ')}.
            </p>
          )}
          {pressure.length > 0 && (
            <p>
              {pressure
                .map(
                  (p) =>
                    `${p.role}: ${p.mySlots} slot aperti, nel pool restano ${p.poolRemaining} ${p.role}, agli altri manager ne servono ancora ${p.othersSlots}`,
                )
                .join(' · ')}
              .
            </p>
          )}
        </section>
      )}
    </div>
  );
}
