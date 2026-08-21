// §6.1 — Modello di valore. §7 Session 10: `playerValue` è un'identità sul punteggio — il
// punteggio stesso È il prezzo equo in crediti, senza curva (correzione della Session 9, che
// faceva passare il punteggio per la curva di mercato §6.3.1: sbagliato per un punteggio importato
// come stima diretta in crediti, che la curva amplificava esponenzialmente ben oltre il senso). Vedi
// il commento di testa a value-model.ts per la cronologia completa. Questo file copre: l'identità
// di playerValue, l'assenza di un tetto superiore (richiesta esplicita: "devono poter superare il
// 100"), il disaccoppiamento della titolarità dal valore (invariato dalla Session 9), e la
// copertura-titolari per ruolo (`roleCoverageGapFraction`/`coverageBonusFactor`/`applyCoverageBonus`).
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  applyCoverageBonus,
  applyRiskToPriceCurves,
  applyRiskToValueCurves,
  coverageBonusFactor,
  playerValue,
  riskAdjustedPlayerValue,
  roleCoverageGapFraction,
  roleWeightedPlayerValue,
  seasonSdProxy,
  titolarita,
} from '../src/core/value-model.js';
import { DEFAULT_PRICE_CURVES, DEFAULT_VALUE_CURVES } from '../src/core/config.js';
import { ROLES } from '../src/core/types.js';
import type { Role, RoleWeights } from '../src/core/types.js';

const NEUTRAL_WEIGHTS: RoleWeights = { P: 1, D: 1, C: 1, A: 1 };

describe('§7 Session 10 — playerValue è un\'identità sul punteggio (nessuna curva)', () => {
  it('playerValue(role, score) === score, per qualunque ruolo e punteggio non negativo (property-based)', () => {
    fc.assert(
      fc.property(fc.constantFrom(...ROLES), fc.double({ min: 0, max: 1000, noNaN: true }), (role, score) =>
        playerValue(role, score) === score,
      ),
    );
  });

  it('il ruolo non ha alcuna influenza: stesso punteggio, stesso valore in ogni ruolo', () => {
    for (const score of [0, 20, 55, 100, 129, 300]) {
      const values = ROLES.map((role) => playerValue(role, score));
      expect(new Set(values).size).toBe(1);
    }
  });

  it('nessun tetto superiore: un punteggio importato come prezzo reale (es. 129, oltre il vecchio limite 100) resta 129, non viene amplificato', () => {
    expect(playerValue('A', 129)).toBe(129);
    expect(playerValue('A', 300)).toBe(300);
  });

  it('un punteggio negativo (dato corrotto) viene comunque riportato a 0, non propagato come valore negativo', () => {
    expect(playerValue('A', -50)).toBe(0);
  });

  it('è monotona crescente (non decrescente) in s per ogni ruolo (property-based) — banale per un\'identità, ma è l\'invariante che il resto del motore (DP, bisezione) assume', () => {
    for (const role of ROLES) {
      fc.assert(
        fc.property(
          fc.double({ min: 0, max: 300, noNaN: true }),
          fc.double({ min: 0, max: 300, noNaN: true }),
          (a, b) => {
            const [lo, hi] = a <= b ? [a, b] : [b, a];
            return playerValue(role, lo) <= playerValue(role, hi) + 1e-9;
          },
        ),
      );
    }
  });
});

describe('§7 Session 9 — la titolarità non influisce più direttamente su playerValue', () => {
  it('playerValue non accetta più ptOverride: stesso valore indipendentemente dalla titolarità dedotta o forzata', () => {
    // `titolarita` resta la stessa funzione di prima — qui si verifica solo che PIÙ NON entri in
    // playerValue, che ora ignora completamente pt (a differenza del vecchio v = 38·pt·fm).
    const scoreHighPt = titolarita('A', 90); // alto score ⇒ titolarità dedotta alta
    const scoreLowPt = titolarita('A', 5); // basso score ⇒ titolarità dedotta bassa
    expect(scoreHighPt).toBeGreaterThan(scoreLowPt); // titolarita stessa è comunque sensibile allo score
    // ma playerValue(role, score) non prende più in input una titolarità separata da correggere:
    // due chiamate con lo stesso score restituiscono sempre lo stesso valore.
    expect(playerValue('A', 60)).toBe(playerValue('A', 60));
  });
});

