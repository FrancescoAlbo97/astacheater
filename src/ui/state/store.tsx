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

/**
 * Solo per `npm run dev`, mai nel build finale (§13: il file singolo che va all'asta vera non deve
 * portarsi dietro dati di test): se l'URL contiene `?fixture=<nome>`, carica quella fixture da
 * `src/fixtures/*.json` invece dello stato salvato — per testare senza dover rifare un'asta intera
 * a mano ad ogni modifica (troppo lento come metodo di debug, vedi `scripts/make-fixtures.ts` per
 * come si generano/rigenerano). `import.meta.env.DEV` è `false` a build time in produzione: Vite
 * elimina questo intero ramo (fixture comprese) dal file finale.
 */
function loadDevFixtureIfRequested(): AuctionEvent[] | null {
  if (!import.meta.env.DEV) return null;
  const name = new URLSearchParams(window.location.search).get('fixture');
  if (!name) return null;
  const modules = import.meta.glob('../../fixtures/*.json', { eager: true }) as Record<
    string,
    { version: number; log: AuctionEvent[] }
  >;
  const match = Object.entries(modules).find(([path]) => path.endsWith(`/${name}.json`));
  if (!match) {
    console.warn(`[fixture] nessuna fixture "${name}" in src/fixtures/ (disponibili: ${Object.keys(modules).map((p) => p.split('/').pop()).join(', ')})`);
    return null;
  }
  return match[1].log;
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
  /** Timestamp (`Date.now()`) dell'ultimo salvataggio riuscito su localStorage, `null` prima del
   * primo. Solo per mostrare all'utente che l'autosave sta davvero funzionando (§4 del manuale: non
   * è mai l'unica garanzia, ma vale la pena renderla visibile invece di chiedere fiducia cieca). */
  readonly lastSavedAt: number | null;
  /** Giocatore "in discussione" al momento, condiviso fra Banco d'asta e Predizione (§11): stato
   * di navigazione della UI, non un fatto dell'asta — deliberatamente FUORI dal log degli eventi
   * (non deve finire in export/import/undo), altrimenti "chi ho cercato per ultimo" diventerebbe
   * un evento indistinguibile da una vendita vera nella cronologia. */
  readonly activePlayerId: string | null;
  setActivePlayerId(playerId: string | null): void;
}

const AuctionContext = createContext<AuctionStore | null>(null);

export function AuctionProvider({ children }: { children: ReactNode }) {
  const [log, setLog] = useState<AuctionEvent[]>(() => loadDevFixtureIfRequested() ?? loadLogFromStorage());
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);

  useEffect(() => {
    saveLogToStorage(log);
    setLastSavedAt(Date.now());
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
    lastSavedAt,
    activePlayerId,
    setActivePlayerId,
  };

  return <AuctionContext.Provider value={value}>{children}</AuctionContext.Provider>;
}

export function useAuctionStore(): AuctionStore {
  const ctx = useContext(AuctionContext);
  if (!ctx) throw new Error('useAuctionStore deve essere usato dentro <AuctionProvider>');
  return ctx;
}
