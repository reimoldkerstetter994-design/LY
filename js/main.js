// 夜巡 · 废弃医院 —— 第一人称浏览器恐怖游戏
import * as THREE from 'three';
import { generateMaze, floorCells, deadEnds, FLOOR } from './maze.js';
import {
  makeWallTexture, makeFloorTexture, makeCeilingTexture,
  makeBloodTexture, makeWallWritingTexture, drawScareFace,
} from './textures.js';
import { HorrorAudio } from './audio.js';
import { Ghost } from './ghost.js';

// ---------------- 常量 ----------------
const GRID_W = 21, GRID_H = 21;
const CELL = 3.4;          // 每格世界尺寸(米)
const WALL_H = 3.4;        // 墙高
const EYE_HEIGHT = 1.62;
const FUSES_NEEDED = 6;

// ---------------- 基础对象 ----------------
const container = document.getElementById('game-container');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x010102);
scene.fog = new THREE.FogExp2(0x010102, 0.085);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 90);

const audio = new HorrorAudio();

// ---------------- 关卡生成 ----------------
let grid, ghost;
let fuses = [];        // {mesh, glow, cell, taken}
let batteries = [];    // {mesh, cell, taken}
let exitDoor = null;   // {group, cell(floor cell in front), lamp}
let lamps = [];        // 闪烁的顶灯 {light, mesh, phase, broken}
const levelGroup = new THREE.Group();
scene.add(levelGroup);

function cellToWorld(cx, cy) { return [(cx + 0.5) * CELL, (cy + 0.5) * CELL]; }
function worldToCell(wx, wz) { return [Math.floor(wx / CELL), Math.floor(wz / CELL)]; }

function buildLevel() {
  // 清理旧关卡
  levelGroup.clear();
  fuses = []; batteries = []; lamps = [];

  grid = generateMaze(GRID_W, GRID_H);

  // ---- 地面 / 天花板 ----
  const floorTex = makeFloorTexture();
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.92, metalness: 0.04 });
  const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(GRID_W * CELL, GRID_H * CELL), floorMat);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.set(GRID_W * CELL / 2, 0, GRID_H * CELL / 2);
  floorMesh.receiveShadow = true;
  levelGroup.add(floorMesh);

  const ceilTex = makeCeilingTexture();
  const ceilMat = new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 0.95 });
  const ceilMesh = new THREE.Mesh(new THREE.PlaneGeometry(GRID_W * CELL, GRID_H * CELL), ceilMat);
  ceilMesh.rotation.x = Math.PI / 2;
  ceilMesh.position.set(GRID_W * CELL / 2, WALL_H, GRID_H * CELL / 2);
  levelGroup.add(ceilMesh);

  // ---- 墙(实例化) ----
  const wallCells = [];
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (grid[y][x] !== FLOOR) {
        // 只渲染与地板相邻的墙(可见墙)
        const nearFloor = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]
          .some(([dx, dy]) => grid[y + dy]?.[x + dx] === FLOOR);
        if (nearFloor) wallCells.push([x, y]);
      }
    }
  }
  const wallTex = makeWallTexture();
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9, metalness: 0.02 });
  const wallGeo = new THREE.BoxGeometry(CELL, WALL_H, CELL);
  const walls = new THREE.InstancedMesh(wallGeo, wallMat, wallCells.length);
  const m = new THREE.Matrix4();
  wallCells.forEach(([x, y], i) => {
    const [wx, wz] = cellToWorld(x, y);
    m.makeTranslation(wx, WALL_H / 2, wz);
    walls.setMatrixAt(i, m);
  });
  walls.castShadow = true;
  walls.receiveShadow = true;
  levelGroup.add(walls);

  // ---- 出口大门 ----
  placeExitDoor();

  // ---- 保险丝(藏在死胡同) ----
  placeFuses();

  // ---- 电池 ----
  placeBatteries();

  // ---- 闪烁顶灯 ----
  placeLamps();

  // ---- 血迹与血书 ----
  placeDecals();

  // ---- 杂物道具 ----
  placeProps();
}

