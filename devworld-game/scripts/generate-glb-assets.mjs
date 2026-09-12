/**
 * Procedural GLB asset generator for DevWorld.
 * Run: npm run generate-assets
 *
 * For higher-quality assets, use the Blender scripts in /blender/
 * and export GLB files to /public/models/
 */
import './polyfill.mjs';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'public', 'models');
mkdirSync(outDir, { recursive: true });

const exporter = new GLTFExporter();

function exportGLB(scene, filename) {
  return new Promise((resolve, reject) => {
    exporter.parse(
      scene,
      (result) => {
        const buffer = result;
        writeFileSync(join(outDir, filename), Buffer.from(buffer));
        console.log(`  ✓ ${filename}`);
        resolve();
      },
      (err) => reject(err),
      { binary: true }
    );
  });
}

function createTree() {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.25, 1.8, 8),
    new THREE.MeshStandardMaterial({ color: 0x5a3a1a })
  );
  trunk.position.y = 0.9;
  group.add(trunk);

  const leaves = new THREE.Mesh(
    new THREE.ConeGeometry(1.2, 2.5, 8),
    new THREE.MeshStandardMaterial({ color: 0x2d7a2d })
  );
  leaves.position.y = 2.5;
  group.add(leaves);
  return group;
}

function createTerminal() {
  const group = new THREE.Group();
  const desk = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.8, 0.8),
    new THREE.MeshStandardMaterial({ color: 0x3a3a4a })
  );
  desk.position.y = 0.4;
  group.add(desk);

  const monitor = new THREE.Mesh(
    new THREE.BoxGeometry(1, 0.65, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x1a1a2a, emissive: 0x0a3060 })
  );
  monitor.position.set(0, 1.1, 0);
  group.add(monitor);

  const kb = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.04, 0.25),
    new THREE.MeshStandardMaterial({ color: 0x2a2a3a })
  );
  kb.position.set(0, 0.82, 0.3);
  group.add(kb);
  return group;
}

function createBug() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xcc3333, emissive: 0x661111 })
  );
  group.add(body);

  for (let i = 0; i < 6; i++) {
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.3, 4),
      new THREE.MeshStandardMaterial({ color: 0x992222 })
    );
    const angle = (i / 6) * Math.PI * 2;
    leg.position.set(Math.cos(angle) * 0.2, -0.08, Math.sin(angle) * 0.2);
    leg.rotation.z = Math.cos(angle) * 0.7;
    leg.rotation.x = Math.sin(angle) * 0.7;
    group.add(leg);
  }
  return group;
}

function createCrystal() {
  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.5, 0),
    new THREE.MeshStandardMaterial({
      color: 0x64b4ff,
      emissive: 0x2060c0,
      metalness: 0.8,
      roughness: 0.2,
    })
  );
  crystal.position.y = 0.5;
  const group = new THREE.Group();
  group.add(crystal);
  return group;
}

console.log('Generating GLB assets...');
await exportGLB(createTree(), 'tree.glb');
await exportGLB(createTerminal(), 'terminal.glb');
await exportGLB(createBug(), 'bug.glb');
await exportGLB(createCrystal(), 'crystal.glb');
console.log('Done! Assets saved to public/models/');
