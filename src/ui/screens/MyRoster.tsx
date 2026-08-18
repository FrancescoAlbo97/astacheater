// §11 "La mia rosa": non solo l'elenco di chi ho comprato, ma DOVE lo metto (slot che scelgo io,
// non l'ordine d'acquisto) e cosa scenderebbe in campo oggi con la formazione scelta.
import { useMemo, useState } from 'react';
import { useAuctionStore } from '../state/store.js';
import { deriveManagerStates, getMyManagerId } from '../../core/state.js';
import { maxSingleBid } from '../../core/ceiling.js';
import { findHierarchyWarning, getFormationSplit, startersCountFor } from '../../core/roster-organize.js';
import { RosterByRole } from '../components/RosterByRole.js';
import { formatNum } from '../components/DecisionPanel.js';
import { ROLES } from '../../core/types.js';
import type { Formation, Role } from '../../core/types.js';

const ROLE_COLOR_VAR: Record<Role, string> = { P: 'var(--role-p)', D: 'var(--role-d)', C: 'var(--role-c)', A: 'var(--role-a)' };
const ROLE_LABEL_IT: Record<Role, string> = { P: 'Portieri', D: 'Difensori', C: 'Centrocampisti', A: 'Attaccanti' };

export function MyRoster() {
  const { state, dispatch } = useAuctionStore();
  const [tab, setTab] = useState<'slot' | 'formazione'>('slot');
  const [formation, setFormation] = useState<Formation | null>(null);

  const myManagerId = getMyManagerId(state.config);
  const managers = useMemo(() => deriveManagerStates(state), [state]);
  const me = managers.find((m) => m.manager.id === myManagerId);

  if (!state.config || !myManagerId || !me) {
    return <p className="placeholder">Configura prima la lega (schermata Setup).</p>;
  }

  const activeFormation = formation ?? state.config.primaryFormation;
  const slotsByRole = getFormationSplit(state, myManagerId, activeFormation);

  const totalStarters = ROLES.reduce((s, r) => s + startersCountFor(r, activeFormation), 0);
  const titolariCoperti = ROLES.reduce((s, r) => s + slotsByRole[r].titolari.length, 0);

  const warningByRole: Partial<Record<Role, ReturnType<typeof findHierarchyWarning>>> = {};
  let hierarchyIssues = 0;
  for (const role of ROLES) {
    const w = findHierarchyWarning(state, slotsByRole[role]);
    warningByRole[role] = w;
    if (w) hierarchyIssues++;
  }

  const totalSlots = ROLES.reduce((s, r) => s + state.config!.slots[r], 0);
  const slotsFilled = me.roster.length;
  const slotsLeft = totalSlots - slotsFilled;
  const crPerSlotLeft = slotsLeft > 0 ? me.creditsRemaining / slotsLeft : 0;

  function handleReorder(role: Role, order: readonly string[]) {
    dispatch({ t: 'roster.slot', managerId: myManagerId!, role, order });
  }

  return (
    <div className="screen my-roster-screen">
      <div className="screen-header-row">
        <div>
          <h2>La mia rosa</h2>
          <p className="hint">
            {slotsFilled} giocatori su {totalSlots} · {me.roster.reduce((s, r) => s + r.price, 0)} crediti spesi · formazione
            primaria <span className="mono">{state.config.primaryFormation}</span>
          </p>
        </div>
        <div className="header-stat-row">
          <div className="dry-run-stat-card">
            <div className="stat-label">Titolari coperti</div>
            <div className="stat-value">
              {titolariCoperti}
              <span className="stat-meta">/{totalStarters}</span>
            </div>
          </div>
          <div className={`dry-run-stat-card ${hierarchyIssues > 0 ? 'warn-card' : ''}`}>
            <div className="stat-label">Gerarchie da sistemare</div>
            <div className="stat-value">{hierarchyIssues}</div>
          </div>
          <div className="dry-run-stat-card">
            <div className="stat-label">Cr per slot restante</div>
            <div className="stat-value">{formatNum(crPerSlotLeft)}</div>
          </div>
          <div className="dry-run-stat-card accent">
            <div className="stat-label">Massimo offribile ora</div>
            <div className="stat-value">{maxSingleBid(me)}</div>
          </div>
        </div>
      </div>

      <div className="tab-switch">
        <button type="button" className={tab === 'slot' ? 'active' : ''} onClick={() => setTab('slot')}>
          Slot
        </button>
        <button type="button" className={tab === 'formazione' ? 'active' : ''} onClick={() => setTab('formazione')}>
          Formazione
        </button>
      </div>

      {tab === 'slot' && (
        <RosterByRole state={state} slotsByRole={slotsByRole} onReorder={handleReorder} warningByRole={warningByRole} />
      )}

      {tab === 'formazione' && (
        <FormationView
          state={state}
          formation={activeFormation}
          onChangeFormation={setFormation}
          slotsByRole={slotsByRole}
          titolariCoperti={titolariCoperti}
          totalStarters={totalStarters}
          me={me}
        />
      )}
    </div>
  );
}

