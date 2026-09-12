import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export class World {
  constructor(scene) {
    this.scene = scene;
    this.meta = null;
    this.root = null;
    this.colliders = [];
    this.named = new Map();
    this.collectMeshes = new Map();
  }

  async load(onProgress) {
    const [meta, gltf] = await Promise.all([
      fetch("./assets/models/devworld_meta.json").then((r) => {
        if (!r.ok) throw new Error("missing world metadata");
        return r.json();
      }),
      loadGltf("./assets/models/devworld.glb", onProgress),
    ]);
    this.meta = meta;
    this.root = gltf.scene;
    this.root.traverse((obj) => {
      if (obj.name) this.named.set(obj.name, obj);
      if (obj.isMesh) {
        obj.castShadow = false;
        obj.receiveShadow = false;
        obj.frustumCulled = true;
      }
      if (obj.isDirectionalLight) {
        const moon = /moon/i.test(obj.name);
        obj.intensity = moon ? 0.28 : 1.05;
        obj.castShadow = false;
      }
      if (obj.isPointLight) {
        obj.intensity = /beacon|desk/i.test(obj.name) ? 4.5 : 7.5;
        obj.distance = 18;
        obj.decay = 2;
        obj.castShadow = false;
      }
    });
    this.scene.add(this.root);
    this.colliders = (meta.colliders || []).filter((c) => {
      const h = c.max[1] - c.min[1];
      const sx = c.max[0] - c.min[0];
      const sz = c.max[2] - c.min[2];
      return h > 0.35 && sx < 70 && sz < 70;
    });
    for (const item of meta.collects) {
      const mesh = this.named.get(item.object);
      if (mesh) this.collectMeshes.set(item.id, mesh);
    }
    this.addAtmosphere();
    return meta;
  }

  addAtmosphere() {
    this.scene.background = new THREE.Color(0x0a1420);
    this.scene.fog = new THREE.FogExp2(0x0b1522, 0.016);
    const hemi = new THREE.HemisphereLight(0x8eb7e6, 0x1a140f, 0.42);
    this.scene.add(hemi);
  }

  pulseCollects(t) {
    for (const mesh of this.collectMeshes.values()) {
      if (!mesh.visible) continue;
      mesh.rotation.y = t * 1.4;
      mesh.position.y = mesh.userData.baseY ?? mesh.position.y;
      if (mesh.userData.baseY == null) mesh.userData.baseY = mesh.position.y;
      mesh.position.y = mesh.userData.baseY + Math.sin(t * 2.4 + mesh.position.x) * 0.12;
    }
  }
}

function loadGltf(url, onProgress) {
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      resolve,
      (ev) => {
        if (ev.total) onProgress?.(ev.loaded / ev.total);
      },
      reject
    );
  });
}
