/* Blacktide — first-person loop, story, weather, UI. */
(function () {
  const NOTES = {
    lobby: {
      title: "前台便条",
      body: "夜班：潮位表又停在 3:13。\n不要给 204 的电话接线。\n如果旋转门自己转，不要跟着出去。\n——老周",
    },
    dining: {
      title: "发黄菜单",
      body: "今日例汤：海带、骨头、雨。\n（页边）客人说汤里有头发。\n不是头发。是它从下水道爬上来时掉的。",
    },
    kitchen: {
      title: "后厨字条",
      body: "冷库锁了。里面的东西在敲门。\n厨师长说那是管子。\n管子不会喊我的乳名。",
    },
    office: {
      title: "经理日志 · 末页",
      body: "201 的旅客把锅炉钥匙还到前台。\n我没敢收。钥匙是湿的，还在滴。\n谁来谁就自己上楼拿。",
    },
    lounge: {
      title: "收音机旁",
      body: "台风预警循环了十七遍。\n第十八遍换成一个女声：\n「哥，你已经站在大厅了。」",
    },
    r201: {
      title: "201 留言",
      body: "浴室镜子里多了一个人。\n它先学会我刷牙的顺序，再学会开门。\n钥匙我塞在枕头下面。别回头看洗手台。",
    },
    r203: {
      title: "203 日记",
      body: "走廊地毯每天早上一条新的水印。\n从楼梯到我的门。\n脚印只有一只。另一只还在海里。",
    },
    r204: {
      title: "妹妹的字",
      body: "哥，别来。\n水已经进到墙里了。\n它会用我的声音叫你。如果你听见我笑，那不是我。",
    },
    r205: {
      title: "潮位抄表",
      body: "3:13  内涝\n3:13  内涝\n3:13  它在前台\n3:13  别开手电",
    },
    boiler: {
      title: "焦黑检修单",
      body: "锅炉不该在涨潮时点火。\n火一亮，它就知道谁还活着。\n小艇钥匙挂在阀门上。跑。",
    },
    pier: {
      title: "码头告示",
      body: "栈桥只在潮水回头时出现。\n带钥匙的人可以走。\n回头的人把脸留给旅馆。",
    },
  };

  const LOGS = [
    ["旅客 118：雨下进了房间。", "我把毛巾塞进门缝。", "门缝外面有人用毛巾的节奏敲门。"],
    ["餐厅的钟停了。", "侍应生说：钟停的时候不要点汤。", "汤会记住你的名字。"],
    ["203。我把脚步录下来。", "回放时多出一串。", "那串脚步比我先到门口。"],
    ["……哥，是我。", "别开 204 的灯。", "我把最后一句留在潮水里：逃走，不要应声。"],
  ];

  const INTRO = [
    "台风把整条海路按进黑里。",
    "黑潮旅馆的霓虹还在跳，像一只溺水的眼睛。",
    "旋转门虚掩着。地毯是湿的。",
    "你听见二楼有人用你的节奏走路。",
  ];

  let renderer, scene, camera, clock;
  let hotel = null;
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
  let logs = [false, false, false, false];
  let got = { office: false, room201: false, boiler: false, boat: false };
  let notesRead = 0;
  let phoneRang = false;
  let playTime = 0;
  let footT = 0;
  let bob = 0;
  let hurt = 0;
  let flash = 0;
  let thunderT = 6;
  let lookEntity = 0;
  let subtitleT = 0;
  let raycaster = null;
  let flashLight, ambient, hemi, moon, fill;
  let grainCtx, grainTile;
  let dust = null;
  let looping = false;
  let logPlaying = false;

  const player = {
    pos: new THREE.Vector3(13, 0, 1.55),
    radius: 0.22,
    get flashOn() { return flashOn; },
    get running() { return keys.Shift && stamina > 0.05 && !crouch && !hiding; },
    get crouch() { return crouch; },
    get hiding() { return hiding; },
  };

  function $(id) { return document.getElementById(id); }
  function show(id, on) { $(id).classList.toggle("hidden", !on); }

  function setSub(text, dur) {
    $("subtitle").textContent = text || "";
    subtitleT = dur || 0;
  }

  function setObj(text) {
    $("objective").textContent = text;
  }

  function refreshInv() {
    for (let i = 0; i < 4; i++) $("inventory").querySelector(`[data-k="l${i}"]`).classList.toggle("on", logs[i]);
    ["office", "room201", "boiler", "boat"].forEach((k) => {
      $("inventory").querySelector(`[data-k="${k}"]`).classList.toggle("on", got[k]);
    });
  }

  function updateObjective() {
    const n = logs.filter(Boolean).length;
    if (!got.boat) {
      if (n < 4) setObj(`找到四份旅客记录（${n}/4）。弄清楚潮水为什么会走路。`);
      else if (!got.office) setObj("记录齐了。去前台找办公室钥匙。");
      else if (!got.room201) setObj("打开办公室，拿走 201 的钥匙。");
      else if (!got.boiler) setObj("上二楼 201。锅炉钥匙在湿枕头下面。");
      else setObj("下到进水的锅炉房。小艇钥匙还挂在阀门上。");
    } else {
      setObj("拿着小艇钥匙。冲向地下室码头。不要回头。");
    }
  }

  function boot() {
    const canvas = $("view");
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.88;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x04060a);
    scene.fog = new THREE.FogExp2(0x0a1016, 0.042);

    camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 0.06, 90);
    clock = new THREE.Clock();
    raycaster = new THREE.Raycaster();

    ambient = new THREE.AmbientLight(0x2a3644, 0.42);
    scene.add(ambient);
    hemi = new THREE.HemisphereLight(0x3a4e66, 0x140c08, 0.48);
    scene.add(hemi);
    moon = new THREE.DirectionalLight(0x7a96b4, 0.32);
    moon.position.set(-10, 20, -8);
    scene.add(moon);

    flashLight = new THREE.SpotLight(0xffe6bf, 0, 19, 0.58, 0.38, 1.05);
    flashLight.castShadow = true;
    flashLight.shadow.mapSize.set(1024, 1024);
    flashLight.shadow.camera.near = 0.2;
    flashLight.shadow.camera.far = 17;
    scene.add(flashLight);
    scene.add(flashLight.target);

    dust = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({ color: 0xb8c4c8, size: 0.012, transparent: true, opacity: 0.16, depthWrite: false, sizeAttenuation: true })
    );
    const dpos = new Float32Array(360 * 3);
    for (let i = 0; i < 360; i++) {
      dpos[i * 3] = (Math.random() - 0.5) * 2.6;
      dpos[i * 3 + 1] = (Math.random() - 0.5) * 1.6;
      dpos[i * 3 + 2] = -Math.random() * 6;
    }
    dust.geometry.setAttribute("position", new THREE.BufferAttribute(dpos, 3));
    camera.add(dust);
    fill = new THREE.PointLight(0x88a0b4, 0.35, 3.8, 2);
    fill.position.set(0, 0.04, 0.08);
    camera.add(fill);
    scene.add(camera);

    grainTile = BTTex.filmGrainCanvas();
    grainCtx = $("grain").getContext("2d");
    resizeGrain();

    hotel = BTHotel.build(scene);
    BTEntity.spawn(scene, BTTex.makeMats());

    bindUI();
    window.addEventListener("resize", onResize);
    document.addEventListener("keydown", onKey);
    document.addEventListener("keyup", (e) => { keys[e.key] = false; keys[e.code] = false; });
    document.addEventListener("mousemove", onMouse);
    $("view").addEventListener("click", tryLock);

    if (!looping) {
      looping = true;
      loop();
    }
  }

  function resizeGrain() {
    const c = $("grain");
    c.width = innerWidth;
    c.height = innerHeight;
  }

  function onResize() {
    if (!renderer) return;
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    resizeGrain();
  }

  function bindUI() {
    $("btn-start").onclick = startGame;
    $("btn-howto").onclick = () => { show("title", false); show("howto", true); };
    $("btn-howto-back").onclick = () => { show("howto", false); show("title", true); };
    $("btn-resume").onclick = resume;
    $("btn-quit").onclick = toTitle;
    $("btn-again").onclick = toTitle;
    $("btn-note-close").onclick = closeNote;
    $("btn-log-skip").onclick = closeLog;
    $("sens").oninput = () => {
      sensitivity = parseFloat($("sens").value);
      $("sens-val").textContent = sensitivity.toFixed(2);
    };
    $("vol").oninput = () => {
      const v = parseInt($("vol").value, 10) / 100;
      $("vol-val").textContent = Math.round(v * 100) + "%";
      BTAudio.setVolume(v);
    };
  }

  function resetRun() {
    player.pos.set(13, 0, 1.55);
    yaw = Math.PI;
    pitch = 0;
    stamina = 1;
    battery = 1;
    sanity = 1;
    flashOn = false;
    crouch = false;
    hiding = false;
    logs = [false, false, false, false];
    got = { office: false, room201: false, boiler: false, boat: false };
    notesRead = 0;
    phoneRang = false;
    playTime = 0;
    hurt = 0;
    lookEntity = 0;
    hotel.interactables.forEach((it) => { it.taken = false; });
    BTEntity.spawn(scene, BTTex.makeMats());
    refreshInv();
    updateObjective();
  }

  function startGame() {
    BTAudio.startAmbience();
    BTAudio.resume();
    resetRun();
    show("title", false);
    show("howto", false);
    show("ending", false);
    show("pause", false);
    show("hud", true);
    state = "intro";
    let i = 0;
    const step = () => {
      if (state !== "intro") return;
      if (i < INTRO.length) {
        setSub(INTRO[i], 2.4);
        i += 1;
        setTimeout(step, 2300);
      } else {
        state = "play";
        setSub("F 打开手电。别跑太响。", 3.2);
        tryLock();
      }
    };
    step();
  }

  function toTitle() {
    state = "title";
    show("hud", false);
    show("pause", false);
    show("ending", false);
    show("note-layer", false);
    show("log-layer", false);
    show("title", true);
    document.exitPointerLock && document.exitPointerLock();
  }

  function resume() {
    show("pause", false);
    state = "play";
    tryLock();
  }

  function tryLock() {
    if (state === "play") $("view").requestPointerLock();
  }

  function onMouse(e) {
    if (state !== "play" || document.pointerLockElement !== $("view")) return;
    yaw -= e.movementX * 0.0022 * sensitivity;
    pitch -= e.movementY * 0.0022 * sensitivity;
    pitch = Math.max(-1.25, Math.min(1.25, pitch));
  }

  function onKey(e) {
    keys[e.key] = true;
    keys[e.code] = true;
    if (e.code === "Escape") {
      if (state === "play") {
        state = "pause";
        show("pause", true);
        document.exitPointerLock && document.exitPointerLock();
      } else if (state === "pause") resume();
    }
    if (state !== "play") return;
    if (e.code === "KeyF") toggleFlash();
    if (e.code === "KeyE") interact();
    if (e.code === "ControlLeft" || e.code === "ControlRight") crouch = !crouch;
  }

  function toggleFlash() {
    if (battery <= 0) {
      setSub("手电死了。你听见它在暗处换气。", 2.2);
      return;
    }
    flashOn = !flashOn;
    BTAudio.flashlight();
  }

  function facing() {
    return new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  }

  function nearestInteract() {
    let best = null;
    let bd = 1.7;
    const fwd = facing();
    for (let i = 0; i < hotel.interactables.length; i++) {
      const it = hotel.interactables[i];
      if (it.taken) continue;
      const d = player.pos.distanceTo(it.pos);
      if (d > (it.reach || 1.4)) continue;
      if (Math.abs(player.pos.y - (it.pos.y - 1)) > 2.6 && Math.abs(player.pos.y - it.pos.y) > 2.2) continue;
      const to = it.pos.clone().sub(player.pos);
      to.y = 0;
      if (to.length() > 0.01 && to.normalize().dot(fwd) < 0.15 && d > 0.7) continue;
      if (d < bd) {
        bd = d;
        best = it;
      }
    }
    return best;
  }

  function interact() {
    const it = nearestInteract();
    if (!it) return;
    if (it.kind === "hide") {
      hiding = !hiding;
      setSub(hiding ? "你屏住呼吸。地毯另一头有水声。" : "", 2);
      return;
    }
    if (it.kind === "door") {
      if (it.key && !got[it.key]) {
        setSub("锁死了。需要" + (it.label || "钥匙") + "。", 2);
        BTAudio.click();
        return;
      }
      if (hotel.openDoor(it.id)) {
        BTAudio.door(true);
        it.taken = true;
        setSub((it.label || "门") + "开了。", 1.4);
      }
      return;
    }
    if (it.kind === "note") {
      const n = NOTES[it.id];
      if (!n) return;
      $("note-title").textContent = n.title;
      $("note-body").textContent = n.body;
      show("note-layer", true);
      state = "note";
      document.exitPointerLock && document.exitPointerLock();
      notesRead += 1;
      BTAudio.click();
      return;
    }
    if (it.kind === "log") {
      logs[it.id] = true;
      it.taken = true;
      refreshInv();
      updateObjective();
      playLog(it.id);
      BTAudio.pickup();
      if (logs.filter(Boolean).length === 1) BTEntity.wake();
      return;
    }
    if (it.kind === "key") {
      got[it.id] = true;
      it.taken = true;
      refreshInv();
      updateObjective();
      setSub("你拿到了" + it.label + "。金属是湿的。", 2.2);
      BTAudio.pickup();
      return;
    }
    if (it.kind === "escape") {
      if (!got.boat) {
        setSub("铁门从里面锁着。小艇钥匙还在锅炉房。", 2.4);
        return;
      }
      win();
    }
  }

  function playLog(id) {
    const lines = LOGS[id];
    logPlaying = true;
    show("log-layer", true);
    state = "log";
    document.exitPointerLock && document.exitPointerLock();
    let i = 0;
    const step = () => {
      if (!logPlaying) return;
      if (i < lines.length) {
        $("log-line").textContent = lines[i];
        i += 1;
        setTimeout(step, 2100);
      } else closeLog();
    };
    step();
  }

  function closeLog() {
    logPlaying = false;
    show("log-layer", false);
    if (state === "log") {
      state = "play";
      tryLock();
    }
  }

  function closeNote() {
    show("note-layer", false);
    if (state === "note") {
      state = "play";
      tryLock();
    }
  }

  function win() {
    state = "end";
    document.exitPointerLock && document.exitPointerLock();
    show("hud", false);
    show("ending", true);
    $("end-eyebrow").textContent = "黑潮旅馆 · 3:13";
    $("end-title").textContent = "潮水回头了";
    $("end-body").textContent = "你把小艇推下黑水。旅馆的霓虹在雨里跳了最后一下。\n妹妹的声音没有再叫你。\n岸上有一串只剩一只的脚印，停在你上船的地方。";
    BTAudio.sting();
  }

  function die(reason) {
    state = "end";
    document.exitPointerLock && document.exitPointerLock();
    show("hud", false);
    show("ending", true);
    $("end-eyebrow").textContent = "黑潮旅馆";
    $("end-title").textContent = "它学会你的脸了";
    $("end-body").textContent = reason || "潮客从你的手电光里走出来，把你按进地毯。\n水灌进喉咙的时候，你听见自己的脚步还在楼上走。";
    BTAudio.jump();
    hurt = 1;
  }

  function move(dt) {
    if (hiding) return;
    const fwd = facing();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    let mx = 0;
    let mz = 0;
    if (keys.KeyW || keys.w || keys.ArrowUp) mz += 1;
    if (keys.KeyS || keys.s || keys.ArrowDown) mz -= 1;
    if (keys.KeyA || keys.a || keys.ArrowLeft) mx -= 1;
    if (keys.KeyD || keys.d || keys.ArrowRight) mx += 1;
    const moving = mx !== 0 || mz !== 0;
    const run = player.running && moving;
    if (run) stamina = Math.max(0, stamina - dt * 0.28);
    else stamina = Math.min(1, stamina + dt * 0.16);
    let spd = crouch ? 1.15 : run ? 3.15 : 2.05;
    if (hotel.inWater(player.pos.x, player.pos.y, player.pos.z)) spd *= 0.72;
    if (moving) {
      const dir = fwd.multiplyScalar(mz).add(right.multiplyScalar(mx));
      if (dir.lengthSq() > 0) dir.normalize();
      player.pos.x += dir.x * spd * dt;
      player.pos.z += dir.z * spd * dt;
      footT += dt * (run ? 3.3 : 2.1);
      if (footT > 1) {
        footT = 0;
        BTAudio.foot(run, hotel.inWater(player.pos.x, player.pos.y, player.pos.z));
      }
      bob += dt * (run ? 14 : 9);
    }
    hotel.resolve(player.pos, player.radius, player.pos.y);
  }

  function updateCamera(dt) {
    const stand = crouch || hiding ? 1.05 : 1.62;
    const bobY = hiding ? 0 : Math.sin(bob) * 0.035;
    camera.position.set(player.pos.x, player.pos.y + stand + bobY, player.pos.z);
    camera.rotation.order = "YXZ";
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    flashLight.position.copy(camera.position);
    flashLight.target.position.copy(camera.position).add(dir);
    flashLight.intensity = flashOn && battery > 0 ? 4.2 : 0;
    fill.intensity = flashOn ? 0.16 : 0.55;
    if (flashOn) battery = Math.max(0, battery - dt * 0.018);
    if (battery <= 0) flashOn = false;
  }

  function weather(dt) {
    thunderT -= dt;
    if (thunderT < 0) {
      thunderT = 7 + Math.random() * 10;
      flash = 0.55;
      moon.intensity = 1.6;
      BTAudio.thunder();
      $("flash").style.opacity = "0.55";
      if (Math.random() < 0.35 && BTEntity.visible) {
        setSub("闪电里，走廊尽头多了一截不该有的脖子。", 2);
      }
    }
    if (flash > 0) {
      flash -= dt;
      $("flash").style.opacity = String(Math.max(0, flash));
      if (flash <= 0) moon.intensity = 0.18;
    }
  }

  function storyBeats() {
    if (!phoneRang && playTime > 42) {
      phoneRang = true;
      BTAudio.phone();
      setSub("前台电话响了一声。没有人接。第二声用的是妹妹的语气。", 3.4);
    }
    if (sanity < 0.28 && Math.random() < 0.004) {
      setSub("墙纸上的花纹在数你的步子。", 2);
    }
  }

  function paintGrain() {
    if (!grainCtx || !grainTile) return;
    const c = $("grain");
    grainCtx.clearRect(0, 0, c.width, c.height);
    grainCtx.globalAlpha = 0.18;
    const ox = (Math.random() * 128) | 0;
    const oy = (Math.random() * 128) | 0;
    grainCtx.fillStyle = grainCtx.createPattern(grainTile, "repeat");
    grainCtx.save();
    grainCtx.translate(-ox, -oy);
    grainCtx.fillRect(0, 0, c.width + 128, c.height + 128);
    grainCtx.restore();
  }

  function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, clock.getDelta());
    if (hotel) hotel.tick(playTime, dt);

    if (state === "play" || state === "intro") {
      playTime += dt;
      if (state === "play") move(dt);
      updateCamera(dt);
      weather(dt);
      storyBeats();

      const noise = (player.running ? 0.8 : 0.2) + (flashOn ? 0.35 : 0) + (crouch ? -0.15 : 0);
      const info = BTEntity.update(dt, player, hotel, Math.max(0, noise));
      const look = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      const toE = BTEntity.lookPoint().sub(camera.position);
      const distLook = toE.length();
      toE.normalize();
      const staring = info.visible && look.dot(toE) > 0.82 && distLook < 10;
      if (staring) {
        lookEntity += dt;
        sanity = Math.max(0, sanity - dt * 0.12);
      } else {
        lookEntity = Math.max(0, lookEntity - dt);
        sanity = Math.min(1, sanity + dt * 0.015);
      }
      if (info.grabbing) die();
      if (sanity <= 0) die("神智先一步沉进地毯。你看见自己站在前台，正在对下一个进来的人微笑。");

      if (subtitleT > 0) {
        subtitleT -= dt;
        if (subtitleT <= 0) $("subtitle").textContent = "";
      }

      const it = state === "play" ? nearestInteract() : null;
      $("prompt").textContent = it ? "E  " + it.label : (hiding ? "E  出来" : "");

      $("bar-stamina").style.transform = "scaleX(" + stamina.toFixed(3) + ")";
      $("bar-battery").style.transform = "scaleX(" + battery.toFixed(3) + ")";
      $("bar-sanity").style.transform = "scaleX(" + sanity.toFixed(3) + ")";
      $("hurt").style.opacity = info.dist < 3.2 ? String((3.2 - info.dist) / 5) : "0";
      $("blood-edge").style.boxShadow = "inset 0 0 140px 40px rgba(90,0,8," + (info.dist < 4 ? (4 - info.dist) * 0.08 : 0) + ")";
      $("sanity-warp").style.opacity = String((1 - sanity) * 0.55);
      $("static-fx").style.opacity = staring ? "0.22" : "0";
      $("rain-glass").style.opacity = player.pos.z < 2.2 && player.pos.y > -0.5 ? "0.45" : "0.12";

      BTAudio.update(dt, info.dist, sanity, player.running, hotel.inWater(player.pos.x, player.pos.y, player.pos.z));
    } else {
      updateCamera(0);
    }

    if (hurt > 0) {
      hurt -= dt;
      $("hurt").style.opacity = String(Math.min(1, hurt + 0.2));
    }

    paintGrain();
    renderer.render(scene, camera);
  }

  window.addEventListener("load", boot);
})();