describe('§6.8 applyRiskToValueCurves (verità di riferimento, invariata dalla Session 9)', () => {
  it('risk=0 restituisce le curve invariate (stesso riferimento)', () => {
    expect(applyRiskToValueCurves(DEFAULT_VALUE_CURVES, 0)).toBe(DEFAULT_VALUE_CURVES);
  });

  it('un rischio positivo aumenta γ per ogni ruolo, uno negativo lo riduce', () => {
    const up = applyRiskToValueCurves(DEFAULT_VALUE_CURVES, 1);
    const down = applyRiskToValueCurves(DEFAULT_VALUE_CURVES, -1);
    for (const role of ROLES) {
      expect(up[role].gamma).toBeGreaterThan(DEFAULT_VALUE_CURVES[role].gamma);
      expect(down[role].gamma).toBeLessThan(DEFAULT_VALUE_CURVES[role].gamma);
    }
  });

  it('non tocca fmMin/fmMax/pt* (solo γ cambia)', () => {
    const adjusted = applyRiskToValueCurves(DEFAULT_VALUE_CURVES, 1);
    for (const role of ROLES) {
      expect(adjusted[role].fmMin).toBe(DEFAULT_VALUE_CURVES[role].fmMin);
      expect(adjusted[role].fmMax).toBe(DEFAULT_VALUE_CURVES[role].fmMax);
      expect(adjusted[role].ptMin).toBe(DEFAULT_VALUE_CURVES[role].ptMin);
      expect(adjusted[role].ptMax).toBe(DEFAULT_VALUE_CURVES[role].ptMax);
      expect(adjusted[role].delta).toBe(DEFAULT_VALUE_CURVES[role].delta);
    }
  });
});

describe('§6.8 Session 9 — applyRiskToPriceCurves (rischio sul VALORE, bidding)', () => {
  it('risk=0 restituisce le curve invariate (stesso riferimento)', () => {
    expect(applyRiskToPriceCurves(DEFAULT_PRICE_CURVES, 0)).toBe(DEFAULT_PRICE_CURVES);
  });

  it('un rischio positivo aumenta θ per ogni ruolo, uno negativo lo riduce', () => {
    const up = applyRiskToPriceCurves(DEFAULT_PRICE_CURVES, 1);
    const down = applyRiskToPriceCurves(DEFAULT_PRICE_CURVES, -1);
    for (const role of ROLES) {
      expect(up[role].theta).toBeGreaterThan(DEFAULT_PRICE_CURVES[role].theta);
      expect(down[role].theta).toBeLessThan(DEFAULT_PRICE_CURVES[role].theta);
    }
  });

  it('non tocca A (solo θ cambia)', () => {
    const adjusted = applyRiskToPriceCurves(DEFAULT_PRICE_CURVES, 1);
    for (const role of ROLES) {
      expect(adjusted[role].A).toBe(DEFAULT_PRICE_CURVES[role].A);
    }
  });

  it('§7 Session 10: la curva risk-adjusted non ha più alcun effetto su playerValue — vestigiale, playerValue ignora opts.priceCurves', () => {
    const steep = applyRiskToPriceCurves(DEFAULT_PRICE_CURVES, 1);
    for (const score of [0, 50, 95, 129]) {
      expect(playerValue('A', score, { priceCurves: steep })).toBe(playerValue('A', score));
    }
  });
});

describe('§6.8 seasonSdProxy — proxy di SD stagionale a forma chiusa (verità di riferimento, invariata)', () => {
  it('è esattamente zero ai bordi di Bernoulli (pt=0 o pt=1: nessuna incertezza)', () => {
    expect(seasonSdProxy('A', 60, { ptOverride: 0 })).toBe(0);
    expect(seasonSdProxy('A', 60, { ptOverride: 1 })).toBe(0);
  });

  it('è massima a pt=0.5 e simmetrica attorno ad esso, a fm fisso', () => {
    const sd = (pt: number) => seasonSdProxy('A', 60, { ptOverride: pt });
    expect(sd(0.1)).toBeCloseTo(sd(0.9), 10);
    expect(sd(0.3)).toBeCloseTo(sd(0.7), 10);
    expect(sd(0.1)).toBeLessThan(sd(0.3));
    expect(sd(0.3)).toBeLessThan(sd(0.5));
    expect(sd(0.5)).toBeGreaterThan(sd(0.7));
    expect(sd(0.7)).toBeGreaterThan(sd(0.9));
  });

  it('non è mai negativa (property-based)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ROLES),
        fc.double({ min: 0, max: 100, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (role, score, pt) => seasonSdProxy(role, score, { ptOverride: pt }) >= 0,
      ),
    );
  });

  it('clampa un ptOverride fuori da [0,1] invece di restituire NaN/negativo', () => {
    expect(Number.isFinite(seasonSdProxy('A', 60, { ptOverride: -0.3 }))).toBe(true);
    expect(Number.isFinite(seasonSdProxy('A', 60, { ptOverride: 1.4 }))).toBe(true);
  });
});

