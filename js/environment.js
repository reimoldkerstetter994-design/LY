import * as THREE from 'three';

/**
 * 程序化纹理生成 - 无需外部贴图
 */
function createWallTexture(width = 512, height = 512, baseColor = '#3a3530') {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, width, height);

  // 污渍和裂纹
  for (let i = 0; i < 200; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const r = Math.random() * 30 + 5;
    const alpha = Math.random() * 0.15;
    ctx.fillStyle = `rgba(${Math.random() > 0.5 ? '20,15,10' : '60,50,40'}, ${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 水平纹理线
  for (let y = 0; y < height; y += 4) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`;
    ctx.fillRect(0, y, width, 1);
  }

  // 血迹
  if (Math.random() > 0.3) {
    for (let i = 0; i < 5; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, 20 + Math.random() * 40);
      grad.addColorStop(0, 'rgba(100, 10, 10, 0.4)');
      grad.addColorStop(1, 'rgba(100, 10, 10, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x - 50, y - 50, 100, 100);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function createFloorTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#2a2520';
  ctx.fillRect(0, 0, 512, 512);

  // 瓷砖网格
  const tileSize = 64;
  for (let x = 0; x < 512; x += tileSize) {
    for (let y = 0; y < 512; y += tileSize) {
      const shade = 0.9 + Math.random() * 0.2;
      ctx.fillStyle = `rgb(${Math.floor(42 * shade)}, ${Math.floor(37 * shade)}, ${Math.floor(32 * shade)})`;
      ctx.fillRect(x + 1, y + 1, tileSize - 2, tileSize - 2);

      // 裂缝
      if (Math.random() > 0.7) {
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + Math.random() * tileSize, y);
        ctx.lineTo(x + Math.random() * tileSize, y + tileSize);
        ctx.stroke();
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 4);
  return texture;
}

function createCeilingTexture() {
  return createWallTexture(512, 512, '#1a1815');
}

/**
 * 废弃精神病院地图布局
 * # = 墙, . = 空地, K = 钥匙, D = 门, E = 出口, S = 出生点, H = 躲藏点
 */
const MAP_LAYOUT = [
  '####################',
  '#S........#........#',
  '#.#########..######.',
  '#.#........#......#.',
  '#.#.########.####.#.',
  '#.#.#......#.#K..#.#',
  '#.#.#.######.#.###.#',
  '#...#.#......#.#...#',
  '#####.#.######.#.###',
  '#.....#.#....#.#...#',
  '#.#######..#.#.###.#',
  '#.#.......#.#.#...#.#',
  '#.#.######.#.#.###.#',
  '#.#.#K....#...#...#.',
  '#.#.#.#########.###.#',
  '#...#.#.......#.#...#',
  '#####.#.######.#.###',
  '#.....#........#..K.#',
  '#.##############.###',
  '#................E.#',
  '####################',
];

export class Environment {
  constructor(scene) {
    this.scene = scene;
    this.walls = [];
    this.doors = [];
    this.keys = [];
    this.hidingSpots = [];
    this.exitDoor = null;
    this.lights = [];
    this.flickeringLights = [];
    this.interactables = [];
    this.wallTexture = createWallTexture();
    this.floorTexture = createFloorTexture();
    this.ceilingTexture = createCeilingTexture();
    this.cellSize = 3;
    this.mapWidth = MAP_LAYOUT[0].length;
    this.mapHeight = MAP_LAYOUT.length;
    this.spawnPoint = new THREE.Vector3();
    this.bloodDecals = [];
    this.writingOnWalls = [];
  }

  build() {
    this.createMaterials();
    this.buildMap();
    this.createLighting();
    this.createAtmosphere();
    this.createDetails();
    return {
      spawnPoint: this.spawnPoint,
      walls: this.walls,
      keys: this.keys,
      doors: this.doors,
      exitDoor: this.exitDoor,
      hidingSpots: this.hidingSpots,
      lights: this.lights,
      flickeringLights: this.flickeringLights,
      interactables: this.interactables,
    };
  }

  createMaterials() {
    this.wallMat = new THREE.MeshLambertMaterial({
      map: this.wallTexture,
      color: 0xcccccc,
    });

    this.floorMat = new THREE.MeshLambertMaterial({
      map: this.floorTexture,
      color: 0xaaaaaa,
    });

    this.ceilingMat = new THREE.MeshLambertMaterial({
      map: this.ceilingTexture,
      color: 0x999999,
    });

    this.doorMat = new THREE.MeshStandardMaterial({
      color: 0x3a2a1a,
      roughness: 0.7,
      metalness: 0.2,
    });

    this.keyMat = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      emissive: 0xffaa00,
      emissiveIntensity: 0.5,
      metalness: 0.8,
      roughness: 0.3,
    });
  }

  buildMap() {
    const group = new THREE.Group();
    const floorGeo = new THREE.BoxGeometry(this.cellSize, 0.2, this.cellSize);
    const wallGeo = new THREE.BoxGeometry(this.cellSize, 3.5, this.cellSize);
    const ceilingGeo = new THREE.BoxGeometry(this.cellSize, 0.2, this.cellSize);

    for (let row = 0; row < this.mapHeight; row++) {
      for (let col = 0; col < this.mapWidth; col++) {
        const char = MAP_LAYOUT[row][col];
        const x = (col - this.mapWidth / 2) * this.cellSize;
        const z = (row - this.mapHeight / 2) * this.cellSize;

        // 地板
        if (char !== '#') {
          const floor = new THREE.Mesh(floorGeo, this.floorMat);
          floor.position.set(x, -0.1, z);
          floor.receiveShadow = true;
          group.add(floor);

          const ceiling = new THREE.Mesh(ceilingGeo, this.ceilingMat);
          ceiling.position.set(x, 3.6, z);
          group.add(ceiling);
        }

        if (char === '#') {
          const wall = new THREE.Mesh(wallGeo, this.wallMat);
          wall.position.set(x, 1.75, z);
          wall.castShadow = true;
          wall.receiveShadow = true;
          group.add(wall);
          this.walls.push(wall);
        }

        if (char === 'S') {
          this.spawnPoint.set(x, 1.7, z);
        }

        if (char === 'K') {
          this.createKey(x, 1.2, z, group);
        }

        if (char === 'D' || char === 'E') {
          this.createDoor(x, z, char === 'E', group);
        }

        if (char === 'H') {
          this.hidingSpots.push(new THREE.Vector3(x, 0, z));
        }
      }
    }

    // 添加一些内部墙壁门
    this.createInteriorDoors(group);
    this.scene.add(group);
    this.scene.fog = new THREE.FogExp2(0x0a0808, 0.02);
  }

  createKey(x, y, z, group) {
    const keyGroup = new THREE.Group();

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.08, 0.02, 8, 16),
      this.keyMat
    );
    ring.rotation.x = Math.PI / 2;

    const shaft = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.2, 0.02),
      this.keyMat
    );
    shaft.position.set(0.1, -0.1, 0);

    const tooth = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.05, 0.02),
      this.keyMat
    );
    tooth.position.set(0.12, -0.2, 0);

    keyGroup.add(ring, shaft, tooth);
    keyGroup.position.set(x, y, z);
    keyGroup.userData = { type: 'key', collected: false, id: this.keys.length };

    // 发光点光源
    const glow = new THREE.PointLight(0xffaa00, 0.5, 3);
    glow.position.set(0, 0.2, 0);
    keyGroup.add(glow);

    group.add(keyGroup);
    this.keys.push(keyGroup);
    this.interactables.push(keyGroup);
  }

  createDoor(x, z, isExit, group) {
    const doorGroup = new THREE.Group();
    const doorMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 2.8, 2.2),
      isExit
        ? new THREE.MeshStandardMaterial({ color: 0x2a1a0a, roughness: 0.6, metalness: 0.4 })
        : this.doorMat
    );
    doorMesh.position.y = 1.4;
    doorMesh.castShadow = true;
    doorGroup.add(doorMesh);

    // 门把手
    const handle = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.9, roughness: 0.2 })
    );
    handle.position.set(0.1, 1.2, 0.5);
    doorGroup.add(handle);

    doorGroup.position.set(x, 0, z);
    doorGroup.userData = {
      type: isExit ? 'exit' : 'door',
      open: false,
      locked: !isExit,
      requiredKeys: isExit ? 3 : 0,
    };

    group.add(doorGroup);
    if (isExit) {
      this.exitDoor = doorGroup;
    } else {
      this.doors.push(doorGroup);
    }
    this.interactables.push(doorGroup);
  }

  createInteriorDoors(group) {
    const doorPositions = [
      { x: -7.5, z: -7.5, rotY: 0 },
      { x: 7.5, z: 0, rotY: Math.PI / 2 },
      { x: -1.5, z: 7.5, rotY: 0 },
    ];

    doorPositions.forEach(pos => {
      const doorGroup = new THREE.Group();
      const doorMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 2.8, 2.0),
        this.doorMat
      );
      doorMesh.position.y = 1.4;
      doorGroup.add(doorMesh);
      doorGroup.position.set(pos.x, 0, pos.z);
      doorGroup.rotation.y = pos.rotY;
      doorGroup.userData = { type: 'door', open: false, locked: false };
      group.add(doorGroup);
      this.doors.push(doorGroup);
      this.interactables.push(doorGroup);
    });
  }

  createLighting() {
    // 极暗的环境光
    const ambient = new THREE.AmbientLight(0x2a2030, 0.45);
    this.scene.add(ambient);

    // 走廊灯光 - 稀疏且闪烁
    const lightPositions = [
      { x: 0, z: -25, color: 0xffeedd, intensity: 0.8 },
      { x: -15, z: -15, color: 0xffddcc, intensity: 0.6 },
      { x: 15, z: -10, color: 0xffeedd, intensity: 0.7 },
      { x: -10, z: 0, color: 0xccddff, intensity: 0.5 },
      { x: 10, z: 5, color: 0xffddcc, intensity: 0.6 },
      { x: 0, z: 15, color: 0xffeedd, intensity: 0.5 },
      { x: -15, z: 20, color: 0xff6666, intensity: 0.4 },
      { x: 15, z: 25, color: 0xffddcc, intensity: 0.6 },
    ];

    lightPositions.forEach((pos, i) => {
      const light = new THREE.PointLight(pos.color, pos.intensity, 12, 2);
      light.position.set(pos.x, 3.2, pos.z);
      light.castShadow = true;
      light.shadow.mapSize.set(512, 512);
      light.shadow.bias = -0.002;
      this.scene.add(light);
      this.lights.push(light);

      // 灯罩
      const fixture = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.4, 0.15, 8),
        new THREE.MeshStandardMaterial({
          color: 0x333333,
          emissive: pos.color,
          emissiveIntensity: 0.3,
        })
      );
      fixture.position.set(pos.x, 3.3, pos.z);
      this.scene.add(fixture);

      // 部分灯光会闪烁
      if (i % 2 === 0 || i === 6) {
        this.flickeringLights.push({
          light,
          fixture,
          baseIntensity: pos.intensity,
          flickerSpeed: 0.5 + Math.random() * 2,
          nextFlicker: Math.random() * 5,
        });
      }
    });

    // 红色紧急灯
    const emergencyLight = new THREE.PointLight(0xff0000, 0.3, 20, 2);
    emergencyLight.position.set(0, 3, 27);
    this.scene.add(emergencyLight);
    this.lights.push(emergencyLight);
  }

  createAtmosphere() {
    // 尘埃粒子
    const particleCount = 500;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 60;
      positions[i * 3 + 1] = Math.random() * 3.5;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 60;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0xaaaaaa,
      size: 0.03,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
    });

    this.dustParticles = new THREE.Points(geometry, material);
    this.scene.add(this.dustParticles);
  }

  createDetails() {
    // 墙上文字
    const writings = [
      { text: '救救我', pos: [-12, 1.5, -20], rot: 0 },
      { text: '不要看', pos: [12, 1.5, -5], rot: -Math.PI / 2 },
      { text: '它来了', pos: [-5, 1.5, 10], rot: Math.PI },
      { text: 'EXIT?', pos: [8, 1.5, 22], rot: -Math.PI / 2 },
      { text: 'HELP', pos: [-18, 1.5, 5], rot: Math.PI / 2 },
    ];

    writings.forEach(w => {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'rgba(80, 10, 10, 0.8)';
      ctx.font = 'bold 36px serif';
      ctx.textAlign = 'center';
      ctx.fillText(w.text, 128, 45);

      const texture = new THREE.CanvasTexture(canvas);
      const mat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.4), mat);
      mesh.position.set(w.pos[0], w.pos[1], w.pos[2]);
      mesh.rotation.y = w.rot;
      this.scene.add(mesh);
      this.writingOnWalls.push(mesh);
    });

    // 散落物品 - 轮椅
    this.createWheelchair(-10, -8);
    this.createWheelchair(14, 12);

    // 输液架
    this.createIVStand(5, -18);
    this.createIVStand(-8, 15);
  }

  createWheelchair(x, z) {
    const group = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.6, roughness: 0.4 });
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.8 });

    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.5), seatMat);
    seat.position.y = 0.5;
    group.add(seat);

    const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.05), seatMat);
    back.position.set(0, 0.75, -0.22);
    group.add(back);

    // 轮子
    [-0.25, 0.25].forEach(sx => {
      const wheel = new THREE.Mesh(
        new THREE.TorusGeometry(0.2, 0.03, 8, 16),
        frameMat
      );
      wheel.position.set(sx, 0.2, 0);
      wheel.rotation.y = Math.PI / 2;
      group.add(wheel);
    });

    group.position.set(x, 0, z);
    group.rotation.y = Math.random() * Math.PI * 2;
    group.castShadow = true;
    this.scene.add(group);
  }

  createIVStand(x, z) {
    const group = new THREE.Group();
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.7, roughness: 0.3 });

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2, 8), poleMat);
    pole.position.y = 1;
    group.add(pole);

    const bag = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.25, 0.08),
      new THREE.MeshStandardMaterial({
        color: 0xcccccc,
        transparent: true,
        opacity: 0.6,
      })
    );
    bag.position.y = 1.8;
    group.add(bag);

    group.position.set(x, 0, z);
    this.scene.add(group);
  }

  update(delta, elapsed) {
    // 灯光闪烁
    this.flickeringLights.forEach(fl => {
      fl.nextFlicker -= delta;
      if (fl.nextFlicker <= 0) {
        const flicker = Math.random() > 0.3 ? 0 : Math.random() * fl.baseIntensity;
        fl.light.intensity = flicker;
        if (fl.fixture.material) {
          fl.fixture.material.emissiveIntensity = flicker > 0 ? 0.3 : 0;
        }
        fl.nextFlicker = 0.05 + Math.random() * 0.3;
        if (Math.random() > 0.7) {
          fl.nextFlicker = 1 + Math.random() * 4;
          fl.light.intensity = fl.baseIntensity;
        }
      }
    });

    // 钥匙旋转浮动
    this.keys.forEach(key => {
      if (!key.userData.collected) {
        key.rotation.y += delta * 2;
        key.position.y = 1.2 + Math.sin(elapsed * 2 + key.userData.id) * 0.1;
      }
    });

    // 尘埃飘动
    if (this.dustParticles) {
      const positions = this.dustParticles.geometry.attributes.position.array;
      for (let i = 0; i < positions.length; i += 3) {
        positions[i + 1] += Math.sin(elapsed + i) * 0.001;
        if (positions[i + 1] > 3.5) positions[i + 1] = 0;
      }
      this.dustParticles.geometry.attributes.position.needsUpdate = true;
    }
  }

  getCollisionBoxes() {
    const boxes = [];
    this.walls.forEach(wall => {
      const box = new THREE.Box3().setFromObject(wall);
      boxes.push(box);
    });

    this.doors.forEach(door => {
      if (!door.userData.open) {
        const box = new THREE.Box3().setFromObject(door);
        boxes.push(box);
      }
    });

    if (this.exitDoor && !this.exitDoor.userData.open) {
      boxes.push(new THREE.Box3().setFromObject(this.exitDoor));
    }

    return boxes;
  }
}

export { MAP_LAYOUT };
