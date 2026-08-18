import * as THREE from 'three';
import { getMap } from './maps.js';

function createCanvasTexture(draw, width = 256, height = 256, repeatX = 1, repeatY = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return texture;
}

function paintDirtyWall(ctx, w, h, base) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 80; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`;
    ctx.beginPath();
    ctx.arc(x, y, 4 + Math.random() * 18, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let y = 0; y < h; y += 6) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`;
    ctx.fillRect(0, y, w, 1);
  }
  for (let i = 0; i < 3; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const g = ctx.createRadialGradient(x, y, 0, x, y, 28);
    g.addColorStop(0, 'rgba(90,8,8,0.45)');
    g.addColorStop(1, 'rgba(90,8,8,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 40, y - 40, 80, 80);
  }
}

function paintFloor(ctx, w, h, base) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  const tile = 32;
  for (let x = 0; x < w; x += tile) {
    for (let y = 0; y < h; y += tile) {
      const s = 0.85 + Math.random() * 0.2;
      ctx.fillStyle = `rgba(0,0,0,${0.08 + Math.random() * 0.08})`;
      ctx.fillRect(x + 1, y + 1, tile - 2, tile - 2);
      ctx.fillStyle = `rgba(255,255,255,${0.02 * s})`;
      ctx.fillRect(x + 2, y + 2, tile - 6, tile - 6);
    }
  }
}

export class Environment {
  constructor(scene) {
    this.scene = scene;
    this.root = null;
    this.map = null;
    this.cellSize = 3;
    this.grid = [];
    this.walkable = [];
    this.walls = [];
    this.doors = [];
    this.keys = [];
    this.batteries = [];
    this.notes = [];
    this.hidingSpots = [];
    this.exitDoor = null;
    this.lights = [];
    this.flickeringLights = [];
    this.interactables = [];
    this.spawnPoint = new THREE.Vector3();
    this.mapWidth = 0;
    this.mapHeight = 0;
    this.dustParticles = null;
    this.collisionCache = null;
    this.ambientLight = null;
    this.fogColor = new THREE.Color(0x0a0808);
  }

  worldToCell(x, z) {
    const col = Math.round(x / this.cellSize + this.mapWidth / 2);
    const row = Math.round(z / this.cellSize + this.mapHeight / 2);
    return { col, row };
  }

  cellToWorld(col, row) {
    return {
      x: (col - this.mapWidth / 2) * this.cellSize,
      z: (row - this.mapHeight / 2) * this.cellSize,
    };
  }

  isBlocked(col, row) {
    if (row < 0 || col < 0 || row >= this.mapHeight || col >= this.mapWidth) return true;
    return this.grid[row][col] === 1;
  }

  isBlockedWorld(x, z, radius = 0.32) {
    const offsets = [
      [radius, radius], [radius, -radius], [-radius, radius], [-radius, -radius],
    ];
    for (const [ox, oz] of offsets) {
      const { col, row } = this.worldToCell(x + ox, z + oz);
      if (this.isBlocked(col, row)) return true;
    }
    if (this.exitDoor && !this.exitDoor.userData.open) {
      const dx = x - this.exitDoor.position.x;
      const dz = z - this.exitDoor.position.z;
      if (dx * dx + dz * dz < 1.1) return true;
    }
    return false;
  }

