/**
 * verify-pma.ts
 * Verifica la calibrazione del modello vs prezzi medi reali di asta (PMeA 500).
 * Stampa: Prior puro, Renormalize con pool completo, Errore% vs PMA.
 * Esegui con: npx tsx scripts/verify-pma.ts
 */

import { priorPrice, renormalize } from '../src/core/price-model.js';
import {
  DEFAULT_PRICE_CURVES,
  DEFAULT_RESERVE_FRACTION,
} from '../src/core/config.js';
import type { Role, ManagerState } from '../src/core/types.js';
import type { PoolPlayer } from '../src/core/price-model.js';

// ─── Dati PMA reali ──────────────────────────────────────────────────────────
interface PmaRow { name: string; role: Role; qtA: number; pmeA500: number; }

// Qt.A massimo per ruolo (top player assoluto)
const MAX_QT: Record<Role, number> = { P: 18, D: 32, C: 30, A: 35 };

const PMA_DATA: PmaRow[] = [
  // PORTIERI
  { name: 'Svilar',               role: 'P', qtA: 18, pmeA500: 54 },
  { name: 'Martinez Jo.',         role: 'P', qtA: 17, pmeA500: 45 },
  { name: 'Carnesecchi',          role: 'P', qtA: 16, pmeA500: 46 },
  { name: 'Butez',                role: 'P', qtA: 16, pmeA500: 45 },
  { name: 'Maignan',              role: 'P', qtA: 15, pmeA500: 48 },
  { name: 'De Gea',               role: 'P', qtA: 13, pmeA500: 33 },
  { name: 'Meret',                role: 'P', qtA: 11, pmeA500: 40 },
  { name: 'Skorupski',            role: 'P', qtA: 10, pmeA500: 17 },
  { name: 'Caprile',              role: 'P', qtA: 9,  pmeA500: 13 },
  { name: 'Di Gregorio',          role: 'P', qtA: 9,  pmeA500: 12 },
  { name: 'Mandas',               role: 'P', qtA: 9,  pmeA500: 15 },
  { name: 'Okoye',                role: 'P', qtA: 9,  pmeA500: 15 },
  { name: 'Bijlow',               role: 'P', qtA: 8,  pmeA500: 10 },
  { name: 'Falcone',              role: 'P', qtA: 8,  pmeA500: 12 },
  { name: 'Daffara',              role: 'P', qtA: 7,  pmeA500: 1  },
  { name: 'Suzuki',               role: 'P', qtA: 7,  pmeA500: 8  },
  { name: 'Muric',                role: 'P', qtA: 7,  pmeA500: 6  },
  { name: 'Perin',                role: 'P', qtA: 6,  pmeA500: 3  },
  { name: 'Stankovic F.',         role: 'P', qtA: 6,  pmeA500: 4  },
  { name: 'Milinkovic-Savic V.',  role: 'P', qtA: 5,  pmeA500: 14 },
  // DIFENSORI
  { name: 'Dimarco',              role: 'D', qtA: 32, pmeA500: 78 },
  { name: 'Molina',               role: 'D', qtA: 18, pmeA500: 33 },
  { name: 'Wesley',               role: 'D', qtA: 17, pmeA500: 46 },
  { name: 'Akanji',               role: 'D', qtA: 16, pmeA500: 32 },
  { name: 'Bremer',               role: 'D', qtA: 15, pmeA500: 33 },
  { name: 'Mancini',              role: 'D', qtA: 15, pmeA500: 30 },
  { name: 'Bastoni',              role: 'D', qtA: 14, pmeA500: 32 },
  { name: 'Pavlovic',             role: 'D', qtA: 14, pmeA500: 27 },
  { name: 'Rrahmani',             role: 'D', qtA: 14, pmeA500: 26 },
  { name: 'Kalulu',               role: 'D', qtA: 13, pmeA500: 27 },
  { name: "N'Dicka",              role: 'D', qtA: 13, pmeA500: 21 },
  { name: 'Solet',                role: 'D', qtA: 13, pmeA500: 29 },
  { name: 'Stones',               role: 'D', qtA: 12, pmeA500: 18 },
  { name: 'Gila',                 role: 'D', qtA: 12, pmeA500: 20 },
  { name: 'Di Lorenzo',           role: 'D', qtA: 12, pmeA500: 25 },
  { name: 'Ostigard',             role: 'D', qtA: 11, pmeA500: 23 },
  { name: 'Bisseck',              role: 'D', qtA: 11, pmeA500: 19 },
  { name: 'Scalvini',             role: 'D', qtA: 10, pmeA500: 13 },
  { name: 'Ramon',                role: 'D', qtA: 10, pmeA500: 22 },
  { name: 'Cambiaso',             role: 'D', qtA: 9,  pmeA500: 20 },
  { name: 'Zappacosta',           role: 'D', qtA: 8,  pmeA500: 13 },
  { name: 'Dragusin',             role: 'D', qtA: 8,  pmeA500: 16 },
  { name: 'Jimenez A.',           role: 'D', qtA: 8,  pmeA500: 23 },
  { name: 'Spinazzola',           role: 'D', qtA: 8,  pmeA500: 17 },
  { name: 'Delprato',             role: 'D', qtA: 8,  pmeA500: 10 },
  { name: 'Couto',                role: 'D', qtA: 8,  pmeA500: 18 },
  { name: 'Vojvoda',              role: 'D', qtA: 8,  pmeA500: 13 },
  { name: 'Kaiki',                role: 'D', qtA: 7,  pmeA500: 10 },
  { name: 'Kelly L.',             role: 'D', qtA: 5,  pmeA500: 10 },
  { name: 'Kempf',                role: 'D', qtA: 5,  pmeA500: 10 },
  // CENTROCAMPISTI
  { name: 'Paz N.',               role: 'C', qtA: 30, pmeA500: 89 },
  { name: 'McTominay',            role: 'C', qtA: 28, pmeA500: 82 },
  { name: 'Calhanoglu',           role: 'C', qtA: 27, pmeA500: 70 },
  { name: 'Orsolini',             role: 'C', qtA: 26, pmeA500: 71 },
  { name: 'Pulisic',              role: 'C', qtA: 25, pmeA500: 71 },
  { name: 'Rabiot',               role: 'C', qtA: 22, pmeA500: 40 },
  { name: 'Baturina',             role: 'C', qtA: 19, pmeA500: 50 },
  { name: 'Da Cunha',             role: 'C', qtA: 18, pmeA500: 42 },
  { name: 'Zaniolo',              role: 'C', qtA: 18, pmeA500: 47 },
  { name: 'Atta',                 role: 'C', qtA: 17, pmeA500: 48 },
  { name: 'Barella',              role: 'C', qtA: 17, pmeA500: 35 },
  { name: 'Zaccagni',             role: 'C', qtA: 16, pmeA500: 44 },
  { name: 'De Bruyne',            role: 'C', qtA: 15, pmeA500: 36 },
  { name: 'Vlasic',               role: 'C', qtA: 14, pmeA500: 37 },
  { name: 'Gudmundsson A.',       role: 'C', qtA: 13, pmeA500: 29 },
  { name: 'Taylor K.',            role: 'C', qtA: 13, pmeA500: 25 },
  { name: 'Ederson D.S.',         role: 'C', qtA: 12, pmeA500: 22 },
  { name: 'Samardzic',            role: 'C', qtA: 12, pmeA500: 24 },
  { name: 'Conceicao',            role: 'C', qtA: 12, pmeA500: 27 },
  { name: 'Rowe',                 role: 'C', qtA: 11, pmeA500: 32 },
  { name: 'Zielinski',            role: 'C', qtA: 10, pmeA500: 32 },
  { name: 'Saelemaekers',         role: 'C', qtA: 10, pmeA500: 22 },
  // ATTACCANTI
  { name: 'Martinez L.',          role: 'A', qtA: 35, pmeA500: 164 },
  { name: 'Malen',                role: 'A', qtA: 34, pmeA500: 162 },
  { name: 'Thuram',               role: 'A', qtA: 29, pmeA500: 125 },
  { name: 'Hojlund',              role: 'A', qtA: 28, pmeA500: 117 },
  { name: 'Ramos G.',             role: 'A', qtA: 27, pmeA500: 118 },
  { name: 'Kolo Muani',           role: 'A', qtA: 26, pmeA500: 127 },
  { name: 'Kean',                 role: 'A', qtA: 25, pmeA500: 101 },
  { name: 'Yildiz',               role: 'A', qtA: 23, pmeA500: 97  },
  { name: 'Douvikas',             role: 'A', qtA: 20, pmeA500: 86  },
  { name: 'Scamacca',             role: 'A', qtA: 19, pmeA500: 61  },
  { name: 'Davis K.',             role: 'A', qtA: 19, pmeA500: 61  },
  { name: 'Krstovic',             role: 'A', qtA: 18, pmeA500: 41  },
  { name: 'Leao',                 role: 'A', qtA: 18, pmeA500: 37  },
  { name: 'Berardi',              role: 'A', qtA: 18, pmeA500: 47  },
  { name: 'De Ketelaere',         role: 'A', qtA: 17, pmeA500: 42  },
  { name: 'Dovbyk',               role: 'A', qtA: 16, pmeA500: 54  },
  { name: 'Esposito F.P.',        role: 'A', qtA: 16, pmeA500: 36  },
  { name: 'Pellegrino M.',        role: 'A', qtA: 15, pmeA500: 31  },
  { name: 'Laurientè',            role: 'A', qtA: 15, pmeA500: 31  },
  { name: 'Simeone',              role: 'A', qtA: 15, pmeA500: 50  },
  { name: 'Santos A.',            role: 'A', qtA: 14, pmeA500: 26  },
  { name: 'Dybala',               role: 'A', qtA: 14, pmeA500: 34  },
  { name: 'Castro S.',            role: 'A', qtA: 14, pmeA500: 31  },
  { name: 'Raspadori',            role: 'A', qtA: 13, pmeA500: 26  },
  { name: 'Pinamonti',            role: 'A', qtA: 13, pmeA500: 31  },
  { name: 'Colombo',              role: 'A', qtA: 11, pmeA500: 28  },
  { name: 'Diao',                 role: 'A', qtA: 11, pmeA500: 20  },
  { name: 'Adams A.',             role: 'A', qtA: 12, pmeA500: 16  },
];

