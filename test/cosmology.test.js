import test from "node:test";
import assert from "node:assert/strict";
import {
  PLANCK2018,
  createCosmos,
  hubbleTimeGyr,
  normalizeParams,
} from "../src/cosmology.js";
import { equatorialToSupergalactic, galacticToSupergalactic, sphericalFromCartesian } from "../src/coords.js";
import { timeToUnit, unitToTime } from "../src/timewarp.js";
import { buildZeldovich } from "../src/zeldovich.js";
import { BODIES, placeAll } from "../src/catalog.js";
import { buildEpochs } from "../src/epochs.js";
import { formatLight } from "../src/format.js";

test("Planck-like background matches published anchors", () => {
  const cosmos = createCosmos(PLANCK2018);
  assert.ok(Math.abs(cosmos.ageGyr - 13.8) < 0.08, `age ${cosmos.ageGyr}`);
  assert.ok(Math.abs(cosmos.zEq - 3401) < 5, `zeq ${cosmos.zEq}`);
  const recYears = cosmos.tRecGyr * 1e9;
  assert.ok(recYears > 3.2e5 && recYears < 4.3e5, `rec years ${recYears}`);
  assert.ok(cosmos.chiStarMpc > 12500 && cosmos.chiStarMpc < 15500, `chi* ${cosmos.chiStarMpc}`);
  assert.ok(cosmos.horizonNowMpc > cosmos.chiStarMpc);
  const today = cosmos.sampleA(1);
  assert.ok(Math.abs(today.T - 2.7255) < 1e-6);
  assert.ok(Math.abs(today.D - 1) < 1e-3, `D0 ${today.D}`);
  assert.ok(today.omega.l > today.omega.m);
  console.log(
    JSON.stringify(
      {
        age: cosmos.ageGyr,
        zEq: cosmos.zEq,
        tRecMyr: cosmos.tRecGyr * 1000,
        tReGyr: cosmos.tReGyr,
        chiStar: cosmos.chiStarMpc,
        horizon: cosmos.horizonNowMpc,
        H: today.H,
      },
      null,
      2,
    ),
  );
});

test("radiation-era time tracks the analytic integral", () => {
  const p = normalizeParams(PLANCK2018);
  const cosmos = createCosmos(p);
  const a = 1e-8;
  const row = cosmos.sampleA(a);
  const h0 = 1 / hubbleTimeGyr(p.H0);
  const analytic = a ** 2 / (2 * h0 * Math.sqrt(p.OmegaR));
  assert.ok(Math.abs(row.tGyr - analytic) / analytic < 0.03, `${row.tGyr} vs ${analytic}`);
});

test("Einstein-de Sitter age is two thirds of a Hubble time", () => {
  const cosmos = createCosmos({
    H0: 67.36,
    OmegaM: 1,
    OmegaB: 0.05,
    OmegaR: 0,
    OmegaL: 0,
    flat: true,
  });
  const expected = (2 / 3) * hubbleTimeGyr(67.36);
  assert.ok(Math.abs(cosmos.ageGyr - expected) / expected < 0.01, `${cosmos.ageGyr} vs ${expected}`);
  const half = cosmos.sampleA(0.5);
  assert.ok(Math.abs(half.D - 0.5) < 0.03, `D(0.5)=${half.D}`);
});

test("galactic center and Virgo land on the supergalactic map", () => {
  const gc = galacticToSupergalactic(0, 0, 8.178);
  const gcSph = sphericalFromCartesian(gc);
  assert.ok(Math.abs(gcSph.r - 8.178) < 1e-6);
  const virgo = equatorialToSupergalactic(187.70593, 12.39112, 16.5);
  assert.ok(Math.abs(virgo[1]) > Math.abs(virgo[0]), `virgo ${virgo}`);
  assert.ok(Math.abs(virgo[2]) < 3, `virgo z ${virgo[2]}`);
  assert.ok(Math.hypot(...virgo) > 16.4 && Math.hypot(...virgo) < 16.6);
  console.log("virgo SG", virgo.map((v) => Number(v.toFixed(2))));
});

test("time warp is monotonic and invertible", () => {
  const age = 13.797;
  let prev = -1;
  for (let i = 0; i <= 20; i++) {
    const u = i / 20;
    const t = unitToTime(u, age);
    const back = timeToUnit(t, age);
    assert.ok(t > prev);
    assert.ok(Math.abs(back - u) < 2e-5, `${u} -> ${t} -> ${back}`);
    prev = t;
  }
  assert.ok(Math.abs(unitToTime(1, age) - age) / age < 1e-6);
});

test("local catalog places Virgo and Laniakea", () => {
  const cosmos = createCosmos(PLANCK2018);
  const placed = placeAll(BODIES, cosmos);
  const virgo = placed.find((b) => b.id === "virgo");
  const lani = placed.find((b) => b.id === "laniakea");
  const lg = placed.find((b) => b.id === "lg");
  assert.ok(Math.abs(virgo.d - 16.5) < 0.01);
  assert.ok(Math.abs(virgo.p[1]) > 10, virgo.p.join(","));
  assert.ok(lani.d > 90 && lani.d < 140, `lani ${lani.d}`);
  assert.ok(lg.d > 0.3 && lg.d < 0.5, `lg ${lg.d}`);
  const epochs = buildEpochs(cosmos);
  assert.ok(epochs.some((e) => e.id === "cmb"));
  assert.ok(epochs.at(-1).id === "now");
  assert.ok(epochs.every((e, i) => i === 0 || e.tGyr >= epochs[i - 1].tGyr));
});

test("large distances are quoted in 亿光年", () => {
  assert.match(formatLight(14147), /亿光年/);
  assert.doesNotMatch(formatLight(15530), /十亿光年/);
  assert.match(formatLight(0.008178), /光年/);
});

test("Zel'dovich field is normalized and displaces peaks inward", () => {
  const sim = buildZeldovich({
    H0: 67.36,
    OmegaM: 0.3153,
    ns: 0.9649,
    sigma8: 0.811,
    seed: 7,
    n: 16,
    boxMpch: 128,
  });
  let mean = 0;
  let m2 = 0;
  for (const d of sim.delta) mean += d;
  mean /= sim.delta.length;
  for (const d of sim.delta) m2 += (d - mean) ** 2;
  const std = Math.sqrt(m2 / sim.delta.length);
  assert.ok(Math.abs(std - 0.811) < 0.02, `std ${std}`);
  assert.ok(sim.dMax > 1);
  let psiRms = 0;
  for (const v of sim.psi) psiRms += v * v;
  psiRms = Math.sqrt(psiRms / sim.psi.length);
  assert.ok(psiRms > 0.2 && psiRms < 30, `psi rms ${psiRms}`);
});
