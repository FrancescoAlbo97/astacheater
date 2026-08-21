// Griglia a 4 colonne (P/D/C/A) con titolari e panchina per un manager: usata da "Fantallenatori"
// (sola lettura, la rosa di un avversario) e da "La mia rosa" (riordinabile trascinando, §11 "lo
// slot è la posizione che TU decidi"). Un solo posto per questo layout invece di due copie quasi
// identiche.
import { useState } from 'react';
import { reorderWithInsertion } from '../../core/roster-organize.js';
import { ROLES } from '../../core/types.js';
import { useAuctionStore } from '../state/store.js';
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
  const { dispatch } = useAuctionStore();
  const [dragging, setDragging] = useState<{ role: Role; playerId: string } | null>(null);
  const [editingPlayer, setEditingPlayer] = useState<{ id: string; name: string; team: string; role: Role } | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; team: string; role: Role }>({ name: '', team: '', role: 'A' });

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

  function handleEditClick(player: { id: string; name: string; team: string; role: Role }) {
    setEditingPlayer(player);
    setEditForm({ name: player.name, team: player.team, role: player.role });
  }

  function handleSaveEdit() {
    if (!editingPlayer) return;
    dispatch({ t: 'player.edit', playerId: editingPlayer.id, updates: editForm });
    setEditingPlayer(null);
  }

  function handleDeleteClick(player: { id: string; name: string }, managerId: string) {
    if (confirm(`Sei sicuro di voler eliminare ${player.name}? Questa azione rimuoverà il giocatore dalla rosa e libererà crediti e slot.`)) {
      dispatch({ t: 'player.delete', playerId: player.id, managerId });
    }
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
                        onEdit={() => handleEditClick(entry.player)}
                        onDelete={() => handleDeleteClick(entry.player, state.config!.managers.find((m) => m.isMe)!.id)}
                        showActions={Boolean(onReorder)}
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
                        onEdit={() => handleEditClick(entry.player)}
                        onDelete={() => handleDeleteClick(entry.player, state.config!.managers.find((m) => m.isMe)!.id)}
                        showActions={Boolean(onReorder)}
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

      {editingPlayer && (
        <div className="modal-overlay" onClick={() => setEditingPlayer(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Modifica giocatore</h3>
            <div className="form-group">
              <label>Nome</label>
              <input
                type="text"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Squadra</label>
              <input
                type="text"
                value={editForm.team}
                onChange={(e) => setEditForm({ ...editForm, team: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Ruolo</label>
              <select
                value={editForm.role}
                onChange={(e) => setEditForm({ ...editForm, role: e.target.value as Role })}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setEditingPlayer(null)}>
                Annulla
              </button>
              <button type="button" className="btn-primary" onClick={handleSaveEdit}>
                Salva
              </button>
            </div>
          </div>
        </div>
      )}
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
  onEdit,
  onDelete,
  showActions,
}: {
  entry: { player: { id: string; name: string; team: string; role: Role }; price: number };
  role: Role;
  slotLabel: string;
  score: number | null;
  draggable: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onEdit: () => void;
  onDelete: () => void;
  showActions: boolean;
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
      {showActions && (
        <div className="roster-row-actions">
          <button type="button" className="btn-icon" onClick={onEdit} title="Modifica">
            ✏️
          </button>
          <button type="button" className="btn-icon btn-danger" onClick={onDelete} title="Elimina">
            🗑️
          </button>
        </div>
      )}
    </div>
  );
}
