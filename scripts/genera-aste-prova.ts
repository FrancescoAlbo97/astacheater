// Genera "aste di prova" IMPORTABILI nella UI (stesso formato dell'export `{version, log}`,
// pulsante "Importa"), per esplorare le decisioni dell'algoritmo senza dover inserire vendite a
// mano una per una. Richiesta diretta dell'utente: "trova un modo per farmi vedere delle aste
// intermedie... ogni volta che provo a inserire dei giocatori da solo, mi rompo le scatole. Magari
// sfrutta i valori reali dei prezzi dei giocatori che ti ho passato".
//
// Usa DUE fonti già raccolte in questa sessione, tenute deliberatamente separate invece di
// sovrascrivere l'una con l'altra come aveva fatto `unisci_prezzi_reali.py` (quello serviva a un
// test diverso, il clamp CSV >100):
//   - `listone_2026_27.csv`  → punteggio (0-100) e titolarità (0-1) REALI dell'utente: guidano
//     `myValue`, quindi le raccomandazioni che vedrà — usati per TUTTI i 496 giocatori.
//   - `pma_raw.csv`          → prezzo medio REALMENTE pagato l'anno scorso (segmento 10sq_500):
//     usato SOLO per decidere a che prezzo un giocatore risulta già venduto agli avversari nella
//     "asta di prova" — non tocca mai il punteggio.
//
// "Io" (manager id 'me') non compra MAI nulla in questi file: tela bianca, l'utente esplora
// qualunque giocatore rimasto come se fosse il suo turno, con gli avversari già parzialmente in
// rosa a prezzi reali — esattamente il "come dovrebbe andare" richiesto, niente inserimento manuale.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mulberry32 } from '../src/core/rng.js';
import { makeDefaultLeagueConfig, DEFAULT_SLOTS, DEFAULT_BUDGET } from '../src/core/config.js';
import { ROLES } from '../src/core/types.js';
import type { AuctionEvent, Player, Role } from '../src/core/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../download_data');
const OUT_DIR = join(__dirname, '../download_data/aste-di-prova');

function parseCsv(path: string): Record<string, string>[] {
  const text = readFileSync(path, 'utf-8').replace(/\r\n/g, '\n').trim();
  const [headerLine, ...lines] = text.split('\n');
  const headers = headerLine!.split(',');
  return lines.map((line) => {
    const cells = line.split(',');
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = cells[i] ?? ''));
    return row;
  });
}

function surnameToken(nome: string): string {
  const first = nome
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .split(/\s+/)[0];
  return (first ?? '').toLowerCase().replace(/[^a-z]/g, '');
}

interface ListonePlayer {
  readonly id: string;
  readonly name: string;
  readonly team: string;
  readonly role: Role;
  readonly score: number;
  readonly ptOverride: number;
  realPrice: number | null; // riempito dopo l'incrocio con pma_raw.csv
}

const listoneRows = parseCsv(join(DATA_DIR, 'listone_2026_27.csv'));
const players: ListonePlayer[] = listoneRows.map((row, i) => ({
  id: `p${i}`,
  name: row.nome!,
  team: row.squadra!,
  role: row.ruolo as Role,
  score: Math.max(1, Math.min(100, Math.round(Number(row.punteggio)))),
  ptOverride: Math.max(0, Math.min(1, Number(row.titolarita)) || 0),
  realPrice: null,
}));

// Incrocio con i prezzi medi reali (segmento 10sq_500), stessa convenzione di
// unisci_prezzi_reali.py: cognome+ruolo, scarta gli incroci ambigui (più di un giocatore pma_raw
// con lo stesso cognome+ruolo) invece di indovinare.
const pmaRows = parseCsv(join(DATA_DIR, 'pma_raw.csv'));
const pricesByKey = new Map<string, number[]>();
for (const row of pmaRows) {
  const raw = row['prezzo_10sq_500'];
  if (!raw) continue;
  const key = `${surnameToken(row.nome!)}|${row.ruolo}`;
  const arr = pricesByKey.get(key) ?? [];
  arr.push(Number(raw));
  pricesByKey.set(key, arr);
}
let matched = 0;
let ambiguous = 0;
for (const p of players) {
  const key = `${surnameToken(p.name)}|${p.role}`;
  const prices = pricesByKey.get(key);
  if (!prices) continue;
  if (prices.length === 1) {
    p.realPrice = Math.max(1, Math.round(prices[0]!));
    matched++;
  } else {
    ambiguous++;
  }
}
console.log(`listone: ${players.length} giocatori, incrociati con prezzo reale: ${matched}, ambigui scartati: ${ambiguous}`);