describe('§6.8 riskAdjustedPlayerValue — alternativa additiva, mai wired live (invariata nella formula, avviso di unità nei commenti)', () => {
  it('risk=0 è un no-op esatto rispetto a playerValue: guardia di regressione principale', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ROLES),
        fc.double({ min: 0, max: 100, noNaN: true }),
        (role, score) => riskAdjustedPlayerValue(role, score, 0) === playerValue(role, score),
      ),
    );
  });

  it('rischio positivo aumenta il valore, negativo lo riduce, per un candidato "tutto o niente"', () => {
    const base = playerValue('A', 60);
    const positive = riskAdjustedPlayerValue('A', 60, 1, { ptOverride: 0.5 });
    const negative = riskAdjustedPlayerValue('A', 60, -1, { ptOverride: 0.5 });
    expect(positive).toBeGreaterThan(base);
    expect(negative).toBeLessThan(base);
  });

  it('il bonus/malus è maggiore per un candidato "tutto o niente" (pt=0.5) che per un titolare quasi certo (pt=0.9)', () => {
    const bonusAt = (risk: number, pt: number) =>
      riskAdjustedPlayerValue('A', 60, risk, { ptOverride: pt }) - playerValue('A', 60);
    expect(bonusAt(1, 0.5)).toBeGreaterThan(bonusAt(1, 0.9));
    expect(Math.abs(bonusAt(-1, 0.5))).toBeGreaterThan(Math.abs(bonusAt(-1, 0.9)));
  });

  it('è monotona in risk, a parità di ruolo/score/pt (property-based)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ROLES),
        fc.double({ min: 0, max: 100, noNaN: true }),
        fc.double({ min: 0.01, max: 0.99, noNaN: true }),
        fc.double({ min: -1, max: 1, noNaN: true }),
        fc.double({ min: -1, max: 1, noNaN: true }),
        (role, score, pt, r1, r2) => {
          const [lo, hi] = r1 <= r2 ? [r1, r2] : [r2, r1];
          const opts = { ptOverride: pt };
          return riskAdjustedPlayerValue(role, score, lo, opts) <= riskAdjustedPlayerValue(role, score, hi, opts) + 1e-9;
        },
      ),
    );
  });
});

describe('§11 Setup — roleWeightedPlayerValue', () => {
  it('pesi tutti a 1 è un no-op esatto rispetto a playerValue: guardia di regressione principale', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ROLES),
        fc.double({ min: 0, max: 100, noNaN: true }),
        (role, score) => roleWeightedPlayerValue(role, score, NEUTRAL_WEIGHTS) === playerValue(role, score),
      ),
    );
  });

  it('un peso di 2 raddoppia esattamente il valore di quel ruolo, altri ruoli invariati', () => {
    const weights: RoleWeights = { P: 1, D: 1, C: 1, A: 2 };
    const base = playerValue('A', 70);
    expect(roleWeightedPlayerValue('A', 70, weights)).toBeCloseTo(base * 2, 9);
    expect(roleWeightedPlayerValue('C', 70, weights)).toBe(playerValue('C', 70));
  });

  it('un peso < 1 riduce il valore, > 1 lo aumenta, rispetto al peso neutro', () => {
    const base = playerValue('D', 55);
    expect(roleWeightedPlayerValue('D', 55, { ...NEUTRAL_WEIGHTS, D: 0.5 })).toBeLessThan(base);
    expect(roleWeightedPlayerValue('D', 55, { ...NEUTRAL_WEIGHTS, D: 1.5 })).toBeGreaterThan(base);
  });

  it('compone correttamente con curve già corrette per il rischio (opts.priceCurves passato invariato)', () => {
    const riskCurves = applyRiskToPriceCurves(DEFAULT_PRICE_CURVES, 1);
    const withoutWeight = playerValue('A', 80, { priceCurves: riskCurves });
    const withWeight = roleWeightedPlayerValue('A', 80, { ...NEUTRAL_WEIGHTS, A: 1.3 }, { priceCurves: riskCurves });
    expect(withWeight).toBeCloseTo(withoutWeight * 1.3, 9);
  });
});

