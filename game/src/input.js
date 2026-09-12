export class Input {
  constructor() {
    this.keys = new Set();
    this.lookX = 0;
    this.lookY = 0;
    this.dragging = false;
    this.locked = false;
  }

  setKey(code, down) {
    if (down) this.keys.add(code);
    else this.keys.delete(code);
  }

  pressed(code) {
    return this.keys.has(code);
  }

  axis() {
    let x = 0;
    let z = 0;
    if (this.pressed("KeyW") || this.pressed("ArrowUp")) z -= 1;
    if (this.pressed("KeyS") || this.pressed("ArrowDown")) z += 1;
    if (this.pressed("KeyA") || this.pressed("ArrowLeft")) x -= 1;
    if (this.pressed("KeyD") || this.pressed("ArrowRight")) x += 1;
    const len = Math.hypot(x, z) || 1;
    return { x: x / len, z: z / len };
  }
}
