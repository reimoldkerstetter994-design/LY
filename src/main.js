import "../css/style.css";
import * as THREE from "three";
import { AudioBus } from "./game/audio.js";
import { UI } from "./game/ui.js";
import { Player } from "./game/player.js";
import { World } from "./game/world.js";
import { BugField } from "./game/bugs.js";
import { Gameplay } from "./game/gameplay.js";

const canvas = document.getElementById("view");
const ui = new UI();
const audio = new AudioBus();

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 180);
const world = new World(scene);

let player;
let gameplay;
let bugs;
let mode = "load";
let last = performance.now();
let orbitT = 0;

const clock = { t: 0 };

init().catch((err) => {
  console.error(err);
  ui.setLoad(1, `装载失败：${err.message}`);
});

async function init() {
  ui.setLoad(0.05, "读取 Blender glTF 场景…");
  const meta = await world.load((p) => ui.setLoad(0.1 + p * 0.8, "解析源码港网格…"));
  ui.setLoad(0.95, "布置碰撞与任务…");
  player = new Player(camera, meta.playerSpawn, meta.playerYaw ?? 0);
  player.attach();
  bugs = new BugField(scene, meta.bugSpawns);
  gameplay = new Gameplay({ meta, player, world, bugs, ui, audio, scene });
  placeTitleCam();
  ui.setLoad(1, "世界已编译");
  ui.ready();
  mode = "title";
  bind();
}

function bind() {
  document.getElementById("btn-start").addEventListener("click", start);
  document.getElementById("btn-resume").addEventListener("click", resume);
  document.getElementById("btn-again").addEventListener("click", () => window.location.reload());
  canvas.addEventListener("click", onCanvasClick);
  window.addEventListener("keydown", onKey);
  window.addEventListener("resize", onResize);
  document.getElementById("dialogue").addEventListener("click", () => gameplay?.interact());
}

function start() {
  audio.startMusic();
  audio.ui();
  mode = "play";
  player.enabled = true;
  ui.enterPlay();
  canvas.requestPointerLock?.();
}

function resume() {
  gameplay.paused = false;
  player.enabled = true;
  ui.setPause(false);
  canvas.requestPointerLock?.();
}

function onCanvasClick() {
  if (mode !== "play") return;
  if (gameplay.paused || gameplay.won) return;
  if (!player.locked) {
    canvas.requestPointerLock?.();
    return;
  }
  gameplay.shoot();
}

function onKey(e) {
  if (mode === "title" && (e.code === "Enter" || e.code === "Space")) {
    start();
    return;
  }
  if (mode !== "play" || !gameplay) return;
  if (e.code === "Escape") {
    if (gameplay.won) return;
    gameplay.paused = !gameplay.paused;
    player.enabled = !gameplay.paused;
    ui.setPause(gameplay.paused);
    if (gameplay.paused) document.exitPointerLock?.();
    return;
  }
  if (e.code === "KeyE" || e.code === "Space") {
    e.preventDefault();
    gameplay.interact();
  }
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight, false);
}

function placeTitleCam() {
  camera.position.set(18, 11, 22);
  camera.lookAt(0, 1.4, 0);
}

function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  clock.t += dt;
  if (mode === "title") {
    orbitT += dt * 0.12;
    camera.position.set(Math.cos(orbitT) * 24, 10.5, Math.sin(orbitT) * 24);
    camera.lookAt(0, 1.6, 0);
    world.pulseCollects(clock.t);
  } else if (mode === "play") {
    player.update(dt, world.colliders, gameplay.blocked);
    gameplay.update(dt, clock.t);
  }
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
