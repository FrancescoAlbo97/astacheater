// Report post-asta: risponde a "questo meccanismo mi ha davvero aiutato?" rigiocando il log
// EVENTI REALI (non una simulazione) un evento alla volta e confrontando, per ogni vendita, cosa
// diceva il motore un istante prima che avvenisse con quello che è successo davvero. A differenza
// della Prova a secco (che stima una rosa ATTESA su tante aste ipotetiche), questo report analizza
// la TUA asta, quella già giocata (o in corso).
import { computeDecisionForPlayer } from '../core/engine.js';
import { deriveManagerStates, getMyManagerId, reduce, resolveUndos } from '../core/state.js';
import { applyRiskToValueCurves } from '../core/value-model.js';
import { DEFAULT_VALUE_CURVES } from '../core/config.js';
import { mulberry32 } from '../core/rng.js';
import type { AuctionState, Role } from '../core/types.js';
import { evaluateFinalRoster } from './metrics.js';

export interface PurchaseReview {
  readonly playerId: string;
  readonly playerName: string;
  readonly team: string;
  readonly role: Role;
  readonly price: number;
  /** "OFFRI FINO A" calcolato dal motore un istante prima di questa vendita, con lo stato di
   * allora (crediti/slot residui/rosa di quel momento) — non ricalcolato con lo stato attuale. */
  readonly operationalMaxAtTime: number;
  readonly expectedPriceAtTime: number;
  readonly overpaidBy: number;
}

export interface MissedOpportunity {
  readonly playerId: string;
  readonly playerName: string;
  readonly team: string;
  readonly role: Role;
  readonly wonByManagerName: string;
  readonly price: number;
  readonly myOperationalMaxAtTime: number;
  readonly myScore: number;
}

export interface PostAuctionReport {
  /** Numero di eventi EFFETTIVI analizzati (dopo aver risolto gli `undo` — un annullamento e
   * l'evento che cancella non contano come "analizzati", non sono mai successi davvero). */
  readonly eventsAnalyzed: number;
  readonly myPurchases: readonly PurchaseReview[];
  readonly totalSpent: number;
  readonly overpayCount: number;
  readonly totalOverpaidCredits: number;
  readonly missedOpportunities: readonly MissedOpportunity[];
  /** Valore di stagione atteso della rosa REALMENTE messa insieme (§6.7 lineup-sim), calcolato con
   * le curve corrette per il rischio di lega — lo stesso metro della Prova a secco, per essere
   * confrontabile con quel numero se l'hai girata prima dell'asta. */
  readonly finalRosterValue: number;
}

/**
 * Rigioca la sequenza EFFETTIVA di eventi (undo già risolti su tutto il log, così un evento non
 * viene giudicato "definitivo" salvo poi scoprire che un `undo` successivo lo cancella) e, ad ogni
 * vendita, calcola la decisione del motore sullo stato IMMEDIATAMENTE PRECEDENTE — cioè quello che
 * avresti visto sullo schermo un istante prima di quella vendita. Costo O(n²) nel numero di eventi
 * (ogni `reduce` è O(n)): accettabile per un'asta reale (qualche centinaio di eventi), non pensato
 * per girare in un ciclo caldo.
 */
export function buildPostAuctionReport(state: AuctionState, evalSeed = 4242): PostAuctionReport | null {
  if (!state.config) return null;
  const myManagerId = getMyManagerId(state.config);
  if (!myManagerId) return null;

  const effectiveEvents = resolveUndos(state.log);
  const myPurchases: PurchaseReview[] = [];
  const missedOpportunities: MissedOpportunity[] = [];

  let prevState = reduce([]);
  for (let i = 0; i < effectiveEvents.length; i++) {
    const event = effectiveEvents[i]!;
    const curState = reduce(effectiveEvents.slice(0, i + 1));
    if (event.t === 'sale') {
      const sale = curState.sales[curState.sales.length - 1]!;
      const player = curState.players[sale.playerId];
      if (player) {
        const decision = computeDecisionForPlayer(prevState, sale.playerId);
        if (sale.managerId === myManagerId) {
          myPurchases.push({
            playerId: sale.playerId,
            playerName: player.name,
            team: player.team,
            role: player.role,
            price: sale.price,
            operationalMaxAtTime: decision?.operationalMax ?? 0,
            expectedPriceAtTime: decision?.expectedPrice ?? 0,
            overpaidBy: decision ? Math.max(0, sale.price - decision.operationalMax) : 0,
          });
        } else if (decision && decision.reason !== 'not-useful' && sale.price <= decision.operationalMax) {
          // Un avversario ha preso un giocatore che, secondo IL TUO modello in quel momento,
          // potevi permetterti senza peggiorare la tua rosa finale: un'occasione mancata concreta,
          // non un rimpianto generico.
          const myScore = prevState.scores[sale.playerId]?.score;
          if (myScore !== undefined) {
            const managerName = curState.config?.managers.find((m) => m.id === sale.managerId)?.name ?? sale.managerId;
            missedOpportunities.push({
              playerId: sale.playerId,
              playerName: player.name,
              team: player.team,
              role: player.role,
              wonByManagerName: managerName,
              price: sale.price,
              myOperationalMaxAtTime: decision.operationalMax,
              myScore,
            });
          }
        }
      }
    }
    prevState = curState;
  }

  const totalSpent = myPurchases.reduce((s, r) => s + r.price, 0);
  const overpayCount = myPurchases.filter((r) => r.overpaidBy > 0).length;
  const totalOverpaidCredits = myPurchases.reduce((s, r) => s + r.overpaidBy, 0);

  const myState = deriveManagerStates(state).find((m) => m.manager.id === myManagerId);
  const myValueCurves = applyRiskToValueCurves(DEFAULT_VALUE_CURVES, state.config.risk);
  const scoresById = new Map(Object.entries(state.scores).map(([id, s]) => [id, s.score]));
  const finalRosterValue = myState
    ? evaluateFinalRoster(myState, scoresById, state.config.formations, mulberry32(evalSeed), 2000, myValueCurves)
    : 0;

  return {
    eventsAnalyzed: effectiveEvents.length,
    myPurchases,
    totalSpent,
    overpayCount,
    totalOverpaidCredits,
    missedOpportunities,
    finalRosterValue,
  };
}