function placeExitDoor() {
  // 找一个离起点最远的、与外圈墙相邻的地板格
  const start = [1, 1];
  let best = null, bestD = -1;
  for (let y = 1; y < GRID_H - 1; y++) {
    for (let x = 1; x < GRID_W - 1; x++) {
      if (grid[y][x] !== FLOOR) continue;
      const onEdge = x === 1 || x === GRID_W - 2 || y === 1 || y === GRID_H - 2;
      if (!onEdge) continue;
      const d = Math.hypot(x - start[0], y - start[1]);
      if (d > bestD) { bestD = d; best = [x, y]; }
    }
  }
  const [fx, fy] = best;
  // 门贴在哪面外墙上
  let normal = [0, 0];
  if (fx === 1) normal = [-1, 0];
  else if (fx === GRID_W - 2) normal = [1, 0];
  else if (fy === 1) normal = [0, -1];
  else normal = [0, 1];

  const [wx, wz] = cellToWorld(fx, fy);
  const doorGroup = new THREE.Group();

  // 金属大门
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x30343a, roughness: 0.55, metalness: 0.75 });
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.9, 2.6, 0.12), doorMat);
  door.position.y = 1.3;
  doorGroup.add(door);
  // 门框
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.7, metalness: 0.5 });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.0, 0.3), frameMat);
  frame.position.y = 1.5;
  frame.position.z = -0.06;
  doorGroup.add(frame);
  door.position.z = 0.1;

  // "出口"绿色指示牌
  const signCanvas = document.createElement('canvas');
  signCanvas.width = 256; signCanvas.height = 96;
  const sctx = signCanvas.getContext('2d');
  sctx.fillStyle = '#03140a';
  sctx.fillRect(0, 0, 256, 96);
  sctx.font = '900 56px "Noto Serif SC", serif';
  sctx.textAlign = 'center'; sctx.textBaseline = 'middle';
  sctx.fillStyle = '#39e07a';
  sctx.shadowColor = '#39e07a'; sctx.shadowBlur = 18;
  sctx.fillText('出 口', 128, 50);
  const signTex = new THREE.CanvasTexture(signCanvas);
  signTex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.15, 0.42),
    new THREE.MeshBasicMaterial({ map: signTex })
  );
  sign.position.set(0, 3.02, 0.2);
  doorGroup.add(sign);
  const signLight = new THREE.PointLight(0x2be070, 2.2, 7, 2);
  signLight.position.set(0, 2.8, 0.7);
  doorGroup.add(signLight);

  // 位置与朝向:贴在外墙内表面
  const px = wx + normal[0] * (CELL / 2 - 0.18);
  const pz = wz + normal[1] * (CELL / 2 - 0.18);
  doorGroup.position.set(px, 0, pz);
  doorGroup.lookAt(wx, 0, wz);

  levelGroup.add(doorGroup);
  exitDoor = { group: doorGroup, cell: [fx, fy], worldPos: new THREE.Vector3(px, 1.3, pz), opened: false };
}

function placeFuses() {
  const ends = deadEnds(grid)
    .filter(([x, y]) => Math.hypot(x - 1, y - 1) > 4)
    .sort(() => Math.random() - 0.5);
  const cells = ends.length >= FUSES_NEEDED
    ? ends.slice(0, FUSES_NEEDED)
    : ends.concat(floorCells(grid).sort(() => Math.random() - 0.5)).slice(0, FUSES_NEEDED);

  const fuseMat = new THREE.MeshStandardMaterial({
    color: 0x9a4a20, roughness: 0.4, metalness: 0.6,
    emissive: 0xff7a30, emissiveIntensity: 0.7,
  });
  const glowMat = new THREE.SpriteMaterial({
    color: 0xff8a3a, transparent: true, opacity: 0.35,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });

  for (const [cx, cy] of cells) {
    const [wx, wz] = cellToWorld(cx, cy);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.26, 10), fuseMat);
    mesh.position.set(wx, 0.35, wz);
    mesh.rotation.z = Math.PI / 5;
    levelGroup.add(mesh);
    const glow = new THREE.Sprite(glowMat.clone());
    glow.scale.set(0.8, 0.8, 1);
    glow.position.set(wx, 0.4, wz);
    levelGroup.add(glow);
    fuses.push({ mesh, glow, cell: [cx, cy], pos: new THREE.Vector3(wx, 0.35, wz), taken: false });
  }
}

