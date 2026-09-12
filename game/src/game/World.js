import * as THREE from 'three';
import { BLOCK_TYPES, BLOCK_DEFS, isSolid, isTransparent } from './BlockTypes.js';
import { getTerrainHeight, getBiome } from './Noise.js';

const CHUNK_SIZE = 16;
const WORLD_HEIGHT = 32;
const RENDER_DISTANCE = 4;

export class World {
  constructor(scene) {
    this.scene = scene;
    this.chunks = new Map();
    this.chunkMeshes = new Map();
    this.modifiedBlocks = new Map();
    this.materials = this.createMaterials();
  }

  createMaterials() {
    const mats = {};
    for (const [id, def] of Object.entries(BLOCK_DEFS)) {
      if (!def.color) continue;
      mats[id] = new THREE.MeshLambertMaterial({
        color: def.color,
        transparent: def.transparent || false,
        opacity: def.opacity ?? 1,
        side: def.transparent ? THREE.DoubleSide : THREE.FrontSide,
      });
    }
    return mats;
  }

  getBlockKey(x, y, z) {
    return `${x},${y},${z}`;
  }

  getChunkKey(cx, cz) {
    return `${cx},${cz}`;
  }

  worldToChunk(x, z) {
    return {
      cx: Math.floor(x / CHUNK_SIZE),
      cz: Math.floor(z / CHUNK_SIZE),
      lx: ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE,
      lz: ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE,
    };
  }

  getBlock(x, y, z) {
    const modKey = this.getBlockKey(x, y, z);
    if (this.modifiedBlocks.has(modKey)) {
      return this.modifiedBlocks.get(modKey);
    }

    const { cx, cz, lx, lz } = this.worldToChunk(x, z);
    const chunk = this.chunks.get(this.getChunkKey(cx, cz));
    if (!chunk || y < 0 || y >= WORLD_HEIGHT) return BLOCK_TYPES.AIR;
    return chunk[lx][y][lz];
  }

  setBlock(x, y, z, type) {
    if (y < 0 || y >= WORLD_HEIGHT) return false;

    const modKey = this.getBlockKey(x, y, z);
    if (type === BLOCK_TYPES.AIR) {
      this.modifiedBlocks.delete(modKey);
    } else {
      this.modifiedBlocks.set(modKey, type);
    }

    const { cx, cz } = this.worldToChunk(x, z);
    this.rebuildChunk(cx, cz);
    this.rebuildNeighborChunks(x, z);
    return true;
  }

  rebuildNeighborChunks(x, z) {
    const { cx, cz, lx, lz } = this.worldToChunk(x, z);
    if (lx === 0) this.rebuildChunk(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1) this.rebuildChunk(cx + 1, cz);
    if (lz === 0) this.rebuildChunk(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1) this.rebuildChunk(cx, cz + 1);
  }

  generateChunk(cx, cz) {
    const chunk = [];
    for (let x = 0; x < CHUNK_SIZE; x++) {
      chunk[x] = [];
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        chunk[x][y] = new Array(CHUNK_SIZE).fill(BLOCK_TYPES.AIR);
      }
    }

    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const wx = cx * CHUNK_SIZE + x;
        const wz = cz * CHUNK_SIZE + z;
        const height = getTerrainHeight(wx, wz);
        const biome = getBiome(wx, wz);

        for (let y = 0; y <= height && y < WORLD_HEIGHT; y++) {
          if (y === height) {
            chunk[x][y][z] = biome === 'desert' ? BLOCK_TYPES.SAND : BLOCK_TYPES.GRASS;
          } else if (y > height - 3) {
            chunk[x][y][z] = biome === 'desert' ? BLOCK_TYPES.SAND : BLOCK_TYPES.DIRT;
          } else {
            chunk[x][y][z] = BLOCK_TYPES.STONE;
          }
        }

