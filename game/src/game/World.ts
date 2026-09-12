import * as THREE from 'three';
import { BlockType, createBlockMaterial } from './BlockRegistry';
import type { WorldSaveData } from './SaveManager';

const BLOCK_SIZE = 1;

export class World {
  private blocks = new Map<string, { mesh: THREE.Mesh; type: BlockType }>();
  private scene: THREE.Scene;
  private raycaster = new THREE.Raycaster();
  private geometry = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
  private highlightMesh: THREE.Mesh;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    const highlightGeo = new THREE.BoxGeometry(BLOCK_SIZE + 0.02, BLOCK_SIZE + 0.02, BLOCK_SIZE + 0.02);
    const highlightMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.25,
      wireframe: true,
    });
    this.highlightMesh = new THREE.Mesh(highlightGeo, highlightMat);
    this.highlightMesh.visible = false;
    scene.add(this.highlightMesh);
  }

  private key(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }

  getBlockCount(): number {
    return this.blocks.size;
  }

  generateTerrain(): void {
    const size = 16;
    for (let x = -size; x < size; x++) {
      for (let z = -size; z < size; z++) {
        const height = Math.floor(
          Math.sin(x * 0.15) * 2 + Math.cos(z * 0.12) * 2 + Math.sin((x + z) * 0.08) * 1.5
        );
        for (let y = -3; y <= height; y++) {
          const type: BlockType = y === height && height >= 0 ? 'grass' : y >= height - 2 ? 'stone' : 'stone';
          this.placeBlock(x, y, z, type, false);
        }
      }
    }

    // 示例建筑：一棵简单的树
    this.buildTree(5, 0, 5);
    // 示例平台
    for (let x = -2; x <= 2; x++) {
      for (let z = -8; z <= -6; z++) {
        this.placeBlock(x, 2, z, 'wood', false);
      }
    }
    this.placeBlock(0, 3, -7, 'glass', false);
  }

  private buildTree(baseX: number, baseY: number, baseZ: number): void {
    const groundY = this.getTopBlockY(baseX, baseZ);
    const y = groundY + 1;
    for (let i = 0; i < 4; i++) {
      this.placeBlock(baseX, y + i, baseZ, 'wood', false);
    }
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        for (let dy = 0; dy <= 1; dy++) {
          if (Math.abs(dx) === 2 && Math.abs(dz) === 2 && dy === 1) continue;
          this.placeBlock(baseX + dx, y + 3 + dy, baseZ + dz, 'grass', false);
        }
      }
    }
  }

  private getTopBlockY(x: number, z: number): number {
    for (let y = 20; y >= -10; y--) {
      if (this.blocks.has(this.key(x, y, z))) return y;
    }
    return -1;
  }

  placeBlock(x: number, y: number, z: number, type: BlockType, playSound = true): boolean {
    const k = this.key(x, y, z);
    if (this.blocks.has(k)) return false;

    const material = createBlockMaterial(type);
    const mesh = new THREE.Mesh(this.geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { blockType: type, gridPos: { x, y, z } };

    this.scene.add(mesh);
    this.blocks.set(k, { mesh, type });
    return true;
  }

  removeBlock(x: number, y: number, z: number): BlockType | null {
    const k = this.key(x, y, z);
    const block = this.blocks.get(k);
    if (!block) return null;

    this.scene.remove(block.mesh);
    if (Array.isArray(block.mesh.material)) {
      block.mesh.material.forEach((m) => m.dispose());
    } else {
      block.mesh.material.dispose();
    }
    this.blocks.delete(k);
    return block.type;
  }

  getPlacementTarget(
    camera: THREE.Camera,
    playerPos: THREE.Vector3,
    maxDistance = 8
  ): { place: THREE.Vector3; hit: THREE.Vector3; faceNormal: THREE.Vector3 } | null {
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const meshes = Array.from(this.blocks.values()).map((b) => b.mesh);
    const hits = this.raycaster.intersectObjects(meshes, false);

    if (hits.length === 0) return null;

    const hit = hits[0];
    if (hit.distance > maxDistance) return null;

    const normal = hit.face!.normal.clone().transformDirection(hit.object.matrixWorld).round();
    const hitPos = hit.point.clone().add(normal.clone().multiplyScalar(-0.01));
    const gridHit = new THREE.Vector3(
      Math.round(hitPos.x),
      Math.round(hitPos.y),
      Math.round(hitPos.z)
    );

    const placePos = gridHit.clone().add(normal);

    // 不能在玩家体内放置
    const playerBox = new THREE.Box3(
      new THREE.Vector3(playerPos.x - 0.35, playerPos.y - 0.9, playerPos.z - 0.35),
      new THREE.Vector3(playerPos.x + 0.35, playerPos.y + 0.5, playerPos.z + 0.35)
    );
    const blockBox = new THREE.Box3(
      new THREE.Vector3(placePos.x - 0.5, placePos.y - 0.5, placePos.z - 0.5),
      new THREE.Vector3(placePos.x + 0.5, placePos.y + 0.5, placePos.z + 0.5)
    );
    if (playerBox.intersectsBox(blockBox)) return null;

    return { place: placePos, hit: gridHit, faceNormal: normal };
  }

  updateHighlight(camera: THREE.Camera, playerPos: THREE.Vector3): void {
    const target = this.getPlacementTarget(camera, playerPos);
    if (target) {
      this.highlightMesh.position.copy(target.hit);
      this.highlightMesh.visible = true;
    } else {
      this.highlightMesh.visible = false;
    }
  }

  tryPlace(camera: THREE.Camera, playerPos: THREE.Vector3, type: BlockType): boolean {
    const target = this.getPlacementTarget(camera, playerPos);
    if (!target) return false;
    return this.placeBlock(
      Math.round(target.place.x),
      Math.round(target.place.y),
      Math.round(target.place.z),
      type
    );
  }

  tryRemove(camera: THREE.Camera): BlockType | null {
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const meshes = Array.from(this.blocks.values()).map((b) => b.mesh);
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (hits.length === 0 || hits[0].distance > 8) return null;

    const pos = hits[0].object.position;
    return this.removeBlock(Math.round(pos.x), Math.round(pos.y), Math.round(pos.z));
  }

  serialize(): WorldSaveData['blocks'] {
    return Array.from(this.blocks.entries()).map(([k, b]) => {
      const [x, y, z] = k.split(',').map(Number);
      return { x, y, z, type: b.type };
    });
  }

  loadFromSave(blocks: WorldSaveData['blocks']): void {
    this.clear();
    for (const b of blocks) {
      this.placeBlock(b.x, b.y, b.z, b.type, false);
    }
  }

  clear(): void {
    for (const [, block] of this.blocks) {
      this.scene.remove(block.mesh);
      if (Array.isArray(block.mesh.material)) {
        block.mesh.material.forEach((m) => m.dispose());
      } else {
        block.mesh.material.dispose();
      }
    }
    this.blocks.clear();
  }

  getGroundHeight(x: number, z: number): number {
    return this.getTopBlockY(Math.round(x), Math.round(z)) + 1;
  }
}