function placeBatteries() {
  const cells = floorCells(grid)
    .filter(([x, y]) => Math.hypot(x - 1, y - 1) > 3)
    .sort(() => Math.random() - 0.5)
    .slice(0, 5);
  const batMat = new THREE.MeshStandardMaterial({
    color: 0x2a3a2a, roughness: 0.5, metalness: 0.4,
    emissive: 0x37e05a, emissiveIntensity: 0.35,
  });
  for (const [cx, cy] of cells) {
    const [wx, wz] = cellToWorld(cx, cy);
    // 靠边放,不挡路
    const ox = (Math.random() - 0.5) * CELL * 0.4;
    const oz = (Math.random() - 0.5) * CELL * 0.4;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 0.1), batMat);
    mesh.position.set(wx + ox, 0.09, wz + oz);
    mesh.rotation.y = Math.random() * Math.PI;
    levelGroup.add(mesh);
    batteries.push({ mesh, pos: mesh.position.clone(), taken: false });
  }
}

function placeLamps() {
  // 稀疏放置几盏会闪烁的旧日光灯
  const cells = floorCells(grid).sort(() => Math.random() - 0.5);
  const chosen = [];
  for (const [cx, cy] of cells) {
    if (chosen.length >= 6) break;
    if (chosen.every(([ox, oy]) => Math.hypot(cx - ox, cy - oy) > 5)) chosen.push([cx, cy]);
  }
  for (const [cx, cy] of chosen) {
    const [wx, wz] = cellToWorld(cx, cy);
    const fixture = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.08, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x777770, roughness: 0.6, metalness: 0.4 })
    );
    fixture.position.set(wx, WALL_H - 0.06, wz);
    levelGroup.add(fixture);
    const tube = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 0.04, 0.1),
      new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xcfc39a, emissiveIntensity: 1.4 })
    );
    tube.position.set(wx, WALL_H - 0.12, wz);
    levelGroup.add(tube);
    const light = new THREE.PointLight(0xcfc09a, 5.5, 9.5, 2);
    light.position.set(wx, WALL_H - 0.4, wz);
    levelGroup.add(light);
    lamps.push({ light, tube, phase: Math.random() * 100, baseIntensity: 5.5, flickering: Math.random() < 0.65 });
  }
}

function placeDecals() {
  const bloodTex = makeBloodTexture();
  const cells = floorCells(grid).sort(() => Math.random() - 0.5).slice(0, 10);
  for (const [cx, cy] of cells) {
    const [wx, wz] = cellToWorld(cx, cy);
    const mat = new THREE.MeshBasicMaterial({
      map: bloodTex, transparent: true, opacity: 0.85, depthWrite: false,
    });
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(1.4 + Math.random() * 1.4, 1.4 + Math.random() * 1.4), mat);
    decal.rotation.x = -Math.PI / 2;
    decal.rotation.z = Math.random() * Math.PI * 2;
    decal.position.set(wx + (Math.random() - 0.5), 0.012, wz + (Math.random() - 0.5));
    levelGroup.add(decal);
  }

  // 血书:找几面紧邻地板的墙,把字贴上去
  const texts = ['救我', '别回头', '它在看', '出不去的', '第六个就是你'];
  const spots = [];
  for (let y = 1; y < GRID_H - 1 && spots.length < texts.length * 3; y++) {
    for (let x = 1; x < GRID_W - 1; x++) {
      if (grid[y][x] !== FLOOR) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (grid[y + dy][x + dx] !== FLOOR && Math.random() < 0.05) {
          spots.push([x, y, dx, dy]);
        }
      }
    }
  }
  spots.sort(() => Math.random() - 0.5);
  texts.forEach((text, i) => {
    if (i >= spots.length) return;
    const [x, y, dx, dy] = spots[i];
    const [wx, wz] = cellToWorld(x, y);
    const tex = makeWallWritingTexture(text);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), mat);
    plane.position.set(
      wx + dx * (CELL / 2 - 0.06),
      1.7,
      wz + dy * (CELL / 2 - 0.06)
    );
    plane.lookAt(wx, 1.7, wz);
    levelGroup.add(plane);
  });
}

