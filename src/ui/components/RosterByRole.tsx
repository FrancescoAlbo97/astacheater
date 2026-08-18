// Griglia a 4 colonne (P/D/C/A) con titolari e panchina per un manager: usata da "Fantallenatori"
// (sola lettura, la rosa di un avversario) e da "La mia rosa" (riordinabile trascinando, §11 "lo
// slot è la posizione che TU decidi"). Un solo posto per questo layout invece di due copie quasi
// identiche.
import { useState } from 'react';
import { reorderWithInsertion } from '../../core/roster-organize.js';
import { ROLES } from '../../core/types.js';
import type { RoleSlots } from '../../core/roster-organize.js';
import type { AuctionState, Role } from '../../core/types.js';

const ROLE_LABELS: Record<Role, string> = { P: 'PORTIERI', D: 'DIFENSORI', C: 'CENTROCAMPISTI', A: 'ATTACCANTI' };

export interface RosterByRoleProps {
  readonly state: AuctionState;
  readonly slotsByRole: Record<Role, RoleSlots>;
  /** Se presente, le righe diventano trascinabili per riordinare gli slot (solo "La mia rosa": ha
   * senso decidere lo slot solo per la PROPRIA rosa, non per quella di un avversario). */
  readonly onReorder?: (role: Role, order: readonly string[]) => void;
  readonly footNoteByRole?: Partial<Record<Role, string>>;
  readonly warningByRole?: Partial<Record<Role, { readonly benched: { player: { id: string; name: string } }; readonly starter: { player: { id: string; name: string } } } | null>>;
}

export function RosterByRole({ state, slotsByRole, onReorder, footNoteByRole, warningByRole }: RosterByRoleProps) {
  const [dragging, setDragging] = useState<{ role: Role; playerId: string } | null>(null);

  function currentOrderIds(role: Role): string[] {
    const slots = slotsByRole[role];
    return [...slots.titolari, ...slots.panchina].map((r) => r.player.id);
  }

  function handleDrop(role: Role, targetIndex: number) {
    if (!onReorder || !dragging || dragging.role !== role) return;
    const newOrder = reorderWithInsertion(currentOrderIds(role), dragging.playerId, targetIndex);
    onReorder(role, newOrder);
    setDragging(null);
  }

  return (
    <div className="roster-by-role-grid">
      {ROLES.map((role) => {
        const slots = slotsByRole[role];
        const warning = warningByRole?.[role];
        const note = footNoteByRole?.[role];
        let index = 0;
        return (
          <div key={role} className={`roster-role-card role-border-${role}`}>
            <div className="roster-role-head">
              <span className={`roster-role-title role-text-${role}`}>{ROLE_LABELS[role]}</span>
              <span className="dim mono">
                {slots.titolari.length + slots.panchina.length}/{slots.totalSlots}
              </span>
            </div>

            {slots.titolari.length > 0 && (
              <>
                <div className="roster-role-subhead">
                  TITOLARI · {slots.titolari.length} SU {slots.startersCount}
                </div>
                <div className="roster-role-list">
                  {slots.titolari.map((entry) => {
                    const slotIndex = index++;
                    return (
                      <RosterRow
                        key={entry.player.id}
                        entry={entry}
                        role={role}
                        slotLabel={`${role}${slotIndex + 1}`}
                        score={state.scores[entry.player.id]?.score ?? null}
                        draggable={Boolean(onReorder)}
                        onDragStart={() => setDragging({ role, playerId: entry.player.id })}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => handleDrop(role, slotIndex)}
                      />
                    );
                  })}
                </div>
              </>
            )}

            {warning && (
              <div className="hierarchy-warning">
                ⚠ {warning.benched.player.name} è sopra {warning.starter.player.name} per punteggio ma è in panchina:
                vuoi scambiarli?
              </div>
            )}

            {slots.panchina.length > 0 && (
              <>
                <div className="roster-role-subhead">PANCHINA</div>
                <div className="roster-role-list">
                  {slots.panchina.map((entry) => {
                    const slotIndex = index++;
                    return (
                      <RosterRow
                        key={entry.player.id}
                        entry={entry}
                        role={role}
                        slotLabel={`${role}${slotIndex + 1}`}
                        score={state.scores[entry.player.id]?.score ?? null}
                        draggable={Boolean(onReorder)}
                        onDragStart={() => setDragging({ role, playerId: entry.player.id })}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => handleDrop(role, slotIndex)}
                      />
                    );
                  })}
                </div>
              </>
            )}

            {slots.freeSlots > 0 && (
              <div
                className="roster-slot-free"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(role, currentOrderIds(role).length)}
              >
                {slots.freeSlots} slot {role} liberi
              </div>
            )}

            {slots.titolari.length === 0 && slots.panchina.length === 0 && slots.freeSlots === 0 && (
              <p className="hint">nessuno slot in questo ruolo</p>
            )}

            {note && <div className="roster-role-note">{note}</div>}
          </div>
        );
      })}
    </div>
  );
}

function RosterRow({
  entry,
  role,
  slotLabel,
  score,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  entry: { player: { id: string; name: string; team: string }; price: number };
  role: Role;
  slotLabel: string;
  score: number | null;
  draggable: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
}) {
  return (
    <div
      className={`roster-row role-border-${role}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {draggable && <span className="drag-handle">⠿</span>}
      <span className={`roster-row-slot role-text-${role}`}>{slotLabel}</span>
      <div className="roster-row-name">
        <div>{entry.player.name}</div>
        <div className="dim small">
          {entry.player.team}
          {score !== null ? ` · ${score.toFixed(0)}` : ''}
        </div>
      </div>
      <span className="roster-row-price mono">{entry.price}</span>
    </div>
  );
}
