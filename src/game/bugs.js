import * as THREE from "three";

export class BugField {
  constructor(scene, spawns) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.bugs = spawns.map((p, i) => makeBug(this.group, p, i));
  }

  update(dt, t, playerPos) {
    for (const bug of this.bugs) {
      if (!bug.alive) continue;
      bug.phase += dt;
      const wander = 1.8;
      bug.position.x = bug.home.x + Math.cos(t * 0.7 + bug.seed) * wander;
      bug.position.z = bug.home.z + Math.sin(t * 0.55 + bug.seed * 1.7) * wander;
      bug.position.y = 0.45 + Math.sin(t * 4 + bug.seed) * 0.08;
      bug.mesh.position.copy(bug.position);
      bug.mesh.rotation.y += dt * 3;
      const dist = bug.position.distanceTo(playerPos);
      bug.near = dist < 1.05;
    }
  }

  hitscan(origin, dir) {
    const ray = new THREE.Ray(origin, dir.clone().normalize());
    let best = null;
    let bestD = 18;
    for (const bug of this.bugs) {
      if (!bug.alive) continue;
      const hit = new THREE.Vector3();
      const ok = ray.intersectSphere(new THREE.Sphere(bug.position, 0.55), hit);
      if (!ok) continue;
      const d = origin.distanceTo(hit);
      if (d < bestD) {
        bestD = d;
        best = bug;
      }
    }
    return best;
  }

  hurt(bug, dmg = 1) {
    bug.hp -= dmg;
    bug.mesh.scale.setScalar(0.85);
    if (bug.hp > 0) return false;
    this.squash(bug);
    return true;
  }

  squash(bug) {
    bug.alive = false;
    bug.mesh.visible = false;
  }

  get aliveCount() {
    return this.bugs.filter((b) => b.alive).length;
  }
}

function makeBug(group, spawn, i) {
  const geo = new THREE.IcosahedronGeometry(0.28, 0);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xff3355,
    emissive: 0xaa1028,
    emissiveIntensity: 1.8,
    roughness: 0.35,
  });
  const mesh = new THREE.Mesh(geo, mat);
  const eye = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xfff3a0, emissive: 0xffee88, emissiveIntensity: 2 })
  );
  eye.position.set(0.16, 0.08, 0.12);
  mesh.add(eye);
  const pos = new THREE.Vector3(spawn[0], spawn[1], spawn[2]);
  mesh.position.copy(pos);
  group.add(mesh);
  return {
    id: i,
    mesh,
    position: pos,
    home: pos.clone(),
    seed: i * 1.37,
    phase: 0,
    hp: 2,
    alive: true,
    near: false,
  };
}