function placeProps() {
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x4a3c2c, roughness: 0.9 });
  const barrelMat = new THREE.MeshStandardMaterial({ color: 0x4a2e22, roughness: 0.65, metalness: 0.5 });
  const cells = floorCells(grid).sort(() => Math.random() - 0.5).slice(0, 14);
  for (const [cx, cy] of cells) {
    const [wx, wz] = cellToWorld(cx, cy);
    const ox = (Math.random() < 0.5 ? -1 : 1) * CELL * 0.32;
    const oz = (Math.random() < 0.5 ? -1 : 1) * CELL * 0.32;
    let mesh;
    if (Math.random() < 0.5) {
      const s = 0.4 + Math.random() * 0.35;
      mesh = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), crateMat);
      mesh.position.set(wx + ox, s / 2, wz + oz);
      mesh.rotation.y = Math.random() * Math.PI;
    } else {
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.8, 12), barrelMat);
      if (Math.random() < 0.4) {
        mesh.rotation.z = Math.PI / 2;
        mesh.position.set(wx + ox, 0.26, wz + oz);
      } else {
        mesh.position.set(wx + ox, 0.4, wz + oz);
      }
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    levelGroup.add(mesh);
  }
}

// ---------------- 灯光 ----------------
// 极暗的环境光,几乎伸手不见五指
const ambient = new THREE.AmbientLight(0x23283a, 0.55);
scene.add(ambient);

// 手电(带惯性延迟的聚光灯)
const flashlight = new THREE.SpotLight(0xfff2d8, 0, 26, 0.46, 0.55, 1.6);
flashlight.castShadow = true;
flashlight.shadow.mapSize.set(1024, 1024);
flashlight.shadow.camera.near = 0.2;
flashlight.shadow.camera.far = 26;
flashlight.shadow.bias = -0.003;
scene.add(flashlight);
const flashTarget = new THREE.Object3D();
scene.add(flashTarget);
flashlight.target = flashTarget;

// 玩家身边的微光(否则关手电是纯黑,完全没法玩)
const playerGlow = new THREE.PointLight(0x8a7a5a, 0.55, 3.2, 2);
scene.add(playerGlow);

// ---------------- 玩家状态 ----------------
const player = {
  position: new THREE.Vector3(),
  yaw: 0, pitch: 0,
  radius: 0.34,
  speedWalk: 2.5,
  speedRun: 4.6,
  stamina: 100,
  isMoving: false,
  isRunning: false,
  bobPhase: 0,
  stepTimer: 0,
};

const state = {
  mode: 'menu',        // menu | playing | paused | dead | win
  flashlightOn: true,
  battery: 100,
  fusesCollected: 0,
  startTime: 0,
  playTime: 0,
  flickerTime: 0,
  scareLightsOut: 0,   // >0 时全部灯灭
  litGhost: false,
  pendingLockForResume: false,
};

const keys = {};

// ---------------- DOM 引用 ----------------
const $ = (id) => document.getElementById(id);
const hud = $('hud');
const menuEl = $('menu'), pauseEl = $('pause'), gameoverEl = $('gameover'), winEl = $('win');
const batteryFill = $('battery-fill'), staminaFill = $('stamina-fill');
const fuseCount = $('fuse-count'), objective = $('objective');
const interactHint = $('interact-hint'), subtitleEl = $('subtitle');
const noiseCanvas = $('noise-overlay');
const noiseCtx = noiseCanvas.getContext('2d');
noiseCanvas.width = 240; noiseCanvas.height = 135;
const jumpscareCanvas = $('jumpscare');
const jsCtx = jumpscareCanvas.getContext('2d');
const damageFlash = $('damage-flash');

let subtitleTimer = null;
function showSubtitle(text, dur = 3200) {
  subtitleEl.textContent = text;
  subtitleEl.classList.remove('hidden');
  clearTimeout(subtitleTimer);
  subtitleTimer = setTimeout(() => subtitleEl.classList.add('hidden'), dur);
}

