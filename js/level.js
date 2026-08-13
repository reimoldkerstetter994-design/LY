(function (global) {
  "use strict";

  const TILE = 2.75;
  const WALL_H = 3.35;

  const MAP_RAW = `
####################################
#........##......##......##........#
#..M.....##......##......##........#
#...4......3........*........C.....#
#........##......##......##........#
#...D....##......##......##........#
####+#######+#######+#######+#######
#..................................#
#..................................#
###+########+########+##############
#......##......##......##..........#
#......##......##......##..........#
#..H...........2........1..........#
#..A...##......##......##..........#
#......##......##......##..........#
###+#######+#######+#######+########
#..................................#
#..................................#
####+#######+##############+########
#........##............##....X.....#
#..P.....##............##..........#
#...*....##......B.....##..........#
#........##............##..........#
####################################
`.trim().split("\n");

  const NOTES = {
    A: {
      title: "值班室便签",
      body: "夜班交接：13 号病房今晚空着。别问为什么。把灯关掉，它比较安静。权限卡分散在护理部、住院部和楼上那些不该再打开的房间。",
    },
    B: {
      title: "前台对讲记录",
      body: "2:04  有人在走廊喊救命。下去的人没回来。大门需要四张权限卡。我只找到自己这一张，剩下的……别跟着光走。",
    },
    C: {
      title: "皱掉的祷告纸",
      body: "我把第三张卡放进了手术室。血不是我的。如果你听见自己的脚步，而你并没有走——不要回头。求你。",
    },
    D: {
      title: "冷柜上的字",
      body: "它会学脚步声。手电一开，它就知道你在哪。第四张卡在这里。拿走就跑。别看抽屉缝。",
    },
  };

  const KEY_NAMES = {
    1: "权限卡 · 护理部",
    2: "权限卡 · 住院部",
    3: "权限卡 · 手术室",
    4: "权限卡 · 太平间",
  };

  function worldOf(c, r) {
    return { x: (c + 0.5) * TILE, z: (r + 0.5) * TILE };
  }

  function buildLevel(scene, textures) {
    const rows = MAP_RAW;
    const H = rows.length;
    const W = rows[0].length;
    for (let r = 0; r < H; r++) {
      if (rows[r].length !== W) {
        throw new Error("Map row " + r + " length " + rows[r].length + " != " + W);
      }
    }

    const grid = rows.map((row) => row.split(""));
    const doors = {};
    const interactables = [];
    const spawn = { x: TILE * 2, y: 0, z: TILE * 2 };
    let monsterSpawn = worldOf(3, 2);
    const walkable = [];

    const env = textures.env;
    const wallMat = new THREE.MeshStandardMaterial({
      map: textures.wall,
      normalMap: textures.wallNormal,
      roughnessMap: textures.wallRough,
      roughness: 0.86,
      metalness: 0.02,
      envMap: env,
      envMapIntensity: 0.25,
      color: 0xd8cfc0,
    });
    const floorMat = new THREE.MeshStandardMaterial({
      map: textures.floor,
      normalMap: textures.floorNormal,
      roughnessMap: textures.floorRough,
      roughness: 0.42,
      metalness: 0.08,
      envMap: env,
      envMapIntensity: 0.45,
      color: 0xb7aea0,
    });
    const ceilMat = new THREE.MeshStandardMaterial({
      map: textures.ceiling,
      roughness: 0.92,
      metalness: 0,
      color: 0x8a8680,
    });
    const metalMat = new THREE.MeshStandardMaterial({
      map: textures.metal,
      normalMap: textures.metalNormal,
      roughness: 0.35,
      metalness: 0.72,
      envMap: env,
      envMapIntensity: 0.7,
      color: 0x9aa0a6,
    });
    const woodMat = new THREE.MeshStandardMaterial({
      map: textures.wood,
      roughness: 0.8,
      metalness: 0.05,
      color: 0x5a4030,
    });
    const bloodMat = new THREE.MeshStandardMaterial({
      map: textures.blood,
      transparent: true,
      opacity: 0.82,
      roughness: 0.35,
      metalness: 0.05,
      depthWrite: false,
    });
    const blackMat = new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.5,
      metalness: 0.2,
    });
    const sheetMat = new THREE.MeshStandardMaterial({
      color: 0xc9c2b4,
      roughness: 0.9,
      metalness: 0,
    });
    const emissiveGreen = new THREE.MeshStandardMaterial({
      map: textures.exitSign,
      emissive: 0x1dff88,
      emissiveMap: textures.exitSign,
      emissiveIntensity: 0.85,
      roughness: 0.5,
    });
    const wardSignMat = new THREE.MeshStandardMaterial({
      map: textures.wardSign,
      roughness: 0.7,
      metalness: 0,
    });

    const wallGeo = new THREE.BoxGeometry(TILE, WALL_H, TILE);
    const dummy = new THREE.Object3D();
    const wallCells = [];
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        if (grid[r][c] === "#") wallCells.push({ c, r });
      }
    }
    const walls = new THREE.InstancedMesh(wallGeo, wallMat, wallCells.length);
    walls.castShadow = true;
    walls.receiveShadow = true;
    wallCells.forEach((cell, i) => {
      dummy.position.set((cell.c + 0.5) * TILE, WALL_H / 2, (cell.r + 0.5) * TILE);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      walls.setMatrixAt(i, dummy.matrix);
    });
    scene.add(walls);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W * TILE, H * TILE), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((W * TILE) / 2, 0, (H * TILE) / 2);
    floor.receiveShadow = true;
    scene.add(floor);

    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W * TILE, H * TILE), ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set((W * TILE) / 2, WALL_H, (H * TILE) / 2);
    scene.add(ceil);

    function addBox(mat, x, y, z, sx, sy, sz, rotY) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
      m.position.set(x, y, z);
      if (rotY) m.rotation.y = rotY;
      m.castShadow = true;
      m.receiveShadow = true;
      scene.add(m);
      return m;
    }

    function addDecal(x, z, s, rot) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s * 0.7), bloodMat);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = rot || 0;
      m.position.set(x, 0.015, z);
      scene.add(m);
    }

    const lights = [];

    function addFlicker(x, z, color, intensity, dist) {
      const group = new THREE.Group();
      const fixture = addBox(metalMat, x, WALL_H - 0.06, z, 1.6, 0.06, 0.22);
      const glowMat = new THREE.MeshBasicMaterial({
        color: color || 0xdde6ee,
        transparent: true,
        opacity: 0.55,
      });
      const glow = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.02, 0.12), glowMat);
      glow.position.set(x, WALL_H - 0.1, z);
      scene.add(glow);
      const light = new THREE.PointLight(color || 0xc9d6e2, intensity || 0.55, dist || 9, 2);
      light.position.set(x, WALL_H - 0.35, z);
      scene.add(light);
      lights.push({ light, glow, base: intensity || 0.55, phase: Math.random() * 10, mode: "flicker" });
      return group;
    }

    function addRed(x, z) {
      const light = new THREE.PointLight(0xff2a1a, 0.35, 6.5, 2);
      light.position.set(x, 0.55, z);
      scene.add(light);
      addBox(new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2200, emissiveIntensity: 0.6, roughness: 0.4 }), x, 0.28, z, 0.12, 0.1, 0.18);
      lights.push({ light, glow: null, base: 0.35, phase: Math.random() * 8, mode: "pulse" });
    }

    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        const ch = grid[r][c];
        const { x, z } = worldOf(c, r);
        if (ch !== "#") walkable.push({ c, r });

        if (ch === "+") {
          const nWall = grid[r - 1] && grid[r - 1][c] === "#";
          const sWall = grid[r + 1] && grid[r + 1][c] === "#";
          const alongZ = nWall === sWall;
          const doorW = TILE * 0.92;
          addBox(metalMat, x, 1.12, z, alongZ ? doorW + 0.2 : 0.18, 2.24, alongZ ? 0.18 : doorW + 0.2);
          const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(alongZ ? doorW : 0.05, 2.12, alongZ ? 0.05 : doorW), woodMat);
          doorMesh.position.set(x, 1.08, z);
          doorMesh.castShadow = true;
          scene.add(doorMesh);
          const window = new THREE.Mesh(
            new THREE.PlaneGeometry(0.28, 0.38),
            new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.05, metalness: 0.4, envMap: env, envMapIntensity: 1 })
          );
          window.position.set(0, 0.35, alongZ ? 0.03 : 0);
          if (!alongZ) window.rotation.y = Math.PI / 2;
          doorMesh.add(window);
          const key = c + "," + r;
          doors[key] = {
            c,
            r,
            mesh: doorMesh,
            open: false,
            angle: 0,
            target: 0,
            alongZ,
            ox: x,
            oz: z,
          };
          interactables.push({
            type: "door",
            key,
            position: new THREE.Vector3(x, 1.1, z),
            radius: 1.35,
            label: "开门",
          });
        }

        if (ch === "P") Object.assign(spawn, { x, z });
        if (ch === "M") monsterSpawn = { x, z };
        if (ch === "1" || ch === "2" || ch === "3" || ch === "4") {
          const card = addBox(
            new THREE.MeshStandardMaterial({
              color: 0x6a1212,
              roughness: 0.45,
              metalness: 0.15,
              emissive: 0x3a0000,
              emissiveIntensity: 0.25,
            }),
            x,
            1.02,
            z,
            0.18,
            0.01,
            0.28
          );
          interactables.push({
            type: "key",
            id: ch,
            mesh: card,
            position: new THREE.Vector3(x, 1.02, z),
            radius: 1.2,
            label: "拿起" + KEY_NAMES[ch],
          });
        }
        if (ch === "A" || ch === "B" || ch === "C" || ch === "D") {
          const paper = addBox(sheetMat, x, 0.92, z + 0.2, 0.22, 0.002, 0.3, 0.4);
          interactables.push({
            type: "note",
            id: ch,
            mesh: paper,
            position: new THREE.Vector3(x, 1, z),
            radius: 1.2,
            label: "阅读字条",
          });
        }
        if (ch === "*") {
          const bat = addBox(metalMat, x, 0.55, z, 0.08, 0.18, 0.08);
          interactables.push({
            type: "battery",
            mesh: bat,
            position: new THREE.Vector3(x, 0.55, z),
            radius: 1.1,
            label: "拿起电池",
          });
        }
        if (ch === "H") {
          addBox(woodMat, x - 0.7, 1.2, z, 0.08, 2.4, 1.2);
          addBox(woodMat, x + 0.7, 1.2, z, 0.08, 2.4, 1.2);
          addBox(woodMat, x, 2.35, z, 1.5, 0.08, 1.25);
          addBox(woodMat, x, 1.2, z - 0.58, 1.48, 2.4, 0.08);
          const door = addBox(woodMat, x, 1.15, z + 0.6, 1.2, 2.2, 0.05);
          interactables.push({
            type: "hide",
            mesh: door,
            position: new THREE.Vector3(x, 1.2, z),
            hidePos: new THREE.Vector3(x, 0, z - 0.15),
            radius: 1.3,
            label: "躲进储物柜",
          });
        }
        if (ch === "X") {
          const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.35), emissiveGreen);
          sign.position.set(x, 2.45, z - 1.2);
          scene.add(sign);
          interactables.push({
            type: "exit",
            position: new THREE.Vector3(x, 1.2, z),
            radius: 1.6,
            label: "打开大门",
          });
        }
      }
    }

    function roomCenter(c0, r0, c1, r1) {
      return worldOf(Math.floor((c0 + c1) / 2), Math.floor((r0 + r1) / 2));
    }

    function addBed(x, z, rot) {
      addBox(metalMat, x, 0.28, z, 2.1, 0.12, 0.95, rot);
      addBox(sheetMat, x, 0.42, z, 2.0, 0.12, 0.88, rot);
      addBox(sheetMat, x + (rot ? 0 : 0.8), 0.52, z, 0.5, 0.12, 0.7, rot);
      addBox(metalMat, x - 0.95, 0.55, z, 0.06, 0.9, 0.9, rot);
    }

    function addDesk(x, z) {
      addBox(woodMat, x, 0.72, z, 1.6, 0.06, 0.7);
      addBox(woodMat, x - 0.7, 0.36, z, 0.08, 0.72, 0.65);
      addBox(woodMat, x + 0.7, 0.36, z, 0.08, 0.72, 0.65);
      addBox(blackMat, x, 0.92, z, 0.42, 0.28, 0.38);
    }

    function addGurney(x, z) {
      addBox(metalMat, x, 0.78, z, 2.2, 0.08, 0.7);
      addBox(sheetMat, x, 0.86, z, 2.1, 0.06, 0.62);
      addBox(metalMat, x - 0.9, 0.4, z - 0.28, 0.06, 0.8, 0.06);
      addBox(metalMat, x + 0.9, 0.4, z + 0.28, 0.06, 0.8, 0.06);
    }

    function addChair(x, z, rot) {
      addBox(metalMat, x, 0.42, z, 0.48, 0.06, 0.48, rot);
      addBox(metalMat, x, 0.72, z - 0.2, 0.48, 0.55, 0.06, rot);
    }

    function addLocker(x, z) {
      addBox(metalMat, x, 1.2, z, 0.55, 2.4, 0.5);
    }

    addBed(worldOf(3, 12).x, worldOf(3, 11).z, 0);
    addBed(worldOf(12, 12).x, worldOf(12, 11).z, 0);
    addBed(worldOf(20, 12).x, worldOf(20, 11).z, 0);
    addDesk(worldOf(30, 11).x, worldOf(30, 11).z);
    addBox(blackMat, worldOf(28, 13).x, 1.1, worldOf(28, 13).z, 0.08, 1.1, 1.4);
    addGurney(worldOf(13, 3).x, worldOf(13, 3).z);
    addBox(metalMat, worldOf(14, 2).x, 1.6, worldOf(14, 2).z, 1.2, 0.15, 1.2);
    addBox(new THREE.MeshStandardMaterial({ color: 0x2a0000, roughness: 0.4 }), worldOf(13, 3).x, 0.92, worldOf(13, 3).z, 1.6, 0.05, 0.5);
    addDecal(worldOf(13, 3).x, worldOf(13, 3).z, 2.2, 0.4);
    addDecal(worldOf(14, 7).x, worldOf(14, 7).z, 1.6, 1.2);
    addDecal(worldOf(4, 3).x, worldOf(4, 4).z, 1.8, 0.2);

    for (let i = 0; i < 4; i++) {
      addBox(metalMat, worldOf(3, 1).x + i * 0.55, 0.9, worldOf(3, 1).z, 0.5, 1.8, 0.7);
    }
    addLocker(worldOf(6, 20).x, worldOf(6, 20).z);
    addLocker(worldOf(7, 20).x, worldOf(7, 21).z);
    addDesk(worldOf(16, 21).x, worldOf(16, 20).z);
    addChair(worldOf(14, 21).x, worldOf(14, 21).z, 0.2);
    addChair(worldOf(15, 21).x + 0.8, worldOf(15, 21).z, -0.3);
    addChair(worldOf(18, 21).x, worldOf(18, 21).z, 0.5);

    const mirror = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 1.1),
      new THREE.MeshStandardMaterial({
        color: 0x151518,
        roughness: 0.05,
        metalness: 0.9,
        envMap: env,
        envMapIntensity: 1.4,
      })
    );
    const locker = worldOf(2, 21);
    mirror.position.set(locker.x - 0.9, 1.55, locker.z);
    mirror.rotation.y = Math.PI / 2;
    scene.add(mirror);
    interactables.push({
      type: "mirror",
      position: mirror.position.clone(),
      radius: 1.4,
      label: "镜子上有水雾",
    });

    const phone = addBox(blackMat, worldOf(17, 20).x, 0.95, worldOf(17, 20).z, 0.18, 0.08, 0.22);
    interactables.push({
      type: "phone",
      mesh: phone,
      position: phone.position.clone(),
      radius: 1.2,
      label: "拿起电话",
    });

    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), wardSignMat);
    const south = worldOf(18, 16);
    sign.position.set(south.x, 2.6, south.z);
    scene.add(sign);

    addFlicker(worldOf(18, 7).x, worldOf(18, 7).z, 0xc9d6e2, 0.42, 11);
    addFlicker(worldOf(8, 7).x, worldOf(8, 7).z, 0xc9d6e2, 0.28, 9);
    addFlicker(worldOf(28, 8).x, worldOf(28, 8).z, 0xb9c4cc, 0.22, 8);
    addFlicker(worldOf(18, 16).x, worldOf(18, 16).z, 0xdde4ea, 0.38, 10);
    addFlicker(worldOf(6, 16).x, worldOf(6, 16).z, 0xaab4bc, 0.18, 8);
    addFlicker(worldOf(30, 12).x, worldOf(30, 12).z, 0xcfd8e0, 0.4, 8);
    addFlicker(worldOf(13, 3).x, worldOf(13, 3).z, 0xffe8d0, 0.2, 7);
    addFlicker(worldOf(4, 3).x, worldOf(4, 3).z, 0x8899aa, 0.12, 6);
    addFlicker(worldOf(16, 21).x, worldOf(16, 21).z, 0xc9d0d6, 0.3, 8);
    addRed(worldOf(18, 8).x, worldOf(18, 8).z);
    addRed(worldOf(10, 16).x, worldOf(10, 16).z);
    addRed(worldOf(26, 16).x, worldOf(26, 16).z);
    addRed(worldOf(4, 7).x, worldOf(4, 7).z);

    const dustGeo = new THREE.BufferGeometry();
    const dustCount = 450;
    const dustPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      dustPos[i * 3] = Math.random() * W * TILE;
      dustPos[i * 3 + 1] = 0.3 + Math.random() * 2.4;
      dustPos[i * 3 + 2] = Math.random() * H * TILE;
    }
    dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
    const dust = new THREE.Points(
      dustGeo,
      new THREE.PointsMaterial({
        color: 0xd8cfc0,
        size: 0.018,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      })
    );
    scene.add(dust);

    function cell(x, z) {
      return { c: Math.floor(x / TILE), r: Math.floor(z / TILE) };
    }

    function inBounds(c, r) {
      return r >= 0 && r < H && c >= 0 && c < W;
    }

    function doorClosed(c, r) {
      const d = doors[c + "," + r];
      return d && !d.open && d.angle < 0.4;
    }

    function isSolidWorld(x, z) {
      const { c, r } = cell(x, z);
      if (!inBounds(c, r)) return true;
      const ch = grid[r][c];
      if (ch === "#") return true;
      if (ch === "+" && doorClosed(c, r)) return true;
      return false;
    }

    function isWalkableCell(c, r) {
      if (!inBounds(c, r)) return false;
      const ch = grid[r][c];
      if (ch === "#") return false;
      if (ch === "+" && doorClosed(c, r)) return false;
      return true;
    }

    function moveWithCollision(pos, dx, dz, radius) {
      const nx = pos.x + dx;
      const nz = pos.z + dz;
      if (!isSolidWorld(nx + Math.sign(dx) * radius, pos.z) && !isSolidWorld(nx, pos.z + radius * 0.4) && !isSolidWorld(nx, pos.z - radius * 0.4)) {
        pos.x = nx;
      }
      if (!isSolidWorld(pos.x, nz + Math.sign(dz) * radius) && !isSolidWorld(pos.x + radius * 0.4, nz) && !isSolidWorld(pos.x - radius * 0.4, nz)) {
        pos.z = nz;
      }
    }

    function hasLOS(ax, az, bx, bz) {
      const dist = Math.hypot(bx - ax, bz - az);
      const steps = Math.max(2, Math.ceil(dist / 0.28));
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        if (isSolidWorld(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
      }
      return true;
    }

    function astar(sc, sr, gc, gr, canBreakDoors) {
      if (!inBounds(gc, gr) || !inBounds(sc, sr)) return [];
      const key = (c, r) => c + "," + r;
      const walk = (c, r) => {
        if (!inBounds(c, r)) return false;
        const ch = grid[r][c];
        if (ch === "#") return false;
        if (ch === "+" && doorClosed(c, r) && !canBreakDoors) return false;
        return true;
      };
      if (!walk(gc, gr)) return [];
      const open = [{ c: sc, r: sr, g: 0, f: Math.abs(gc - sc) + Math.abs(gr - sr) }];
      const came = new Map();
      const gScore = new Map([[key(sc, sr), 0]]);
      const seen = new Set();
      const dirs = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ];
      while (open.length) {
        open.sort((a, b) => a.f - b.f);
        const cur = open.shift();
        const ck = key(cur.c, cur.r);
        if (seen.has(ck)) continue;
        seen.add(ck);
        if (cur.c === gc && cur.r === gr) {
          const path = [];
          let k = ck;
          while (k) {
            const [c, r] = k.split(",").map(Number);
            const w = worldOf(c, r);
            path.push(w);
            k = came.get(k);
          }
          path.reverse();
          return path;
        }
        for (const [dc, dr] of dirs) {
          const nc = cur.c + dc;
          const nr = cur.r + dr;
          if (!walk(nc, nr)) continue;
          const nk = key(nc, nr);
          const ng = cur.g + 1;
          if (ng < (gScore.get(nk) ?? Infinity)) {
            gScore.set(nk, ng);
            came.set(nk, ck);
            open.push({ c: nc, r: nr, g: ng, f: ng + Math.abs(gc - nc) + Math.abs(gr - nr) });
          }
        }
        if (seen.size > 800) break;
      }
      return [];
    }

    function updateDoors(dt) {
      Object.values(doors).forEach((d) => {
        d.angle += (d.target - d.angle) * Math.min(1, dt * 5);
        const swing = d.angle;
        if (d.alongZ) {
          d.mesh.rotation.y = swing;
          d.mesh.position.x = d.ox + Math.sin(swing) * 0.45;
          d.mesh.position.z = d.oz + (1 - Math.cos(swing)) * 0.45;
        } else {
          d.mesh.rotation.y = Math.PI / 2 + swing;
          d.mesh.position.z = d.oz + Math.sin(swing) * 0.45;
          d.mesh.position.x = d.ox + (1 - Math.cos(swing)) * 0.45;
        }
        if (swing > 1.1) d.open = true;
        if (swing < 0.15) d.open = false;
      });
    }

    function toggleDoor(key) {
      const d = doors[key];
      if (!d) return false;
      d.target = d.target > 0.5 ? 0 : 1.45;
      d.open = d.target > 0.5;
      return true;
    }

    function forceOpenDoorAt(c, r) {
      const d = doors[c + "," + r];
      if (d && d.target < 0.5) {
        d.target = 1.45;
        d.open = true;
        return true;
      }
      return false;
    }

    function updateLights(t, blackout) {
      lights.forEach((l) => {
        if (blackout) {
          l.light.intensity = 0.02;
          if (l.glow) l.glow.material.opacity = 0.05;
          return;
        }
        if (l.mode === "flicker") {
          const n = Math.sin(t * 7 + l.phase) * 0.5 + Math.sin(t * 19 + l.phase * 2) * 0.5;
          const spike = Math.random() > 0.992 ? 0 : 1;
          const k = (0.72 + n * 0.28) * spike;
          l.light.intensity = l.base * k;
          if (l.glow) l.glow.material.opacity = 0.25 + k * 0.4;
        } else {
          l.light.intensity = l.base * (0.75 + Math.sin(t * 2.2 + l.phase) * 0.25);
        }
      });
    }

    const waypoints = [
      worldOf(18, 7),
      worldOf(8, 8),
      worldOf(28, 8),
      worldOf(18, 16),
      worldOf(4, 3),
      worldOf(13, 3),
      worldOf(30, 12),
      worldOf(16, 21),
      worldOf(6, 12),
      worldOf(20, 12),
    ];

    return {
      TILE,
      W,
      H,
      grid,
      doors,
      interactables,
      spawn,
      monsterSpawn,
      notes: NOTES,
      keyNames: KEY_NAMES,
      cell,
      worldOf,
      isSolidWorld,
      isWalkableCell,
      moveWithCollision,
      hasLOS,
      astar,
      updateDoors,
      toggleDoor,
      forceOpenDoorAt,
      updateLights,
      waypoints,
      dust,
      inBounds,
    };
  }

  global.WARD13 = global.WARD13 || {};
  global.WARD13.TILE = TILE;
  global.WARD13.buildLevel = buildLevel;
})(window);