function FormationView({
  state,
  formation,
  onChangeFormation,
  slotsByRole,
  titolariCoperti,
  totalStarters,
  me,
}: {
  state: ReturnType<typeof useAuctionStore>['state'];
  formation: Formation;
  onChangeFormation: (f: Formation) => void;
  slotsByRole: ReturnType<typeof getFormationSplit>;
  titolariCoperti: number;
  totalStarters: number;
  me: ReturnType<typeof deriveManagerStates>[number];
}) {
  const spentByRole: Record<Role, number> = { P: 0, D: 0, C: 0, A: 0 };
  for (const entry of me.roster) spentByRole[entry.player.role] += entry.price;
  const totalSpent = ROLES.reduce((s, r) => s + spentByRole[r], 0);

  // Media di lega per ruolo, come quota dello speso totale di TUTTI i manager — il metro di
  // paragone usato nel mockup ("la media di lega in attacco è il 28%").
  const allManagers = deriveManagerStates(state);
  const leagueSpentByRole: Record<Role, number> = { P: 0, D: 0, C: 0, A: 0 };
  let leagueTotalSpent = 0;
  for (const m of allManagers) {
    for (const entry of m.roster) {
      leagueSpentByRole[entry.player.role] += entry.price;
      leagueTotalSpent += entry.price;
    }
  }

  return (
    <div className="formation-view">
      <div className="formation-pitch-col">
        <div className="formation-switcher">
          {state.config!.formations.map((f) => (
            <button key={f} type="button" className={f === formation ? 'active' : ''} onClick={() => onChangeFormation(f)}>
              {f}
            </button>
          ))}
        </div>
        <div className="formation-pitch">
          {ROLES.map((role) => (
            <div key={role} className="formation-pitch-row">
              {Array.from({ length: slotsByRole[role].startersCount }, (_, i) => {
                const entry = slotsByRole[role].titolari[i];
                return (
                  <div key={i} className={`formation-slot role-border-${role} ${entry ? '' : 'formation-slot-empty'}`}>
                    <div className={`mono formation-slot-tag role-text-${role}`}>
                      {role}
                      {i + 1}
                    </div>
                    {entry ? (
                      <>
                        <div className="formation-slot-name">{entry.player.name}</div>
                        <div className="dim small mono">
                          {state.scores[entry.player.id]?.score?.toFixed(0) ?? '—'} · {entry.price} cr
                        </div>
                      </>
                    ) : (
                      <div className="formation-slot-name" style={{ color: 'var(--warn)' }}>
                        da coprire
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="formation-sidebar">
        <div>
          <div className="section-label">Titolari coperti</div>
          <div className="big-stat-row">
            <span className="mono">{titolariCoperti}</span>
            <span className="dim">su {totalStarters}</span>
          </div>
          <div className="progress-bar-track">
            <div className="progress-bar-fill" style={{ width: `${totalStarters > 0 ? (titolariCoperti / totalStarters) * 100 : 0}%` }} />
          </div>
        </div>

        <div>
          <div className="section-label">Spesa per reparto</div>
          <div className="spend-by-role-list">
            {ROLES.map((role) => {
              const pct = totalSpent > 0 ? (spentByRole[role] / totalSpent) * 100 : 0;
              const leaguePct = leagueTotalSpent > 0 ? (leagueSpentByRole[role] / leagueTotalSpent) * 100 : 0;
              const deviates = Math.abs(pct - leaguePct) > 15;
              return (
                <div key={role}>
                  <div className="spend-by-role-row">
                    <span className={deviates ? 'spend-role-label-warn' : ''}>{ROLE_LABEL_IT[role]}</span>
                    <span className="mono">
                      {spentByRole[role]} cr · {pct.toFixed(0)}%
                    </span>
                  </div>
                  <div className="progress-bar-track thin">
                    <div className="progress-bar-fill" style={{ width: `${pct}%`, background: ROLE_COLOR_VAR[role] }} />
                  </div>
                  {deviates && (
                    <p className="hint" style={{ margin: '0.2rem 0 0' }}>
                      la media di lega in {ROLE_LABEL_IT[role].toLowerCase()} è {leaguePct.toFixed(0)}%: sei{' '}
                      {pct > leaguePct ? 'molto sopra' : 'molto sotto'}.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <div className="section-label">Slot che restano</div>
          {(() => {
            const totalSlots = ROLES.reduce((s, r) => s + state.config!.slots[r], 0);
            const slotsLeft = totalSlots - me.roster.length;
            const avgPerSlot = slotsLeft > 0 ? me.creditsRemaining / slotsLeft : 0;
            return (
              <p className="hint">
                {slotsLeft} slot liberi, {me.creditsRemaining} crediti residui → in media {formatNum(avgPerSlot)} crediti a
                slot se li dividessi in parti uguali (una guida, non un piano: spendi di più sui titolari che mancano e
                pochissimo sulla profondità di panchina).
              </p>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
