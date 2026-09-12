const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.loader = $("loader");
    this.loadBar = $("load-bar");
    this.loadText = $("load-text");
    this.title = $("title");
    this.hud = $("hud");
    this.focus = $("focus");
    this.quest = $("quest");
    this.prompt = $("prompt");
    this.progress = $("progress");
    this.progressBar = $("progress-bar");
    this.progressLabel = $("progress-label");
    this.logEl = $("log");
    this.dialogue = $("dialogue");
    this.dlgWho = $("dlg-who");
    this.dlgLine = $("dlg-line");
    this.pause = $("pause");
    this.win = $("win");
    this.winStats = $("win-stats");
    this.crosshair = $("crosshair");
    this.commits = $("stat-commits");
    this.bugs = $("stat-bugs");
    this.minimap = $("minimap");
    this.mapCtx = this.minimap.getContext("2d");
    this.lines = [];
  }

  setLoad(p, text) {
    this.loadBar.style.width = `${Math.round(p * 100)}%`;
    if (text) this.loadText.textContent = text;
  }

  ready() {
    this.loader.classList.add("hidden");
    this.title.classList.remove("hidden");
    document.getElementById("btn-start")?.focus();
  }

  enterPlay() {
    this.title.classList.add("hidden");
    this.hud.classList.remove("hidden");
  }

  setFocus(cur, max) {
    this.focus.innerHTML = "";
    for (let i = 0; i < max; i += 1) {
      const d = document.createElement("i");
      if (i >= cur) d.classList.add("off");
      this.focus.appendChild(d);
    }
  }

  setQuest(title, detail) {
    this.quest.innerHTML = `<strong>当前任务</strong>${title}<div style="color:var(--muted);margin-top:0.25rem">${detail}</div>`;
  }

  setPrompt(text) {
    if (!text) {
      this.prompt.classList.add("hidden");
      this.crosshair.classList.remove("hot");
      return;
    }
    this.prompt.textContent = text;
    this.prompt.classList.remove("hidden");
    this.crosshair.classList.add("hot");
  }

  setBusy(on, label, p = 0) {
    if (!on) {
      this.progress.classList.add("hidden");
      return;
    }
    this.progress.classList.remove("hidden");
    this.progressLabel.textContent = label;
    this.progressBar.style.width = `${Math.round(p * 100)}%`;
  }

  log(text) {
    this.lines.unshift(text);
    this.lines = this.lines.slice(0, 5);
    this.logEl.innerHTML = this.lines.map((l) => `<div>${l}</div>`).join("");
  }

  showDialogue(who, line) {
    this.dialogue.classList.remove("hidden");
    this.dlgWho.textContent = who;
    this.dlgLine.textContent = line;
  }

  hideDialogue() {
    this.dialogue.classList.add("hidden");
  }

  setPause(on) {
    this.pause.classList.toggle("hidden", !on);
  }

  showWin(stats) {
    this.win.classList.remove("hidden");
    this.winStats.textContent = stats;
  }

  setCounts(commits, needC, bugs, needB) {
    this.commits.textContent = `Commit ${commits}/${needC}`;
    this.bugs.textContent = `Bug ${bugs}/${needB}`;
  }

  drawMap(player, meta, bugs) {
    const ctx = this.mapCtx;
    const w = this.minimap.width;
    const h = this.minimap.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(6,12,20,0.9)";
    ctx.fillRect(0, 0, w, h);
    const scale = 1.7;
    const to = (x, z) => [w / 2 + x * scale, h / 2 + z * scale];
    const buildings = [
      { c: meta.zones.kernel.center, color: "#2aa7b8" },
      { c: meta.zones.atelier.center, color: "#a56b9a" },
      { c: meta.zones.qa.center, color: "#c45b4a" },
      { c: meta.zones.ship.center, color: "#3d5a8c" },
    ];
    for (const b of buildings) {
      const [x, y] = to(b.c[0], b.c[2]);
      ctx.fillStyle = b.color;
      ctx.fillRect(x - 14, y - 12, 28, 24);
    }
    ctx.strokeStyle = "rgba(60,230,255,0.35)";
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.stroke();
    ctx.fillStyle = "#3ce6ff";
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 6, 0, Math.PI * 2);
    ctx.fill();
    for (const bug of bugs) {
      if (!bug.alive) continue;
      const [x, y] = to(bug.position.x, bug.position.z);
      ctx.fillStyle = "#ff5d6c";
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }
    const [px, py] = to(player.position.x, player.position.z);
    ctx.fillStyle = "#ffb03a";
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fill();
    const ang = player.yaw;
    ctx.strokeStyle = "#ffb03a";
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px - Math.sin(ang) * 10, py - Math.cos(ang) * 10);
    ctx.stroke();
  }
}