// ─── Conversione Qt.A → score 0-100 ─────────────────────────────────────────
function qtToScore(qtA: number, role: Role): number {
  return Math.min(100, (qtA / MAX_QT[role]) * 100);
}

// ─── Pool completo con filler ────────────────────────────────────────────────
// renormalize() ha bisogno del listone completo per allocare correttamente i 250 slot.
// Dalla lista originale dell'utente: ~61 P, ~170 D, ~175 C, ~90 A → usiamo 60 P, 150 D, 170 C, 85 A.
const realPlayers: PoolPlayer[] = PMA_DATA.map((r, i) => ({
  id: `p${i}`,
  role: r.role,
  score: qtToScore(r.qtA, r.role),
}));

function makeFiller(role: Role, n: number, startId: number): PoolPlayer[] {
  return Array.from({ length: n }, (_, i) => ({ id: `filler_${role}_${startId + i}`, role, score: 2 }));
}

// Conteggio giocatori reali per ruolo nel dataset
const realCnt: Record<Role, number> = { P: 0, D: 0, C: 0, A: 0 };
for (const r of PMA_DATA) realCnt[r.role]++;

// Filler per raggiungere le dimensioni reali del listone (~550 giocatori totali)
const TARGET_POOL: Record<Role, number> = { P: 60, D: 150, C: 170, A: 85 };
const fillerPlayers: PoolPlayer[] = [
  ...makeFiller('P', Math.max(0, TARGET_POOL.P - realCnt.P), 1000),
  ...makeFiller('D', Math.max(0, TARGET_POOL.D - realCnt.D), 2000),
  ...makeFiller('C', Math.max(0, TARGET_POOL.C - realCnt.C), 3000),
  ...makeFiller('A', Math.max(0, TARGET_POOL.A - realCnt.A), 4000),
];
const fullPool: PoolPlayer[] = [...realPlayers, ...fillerPlayers];

