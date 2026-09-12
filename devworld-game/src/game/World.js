import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const BLOCK_TYPES = {
  grass: { color: 0x4a8f3f, name: '草地' },
  stone: { color: 0x7a7a82, name: '石头' },
  code: { color: 0x2a4a7f, emissive: 0x1a3060, name: '代码块' },
  glass: { color: 0x88ccee, opacity: 0.5, name: '玻璃' },
};

export class World {
  constructor(scene) {
    this.scene = scene;
    this.terrainMeshes = [];
    this.loadedModels = {};
    this.loadAssets();
    this.buildTerrain();
    this.buildStructures();
    this.buildDecorations();
  }

  async loadAssets() {
    const loader = new GLTFLoader();
    const models = ['tree', 'terminal', 'bug', 'crystal'];
    for (const name of models) {
      try {
        const gltf = await loader.loadAsync(`/models/${name}.glb`);
        this.loadedModels[name] = gltf.scene;
      } catch {
        // Fallback to procedural geometry
      }
    }
    this.placeTrees();
  }

  buildTerrain() {
    const islandRadius = 35;
    const segments = 64;

    const geometry = new THREE.PlaneGeometry(
      islandRadius * 2,
      islandRadius * 2,
      segments,
      segments
    );
    geometry.rotateX(-Math.PI / 2);

    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const dist = Math.sqrt(x * x + z * z);
      const edge = Math.max(0, 1 - dist / islandRadius);
      const edgeFactor = edge * edge * (3 - 2 * edge);

      const h =
        Math.sin(x * 0.15) * Math.cos(z * 0.12) * 2 +
        Math.sin(x * 0.4 + 1) * Math.cos(z * 0.35) * 0.8 +
        Math.sin(x * 0.08) * 1.5;

      const height = Math.max(-8, h * edgeFactor);
      pos.setY(i, height);
    }
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      color: 0x3d7a37,
      roughness: 0.85,
      metalness: 0.05,
      flatShading: false,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.terrainMesh = mesh;
    this.terrainGeometry = geometry;

