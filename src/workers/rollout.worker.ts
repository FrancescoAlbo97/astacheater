// §6.7 / §13.9 — Il Monte Carlo gira in un Web Worker: non deve mai bloccare la UI. Il numero
// deterministico (max-bid.ts) compare entro 100ms sul thread principale; questo worker calcola la
// banda e la invia quando pronta (fino a 3s), senza congelare l'interfaccia nel frattempo.

import { runRollout, type RolloutInput } from '../core/rollout.js';
import { mulberry32 } from '../core/rng.js';

export interface RolloutWorkerRequest {
  readonly requestId: string;
  readonly input: RolloutInput;
  readonly seed: number;
}

export type RolloutWorkerResponse =
  | { readonly requestId: string; readonly ok: true; readonly result: { median: number; p10: number; p90: number } }
  | { readonly requestId: string; readonly ok: false; readonly error: string };

self.onmessage = (event: MessageEvent<RolloutWorkerRequest>) => {
  const { requestId, input, seed } = event.data;
  try {
    const result = runRollout(input, mulberry32(seed));
    const response: RolloutWorkerResponse = { requestId, ok: true, result };
    (self as unknown as Worker).postMessage(response);
  } catch (err) {
    const response: RolloutWorkerResponse = {
      requestId,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    (self as unknown as Worker).postMessage(response);
  }
};
