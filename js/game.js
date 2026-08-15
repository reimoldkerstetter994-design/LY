/* Stillhouse — first-person loop, player, story, UI. */
(function () {
  const NOTES = {
    foyer: {
      title: "门厅便条",
      body: "阿宁：\n钥匙我放在楼上主卧梳妆台。\n如果钟又停在 3:07，不要应门。\n——妈",
    },
    living: {
      title: "发黄的剪报",
      body: "林宅夜半失火？邻居称听见女人在雨里数数。\n警方未发现第二具遗体。\n（页边用铅笔写：它不是被烧出来的。）",
    },
    kitchen: {
      title: "购物清单",
      body: "米  酱油  蜡烛  电池\n镜子 —— 划掉了，又写：不要再买镜子。\n底下一行被水泡开：它会从反光里学会脸。",
    },
    study: {
      title: "未寄出的信",
      body: "哥，别回来。\n我把育儿室锁了。那里的摇篮自己会响。\n录音带在书桌第二层。\n如果走廊尽头有人朝你招手，那不是我。",
    },
    sister: {
      title: "日记 · 三月七日",
      body: "它学会开门了。\n不是撬锁，是先听，再模仿我们转动把手的节奏。\n今晚手电只剩一格。我把最后一盘带子藏在地下室工作台。",
    },
    master: {
      title: "相框背面",
      body: "1998 年春。全家还在。\n（另一行新墨水）\n她说房间里有第二个孩子。我们不该答应让它留下。",
    },
    nursery: {
      title: "发黄的儿歌",
      body: "一盏灯，两只手，三更天，门后有人走。\n摇篮下面压着地下室的钥匙。\n唱完第四段就不要再看窗帘。",
    },
    cellar: {
      title: "焦黑的纸",
      body: "把相册放进铁盆。烧掉它记得的脸。\n火灭之前正门会认你。\n跑。不要回头数它的脚步。",
    },
  };

  const TAPES = [
    [
      "……哥，是我。别回家。",
      "它已经学会开门了。",
      "钟停的时候，它站在你身后。",
    ],
    [
      "这是林宅，三月七日，凌晨。",
      "我把声音录下来，好证明我没疯。",
      "你听……它在用我的呼吸。",
    ],
    [
      "墙里有人跟着我数数。",
      "一、二、三……它漏了四。",
      "四是门厅。四是正门。四是出口。",
    ],
    [
      "……你终于下来了。",
      "相册还认得你们。烧掉它。",
      "然后跑。我不能再帮你开门了。",
    ],
  ];

  const INTRO = [
    "雨把整条路按进泥里。",
    "林宅的门铃坏了。门却虚掩着。",
    "屋里的钟，全部停在 3:07。",
    "你听见楼板上面，有人在学你的脚步。",
  ];

  let renderer, scene, camera, clock;
  let world = null;
  let state = "title";
  let yaw = 0;
  let pitch = 0;
  let keys = {};
  let sensitivity = 1;
  let stamina = 1;
  let battery = 1;
  let sanity = 1;
  let flashOn = false;
  let crouch = false;
  let hiding = false;
  let hideSpot = null;
  let tapes = [false, false, false, false];
  let keysGot = { nursery: false, cellar: false };
  let albumBurned = false;
  let notesRead = 0;
  let phoneRang = false;
  let playTime = 0;
  let footT = 0;
  let bob = 0;
  let hurt = 0;
  let flash = 0;
  let thunderT = 8;
  let lookEntity = 0;
  let subtitleT = 0;
  let objText = "";
  let raycaster = null;
  let flashLight, ambient, hemi, moon;
  let grainCtx, grainTile;
  let dust = null;
  let nearHunter = 0;
  let looping = false;

  const player = {
    pos: new THREE.Vector3(11.5, 0, 2.15),
    radius: 0.22,
    get flashOn() { return flashOn; },
    get running() { return keys.Shift && stamina > 0.05 && !crouch && !hiding; },
    get crouch() { return crouch; },
    get hiding() { return hiding; },
  };

  function $(id) {
    return document.getElementById(id);
  }

  function show(id, on) {
    $(id).classList.toggle("hidden", !on);
  }

  function setSub(text, dur) {
    $("subtitle").textContent = text || "";
    subtitleT = dur || 0;
  }

  function setObj(text) {
    objText = text;
    $("objective").textContent = text;
  }

  function refreshInv() {
    for (let i = 0; i < 4; i++) $("inventory").querySelector(`[data-k="t${i}"]`).classList.toggle("on", tapes[i]);
    $("inventory").querySelector('[data-k="nursery"]').classList.toggle("on", keysGot.nursery);
    $("inventory").querySelector('[data-k="cellar"]').classList.toggle("on", keysGot.cellar);
  }

  function updateObjective() {
    const n = tapes.filter(Boolean).length;
    if (!albumBurned) {
      if (n < 4) setObj(`找到四盘录音带（${n}/4）。弄清楚这座房子还住着什么。`);
      else if (!keysGot.nursery) setObj("四盘带子齐了。去主卧找育儿室的钥匙。");
      else if (!keysGot.cellar) setObj("打开楼上的育儿室，取出地下室钥匙。");
      else setObj("下到地下室。烧掉那本还在呼吸的相册。");
    } else {
      setObj("正门开了。别回头。跑。");
    }
  }

  function boot() {
    const canvas = $("view");
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.72;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05060a);
    scene.fog = new THREE.FogExp2(0x07080c, 0.072);

    camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.06, 80);
    clock = new THREE.Clock();
    raycaster = new THREE.Raycaster();

    ambient = new THREE.AmbientLight(0x2a241c, 0.28);
    scene.add(ambient);
    hemi = new THREE.HemisphereLight(0x2a3344, 0x120c08, 0.32);
    scene.add(hemi);
    moon = new THREE.DirectionalLight(0x6a7a99, 0.2);
    moon.position.set(-8, 18, -6);
    scene.add(moon);

    flashLight = new THREE.SpotLight(0xffe6bf, 0, 18, 0.55, 0.42, 1.15);
    flashLight.castShadow = true;
    flashLight.shadow.mapSize.set(1024, 1024);
    flashLight.shadow.camera.near = 0.2;
    flashLight.shadow.camera.far = 18;
    scene.add(flashLight);
    scene.add(flashLight.target);

    dust = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({ color: 0xccb898, size: 0.01, transparent: true, opacity: 0.14, depthWrite: false, sizeAttenuation: true })
    );
    const dpos = new Float32Array(420 * 3);
    for (let i = 0; i < 420; i++) {
      dpos[i * 3] = (Math.random() - 0.5) * 2.8;
      dpos[i * 3 + 1] = (Math.random() - 0.5) * 1.8;
      dpos[i * 3 + 2] = -Math.random() * 6;
    }
    dust.geometry.setAttribute("position", new THREE.BufferAttribute(dpos, 3));
    camera.add(dust);
    const fill = new THREE.PointLight(0x9aa6b8, 0.55, 4.5, 2);
    fill.position.set(0, 0.05, 0.1);
    camera.add(fill);
    scene.add(camera);

    grainTile = SHTex.filmGrainCanvas();
    grainCtx = $("grain").getContext("2d");
    resizeGrain();

    bindUI();
    window.addEventListener("resize", onResize);
    requestAnimationFrame(drawTitleGrain);
  }

  function drawTitleGrain() {
    if (state === "title" || state === "howto") {
      paintGrain(0.12);
      requestAnimationFrame(drawTitleGrain);
    }
  }

  function resizeGrain() {
    const g = $("grain");
    g.width = innerWidth;
    g.height = innerHeight;
  }

  function paintGrain(a) {
    if (!grainCtx) return;
    grainCtx.globalAlpha = a;
    const s = 256;
    for (let y = 0; y < innerHeight; y += s) {
      for (let x = 0; x < innerWidth; x += s) {
        grainCtx.drawImage(grainTile, x, y);
      }
    }
  }

  function bindUI() {
    $("sens").addEventListener("input", () => {
      sensitivity = parseFloat($("sens").value);
      $("sens-val").textContent = sensitivity.toFixed(2);
    });
    $("vol").addEventListener("input", () => {
      const v = parseInt($("vol").value, 10);
      $("vol-val").textContent = v + "%";
      SHAudio.setVolume(v / 100);
    });
    $("btn-start").onclick = () => startIntro();
    $("btn-howto").onclick = () => {
      show("title", false);
      show("howto", true);
    };
    $("btn-howto-back").onclick = () => {
      show("howto", false);
      show("title", true);
    };
    $("btn-lock").onclick = () => lockPointer();
    $("btn-resume").onclick = () => resumePlay();
    $("btn-quit").onclick = () => location.reload();
    $("btn-retry").onclick = () => location.reload();
    $("btn-again").onclick = () => location.reload();
    $("btn-note-close").onclick = () => closeNote();
    $("btn-tape-skip").onclick = () => closeTape();

    document.addEventListener("keydown", onKey);
    document.addEventListener("keyup", (e) => { keys[e.key] = false; keys[e.code] = false; });
    document.addEventListener("mousemove", onMouse);
    document.addEventListener("pointerlockchange", () => {
      if (state === "play" && document.pointerLockElement !== $("view")) pauseGame();
    });
    $("view").addEventListener("click", () => {
      if (state === "play" && document.pointerLockElement !== $("view")) lockPointer();
    });
  }

  function onKey(e) {
    keys[e.key] = true;
    keys[e.code] = true;
    if (e.code === "KeyF" && (state === "play" || state === "hide")) toggleFlash();
    if (e.code === "KeyE" && state === "play") tryUse();
    if (e.code === "KeyE" && state === "hide") leaveHide();
    if ((e.code === "ControlLeft" || e.code === "KeyC") && state === "play") crouch = !crouch;
    if (e.code === "Escape") {
      if (state === "note") closeNote();
      else if (state === "tape") closeTape();
      else if (state === "play") pauseGame();
    }
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
  }

  function onMouse(e) {
    if (document.pointerLockElement !== $("view")) return;
    if (state !== "play" && state !== "hide") return;
    yaw -= e.movementX * 0.0022 * sensitivity;
    pitch -= e.movementY * 0.0022 * sensitivity;
    const max = state === "hide" ? 0.45 : 1.35;
    pitch = Math.max(-max, Math.min(max, pitch));
  }

  function startIntro() {
    SHAudio.resume();
    SHAudio.startBed();
    SHAudio.click();
    show("title", false);
    show("howto", false);
    show("intro", true);
    let i = 0;
    $("intro-line").textContent = INTRO[0];
    const tick = () => {
      i++;
      if (i >= INTRO.length) {
        show("intro", false);
        show("loading", true);
        setTimeout(buildWorld, 80);
        return;
      }
      $("intro-line").style.opacity = "0";
      setTimeout(() => {
        $("intro-line").textContent = INTRO[i];
        $("intro-line").style.opacity = "1";
        setTimeout(tick, 1700);
      }, 280);
    };
    setTimeout(tick, 1800);
  }

  function buildWorld() {
    world = SHHouse.build(scene);
    SHHunter.create(scene);
    player.pos.set(11.5, 0, 2.15);
    yaw = Math.PI;
    pitch = 0.04;
    show("loading", false);
    show("click-lock", true);
    state = "needlock";
  }

  function lockPointer() {
    SHAudio.resume();
    SHAudio.startBed();
    $("view").requestPointerLock();
    show("click-lock", false);
    show("pause", false);
    show("hud", true);
    state = "play";
    flashOn = true;
    updateObjective();
    if (!looping) {
      setSub("门在你身后合上了。屋里比雨声更安静。", 4.5);
      looping = true;
      clock.getDelta();
      requestAnimationFrame(frame);
    }
  }

  function pauseGame() {
    if (state !== "play" && state !== "hide") return;
    state = "pause";
    show("pause", true);
  }

  function resumePlay() {
    show("pause", false);
    show("click-lock", true);
    state = "needlock";
  }

  function toggleFlash() {
    if (battery <= 0) {
      flashOn = false;
      setSub("手电没电了。黑暗开始发黏。", 2.4);
      return;
    }
    flashOn = !flashOn;
    SHAudio.click();
  }

  function blocked(x, z, y) {
    const r = player.radius;
    for (let i = 0; i < world.colliders.length; i++) {
      const b = world.colliders[i];
      if (b.off) continue;
      if (y + 1.5 < b.miny || y + 0.15 > b.maxy) continue;
      const cx = Math.max(b.minx, Math.min(x, b.maxx));
      const cz = Math.max(b.minz, Math.min(z, b.maxz));
      const dx = x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }

  function move(dt) {
    if (hiding) return;
    const running = player.running;
    const spd = crouch ? 1.15 : running ? 4.55 : 2.45;
    if (running) stamina = Math.max(0, stamina - dt * 0.28);
    else stamina = Math.min(1, stamina + dt * 0.18);

    const f = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const r = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    let wish = new THREE.Vector3();
    if (keys.KeyW || keys.ArrowUp) wish.add(f);
    if (keys.KeyS || keys.ArrowDown) wish.sub(f);
    if (keys.KeyA || keys.ArrowLeft) wish.sub(r);
    if (keys.KeyD || keys.ArrowRight) wish.add(r);
    const moving = wish.lengthSq() > 0;
    if (moving) wish.normalize().multiplyScalar(spd * dt);

    const y = player.pos.y;
    if (wish.x) {
      const nx = player.pos.x + wish.x;
      if (!blocked(nx, player.pos.z, y)) player.pos.x = nx;
    }
    if (wish.z) {
      const nz = player.pos.z + wish.z;
      if (!blocked(player.pos.x, nz, y)) player.pos.z = nz;
    }
    player.pos.y = SHHouse.floorY(player.pos.x, player.pos.z, player.pos.y);

    if (moving) {
      footT -= dt;
      if (footT <= 0) {
        footT = running ? 0.32 : crouch ? 0.62 : 0.46;
        const tile = (player.pos.x > 14 && player.pos.z > 8 && player.pos.y < 0.4) || (player.pos.x < 5 && player.pos.z > 10);
        SHAudio.foot(player.pos.y < -0.5 ? "concrete" : tile ? "tile" : "wood", running);
      }
      bob += dt * (running ? 14 : 9);
    }
  }

  function lookDir() {
    const e = new THREE.Euler(pitch, yaw, 0, "YXZ");
    return new THREE.Vector3(0, 0, -1).applyEuler(e);
  }

  function closestUse() {
    const dir = lookDir();
    const origin = camera.position;
    let best = null;
    let bestD = 2.05;
    for (const it of world.interactables) {
      if (it.taken) continue;
      const d = it.pos.distanceTo(player.pos);
      if (d > 2.1) continue;
      const to = it.pos.clone().sub(origin);
      if (to.length() < 0.2) {
        best = it;
        bestD = 0;
        continue;
      }
      const ang = dir.angleTo(to);
      if (ang < 0.72 && d < bestD + 0.15) {
        best = it;
        bestD = d;
      }
    }
    return best;
  }

  function promptFor(it) {
    if (!it) return "";
    if (it.type === "note") return "E  阅读";
    if (it.type === "tape") return "E  播放录音带";
    if (it.type === "key") return "E  拾取钥匙";
    if (it.type === "battery") return "E  更换电池";
    if (it.type === "hide") return hiding ? "E  离开衣柜" : "E  躲进衣柜";
    if (it.type === "album") return albumBurned ? "" : "E  烧掉相册";
    if (it.type === "front") return albumBurned ? "E  推开正门" : "门锁死了。它还记得这张脸。";
    if (it.type === "door" || it.kind === "door") {
      if (it.locked) {
        if (it.key && keysGot[it.key]) return "E  使用钥匙";
        return "锁着。缺一把合适的钥匙。";
      }
      return it.open ? "E  关门" : "E  开门";
    }
    if (it.type === "phone") return phoneRang ? "话筒里只剩雨声。" : "E  拿起听筒";
    if (it.type === "tv") return "雪花里像有一张脸。";
    return "E  交互";
  }

  function tryUse() {
    const it = closestUse();
    if (!it) return;
    if (it.type === "note") openNote(it);
    else if (it.type === "tape") playTape(it);
    else if (it.type === "key") takeKey(it);
    else if (it.type === "battery") takeBattery(it);
    else if (it.type === "hide") enterHide(it);
    else if (it.type === "album") burnAlbum();
    else if (it.type === "front") tryFront();
    else if (it.type === "door" || it.kind === "door") toggleDoor(it);
    else if (it.type === "phone") {
      setSub(phoneRang ? "只有电流。像有人把嘴贴在话筒上。" : "没人说话。但有人在听。", 3.5);
      SHAudio.whisper();
    }
    else if (it.type === "tv") setSub("雪花突然聚成一只眼睛，又散掉。", 3);
  }

  function openNote(it) {
    notesRead++;
    show("note-layer", true);
    $("note-title").textContent = NOTES[it.id].title;
    $("note-body").textContent = NOTES[it.id].body;
    state = "note";
    document.exitPointerLock();
    sanity = Math.min(1, sanity + 0.04);
  }

  function closeNote() {
    show("note-layer", false);
    show("click-lock", true);
    state = "needlock";
  }

  function playTape(it) {
    tapes[it.id] = true;
    it.taken = true;
    if (it.mesh) it.mesh.visible = false;
    refreshInv();
    updateObjective();
    SHAudio.pickup();
    SHAudio.tapeHiss(true);
    show("tape-layer", true);
    state = "tape";
    document.exitPointerLock();
    const lines = TAPES[it.id];
    let i = 0;
    $("tape-line").textContent = lines[0];
    playTape._iv && clearInterval(playTape._iv);
    playTape._iv = setInterval(() => {
      i++;
      if (i >= lines.length) {
        closeTape();
        return;
      }
      $("tape-line").textContent = lines[i];
    }, 2600);
    if (it.id === 0) {
      setTimeout(() => SHHunter.wake(), 800);
    }
    sanity = Math.min(1, sanity + 0.08);
  }

  function closeTape() {
    if (playTape._iv) clearInterval(playTape._iv);
    SHAudio.tapeHiss(false);
    show("tape-layer", false);
    show("click-lock", true);
    state = "needlock";
    const n = tapes.filter(Boolean).length;
    if (n === 1) setSub("楼板上面，有什么东西改用双脚落地。", 4);
    if (n === 4) setSub("四盘带子。故事补完了。该上楼。", 4);
  }

  function takeKey(it) {
    keysGot[it.id] = true;
    it.taken = true;
    if (it.mesh) it.mesh.visible = false;
    SHAudio.pickup();
    refreshInv();
    updateObjective();
    setSub(it.id === "nursery" ? "一把小钥匙。齿上还留着牙印。" : "铁钥匙。摸起来是湿的。", 3.2);
  }

  function takeBattery(it) {
    it.taken = true;
    if (it.mesh) it.mesh.visible = false;
    battery = Math.min(1, battery + 0.38);
    SHAudio.pickup();
    setSub("电池还是温的。像刚从谁手里拿下来。", 3);
  }

  function toggleDoor(it) {
    if (it.locked) {
      if (it.key && keysGot[it.key]) {
        it.locked = false;
        SHAudio.door(true);
        SHHouse.setDoorOpen(it, true);
        setSub(it.id === "nursery-door" ? "育儿室的气味先涌出来。像奶，又像潮土。" : "地下室的冷气贴着脚踝往上爬。", 3.4);
        return;
      }
      setSub("锁芯是反的。它从里面锁上了。", 2.4);
      return;
    }
    SHHouse.setDoorOpen(it, !it.open);
    SHAudio.door(it.open);
  }

  function enterHide(it) {
    hiding = true;
    hideSpot = it;
    flashOn = false;
    state = "hide";
    setSub("你把呼吸咬在牙里。", 2.2);
  }

  function leaveHide() {
    hiding = false;
    hideSpot = null;
    state = "play";
    setSub("", 0);
  }

  function burnAlbum() {
    if (albumBurned) return;
    if (tapes.filter(Boolean).length < 4) {
      setSub("火点不着。你还没听完它要你听的话。", 3.2);
      return;
    }
    albumBurned = true;
    const album = world.interactables.find((x) => x.type === "album");
    if (album && album.mesh) album.mesh.visible = false;
    const front = world.interactables.find((x) => x.type === "front" || x.id === "front");
    if (front) front.locked = false;
    SHHunter.enrage();
    SHAudio.stinger();
    flash = 0.8;
    updateObjective();
    setSub("相册蜷缩着烧起来。楼上，正门的锁响了一声。", 4.5);
  }

  function tryFront() {
    if (!albumBurned) {
      setSub("把手是热的。外面在敲，节奏和你的心跳一样。", 3.2);
      return;
    }
    winGame();
  }

  function winGame() {
    state = "ending";
    document.exitPointerLock();
    show("hud", false);
    show("ending", true);
    const n = notesRead;
    $("ending-body").textContent =
      "你冲进雨里。房子在背后把灯一盏盏点亮，像在送行，又像在记住你的背影。\n\n" +
      (n >= 6 ? "你把故事听完了。所以它没有跟上。今晚不会。\n" : "有些房间你没进去。它会把空位留给下一次。\n") +
      "雨还在下。钟，大概仍停在 3:07。";
  }

  function die(reason) {
    state = "dead";
    document.exitPointerLock();
    show("hud", false);
    show("dead", true);
    SHAudio.stinger();
    if (reason === "sanity") {
      $("dead-title").textContent = "你把灯当成了眼睛";
      $("dead-body").textContent = "神智先于身体离开。你开始跟着它数门。数到第四扇时，那扇门从里面长出了你的脸。";
    } else {
      $("dead-title").textContent = "它比你更熟悉这栋房子";
      $("dead-body").textContent = "它没有跑。它只是出现在你转身的角度里。手电照到的不是脸，是一口会呼吸的黑。";
    }
  }

  function updateUsePrompt() {
    const it = state === "play" ? closestUse() : hideSpot;
    $("prompt").textContent = promptFor(it);
  }

  function updateMeters() {
    $("bar-stamina").style.transform = `scaleX(${stamina})`;
    $("bar-battery").style.transform = `scaleX(${battery})`;
    $("bar-sanity").style.transform = `scaleX(${sanity})`;
  }

  function events(dt) {
    playTime += dt;
    thunderT -= dt;
    if (thunderT <= 0) {
      thunderT = 11 + Math.random() * 16;
      SHAudio.thunder();
      flash = 0.55 + Math.random() * 0.35;
    }
    if (!phoneRang && playTime > 52) {
      phoneRang = true;
      setSub("厅里的电话响了。只响一声。", 3.5);
      SHAudio.whisper();
    }
    if (Math.random() < dt * 0.04 && sanity < 0.55) SHAudio.whisper();

    world.flickers.forEach((f) => {
      f.t += dt;
      const k = 0.55 + Math.sin(f.t * 7.3) * 0.12 + (Math.random() < 0.02 ? -0.4 : 0);
      f.light.intensity = f.base * Math.max(0.05, k);
    });
    world.rainPanes.forEach((p) => {
      if (p.material.map) p.material.map.offset.y += dt * 0.42;
    });
  }

  function applySanity(dt, info) {
    if (flashOn) battery = Math.max(0, battery - dt * 0.018);
    if (battery <= 0) flashOn = false;

    let drain = 0;
    if (!flashOn) drain += 0.012;
    if (info.seeing) drain += 0.05;
    if (info.near > 0.45) drain += 0.02;
    if (player.pos.y < -1) drain += 0.006;
    if (hiding) drain *= 0.35;
    sanity = Math.max(0, Math.min(1, sanity - drain * dt + (flashOn ? dt * 0.004 : 0)));

    if (info.seeing) lookEntity += dt;
    else lookEntity = Math.max(0, lookEntity - dt * 0.6);

    if (sanity <= 0) die("sanity");
  }

  function camRig(dt, info) {
    const eye = crouch || hiding ? 1.12 : 1.64;
    const breathe = Math.sin(playTime * 1.5) * 0.012;
    const hb = Math.sin(bob) * 0.03;
    if (hiding && hideSpot) {
      camera.position.copy(hideSpot.cam);
      camera.position.y += breathe;
    } else {
      camera.position.set(player.pos.x, player.pos.y + eye + breathe + hb, player.pos.z);
    }
    camera.rotation.set(pitch, yaw, Math.sin(bob * 0.5) * 0.012 + (info.near * 0.03), "YXZ");
    camera.fov = THREE.MathUtils.damp(camera.fov, 72 + (player.running ? 6 : 0) + (1 - sanity) * 8, 6, dt);
    camera.updateProjectionMatrix();

    const dir = lookDir();
    flashLight.position.copy(camera.position).add(dir.clone().multiplyScalar(0.12));
    flashLight.target.position.copy(camera.position).add(dir.multiplyScalar(8));
    flashLight.intensity = flashOn ? 4.6 + Math.sin(playTime * 27) * 0.1 : 0;
    dust.material.opacity = flashOn ? 0.28 : 0.04;

    scene.fog.density = 0.055 + (1 - sanity) * 0.05 + info.near * 0.03;
    renderer.toneMappingExposure = 0.68 + flash * 1.4 - (1 - sanity) * 0.12;

    $("hurt").style.opacity = String(Math.min(0.85, hurt + info.near * 0.25 * (info.seeing ? 1 : 0.3)));
    $("flash").style.opacity = String(flash);
    $("static-fx").style.opacity = String((1 - sanity) * 0.35 + (lookEntity > 1.2 ? 0.2 : 0));
    $("blood-edge").style.boxShadow = `inset 0 0 140px ${30 + (1 - sanity) * 40}px rgba(80,0,0,${(1 - sanity) * 0.45})`;
    $("rain-glass").style.opacity = player.pos.z < 1.2 && player.pos.y > -0.2 ? "0.35" : "0.08";
    paintGrain(0.07 + (1 - sanity) * 0.08);

    flash = Math.max(0, flash - dt * 1.6);
    hurt = Math.max(0, hurt - dt * 0.8);
    if (subtitleT > 0) {
      subtitleT -= dt;
      if (subtitleT <= 0) $("subtitle").textContent = "";
    }
  }

  function frame() {
    if (state === "dead" || state === "ending" || state === "title") return;
    const dt = Math.min(0.05, clock.getDelta());
    if (state === "play" || state === "hide") {
      move(dt);
      const info = SHHunter.update(dt, player, world);
      nearHunter = info.near;
      if (info.catching) {
        hurt = 1;
        die("caught");
        return;
      }
      if (info.near > 0.7 && Math.random() < dt * 0.15) setSub("它的关节，响得像湿木头。", 1.6);
      applySanity(dt, info);
      events(dt);
      camRig(dt, info);
      updateUsePrompt();
      updateMeters();
      SHAudio.update(dt, info.near, 1 - sanity, hiding);
      renderer.render(scene, camera);
    } else if (state === "note" || state === "tape" || state === "pause" || state === "needlock") {
      paintGrain(0.1);
    }
    requestAnimationFrame(frame);
  }

  function onResize() {
    if (!renderer) return;
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    resizeGrain();
  }

  window.addEventListener("load", boot);
})();
