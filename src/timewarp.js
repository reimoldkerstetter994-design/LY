/** Piecewise-log slider so each cosmic era gets a usable span. */

const YEAR = 365.25 * 24 * 3600;

export function gyrFromSeconds(seconds) {
  return seconds / YEAR / 1e9;
}

const ANCHORS = [
  { t: gyrFromSeconds(1e-32), u: 0 },
  { t: gyrFromSeconds(1), u: 0.2 },
  { t: gyrFromSeconds(180), u: 0.32 },
  { t: 3.8e-4, u: 0.48 },
  { t: 0.18, u: 0.66 },
  { t: 1, u: 0.8 },
  { t: 13.8, u: 1 },
];

function stopsFor(ageGyr) {
  const age = Math.max(ageGyr, ANCHORS[0].t * 10);
  const kept = ANCHORS.filter((s, i) => i < ANCHORS.length - 1 && s.t < age * 0.999);
  kept.push({ t: age, u: 1 });
  return kept;
}

function logLerp(t, a, b) {
  return (Math.log(t) - Math.log(a.t)) / (Math.log(b.t) - Math.log(a.t));
}

export function timeToUnit(tGyr, ageGyr = 13.8) {
  const stops = stopsFor(ageGyr);
  const t = Math.min(Math.max(tGyr, stops[0].t), stops[stops.length - 1].t);
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (t <= b.t || i === stops.length - 2) {
      const f = Math.min(1, Math.max(0, logLerp(Math.min(Math.max(t, a.t), b.t), a, b)));
      return a.u + (b.u - a.u) * f;
    }
  }
  return 1;
}

export function unitToTime(u, ageGyr = 13.8) {
  const stops = stopsFor(ageGyr);
  const x = Math.min(1, Math.max(0, u));
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (x <= b.u || i === stops.length - 2) {
      const span = b.u - a.u || 1;
      const f = Math.min(1, Math.max(0, (x - a.u) / span));
      return Math.exp(Math.log(a.t) + f * (Math.log(b.t) - Math.log(a.t)));
    }
  }
  return stops[stops.length - 1].t;
}
