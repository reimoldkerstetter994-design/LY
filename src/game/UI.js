import { BLOCK_TYPES, BLOCK_KEYS, PROP_TYPES, PROP_KEYS } from "./BlockTypes.js";

export class UI {
  constructor(game) {
    this.game = game;
    this.selectedBlock = 0;
    this.selectedProp = -1;
    this.mode = "block";
    this.setupBlockSelector();
    this.setupStartScreen();
  }

  setupStartScreen() {
    const btn = document.getElementById("start-btn");
    btn.addEventListener("click", () => {
      document.getElementById("start-screen").classList.add("hidden");
      document.getElementById("hud").classList.add("active");
      document.getElementById("crosshair").classList.add("active");
      this.game.player.lock();
      this.game.started = true;
    });
  }

  setupBlockSelector() {
    const container = document.getElementById("block-selector");
    BLOCK_KEYS.forEach((key, i) => {
      const block = BLOCK_TYPES[key];
      const slot = document.createElement("div");
      slot.className = `block-slot${i === 0 ? " selected" : ""}`;
      slot.style.background = block.color;
      slot.innerHTML = `<span class="key-hint">${i + 1}</span>${block.name}`;
      slot.addEventListener("click", () => this.selectBlock(i));
      container.appendChild(slot);
    });
  }

  selectBlock(index) {
    this.selectedBlock = index;
    this.selectedProp = -1;
    this.mode = "block";
    document.querySelectorAll(".block-slot").forEach((el, i) => {
      el.classList.toggle("selected", i === index);
    });
  }

  selectProp(index) {
    this.selectedProp = index;
    this.mode = "prop";
    document.querySelectorAll(".block-slot").forEach((el) => el.classList.remove("selected"));
  }

  getSelectedBlockType() {
    return BLOCK_KEYS[this.selectedBlock];
  }

  getSelectedPropType() {
    return PROP_KEYS[this.selectedProp];
  }

  update(player, world) {
    const coords = player.getCoords();
    document.getElementById("coords").textContent =
      `X: ${coords.x}  Y: ${coords.y}  Z: ${coords.z}`;
    document.getElementById("block-count").textContent =
      `方块: ${world.getBlockCount()}`;
  }

  notify(message, duration = 2000) {
    const el = document.getElementById("notification");
    el.textContent = message;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), duration);
  }

  handleKey(code) {
    const num = parseInt(code.replace("Digit", ""));
    if (num >= 1 && num <= 8) {
      this.selectBlock(num - 1);
      return true;
    }
    if (code === "KeyE") {
      if (this.selectedProp < 0) this.selectedProp = 0;
      else this.selectedProp = (this.selectedProp + 1) % PROP_KEYS.length;
      this.mode = "prop";
      const prop = PROP_TYPES[PROP_KEYS[this.selectedProp]];
      this.notify(`放置道具: ${prop.name}`);
      document.querySelectorAll(".block-slot").forEach((el) => el.classList.remove("selected"));
      return true;
    }
    return false;
  }
}
