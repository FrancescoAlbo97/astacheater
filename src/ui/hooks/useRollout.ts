// §6.7 / §13.9 — Hook che parla con il Web Worker del rollout. Il numero deterministico compare
// subito (engine.computeDecisionForPlayer, sincrono); questo hook arriva dopo e raffina con la
// banda, senza mai bloccare il thread principale.
//
// `?worker&inline` (Vite): il worker viene incorporato come Blob URL nel bundle, non come file
// separato — necessario per un'app a file singolo aperta via `file://` (§4: zero richieste di
// rete a runtime; un Worker module caricato da URL relativo su file:// spesso fallisce per CORS).
import { useEffect, useRef, useState } from 'react';
import RolloutWorker from '../../workers/rollout.worker.ts?worker&inline';
import type { RolloutInput } from '../../core/rollout.js';
import type { RolloutWorkerRequest, RolloutWorkerResponse } from '../../workers/rollout.worker.js';

export interface RolloutBand {
  readonly median: number;
  readonly p10: number;
  readonly p90: number;
}

export function useRollout(input: RolloutInput | null, seed: number) {
  const [result, setResult] = useState<RolloutBand | null>(null);
  const [loading, setLoading] = useState(false);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    const worker = new RolloutWorker();
    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    setResult(null);
    const worker = workerRef.current;
    if (!input || !worker) return;

    const requestId = `${Date.now()}-${Math.random()}`;
    setLoading(true);

    function handleMessage(e: MessageEvent<RolloutWorkerResponse>) {
      if (e.data.requestId !== requestId) return;
      setLoading(false);
      if (e.data.ok) setResult(e.data.result);
    }
    worker.addEventListener('message', handleMessage);
    const request: RolloutWorkerRequest = { requestId, input, seed };
    worker.postMessage(request);
    return () => worker.removeEventListener('message', handleMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, seed]);

  return { result, loading };
}
