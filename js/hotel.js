/* Blacktide Inn — lobby, guest floors, flooded boiler, interactables. */
(function (global) {
  const CELL = 1;
  const THICK = 0.12;
  const GH = 3.18;
  const UPPER = 3.18;
  const CELLAR = -3.36;

  const R = {
    VOID: 0,
    LOBBY: 1,
    DINING: 2,
    KITCHEN: 3,
    HALL: 4,
    RECEPTION: 5,
    OFFICE: 6,
    LOUNGE: 7,
    REST: 8,
    STAIRS: 9,
    C201: 10,
    C202: 11,
    C203: 12,
    C204: 13,
    C205: 14,
    C206: 15,
    UPHALL: 16,
    UPSTAIRS: 17,
    BOILER: 18,
    STORAGE: 19,
    PIER: 20,
    CHALL: 21,
    CSTAIRS: 22,
  };

  const rooms = {};
  const colliders = [];
  const interactables = [];
  const lights = [];
  const flickers = [];
  const rainPanes = [];
  const waypoints = [];
  let hideSpots = [];
  let mats = {};
  let scene = null;
  let doorMeshes = {};
  let waterMesh = null;

  function reset() {
    for (const k of Object.keys(rooms)) delete rooms[k];
    colliders.length = 0;
    interactables.length = 0;
    lights.length = 0;
    flickers.length = 0;
    rainPanes.length = 0;
    waypoints.length = 0;
    hideSpots = [];
    doorMeshes = {};
    waterMesh = null;
  }

  function fill(grid, x0, z0, x1, z1, id) {
    for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) grid[z][x] = id;
  }

  function makeGrid(w, d) {
    return Array.from({ length: d }, () => Array(w).fill(0));
  }

  function groundGrid() {
    const g = makeGrid(26, 16);
    fill(g, 8, 0, 18, 5, R.LOBBY);
    fill(g, 0, 0, 8, 7, R.DINING);
    fill(g, 0, 7, 8, 16, R.KITCHEN);
    fill(g, 8, 5, 18, 12, R.HALL);
    fill(g, 18, 0, 26, 6, R.RECEPTION);
    fill(g, 18, 6, 22, 11, R.OFFICE);
    fill(g, 22, 6, 26, 16, R.LOUNGE);
    fill(g, 18, 11, 22, 16, R.REST);
    fill(g, 8, 12, 18, 16, R.STAIRS);
    return g;
  }

  function upperGrid() {
    const g = makeGrid(26, 16);
    fill(g, 10, 0, 16, 16, R.UPHALL);
    fill(g, 0, 0, 10, 5, R.C201);
    fill(g, 16, 0, 26, 5, R.C202);
    fill(g, 0, 5, 10, 10, R.C203);
    fill(g, 16, 5, 26, 10, R.C204);
    fill(g, 0, 10, 10, 16, R.C205);
    fill(g, 16, 10, 26, 16, R.C206);
    fill(g, 10, 12, 16, 16, R.UPSTAIRS);
    return g;
  }

  function cellarGrid() {
    const g = makeGrid(18, 12);
    fill(g, 0, 0, 18, 12, R.CHALL);
    fill(g, 0, 0, 6, 8, R.BOILER);
    fill(g, 12, 0, 18, 8, R.STORAGE);
    fill(g, 6, 0, 12, 3, R.PIER);
    fill(g, 6, 8, 18, 12, R.CSTAIRS);
    return g;
  }

  function addCollider(minx, miny, minz, maxx, maxy, maxz) {
    colliders.push({ minx, miny, minz, maxx, maxy, maxz });
  }

  function box(x, y, z, w, h, d, mat, collide, shadow) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow !== false;
    mesh.receiveShadow = true;
    scene.add(mesh);
    if (collide !== false) {
      addCollider(x - w / 2, y - h / 2, z - d / 2, x + w / 2, y + h / 2, z + d / 2);
    }
    return mesh;
  }

  function cellAt(grid, x, z) {
    if (z < 0 || x < 0 || z >= grid.length || x >= grid[0].length) return 0;
    return grid[z][x];
  }

  function matchOpening(list, x, z, dir) {
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (o.x === x && o.z === z && o.dir === dir) return o;
      if (dir === "e" && o.x === x + 1 && o.z === z && o.dir === "w") return o;
      if (dir === "n" && o.x === x && o.z === z + 1 && o.dir === "s") return o;
      if (dir === "w" && o.x === x - 1 && o.z === z && o.dir === "e") return o;
      if (dir === "s" && o.x === x && o.z === z - 1 && o.dir === "n") return o;
    }
    return null;
  }

  function wallMat(id) {
    if (id === R.REST || id === R.KITCHEN) return mats.tileWall;
    if (id === R.BOILER || id === R.STORAGE || id === R.CHALL || id === R.PIER || id === R.CSTAIRS) return mats.brick;
    if (id === R.C201 || id === R.C205) return mats.stripe;
    if (id === R.C204) return mats.paperDark;
    if (id === R.LOBBY || id === R.RECEPTION) return mats.seaWall;
    return mats.paper;
  }

  function floorMat(id) {
    if (id === R.REST || id === R.KITCHEN) return mats.tile;
    if (id === R.BOILER || id === R.STORAGE || id === R.CHALL || id === R.PIER || id === R.CSTAIRS) return mats.concrete;
    if (id === R.LOBBY || id === R.HALL || id === R.UPHALL) return mats.carpet;
    if (id >= R.C201 && id <= R.C206) return mats.woodLight;
    return mats.wood;
  }

  function buildFloor(grid, y, h, doors, windows, ox, oz, skipFloor) {
    ox = ox || 0;
    oz = oz || 0;
    const D = grid.length;
    const W = grid[0].length;
    const ceilY = y + h;

    for (let z = 0; z < D; z++) {
      for (let x = 0; x < W; x++) {
        const id = grid[z][x];
        if (!id) continue;
        const cx = ox + x * CELL + CELL / 2;
        const cz = oz + z * CELL + CELL / 2;
        if (!rooms[id]) rooms[id] = { cells: [] };
        rooms[id].cells.push({ x: cx, z: cz, y });

        const skip = skipFloor && skipFloor(x, z, id);
        if (!skip) {
          box(cx, y + 0.03, cz, CELL + 0.02, 0.06, CELL + 0.02, floorMat(id), false, false);
          box(cx, ceilY - 0.04, cz, CELL + 0.02, 0.08, CELL + 0.02, mats.paperDark, false, false);
        }

        const neigh = [
          { dir: "e", nx: x + 1, nz: z, px: cx + CELL / 2, pz: cz, w: THICK, d: CELL + 0.02, ax: 1, az: 0 },
          { dir: "w", nx: x - 1, nz: z, px: cx - CELL / 2, pz: cz, w: THICK, d: CELL + 0.02, ax: -1, az: 0 },
          { dir: "n", nx: x, nz: z + 1, px: cx, pz: cz + CELL / 2, w: CELL + 0.02, d: THICK, ax: 0, az: 1 },
          { dir: "s", nx: x, nz: z - 1, px: cx, pz: cz - CELL / 2, w: CELL + 0.02, d: THICK, ax: 0, az: -1 },
        ];

        for (let i = 0; i < neigh.length; i++) {
          const n = neigh[i];
          const nid = cellAt(grid, n.nx, n.nz);
          if (nid === id) continue;
          const opening = matchOpening(doors, x, z, n.dir);
          const win = matchOpening(windows, x, z, n.dir);
          if (opening) {
            const doorH = 2.22;
            box(n.px, y + (h + doorH) / 2 + 0.02, n.pz, n.w, h - doorH, n.d, wallMat(id), true, false);
            if (nid === 0) {
              box(n.px, y + doorH / 2, n.pz, n.w, doorH, n.d, wallMat(id), false, false);
            }
            if (opening.key && !opening._made) {
              opening._made = true;
              const dw = n.dir === "e" || n.dir === "w" ? 0.06 : 0.92;
              const dd = n.dir === "n" || n.dir === "s" ? 0.06 : 0.92;
              const door = box(n.px, y + doorH / 2, n.pz, dw, doorH, dd, mats.wood, true, true);
              door.userData.closed = true;
              doorMeshes[opening.id] = { mesh: door, opening, dir: n.dir };
              interactables.push({
                kind: "door",
                id: opening.id,
                key: opening.key,
                pos: new THREE.Vector3(n.px, y + 1.1, n.pz),
                reach: 1.55,
                label: opening.label || "门",
              });
            }
            continue;
          }
          if (win && nid === 0) {
            const sill = 0.92;
            const wh = 1.35;
            box(n.px, y + sill / 2, n.pz, n.w, sill, n.d, wallMat(id), true, false);
            box(n.px, y + sill + wh + (h - sill - wh) / 2, n.pz, n.w, h - sill - wh, n.d, wallMat(id), true, false);
            const pane = box(n.px, y + sill + wh / 2, n.pz, n.w * 0.4, wh, n.d * 0.4, mats.glass, false, false);
            rainPanes.push(pane);
            continue;
          }
          if (nid !== 0 && !opening) {
            // interior wall between different rooms
          }
          box(n.px, y + h / 2, n.pz, n.w, h, n.d, wallMat(id), true, false);
        }
      }
    }
  }

  function lamp(x, y, z, color, intensity, dist, flicker) {
    const bulb = box(x, y, z, 0.16, 0.08, 0.16, mats.glowCyan, false, false);
    const light = new THREE.PointLight(color || 0xffddaa, intensity || 0.55, dist || 7, 2);
    light.position.set(x, y - 0.12, z);
    scene.add(light);
    lights.push(light);
    if (flicker !== false) flickers.push({ light, base: light.intensity, t: Math.random() * 10 });
    return { bulb, light };
  }

  function note(id, x, y, z, title) {
    box(x, y, z, 0.18, 0.01, 0.24, mats.woodLight, false, false);
    interactables.push({
      kind: "note",
      id,
      pos: new THREE.Vector3(x, y, z),
      reach: 1.4,
      label: title || "字条",
    });
  }

  function logItem(id, x, y, z) {
    box(x, y, z, 0.22, 0.04, 0.3, mats.gold, false, false);
    interactables.push({
      kind: "log",
      id,
      pos: new THREE.Vector3(x, y, z),
      reach: 1.4,
      label: "旅客记录",
    });
  }

  function keyItem(id, x, y, z, label) {
    box(x, y, z, 0.08, 0.02, 0.18, mats.gold, false, false);
    interactables.push({
      kind: "key",
      id,
      pos: new THREE.Vector3(x, y, z),
      reach: 1.35,
      label: label || "钥匙",
    });
  }

  function hide(id, x, y, z, w, h, d, mat) {
    box(x, y, z, w, h, d, mat || mats.wood, true, true);
    hideSpots.push({ id, pos: new THREE.Vector3(x, y, z), reach: 1.5 });
    interactables.push({
      kind: "hide",
      id,
      pos: new THREE.Vector3(x, y + 0.4, z),
      reach: 1.5,
      label: "躲进去",
    });
  }

  function furnitureGround() {
    // lobby desk / sofa / sign
    box(13, 0.42, 2.4, 2.4, 0.84, 0.7, mats.wood, true, true);
    box(10.2, 0.38, 3.2, 1.6, 0.76, 0.7, mats.cloth, true, true);
    box(15.8, 0.38, 3.2, 1.6, 0.76, 0.7, mats.cloth, true, true);
    box(13, 1.7, 0.35, 2.6, 0.55, 0.08, mats.rust, false, false);
    const sign = box(13, 2.35, 0.4, 1.8, 0.35, 0.06, mats.glowRed, false, false);
    sign.material = mats.glowRed;
    lamp(13, 2.85, 2.6, 0xffc8a0, 1.8, 13, false);
    const lobbyFill = new THREE.PointLight(0xffd2a8, 1.1, 11, 1.6);
    lobbyFill.position.set(13, 2.3, 3.4);
    scene.add(lobbyFill);
    lamp(10.5, 2.85, 7.5, 0xffd0aa, 0.85, 9);
    lamp(15.5, 2.85, 7.5, 0xffd0aa, 0.85, 9);
    note("lobby", 13.6, 0.86, 2.4, "前台便条");
    logItem(0, 21.2, 1.08, 2.4);

    // reception counter
    box(21, 0.52, 2.2, 3.2, 1.04, 0.8, mats.wood, true, true);
    box(23.6, 0.9, 1.4, 0.08, 1.4, 1.1, mats.glass, false, false);
    keyItem("office", 20.2, 1.08, 2.15, "办公室钥匙");
    lamp(22, 2.9, 3, 0xffe0b0, 0.95, 8);

    // dining
    box(3.6, 0.4, 3.2, 2.4, 0.8, 1.2, mats.wood, true, true);
    for (let i = 0; i < 4; i++) box(2.4 + (i % 2) * 2.4, 0.28, 2.3 + (i < 2 ? 0 : 1.8), 0.36, 0.56, 0.36, mats.wood, true, true);
    hide("dining", 6.4, 0.38, 1.4, 1.1, 0.76, 1.4, mats.cloth);
    logItem(1, 3.5, 0.84, 3.2);
    note("dining", 1.4, 1.1, 5.2, "发黄菜单");
    lamp(3.5, 2.9, 3.4, 0xffcc88, 0.4, 6, true);

    // kitchen
    box(2.2, 0.55, 10.5, 3.2, 1.1, 0.7, mats.metal, true, true);
    box(5.6, 0.7, 13.6, 1.4, 1.4, 0.7, mats.metal, true, true);
    box(1.4, 0.9, 14.6, 0.7, 1.8, 1.1, mats.metal, true, true);
    note("kitchen", 2.4, 1.14, 10.5, "后厨字条");
    lamp(3.2, 2.9, 11.2, 0xaaccff, 0.35, 6, true);

    // office
    box(19.8, 0.48, 8.2, 1.4, 0.96, 0.7, mats.wood, true, true);
    box(20.6, 1.15, 8.2, 0.08, 0.7, 0.55, mats.black, false, false);
    keyItem("room201", 19.5, 1.0, 8.15, "201 钥匙");
    note("office", 19.9, 1.0, 8.5, "经理日志");
    lamp(20, 2.9, 8.4, 0xffaa77, 0.4, 5, true);

    // lounge
    box(24, 0.32, 10.5, 1.8, 0.64, 1.6, mats.cloth, true, true);
    box(23.6, 0.55, 13.4, 0.7, 1.1, 1.4, mats.wood, true, true);
    note("lounge", 23.6, 1.14, 13.4, "收音机旁的纸");
    lamp(24, 2.9, 11, 0xffc090, 0.4, 6);

    // restroom
    box(19.4, 0.5, 13.4, 0.7, 1.0, 0.7, mats.tileWall, true, true);
    hide("stall", 20.6, 0.7, 14.4, 0.85, 1.4, 0.7, mats.tileWall);
    lamp(20, 2.9, 13.5, 0x88aacc, 0.3, 5, true);

    // hall debris
    box(11.2, 0.18, 8.4, 0.7, 0.36, 0.5, mats.rust, true, true);
    box(16.2, 0.22, 9.6, 0.5, 0.44, 0.7, mats.cloth, true, true);
  }

  function furnitureUpper() {
    function room(x0, z0, bedX, bedZ, deskX, deskZ) {
      box(bedX, UPPER + 0.28, bedZ, 2.0, 0.56, 1.2, mats.cloth, true, true);
      box(bedX, UPPER + 0.62, bedZ - 0.4, 0.7, 0.28, 0.22, mats.cloth, false, false);
      box(deskX, UPPER + 0.42, deskZ, 1.1, 0.84, 0.5, mats.wood, true, true);
    }
    room(0, 0, 3.2, 2.2, 7.4, 1.6);
    room(16, 0, 22.6, 2.2, 18.6, 1.6);
    room(0, 5, 3.2, 7.2, 7.4, 6.6);
    room(16, 5, 22.6, 7.2, 18.6, 6.6);
    room(0, 10, 3.2, 12.6, 7.4, 11.8);
    // linen
    box(21.5, UPPER + 0.7, 13.2, 1.6, 1.4, 0.5, mats.wood, true, true);
    hide("linen", 18.8, UPPER + 0.7, 13.6, 0.9, 1.4, 1.2, mats.wood);

    logItem(2, 7.4, UPPER + 0.88, 6.6);
    logItem(3, 18.6, UPPER + 0.88, 6.6);
    keyItem("boiler", 3.4, UPPER + 0.6, 2.3, "锅炉房钥匙");
    note("r203", 7.3, UPPER + 0.88, 6.9, "203 日记");
    note("r204", 18.5, UPPER + 0.88, 6.9, "妹妹的字");
    note("r201", 7.2, UPPER + 0.88, 1.6, "201 旅客留言");
    note("r205", 7.2, UPPER + 0.88, 11.8, "潮位抄表");

    lamp(13, UPPER + 2.85, 3, 0xffd0aa, 0.35, 7, true);
    lamp(13, UPPER + 2.85, 8, 0xffd0aa, 0.3, 7, true);
    lamp(13, UPPER + 2.85, 12.2, 0xffaa88, 0.28, 6, true);
    lamp(3.4, UPPER + 2.85, 2.4, 0xffbb88, 0.28, 5, true);
    lamp(22.4, UPPER + 2.85, 7.2, 0x88ccee, 0.22, 5, true);
  }

  function furnitureCellar() {
    box(2.4, CELLAR + 0.9, 7.2, 1.6, 1.8, 1.2, mats.rust, true, true);
    box(3.6, CELLAR + 0.5, 10.2, 2.2, 1.0, 0.8, mats.metal, true, true);
    box(14.8, CELLAR + 0.45, 7.4, 1.8, 0.9, 1.4, mats.wood, true, true);
    box(15.6, CELLAR + 0.7, 10.2, 0.7, 1.4, 0.7, mats.rust, true, true);
    keyItem("boat", 2.6, CELLAR + 1.84, 7.2, "小艇钥匙");
    note("boiler", 3.5, CELLAR + 1.04, 10.2, "焦黑检修单");
    note("pier", 8.8, CELLAR + 1.1, 5.4, "码头告示");
    lamp(3, CELLAR + 2.6, 8, 0xff6622, 0.45, 6, true);
    lamp(9, CELLAR + 2.6, 10, 0x88aacc, 0.25, 7, true);
    lamp(15, CELLAR + 2.6, 8, 0xffaa66, 0.3, 6, true);

    waterMesh = new THREE.Mesh(new THREE.PlaneGeometry(18.2, 12.2, 24, 16), mats.water);
    waterMesh.rotation.x = -Math.PI / 2;
    waterMesh.position.set(9, CELLAR + 0.16, 10);
    scene.add(waterMesh);

    interactables.push({
      kind: "escape",
      id: "pier",
      pos: new THREE.Vector3(9, CELLAR + 1.2, 4.45),
      reach: 1.8,
      label: "冲向码头",
    });
    box(9, CELLAR + 1.1, 4.15, 1.6, 2.2, 0.1, mats.metal, false, true);
  }

  function stairs() {
    const steps = 12;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      box(10.4, 0.08 + t * UPPER, 12.4 + t * 3.1, 2.0, 0.16, 0.34, mats.wood, false, false);
      box(15.6, -0.08 - t * Math.abs(CELLAR), 12.4 + t * 3.1, 2.0, 0.16, 0.34, mats.concrete, false, false);
    }
    box(12.95, 0.04, 14.2, 2.4, 0.08, 3.4, mats.wood, false, false);
    box(10.4, UPPER / 2, 12.15, 0.1, UPPER, 3.4, mats.wood, true, false);
    box(15.6, CELLAR / 2, 12.15, 0.1, Math.abs(CELLAR), 3.4, mats.brick, true, false);
  }

  function exterior() {
    // night sky box-ish ground around hotel
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshPhongMaterial({
      color: 0x05080c,
      shininess: 2,
    }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    scene.add(ground);

    // rain volume
    const geo = new THREE.BufferGeometry();
    const n = 1400;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 40;
      pos[i * 3 + 1] = Math.random() * 16;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 30;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const rain = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0x8aa0b4,
      size: 0.035,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    }));
    scene.add(rain);
    rooms._rain = rain;

    // hotel neon
    const neon = box(13, 4.6, -0.4, 4.6, 0.7, 0.12, mats.glowRed, false, false);
    const nl = new THREE.PointLight(0xff2233, 1.8, 16, 2);
    nl.position.set(13, 4.4, 0.4);
    scene.add(nl);
    flickers.push({ light: nl, base: 1.8, t: 0 });
    const porch = new THREE.PointLight(0xff6644, 0.9, 10, 2);
    porch.position.set(13, 2.4, 1.1);
    scene.add(porch);
  }

  function makeDoors() {
    return [
      { id: "lobby-din", x: 8, z: 2, dir: "w", key: null },
      { id: "lobby-rec", x: 17, z: 2, dir: "e", key: null },
      { id: "lobby-hall", x: 12, z: 4, dir: "n", key: null },
      { id: "lobby-hall2", x: 13, z: 4, dir: "n", key: null },
      { id: "din-kit", x: 3, z: 6, dir: "n", key: null },
      { id: "hall-stairs", x: 12, z: 11, dir: "n", key: null },
      { id: "hall-stairs2", x: 13, z: 11, dir: "n", key: null },
      { id: "hall-kit", x: 8, z: 8, dir: "w", key: null },
      { id: "hall-off", x: 17, z: 8, dir: "e", key: "office", label: "办公室" },
      { id: "off-lounge", x: 21, z: 8, dir: "e", key: null },
      { id: "hall-rest", x: 17, z: 13, dir: "e", key: null },
      { id: "up-stairs", x: 12, z: 11, dir: "n", key: null },
      { id: "up-stairs2", x: 13, z: 11, dir: "n", key: null },
      { id: "d201", x: 10, z: 2, dir: "w", key: "room201", label: "201" },
      { id: "d202", x: 15, z: 2, dir: "e", key: null, label: "202" },
      { id: "d203", x: 10, z: 7, dir: "w", key: null, label: "203" },
      { id: "d204", x: 15, z: 7, dir: "e", key: null, label: "204" },
      { id: "d205", x: 10, z: 12, dir: "w", key: null, label: "205" },
      { id: "d206", x: 15, z: 13, dir: "e", key: null, label: "布草间" },
      { id: "c-stairs", x: 8, z: 7, dir: "n", key: null },
      { id: "c-stairs2", x: 9, z: 7, dir: "n", key: null },
      { id: "c-pier", x: 8, z: 3, dir: "s", key: null },
      { id: "boiler", x: 6, z: 4, dir: "w", key: "boiler", label: "锅炉房" },
      { id: "storage", x: 11, z: 4, dir: "e", key: null, label: "储藏" },
    ];
  }

  function makeWindows() {
    return [
      { x: 10, z: 0, dir: "s" },
      { x: 15, z: 0, dir: "s" },
      { x: 3, z: 0, dir: "s" },
      { x: 21, z: 0, dir: "s" },
      { x: 24, z: 0, dir: "s" },
      { x: 2, z: 0, dir: "s" },
      { x: 5, z: 15, dir: "n" },
    ];
  }

  function addWaypoints() {
    const pts = [
      [13, 0, 3], [13, 0, 8], [4, 0, 3], [4, 0, 11], [21, 0, 3], [20, 0, 8], [24, 0, 11],
      [13, UPPER, 3], [13, UPPER, 8], [13, UPPER, 12], [4, UPPER, 2], [4, UPPER, 7], [22, UPPER, 7],
      [9, CELLAR, 10], [3, CELLAR, 8], [15, CELLAR, 8], [9, CELLAR, 6],
    ];
    for (let i = 0; i < pts.length; i++) {
      waypoints.push(new THREE.Vector3(pts[i][0], pts[i][1], pts[i][2]));
    }
  }

  function openDoor(id) {
    const d = doorMeshes[id];
    if (!d || !d.mesh.userData.closed) return false;
    d.mesh.userData.closed = false;
    d.mesh.rotation.y += d.dir === "e" || d.dir === "w" ? 0 : 1.35;
    d.mesh.position.x += d.dir === "e" ? 0.45 : d.dir === "w" ? -0.45 : 0;
    d.mesh.position.z += d.dir === "n" ? 0.45 : d.dir === "s" ? -0.45 : 0;
    const c = d.mesh.position;
    const geo = d.mesh.geometry.parameters;
    // disable collider by shrinking it out of the way
    for (let i = 0; i < colliders.length; i++) {
      const b = colliders[i];
      if (Math.abs((b.minx + b.maxx) / 2 - c.x) < 0.4 && Math.abs((b.minz + b.maxz) / 2 - c.z) < 0.4 && Math.abs(b.miny - (c.y - geo.height / 2)) < 0.4) {
        b.maxx = b.minx;
        b.maxz = b.minz;
      }
    }
    return true;
  }

  function floorY(x, y, z) {
    // up stairs: x 9.4-11.4, z 12.2-15.6
    if (x > 9.3 && x < 11.6 && z > 12.15 && z < 15.7 && y > -1.2) {
      const t = Math.max(0, Math.min(1, (z - 12.2) / 3.2));
      return t * UPPER;
    }
    // down stairs
    if (x > 14.5 && x < 16.8 && z > 12.15 && z < 15.7 && y < 1.6) {
      const t = Math.max(0, Math.min(1, (z - 12.2) / 3.2));
      return -t * Math.abs(CELLAR);
    }
    if (y > UPPER * 0.55) return UPPER;
    if (y < -0.8) return CELLAR;
    return 0;
  }

  function inWater(x, y, z) {
    return y < -1.2 && z < 12;
  }

  function resolve(pos, radius, prevY) {
    const y = floorY(pos.x, prevY != null ? prevY : pos.y, pos.z);
    pos.y = y;
    for (let k = 0; k < 3; k++) {
      for (let i = 0; i < colliders.length; i++) {
        const b = colliders[i];
        if (b.maxx <= b.minx) continue;
        if (pos.y + 1.6 < b.miny || pos.y + 0.1 > b.maxy) continue;
        const cx = Math.max(b.minx, Math.min(pos.x, b.maxx));
        const cz = Math.max(b.minz, Math.min(pos.z, b.maxz));
        const dx = pos.x - cx;
        const dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < radius * radius) {
          const d = Math.sqrt(d2) || 0.0001;
          pos.x += (dx / d) * (radius - d);
          pos.z += (dz / d) * (radius - d);
        }
      }
    }
    pos.y = floorY(pos.x, pos.y, pos.z);
    return pos;
  }

  function build(target) {
    scene = target;
    reset();
    mats = BTTex.makeMats();
    const cellarIds = { boiler: 1, storage: 1, "c-stairs": 1, "c-stairs2": 1, "c-pier": 1 };
    const gDoors = makeDoors().filter((d) => !String(d.id).startsWith("d") && !String(d.id).startsWith("up-") && !cellarIds[d.id]);
    const uDoors = makeDoors().filter((d) => String(d.id).startsWith("d") || String(d.id).startsWith("up-"));
    const cDoors = makeDoors().filter((d) => cellarIds[d.id]);
    const wins = makeWindows();

    buildFloor(groundGrid(), 0, GH, gDoors, wins, 0, 0, (x, z) => z >= 12 && x >= 8 && x < 18);
    buildFloor(upperGrid(), UPPER, GH, uDoors, [], 0, 0, (x, z) => z >= 12 && x >= 10 && x < 16);
    buildFloor(cellarGrid(), CELLAR, GH, cDoors, [], 0, 4, (x, z) => z >= 8 && x >= 14 && x < 18);

    stairs();
    furnitureGround();
    furnitureUpper();
    furnitureCellar();
    exterior();
    addWaypoints();

    return api;
  }

  function tick(t, dt) {
    for (let i = 0; i < flickers.length; i++) {
      const f = flickers[i];
      f.t += dt;
      const n = 0.72 + Math.sin(f.t * 17.3 + i) * 0.12 + (Math.random() < 0.02 ? -0.45 : 0);
      f.light.intensity = Math.max(0.05, f.base * n);
    }
    if (rooms._rain) {
      const p = rooms._rain.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        let y = p.getY(i) - dt * 14;
        if (y < 0) y = 16;
        p.setY(i, y);
      }
      p.needsUpdate = true;
    }
    if (waterMesh) waterMesh.position.y = CELLAR + 0.14 + Math.sin(t * 1.4) * 0.03;
  }

  const api = {
    build,
    tick,
    resolve,
    floorY,
    inWater,
    openDoor,
    colliders,
    interactables,
    waypoints,
    hideSpots,
    rooms,
    CELLAR,
    UPPER,
  };

  global.BTHotel = api;
})(window);
