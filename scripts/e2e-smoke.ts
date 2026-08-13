// Smoke test in browser reale, ripetibile con un comando (`npm run test:e2e`), pensato per
// sostituire "fai un'asta completa a mano per vedere se qualcosa si è rotto" — troppo lento come
// metodo di debug quotidiano. Carica ogni fixture generata da `make-fixtures.ts` tramite
// `?fixture=<nome>` (§ store.tsx, solo in `npm run dev`), visita ogni schermata, registra eventuali
// errori di console e uno screenshot — non sostituisce un controllo umano dei risultati, ma rende
// "guardare se qualcosa è rotto" una questione di 15 secondi e un'occhiata a qualche PNG, non di
// ricostruire un'asta intera a mano ogni volta.
//
// Richiede il dev server già avviato: `npm run dev` in un altro terminale.
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.FANTASTA_DEV_URL ?? 'http://localhost:5173';
const SCREENSHOT_DIR = join(__dirname, '../e2e-screenshots');
const FIXTURES_DIR = join(__dirname, '../src/fixtures');

const FIXTURE_NAMES = readdirSync(FIXTURES_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''))
  .sort();

const TABS = [
  { label: 'Setup', text: 'Setup' },
  { label: 'Lista giocatori', text: 'Lista giocatori' },
  { label: 'Asta', text: 'Asta' },
  { label: 'Prova a secco', text: 'Prova a secco' },
  { label: 'Report asta', text: 'Report asta' },
] as const;

async function checkServerUp(): Promise<boolean> {
  try {
    const res = await fetch(BASE_URL, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await checkServerUp())) {
    console.error(`✗ Il dev server non risponde su ${BASE_URL}. Avvialo con \`npm run dev\` in un altro terminale, poi rilancia questo comando.`);
    process.exitCode = 1;
    return;
  }
  if (!existsSync(SCREENSHOT_DIR)) mkdirSync(SCREENSHOT_DIR, { recursive: true });
  if (FIXTURE_NAMES.length === 0) {
    console.error('✗ Nessuna fixture trovata in src/fixtures/. Genera prima con `npm run fixtures`.');
    process.exitCode = 1;
    return;
  }

  const browser = await chromium.launch();
  const allErrors: { fixture: string; tab: string; error: string }[] = [];

  for (const fixture of FIXTURE_NAMES) {
    const page = await browser.newPage();
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(`[pageerror] ${err.message}`));

    // 'load', non 'networkidle': il dev server di Vite tiene aperto un websocket HMR permanente,
    // quindi "nessuna attività di rete" non si verifica mai e 'networkidle' andrebbe sempre in
    // timeout. Il piccolo `waitForTimeout` dopo copre il tempo di primo render di React.
    await page.goto(`${BASE_URL}/?fixture=${fixture}`, { waitUntil: 'load' });
    await page.waitForTimeout(500);

    for (const tab of TABS) {
      consoleErrors.length = 0;
      await page.getByRole('button', { name: tab.text, exact: true }).click();
      await page.waitForTimeout(300);

      // Sulla schermata Report, esercita anche "Genera report" se ci sono vendite da analizzare
      // (la fixture "00-vuota" non ne ha: il pulsante resta disabilitato, comportamento atteso).
      if (tab.label === 'Report asta') {
        const generaButton = page.getByRole('button', { name: 'Genera report' });
        if (await generaButton.isEnabled().catch(() => false)) {
          await generaButton.click();
          await page.waitForTimeout(800);
        }
      }
      // Sulla schermata Prova a secco, avviala per esercitare anche quel percorso (200 iterazioni,
      // qualche secondo): utile soprattutto sulla fixture con più punteggi assegnati.
      if (tab.label === 'Prova a secco') {
        const avviaButton = page.getByRole('button', { name: 'Avvia prova a secco' });
        if (await avviaButton.isEnabled().catch(() => false)) {
          await avviaButton.click();
          await page.waitForTimeout(4000);
        }
      }

      const shotPath = join(SCREENSHOT_DIR, `${fixture}--${tab.label.replace(/\s+/g, '-')}.png`);
      await page.screenshot({ path: shotPath, fullPage: true });

      for (const error of consoleErrors) {
        allErrors.push({ fixture, tab: tab.label, error });
      }
    }
    await page.close();
    console.log(`✓ ${fixture}: ${TABS.length} schermate visitate, screenshot salvati`);
  }

  await browser.close();

  console.log(`\nScreenshot in ${SCREENSHOT_DIR}`);
  if (allErrors.length > 0) {
    console.error(`\n✗ ${allErrors.length} errori di console trovati:`);
    for (const e of allErrors) console.error(`  [${e.fixture} / ${e.tab}] ${e.error}`);
    process.exitCode = 1;
  } else {
    console.log('\n✓ Nessun errore di console su nessuna schermata, per nessuna fixture.');
  }
}

main();
