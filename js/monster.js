(function (global) {
  "use strict";

  function createMonster(textures) {
    const root = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({
      map: textures.skin,
      color: 0x1a1614,
      roughness: 0.38,
      metalness: 0.12,
      envMap: textures.env,
      envMapIntensity: 0.4,
    });
    const bone = new THREE.MeshStandardMaterial({
      color: 0x2a2420,
      roughness: 0.55,
      metalness: 0.05,
    });

    function limb(mat, sx, sy, sz) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
      m.castShadow = true;
      return m;
    }

    const pelvis = new THREE.Group();
    pelvis.position.y = 1.05;
    root.add(pelvis);

    const torso = limb(skin, 0.34, 0.85, 0.22);
    torso.position.y = 0.55;
    pelvis.add(torso);

    const chest = limb(skin, 0.38, 0.5, 0.24);
    chest.position.y = 1.12;
    pelvis.add(chest);

    const neck = limb(bone, 0.1, 0.28, 0.1);
    neck.position.y = 1.48;
    pelvis.add(neck);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), skin);
    head.position.y = 1.72;
    head.scale.set(0.95, 1.15, 0.85);
    pelvis.add(head);

    const jaw = limb(skin, 0.18, 0.08, 0.14);
    jaw.position.set(0, 1.55, 0.08);
    pelvis.add(jaw);

    function eye(x) {
      const g = new THREE.Group();
      const white = new THREE.Mesh(
        new THREE.SphereGeometry(0.045, 10, 10),
        new THREE.MeshBasicMaterial({ color: 0xf3ebd4 })
      );
      const pupil = new THREE.Mesh(
        new THREE.SphereGeometry(0.018, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0x110000 })
      );
      pupil.position.z = 0.03;
      g.add(white);
      g.add(pupil);
      g.position.set(x, 1.76, 0.16);
      pelvis.add(g);
      return g;
    }
    const leftEye = eye(-0.07);
    const rightEye = eye(0.07);
    const eyeLight = new THREE.PointLight(0xffe6c4, 0.35, 3.2, 2);
    eyeLight.position.set(0, 1.76, 0.2);
    pelvis.add(eyeLight);

    function arm(side) {
      const g = new THREE.Group();
      g.position.set(side * 0.24, 1.22, 0);
      const upper = limb(skin, 0.08, 0.7, 0.08);
      upper.position.y = -0.28;
      const lower = limb(skin, 0.07, 0.75, 0.07);
      lower.position.y = -0.85;
      const hand = limb(skin, 0.1, 0.28, 0.08);
      hand.position.y = -1.28;
      g.add(upper);
      g.add(lower);
      g.add(hand);
      pelvis.add(g);
      return g;
    }
    const leftArm = arm(-1);
    const rightArm = arm(1);

    function leg(side) {
      const g = new THREE.Group();
      g.position.set(side * 0.11, 1.05, 0);
      const upper = limb(skin, 0.1, 0.7, 0.12);
      upper.position.y = -0.32;
      const lower = limb(bone, 0.08, 0.72, 0.1);
      lower.position.y = -0.95;
      const foot = limb(skin, 0.12, 0.08, 0.28);
      foot.position.set(0, -1.34, 0.06);
      g.add(upper);
      g.add(lower);
      g.add(foot);
      root.add(g);
      return g;
    }
    const leftLeg = leg(-1);
    const rightLeg = leg(1);

    root.scale.set(1.12, 1.22, 1.12);

    return {
      root,
      pelvis,
      head,
      jaw,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      leftEye,
      rightEye,
      eyeLight,
    };
  }

  function Monster(level, textures) {
    this.level = level;
    this.parts = createMonster(textures);
    this.root = this.parts.root;
    this.root.position.set(level.monsterSpawn.x, 0, level.monsterSpawn.z);
    this.yaw = 0;
    this.state = "patrol";
    this.path = [];
    this.pathI = 0;
    this.speed = 1.35;
    this.repath = 0;
    this.lastKnown = null;
    this.vocTimer = 2;
    this.attacking = false;
    this.attackT = 0;
    this.searchT = 0;
    this.patrolI = 0;
    this.seenPlayer = false;
    this.anim = 0;
    this.stuck = 0;
  }

  Monster.prototype.gridPos = function () {
    return this.level.cell(this.root.position.x, this.root.position.z);
  };

  Monster.prototype.setPathTo = function (x, z, chase) {
    const a = this.gridPos();
    const b = this.level.cell(x, z);
    this.path = this.level.astar(a.c, a.r, b.c, b.r, !!chase);
    this.pathI = 0;
    if (chase && this.path.length) {
      for (const p of this.path) {
        const cell = this.level.cell(p.x, p.z);
        this.level.forceOpenDoorAt(cell.c, cell.r);
      }
    }
  };

  Monster.prototype.canSee = function (player, flashlightOn) {
    const mx = this.root.position.x;
    const mz = this.root.position.z;
    const px = player.x;
    const pz = player.z;
    const dist = Math.hypot(px - mx, pz - mz);
    if (dist > (flashlightOn ? 16 : 6.5)) return false;
    if (!this.level.hasLOS(mx, mz, px, pz)) return false;
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const dx = (px - mx) / (dist || 1);
    const dz = (pz - mz) / (dist || 1);
    const dot = fx * dx + fz * dz;
    if (dist < 3.2) return true;
    if (flashlightOn && dist < 14) return true;
    return dot > 0.15;
  };

  Monster.prototype.hear = function (player, radius) {
    const d = Math.hypot(player.x - this.root.position.x, player.z - this.root.position.z);
    return d < radius;
  };

  Monster.prototype.updateAnim = function (dt, moving, chase) {
    this.anim += dt * (chase ? 9 : moving ? 6 : 1.4);
    const s = Math.sin(this.anim);
    const c = Math.cos(this.anim);
    this.parts.leftLeg.rotation.x = s * (chase ? 0.7 : 0.4);
    this.parts.rightLeg.rotation.x = -s * (chase ? 0.7 : 0.4);
    this.parts.leftArm.rotation.x = -s * (chase ? 0.55 : 0.25) - 0.35;
    this.parts.rightArm.rotation.x = s * (chase ? 0.55 : 0.25) - 0.35;
    this.parts.leftArm.rotation.z = 0.25 + (chase ? 0.4 : 0);
    this.parts.rightArm.rotation.z = -0.25 - (chase ? 0.4 : 0);
    this.parts.head.rotation.z = Math.sin(this.anim * 0.35) * 0.08;
    this.parts.head.rotation.y = Math.sin(this.anim * 0.2) * 0.12;
    this.parts.jaw.rotation.x = chase ? 0.25 + Math.abs(s) * 0.15 : 0.05;
    this.parts.pelvis.position.y = 1.05 + Math.abs(s) * (moving ? 0.03 : 0.01);
    this.parts.eyeLight.intensity = chase ? 0.7 : 0.28;
    if (!moving) {
      this.parts.leftArm.rotation.x = -0.4 + Math.sin(this.anim * 0.4) * 0.05;
    }
    this.root.scale.y = 1.22 + Math.sin(this.anim * 0.15) * 0.015;
  };

  Monster.prototype.update = function (dt, player, flashlightOn, noiseRadius, hiding) {
    const pos = this.root.position;
    const dist = Math.hypot(player.x - pos.x, player.z - pos.z);
    const see = !hiding && this.canSee(player, flashlightOn);
    const hear = !hiding && this.hear(player, noiseRadius);

    if (see) {
      this.seenPlayer = true;
      this.lastKnown = { x: player.x, z: player.z };
      this.state = "hunt";
      this.searchT = 6;
    } else if (hear && this.state !== "hunt") {
      this.lastKnown = { x: player.x, z: player.z };
      this.state = "investigate";
    }

    if (this.state === "hunt" && !see) {
      this.searchT -= dt;
      if (this.searchT <= 0) this.state = "search";
    }

    this.repath -= dt;
    if (this.state === "hunt" && this.repath <= 0) {
      this.setPathTo(player.x, player.z, true);
      this.repath = 0.35;
      this.speed = 3.35;
    } else if (this.state === "investigate" && this.repath <= 0 && this.lastKnown) {
      this.setPathTo(this.lastKnown.x, this.lastKnown.z, true);
      this.repath = 0.8;
      this.speed = 2.15;
    } else if ((this.state === "patrol" || this.state === "search") && this.repath <= 0) {
      const wp = this.level.waypoints[this.patrolI % this.level.waypoints.length];
      this.patrolI++;
      this.setPathTo(wp.x, wp.z, false);
      this.repath = 2.5;
      this.speed = this.state === "search" ? 1.9 : 1.35;
    }

    if (this.state === "investigate" && this.lastKnown) {
      if (Math.hypot(pos.x - this.lastKnown.x, pos.z - this.lastKnown.z) < 1.2) {
        this.state = "search";
        this.repath = 0;
      }
    }

    let moving = false;
    if (this.path && this.pathI < this.path.length) {
      const tgt = this.path[this.pathI];
      const dx = tgt.x - pos.x;
      const dz = tgt.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.45) {
        this.pathI++;
      } else {
        const sp = this.speed * dt;
        const vx = (dx / d) * sp;
        const vz = (dz / d) * sp;
        const cell = this.level.cell(pos.x + vx, pos.z + vz);
        this.level.forceOpenDoorAt(cell.c, cell.r);
        this.level.moveWithCollision(pos, vx, vz, 0.28);
        this.yaw = Math.atan2(dx, dz);
        this.root.rotation.y = this.yaw;
        moving = true;
      }
    }

    if (dist < 1.35 && !hiding) {
      this.attacking = true;
    }

    this.vocTimer -= dt;
    if (this.vocTimer <= 0) {
      this.vocTimer = this.state === "hunt" ? 1.4 + Math.random() : 3.5 + Math.random() * 3;
      if (this.onVocal) this.onVocal(this.state === "hunt");
    }

    this.updateAnim(dt, moving, this.state === "hunt");
    return { dist, see, state: this.state };
  };

  global.WARD13 = global.WARD13 || {};
  global.WARD13.Monster = Monster;
})(window);
