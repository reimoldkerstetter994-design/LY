import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { BLOCK_TYPES, BLOCK_KEYS } from "./BlockTypes.js";

const CHUNK_SIZE = 32;
const WORLD_HEIGHT = 16;

export class World {
  constructor(scene) {
    this.scene = scene;
    this.blocks = new Map();
    this.props = new Map();
    this.loader = new GLTFLoader();
    this.modelCache = new Map();
    this.blockMeshes = new Map();
    this.propMeshes = new Map();
    this.raycaster = new THREE.Raycaster();
    this.highlightBox = this.createHighlightBox();
    this.scene.add(this.highlightBox);
  }

  createHighlightBox() {
    const geo = new THREE.BoxGeometry(1.005, 1.005, 1.005);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.25,
      wireframe: true,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    return mesh;
  }

  blockKey(x, y, z) {
    return `${x},${y},${z}`;
  }

  async loadModel(name) {
    if (this.modelCache.has(name)) return this.modelCache.get(name);
    try {
      const gltf = await this.loader.loadAsync(`/assets/models/${name}.glb`);
      this.modelCache.set(name, gltf.scene);
      return gltf.scene;
    } catch {
      const geo = new THREE.BoxGeometry(1, 1, 1);
      const mat = new THREE.MeshStandardMaterial({ color: 0xff00ff });
      const fallback = new THREE.Mesh(geo, mat);
      this.modelCache.set(name, fallback);
      return fallback;
    }
  }

  async createBlockMesh(type, x, y, z) {
    const blockType = BLOCK_TYPES[type];
    const model = await this.loadModel(blockType.model);
    const mesh = model.clone();

    mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
    mesh.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (blockType.transparent && child.material) {
          child.material.transparent = true;
          child.material.opacity = 0.6;
        }
        if (blockType.emissive && child.material) {
          child.material.emissive = new THREE.Color(blockType.color);
          child.material.emissiveIntensity = 0.8;
        }
      }
    });

    mesh.userData = { type: "block", blockType: type, x, y, z };
    return mesh;
  }

  async setBlock(x, y, z, type) {
    const key = this.blockKey(x, y, z);
    if (this.blocks.has(key)) await this.removeBlock(x, y, z);

    this.blocks.set(key, type);
    const mesh = await this.createBlockMesh(type, x, y, z);
    this.blockMeshes.set(key, mesh);
    this.scene.add(mesh);
    return mesh;
  }

  async removeBlock(x, y, z) {
    const key = this.blockKey(x, y, z);
    const mesh = this.blockMeshes.get(key);
    if (mesh) {
      this.scene.remove(mesh);
      this.blockMeshes.delete(key);
    }
    this.blocks.delete(key);
  }

  getBlock(x, y, z) {
    return this.blocks.get(this.blockKey(x, y, z));
  }

  async addProp(type, x, y, z) {
    const key = `prop:${x},${y},${z}`;
    if (this.props.has(key)) return;

    const model = await this.loadModel(type);
    const mesh = model.clone();
    mesh.position.set(x + 0.5, y, z + 0.5);
    mesh.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    mesh.userData = { type: "prop", propType: type, x, y, z };
    this.props.set(key, type);
    this.propMeshes.set(key, mesh);
    this.scene.add(mesh);
  }

  generateTerrain() {
    const seed = 42;
    const noise = (x, z) => {
      const n = Math.sin(x * 0.3 + seed) * Math.cos(z * 0.3 + seed) * 3;
      const n2 = Math.sin(x * 0.1 + z * 0.15 + seed) * 2;
      return Math.floor(4 + n + n2);
    };

    const promises = [];
    for (let x = -CHUNK_SIZE / 2; x < CHUNK_SIZE / 2; x++) {
      for (let z = -CHUNK_SIZE / 2; z < CHUNK_SIZE / 2; z++) {
        const height = noise(x, z);
        for (let y = 0; y <= height; y++) {
          let type;
          if (y === height) type = "grass";
          else if (y >= height - 2) type = "dirt";
          else type = "stone";
          promises.push(this.setBlock(x, y, z, type));
        }
      }
    }

    const decorations = [
      { type: "tree", x: 3, z: 5 },
      { type: "tree", x: -7, z: 3 },
      { type: "tree", x: 8, z: -4 },
      { type: "crystal", x: -4, z: -6 },
      { type: "workbench", x: 0, z: 0 },
      { type: "lamp", x: 2, z: 1 },
      { type: "lamp", x: -2, z: 1 },
    ];

    for (const dec of decorations) {
      const h = noise(dec.x, dec.z);
      promises.push(this.addProp(dec.type, dec.x, h + 1, dec.z));
    }

    return Promise.all(promises);
  }

  getTargetBlock(camera) {
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const meshes = [...this.blockMeshes.values()];
    const hits = this.raycaster.intersectObjects(meshes, true);

    if (hits.length === 0) return null;

    let hit = hits[0];
    let root = hit.object;
    while (root.parent && !root.userData.type) root = root.parent;

    const { x, y, z } = root.userData;
    const normal = hit.face.normal.clone();
    normal.transformDirection(hit.object.matrixWorld);
    normal.round();

    return {
      block: { x, y, z },
      place: { x: x + normal.x, y: y + normal.y, z: z + normal.z },
      distance: hit.distance,
    };
  }

  updateHighlight(camera) {
    const target = this.getTargetBlock(camera);
    if (target && target.distance < 8) {
      this.highlightBox.position.set(
        target.block.x + 0.5,
        target.block.y + 0.5,
        target.block.z + 0.5
      );
      this.highlightBox.visible = true;
      return target;
    }
    this.highlightBox.visible = false;
    return null;
  }

  getBlockCount() {
    return this.blocks.size;
  }

  serialize() {
    const data = { blocks: [], props: [] };
    for (const [key, type] of this.blocks) {
      const [x, y, z] = key.split(",").map(Number);
      data.blocks.push({ x, y, z, type });
    }
    for (const [key, type] of this.props) {
      const coords = key.replace("prop:", "").split(",").map(Number);
      data.props.push({ x: coords[0], y: coords[1], z: coords[2], type });
    }
    return data;
  }

  async deserialize(data) {
    for (const mesh of this.blockMeshes.values()) this.scene.remove(mesh);
    for (const mesh of this.propMeshes.values()) this.scene.remove(mesh);
    this.blocks.clear();
    this.props.clear();
    this.blockMeshes.clear();
    this.propMeshes.clear();

    const promises = [];
    if (data.blocks) {
      for (const b of data.blocks) {
        promises.push(this.setBlock(b.x, b.y, b.z, b.type));
      }
    }
    if (data.props) {
      for (const p of data.props) {
        promises.push(this.addProp(p.type, p.x, p.y, p.z));
      }
    }
    await Promise.all(promises);
  }

  async reset() {
    for (const mesh of this.blockMeshes.values()) this.scene.remove(mesh);
    for (const mesh of this.propMeshes.values()) this.scene.remove(mesh);
    this.blocks.clear();
    this.props.clear();
    this.blockMeshes.clear();
    this.propMeshes.clear();
    await this.generateTerrain();
  }
}
