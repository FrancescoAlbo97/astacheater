// Test per la funzionalità di copertura titolari personalizzata (§11 Setup)
// Verifica che le soglie personalizzate sovrascrivano il default "formazione + 1 scorta"

import { describe, it, expect } from 'vitest';
import { requiredRoleCoverage } from '../src/core/config.js';
import { roleCoverageGapFraction } from '../src/core/value-model.js';
import type { Role } from '../src/core/types.js';

describe('§11 Setup — Copertura titolari personalizzata', () => {
  const formation = '4-3-3' as const;

  it('usa il default (formazione + 1) se non fornito override', () => {
    // 4-3-3: P=1, D=4, C=3, A=3 → default: +1 scorta → P=2, D=5, C=4, A=4
    expect(requiredRoleCoverage('P', formation)).toBe(2);
    expect(requiredRoleCoverage('D', formation)).toBe(5);
    expect(requiredRoleCoverage('C', formation)).toBe(4);
    expect(requiredRoleCoverage('A', formation)).toBe(4);
  });

  it('usa gli override specificati dall\'utente', () => {
    const overrides = { P: 1, D: 6, C: 5, A: 4 };
    expect(requiredRoleCoverage('P', formation, overrides)).toBe(1);
    expect(requiredRoleCoverage('D', formation, overrides)).toBe(6);
    expect(requiredRoleCoverage('C', formation, overrides)).toBe(5);
    expect(requiredRoleCoverage('A', formation, overrides)).toBe(4);
  });

  it('usa override parziale (solo alcuni ruoli)', () => {
    const overrides: Partial<Record<Role, number>> = { D: 6 };
    expect(requiredRoleCoverage('P', formation, overrides)).toBe(2); // default
    expect(requiredRoleCoverage('D', formation, overrides)).toBe(6); // override
    expect(requiredRoleCoverage('C', formation, overrides)).toBe(4); // default
    expect(requiredRoleCoverage('A', formation, overrides)).toBe(4); // default
  });

  it('calcola correttamente il gap fraction con override', () => {
    const overrides = { P: 1, D: 6, C: 5, A: 4 };
    
    // Scenario: ho già 4.0 titolarità in difesa (es. 4 titolari pieni)
    // Target: 6 → gap = 6 - 4 = 2 → gapFraction = 2/6 = 0.333...
    const ownedPtsD = [1.0, 1.0, 1.0, 1.0];
    const gapFracD = roleCoverageGapFraction('D', ownedPtsD, formation, overrides);
    expect(gapFracD).toBeCloseTo((6 - 4) / 6, 4);

    // Scenario: ho già 5.0 titolarità in attacco (target: 4)
    // Gap = 0 → gapFraction = 0 (copertura raggiunta)
    const ownedPtsA = [1.0, 1.0, 1.0, 1.0, 1.0];
    const gapFracA = roleCoverageGapFraction('A', ownedPtsA, formation, overrides);
    expect(gapFracA).toBe(0);

    // Scenario: nessun titolare posseduto → gapFraction = 1
    const ownedPtsC: number[] = [];
    const gapFracC = roleCoverageGapFraction('C', ownedPtsC, formation, overrides);
    expect(gapFracC).toBe(1);
  });

  it('confronta comportamento con e senza override', () => {
    // Con default: target D = 5 (4+1)
    // Con override: target D = 6
    const ownedPtsD = [1.0, 1.0, 1.0]; // 3 titolari posseduti

    const gapFracDefault = roleCoverageGapFraction('D', ownedPtsD, formation);
    const gapFracOverride = roleCoverageGapFraction('D', ownedPtsD, formation, { D: 6 });

    // Default: gap = 5-3 = 2 → gapFraction = 2/5 = 0.4
    expect(gapFracDefault).toBeCloseTo(0.4, 4);

    // Override: gap = 6-3 = 3 → gapFraction = 3/6 = 0.5
    expect(gapFracOverride).toBeCloseTo(0.5, 4);

    // L'override rende il requisito più stringente → gap fraction maggiore
    expect(gapFracOverride).toBeGreaterThan(gapFracDefault);
  });

  it('gap fraction = 0 quando la copertura è raggiunta o superata', () => {
    const overrides = { P: 1, D: 6, C: 5, A: 4 };
    
    // Superamento della soglia: gap = max(0, target - coverage) = 0
    const ownedPtsD = [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0]; // 7 > 6
    const gapFrac = roleCoverageGapFraction('D', ownedPtsD, formation, overrides);
    expect(gapFrac).toBe(0);
  });

  it('titolarità parziali si sommano correttamente', () => {
    const overrides = { D: 6 };
    
    // 3 giocatori con titolarità 0.8 ciascuno = 2.4 titolarità totale
    const ownedPtsD = [0.8, 0.8, 0.8];
    const gapFrac = roleCoverageGapFraction('D', ownedPtsD, formation, overrides);
    // gap = 6 - 2.4 = 3.6 → gapFraction = 3.6/6 = 0.6
    expect(gapFrac).toBeCloseTo(0.6, 4);
  });
});
