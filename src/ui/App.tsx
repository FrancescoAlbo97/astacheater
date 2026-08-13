// §11 — Shell dell'app: navigazione fra le quattro schermate, export/import sempre disponibili.
import { useEffect, useRef, useState } from 'react';
import { AuctionProvider, useAuctionStore } from './state/store.js';
import { SetupLeague } from './screens/SetupLeague.js';
import { PlayerList } from './screens/PlayerList.js';
import { Auction } from './screens/Auction.js';
import { DryRun } from './screens/DryRun.js';
import { Report } from './screens/Report.js';

type Screen = 'setup' | 'players' | 'auction' | 'dryrun' | 'report';

// Backup automatico su file, oltre al salvataggio in localStorage (§4 del manuale): protegge dal
// caso in cui sia il browser stesso a perdere i dati (dati cancellati, profilo corrotto, cambio
// dispositivo). Ogni 5 minuti, solo se è successo qualcosa di nuovo da allora — niente download
// ripetuti a vuoto se l'asta è ferma. Nota per l'utente (vedi MANUALE.md): dopo un paio di download
// automatici in rapida sequenza, i browser tipicamente chiedono il permesso di scaricare più file
// dallo stesso sito — va concesso, altrimenti i backup successivi vengono silenziosamente bloccati.
const AUTO_BACKUP_INTERVAL_MS = 5 * 60 * 1000;

function formatClock(ts: number): string {
  return new Date(ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function downloadJSON(json: string, filename: string): void {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function AppShell() {
  const { state, log, exportJSON, importJSON, resetAll, lastSavedAt } = useAuctionStore();
  const [screen, setScreen] = useState<Screen>(state.config ? 'auction' : 'setup');
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Ref, non state: la sola lettura periodica non deve causare re-render, e vogliamo sempre
  // l'ultimo `log`/`exportJSON` senza dover ricreare l'intervallo ad ogni evento dell'asta.
  // `currentLogLength` va aggiornato ad OGNI render (non solo dentro l'effetto qui sotto, che gira
  // una volta sola): altrimenti il callback dentro `setInterval` vedrebbe per sempre la lunghezza
  // del log catturata al momento della creazione dell'intervallo, non quella reale del momento.
  const backupRef = useRef<{ at: number; lastBackedUpLength: number; currentLogLength: number; exportJSON: () => string }>({
    at: 0,
    lastBackedUpLength: 0,
    currentLogLength: log.length,
    exportJSON,
  });
  backupRef.current.exportJSON = exportJSON;
  backupRef.current.currentLogLength = log.length;

  useEffect(() => {
    if (!state.config) return;
    // Parte da qui, non da 0: il primo backup automatico arriva dopo un intervallo pieno di
    // attività, non a pochi secondi dalla fine del Setup.
    backupRef.current.at = Date.now();
    backupRef.current.lastBackedUpLength = backupRef.current.currentLogLength;
    const id = setInterval(() => {
      const { at, lastBackedUpLength, currentLogLength } = backupRef.current;
      if (currentLogLength > lastBackedUpLength && Date.now() - at >= AUTO_BACKUP_INTERVAL_MS) {
        downloadJSON(backupRef.current.exportJSON(), `fantasta-backup-auto-${Date.now()}.json`);
        backupRef.current.at = Date.now();
        backupRef.current.lastBackedUpLength = currentLogLength;
      }
    }, 30_000);
    return () => clearInterval(id);
    // Dipendenza intenzionalmente solo su "c'è una lega configurata", non su `log`/`state`: vogliamo
    // UN SOLO intervallo che vive quanto l'asta, non uno che si ricrea ad ogni vendita registrata —
    // legge sempre l'ultimo `log`/`exportJSON` tramite `backupRef`, aggiornato ad ogni render.
  }, [Boolean(state.config)]);

  function handleExport() {
    downloadJSON(exportJSON(), `fantasta-stato-${new Date().toISOString().slice(0, 10)}.json`);
  }

  function handleImportFile(file: File) {
    file
      .text()
      .then((text) => {
        importJSON(text);
        setImportError(null);
      })
      .catch((err: unknown) => {
        setImportError(err instanceof Error ? err.message : 'File non valido.');
      });
  }

  function handleReset() {
    if (window.confirm('Cancellare tutto lo stato corrente (rosa, punteggi, vendite)? Esporta prima se vuoi conservarlo.')) {
      resetAll();
      setScreen('setup');
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-badge">FA</span>
          <h1>FantAsta</h1>
        </div>
        <nav className="screen-nav">
          <button type="button" className={screen === 'setup' ? 'active' : ''} onClick={() => setScreen('setup')}>
            Setup
          </button>
          <button type="button" className={screen === 'players' ? 'active' : ''} onClick={() => setScreen('players')}>
            Lista giocatori
          </button>
          <button
            type="button"
            className={screen === 'auction' ? 'active' : ''}
            onClick={() => setScreen('auction')}
            disabled={!state.config}
          >
            Asta
          </button>
          <button
            type="button"
            className={screen === 'dryrun' ? 'active' : ''}
            onClick={() => setScreen('dryrun')}
            disabled={!state.config}
          >
            Prova a secco
          </button>
          <button
            type="button"
            className={screen === 'report' ? 'active' : ''}
            onClick={() => setScreen('report')}
            disabled={!state.config}
          >
            Report asta
          </button>
        </nav>
        <div className="io-buttons">
          <span className="io-hint" title="Salvato nel browser (localStorage) ad ogni azione, più un backup su file ogni 5 minuti se qualcosa è cambiato. Esporta comunque ogni tanto: è l'unica garanzia che sopravvive a un cambio di dispositivo o dati del browser cancellati.">
            {lastSavedAt ? `salvato alle ${formatClock(lastSavedAt)}` : 'salvato automaticamente'}, ma esporta ogni tanto
          </span>
          <button type="button" onClick={handleExport} title="Esporta stato (JSON)">
            ⭳ Esporta
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()} title="Importa stato">
            ⭱ Importa
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden-file-input"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImportFile(file);
              e.target.value = '';
            }}
          />
          <button type="button" onClick={handleReset} title="Azzera tutto" className="danger-button">
            ⟲ Azzera
          </button>
        </div>
      </header>
      {importError && <p className="error-banner">{importError}</p>}
      <main>
        {screen === 'setup' && <SetupLeague onDone={() => setScreen('players')} />}
        {screen === 'players' && <PlayerList />}
        {screen === 'auction' && <Auction />}
        {screen === 'dryrun' && <DryRun />}
        {screen === 'report' && <Report />}
      </main>
    </div>
  );
}

export function App() {
  return (
    <AuctionProvider>
      <AppShell />
    </AuctionProvider>
  );
}
