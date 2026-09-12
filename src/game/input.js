export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.yaw = 0;
    this.pitch = 0.12;
    this.dragging = false;
    this.consumeAttack = false;
    this.interact = false;
    this.pausePressed = false;

    window.addEventListener("keydown", (e) => {
      this.keys.add(e.code);
      if (e.code === "KeyE") this.interact = true;
      if (e.code === "Escape") this.pausePressed = true;
      if (["Space", "KeyW", "KeyA", "KeyS", "KeyD"].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));

    canvas.addEventListener("mousedown", (e) => {
      this.dragging = true;
      if (e.button === 0) this.consumeAttack = true;
      if (document.pointerLockElement !== canvas) {
        canvas.requestPointerLock?.();
      }
    });
    window.addEventListener("mouseup", () => {
      this.dragging = false;
    });
    window.addEventListener("mousemove", (e) => {
      const locked = document.pointerLockElement === canvas;
      if (!locked && !this.dragging) return;
      this.yaw += e.movementX * 0.0024;
      this.pitch -= e.movementY * 0.002;
      this.pitch = Math.max(-0.85, Math.min(0.62, this.pitch));
    });
  }

  axis() {
    let x = 0;
    let z = 0;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) z -= 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) z += 1;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) x -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) x += 1;
    const len = Math.hypot(x, z) || 1;
    return { x: x / len, z: z / len };
  }

  jumping() {
    return this.keys.has("Space");
  }

  sprinting() {
    return this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
  }

  takeInteract() {
    const v = this.interact;
    this.interact = false;
    return v;
  }

  takeAttack() {
    const v = this.consumeAttack;
    this.consumeAttack = false;
    return v;
  }

  takePause() {
    const v = this.pausePressed;
    this.pausePressed = false;
    return v;
  }
}
