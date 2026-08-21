/**
 * Modulo di Costo Opportunità per le decisioni d'asta
 * 
 * Integra Knapsack e Monte Carlo per rispondere a:
 * "Se pago X crediti per questo giocatore, quanto valore teorico rinuncio?"
 */

import type { Player } from './types';
import type { PlayerDecision } from './engine';
import { solveKnapsack, type KnapsackResult, calculateOpportunityCost as calcOppCost } from './knapsack';

// Interfaccia estesa per i giocatori con informazioni di valutazione
interface EvaluatedPlayer extends Player {
  expectedPrice: number;
  totalValue: number;
}

export interface OpportunityAnalysis {
  targetPlayer: Player;
  absoluteValue: number; // Valore assoluto del giocatore
  opportunityCost: number; // Quanto valore perdi scegliendo lui
  netValue: number; // absoluteValue - opportunityCost
  isCorePlayer: boolean; // Se è insostituibile
  recommendation: 'BUY' | 'AVOID' | 'CONSIDER';
  confidence: number; // 0-1, quanto siamo sicuri della raccomandazione
}

/**
 * Analizza un giocatore target nel contesto attuale della rosa e del pool
 */
export function analyzeOpportunity(
  targetPlayer: EvaluatedPlayer,
  availablePlayers: EvaluatedPlayer[],
  teamState: { getRemainingSlots(): Record<string, number> },
  budget: number
): OpportunityAnalysis {
  // 1. Risolvi Knapsack per trovare la rosa ottimale teorica
  const knapsackResult = solveKnapsack(availablePlayers, teamState, budget);
  
  // 2. Calcola costo opportunità specifico
  const oppCost = calcOppCost(targetPlayer, knapsackResult, availablePlayers, teamState, budget);
  
  // 3. Determina se è core player
  const isCore = knapsackResult.corePlayers.has(targetPlayer.id);
  
  // 4. Calcola valore netto
  const absoluteValue = targetPlayer.totalValue || 0;
  const netValue = absoluteValue - oppCost;
  
  // 5. Genera raccomandazione
  let recommendation: 'BUY' | 'AVOID' | 'CONSIDER';
  let confidence = 0.5;
  
  if (isCore && netValue > 0) {
    recommendation = 'BUY';
    confidence = 0.9;
  } else if (netValue > absoluteValue * 0.3) {
    recommendation = 'BUY';
    confidence = 0.7;
  } else if (netValue < 0) {
    recommendation = 'AVOID';
    confidence = 0.8;
  } else {
    recommendation = 'CONSIDER';
    confidence = 0.5;
  }
  
  return {
    targetPlayer,
    absoluteValue,
    opportunityCost: oppCost,
    netValue,
    isCorePlayer: isCore,
    recommendation,
    confidence
  };
}

/**
 * Aggiusta il prezzo massimo consigliabile in base al costo opportunità
 */
export function adjustMaxBidWithOpportunity(
  baseMaxBid: number,
  opportunityCost: number,
  absoluteValue: number
): number {
  // Se il costo opportunità è alto, riduciamo l'offerta massima
  const adjustmentFactor = Math.max(0.5, 1 - (opportunityCost / (absoluteValue || 1)));
  return Math.round(baseMaxBid * adjustmentFactor);
}