// ─── 10 Manager con budget 500 ───────────────────────────────────────────────
const managers: ManagerState[] = Array.from({ length: 10 }, (_, i) => ({
  manager: { id: `m${i}`, name: `Manager ${i + 1}` } as any,
  creditsRemaining: 500,
  slotsRemaining: { P: 3, D: 8, C: 8, A: 6 },
  roster: [],
}));

// ─── Renormalize sul pool completo ───────────────────────────────────────────
const { pHat, ctot, reserve } = renormalize(fullPool, managers, DEFAULT_PRICE_CURVES, DEFAULT_RESERVE_FRACTION);

// ─── Output ──────────────────────────────────────────────────────────────────
const ROLES_ORDER: Role[] = ['P', 'D', 'C', 'A'];
const roleLabel: Record<Role, string> = { P: 'PORTIERI', D: 'DIFENSORI', C: 'CENTROCAMPISTI', A: 'ATTACCANTI' };

console.log('\n══════════════════════════════════════════════════════════════════════════');
console.log('  Verifica Calibrazione Modello vs PMeA Reali (10 manager × 500 cred.)');
console.log(`  Pool totale: ${fullPool.length} giocatori (${realPlayers.length} reali + ${fillerPlayers.length} filler)`);
console.log(`  Budget totale: ${ctot}  Riserva: ${reserve.toFixed(0)}  Target allocato: ${(ctot - reserve).toFixed(0)}`);
console.log('══════════════════════════════════════════════════════════════════════════\n');

