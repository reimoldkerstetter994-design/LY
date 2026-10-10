import type { Vec3 } from '../physics/coords';
import type { ObjectKind, ScaleGroup } from '../data/types';

/** Move `focus` so that `anchor` stays fixed while the camera distance is multiplied by `factor`. */
export function focusZoomedToward(focus: Vec3, anchor: Vec3, factor: number, maxShift: number): Vec3 {
  const raw: Vec3 = [
    anchor[0] + (focus[0] - anchor[0]) * factor,
    anchor[1] + (focus[1] - anchor[1]) * factor,
    anchor[2] + (focus[2] - anchor[2]) * factor,
  ];
  const dx = raw[0] - focus[0];
  const dy = raw[1] - focus[1];
  const dz = raw[2] - focus[2];
  const shift = Math.hypot(dx, dy, dz);
  if (shift <= maxShift || shift === 0) return raw;
  const k = maxShift / shift;
  return [focus[0] + dx * k, focus[1] + dy * k, focus[2] + dz * k];
}

/** Closest the camera may approach an object, in metres. */
export function approachLimit(kind: ObjectKind, radius: number): number {
  const r = Math.max(radius, 1);
  switch (kind) {
    case 'planet':
    case 'dwarf-planet':
    case 'moon':
    case 'star':
      return Math.max(r * 1.12, 30);
    case 'black-hole':
      return Math.max(r * 2.4, 1e3);
    case 'horizon':
    case 'cmb':
      return r * 0.015;
    case 'region':
      return r * 0.04;
    case 'probe':
      return 5e8;
    default:
      return Math.max(r * 0.012, 1e3);
  }
}

/**
 * Screen-pixel radius within which a click or scroll counts as hitting this object.
 * Huge shells (horizons, the Oort cloud) only respond near their centre, so they don't
 * swallow every object drawn in front of them.
 */
export function pickRadiusPx(kind: ObjectKind, angularPx: number, viewport: number): number {
  const min = 18;
  if (kind === 'horizon' || kind === 'cmb' || kind === 'region') return min;
  if (kind === 'void' || kind === 'supercluster' || kind === 'structure' || kind === 'group') {
    return Math.min(Math.max(angularPx, min), 56);
  }
  if (kind === 'cluster') return Math.min(Math.max(angularPx, min), 96);
  const cap = Math.max(90, viewport * 0.62);
  return Math.min(Math.max(angularPx, min), cap);
}

/** How strongly the object's own scale layer is already showing it (0 = nothing to see). */
export function nativeVisibility(group: ScaleGroup, logView: number): number {
  const ramp = (x: number, a: number, b: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const band = (x: number, a: number, b: number, c: number, d: number) => ramp(x, a, b) * (1 - ramp(x, c, d));
  switch (group) {
    case 'solar':
      return 1 - ramp(logView, 16.9, 17.6);
    case 'stars':
      return 1 - ramp(logView, 19.6, 20.6);
    case 'galaxy':
    case 'local-group':
      return 1 - ramp(logView, 23.7, 24.4);
    case 'local-universe':
      return band(logView, 21.9, 22.7, 25.8, 26.5);
    case 'deep':
      return ramp(logView, 25.0, 25.7);
  }
}
