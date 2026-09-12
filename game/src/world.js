import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export async function loadWorld(scene) {
  const [world, gltf] = await Promise.all([
    fetch("/data/world.json").then((r) => r.json()),
    new GLTFLoader().loadAsync("/models/devworld.glb"),
  ]);
  gltf.scene.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
      if (obj.geometry?.attributes?.color) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (m) m.vertexColors = true;
        }
      }
      if (
        obj.name.startsWith("COL_") ||
        obj.name.startsWith("Water") ||
        obj.name === "GitTokenMesh" ||
        obj.name === "Bloom"
      ) {
        obj.visible = false;
      }
    }
  });
  scene.add(gltf.scene);
  let terrain = gltf.scene.getObjectByName("Terrain_Island");
  if (!terrain) {
    gltf.scene.traverse((obj) => {
      if (obj.isMesh && obj.name.includes("Terrain")) terrain = obj;
    });
  }
  return { world, gltf, terrain: terrain || gltf.scene };
}

export function makeSky(scene) {
  scene.background = new THREE.Color(0x1a3348);
  scene.fog = new THREE.Fog(0x1a3348, 42, 110);
  const hemi = new THREE.HemisphereLight(0x9ecbff, 0x1c2a22, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe1b0, 2.1);
  sun.position.set(28, 42, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 2;
  sun.shadow.camera.far = 120;
  sun.shadow.camera.left = -50;
  sun.shadow.camera.right = 50;
  sun.shadow.camera.top = 50;
  sun.shadow.camera.bottom = -50;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x4aa0ff, 0.35);
  fill.position.set(-20, 12, -10);
  scene.add(fill);
}

export function createWater(scene, level) {
  const geo = new THREE.PlaneGeometry(120, 120, 1, 1);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x12304a,
    roughness: 0.18,
    metalness: 0.22,
    transparent: true,
    opacity: 0.72,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = level;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}
