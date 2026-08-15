/* Two-storey house + cellar. Grid walls, furniture, interactables. */
(function (global) {
  const CELL = 1;
  const THICK = 0.12;
  const GH = 3.12;
  const UPPER = 3.12;
  const CELLAR = -3.28;

  const R = {
    VOID: 0,
    FOYER: 1,
    LIVING: 2,
    DINING: 3,
    KITCHEN: 4,
    HALL: 5,
    BATH: 6,
    STUDY: 7,
    STAIRS: 8,
    SISTER: 9,
    MASTER: 10,
    BATH2: 11,
    CLOSET: 12,
    NURSERY: 13,
    UPHALL: 14,
    UPSTAIRS: 15,
    CELLAR: 16,
    RITUAL: 17,
    CSTAIRS: 18,
  };

  const rooms = {};
  const colliders = [];
  const interactables = [];
  const lights = [];
  const flickers = [];
  const rainPanes = [];
  const waypoints = [];
  let mats = {};
  let scene = null;
  let hideSpots = [];

  function resetLists() {
    for (const k of Object.keys(rooms)) delete rooms[k];
    colliders.length = 0;
    interactables.length = 0;
    lights.length = 0;
    flickers.length = 0;
    rainPanes.length = 0;
    waypoints.length = 0;
    hideSpots = [];
  }

  function fill(grid, x0, z0, x1, z1, id) {
    for (let z = z0; z < z1; z++) {
      for (let x = x0; x < x1; x++) grid[z][x] = id;
    }
  }

  function makeGrid(w, d) {
    return Array.from({ length: d }, () => Array(w).fill(0));
  }

  function groundGrid() {
    const g = makeGrid(24, 16);
    fill(g, 0, 0, 9, 10, R.LIVING);
    fill(g, 9, 0, 14, 4, R.FOYER);
    fill(g, 14, 0, 24, 8, R.DINING);
    fill(g, 9, 4, 14, 16, R.HALL);
    fill(g, 14, 8, 24, 16, R.KITCHEN);
    fill(g, 18, 12, 24, 16, R.VOID);
    fill(g, 0, 10, 5, 16, R.BATH);
    fill(g, 5, 10, 9, 16, R.STUDY);
    fill(g, 9, 12, 14, 16, R.STAIRS);
    return g;
  }

  function upperGrid() {
    const g = makeGrid(24, 16);
    fill(g, 0, 0, 9, 10, R.SISTER);
    fill(g, 14, 0, 24, 10, R.MASTER);
    fill(g, 9, 4, 14, 16, R.UPHALL);
    fill(g, 0, 10, 5, 16, R.BATH2);
    fill(g, 5, 10, 9, 16, R.CLOSET);
    fill(g, 14, 10, 24, 16, R.NURSERY);
    fill(g, 9, 12, 14, 16, R.UPSTAIRS);
    return g;
  }

  function cellarGrid() {
    const g = makeGrid(16, 12);
    fill(g, 0, 0, 16, 12, R.CELLAR);
    fill(g, 0, 0, 6, 6, R.RITUAL);
    fill(g, 10, 8, 16, 12, R.CSTAIRS);
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

  function wallMatFor(id) {
    if (id === R.BATH || id === R.BATH2 || id === R.KITCHEN) return mats.tileWall;
    if (id === R.CELLAR || id === R.RITUAL || id === R.CSTAIRS) return mats.brick;
    if (id === R.SISTER || id === R.NURSERY) return mats.stripe;
    if (id === R.MASTER) return mats.paperDark;
    return mats.paper;
  }

  function floorMatFor(id) {
    if (id === R.BATH || id === R.BATH2 || id === R.KITCHEN) return mats.tile;
    if (id === R.CELLAR || id === R.RITUAL || id === R.CSTAIRS) return mats.concrete;
    if (id >= R.SISTER) return mats.woodLight;
    return mats.wood;
  }

  function buildFloor(grid, y, h, doors, windows, ox, oz) {
    ox = ox || 0;
    oz = oz || 0;
    const D = grid.length;
    const W = grid[0].length;
    const ceilY = y + h;

    for (let z = 0; z < D; z++) {
      for (let x = 0; x < W; x++) {
        const id = grid[z][x];
        if (!id) continue;
        const cx = ox + x + 0.5;
        const cz = oz + z + 0.5;
        const fm = floorMatFor(id);
        const fl = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.08, 1.02), fm);
        fl.position.set(cx, y - 0.04, cz);
        fl.receiveShadow = true;
        scene.add(fl);

        const cl = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.08, 1.02), mats.plaster);
        cl.position.set(cx, ceilY + 0.04, cz);
        cl.receiveShadow = true;
        scene.add(cl);

        if (!rooms[id]) rooms[id] = { minx: cx, maxx: cx, minz: cz, maxz: cz, y, h };
        const rm = rooms[id];
        rm.minx = Math.min(rm.minx, cx - 0.5);
        rm.maxx = Math.max(rm.maxx, cx + 0.5);
        rm.minz = Math.min(rm.minz, cz - 0.5);
        rm.maxz = Math.max(rm.maxz, cz + 0.5);

        if ((x + z) % 5 === 0) waypoints.push({ x: cx, y: y + 0.05, z: cz, room: id });
      }
    }

    function placeWall(x0, z0, x1, z1, wy, wh, mat, collide) {
      const w = Math.abs(x1 - x0) || THICK;
      const d = Math.abs(z1 - z0) || THICK;
      const mx = (x0 + x1) / 2;
      const mz = (z0 + z1) / 2;
      box(mx, wy + wh / 2, mz, w < 0.01 ? THICK : w, wh, d < 0.01 ? THICK : d, mat, collide !== false, false);
    }

    function addDoor(wx, wz, rot, spec, y0, wallH, id) {
      const doorW = 1.02;
      const doorH = 2.18;
      const frame = mats.woodDark;
      const jamb = 0.08;
      if (rot === 0) {
        box(wx - doorW / 2, y0 + doorH / 2, wz, jamb, doorH, 0.16, frame, true, false);
        box(wx + doorW / 2, y0 + doorH / 2, wz, jamb, doorH, 0.16, frame, true, false);
      } else {
        box(wx, y0 + doorH / 2, wz - doorW / 2, 0.16, doorH, jamb, frame, true, false);
        box(wx, y0 + doorH / 2, wz + doorW / 2, 0.16, doorH, jamb, frame, true, false);
      }
      box(wx, y0 + doorH + 0.07, wz, rot === 0 ? doorW + 0.12 : 0.16, 0.14, rot === 0 ? 0.16 : doorW + 0.12, frame, true, false);
      placeWall(wx - (rot === 0 ? 0.55 : THICK / 2), wz - (rot === 0 ? THICK / 2 : 0.55), wx + (rot === 0 ? 0.55 : THICK / 2), wz + (rot === 0 ? THICK / 2 : 0.55), y0 + doorH + 0.14, wallH - doorH - 0.14, wallMatFor(id), true);

      const leaf = new THREE.Mesh(new THREE.BoxGeometry(rot === 0 ? doorW - 0.04 : 0.05, doorH - 0.04, rot === 0 ? 0.05 : doorW - 0.04), mats.door);
      const pivot = new THREE.Group();
      pivot.position.set(wx, y0, wz);
      pivot.rotation.y = rot === 0 ? 0 : Math.PI / 2;
      leaf.position.set(0.49, doorH / 2, 0);
      pivot.add(leaf);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), mats.metal);
      knob.position.set(0.82, 1.0, 0.04);
      pivot.add(knob);
      scene.add(pivot);

      const locked = !!(spec && spec.locked);
      const kind = (spec && spec.kind) || "door";
      const item = {
        type: kind,
        id: spec && spec.id,
        key: spec && spec.key,
        mesh: pivot,
        pos: new THREE.Vector3(wx, y0 + 1.1, wz),
        open: false,
        locked,
        rot,
        wx,
        wz,
        y0,
        doorW,
        doorH,
        collider: null,
      };
      item.collider = { minx: wx - 0.55, miny: y0, minz: wz - 0.55, maxx: wx + 0.55, maxy: y0 + doorH, maxz: wz + 0.55 };
      if (rot === 0) {
        item.collider.minx = wx - 0.52;
        item.collider.maxx = wx + 0.52;
        item.collider.minz = wz - 0.08;
        item.collider.maxz = wz + 0.08;
      } else {
        item.collider.minx = wx - 0.08;
        item.collider.maxx = wx + 0.08;
        item.collider.minz = wz - 0.52;
        item.collider.maxz = wz + 0.52;
      }
      colliders.push(item.collider);
      interactables.push(item);
    }

    function addWindow(wx, wz, rot, y0, wallH, id) {
      const ww = 1.05;
      const sill = 0.92;
      const wh = 1.28;
      const mat = wallMatFor(id);
      if (rot === 0) {
        placeWall(wx - 0.5, wz, wx + 0.5, wz, y0, sill, mat, true);
        placeWall(wx - 0.5, wz, wx + 0.5, wz, y0 + sill + wh, wallH - sill - wh, mat, true);
      } else {
        placeWall(wx, wz - 0.5, wx, wz + 0.5, y0, sill, mat, true);
        placeWall(wx, wz - 0.5, wx, wz + 0.5, y0 + sill + wh, wallH - sill - wh, mat, true);
      }
      const glass = new THREE.Mesh(
        new THREE.PlaneGeometry(ww, wh),
        new THREE.MeshStandardMaterial({
          color: 0x8aa0b4,
          transparent: true,
          opacity: 0.18,
          roughness: 0.05,
          metalness: 0.3,
          side: THREE.DoubleSide,
        })
      );
      glass.position.set(wx, y0 + sill + wh / 2, wz);
      if (rot !== 0) glass.rotation.y = Math.PI / 2;
      scene.add(glass);

      const rain = new THREE.Mesh(
        new THREE.PlaneGeometry(ww, wh),
        new THREE.MeshBasicMaterial({
          map: SHTex.TEX.rain.map,
          transparent: true,
          opacity: 0.28,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      rain.position.copy(glass.position);
      rain.rotation.copy(glass.rotation);
      if (rot === 0) rain.position.z += wz < oz + 8 ? -0.03 : 0.03;
      else rain.position.x += wx < ox + 12 ? -0.03 : 0.03;
      scene.add(rain);
      rainPanes.push(rain);

      const night = new THREE.Mesh(
        new THREE.PlaneGeometry(ww + 0.2, wh + 0.4),
        new THREE.MeshBasicMaterial({ color: 0x05070c })
      );
      night.position.copy(glass.position);
      night.rotation.copy(glass.rotation);
      if (rot === 0) night.position.z += wz < oz + 8 ? -0.08 : 0.08;
      else night.position.x += wx < ox + 12 ? -0.08 : 0.08;
      scene.add(night);
    }

    for (let z = 0; z < D; z++) {
      for (let x = 0; x < W; x++) {
        const id = grid[z][x];
        if (!id) continue;
        const east = cellAt(grid, x + 1, z);
        const north = cellAt(grid, x, z + 1);
        const wxE = ox + x + 1;
        const wzE = oz + z + 0.5;
        const wxN = ox + x + 0.5;
        const wzN = oz + z + 1;

        if (east !== id) {
          const door = matchOpening(doors, x, z, "e");
          const win = matchOpening(windows, x, z, "e");
          if (door) addDoor(wxE, wzE, 1, door, y, h, id);
          else if (win) addWindow(wxE, wzE, 1, y, h, id);
          else placeWall(wxE, oz + z, wxE, oz + z + 1, y, h, wallMatFor(id), true);
        }
        if (north !== id) {
          const door = matchOpening(doors, x, z, "n");
          const win = matchOpening(windows, x, z, "n");
          if (door) addDoor(wxN, wzN, 0, door, y, h, id);
          else if (win) addWindow(wxN, wzN, 0, y, h, id);
          else placeWall(ox + x, wzN, ox + x + 1, wzN, y, h, wallMatFor(id), true);
        }

        if (cellAt(grid, x - 1, z) === 0) {
          const door = matchOpening(doors, x, z, "w");
          const win = matchOpening(windows, x, z, "w");
          const wx = ox + x;
          const wz = oz + z + 0.5;
          if (door) addDoor(wx, wz, 1, door, y, h, id);
          else if (win) addWindow(wx, wz, 1, y, h, id);
          else placeWall(wx, oz + z, wx, oz + z + 1, y, h, wallMatFor(id), true);
        }
        if (cellAt(grid, x, z - 1) === 0) {
          const door = matchOpening(doors, x, z, "s");
          const win = matchOpening(windows, x, z, "s");
          const wx = ox + x + 0.5;
          const wz = oz + z;
          if (door) addDoor(wx, wz, 0, door, y, h, id);
          else if (win) addWindow(wx, wz, 0, y, h, id);
          else placeWall(ox + x, wz, ox + x + 1, wz, y, h, wallMatFor(id), true);
        }
      }
    }
  }

  function stairs(x0, z0, x1, z1, y0, y1, axis) {
    const steps = 16;
    const rise = (y1 - y0) / steps;
    const along = axis === "z" ? z1 - z0 : x1 - x0;
    const run = along / steps;
    const w = axis === "z" ? x1 - x0 : z1 - z0;
    for (let i = 0; i < steps; i++) {
      const t = i + 0.5;
      const y = y0 + rise * i + rise / 2;
      if (axis === "z") {
        box(x0 + w / 2, y, z0 + run * t, w - 0.1, Math.abs(rise), Math.abs(run) + 0.02, mats.woodDark, false, true);
      } else {
        box(x0 + run * t, y, z0 + w / 2, Math.abs(run) + 0.02, Math.abs(rise), w - 0.1, mats.woodDark, false, true);
      }
    }
    if (axis === "z") {
      box(x0 + 0.06, (y0 + y1) / 2, (z0 + z1) / 2, 0.08, Math.abs(y1 - y0), Math.abs(along), mats.woodDark, true, false);
      box(x1 - 0.06, (y0 + y1) / 2, (z0 + z1) / 2, 0.08, Math.abs(y1 - y0), Math.abs(along), mats.woodDark, true, false);
    }
  }

  function lamp(x, y, z, color, intensity, dist, flicker) {
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 8, 8),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2 })
    );
    bulb.position.set(x, y, z);
    scene.add(bulb);
    const p = new THREE.PointLight(color, intensity, dist, 2);
    p.position.set(x, y, z);
    scene.add(p);
    lights.push(p);
    if (flicker) flickers.push({ light: p, bulb, base: intensity, t: Math.random() * 10 });
    return p;
  }

  function note(x, y, z, id) {
    const m = box(x, y, z, 0.18, 0.01, 0.24, mats.paperNote, false, false);
    interactables.push({ type: "note", id, mesh: m, pos: new THREE.Vector3(x, y, z) });
  }

  function tape(x, y, z, id) {
    const m = box(x, y, z, 0.16, 0.03, 0.1, mats.tape, false, false);
    interactables.push({ type: "tape", id, mesh: m, pos: new THREE.Vector3(x, y, z) });
  }

  function keyItem(x, y, z, id) {
    const m = box(x, y, z, 0.08, 0.02, 0.03, mats.metal, false, false);
    interactables.push({ type: "key", id, mesh: m, pos: new THREE.Vector3(x, y, z) });
  }

  function battery(x, y, z) {
    const m = box(x, y, z, 0.06, 0.06, 0.12, mats.metal, false, false);
    interactables.push({ type: "battery", mesh: m, pos: new THREE.Vector3(x, y, z) });
  }

  function hideCloset(x, y, z, rot, id) {
    box(x, y + 1.05, z, rot ? 0.7 : 1.1, 2.1, rot ? 1.1 : 0.7, mats.woodDark, true, true);
    const spot = {
      type: "hide",
      id,
      pos: new THREE.Vector3(x, y + 1.2, z),
      cam: new THREE.Vector3(x, y + 1.55, z),
      look: rot ? new THREE.Vector3(x + 1, y + 1.55, z) : new THREE.Vector3(x, y + 1.55, z + 1),
    };
    interactables.push(spot);
    hideSpots.push(spot);
  }

  function furnishGround() {
    // Foyer
    box(11.5, 0.4, 0.55, 1.4, 0.8, 0.36, mats.woodDark, true, true);
    note(11.15, 0.82, 0.55, "foyer");
    box(9.6, 1.1, 1.6, 0.12, 2.2, 0.12, mats.woodDark, true, true);
    box(13.3, 1.55, 2.0, 0.7, 1.1, 0.04, mats.photoFrame, true, false);
    lamp(11.5, 2.85, 2.0, 0xffcc88, 0.7, 8, true);

    // Living
    box(3.4, 0.42, 3.6, 2.6, 0.84, 1.05, mats.fabric, true, true);
    box(3.4, 0.92, 3.6, 2.4, 0.22, 0.85, mats.fabricDark, false, false);
    box(3.4, 0.28, 5.3, 1.2, 0.08, 0.7, mats.woodDark, true, true);
    box(1.15, 0.7, 4.2, 0.12, 1.4, 1.6, mats.woodDark, true, true);
    box(7.2, 0.55, 1.3, 1.4, 1.1, 0.55, mats.woodDark, true, true);
    const tv = box(7.2, 1.28, 1.3, 0.7, 0.46, 0.12, mats.screen, false, false);
    interactables.push({ type: "tv", mesh: tv, pos: tv.position.clone() });
    tape(7.55, 1.14, 1.55, 0);
    note(3.6, 0.34, 5.15, "living");
    box(1.4, 1.5, 8.4, 0.62, 0.8, 0.04, mats.photoFrame, false, false);
    lamp(4.2, 1.28, 7.4, 0xffd0a0, 1.1, 9, true);
    box(4.2, 0.55, 7.4, 0.18, 1.1, 0.18, mats.woodDark, true, true);

    // Dining
    box(19, 0.72, 3.6, 2.4, 0.08, 1.2, mats.woodLight, true, true);
    box(19, 0.36, 3.6, 0.12, 0.72, 0.12, mats.woodDark, true, false);
    for (const [x, z] of [[17.7, 2.9], [18.6, 2.9], [19.6, 2.9], [17.7, 4.3], [19.8, 4.4], [20.4, 3.0]]) {
      box(x, 0.46, z, 0.38, 0.92, 0.38, mats.woodDark, true, true);
    }
    box(22.6, 1.0, 1.4, 1.1, 2.0, 0.4, mats.woodDark, true, true);
    lamp(19, 2.7, 3.6, 0xffc070, 0.85, 8, true);

    // Kitchen
    box(15.55, 0.55, 12, 0.7, 1.1, 4.2, mats.tile, true, true);
    box(22.4, 0.55, 10.2, 2.2, 1.1, 0.7, mats.tile, true, true);
    box(23.2, 0.95, 13.6, 0.7, 1.9, 0.7, mats.metal, true, true);
    box(17.2, 0.55, 9.4, 1.4, 1.1, 0.7, mats.metal, true, true);
    note(16.4, 1.14, 11.2, "kitchen");
    battery(21.6, 1.14, 10.2);
    lamp(19.2, 2.92, 12.2, 0xddeeff, 0.9, 9, true);

    // Bath
    box(1.3, 0.32, 13.2, 1.6, 0.64, 0.72, mats.tile, true, true);
    box(3.6, 0.42, 11.3, 0.55, 0.84, 0.42, mats.tile, true, true);
    box(3.6, 1.15, 10.55, 0.7, 0.8, 0.04, mats.metal, false, false);
    battery(3.5, 0.88, 11.3);

    // Study
    box(6.9, 0.72, 12.6, 1.4, 0.08, 0.7, mats.woodDark, true, true);
    box(6.9, 0.36, 12.6, 0.1, 0.72, 0.1, mats.woodDark, true, false);
    box(6.3, 0.46, 13.5, 0.38, 0.92, 0.38, mats.woodDark, true, true);
    box(5.55, 1.2, 14.8, 0.9, 2.4, 0.32, mats.woodDark, true, true);
    tape(7.2, 0.8, 12.5, 1);
    note(6.5, 0.78, 12.4, "study");
    lamp(6.9, 1.22, 12.2, 0xffb060, 0.45, 6, true);

    // Hall closet
    hideCloset(10.2, 0, 8.6, false, "hall-closet");
    box(12.6, 0.7, 6.4, 0.4, 0.08, 0.4, mats.woodDark, true, false);
    const phone = box(12.6, 0.78, 6.4, 0.16, 0.08, 0.22, mats.metal, false, false);
    interactables.push({ type: "phone", mesh: phone, pos: phone.position.clone() });
    box(11.5, 1.6, 10.2, 0.55, 0.7, 0.03, mats.photoFrame, false, false);
  }

  function furnishUpper() {
    // Sister
    box(3.2, 0.32 + UPPER, 3.4, 2.0, 0.36, 1.4, mats.fabric, true, true);
    box(3.2, 0.58 + UPPER, 3.0, 0.7, 0.18, 0.4, mats.fabricDark, false, false);
    box(6.6, 0.7 + UPPER, 7.2, 1.2, 0.08, 0.6, mats.woodDark, true, true);
    box(6.6, 0.34 + UPPER, 7.2, 0.1, 0.68, 0.1, mats.woodDark, true, false);
    tape(6.9, 0.78 + UPPER, 7.05, 2);
    note(6.3, 0.76 + UPPER, 7.05, "sister");
    hideCloset(1.2, UPPER, 8.2, true, "sister-closet");
    box(0.7, 1.4 + UPPER, 2.2, 0.5, 0.7, 0.03, mats.photoFrame, false, false);
    lamp(4.4, 1.2 + UPPER, 6.2, 0xffc090, 0.35, 7, true);

    // Master
    box(19.2, 0.34 + UPPER, 4.2, 2.4, 0.4, 1.8, mats.fabricDark, true, true);
    box(19.2, 0.62 + UPPER, 3.6, 0.8, 0.2, 0.5, mats.fabric, false, false);
    box(16.2, 0.7 + UPPER, 1.6, 1.3, 1.4, 0.5, mats.woodDark, true, true);
    keyItem(16.4, 1.44 + UPPER, 1.6, "nursery");
    note(21.4, 0.58 + UPPER, 4.4, "master");
    hideCloset(22.6, UPPER, 8.2, true, "master-closet");
    lamp(19, 2.8 + UPPER, 5, 0xffd0a8, 0.28, 8, true);

    // Bath2
    box(1.4, 0.32 + UPPER, 13.4, 1.5, 0.64, 0.7, mats.tile, true, true);
    box(3.5, 0.42 + UPPER, 11.4, 0.5, 0.84, 0.4, mats.tile, true, true);

    // Closet room
    box(6.8, 1.0 + UPPER, 13.2, 0.4, 2.0, 1.8, mats.woodDark, true, true);
    battery(7.4, 0.2 + UPPER, 12.2);
    hideCloset(6.2, UPPER, 11.5, false, "up-closet");

    // Nursery
    box(18.4, 0.45 + UPPER, 13.2, 1.1, 0.9, 0.7, mats.woodLight, true, true);
    box(21.2, 0.5 + UPPER, 12.4, 0.55, 1.0, 0.55, mats.woodDark, true, true);
    keyItem(18.5, 0.95 + UPPER, 13.2, "cellar");
    note(20.2, 0.2 + UPPER, 14.4, "nursery");
    lamp(19.2, 2.7 + UPPER, 13, 0xffe0c0, 0.2, 6, true);

    // Upper hall
    box(11.5, 1.55 + UPPER, 8.5, 0.5, 0.65, 0.03, mats.photoFrame, false, false);
  }

  function furnishCellar() {
    const y = CELLAR;
    box(16.4, y + 0.7, 8.2, 1.6, 1.4, 0.5, mats.woodDark, true, true);
    box(20.2, y + 0.5, 7.4, 1.2, 1.0, 0.8, mats.metal, true, true);
    box(15.2, y + 0.2, 6.6, 0.9, 0.4, 0.7, mats.woodDark, true, true);
    tape(15.3, y + 0.42, 6.6, 3);
    note(11.4, y + 0.22, 7.1, "cellar");
    const album = box(10.4, y + 0.12, 6.2, 0.28, 0.04, 0.2, mats.album, false, false);
    interactables.push({ type: "album", mesh: album, pos: album.position.clone() });
    box(10.4, y + 0.18, 6.9, 0.5, 0.2, 0.5, mats.metal, true, true);
    lamp(16.2, y + 2.7, 9.2, 0xffaa66, 0.55, 9, true);
    lamp(10.8, y + 2.5, 6.4, 0xff6622, 0.2, 5, true);
  }

  function build(target) {
    scene = target;
    resetLists();

    SHTex.buildAll();
    mats.wood = SHTex.mat("wood", { roughness: 0.78, repeat: [1, 1] });
    mats.woodLight = SHTex.mat("woodLight", { roughness: 0.74 });
    mats.woodDark = SHTex.mat("wood", { roughness: 0.8, color: 0x6a4a32 });
    mats.tile = SHTex.mat("tile", { roughness: 0.28, metalness: 0.08 });
    mats.tileWall = SHTex.mat("tile", { roughness: 0.4, color: 0xc8c4b8 });
    mats.paper = SHTex.mat("paper", { roughness: 0.9 });
    mats.paperDark = SHTex.mat("paper", { roughness: 0.9, color: 0x8a7a68 });
    mats.stripe = SHTex.mat("stripe", { roughness: 0.88 });
    mats.plaster = SHTex.mat("plaster", { roughness: 0.92 });
    mats.concrete = SHTex.mat("concrete", { roughness: 0.95 });
    mats.brick = SHTex.mat("brick", { roughness: 0.9 });
    mats.fabric = SHTex.mat("fabric", { roughness: 0.86, color: 0x6a4034 });
    mats.fabricDark = SHTex.mat("fabric", { roughness: 0.88, color: 0x3a241c });
    mats.metal = SHTex.mat("metal", { roughness: 0.35, metalness: 0.7 });
    mats.door = SHTex.mat("door", { roughness: 0.72 });
    mats.photoFrame = SHTex.mat("photo", { roughness: 0.6 });
    mats.screen = new THREE.MeshStandardMaterial({ color: 0x111318, emissive: 0x223344, emissiveIntensity: 0.4, roughness: 0.3 });
    mats.paperNote = new THREE.MeshStandardMaterial({ color: 0xd8c49a, roughness: 0.85 });
    mats.tape = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.5, metalness: 0.2 });
    mats.album = new THREE.MeshStandardMaterial({ color: 0x3a1010, roughness: 0.7 });

    const gDoors = [
      { x: 11, z: 0, dir: "s", kind: "front", id: "front", locked: true },
      { x: 9, z: 1, dir: "w" },
      { x: 13, z: 1, dir: "e" },
      { x: 11, z: 3, dir: "n" },
      { x: 9, z: 6, dir: "w" },
      { x: 2, z: 9, dir: "n" },
      { x: 8, z: 13, dir: "e" },
      { x: 18, z: 7, dir: "n" },
      { x: 13, z: 11, dir: "e" },
      { x: 17, z: 13, dir: "e", kind: "door", id: "cellar-door", locked: true, key: "cellar" },
    ];
    const gWins = [
      { x: 2, z: 0, dir: "s" },
      { x: 6, z: 0, dir: "s" },
      { x: 0, z: 3, dir: "w" },
      { x: 0, z: 7, dir: "w" },
      { x: 17, z: 0, dir: "s" },
      { x: 21, z: 0, dir: "s" },
      { x: 23, z: 3, dir: "e" },
      { x: 23, z: 11, dir: "e" },
      { x: 19, z: 15, dir: "n" },
      { x: 2, z: 15, dir: "n" },
      { x: 6, z: 15, dir: "n" },
    ];
    buildFloor(groundGrid(), 0, GH, gDoors, gWins, 0, 0);
    stairs(9.15, 12.1, 13.85, 15.85, 0, UPPER, "z");

    const uDoors = [
      { x: 9, z: 6, dir: "w" },
      { x: 13, z: 6, dir: "e" },
      { x: 2, z: 9, dir: "n" },
      { x: 8, z: 13, dir: "e" },
      { x: 13, z: 12, dir: "e", kind: "door", id: "nursery-door", locked: true, key: "nursery" },
    ];
    const uWins = [
      { x: 2, z: 0, dir: "s" },
      { x: 6, z: 0, dir: "s" },
      { x: 0, z: 4, dir: "w" },
      { x: 17, z: 0, dir: "s" },
      { x: 22, z: 0, dir: "s" },
      { x: 23, z: 4, dir: "e" },
      { x: 23, z: 13, dir: "e" },
      { x: 18, z: 15, dir: "n" },
      { x: 2, z: 15, dir: "n" },
    ];
    buildFloor(upperGrid(), UPPER, GH, uDoors, uWins, 0, 0);

    const cDoors = [{ x: 10, z: 8, dir: "s" }, { x: 5, z: 5, dir: "e" }];
    buildFloor(cellarGrid(), CELLAR, 3.05, cDoors, [], 8, 4);
    stairs(18.2, 12.2, 23.6, 15.7, 0, CELLAR, "z");

    // Opening from kitchen into cellar stairwell: hole is implied by cellar door on north kitchen wall.
    furnishGround();
    furnishUpper();
    furnishCellar();

    for (let i = 0; i < interactables.length; i++) {
      const it = interactables[i];
      if (it.type === "door" && !it.locked) setDoorOpen(it, true);
    }

    // Exterior night box
    const night = new THREE.Mesh(
      new THREE.BoxGeometry(80, 30, 80),
      new THREE.MeshBasicMaterial({ color: 0x020308, side: THREE.BackSide })
    );
    night.position.set(12, 4, 8);
    scene.add(night);

    return {
      colliders,
      interactables,
      lights,
      flickers,
      rainPanes,
      waypoints,
      hideSpots,
      rooms,
      mats,
    };
  }

  function floorY(x, z, currentY) {
    if (x > 9.1 && x < 13.9 && z > 12.05 && z < 15.9 && currentY > CELLAR + 1.5) {
      const t = THREE.MathUtils.clamp((z - 12.1) / 3.7, 0, 1);
      return THREE.MathUtils.lerp(0, UPPER, t);
    }
    if (currentY < 1.55 && x > 18.15 && x < 23.85 && z > 12.05 && z < 15.95) {
      const t = THREE.MathUtils.clamp((z - 12.15) / 3.6, 0, 1);
      return THREE.MathUtils.lerp(0, CELLAR, t);
    }
    if (currentY < -0.8 && x >= 8 && x <= 24.2 && z >= 4 && z <= 16.2) return CELLAR;
    if (currentY > 2.2 && x >= 0 && x <= 24 && z >= 0 && z <= 16) return UPPER;
    return 0;
  }

  function setDoorOpen(item, open) {
    item.open = open;
    const ang = open ? (item.rot === 0 ? -1.7 : -1.7) : 0;
    item.mesh.rotation.y = (item.rot === 0 ? 0 : Math.PI / 2) + (open ? -1.65 : 0);
    if (item.collider) {
      if (open) {
        item.collider.off = true;
        item.collider.minx = 9999;
        item.collider.maxx = 9999;
        item.collider.minz = 9999;
        item.collider.maxz = 9999;
      } else if (item.rot === 0) {
        item.collider.off = false;
        item.collider.minx = item.wx - 0.52;
        item.collider.maxx = item.wx + 0.52;
        item.collider.minz = item.wz - 0.08;
        item.collider.maxz = item.wz + 0.08;
      } else {
        item.collider.off = false;
        item.collider.minx = item.wx - 0.08;
        item.collider.maxx = item.wx + 0.08;
        item.collider.minz = item.wz - 0.52;
        item.collider.maxz = item.wz + 0.52;
      }
    }
    void ang;
  }

  global.SHHouse = { build, floorY, setDoorOpen, R, GH, UPPER, CELLAR };
})(window);
