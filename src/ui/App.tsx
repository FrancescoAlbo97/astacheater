// §11 — Shell dell'app: navigazione fra le quattro schermate, export/import sempre disponibili.
import { useRef, useState } from 'react';
import { AuctionProvider, useAuctionStore } from './state/store.js';
import { SetupLeague } from './screens/SetupLeague.js';
import { PlayerList } from './screens/PlayerList.js';
import { Auction } from './screens/Auction.js';
import { DryRun } from './screens/DryRun.js';

type Screen = 'setup' | 'players' | 'auction' | 'dryrun';

function AppShell() {
  const { state, exportJSON, importJSON, resetAll } = useAuctionStore();
  const [screen, setScreen] = useState<Screen>(state.config ? 'auction' : 'setup');
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleExport() {
    const json = exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fantasta-stato-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
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
        <h1>FantAsta</h1>
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
        </nav>
        <div className="io-buttons">
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