// --- Assegnazione agli avversari, rispettando slot e budget -----------------------------------
const league = makeDefaultLeagueConfig();
const opponents = league.managers.filter((m) => !m.isMe);

interface OpponentBook {
  readonly id: string;
  credits: number;
  slotsUsed: Record<Role, number>;
}
const books = new Map<string, OpponentBook>(
  opponents.map((m) => [m.id, { id: m.id, credits: DEFAULT_BUDGET, slotsUsed: { P: 0, D: 0, C: 0, A: 0 } }]),
);

function openSlots(book: OpponentBook, role: Role): number {
  return DEFAULT_SLOTS[role] - book.slotsUsed[role];
}
function remainingSlotsTotal(book: OpponentBook): number {
  return ROLES.reduce((s, r) => s + openSlots(book, r), 0);
}

const rng = mulberry32(20260819);
function shuffle<T>(arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const sellable = shuffle(players.filter((p) => p.realPrice !== null));

interface GeneratedSale {
  readonly playerId: string;
  readonly managerId: string;
  readonly price: number;
}
const sales: GeneratedSale[] = [];

for (const p of sellable) {
  const price = p.realPrice!;
  const eligible = opponents.filter((m) => {
    const book = books.get(m.id)!;
    if (openSlots(book, p.role) <= 0) return false;
    // dopo aver pagato, deve restargli almeno 1 credito per ciascuno slot ancora da riempire
    // (incluso questo acquisto stesso, già scalato qui) — altrimenti l'asta "di prova" prodotta
    // sarebbe internamente incoerente (un manager che non può più completare la rosa).
    const remainingAfter = remainingSlotsTotal(book) - 1;
    return book.credits - price >= remainingAfter;
  });
  if (eligible.length === 0) continue; // nessuno può permetterselo/ha slot: resta nel pool, invenduto
  const chosen = eligible[Math.floor(rng() * eligible.length)]!;
  const book = books.get(chosen.id)!;
  book.credits -= price;
  book.slotsUsed[p.role]++;
  sales.push({ playerId: p.id, managerId: chosen.id, price });
}

console.log(`vendite valide generate: ${sales.length} / ${sellable.length} candidati vendibili`);

// --- Checkpoint a diversi stadi dell'asta, come richiesto ("aste intermedie") -----------------
const CHECKPOINTS: readonly { readonly frac: number; readonly file: string; readonly label: string }[] = [
  { frac: 0.15, file: 'asta-01-appena-iniziata.json', label: 'appena iniziata (~15% venduto)' },
  { frac: 0.4, file: 'asta-02-un-terzo.json', label: 'un terzo circa (~40% venduto)' },
  { frac: 0.65, file: 'asta-03-a-meta.json', label: 'oltre metà (~65% venduto)' },
  { frac: 0.9, file: 'asta-04-quasi-finita.json', label: 'quasi finita (~90% venduto)' },
];

const allPlayers: Player[] = players.map((p) => ({ id: p.id, name: p.name, team: p.team, role: p.role }));
const scoreEvents: AuctionEvent[] = players.map((p) => ({
  t: 'player.score',
  playerId: p.id,
  score: p.score,
  ptOverride: p.ptOverride,
}));

mkdirSync(OUT_DIR, { recursive: true });
for (const cp of CHECKPOINTS) {
  const n = Math.round(sales.length * cp.frac);
  const saleEvents: AuctionEvent[] = sales.slice(0, n).map((s) => ({ t: 'sale', playerId: s.playerId, managerId: s.managerId, price: s.price }));
  const log: AuctionEvent[] = [
    { t: 'league.setup', config: league },
    { t: 'players.load', players: allPlayers },
    ...scoreEvents,
    ...saleEvents,
  ];
  writeFileSync(join(OUT_DIR, cp.file), JSON.stringify({ version: 1, log }, null, 2));
  console.log(`${cp.file.padEnd(30)} ${cp.label.padEnd(28)} ${n} vendite`);
}
console.log(`\nScritti in: ${OUT_DIR}`);
