/* The Tide Guest — drowned hunter that hears light and running. */
(function (global) {
  let root = null;
  let head = null;
  let scene = null;
  const pos = new THREE.Vector3(22, 0, 14);
  const vel = new THREE.Vector3();
  let state = "wait";
  let target = new THREE.Vector3();
  let waitT = 8;
  let huntT = 0;
  let visible = false;
  let grabT = 0;
  let bob = 0;
  let spawned = false;

  function makeBody(mats) {
    root = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.05, 0.28), mats.skin);
    torso.position.y = 1.15;
    torso.castShadow = true;
    root.add(torso);

    head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), mats.skin);
    head.scale.set(0.85, 1.15, 0.8);
    head.position.set(0, 1.82, 0.02);
    root.add(head);

    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.1), mats.glowRed);
    jaw.position.set(0, 1.68, 0.14);
    root.add(jaw);

    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.15, 0.1), mats.skin);
      arm.position.set(side * 0.32, 1.05, 0);
      arm.rotation.z = side * 0.18;
      root.add(arm);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), mats.skin);
      hand.position.set(side * 0.42, 0.48, 0.05);
      root.add(hand);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.95, 0.14), mats.skin);
      leg.position.set(side * 0.12, 0.48, 0);
      root.add(leg);
    }

    const drip = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({ color: 0x4a6a6a, size: 0.03, transparent: true, opacity: 0.45, depthWrite: false })
    );
    const dp = new Float32Array(40 * 3);
    for (let i = 0; i < 40; i++) {
      dp[i * 3] = (Math.random() - 0.5) * 0.3;
      dp[i * 3 + 1] = Math.random() * 1.8;
      dp[i * 3 + 2] = (Math.random() - 0.5) * 0.2;
    }
    drip.geometry.setAttribute("position", new THREE.BufferAttribute(dp, 3));
    root.add(drip);
    root.userData.drip = drip;
    root.visible = false;
    scene.add(root);
  }

  function nearestWaypoint(from, hotel) {
    let best = hotel.waypoints[0];
    let bd = 1e9;
    for (let i = 0; i < hotel.waypoints.length; i++) {
      const w = hotel.waypoints[i];
      if (Math.abs(w.y - from.y) > 1.6) continue;
      const d = w.distanceTo(from);
      if (d < bd) {
        bd = d;
        best = w;
      }
    }
    return best.clone();
  }

  function randomWaypoint(hotel, yHint) {
    const pool = hotel.waypoints.filter((w) => Math.abs(w.y - yHint) < 1.8);
    const w = pool[(Math.random() * pool.length) | 0] || hotel.waypoints[0];
    return w.clone();
  }

  function canSee(player, hotel) {
    const to = player.pos.clone().sub(pos);
    const dist = to.length();
    if (dist > 14) return false;
    if (Math.abs(player.pos.y - pos.y) > 2.2) return false;
    to.normalize();
    const fwd = new THREE.Vector3(Math.sin(root.rotation.y), 0, Math.cos(root.rotation.y));
    if (state !== "hunt" && to.dot(fwd) < 0.15 && dist > 3.5) return false;
    return true;
  }

  function spawn(targetScene, mats) {
    scene = targetScene;
    if (root && root.parent) scene.remove(root);
    makeBody(mats);
    spawned = false;
    state = "wait";
    waitT = 10;
    visible = false;
    root.visible = false;
    pos.set(24, 0, 14);
  }

  function wake() {
    spawned = true;
    visible = true;
    root.visible = true;
    state = "patrol";
    target.copy(pos);
  }

  function vanish() {
    visible = false;
    root.visible = false;
    state = "wait";
    waitT = 3 + Math.random() * 4;
  }

  function appearNear(player, hotel) {
    const w = randomWaypoint(hotel, player.pos.y);
    pos.copy(w);
    pos.y = hotel.floorY(pos.x, player.pos.y, pos.z);
    visible = true;
    root.visible = true;
    state = "stalk";
    huntT = 4;
  }

  function update(dt, player, hotel, noise) {
    if (!root) return { dist: 99, state, grabbing: false };
    if (!spawned) {
      waitT -= dt;
      if (waitT <= 0) wake();
      return { dist: 99, state, grabbing: false };
    }

    if (state === "wait") {
      waitT -= dt;
      if (waitT <= 0) appearNear(player, hotel);
      return { dist: 99, state, grabbing: false };
    }

    const dist = pos.distanceTo(player.pos);
    const sameFloor = Math.abs(player.pos.y - pos.y) < 2.4;
    const heard = noise > 0.45 && sameFloor && dist < 16;
    const seen = visible && sameFloor && canSee(player, hotel);

    if (player.hiding && !player.flashOn) {
      if (dist < 2.2 && state === "hunt") {
        // linger then leave
        huntT -= dt;
        if (huntT < 0) {
          vanish();
          return { dist, state, grabbing: false };
        }
      }
    } else if ((heard || seen || (player.flashOn && sameFloor && dist < 11)) && state !== "attack") {
      state = "hunt";
      target.copy(player.pos);
      huntT = 6;
    }

    if (state === "patrol" || state === "stalk") {
      if (pos.distanceTo(target) < 0.7) target = randomWaypoint(hotel, pos.y);
      huntT -= dt;
      if (state === "stalk" && huntT < 0) state = "patrol";
    }

    if (state === "hunt") {
      target.copy(player.pos);
      huntT -= dt;
      if (huntT < 0 && dist > 9) state = "patrol";
    }

    let speed = state === "hunt" ? 2.35 : state === "stalk" ? 1.15 : 0.85;
    if (pos.y < -1) speed *= 0.82;
    const dir = target.clone().sub(pos);
    dir.y = 0;
    const len = dir.length() || 1;
    dir.multiplyScalar(1 / len);
    vel.lerp(dir, 1 - Math.pow(0.04, dt));
    pos.x += vel.x * speed * dt;
    pos.z += vel.z * speed * dt;
    hotel.resolve(pos, 0.28, pos.y);
    pos.y = hotel.floorY(pos.x, pos.y, pos.z);

    bob += dt * (state === "hunt" ? 10 : 5);
    root.position.copy(pos);
    root.position.y = pos.y;
    root.rotation.y = Math.atan2(vel.x, vel.z);
    root.position.y += Math.sin(bob) * 0.03;
    if (head) head.rotation.z = Math.sin(bob * 0.5) * 0.15;

    const drip = root.userData.drip;
    if (drip) {
      const p = drip.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        let y = p.getY(i) - dt * 1.4;
        if (y < 0) y = 1.8;
        p.setY(i, y);
      }
      p.needsUpdate = true;
    }

    let grabbing = false;
    if (visible && sameFloor && dist < 0.95 && !player.hiding) {
      grabT += dt;
      state = "attack";
      if (grabT > 0.28) grabbing = true;
    } else grabT = 0;

    return { dist: sameFloor ? dist : dist + 8, state, grabbing, visible };
  }

  function lookPoint() {
    return pos.clone().add(new THREE.Vector3(0, 1.6, 0));
  }

  global.BTEntity = {
    spawn,
    wake,
    vanish,
    appearNear,
    update,
    lookPoint,
    get pos() { return pos; },
    get state() { return state; },
    get visible() { return visible; },
  };
})(window);