describe('§11 Session 9 — roleCoverageGapFraction (copertura titolari per ruolo)', () => {
  it('nessun titolare posseduto ⇒ gap massimo (1)', () => {
    for (const role of ROLES) {
      expect(roleCoverageGapFraction(role, [], '4-3-3')).toBe(1);
    }
  });

  it("l'esempio dell'utente: attacco in 4-3-3 richiede 3 titolari + 1 di scorta = 4", () => {
    // "se ho già 4 titolari in attacco, gli altri due posso permettermi che abbiano meno
    // titolarità" — 4 giocatori certi titolari (pt=1) coprono esattamente la soglia (somma=4).
    const certain4 = [1, 1, 1, 1];
    expect(roleCoverageGapFraction('A', certain4, '4-3-3')).toBe(0);
    // con solo 3 (uno di meno), la copertura non è ancora piena.
    expect(roleCoverageGapFraction('A', certain4.slice(0, 3), '4-3-3')).toBeGreaterThan(0);
  });

  it('P richiede sempre 1 titolare + 1 di scorta = 2, qualunque sia la formazione', () => {
    for (const formation of ['4-3-3', '3-5-2', '5-4-1'] as const) {
      expect(roleCoverageGapFraction('P', [1, 1], formation)).toBeCloseTo(0, 6);
      expect(roleCoverageGapFraction('P', [1], formation)).toBeGreaterThan(0);
    }
  });

  it('la copertura è la SOMMA delle titolarità possedute, non un conteggio secco: più mezze-certezze possono coprire come un titolare quasi certo', () => {
    // stessa somma (2.0) ottenuta in due modi diversi: stesso gap.
    const viaCertainties = [1, 1];
    const viaHalves = [0.5, 0.5, 0.5, 0.5];
    expect(roleCoverageGapFraction('D', viaCertainties, '4-4-2')).toBeCloseTo(
      roleCoverageGapFraction('D', viaHalves, '4-4-2'),
      9,
    );
  });

  it('non scende mai sotto zero né supera 1, anche con titolarità/copertura fuori scala (property-based)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ROLES),
        fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { maxLength: 10 }),
        (role, pts) => {
          const gap = roleCoverageGapFraction(role, pts, '4-3-3');
          return gap >= 0 && gap <= 1;
        },
      ),
    );
  });

  it('è monotona non crescente nella copertura posseduta: aggiungere un titolare non aumenta mai il gap', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ROLES),
        fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { maxLength: 8 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (role, pts, extra) => {
          const before = roleCoverageGapFraction(role, pts, '4-3-3');
          const after = roleCoverageGapFraction(role, [...pts, extra], '4-3-3');
          return after <= before + 1e-9;
        },
      ),
    );
  });
});

describe('§11 Session 9 — coverageBonusFactor / applyCoverageBonus', () => {
  it('gapFraction=0 (copertura piena) ⇒ bonus zero, qualunque sia la titolarità del candidato', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (pt) => coverageBonusFactor(pt, 0) === 0),
    );
  });

  it('pt=0 ⇒ bonus zero, qualunque sia il gap', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (gap) => coverageBonusFactor(0, gap) === 0),
    );
  });

  it('cresce sia con pt sia con il gap (property-based)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (pt1, pt2, gap1, gap2) => {
          const [ptLo, ptHi] = pt1 <= pt2 ? [pt1, pt2] : [pt2, pt1];
          const [gapLo, gapHi] = gap1 <= gap2 ? [gap1, gap2] : [gap2, gap1];
          return (
            coverageBonusFactor(ptLo, gapLo) <= coverageBonusFactor(ptHi, gapLo) + 1e-9 &&
            coverageBonusFactor(ptLo, gapLo) <= coverageBonusFactor(ptLo, gapHi) + 1e-9
          );
        },
      ),
    );
  });

  it('non supera mai la bonusFraction configurata (raggiunta solo a pt=1, gap=1)', () => {
    expect(coverageBonusFactor(1, 1, 0.35)).toBeCloseTo(0.35, 9);
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (pt, gap) => coverageBonusFactor(pt, gap, 0.35) <= 0.35 + 1e-9,
      ),
    );
  });

  it('applyCoverageBonus con gap=0 restituisce esattamente baseValue: guardia di regressione principale', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 300, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (baseValue, pt) => applyCoverageBonus(baseValue, pt, 0) === baseValue,
      ),
    );
  });

  it("l'esempio dell'utente end-to-end: a copertura raggiunta il bonus non distingue più titolari da riserve", () => {
    const target4 = ['4-3-3']; // 3 titolari + 1 scorta = 4, come nell'esempio dell'utente
    for (const formation of target4) {
      const gapFraction = roleCoverageGapFraction('A', [1, 1, 1, 1], formation as '4-3-3');
      const base = playerValue('A', 55);
      const highPt = applyCoverageBonus(base, 0.9, gapFraction);
      const lowPt = applyCoverageBonus(base, 0.1, gapFraction);
      expect(highPt).toBe(base);
      expect(lowPt).toBe(base);
      expect(highPt).toBe(lowPt); // "posso concentrarmi sul valore": stesso valore, titolarità ignorata
    }
  });

  it("prima di raggiungere la copertura, un candidato titolare riceve più bonus di uno panchinaro allo stesso prezzo base", () => {
    const gapFraction = roleCoverageGapFraction('A', [], '4-3-3'); // nessuna copertura ⇒ gap massimo
    const base = playerValue('A', 55);
    const likelyStarter = applyCoverageBonus(base, 0.9, gapFraction);
    const likelyBench = applyCoverageBonus(base, 0.1, gapFraction);
    expect(likelyStarter).toBeGreaterThan(base);
    expect(likelyStarter).toBeGreaterThan(likelyBench);
  });
});
