/**
 * calibrate-params.ts
 * Ricalibra A_ρ e θ_ρ sui dati PMA reali tramite regressione OLS su scala log.
 * Poi stampa i parametri da usare in config.ts e verifica la bontà del fit.
 *
 * Esegui con: npx tsx scripts/calibrate-params.ts
 */

import type { Role } from '../src/core/types.js';

// ────────────────────────────────────────────────────────────────────────────
// Dati reali PMA — Qt.A (scala normalizzata 0–100 MANUALE) e PMA crediti 500
// NOTA: qui usiamo Qt.A già come percentuale 0–100 (max=100 per il top).
// Scegliamo il top player come riferimento 100 per ogni ruolo.
// ────────────────────────────────────────────────────────────────────────────

interface PmaRow {
  name: string;
  role: Role;
  qtA: number;       // scala originale
  pmeA500: number;   // prezzo medio asta reale, budget 500
}

const PMA_DATA: PmaRow[] = [
  // PORTIERI (max Qt.A = 18, Svilar)
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
  { name: 'Suzuki',               role: 'P', qtA: 7,  pmeA500: 8  },
  { name: 'Muric',                role: 'P', qtA: 7,  pmeA500: 6  },
  { name: 'Perin',                role: 'P', qtA: 6,  pmeA500: 3  },
  { name: 'Stankovic F.',         role: 'P', qtA: 6,  pmeA500: 4  },
  { name: 'Milinkovic-Savic V.',  role: 'P', qtA: 5,  pmeA500: 14 },
  // DIFENSORI (max Qt.A = 32, Dimarco)
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
  // CENTROCAMPISTI (max Qt.A = 30, Paz N.)
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
  // ATTACCANTI (max Qt.A = 35, Martinez L.)
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

// ────────────────────────────────────────────────────────────────────────────
// Conversione Qt.A → score 0–100 per ruolo
// ────────────────────────────────────────────────────────────────────────────
const MAX_QT: Record<Role, number> = { P: 18, D: 32, C: 30, A: 35 };

function qtToScore(qtA: number, role: Role): number {
  return Math.min(100, (qtA / MAX_QT[role]) * 100);
}

// ────────────────────────────────────────────────────────────────────────────
// OLS su log(P) ~ θ*(s/100) + log(A)
// Variabili: y = log(pmeA), x = s/100 = qtA/MAX_QT
// Restituisce {A, theta, r2}
// ────────────────────────────────────────────────────────────────────────────
function fitLogLinear(data: PmaRow[], role: Role): { A: number; theta: number; r2: number } {
  const rows = data.filter(r => r.role === role && r.pmeA500 > 2);
  const n = rows.length;
  if (n < 2) throw new Error(`Too few data for ${role}`);

  const xs = rows.map(r => qtToScore(r.qtA, role) / 100);
  const ys = rows.map(r => Math.log(r.pmeA500));

  const xBar = xs.reduce((a, b) => a + b, 0) / n;
  const yBar = ys.reduce((a, b) => a + b, 0) / n;

  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - xBar) * (ys[i] - yBar); sxx += (xs[i] - xBar) ** 2; }

  const theta = sxy / sxx;         // slope
  const logA  = yBar - theta * xBar; // intercept
  const A = Math.exp(logA);

  // R²
  let ssTot = 0, ssRes = 0;
  for (let i = 0; i < n; i++) {
    const yPred = logA + theta * xs[i];
    ssTot += (ys[i] - yBar) ** 2;
    ssRes += (ys[i] - yPred) ** 2;
  }
  const r2 = 1 - ssRes / ssTot;

  return { A, theta, r2 };
}

const ROLES: Role[] = ['P', 'D', 'C', 'A'];
const roleLabel: Record<Role, string> = { P: 'PORTIERI', D: 'DIFENSORI', C: 'CENTROCAMPISTI', A: 'ATTACCANTI' };

console.log('\n══════════════════════════════════════════════════════════════════════');
console.log('  Calibrazione parametri A_ρ e θ_ρ via OLS log-lineare sui dati PMA');
console.log('══════════════════════════════════════════════════════════════════════\n');

const fittedParams: Record<Role, { A: number; theta: number }> = {} as any;

for (const role of ROLES) {
  const { A, theta, r2 } = fitLogLinear(PMA_DATA, role);
  fittedParams[role] = { A, theta };
  console.log(`${roleLabel[role].padEnd(20)}  A = ${A.toFixed(4)}   θ = ${theta.toFixed(4)}   R² = ${r2.toFixed(3)}`);
}

// ────────────────────────────────────────────────────────────────────────────
// Stampa snippet pronto da copiare in config.ts
// ────────────────────────────────────────────────────────────────────────────
console.log('\n──────────────────────────────────────────────────────────────────────');
console.log('  SNIPPET DA COPIARE IN config.ts:\n');

const fmtA = (r: Role) => fittedParams[r].A.toFixed(4);
const fmtT = (r: Role) => fittedParams[r].theta.toFixed(4);

console.log(`export const DEFAULT_A: Record<Role, number> = { P: ${fmtA('P')}, D: ${fmtA('D')}, C: ${fmtA('C')}, A: ${fmtA('A')} };`);
console.log(`export const DEFAULT_THETA: Record<Role, number> = { P: ${fmtT('P')}, D: ${fmtT('D')}, C: ${fmtT('C')}, A: ${fmtT('A')} };`);

// ────────────────────────────────────────────────────────────────────────────
// Verifica: confronta prezzo predetto vs PMA con nuovi parametri
// ────────────────────────────────────────────────────────────────────────────
console.log('\n──────────────────────────────────────────────────────────────────────');
console.log('  Verifica fit (prior puro, senza renormalize):\n');

let totalAbsErr = 0, count = 0;

for (const role of ROLES) {
  const rows = PMA_DATA
    .filter(r => r.role === role && r.pmeA500 > 2)
    .sort((a, b) => b.qtA - a.qtA);

  console.log(`  ${roleLabel[role]}`);
  console.log('  ' + 'Nome'.padEnd(24) + 'Qt.A'.padStart(5) + '  Sc'.padStart(5) + '  PMA'.padStart(6) + '  Pred'.padStart(7) + '  Err%'.padStart(7));
  console.log('  ' + '─'.repeat(65));

  const { A, theta } = fittedParams[role];

  for (const r of rows) {
    const s = qtToScore(r.qtA, role) / 100;
    const pred = Math.round(A * Math.exp(theta * s));
    const err = ((pred - r.pmeA500) / r.pmeA500) * 100;
    const flag = Math.abs(err) > 30 ? ' ⚠' : '';
    console.log(
      `  ${r.name.padEnd(24)}` +
      `${String(r.qtA).padStart(5)}` +
      `${String(Math.round(qtToScore(r.qtA, role))).padStart(5)}` +
      `${String(r.pmeA500).padStart(6)}` +
      `${String(pred).padStart(7)}` +
      `${((err >= 0 ? `+${err.toFixed(0)}` : `${err.toFixed(0)}`)).padStart(6)}%${flag}`
    );
    totalAbsErr += Math.abs(err);
    count++;
  }
  console.log('');
}

console.log(`  MAE% globale con nuovi parametri: ${(totalAbsErr / count).toFixed(1)}%`);
console.log('══════════════════════════════════════════════════════════════════════\n');