// ---------------- 游戏流程 ----------------
function startGame() {
  buildLevel();
  if (ghost) { scene.remove(ghost.group); }
  ghost = new Ghost(scene, grid, CELL);

  const [sx, sz] = cellToWorld(1, 1);
  player.position.set(sx, EYE_HEIGHT, sz);
  player.yaw = Math.PI * 0.75;
  player.pitch = 0;
  player.stamina = 100;

  state.mode = 'playing';
  state.flashlightOn = true;
  state.battery = 100;
  state.fusesCollected = 0;
  state.startTime = performance.now();
  state.scareLightsOut = 0;

  audio.init();
  audio.resume();
  audio.startAmbience();

  menuEl.classList.add('hidden');
  pauseEl.classList.add('hidden');
  gameoverEl.classList.add('hidden');
  winEl.classList.add('hidden');
  hud.classList.remove('hidden');
  jumpscareCanvas.style.opacity = 0;
  damageFlash.style.opacity = 0;

  updateObjective();
  renderer.domElement.requestPointerLock();
  setTimeout(() => showSubtitle('这里就是圣玛丽亚疗养院……对讲机没信号了。', 4200), 1200);
  setTimeout(() => { if (state.mode === 'playing') showSubtitle('找到 6 根保险丝,给出口大门供电。', 4200); }, 6200);
}

function updateObjective() {
  if (state.fusesCollected < FUSES_NEEDED) {
    objective.textContent = `寻找保险丝 · 已找到 ${state.fusesCollected} / ${FUSES_NEEDED}`;
  } else {
    objective.textContent = '电力已恢复 —— 前往出口!';
  }
  fuseCount.textContent = `保险丝 ${state.fusesCollected} / ${FUSES_NEEDED}`;
}

function killPlayer() {
  if (state.mode !== 'playing') return;
  state.mode = 'dead';
  state.playTime = (performance.now() - state.startTime) / 1000;
  audio.jumpscare();
  audio.heartRate = 0;
  document.exitPointerLock();

  // Jumpscare 动画
  jumpscareCanvas.width = window.innerWidth;
  jumpscareCanvas.height = window.innerHeight;
  let t0 = performance.now();
  const animScare = () => {
    const t = (performance.now() - t0) / 1000;
    if (t > 1.45 || state.mode !== 'dead') {
      jumpscareCanvas.style.opacity = 0;
      $('death-stats').textContent =
        `你在黑暗中坚持了 ${Math.floor(state.playTime)} 秒,找到了 ${state.fusesCollected} 根保险丝。`;
      gameoverEl.classList.remove('hidden');
      hud.classList.add('hidden');
      return;
    }
    jumpscareCanvas.style.opacity = 1;
    const shakeX = (Math.random() - 0.5) * 46;
    const shakeY = (Math.random() - 0.5) * 46;
    jsCtx.save();
    jsCtx.translate(shakeX, shakeY);
    drawScareFace(jsCtx, jumpscareCanvas.width, jumpscareCanvas.height, Math.min(1, t * 1.8));
    jsCtx.restore();
    requestAnimationFrame(animScare);
  };
  animScare();
}

function winGame() {
  state.mode = 'win';
  state.playTime = (performance.now() - state.startTime) / 1000;
  audio.doorOpen();
  audio.heartRate = 0;
  audio.staticLevel = 0;
  document.exitPointerLock();
  const mins = Math.floor(state.playTime / 60), secs = Math.floor(state.playTime % 60);
  $('win-stats').textContent = `用时 ${mins} 分 ${secs} 秒。晨光刺眼,你回头看了一眼漆黑的大楼。`;
  winEl.classList.remove('hidden');
  hud.classList.add('hidden');
}

// ---------------- 输入 ----------------
document.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (state.mode !== 'playing') return;
  if (e.code === 'KeyF') {
    if (state.battery > 0) {
      state.flashlightOn = !state.flashlightOn;
      audio.flashlightClick();
    }
  }
  if (e.code === 'KeyE') tryInteract();
});
document.addEventListener('keyup', (e) => { keys[e.code] = false; });