    this.buildWater(islandRadius);
    this.buildPaths();
  }

  buildWater(radius) {
    const waterGeo = new THREE.CircleGeometry(radius + 15, 64);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x1a6090,
      roughness: 0.2,
      metalness: 0.6,
      transparent: true,
      opacity: 0.75,
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.position.y = -1.5;
    this.scene.add(water);
  }

  buildPaths() {
    const pathMat = new THREE.MeshStandardMaterial({ color: 0x8a7a60, roughness: 0.9 });
    const points = [
      [0, 0], [4, -2], [8, -5], [0, 0], [-5, 3], [-10, -5],
    ];
    for (let i = 0; i < points.length - 1; i++) {
      const [x1, z1] = points[i];
      const [x2, z2] = points[i + 1];
      const dx = x2 - x1;
      const dz = z2 - z1;
      const len = Math.sqrt(dx * dx + dz * dz);
      const geo = new THREE.BoxGeometry(len, 0.1, 1.5);
      const mesh = new THREE.Mesh(geo, pathMat);
      mesh.position.set((x1 + x2) / 2, 0.15, (z1 + z2) / 2);
      mesh.rotation.y = Math.atan2(dx, dz);
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
  }

  buildStructures() {
    this.createCodeMonolith(new THREE.Vector3(-8, 0, -10));
    this.createBuildPlatform(new THREE.Vector3(15, 0, 5));
  }

  createCodeMonolith(pos) {
    const group = new THREE.Group();
    const geo = new THREE.BoxGeometry(3, 6, 0.5);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1a3060,
      emissive: 0x0a1840,
      roughness: 0.3,
      metalness: 0.5,
    });
    const slab = new THREE.Mesh(geo, mat);
    slab.position.y = 3;
    slab.castShadow = true;
    group.add(slab);

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = '#64ffb4';
    ctx.font = '14px monospace';
    ctx.fillText('function dev() {', 10, 30);
    ctx.fillText('  return "world";', 10, 55);
    ctx.fillText('}', 10, 80);

    const tex = new THREE.CanvasTexture(canvas);
    const screenMat = new THREE.MeshStandardMaterial({
      map: tex,
      emissive: 0x112233,
      emissiveIntensity: 0.5,
    });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 1.2), screenMat);
    screen.position.set(0, 4, 0.26);
    group.add(screen);

    group.position.copy(pos);
    group.position.y = this.getTerrainHeight(pos.x, pos.z);
    this.scene.add(group);
  }

  createBuildPlatform(pos) {
    const group = new THREE.Group();
    const geo = new THREE.CylinderGeometry(4, 4.5, 0.5, 16);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x555566,
      roughness: 0.6,
      metalness: 0.3,
    });
    const platform = new THREE.Mesh(geo, mat);
    platform.position.y = 0.25;
    platform.castShadow = true;
    platform.receiveShadow = true;
    group.add(platform);

    const ringGeo = new THREE.TorusGeometry(4.2, 0.15, 8, 32);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x64b4ff,
      emissive: 0x2060a0,
      emissiveIntensity: 0.5,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.5;
    group.add(ring);

    group.position.copy(pos);
    group.position.y = this.getTerrainHeight(pos.x, pos.z);
    this.scene.add(group);
  }

  buildDecorations() {
    const crystalPositions = [
      [-12, -3], [6, 10], [-4, 12], [14, -8],
    ];
    for (const [x, z] of crystalPositions) {
      this.createCrystal(new THREE.Vector3(x, 0, z));
    }
  }

  createCrystal(pos) {
    const geo = new THREE.OctahedronGeometry(0.6, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x64b4ff,
      emissive: 0x2060c0,
      emissiveIntensity: 0.6,
      roughness: 0.2,
      metalness: 0.8,
      transparent: true,
      opacity: 0.85,
    });
    const crystal = new THREE.Mesh(geo, mat);
    crystal.position.copy(pos);
    crystal.position.y = this.getTerrainHeight(pos.x, pos.z) + 1;
    crystal.castShadow = true;
    this.scene.add(crystal);
  }

  placeTrees() {
    const treePositions = [
      [-5, 6], [3, 8], [-12, 2], [10, -3], [-8, -5], [6, -10], [-15, -8], [18, 2],
    ];
    for (const [x, z] of treePositions) {
      if (this.loadedModels.tree) {
        const tree = this.loadedModels.tree.clone();
        tree.position.set(x, this.getTerrainHeight(x, z), z);
        tree.scale.setScalar(1.5);
        tree.traverse((c) => {
          if (c.isMesh) {
            c.castShadow = true;
            c.receiveShadow = true;
          }
        });
        this.scene.add(tree);
      } else {
        this.createProceduralTree(x, z);
      }
    }
  }

  createProceduralTree(x, z) {
    const group = new THREE.Group();
    const trunkGeo = new THREE.CylinderGeometry(0.2, 0.3, 2, 8);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3a1a });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 1;
    trunk.castShadow = true;
    group.add(trunk);

    const leavesGeo = new THREE.ConeGeometry(1.5, 3, 8);
    const leavesMat = new THREE.MeshStandardMaterial({ color: 0x2d6b2d });
    const leaves = new THREE.Mesh(leavesGeo, leavesMat);
    leaves.position.y = 3;
    leaves.castShadow = true;
    group.add(leaves);

    group.position.set(x, this.getTerrainHeight(x, z), z);
    this.scene.add(group);
  }

  createTerminal(pos) {
    if (this.loadedModels.terminal) {
      const terminal = this.loadedModels.terminal.clone();
      terminal.position.copy(pos);
      terminal.traverse((c) => {
        if (c.isMesh) {
          c.castShadow = true;
          c.receiveShadow = true;
        }
      });
      this.scene.add(terminal);
      return terminal;
    }

    const group = new THREE.Group();
    const deskGeo = new THREE.BoxGeometry(2, 1, 1);
    const deskMat = new THREE.MeshStandardMaterial({ color: 0x3a3a4a });
    const desk = new THREE.Mesh(deskGeo, deskMat);
    desk.position.y = 0.5;
    desk.castShadow = true;
    group.add(desk);

    const monitorGeo = new THREE.BoxGeometry(1.2, 0.8, 0.1);
    const monitorMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a2a,
      emissive: 0x0a3060,
      emissiveIntensity: 0.8,
    });
    const monitor = new THREE.Mesh(monitorGeo, monitorMat);
    monitor.position.set(0, 1.4, 0);
    monitor.castShadow = true;
    group.add(monitor);

    const standGeo = new THREE.BoxGeometry(0.1, 0.4, 0.1);
    const stand = new THREE.Mesh(standGeo, deskMat);
    stand.position.set(0, 1, 0);
    group.add(stand);

    group.position.copy(pos);
    this.scene.add(group);
    return group;
  }

  createBug(pos) {
    if (this.loadedModels.bug) {
      const bug = this.loadedModels.bug.clone();
      bug.position.copy(pos);
      bug.traverse((c) => {
        if (c.isMesh) c.castShadow = true;
      });
      this.scene.add(bug);
      return bug;
    }

    const group = new THREE.Group();
    const bodyGeo = new THREE.SphereGeometry(0.3, 8, 6);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xcc3333,
      emissive: 0x661111,
      emissiveIntensity: 0.3,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    group.add(body);

    for (let i = 0; i < 6; i++) {
      const legGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.4, 4);
      const leg = new THREE.Mesh(legGeo, bodyMat);
      const angle = (i / 6) * Math.PI * 2;
      leg.position.set(Math.cos(angle) * 0.25, -0.1, Math.sin(angle) * 0.25);
      leg.rotation.z = Math.cos(angle) * 0.8;
      leg.rotation.x = Math.sin(angle) * 0.8;
      group.add(leg);
    }

    group.position.copy(pos);
    this.scene.add(group);
    return group;
  }

  getTerrainHeight(x, z) {
    const islandRadius = 35;
    const dist = Math.sqrt(x * x + z * z);
    const edge = Math.max(0, 1 - dist / islandRadius);
    const edgeFactor = edge * edge * (3 - 2 * edge);
    const h =
      Math.sin(x * 0.15) * Math.cos(z * 0.12) * 2 +
      Math.sin(x * 0.4 + 1) * Math.cos(z * 0.35) * 0.8 +
      Math.sin(x * 0.08) * 1.5;
    return Math.max(-8, h * edgeFactor);
  }
}

export { BLOCK_TYPES };