  hasLineOfSight(ax, az, bx, bz) {
    let { col: x0, row: y0 } = this.worldToCell(ax, az);
    const { col: x1, row: y1 } = this.worldToCell(bx, bz);
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    while (true) {
      if (this.isBlocked(x0, y0)) return false;
      if (x0 === x1 && y0 === y1) return true;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
  }

  clear() {
    if (this.root) {
      this.scene.remove(this.root);
      this.root.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach(m => {
            if (m.map) m.map.dispose();
            m.dispose();
          });
        }
      });
    }
    this.lights.forEach(l => this.scene.remove(l));
    if (this.ambientLight) this.scene.remove(this.ambientLight);

    this.root = null;
    this.walls = [];
    this.doors = [];
    this.keys = [];
    this.batteries = [];
    this.notes = [];
    this.hidingSpots = [];
    this.exitDoor = null;
    this.lights = [];
    this.flickeringLights = [];
    this.interactables = [];
    this.walkable = [];
    this.dustParticles = null;
    this.collisionCache = null;
  }

  build(mapId = 'hospital') {
    this.clear();
    this.map = getMap(mapId);
    const layout = this.map.layout;
    this.mapHeight = layout.length;
    this.mapWidth = layout[0].length;
    this.grid = layout.map(row => row.split('').map(ch => (ch === '#' ? 1 : 0)));

    this.root = new THREE.Group();
    this.createMaterials();
    this.buildGeometry(layout);
    this.createLighting();
    this.createAtmosphere();
    this.createDetails(layout);
    this.scene.add(this.root);

    this.fogColor.set(this.map.fog);
    this.scene.background = this.fogColor;
    this.scene.fog = new THREE.FogExp2(this.map.fog, this.map.fogDensity);

    return this.snapshot();
  }

  snapshot() {
    return {
      spawnPoint: this.spawnPoint,
      keys: this.keys,
      doors: this.doors,
      exitDoor: this.exitDoor,
      hidingSpots: this.hidingSpots,
      lights: this.lights,
      flickeringLights: this.flickeringLights,
      interactables: this.interactables,
      walkable: this.walkable,
      map: this.map,
    };
  }

  createMaterials() {
    this.wallTex = createCanvasTexture(
      (ctx, w, h) => paintDirtyWall(ctx, w, h, this.map.wallColor), 256, 256
    );
    this.floorTex = createCanvasTexture(
      (ctx, w, h) => paintFloor(ctx, w, h, this.map.floorColor), 256, 256,
      this.mapWidth / 3, this.mapHeight / 3
    );
    this.ceilTex = createCanvasTexture(
      (ctx, w, h) => paintDirtyWall(ctx, w, h, this.map.ceilColor), 256, 256
    );

    this.wallMat = new THREE.MeshLambertMaterial({ map: this.wallTex, color: 0xbbbbbb });
    this.floorMat = new THREE.MeshLambertMaterial({ map: this.floorTex, color: 0x999999 });
    this.ceilMat = new THREE.MeshLambertMaterial({ map: this.ceilTex, color: 0x777777 });
    this.doorMat = new THREE.MeshLambertMaterial({ color: 0x3a2a1a });
    this.keyMat = new THREE.MeshLambertMaterial({
      color: 0xffd700,
      emissive: 0xaa7700,
      emissiveIntensity: 0.6,
    });
    this.batteryMat = new THREE.MeshLambertMaterial({
      color: 0x44ff88,
      emissive: 0x116633,
      emissiveIntensity: 0.5,
    });
  }

  buildGeometry(layout) {
    const wallPositions = [];
    const dummy = new THREE.Object3D();
    const noteTexts = [...(this.map.notes || [])];
    let noteIndex = 0;

    for (let row = 0; row < this.mapHeight; row++) {
      for (let col = 0; col < this.mapWidth; col++) {
        const ch = layout[row][col];
        const { x, z } = this.cellToWorld(col, row);

        if (ch !== '#') {
          this.walkable.push(new THREE.Vector3(x, 0, z));
        }

        if (ch === '#') {
          wallPositions.push([x, 1.75, z]);
        }
        if (ch === 'S') this.spawnPoint.set(x, 1.7, z);
        if (ch === 'K') this.createKey(x, 1.2, z);
        if (ch === 'B') this.createBattery(x, 1.0, z);
        if (ch === 'E') this.createDoor(x, z, true);
        if (ch === 'H') this.createHidingSpot(x, z);
        if (ch === 'N') {
          this.createNote(x, z, noteTexts[noteIndex % noteTexts.length] || '字迹已被撕掉。');
          noteIndex++;
        }
      }
    }

    const wallGeo = new THREE.BoxGeometry(this.cellSize, 3.5, this.cellSize);
    const wallMesh = new THREE.InstancedMesh(wallGeo, this.wallMat, wallPositions.length);
    wallMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    wallPositions.forEach((pos, i) => {
      dummy.position.set(pos[0], pos[1], pos[2]);
      dummy.updateMatrix();
      wallMesh.setMatrixAt(i, dummy.matrix);
    });
    wallMesh.instanceMatrix.needsUpdate = true;
    this.root.add(wallMesh);
    this.walls.push(wallMesh);

    const floorW = this.mapWidth * this.cellSize;
    const floorH = this.mapHeight * this.cellSize;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(floorW, floorH), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    this.root.add(floor);

    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(floorW, floorH), this.ceilMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = 3.5;
    this.root.add(ceiling);
  }

  createKey(x, y, z) {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 6, 10), this.keyMat);
    ring.rotation.x = Math.PI / 2;
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.2, 0.02), this.keyMat);
    shaft.position.set(0.1, -0.1, 0);
    group.add(ring, shaft);
    group.position.set(x, y, z);
    group.userData = { type: 'key', collected: false, id: this.keys.length };
    this.root.add(group);
    this.keys.push(group);
    this.interactables.push(group);
  }

  createBattery(x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.08), this.batteryMat);
    mesh.position.set(x, y, z);
    mesh.userData = { type: 'battery', collected: false };
    this.root.add(mesh);
    this.batteries.push(mesh);
    this.interactables.push(mesh);
  }

  createNote(x, z, text) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.35, 0.45),
      new THREE.MeshLambertMaterial({ color: 0xc8b48a, emissive: 0x332211, emissiveIntensity: 0.2 })
    );
    mesh.position.set(x, 1.2, z);
    mesh.userData = { type: 'note', text, read: false };
    this.root.add(mesh);
    this.notes.push(mesh);
    this.interactables.push(mesh);
  }

  createHidingSpot(x, z) {
    const group = new THREE.Group();
    const locker = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 2.2, 0.6),
      new THREE.MeshLambertMaterial({ color: 0x3a3e44 })
    );
    locker.position.y = 1.1;
    group.add(locker);
    group.position.set(x, 0, z);
    group.userData = { type: 'hide', occupied: false };
    this.root.add(group);
    this.hidingSpots.push(group);
    this.interactables.push(group);
  }

  createDoor(x, z, isExit) {
    const group = new THREE.Group();
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 2.8, 2.1),
      new THREE.MeshLambertMaterial({ color: isExit ? 0x4a2010 : 0x3a2a1a })
    );
    door.position.y = 1.4;
    group.add(door);
    group.position.set(x, 0, z);
    group.userData = { type: isExit ? 'exit' : 'door', open: false };
    this.root.add(group);
    if (isExit) this.exitDoor = group;
    else this.doors.push(group);
    this.interactables.push(group);
  }

  createLighting() {
    this.ambientLight = new THREE.AmbientLight(this.map.ambient, 0.32);
    this.scene.add(this.ambientLight);

    const hemi = this.scene.getObjectByName('hemi-fill');
    if (hemi) hemi.color.set(this.map.lightTint);

    const candidates = this.walkable.filter((_, i) => i % 7 === 0).slice(0, 5);
    candidates.forEach((pos, i) => {
      const intensity = 0.45 + (i % 2) * 0.15;
      const light = new THREE.PointLight(this.map.lightTint, intensity, 10, 2);
      light.position.set(pos.x, 3.1, pos.z);
      light.castShadow = false;
      this.root.add(light);
      this.lights.push(light);

      const fixture = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.26, 0.1, 6),
        new THREE.MeshLambertMaterial({
          color: 0x333333,
          emissive: this.map.lightTint,
          emissiveIntensity: 0.25,
        })
      );
      fixture.position.set(pos.x, 3.35, pos.z);
      this.root.add(fixture);

      if (i % 2 === 0) {
        this.flickeringLights.push({
          light,
          fixture,
          baseIntensity: intensity,
          nextFlicker: 1 + Math.random() * 3,
        });
      }
    });

    if (this.exitDoor) {
      const red = new THREE.PointLight(0xff2200, 0.35, 12, 2);
      red.position.copy(this.exitDoor.position);
      red.position.y = 2.6;
      this.root.add(red);
      this.lights.push(red);
    }
  }

  createAtmosphere() {
    const count = 120;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const spanX = this.mapWidth * this.cellSize;
    const spanZ = this.mapHeight * this.cellSize;
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * spanX;
      pos[i * 3 + 1] = Math.random() * 3.2;
      pos[i * 3 + 2] = (Math.random() - 0.5) * spanZ;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dustParticles = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0x888888,
        size: 0.035,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      })
    );
    this.root.add(this.dustParticles);
  }

  createDetails(layout) {
    const writings = this.map.writings || [];
    writings.forEach((w, i) => {
      const cell = this.walkable[(i * 11 + 3) % this.walkable.length];
      if (!cell) return;
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'rgba(90, 12, 12, 0.85)';
      ctx.font = 'bold 28px serif';
      ctx.textAlign = 'center';
      ctx.fillText(w.text, 128, 42);
      const tex = new THREE.CanvasTexture(canvas);
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1.6, 0.4),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })
      );
      mesh.position.set(cell.x, 1.6, cell.z);
      const { col, row } = this.worldToCell(cell.x, cell.z);
      if (this.isBlocked(col + 1, row)) mesh.rotation.y = -Math.PI / 2;
      else if (this.isBlocked(col - 1, row)) mesh.rotation.y = Math.PI / 2;
      this.root.add(mesh);
    });
  }

  getSpawnYaw() {
    const { col, row } = this.worldToCell(this.spawnPoint.x, this.spawnPoint.z);
    const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]];
    for (const [dc, dr] of dirs) {
      if (!this.isBlocked(col + dc, row + dr)) {
        const w = this.cellToWorld(col + dc, row + dr);
        const dx = w.x - this.spawnPoint.x;
        const dz = w.z - this.spawnPoint.z;
        return Math.atan2(-dx, -dz);
      }
    }
    return 0;
  }

  getRandomWalkable(minDist = 8, from = this.spawnPoint) {
    const pool = this.walkable.filter(p => p.distanceTo(from) > minDist);
    return (pool.length ? pool : this.walkable)[Math.floor(Math.random() * (pool.length || this.walkable.length))].clone();
  }

  getPatrolPoints(count = 6) {
    const pts = [];
    const step = Math.max(1, Math.floor(this.walkable.length / count));
    for (let i = 0; i < count; i++) {
      const p = this.walkable[(i * step + 5) % this.walkable.length];
      if (p) pts.push(p.clone());
    }
    return pts;
  }

  update(delta, elapsed, frame) {
    this.flickeringLights.forEach(fl => {
      fl.nextFlicker -= delta;
      if (fl.nextFlicker <= 0) {
        const on = Math.random() > 0.35;
        fl.light.intensity = on ? fl.baseIntensity : 0;
        if (fl.fixture.material) fl.fixture.material.emissiveIntensity = on ? 0.25 : 0;
        fl.nextFlicker = on ? 0.8 + Math.random() * 3 : 0.05 + Math.random() * 0.2;
      }
    });

    this.keys.forEach(key => {
      if (!key.userData.collected) {
        key.rotation.y += delta * 2;
        key.position.y = 1.2 + Math.sin(elapsed * 2 + key.userData.id) * 0.08;
      }
    });

    if (this.dustParticles && frame % 3 === 0) {
      this.dustParticles.rotation.y += delta * 0.04;
    }
  }

  setLightsDim(factor) {
    this.lights.forEach(l => {
      if (l.userData.base == null) l.userData.base = l.intensity;
      l.intensity = l.userData.base * factor;
    });
  }

  restoreLights() {
    this.lights.forEach(l => {
      if (l.userData.base != null) l.intensity = l.userData.base;
    });
    this.flickeringLights.forEach(fl => {
      fl.light.intensity = fl.baseIntensity;
    });
  }
}
