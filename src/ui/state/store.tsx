// §7 — Contesto React sopra il log event-sourced. Salvataggio automatico su localStorage in
// try/catch (§13.7: non è mai l'unica garanzia, l'export esplicito deve sempre funzionare).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuctionEvent, AuctionState } from '../../core/types.js';
import { appendEvent, canUndo, reduce } from '../../core/state.js';

const STORAGE_KEY = 'fantasta.auction.log.v1';

function loadLogFromStorage(): AuctionEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AuctionEvent[]) : [];
  } catch {
    return [];
  }
}

function saveLogToStorage(log: readonly AuctionEvent[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
  } catch {
    // localStorage può essere indisponibile o pieno (§13.7): non è un errore fatale, l'unica
    // garanzia reale resta l'export esplicito in JSON.
  }
}

export interface AuctionStore {
  readonly log: readonly AuctionEvent[];
  readonly state: AuctionState;
  dispatch(event: AuctionEvent): void;
  undo(): void;
  readonly canUndo: boolean;
  exportJSON(): string;
  importJSON(json: string): void;
  resetAll(): void;
}

const AuctionContext = createContext<AuctionStore | null>(null);

export function AuctionProvider({ children }: { children: ReactNode }) {
  const [log, setLog] = useState<AuctionEvent[]>(() => loadLogFromStorage());

  useEffect(() => {
    saveLogToStorage(log);
  }, [log]);

  const state = useMemo(() => reduce(log), [log]);

  const dispatch = useCallback((event: AuctionEvent) => {
    setLog((prev) => appendEvent(prev, event));
  }, []);

  const undo = useCallback(() => {
    setLog((prev) => (canUndo(prev) ? appendEvent(prev, { t: 'undo' }) : prev));
  }, []);

  const exportJSON = useCallback(() => JSON.stringify({ version: 1, log }, null, 2), [log]);

  const importJSON = useCallback((json: string) => {
    const parsed: unknown = JSON.parse(json);
    const importedLog =
      parsed && typeof parsed === 'object' && Array.isArray((parsed as { log?: unknown }).log)
        ? ((parsed as { log: AuctionEvent[] }).log)
        : Array.isArray(parsed)
          ? (parsed as AuctionEvent[])
          : null;
    if (!importedLog) throw new Error('File non riconosciuto: manca un log di eventi valido.');
    setLog(importedLog);
  }, []);

  const resetAll = useCallback(() => setLog([]), []);

  const value: AuctionStore = {
    log,
    state,
    dispatch,
    undo,
    canUndo: canUndo(log),
    exportJSON,
    importJSON,
    resetAll,
  };

  return <AuctionContext.Provider value={value}>{children}</AuctionContext.Provider>;
}

export function useAuctionStore(): AuctionStore {
  const ctx = useContext(AuctionContext);
  if (!ctx) throw new Error('useAuctionStore deve essere usato dentro <AuctionProvider>');
  return ctx;
}
