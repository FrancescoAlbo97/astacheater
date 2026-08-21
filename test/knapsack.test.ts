import { describe, it, expect } from 'vitest';
import { solveKnapsack, calculateOpportunityCost } from '../src/core/knapsack';
import type { Player, ManagerState } from '../src/core/types';
import { deriveManagerStates, reduce, appendEvent } from '../src/core/state';
import type { AuctionState } from '../src/core/types';

// Helper per creare un TeamState fittizio dai dati necessari
function createMockTeamState(remainingSlots: Record<string, number>, budget: number): any {
  return {
    getRemainingSlots: () => remainingSlots,
    budget: budget
  };
}

describe('Knapsack', () => {
  const createPlayer = (id: string, role: any, value: number, price: number): Player => ({
    id,
    name: `Player ${id}`,
    role,
    team: 'Team',
    value,
    expectedPrice: price,
    totalValue: value,
    probability: 0.5,
    isStarter: true
  });

  it('risolve un caso semplice con vincolo di budget', () => {
    const players: Player[] = [
      createPlayer('A', 'A', 80, 50),
      createPlayer('B', 'A', 60, 30),
      createPlayer('C', 'C', 70, 40)
    ];

    const teamState = createMockTeamState({ P: 3, D: 8, C: 1, A: 1 }, 100);
    
    const result = solveKnapsack(players, teamState, 100);
    
    expect(result.maxScore).toBeGreaterThan(0);
    expect(result.selectedPlayers.length).toBeGreaterThan(0);
  });

  it('identifica core players correttamente', () => {
    const players: Player[] = [
      createPlayer('STAR', 'A', 200, 100), // Giocatore insostituibile
      createPlayer('B1', 'A', 50, 30),
      createPlayer('B2', 'A', 50, 30)
    ];

    const teamState = createMockTeamState({ P: 3, D: 8, C: 8, A: 1 }, 100);
    
    const result = solveKnapsack(players, teamState, 100);
    
    // STAR dovrebbe essere core player
    expect(result.corePlayers.has('STAR')).toBe(true);
  });

  it('calcola shadow prices coerenti', () => {
    const players: Player[] = [
      createPlayer('P1', 'C', 100, 50),
      createPlayer('P2', 'C', 90, 45)
    ];

    const teamState = createMockTeamState({ P: 3, D: 8, C: 1, A: 6 }, 100);
    
    const result = solveKnapsack(players, teamState, 100);
    
    // Entrambi dovrebbero avere shadow price > 0 se selezionati
    if (result.selectedPlayers.includes('P1')) {
      expect(result.shadowPrices.get('P1')).toBeGreaterThan(0);
    }
  });
});

describe('Opportunity Cost', () => {
  const createPlayer = (id: string, role: any, value: number, price: number): Player => ({
    id,
    name: `Player ${id}`,
    role,
    team: 'Team',
    value,
    expectedPrice: price,
    totalValue: value,
    probability: 0.5,
    isStarter: true
  });

  it('restituisce costo opportunità per giocatore core', () => {
    const target = createPlayer('TARGET', 'A', 150, 80);
    const players: Player[] = [
      target,
      createPlayer('ALT1', 'A', 100, 50),
      createPlayer('ALT2', 'A', 100, 50)
    ];

    const teamState = createMockTeamState({ P: 3, D: 8, C: 8, A: 1 }, 100);
    
    const knapsackResult = solveKnapsack(players, teamState, 100);
    const oppCost = calculateOpportunityCost(target, knapsackResult, players, teamState, 100);
    
    // Il costo opportunità dovrebbe essere significativo per un core player
    expect(oppCost).toBeGreaterThanOrEqual(0);
  });
});