let totalAbsErrRenorm = 0, totalAbsErrPrior = 0;
let totalBiasRenorm = 0;
let count = 0;
const outliers: string[] = [];

for (const role of ROLES_ORDER) {
  const rows = PMA_DATA
    .map((r, i) => ({ ...r, id: `p${i}`, score: qtToScore(r.qtA, r.role) }))
    .filter(r => r.role === role && r.pmeA500 > 1)
    .sort((a, b) => b.qtA - a.qtA);

  if (rows.length === 0) continue;

  console.log(`\n── ${roleLabel[role]} ──────────────────────────────────────────────────────`);
  console.log('');
  console.log('  ' + 'Nome'.padEnd(25) + 'Qt.A'.padStart(5) + ' Sc.'.padStart(5) + ' PMA'.padStart(6) + ' Prior'.padStart(7) + ' Norm'.padStart(6) + ' Err%'.padStart(7));
  console.log('  ' + '─'.repeat(72));

  for (const row of rows) {
    const predPrior  = Math.round(priorPrice(row.role, row.score, DEFAULT_PRICE_CURVES));
    const predRenorm = Math.round(pHat.get(row.id) ?? 1);
    const errPrior  = ((predPrior  - row.pmeA500) / row.pmeA500) * 100;
    const errRenorm = ((predRenorm - row.pmeA500) / row.pmeA500) * 100;
    const errStr = ((errRenorm >= 0 ? `+${errRenorm.toFixed(0)}` : `${errRenorm.toFixed(0)}`)).padStart(5) + '%';
    const flag = Math.abs(errRenorm) > 35 ? ' ⚠' : '';

    console.log(
      `  ${row.name.padEnd(24)}` +
      `${String(row.qtA).padStart(5)}` +
      `${String(Math.round(row.score)).padStart(5)}` +
      `${String(row.pmeA500).padStart(6)}` +
      `${String(predPrior).padStart(7)}` +
      `${String(predRenorm).padStart(6)}` +
      `${errStr.padStart(7)}${flag}`
    );

    totalAbsErrRenorm += Math.abs(errRenorm);
    totalAbsErrPrior  += Math.abs(errPrior);
    totalBiasRenorm   += errRenorm;
    count++;
    if (Math.abs(errRenorm) > 35) outliers.push(`${row.name} (${row.role}): norm=${predRenorm} prior=${predPrior} pma=${row.pmeA500} err=${errRenorm.toFixed(0)}%`);
  }
}

const mae      = totalAbsErrRenorm / count;
const maePrior = totalAbsErrPrior / count;
const bias     = totalBiasRenorm / count;

console.log('\n══════════════════════════════════════════════════════════════════════════');
console.log(`  N campioni (pma > 1)  : ${count}`);
console.log(`  MAE% Prior puro       : ${maePrior.toFixed(1)}%`);
console.log(`  MAE% Renormalize      : ${mae.toFixed(1)}%`);
console.log(`  Bias% Renormalize     : ${bias >= 0 ? '+' : ''}${bias.toFixed(1)}%  (+ sovrastima, - sottostima)`);
console.log('══════════════════════════════════════════════════════════════════════════\n');

if (outliers.length > 0) {
  console.log(`⚠  Outlier > 35% (${outliers.length} totali, mostrando i primi 12):`);
  outliers.slice(0, 12).forEach(o => console.log('   • ' + o));
  if (outliers.length > 12) console.log(`   ... e altri ${outliers.length - 12}`);
  console.log('');
}