        if (biome === 'forest' && height > 6) {
          this.placeTree(chunk, x, height + 1, z);
        }
      }
    }

    this.applyModifications(chunk, cx, cz);
    return chunk;
  }

  placeTree(chunk, x, baseY, z) {
    const trunkHeight = 4 + Math.floor(Math.random() * 2);
    for (let y = 0; y < trunkHeight && baseY + y < WORLD_HEIGHT; y++) {
      chunk[x][baseY + y][z] = BLOCK_TYPES.WOOD;
    }
    const top = baseY + trunkHeight;
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        for (let dy = -1; dy <= 1; dy++) {
          const nx = x + dx;
          const ny = top + dy;
          const nz = z + dz;
          if (nx >= 0 && nx < CHUNK_SIZE && nz >= 0 && nz < CHUNK_SIZE && ny < WORLD_HEIGHT) {
            if (Math.abs(dx) + Math.abs(dz) + Math.abs(dy) < 4) {
              if (chunk[nx][ny][nz] === BLOCK_TYPES.AIR) {
                chunk[nx][ny][nz] = BLOCK_TYPES.LEAVES;
              }
            }
          }
        }
      }
    }
  }

  applyModifications(chunk, cx, cz) {
    for (const [key, type] of this.modifiedBlocks) {
      const [wx, wy, wz] = key.split(',').map(Number);
      const { cx: mcx, cz: mcz, lx, lz } = this.worldToChunk(wx, wz);
      if (mcx === cx && mcz === cz && wy >= 0 && wy < WORLD_HEIGHT) {
        chunk[lx][wy][lz] = type;
      }
    }
  }

  rebuildChunk(cx, cz) {
    const key = this.getChunkKey(cx, cz);
    const oldMesh = this.chunkMeshes.get(key);
    if (oldMesh) {
      this.scene.remove(oldMesh);
      oldMesh.geometry.dispose();
    }

    if (!this.chunks.has(key)) {
      this.chunks.set(key, this.generateChunk(cx, cz));
    } else {
      const chunk = this.chunks.get(key);
      this.applyModifications(chunk, cx, cz);
    }

    const mesh = this.buildChunkMesh(cx, cz);
    if (mesh) {
      this.chunkMeshes.set(key, mesh);
      this.scene.add(mesh);
    } else {
      this.chunkMeshes.delete(key);
    }
  }

  buildChunkMesh(cx, cz) {
    const chunk = this.chunks.get(this.getChunkKey(cx, cz));
    if (!chunk) return null;

    const geometries = {};

    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
          const type = chunk[x][y][z];
          if (type === BLOCK_TYPES.AIR) continue;

          const wx = cx * CHUNK_SIZE + x;
          const wy = y;
          const wz = cz * CHUNK_SIZE + z;

          const faces = this.getVisibleFaces(wx, wy, wz, type);
          if (faces.length === 0) continue;

          if (!geometries[type]) geometries[type] = [];

          for (const face of faces) {
            geometries[type].push(this.createFaceGeometry(wx, wy, wz, face));
          }
        }
      }
    }

    const group = new THREE.Group();
    for (const [type, geoms] of Object.entries(geometries)) {
      if (geoms.length === 0) continue;
      const merged = this.mergeGeometries(geoms);
      const mesh = new THREE.Mesh(merged, this.materials[type]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }

    return group.children.length > 0 ? group : null;
  }

  getVisibleFaces(x, y, z, type) {
    const faces = [];
    const neighbors = [
      { dir: 'top', dx: 0, dy: 1, dz: 0 },
      { dir: 'bottom', dx: 0, dy: -1, dz: 0 },
      { dir: 'north', dx: 0, dy: 0, dz: -1 },
      { dir: 'south', dx: 0, dy: 0, dz: 1 },
      { dir: 'west', dx: -1, dy: 0, dz: 0 },
      { dir: 'east', dx: 1, dy: 0, dz: 0 },
    ];

    for (const { dir, dx, dy, dz } of neighbors) {
      const neighbor = this.getBlock(x + dx, y + dy, z + dz);
      if (neighbor === BLOCK_TYPES.AIR || (isTransparent(neighbor) && !isTransparent(type))) {
        faces.push(dir);
      }
    }
    return faces;
  }

  createFaceGeometry(x, y, z, face) {
    const geo = new THREE.BufferGeometry();
    let vertices, normals;

    switch (face) {
      case 'top':
        vertices = [x, y + 1, z + 1, x + 1, y + 1, z + 1, x + 1, y + 1, z, x, y + 1, z];
        normals = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
        break;
      case 'bottom':
        vertices = [x, y, z, x + 1, y, z, x + 1, y, z + 1, x, y, z + 1];
        normals = [0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0];
        break;
      case 'north':
        vertices = [x + 1, y, z, x + 1, y + 1, z, x, y + 1, z, x, y, z];
        normals = [0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1];
        break;
      case 'south':
        vertices = [x, y, z + 1, x, y + 1, z + 1, x + 1, y + 1, z + 1, x + 1, y, z + 1];
        normals = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];
        break;
      case 'west':
        vertices = [x, y, z, x, y + 1, z, x, y + 1, z + 1, x, y, z + 1];
        normals = [-1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0];
        break;
      case 'east':
        vertices = [x + 1, y, z + 1, x + 1, y + 1, z + 1, x + 1, y + 1, z, x + 1, y, z];
        normals = [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0];
        break;
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    return geo;
  }

  mergeGeometries(geometries) {
    const merged = new THREE.BufferGeometry();
    const positions = [];
    const normals = [];
    const indices = [];
    let offset = 0;

    for (const geo of geometries) {
      const pos = geo.getAttribute('position').array;
      const norm = geo.getAttribute('normal').array;
      const idx = geo.getIndex().array;

      for (let i = 0; i < pos.length; i++) positions.push(pos[i]);
      for (let i = 0; i < norm.length; i++) normals.push(norm[i]);
      for (let i = 0; i < idx.length; i++) indices.push(idx[i] + offset);
      offset += pos.length / 3;
      geo.dispose();
    }

    merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    merged.setIndex(indices);
    return merged;
  }

  loadChunksAround(px, pz) {
    const pcx = Math.floor(px / CHUNK_SIZE);
    const pcz = Math.floor(pz / CHUNK_SIZE);

    for (let dx = -RENDER_DISTANCE; dx <= RENDER_DISTANCE; dx++) {
      for (let dz = -RENDER_DISTANCE; dz <= RENDER_DISTANCE; dz++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        const key = this.getChunkKey(cx, cz);
        if (!this.chunks.has(key)) {
          this.chunks.set(key, this.generateChunk(cx, cz));
          this.rebuildChunk(cx, cz);
        }
      }
    }
  }

  raycast(origin, direction, maxDist = 8) {
    const step = 0.1;
    let lastAir = null;

    for (let t = 0; t < maxDist; t += step) {
      const x = Math.floor(origin.x + direction.x * t);
      const y = Math.floor(origin.y + direction.y * t);
      const z = Math.floor(origin.z + direction.z * t);
      const block = this.getBlock(x, y, z);

      if (isSolid(block)) {
        return {
          hit: true,
          block: { x, y, z },
          place: lastAir,
          face: this.getHitFace(origin, direction, x, y, z),
        };
      }
      lastAir = { x, y, z };
    }
    return { hit: false };
  }

  getHitFace(origin, direction, bx, by, bz) {
    const cx = bx + 0.5;
    const cy = by + 0.5;
    const cz = bz + 0.5;
    const dx = Math.abs(origin.x - cx);
    const dy = Math.abs(origin.y - cy);
    const dz = Math.abs(origin.z - cz);
    if (dx > dy && dx > dz) return origin.x > cx ? 'east' : 'west';
    if (dy > dz) return origin.y > cy ? 'top' : 'bottom';
    return origin.z > cz ? 'south' : 'north';
  }

  getSpawnPoint() {
    const x = 0;
    const z = 0;
    const y = getTerrainHeight(x, z) + 2;
    return { x: x + 0.5, y, z: z + 0.5 };
  }

  reset() {
    for (const mesh of this.chunkMeshes.values()) {
      this.scene.remove(mesh);
      mesh.geometry?.dispose();
    }
    this.chunks.clear();
    this.chunkMeshes.clear();
    this.modifiedBlocks.clear();
  }

  serialize() {
    const blocks = {};
    for (const [key, type] of this.modifiedBlocks) {
      blocks[key] = type;
    }
    return JSON.stringify({ blocks, version: 1 });
  }

  deserialize(data) {
    try {
      const parsed = JSON.parse(data);
      this.reset();
      if (parsed.blocks) {
        for (const [key, type] of Object.entries(parsed.blocks)) {
          this.modifiedBlocks.set(key, type);
        }
      }
    } catch {
      console.warn('Failed to load world save');
    }
  }
}
