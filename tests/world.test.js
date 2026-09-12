import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { HeightField, resolveAabb } from "../src/collision.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const worldPath = join(root, "public/assets/world.json");

test("world.json exists and has playable layout", () => {
  const world = JSON.parse(readFileSync(worldPath, "utf8"));
  assert.ok(world.spawn.length === 3);
  assert.ok(world.districts.length >= 7);
  assert.ok(world.quests.main.fragments.length === 6);
  const ids = new Set(world.interactables.map((i) => i.id));
  for (const id of world.quests.main.fragments) {
    assert.ok(ids.has(id), `missing fragment ${id}`);
  }
  assert.ok(world.npcs.some((n) => n.id === "kernel"));
  assert.ok(world.colliders.length > 20);
  assert.equal(world.heightmap.heights.length, world.heightmap.res ** 2);
});

test("heightfield samples plaza above water", () => {
  const world = JSON.parse(readFileSync(worldPath, "utf8"));
  const field = new HeightField(world.heightmap);
  const h = field.sample(0, 0);
  assert.ok(h > 0.4, `plaza height ${h}`);
  const sea = field.sample(120, 120);
  assert.ok(sea < 0, `ocean height ${sea}`);
});

test("aabb resolver pushes player out of a box", () => {
  const colliders = [{ min: [-1, 0, -1], max: [1, 2, 1] }];
  const r = resolveAabb(0.2, 0, 0.4, colliders);
  assert.ok(Math.abs(r.x) >= 1.39 || Math.abs(r.z) >= 1.39);
});
