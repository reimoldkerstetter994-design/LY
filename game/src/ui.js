const TOKEN_META = [
  { id: "git", label: "GIT" },
  { id: "debug", label: "DBG" },
  { id: "api", label: "API" },
  { id: "ci", label: "CI" },
  { id: "bloom", label: "FX" },
];

export class UI {
  constructor() {
    this.questTitle = document.getElementById("quest-title");
    this.questBody = document.getElementById("quest-body");
    this.prompt = document.getElementById("prompt");
    this.logEl = document.getElementById("log");
    this.tokens = document.getElementById("tokens");
    this.hud = document.getElementById("hud");
    this.title = document.getElementById("title");
    this.pause = document.getElementById("pause");
    this.win = document.getElementById("win");
    this.winBody = document.getElementById("win-body");
    this.minimap = document.getElementById("minimap");
    this.mctx = this.minimap.getContext("2d");
    this.tokens.innerHTML = TOKEN_META.map(
      (t) => `<div class="token" data-id="${t.id}">${t.label}</div>`
    ).join("");
  }

  showHud() {
    this.hud.classList.remove("hidden");
    this.title.classList.add("hidden");
    this.pause.classList.add("hidden");
  }

  showTitle() {
    this.title.classList.remove("hidden");
    this.hud.classList.add("hidden");
    this.pause.classList.add("hidden");
    this.win.classList.add("hidden");
  }

  showPause(on) {
    this.pause.classList.toggle("hidden", !on);
  }

  showWin(text) {
    this.winBody.textContent = text;
    this.win.classList.remove("hidden");
  }

  setQuest(title, body) {
    this.questTitle.textContent = title;
    this.questBody.textContent = body;
  }

  setPrompt(text) {
    if (!text) {
      this.prompt.classList.add("hidden");
      this.prompt.textContent = "";
      return;
    }
    this.prompt.classList.remove("hidden");
    this.prompt.textContent = text;
  }

  setTokens(owned) {
    for (const el of this.tokens.querySelectorAll(".token")) {
      el.classList.toggle("on", !!owned[el.dataset.id]);
    }
  }

  log(msg) {
    const line = document.createElement("div");
    line.textContent = msg;
    this.logEl.prepend(line);
    while (this.logEl.childElementCount > 5) this.logEl.lastChild.remove();
  }

  drawMinimap(player, districts, yaw) {
    const ctx = this.mctx;
    const s = this.minimap.width;
    ctx.fillStyle = "#08141c";
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = "#1b3a44";
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, 74, 0, Math.PI * 2);
    ctx.stroke();
    const scale = 1.85;
    const to = (x, z) => [s / 2 + x * scale, s / 2 + z * scale];
    ctx.fillStyle = "#5aeadc";
    for (const d of districts) {
      const [x, y] = to(d.pos[0], d.pos[2]);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    const [px, py] = to(player.x, player.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(yaw);
    ctx.fillStyle = "#ffc247";
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.fill();
    ctx.restore();
  }
}
