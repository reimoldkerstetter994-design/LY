(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const canvas = $("c");
  const grain = $("grain");
  const gctx = grain.getContext("2d");

  const ui = {
    title: $("title"),
    howto: $("howto"),
    intro: $("intro"),
    introLine: $("intro-line"),
    loading: $("loading"),
    clickStart: $("click-start"),
    pause: $("pause"),
    note: $("note"),
    dead: $("dead"),
    win: $("win"),
    hud: $("hud"),
    prompt: $("prompt"),
    sub: $("sub"),
    cross: $("crosshair"),
    hurt: $("hurt"),
    flash: $("flash"),
    staticFx: $("static-fx"),
    stamina: $("stamina-bar"),
    battery: $("battery-bar"),
    sanity: $("sanity-bar"),
    obj: $("obj"),
  };

  const keysDown = Object.create(null);
  const mouse = { x: 0, y: 0 };
  let sens = 1;
  let volume = 0.7;

  const game = {
    mode: "title",
    renderer: null,
    scene: null,
    camera: null,
    clock: null,
    audio: null,
    level: null,
    monster: null,
    textures: null,
    yaw: 0,
    pitch: 0,
    pos: new THREE.Vector3(),
    velY: 0,
    eye: 1.64,
    crouch: 0,
    bob: 0,
    stamina: 1,
    battery: 1,
    sanity: 1,
    lightOn: true,
    hiding: false,
    hideFrom: null,
    cards: { 1: false, 2: false, 3: false, 4: false },
    cardCount: 0,
    looking: null,
    subT: 0,
    footT: 0,
    locked: false,
    blackout: 0,
    events: {},
    scareFace: null,
    dying: false,
    won: false,
    dummy: new THREE.Object3D(),
    hallu: null,
    halluT: 0,
    spot: null,
    fill: null,
    torch: null,
    shake: 0,
    introI: 0,
    noiseRadius: 0,
    forward: new THREE.Vector3(),
  };

  function show(el) {
    el.classList.remove("hidden");
  }
  function hide(el) {
    el.classList.add("hidden");
  }
  function subtitle(text, dur) {
    ui.sub.textContent = text;
    ui.sub.style.opacity = "1";
    game.subT = dur || 3.2;
  }

  $("sens").addEventListener("input", (e) => {
    sens = parseFloat(e.target.value);
    $("sens-val").textContent = sens.toFixed(1);
  });
  $("vol").addEventListener("input", (e) => {
    volume = parseInt(e.target.value, 10) / 100;
    $("vol-val").textContent = Math.round(volume * 100) + "%";
    if (game.audio) game.audio.setVolume(volume);
  });

  $("btn-howto").onclick = () => {
    hide(ui.title);
    show(ui.howto);
  };
  $("btn-howto-back").onclick = () => {
    hide(ui.howto);
    show(ui.title);
  };
  $("btn-start").onclick = () => startFlow();
  $("btn-enter").onclick = () => enterWard();
  $("btn-resume").onclick = () => resumePlay();
  $("btn-restart-p").onclick = () => location.reload();
  $("btn-retry").onclick = () => location.reload();
  $("btn-again").onclick = () => location.reload();

  document.addEventListener("keydown", (e) => {
    keysDown[e.code] = true;
    if (e.code === "Escape") {
      if (game.mode === "note") closeNote();
      else if (game.mode === "play") pauseGame();
    }
    if (e.code === "KeyE") {
      if (game.mode === "note") closeNote();
      else if (game.mode === "play") interact();
    }
    if (e.code === "KeyF" && game.mode === "play") toggleLight();
    if (e.code === "KeyR" && (game.mode === "dead" || game.mode === "win")) location.reload();
  });
  document.addEventListener("keyup", (e) => {
    keysDown[e.code] = false;
  });

  canvas.addEventListener("click", () => {
    if (game.mode === "play" && !game.locked) lockPointer();
  });
  document.addEventListener("pointerlockchange", () => {
    game.locked = document.pointerLockElement === canvas;
    if (!game.locked && game.mode === "play") pauseGame();
  });
  document.addEventListener("mousemove", (e) => {
    if (!game.locked || game.mode !== "play" || game.hiding) return;
    game.yaw -= e.movementX * 0.0022 * sens;
    game.pitch -= e.movementY * 0.0022 * sens;
    game.pitch = Math.max(-1.2, Math.min(1.2, game.pitch));
  });

  function lockPointer() {
    canvas.requestPointerLock();
  }

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    grain.width = 180;
    grain.height = 120;
    if (!game.renderer) return;
    game.renderer.setSize(w, h, false);
    game.camera.aspect = w / h;
    game.camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  function paintGrain() {
    const w = grain.width;
    const h = grain.height;
    const img = gctx.createImageData(w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 40;
    }
    gctx.putImageData(img, 0, 0);
  }

  const INTRO = ["你在值班室醒来。", "表停在 2:17。", "走廊里，有人拖着步子。", "灯，不该亮着。"];

  async function startFlow() {
    hide(ui.title);
    show(ui.intro);
    if (!game.audio) game.audio = new WARD13.HorrorAudio();
    await game.audio.resume();
    game.audio.setVolume(volume);
    game.audio.startAmbient();
    game.audio.whisper();
    for (let i = 0; i < INTRO.length; i++) {
      ui.introLine.textContent = INTRO[i];
      ui.introLine.style.opacity = "0";
      ui.introLine.classList.remove("fade-in");
      void ui.introLine.offsetWidth;
      ui.introLine.classList.add("fade-in");
      await wait(i === INTRO.length - 1 ? 2200 : 1800);
    }
    hide(ui.intro);
    show(ui.loading);
    await wait(80);
    try {
      bootWorld();
    } catch (err) {
      ui.loading.textContent = "无法加载 3D 引擎。请检查网络后刷新。";
      console.error(err);
      return;
    }
    hide(ui.loading);
    show(ui.clickStart);
  }

  function enterWard() {
    hide(ui.clickStart);
    show(ui.hud);
    game.mode = "play";
    lockPointer();
    subtitle("找到四张权限卡。手电会暴露你。", 5);
    loop();
  }

  function wait(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function bootWorld() {
    if (typeof THREE === "undefined") throw new Error("THREE missing");
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.62;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x050304, 1);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050304);
    scene.fog = new THREE.FogExp2(0x070605, 0.055);

    const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.05, 80);
    camera.rotation.order = "YXZ";
    scene.add(camera);

    const hemi = new THREE.HemisphereLight(0x1a2228, 0x080403, 0.12);
    scene.add(hemi);
    const amb = new THREE.AmbientLight(0x0c0a09, 0.06);
    scene.add(amb);

    const textures = WARD13.createTextures();
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    Object.values(textures).forEach((t) => {
      if (t && t.anisotropy !== undefined) t.anisotropy = maxAniso;
    });

    const level = WARD13.buildLevel(scene, textures);
    const monster = new WARD13.Monster(level, textures);
    scene.add(monster.root);
    monster.onVocal = (chase) => game.audio && game.audio.monsterVocals(chase);

    const spot = new THREE.SpotLight(0xfff1d6, 28, 18, 0.38, 0.55, 1.6);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.camera.near = 0.2;
    spot.shadow.camera.far = 20;
    spot.shadow.bias = -0.0002;
    spot.position.set(0.12, -0.08, 0.05);
    const target = new THREE.Object3D();
    target.position.set(0.05, -0.12, -6);
    camera.add(spot);
    camera.add(target);
    spot.target = target;

    const fill = new THREE.PointLight(0xffe6c2, 0.15, 3.5, 2);
    fill.position.set(0.1, -0.1, -0.2);
    camera.add(fill);

    const torch = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({
      color: 0x6a6e72,
      roughness: 0.35,
      metalness: 0.8,
      envMap: textures.env,
    });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.22, 12), metal);
    body.rotation.z = Math.PI / 2;
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.05, 12), metal);
    head.rotation.z = Math.PI / 2;
    head.position.x = 0.12;
    const lens = new THREE.Mesh(
      new THREE.CircleGeometry(0.028, 16),
      new THREE.MeshBasicMaterial({ color: 0xfff6d8 })
    );
    lens.rotation.y = Math.PI / 2;
    lens.position.x = 0.146;
    torch.add(body);
    torch.add(head);
    torch.add(lens);
    torch.position.set(0.22, -0.2, -0.42);
    camera.add(torch);

    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 1.8),
      new THREE.MeshBasicMaterial({ map: textures.face, transparent: true, opacity: 0 })
    );
    face.position.set(0, 0, -0.7);
    face.visible = false;
    camera.add(face);

    const halluMat = new THREE.MeshStandardMaterial({
      color: 0x050505,
      roughness: 1,
      transparent: true,
      opacity: 0.55,
    });
    const hallu = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 1.5, 4, 8), halluMat);
    hallu.position.y = 1.1;
    hallu.visible = false;
    scene.add(hallu);

    game.renderer = renderer;
    game.scene = scene;
    game.camera = camera;
    game.clock = new THREE.Clock();
    game.textures = textures;
    game.level = level;
    game.monster = monster;
    game.spot = spot;
    game.fill = fill;
    game.torch = torch;
    game.scareFace = face;
    game.hallu = hallu;
    game.pos.set(level.spawn.x, 0, level.spawn.z);
    game.yaw = 0;
    game.pitch = 0.05;
    resize();
  }

  function pauseGame() {
    if (game.mode !== "play") return;
    game.mode = "pause";
    show(ui.pause);
    if (document.pointerLockElement) document.exitPointerLock();
  }

  function resumePlay() {
    hide(ui.pause);
    game.mode = "play";
    lockPointer();
  }

  function toggleLight() {
    if (game.battery <= 0) {
      subtitle("手电没电了。", 2);
      game.audio.click();
      return;
    }
    game.lightOn = !game.lightOn;
    game.audio.click();
  }

  function closestInteractable() {
    const origin = game.camera.position;
    game.camera.getWorldDirection(game.forward);
    let best = null;
    let bestScore = 1.6;
    for (const it of game.level.interactables) {
      if (it.taken) continue;
      const dx = it.position.x - origin.x;
      const dy = it.position.y - origin.y;
      const dz = it.position.z - origin.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > 2.1) continue;
      const nd = dist || 1;
      const dot = game.forward.x * (dx / nd) + game.forward.y * (dy / nd) + game.forward.z * (dz / nd);
      if (dot < 0.35 && dist > 1.1) continue;
      if (dist < bestScore) {
        bestScore = dist;
        best = it;
      }
    }
    return best;
  }

  function interact() {
    if (game.hiding) {
      game.hiding = false;
      subtitle("你从柜子里出来。", 2);
      return;
    }
    const it = game.looking;
    if (!it) return;
    if (it.type === "door") {
      game.level.toggleDoor(it.key);
      game.audio.door(game.level.doors[it.key].target > 0.5);
      game.noiseRadius = Math.max(game.noiseRadius, 11);
    } else if (it.type === "key") {
      game.cards[it.id] = true;
      game.cardCount++;
      it.taken = true;
      if (it.mesh) it.mesh.visible = false;
      $("slot" + it.id).classList.add("on");
      game.audio.pickup();
      subtitle("取得" + game.level.keyNames[it.id] + "（" + game.cardCount + "/4）", 3.4);
      ui.obj.textContent = game.cardCount >= 4 ? "目标：回到大门离开" : "目标：收集四张权限卡（" + game.cardCount + "/4）";
      if (game.cardCount === 3) {
        game.blackout = 3.2;
        game.audio.slam();
        subtitle("灯全灭了。", 3);
      }
      if (game.cardCount === 4) subtitle("四张卡齐了。快去大门。", 4);
    } else if (it.type === "note") {
      openNote(game.level.notes[it.id]);
    } else if (it.type === "battery") {
      it.taken = true;
      if (it.mesh) it.mesh.visible = false;
      game.battery = Math.min(1, game.battery + 0.48);
      game.audio.pickup();
      subtitle("手电电池更换了。", 2.4);
    } else if (it.type === "hide") {
      game.hiding = true;
      game.hideFrom = it.hidePos.clone();
      game.lightOn = false;
      subtitle("屏住呼吸。", 2);
    } else if (it.type === "exit") {
      if (game.cardCount >= 4) winGame();
      else subtitle("门锁着。还差 " + (4 - game.cardCount) + " 张权限卡。", 3);
    } else if (it.type === "phone") {
      game.audio.phone();
      subtitle("忙音。对面有人呼吸。", 4);
      it.label = "听筒还是温的";
    } else if (it.type === "mirror") {
      if (game.cardCount >= 2 && !game.events.mirror) {
        game.events.mirror = true;
        game.shake = 0.6;
        game.audio.sting();
        subtitle("镜子里多了一张脸。然后没有了。", 3.5);
      } else subtitle("水雾后面什么也没有。", 2);
    }
  }

  function openNote(note) {
    game.mode = "note";
    $("note-title").textContent = note.title;
    $("note-body").textContent = note.body;
    show(ui.note);
    if (document.pointerLockElement) document.exitPointerLock();
  }

  function closeNote() {
    hide(ui.note);
    game.mode = "play";
    lockPointer();
  }

  function die() {
    if (game.dying || game.won) return;
    game.dying = true;
    game.audio.sting();
    game.scareFace.visible = true;
    game.shake = 1.2;
    game.mode = "dead";
    if (document.pointerLockElement) document.exitPointerLock();
    ui.flash.style.opacity = "0.35";
    ui.staticFx.style.opacity = "0.8";
    setTimeout(() => {
      ui.flash.style.opacity = "0";
      hide(ui.hud);
      show(ui.dead);
    }, 1400);
  }

  function winGame() {
    if (game.won) return;
    game.won = true;
    game.mode = "win";
    game.audio.tone(220, "sine", 2.2, 0.08, 0.2, 880);
    if (document.pointerLockElement) document.exitPointerLock();
    ui.flash.style.background = "#f3eee6";
    ui.flash.style.opacity = "0";
    let t = 0;
    const fade = setInterval(() => {
      t += 0.04;
      ui.flash.style.opacity = String(Math.min(1, t));
      if (t >= 1) {
        clearInterval(fade);
        hide(ui.hud);
        show(ui.win);
      }
    }, 40);
  }

  function updatePlayer(dt) {
    const running = !!(keysDown.ShiftLeft || keysDown.ShiftRight) && game.stamina > 0.05 && !game.hiding;
    const crouchKey = !!(keysDown.ControlLeft || keysDown.ControlRight || keysDown.KeyC);
    const targetCrouch = crouchKey || game.hiding ? 1 : 0;
    game.crouch += (targetCrouch - game.crouch) * Math.min(1, dt * 8);
    game.eye = 1.64 - game.crouch * 0.62;

    let mx = 0;
    let mz = 0;
    if (keysDown.KeyW || keysDown.ArrowUp) mz -= 1;
    if (keysDown.KeyS || keysDown.ArrowDown) mz += 1;
    if (keysDown.KeyA || keysDown.ArrowLeft) mx -= 1;
    if (keysDown.KeyD || keysDown.ArrowRight) mx += 1;
    const moving = (mx || mz) && !game.hiding;
    const len = Math.hypot(mx, mz) || 1;
    mx /= len;
    mz /= len;
    const speed = game.hiding ? 0 : running ? 4.45 : crouchKey ? 1.15 : 2.32;
    const cy = Math.cos(game.yaw);
    const sy = Math.sin(game.yaw);
    const dx = (mx * cy + mz * sy) * speed * dt;
    const dz = (-mx * sy + mz * cy) * speed * dt;
    if (moving) game.level.moveWithCollision(game.pos, dx, dz, 0.28);

    if (game.hiding && game.hideFrom) {
      game.pos.x += (game.hideFrom.x - game.pos.x) * Math.min(1, dt * 6);
      game.pos.z += (game.hideFrom.z - game.pos.z) * Math.min(1, dt * 6);
    }

    if (running && moving) game.stamina = Math.max(0, game.stamina - dt * 0.22);
    else game.stamina = Math.min(1, game.stamina + dt * 0.14);

    if (moving) {
      game.bob += dt * (running ? 12 : 8);
      game.footT -= dt;
      if (game.footT <= 0) {
        game.footT = running ? 0.32 : crouchKey ? 0.7 : 0.48;
        game.audio.footstep(running, true);
      }
      game.noiseRadius = running ? 15 : crouchKey ? 2.4 : 7.2;
    } else {
      game.noiseRadius = game.hiding ? 1.2 : 3.2;
    }

    if (game.lightOn && game.battery > 0) {
      game.battery = Math.max(0, game.battery - dt * 0.0075);
      if (game.battery <= 0) {
        game.lightOn = false;
        subtitle("手电熄了。", 2.5);
      }
    }

    const dark = !game.lightOn || game.battery < 0.05;
    if (dark) game.sanity = Math.max(0, game.sanity - dt * 0.028);
    else game.sanity = Math.min(1, game.sanity + dt * 0.016);

    game.camera.rotation.order = "YXZ";
    game.camera.rotation.y = game.yaw;
    game.camera.rotation.x = game.pitch;
    const bobY = moving ? Math.sin(game.bob) * (running ? 0.05 : 0.028) : 0;
    const sway = moving ? Math.cos(game.bob * 0.5) * 0.012 : 0;
    game.camera.position.set(game.pos.x + sway, game.eye + bobY, game.pos.z);
    if (game.shake > 0) {
      game.camera.position.x += (Math.random() - 0.5) * game.shake * 0.12;
      game.camera.position.y += (Math.random() - 0.5) * game.shake * 0.08;
      game.shake = Math.max(0, game.shake - dt);
    }
    game.camera.rotation.z = Math.sin(game.bob * 0.5) * (moving ? 0.012 : 0);

    if (game.torch) {
      game.torch.rotation.x = Math.sin(game.bob) * 0.04;
      game.torch.rotation.y = Math.cos(game.bob * 0.5) * 0.03;
      game.torch.visible = true;
    }

    const flicker = game.battery < 0.18 && game.lightOn ? (Math.random() > 0.25 ? 1 : 0.15) : 1;
    const on = game.lightOn && game.battery > 0 ? flicker : 0;
    game.spot.intensity = 28 * on;
    game.fill.intensity = 0.18 * on;
    game.torch.children[2].material.color.set(on ? 0xfff6d8 : 0x221c12);

    const look = closestInteractable();
    game.looking = look;
    if (look) {
      ui.prompt.textContent = "E  " + (game.hiding ? "离开储物柜" : look.label);
      ui.prompt.style.opacity = "1";
      ui.cross.classList.add("hot");
    } else if (game.hiding) {
      ui.prompt.textContent = "E  离开储物柜";
      ui.prompt.style.opacity = "1";
    } else {
      ui.prompt.style.opacity = "0";
      ui.cross.classList.remove("hot");
    }
  }

  function maybeEvents(dt, info) {
    const p = game.pos;
    const cell = game.level.cell(p.x, p.z);

    if (!game.events.phone && cell.r >= 19 && cell.c >= 11 && cell.c <= 22) {
      game.events.phone = true;
      game.audio.phone();
      subtitle("前台的电话在响。", 3.5);
    }
    if (!game.events.or && cell.r <= 5 && cell.c >= 11 && cell.c <= 16) {
      game.events.or = true;
      game.audio.metal();
      game.audio.slam();
      game.shake = 0.4;
      subtitle("托盘倒了。墙上的血还没干。", 4);
    }
    if (!game.events.morgue && cell.r <= 5 && cell.c <= 8) {
      game.events.morgue = true;
      game.audio.whisper();
      subtitle("冷气从抽屉缝里漏出来。", 3.5);
    }

    if (Math.random() < dt * 0.08) game.audio.whisper();
    if (Math.random() < dt * 0.04) game.audio.metal();

    if (info.see) {
      game.sanity = Math.max(0, game.sanity - dt * 0.1);
      game.shake = Math.max(game.shake, 0.15);
    }

    game.halluT -= dt;
    if (game.sanity < 0.42 && game.halluT <= 0) {
      game.halluT = 8 + Math.random() * 8;
      const wp = game.level.waypoints[(Math.random() * game.level.waypoints.length) | 0];
      game.hallu.position.set(wp.x, 1.1, wp.z);
      game.hallu.visible = true;
    }
    if (game.hallu.visible) {
      const d = Math.hypot(game.hallu.position.x - p.x, game.hallu.position.z - p.z);
      if (d < 4.5) game.hallu.visible = false;
    }

    if (game.monster.state === "hunt" && info.dist < 8 && Math.random() < dt * 0.4) {
      subtitle(["它看见你了。", "别跑出声音。", "关灯。"][(Math.random() * 3) | 0], 1.8);
    }

    if (game.hiding && info.dist < 1.6 && game.monster.state === "hunt") {
      game.hiding = false;
      die();
    }
  }

  function updateHud(info) {
    ui.stamina.style.transform = "scaleX(" + game.stamina.toFixed(3) + ")";
    ui.battery.style.transform = "scaleX(" + game.battery.toFixed(3) + ")";
    ui.sanity.style.transform = "scaleX(" + game.sanity.toFixed(3) + ")";
    const near = Math.max(0, 1 - info.dist / 10);
    ui.hurt.style.opacity = String(near * (game.monster.state === "hunt" ? 0.7 : 0.25) + (1 - game.sanity) * 0.2);
    ui.staticFx.style.opacity = String((1 - game.sanity) * 0.35 + (game.dying ? 0.6 : 0));
    if (game.subT > 0) {
      game.subT -= 0.016;
      if (game.subT <= 0) ui.sub.style.opacity = "0";
    }
  }

  function loop() {
    requestAnimationFrame(loop);
    paintGrain();
    if (!game.renderer) return;
    const dt = Math.min(0.05, game.clock.getDelta());
    const t = game.clock.elapsedTime;

    if (game.mode === "play" || game.mode === "dead" || game.mode === "note" || game.mode === "pause") {
      game.blackout = Math.max(0, game.blackout - dt);
      game.level.updateDoors(dt);
      game.level.updateLights(t, game.blackout > 0);
      if (game.level.dust) {
        const arr = game.level.dust.geometry.attributes.position.array;
        for (let i = 0; i < arr.length; i += 3) {
          arr[i + 1] += Math.sin(t + i) * dt * 0.05;
          if (arr[i + 1] > 2.8) arr[i + 1] = 0.2;
        }
        game.level.dust.geometry.attributes.position.needsUpdate = true;
      }
    }

    if (game.mode === "play") {
      updatePlayer(dt);
      const info = game.monster.update(dt, game.pos, game.lightOn, game.noiseRadius, game.hiding);
      maybeEvents(dt, info);
      updateHud(info);
      if (info.dist < 1.32 && !game.hiding) die();

      game.camera.getWorldDirection(game.forward);
      const fear = Math.max(0, 1 - info.dist / 14) * (info.state === "hunt" ? 1 : 0.45) + (1 - game.sanity) * 0.3;
      game.audio.update(dt, fear, !!(keysDown.ShiftLeft && (keysDown.KeyW || keysDown.KeyA)), game.hiding, game.camera.position, game.monster.root.position, game.forward);
      game.renderer.toneMappingExposure = 0.52 + (game.lightOn ? 0.12 : 0) - (1 - game.sanity) * 0.08 + Math.sin(t * 1.3) * 0.01;
    } else if (game.mode === "dead") {
      const f = game.scareFace.material;
      f.opacity = Math.min(1, f.opacity + dt * 1.8);
      game.camera.lookAt(game.monster.root.position.x, 1.7, game.monster.root.position.z);
      game.shake = 0.8;
    }

    if (game.renderer) game.renderer.render(game.scene, game.camera);
  }
})();
