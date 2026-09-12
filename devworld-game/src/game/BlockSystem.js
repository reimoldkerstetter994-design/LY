import * as THREE from 'three';
import { BLOCK_TYPES } from './World.js';

export class BlockSystem {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.blocks = new Map();
    this.selectedType = 'grass';
    this.selectedSlot = 0;
    this.onPlace = null;

    this.blockGeo = new THREE.BoxGeometry(1, 1, 1);
    this.materials = {};
    for (const [type, cfg] of Object.entries(BLOCK_TYPES)) {
      this.materials[type] = new THREE.MeshStandardMaterial({
        color: cfg.color,
        emissive: cfg.emissive || 0x000000,
        emissiveIntensity: cfg.emissive ? 0.3 : 0,
        roughness: 0.7,
        metalness: type === 'code' ? 0.4 : 0.1,
        transparent: cfg.opacity !== undefined,
        opacity: cfg.opacity ?? 1,
      });
    }

    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 8;
    this.placeStarterBlocks();
  }

  key(x, y, z) {
    return `${x},${y},${z}`;
  }

  hasBlock(x, y, z) {
    return this.blocks.has(this.key(x, y, z));
  }

  selectSlot(index) {
    const types = Object.keys(BLOCK_TYPES);
    if (index >= 0 && index < types.length) {
      this.selectedSlot = index;
      this.selectedType = types[index];
    }
  }

  placeStarterBlocks() {
    const starter = [
      [14, 1, 5, 'stone'], [15, 1, 5, 'stone'], [16, 1, 5, 'stone'],
      [14, 1, 6, 'stone'], [15, 1, 6, 'code'], [16, 1, 6, 'stone'],
      [14, 1, 7, 'stone'], [15, 1, 7, 'stone'], [16, 1, 7, 'stone'],
    ];
    for (const [x, y, z, type] of starter) {
      this.addBlock(x, y, z, type, false);
    }
  }

  addBlock(x, y, z, type, countPlacement = true) {
    const k = this.key(x, y, z);
    if (this.blocks.has(k)) return false;

    const mesh = new THREE.Mesh(this.blockGeo, this.materials[type]);
    mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { blockType: type };
    this.scene.add(mesh);
    this.blocks.set(k, { mesh, type });

    if (countPlacement && this.onPlace) this.onPlace();
    return true;
  }

  removeBlock(camera) {
    const hit = this.getRaycastHit(camera);
    if (!hit || !hit.isBlock) return;

    const k = this.key(hit.x, hit.y, hit.z);
    const block = this.blocks.get(k);
    if (!block) return;

    this.scene.remove(block.mesh);
    block.mesh.geometry.dispose();
    this.blocks.delete(k);
  }

  placeBlock(camera) {
    const hit = this.getRaycastHit(camera);
    if (!hit) return;

    let nx, ny, nz;
    if (hit.isBlock) {
      nx = hit.x + hit.normal.x;
      ny = hit.y + hit.normal.y;
      nz = hit.z + hit.normal.z;
    } else {
      nx = hit.x;
      ny = hit.y + 1;
      nz = hit.z;
    }

    const playerBlock = new THREE.Vector3(
      Math.floor(camera.position.x),
      Math.floor(camera.position.y - 1),
      Math.floor(camera.position.z)
    );
    const placePos = new THREE.Vector3(nx, ny, nz);
    if (placePos.distanceTo(playerBlock) < 1.5) return;

    this.addBlock(nx, ny, nz, this.selectedType);
  }

  getRaycastHit(camera) {
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

    const blockMeshes = [];
    for (const [, block] of this.blocks) {
      blockMeshes.push(block.mesh);
    }

    const blockHits = this.raycaster.intersectObjects(blockMeshes);
    if (blockHits.length > 0) {
      const point = blockHits[0].point;
      const normal = blockHits[0].face.normal;
      const bx = Math.floor(point.x - normal.x * 0.5);
      const by = Math.floor(point.y - normal.y * 0.5);
      const bz = Math.floor(point.z - normal.z * 0.5);
      return { x: bx, y: by, z: bz, normal, isBlock: true };
    }

    if (this.world.terrainMesh) {
      const terrainHits = this.raycaster.intersectObject(this.world.terrainMesh);
      if (terrainHits.length > 0) {
        const point = terrainHits[0].point;
        const normal = terrainHits[0].face.normal;
        const bx = Math.floor(point.x + normal.x * 0.5);
        const by = Math.floor(point.y + normal.y * 0.5);
        const bz = Math.floor(point.z + normal.z * 0.5);
        return { x: bx, y: by, z: bz, normal, isBlock: false };
      }
    }

    return null;
  }
}