document.addEventListener('mousemove', (e) => {
  if (state.mode !== 'playing' || document.pointerLockElement !== renderer.domElement) return;
  player.yaw -= e.movementX * 0.0021;
  player.pitch -= e.movementY * 0.0021;
  player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch));
});

document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== renderer.domElement && state.mode === 'playing') {
    state.mode = 'paused';
    pauseEl.classList.remove('hidden');
    hud.classList.add('hidden');
  }
});

$('start-btn').addEventListener('click', startGame);
$('restart-btn').addEventListener('click', startGame);
$('restart-btn-win').addEventListener('click', startGame);
$('restart-btn-pause').addEventListener('click', startGame);
$('resume-btn').addEventListener('click', () => {
  if (state.mode !== 'paused') return;
  state.mode = 'playing';
  pauseEl.classList.add('hidden');
  hud.classList.remove('hidden');
  audio.resume();
  renderer.domElement.requestPointerLock();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------- 碰撞 ----------------
function collideMove(pos, dx, dz) {
  const r = player.radius;
  const tryAxis = (nx, nz) => {
    // 检查以 (nx,nz) 为圆心、r 为半径的圆是否碰墙
    const minX = Math.floor((nx - r) / CELL), maxX = Math.floor((nx + r) / CELL);
    const minZ = Math.floor((nz - r) / CELL), maxZ = Math.floor((nz + r) / CELL);
    for (let gy = minZ; gy <= maxZ; gy++) {
      for (let gx = minX; gx <= maxX; gx++) {
        if (grid[gy]?.[gx] !== FLOOR) {
          // 圆 vs 格子 AABB
          const cx = Math.max(gx * CELL, Math.min(nx, (gx + 1) * CELL));
          const cz = Math.max(gy * CELL, Math.min(nz, (gy + 1) * CELL));
          if ((nx - cx) ** 2 + (nz - cz) ** 2 < r * r) return false;
        }
      }
    }
    return true;
  };
  if (tryAxis(pos.x + dx, pos.z)) pos.x += dx;
  if (tryAxis(pos.x, pos.z + dz)) pos.z += dz;
}

// ---------------- 互动 ----------------
function nearestInteractable() {
  const p = player.position;
  for (const f of fuses) {
    if (!f.taken && p.distanceTo(f.pos) < 1.7) return { type: 'fuse', obj: f };
  }
  for (const b of batteries) {
    if (!b.taken && p.distanceTo(b.pos) < 1.6) return { type: 'battery', obj: b };
  }
  if (exitDoor && p.distanceTo(exitDoor.worldPos) < 2.4) return { type: 'door', obj: exitDoor };
  return null;
}

function tryInteract() {
  const it = nearestInteractable();
  if (!it) return;
  if (it.type === 'fuse') {
    it.obj.taken = true;
    levelGroup.remove(it.obj.mesh);
    levelGroup.remove(it.obj.glow);
    state.fusesCollected++;
    audio.pickup();
    audio.fusePlug();
    updateObjective();
    onFuseCollected();
  } else if (it.type === 'battery') {
    it.obj.taken = true;
    levelGroup.remove(it.obj.mesh);
    state.battery = Math.min(100, state.battery + 45);
    audio.pickup();
    showSubtitle('捡到了电池。手电又能撑一会了。');
  } else if (it.type === 'door') {
    if (state.fusesCollected >= FUSES_NEEDED) {
      winGame();
    } else {
      audio.creak();
      showSubtitle(`大门没有电。还缺 ${FUSES_NEEDED - state.fusesCollected} 根保险丝。`);
    }
  }
}

function onFuseCollected() {
  const n = state.fusesCollected;
  if (ghost) ghost.aggression = n;

  if (n === 1) {
    // 唤醒它
    ghost.spawn(player.position);
    audio.distantBang();
    setTimeout(() => audio.whisper(), 700);
    showSubtitle('……楼上传来一声闷响。有什么东西醒了。', 4500);
  } else if (n === FUSES_NEEDED) {
    audio.scareSting();
    state.scareLightsOut = 2.4;
    showSubtitle('电力恢复了。快跑,它知道你要走了!', 4500);
    ghost.teleportNear(player.position, 5, 9);
  } else {
    const lines = [
      '身后好像有拖地的脚步声……',
      '空气变冷了。',
      '你听见有人在轻声数数:"三……四……"',
      '别停下。',
    ];
    showSubtitle(lines[Math.min(lines.length - 1, n - 2)], 3800);
    // 30% 概率闪现到附近制造压迫感
    if (Math.random() < 0.3) {
      ghost.teleportNear(player.position, 6, 11);
      audio.whisper();
    }
    if (Math.random() < 0.4) state.scareLightsOut = 1.2 + Math.random();
  }
}

// ---------------- 主循环 ----------------
const clock = new THREE.Clock();
const forwardVec = new THREE.Vector3();
const rightVec = new THREE.Vector3();
const ghostDir = new THREE.Vector3();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (state.mode === 'playing') {
    updatePlayer(dt);
    updateWorld(dt);
    audio.update(dt);
  }

  updateNoiseOverlay();
  renderer.render(scene, camera);
}

function updatePlayer(dt) {
  // 移动
  forwardVec.set(Math.sin(player.yaw), 0, Math.cos(player.yaw)).multiplyScalar(-1);
  rightVec.set(-forwardVec.z, 0, forwardVec.x);

  let mx = 0, mz = 0;
  if (keys['KeyW']) { mx += forwardVec.x; mz += forwardVec.z; }
  if (keys['KeyS']) { mx -= forwardVec.x; mz -= forwardVec.z; }
  if (keys['KeyD']) { mx += rightVec.x; mz += rightVec.z; }
  if (keys['KeyA']) { mx -= rightVec.x; mz -= rightVec.z; }

  const moving = (mx !== 0 || mz !== 0);
  const wantRun = keys['ShiftLeft'] || keys['ShiftRight'];
  const running = moving && wantRun && player.stamina > 1;
  player.isMoving = moving;
  player.isRunning = running;

  if (running) player.stamina = Math.max(0, player.stamina - 16 * dt);
  else player.stamina = Math.min(100, player.stamina + 9 * dt);

  if (moving) {
    const len = Math.hypot(mx, mz);
    const speed = running ? player.speedRun : player.speedWalk;
    collideMove(player.position, (mx / len) * speed * dt, (mz / len) * speed * dt);

    // 头部晃动 + 脚步声
    player.bobPhase += dt * (running ? 11.5 : 7);
    player.stepTimer -= dt;
    if (player.stepTimer <= 0) {
      player.stepTimer = running ? 0.31 : 0.52;
      audio.footstep(running);
    }
  } else {
    player.bobPhase *= 0.9;
  }

  // 相机
  const bobY = Math.sin(player.bobPhase * 2) * (player.isRunning ? 0.045 : 0.024);
  const bobX = Math.cos(player.bobPhase) * (player.isRunning ? 0.02 : 0.01);
  // 呼吸
  const breath = Math.sin(clock.elapsedTime * 1.4) * 0.006;
  camera.position.set(
    player.position.x + rightVec.x * bobX,
    EYE_HEIGHT + bobY + breath,
    player.position.z + rightVec.z * bobX
  );
  camera.rotation.order = 'YXZ';
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;
  camera.rotation.z = Math.sin(player.bobPhase) * 0.004;

  // 手电电量
  if (state.flashlightOn) {
    state.battery = Math.max(0, state.battery - dt * 0.62);
    if (state.battery <= 0) {
      state.flashlightOn = false;
      audio.flashlightClick();
      showSubtitle('手电没电了……找块电池,快。');
    }
  }

  // 手电位置(带惯性)
  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);
  flashlight.position.copy(camera.position);
  const targetPos = camera.position.clone().addScaledVector(camDir, 12);
  flashTarget.position.lerp(targetPos, 1 - Math.pow(0.0001, dt)); // 平滑追随

  playerGlow.position.copy(camera.position);

  // HUD
  batteryFill.style.width = `${state.battery}%`;
  batteryFill.style.background = state.battery < 25
    ? 'linear-gradient(90deg,#8a2a1a,#c04a30)'
    : 'linear-gradient(90deg,#a8934a,#d8c26a)';
  staminaFill.style.width = `${player.stamina}%`;

  // 互动提示
  const it = nearestInteractable();
  if (it) {
    interactHint.classList.remove('hidden');
    if (it.type === 'fuse') interactHint.innerHTML = '<kbd>E</kbd>拾取保险丝';
    else if (it.type === 'battery') interactHint.innerHTML = '<kbd>E</kbd>拾取电池';
    else interactHint.innerHTML = state.fusesCollected >= FUSES_NEEDED
      ? '<kbd>E</kbd>打开大门逃出去!'
      : '<kbd>E</kbd>查看大门';
  } else {
    interactHint.classList.add('hidden');
  }
}

