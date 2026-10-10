import assert from "node:assert/strict";
import test from "node:test";
import {
  C_KM_S,
  GYR_PER_HUBBLE,
  PLANCK,
  createCosmology,
  growthFactor,
  mpcToGly,
} from "../src/cosmology.js";
import { skyToXyz } from "../src/catalog.js";
import { aToU, uToA } from "../src/timeline.js";

test("Einstein-de Sitter age is 2/3 of a Hubble time", () => {
  const H0 = 70;
  const model = createCosmology({ H0, matterOnly: true, Ob: 0.045, w: -1 });
  const expected = (2 / 3) * (GYR_PER_HUBBLE / H0);
  assert.ok(Math.abs(model.ageGyr - expected) / expected < 0.01);
});

test("empty open universe ages as 1/H0", () => {
  const H0 = 70;
  const model = createCosmology({ H0, Om: 0, Ol: 0, Or: 0, Ob: 0, w: -1, flat: false });
  const expected = GYR_PER_HUBBLE / H0;
  assert.ok(Math.abs(model.ageGyr - expected) / expected < 0.01);
});

test("EdS comoving distance matches the analytic integral", () => {
  const H0 = 70;
  const model = createCosmology({ H0, matterOnly: true, Ob: 0.045, w: -1 });
  const chi = model.chiOfZ(1);
  const expected = (2 * C_KM_S) / H0 * (1 - Math.sqrt(0.5));
  assert.ok(Math.abs(chi - expected) / expected < 0.012, `${chi} vs ${expected}`);
});

test("low redshift distance tracks cz/H0", () => {
  const model = createCosmology(PLANCK);
  const z = 0.01;
  const chi = model.chiOfZ(z);
  const approx = (C_KM_S * z) / PLANCK.H0;
  assert.ok(Math.abs(chi - approx) / approx < 0.03);
});

test("Planck 2018 background is in the observed window", () => {
  const model = createCosmology(PLANCK);
  assert.ok(model.ageGyr > 13.6 && model.ageGyr < 14.0, `age ${model.ageGyr}`);
  const gly = model.horizonGly;
  assert.ok(gly > 44 && gly < 48, `horizon ${gly} Gly`);
  assert.ok(model.accel && model.accel.z > 0.4 && model.accel.z < 1.05, `accel z ${model.accel?.z}`);
  const cmb = model.chiOfZ(1089.9);
  assert.ok(cmb / model.horizonMpc > 0.9);
});

test("distances vanish at z = 0 and luminosity distance exceeds comoving", () => {
  const model = createCosmology(PLANCK);
  const near = model.distancesAtZ(0);
  assert.ok(near.chi < 1e-6);
  const far = model.distancesAtZ(1);
  assert.ok(far.dL > far.chi);
  assert.ok(far.dA < far.chi);
  assert.ok(far.lookback > 0 && far.lookback < model.ageGyr);
});

test("flat transverse distance equals the radial comoving distance", () => {
  const model = createCosmology(PLANCK);
  const d = model.distancesAtZ(0.8);
  assert.ok(Math.abs(d.dM - d.chi) / d.chi < 1e-6);
});

test("EdS growth scales with a", () => {
  const p = { Om: 1, Ol: 0, Ok: 0, w: -1 };
  const ratio = growthFactor(0.4, p) / growthFactor(1, p);
  assert.ok(Math.abs(ratio - 0.4) < 0.02);
});

test("timeline map is monotonic and invertible", () => {
  let previous = -1;
  for (let i = 0; i <= 40; i += 1) {
    const u = i / 40;
    const a = uToA(u);
    assert.ok(a > previous);
    previous = a;
    assert.ok(Math.abs(aToU(a) - u) < 1e-6);
  }
  assert.ok(Math.abs(uToA(1) - 1) < 1e-9);
});

test("equatorial axes point along the coordinate frame", () => {
  const [x, y, z] = skyToXyz(0, 0, 10);
  assert.ok(Math.abs(x - 10) < 1e-9 && Math.abs(y) < 1e-9 && Math.abs(z) < 1e-9);
  const north = skyToXyz(0, 90, 4);
  assert.ok(Math.abs(north[1] - 4) < 1e-9);
});

test("gly conversion of a gigaparsec", () => {
  assert.ok(Math.abs(mpcToGly(1000) - 3.261563777) < 1e-9);
});
