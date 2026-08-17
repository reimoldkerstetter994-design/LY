/**
 * Keyboard + pointer-lock mouse input.
 * Mouse deltas are accumulated between frames and consumed by the player.
 */

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.locked = false;
    this.enabled = false;
    this.onLockChange = null;

    this._onKeyDown = (e) => {
      if (!this.enabled) return;
      const code = e.code;
      if (
        [
          'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyF', 'KeyQ', 'KeyR',
          'Space', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'Tab',
        ].includes(code)
      ) {
        e.preventDefault();
      }
      if (!this.keys.has(code)) this.pressed.add(code);
      this.keys.add(code);
    };

    this._onKeyUp = (e) => {
      this.keys.delete(e.code);
    };

    this._onMove = (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    };

    this._onLockChange = () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) this.keys.clear();
      this.onLockChange?.(this.locked);
    };

    this._onBlur = () => this.keys.clear();

    window.addEventListener('keydown', this._onKeyDown, { passive: false });
    window.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('mousemove', this._onMove);
    document.addEventListener('pointerlockchange', this._onLockChange);
    window.addEventListener('blur', this._onBlur);
  }

  async requestLock() {
    if (this.locked) return true;
    try {
      const res = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (res && typeof res.then === 'function') await res;
      return true;
    } catch {
      try {
        this.canvas.requestPointerLock();
        return true;
      } catch {
        return false;
      }
    }
  }

  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  down(code) {
    return this.keys.has(code);
  }

  /** True only on the frame the key went down. */
  justPressed(code) {
    return this.pressed.has(code);
  }

  get shift() {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }

  get ctrl() {
    return this.keys.has('ControlLeft') || this.keys.has('ControlRight');
  }

  /** Movement axes in local space: x = strafe, y = forward. */
  axes() {
    let x = 0;
    let y = 0;
    if (this.down('KeyW')) y += 1;
    if (this.down('KeyS')) y -= 1;
    if (this.down('KeyD')) x += 1;
    if (this.down('KeyA')) x -= 1;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  consumeMouse() {
    const d = { x: this.mouseDX, y: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }

  endFrame() {
    this.pressed.clear();
  }
}
