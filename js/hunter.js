/* The thing that learned to open doors. */
(function (global) {
  let root = null;
  let eyes = [];
  let bones = [];
  let state = "dormant";
  let target = new THREE.Vector3(20, 0, 12);
  let lastKnown = new THREE.Vector3();
  let wait = 0;
  let twitch = 0;
  let active = false;
  let speedMul = 1;
  const pos = new THREE.Vector3(19.4, 0, 10.2);
  const vel = new THREE.Vector3();

  function limb(mat, w, h, d) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.castShadow = true;
    return m;
  }

  function create(scene) {
    const skin = new THREE.MeshStandardMaterial({
      color: 0x2a2420,
      roughness: 0.92,
      metalness: 0.05,
      emissive: 0x0a0504,
    });
    const wet = new THREE.MeshStandardMaterial({
      color: 0x0c0a0a,
      roughness: 0.25,
      metalness: 0.15,
    });
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0x110000,
      emissive: 0xff2208,
      emissiveIntensity: 1.8,
    });

    root = new THREE.Group();
    const torso = limb(skin, 0.32, 1.15, 0.22);
    torso.position.y = 1.55;
    torso.rotation.x = 0.12;
    root.add(torso);

    const hips = limb(skin, 0.28, 0.22, 0.16);
    hips.position.y = 0.92;
    root.add(hips);

    const head = limb(skin, 0.22, 0.38, 0.24);
    head.position.set(0, 2.28, 0.06);
    root.add(head);
    bones.push(head);

    const jaw = limb(wet, 0.16, 0.08, 0.18);
    jaw.position.set(0, 2.08, 0.12);
    root.add(jaw);

    const hair = limb(wet, 0.28, 0.7, 0.08);
    hair.position.set(0, 2.42, -0.12);
    hair.rotation.x = 0.4;
    root.add(hair);

    for (const s of [-1, 1]) {
      const arm = limb(skin, 0.08, 1.15, 0.08);
      arm.position.set(0.24 * s, 1.55, 0);
      arm.rotation.z = 0.18 * s;
      root.add(arm);
      bones.push(arm);
      const hand = limb(wet, 0.1, 0.28, 0.08);
      hand.position.set(0.32 * s, 0.92, 0.08);
      root.add(hand);
      const leg = limb(skin, 0.1, 0.95, 0.12);
      leg.position.set(0.1 * s, 0.48, 0);
      root.add(leg);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), eyeMat);
      eye.position.set(0.055 * s, 2.32, 0.16);
      root.add(eye);
      eyes.push(eye);
    }

    root.position.copy(pos);
    root.visible = false;
    scene.add(root);
    return root;
  }

  function wake() {
    active = true;
    state = "wander";
    root.visible = true;
  }

  function enrage() {
    speedMul = 1.65;
    state = "chase";
  }

  function pickWaypoint(waypoints, avoid) {
    let best = waypoints[Math.floor(Math.random() * waypoints.length)];
    let bestD = 0;
    for (let i = 0; i < 6; i++) {
      const w = waypoints[Math.floor(Math.random() * waypoints.length)];
      const d = Math.hypot(w.x - pos.x, w.z - pos.z);
      if (d > bestD && Math.abs(w.y - pos.y) < 1.4) {
        best = w;
        bestD = d;
      }
    }
    if (avoid) {
      target.set(avoid.x + (Math.random() - 0.5) * 4, best.y, avoid.z + (Math.random() - 0.5) * 4);
    } else {
      target.set(best.x, best.y, best.z);
    }
  }

  function blocked(colliders, x, z, y) {
    const r = 0.28;
    for (let i = 0; i < colliders.length; i++) {
      const b = colliders[i];
      if (b.off) continue;
      if (y + 1.4 < b.miny || y + 0.2 > b.maxy) continue;
      const cx = Math.max(b.minx, Math.min(x, b.maxx));
      const cz = Math.max(b.minz, Math.min(z, b.maxz));
      const dx = x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }

  function tryStep(colliders, dx, dz, y) {
    const nx = pos.x + dx;
    const nz = pos.z + dz;
    if (!blocked(colliders, nx, nz, y)) {
      pos.x = nx;
      pos.z = nz;
      return;
    }
    if (!blocked(colliders, pos.x + dx, pos.z, y)) pos.x += dx;
    else if (!blocked(colliders, pos.x, pos.z + dz, y)) pos.z += dz;
  }

  function los(colliders, from, to) {
    const dist = from.distanceTo(to);
    const steps = Math.ceil(dist / 0.45);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = from.x + (to.x - from.x) * t;
      const y = from.y + (to.y - from.y) * t;
      const z = from.z + (to.z - from.z) * t;
      if (blocked(colliders, x, z, y - 1.4)) return false;
    }
    return true;
  }

  function hearRadius(player) {
    if (player.hiding) return 1.2;
    if (player.running) return 13.5;
    if (player.crouch) return 2.4;
    return 6.2 + (player.flashOn ? 3.5 : 0);
  }

  function update(dt, player, world) {
    if (!root || !active) {
      if (root) root.visible = false;
      return { near: 0, seeing: false, catching: false };
    }
    root.visible = true;

    const p = player.pos;
    const dist = Math.hypot(p.x - pos.x, p.z - pos.z);
    const sameFloor = Math.abs(p.y - pos.y) < 2.4;
    const canSee =
      sameFloor &&
      dist < (player.flashOn ? 16 : 9) &&
      los(world.colliders, new THREE.Vector3(pos.x, pos.y + 1.6, pos.z), new THREE.Vector3(p.x, p.y + 1.5, p.z));

    const heard = sameFloor && dist < hearRadius(player);

    if (player.hiding) {
      if (state === "chase" || state === "hunt") {
        state = "search";
        lastKnown.copy(p);
        wait = 2.2 + Math.random() * 2;
      }
    } else if (canSee) {
      state = "chase";
      lastKnown.copy(p);
    } else if (heard && state !== "chase") {
      state = "hunt";
      lastKnown.copy(p);
    }

    wait -= dt;
    let spd = 0.95 * speedMul;
    if (state === "wander") {
      spd = 0.85 * speedMul;
      if (wait <= 0 || pos.distanceTo(target) < 0.6) {
        pickWaypoint(world.waypoints);
        wait = 1.5 + Math.random() * 3;
      }
    } else if (state === "hunt") {
      spd = 1.55 * speedMul;
      target.copy(lastKnown);
      if (pos.distanceTo(target) < 0.7) {
        state = "search";
        wait = 2;
      }
    } else if (state === "search") {
      spd = 0.7;
      if (wait <= 0) {
        pickWaypoint(world.waypoints, lastKnown);
        state = "wander";
      }
    } else if (state === "chase") {
      spd = (player.flashOn ? 2.55 : 2.15) * speedMul;
      target.copy(p);
    }

    const ty = SHHouse.floorY(pos.x, pos.z, pos.y);
    const dx = target.x - pos.x;
    const dz = target.z - pos.z;
    const len = Math.hypot(dx, dz) || 1;
    tryStep(world.colliders, (dx / len) * spd * dt, (dz / len) * spd * dt, ty);
    pos.y = SHHouse.floorY(pos.x, pos.z, pos.y);

    const face = Math.atan2(dx, dz);
    root.rotation.y = THREE.MathUtils.damp(root.rotation.y, face, 6, dt);
    root.position.set(pos.x, pos.y, pos.z);

    twitch += dt * (state === "chase" ? 18 : 6);
    root.position.y += Math.sin(twitch * 0.7) * 0.02;
    if (bones[0]) bones[0].rotation.z = Math.sin(twitch * 0.35) * 0.12;
    if (bones[1]) bones[1].rotation.x = Math.sin(twitch) * 0.25;
    eyes.forEach((e) => {
      e.material.emissiveIntensity = 1.2 + Math.sin(twitch * 2) * 0.8;
    });

    const near = THREE.MathUtils.clamp(1 - dist / 12, 0, 1) * (sameFloor ? 1 : 0.35);
    const catching = !player.hiding && sameFloor && dist < 1.12 && (canSee || dist < 0.85);
    return { near, seeing: canSee, catching, dist, pos };
  }

  function reset() {
    state = "dormant";
    active = false;
    speedMul = 1;
    pos.set(19.4, 0, 10.2);
    if (root) {
      root.position.copy(pos);
      root.visible = false;
    }
  }

  global.SHHunter = { create, wake, enrage, update, reset, pos, get state() { return state; } };
})(window);
