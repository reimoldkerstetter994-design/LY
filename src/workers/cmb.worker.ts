/// <reference lib="webworker" />
import { computeCmbSpectrum } from '../physics/cmb';
import { colorizeMap, synthesizeCmbMap } from '../physics/cmbMap';
import { Cosmology } from '../physics/cosmology';
import { computeIonizationHistory } from '../physics/recombination';
import type { CmbRequest, CmbResponse } from '../sim/cmbClient';

self.onmessage = (e: MessageEvent<CmbRequest>) => {
  const req = e.data;
  const t0 = performance.now();
  const cosmo = new Cosmology(req.params);
  const hist = computeIonizationHistory(cosmo, req.params.tau);
  const spec = computeCmbSpectrum(cosmo, hist, req.specLmax);
  const map = synthesizeCmbMap(spec.Cl, {
    width: req.width,
    height: req.height,
    lmax: req.height - 1,
    seed: req.seed,
    lFilterMin: req.lMin,
    lFilterMax: req.lMax,
    beamArcmin: req.beam,
    dipole: req.dipole,
  });
  const range = req.range > 0 ? req.range : Math.max(50, map.rms * 3);
  const rgba = colorizeMap(map, req.dipole ? Math.max(range, 3400) : range);
  const res: CmbResponse = {
    id: req.id,
    width: map.width,
    height: map.height,
    rgba,
    data: map.data,
    rms: map.rms,
    min: map.min,
    max: map.max,
    realizedDl: map.realizedDl,
    Dl: spec.Dl,
    derived: spec.derived,
    peaks: spec.peaks,
    troughs: spec.troughs,
    ms: performance.now() - t0,
  };
  const transfer = [rgba.buffer, map.data.buffer, map.realizedDl.buffer, spec.Dl.buffer] as ArrayBuffer[];
  (self as DedicatedWorkerGlobalScope).postMessage(res, transfer);
};
