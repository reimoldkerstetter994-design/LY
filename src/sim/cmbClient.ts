import type { CmbDerived, CmbPeak } from '../physics/cmb';
import type { CosmoParams } from '../physics/cosmology';

export interface CmbRequest {
  id: number;
  params: CosmoParams;
  width: number;
  height: number;
  seed: number;
  lMin: number;
  lMax: number;
  beam: number;
  dipole: boolean;
  /** Colour range in μK (≤ 0 picks 3σ automatically). */
  range: number;
  specLmax: number;
}

export interface CmbResponse {
  id: number;
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  data: Float32Array;
  rms: number;
  min: number;
  max: number;
  realizedDl: Float64Array;
  Dl: Float64Array;
  derived: CmbDerived;
  peaks: CmbPeak[];
  troughs: CmbPeak[];
  ms: number;
}

/** A dedicated worker per purpose so the 3-D sky and the CMB lab never block each other. */
export class CmbClient {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, (r: CmbResponse) => void>();
  private latest = 0;

  constructor() {
    this.worker = new Worker(new URL('../workers/cmb.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<CmbResponse>) => {
      const cb = this.pending.get(e.data.id);
      this.pending.delete(e.data.id);
      if (cb && e.data.id === this.latest) cb(e.data);
    };
  }

  /** Requests a map; results of superseded requests are dropped. */
  request(req: Omit<CmbRequest, 'id'>): Promise<CmbResponse> {
    const id = this.nextId++;
    this.latest = id;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.worker.postMessage({ ...req, id } satisfies CmbRequest);
    });
  }

  dispose(): void {
    this.worker.terminate();
    this.pending.clear();
  }
}