function updateWorld(dt) {
  const t = clock.elapsedTime;

  // 保险丝呼吸发光
  for (const f of fuses) {
    if (f.taken) continue;
    const pulse = 0.5 + Math.sin(t * 3 + f.pos.x) * 0.3;
    f.glow.material.opacity = 0.2 + pulse * 0.25;
    f.mesh.rotation.y += dt * 0.8;
  }

  // 顶灯闪烁
  state.scareLightsOut = Math.max(0, state.scareLightsOut - dt);
  for (const lamp of lamps) {
    let on = 1;
    if (state.scareLightsOut > 0) {
      on = 0;
    } else if (lamp.flickering) {
      lamp.phase += dt * (6 + Math.random() * 20);
      const n = Math.sin(lamp.phase) * Math.sin(lamp.phase * 2.7 + 1.3);
      on = n > -0.35 ? 1 : 0.04;
      if (Math.random() < 0.003) on = 0.02;
    }
    lamp.light.intensity = lamp.baseIntensity * on;
    lamp.tube.material.emissiveIntensity = 1.4 * on + 0.02;
  }

  // ------- 鬼 -------
  let ghostInfo = { dist: Infinity, visible: false };
  if (ghost && ghost.active) {
    // 判断手电是否照住它
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    ghostDir.set(
      ghost.position.x - camera.position.x,
      0,
      ghost.position.y - camera.position.z
    );
    const gd = ghostDir.length();
    ghostDir.normalize();
    const facing = camDir.dot(ghostDir);
    state.litGhost = state.flashlightOn && facing > 0.82 && gd < 17;

    ghostInfo = ghost.update(dt, player, audio, state.litGhost);

    // 心跳与静电强度
    const proximity = Math.max(0, 1 - ghostInfo.dist / 15);
    audio.heartRate = ghostInfo.visible ? proximity : proximity * 0.45;
    audio.staticLevel = ghostInfo.visible ? proximity * proximity : proximity * 0.2;

    // 手电被"它"干扰而闪烁
    if (ghostInfo.dist < 7 && state.flashlightOn && Math.random() < 0.09) {
      flashlight.intensity = Math.random() < 0.5 ? 4 : 60;
    }

    // 抓住玩家
    if (ghostInfo.dist < 1.15) killPlayer();
  } else {
    audio.heartRate = 0;
    audio.staticLevel = 0;
  }

  // 手电强度(平滑开关)
  const targetIntensity = state.flashlightOn ? (state.battery < 20 ? 34 + Math.random() * 14 : 62) : 0;
  flashlight.intensity += (targetIntensity - flashlight.intensity) * Math.min(1, dt * 14);

  state._ghostInfo = ghostInfo;
}

// 噪点覆盖层(越接近鬼越强)
let noiseFrame = 0;
function updateNoiseOverlay() {
  noiseFrame++;
  if (noiseFrame % 2) return; // 半帧率足够
  const info = state._ghostInfo;
  const proximity = info && info.dist !== Infinity ? Math.max(0, 1 - info.dist / 14) : 0;
  const base = state.mode === 'playing' ? 0.05 : 0.03;
  noiseCanvas.style.opacity = base + proximity * 0.45;

  const W = noiseCanvas.width, H = noiseCanvas.height;
  const img = noiseCtx.createImageData(W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = (Math.random() * 255) | 0;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  noiseCtx.putImageData(img, 0, 0);
}

animate();
