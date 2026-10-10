import * as THREE from 'three';
import { focusZoomedToward } from './interact';
import type { Vec3 } from '../physics/coords';

export interface FlyTarget {
  focus: () => Vec3;
  distance: number;
  up?: Vec3;
  duration?: number;
  minDistance?: number;
}

interface Flight {
  f0: Vec3;
  target: () => Vec3;
  log0: number;
  log1: number;
  hop: number;
  q0: THREE.Quaternion;
  q1: THREE.Quaternion;
  t: number;
  duration: number;
  minDistance: number;
}

const Y = new THREE.Vector3(0, 1, 0);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Orbit camera with logarithmic zoom spanning ~24 orders of magnitude. All positions are in metres
 * (float64); rendering layers convert them into their own units.
 */
export class CameraController {
  focus: Vec3 = [0, 0, 0];
  logDist = 13;
  private targetLog = 13;
  yaw = 0.9;
  pitch = 0.42;
  private targetYaw = 0.9;
  private targetPitch = 0.42;
  readonly frame = new THREE.Quaternion();
  private targetFrame = new THREE.Quaternion();
  minDistance = 1e3;
  maxLog = 27.75;
  tracking: (() => Vec3) | null = null;
  flight: Flight | null = null;
  autoRotate = false;
  fov = 50;
  /** World point a scroll-wheel zoom should hold still (the object or empty space under the cursor). */
  resolveAnchor: ((clientX: number, clientY: number) => Vec3 | null) | null = null;

  readonly camPos: Vec3 = [0, 0, 0];
  readonly camQuat = new THREE.Quaternion();

  private dom: HTMLElement | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private lastPinch = 0;
  private dragMode: 'orbit' | 'pan' | null = null;
  private moved = 0;
  onInteract?: () => void;

  get distance(): number {
    return Math.pow(10, this.logDist);
  }

  attach(dom: HTMLElement): void {
    this.dom = dom;
    dom.addEventListener('pointerdown', this.onDown);
    dom.addEventListener('pointermove', this.onMove);
    dom.addEventListener('pointerup', this.onUp);
    dom.addEventListener('pointercancel', this.onUp);
    dom.addEventListener('wheel', this.onWheel, { passive: false });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  detach(): void {
    const dom = this.dom;
    if (!dom) return;
    dom.removeEventListener('pointerdown', this.onDown);
    dom.removeEventListener('pointermove', this.onMove);
    dom.removeEventListener('pointerup', this.onUp);
    dom.removeEventListener('pointercancel', this.onUp);
    dom.removeEventListener('wheel', this.onWheel);
    this.dom = null;
  }

  /** True if the last pointer gesture was a click rather than a drag. */
  get wasClick(): boolean {
    return this.moved < 5;
  }

  private onDown = (e: PointerEvent) => {
    this.dom?.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.moved = 0;
    this.dragMode = e.button === 2 || e.shiftKey || e.ctrlKey ? 'pan' : 'orbit';
    if (this.pointers.size === 2) this.lastPinch = this.pinchDistance();
    this.onInteract?.();
  };

  private pinchDistance(): number {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private onMove = (e: PointerEvent) => {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.moved += Math.abs(dx) + Math.abs(dy);
    if (this.pointers.size === 2) {
      const d = this.pinchDistance();
      if (this.lastPinch > 0) {
        const pts = [...this.pointers.values()];
        const anchor = this.resolveAnchor?.((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2) ?? null;
        this.zoomBy(Math.log10(this.lastPinch / d) * 2.2, anchor);
      }
      this.lastPinch = d;
      return;
    }
    if (this.flight) return;
    if (this.dragMode === 'orbit') {
      this.targetYaw -= dx * 0.005;
      this.targetPitch = Math.max(-1.5, Math.min(1.5, this.targetPitch + dy * 0.005));
    } else if (this.dragMode === 'pan' && this.dom) {
      const h = this.dom.clientHeight || 1;
      const k = (2 * Math.tan((this.fov * Math.PI) / 360) * this.distance) / h;
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camQuat);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camQuat);
      const base = this.tracking ? this.tracking() : this.focus;
      this.tracking = null;
      this.focus = [
        base[0] - right.x * dx * k + up.x * dy * k,
        base[1] - right.y * dx * k + up.y * dy * k,
        base[2] - right.z * dx * k + up.z * dy * k,
      ];
    }
  };

  private onUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.lastPinch = 0;
    if (this.pointers.size === 0) this.dragMode = null;
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    const anchor = this.resolveAnchor?.(e.clientX, e.clientY) ?? null;
    this.zoomBy(dy * 0.0016, anchor);
    this.onInteract?.();
  };

  /**
   * Zoom by Δlog10(distance). When `anchor` is set, the focus slides so that world point
   * stays under the cursor — scrolling enlarges whatever you are pointing at.
   */
  zoomBy(dLog: number, anchor?: Vec3 | null): void {
    if (this.flight) {
      this.flight.log1 = this.clampLog(this.flight.log1 + dLog);
      return;
    }
    if (anchor) {
      const tracked = this.tracking?.();
      if (tracked) {
        const away = Math.hypot(anchor[0] - tracked[0], anchor[1] - tracked[1], anchor[2] - tracked[2]);
        // A tracked body only keeps the camera while the pointer is still on it.
        // Pointing anywhere else lets the focus slide so the scroll enlarges that spot.
        if (away > this.distance * 0.05) this.tracking = null;
      }
      if (!this.tracking) {
        const factor = Math.pow(10, dLog);
        const maxShift = this.distance * (dLog < 0 ? 0.55 : 0.35);
        this.focus = focusZoomedToward(this.focus, anchor, factor, maxShift);
      }
    }
    this.targetLog = this.clampLog(this.targetLog + dLog);
  }

  setLogDistance(log: number, immediate = false): void {
    this.targetLog = this.clampLog(log);
    if (immediate) this.logDist = this.targetLog;
  }

  get targetLogDistance(): number {
    return this.flight ? this.flight.log1 : this.targetLog;
  }

  private clampLog(x: number): number {
    return Math.min(this.maxLog, Math.max(Math.log10(this.minDistance), x));
  }

  setUp(up: Vec3, immediate = false): void {
    this.targetFrame.setFromUnitVectors(Y, new THREE.Vector3(...up).normalize());
    if (immediate) this.frame.copy(this.targetFrame);
  }

  flyTo(t: FlyTarget): void {
    const f0 = this.tracking ? this.tracking() : this.focus;
    const f1 = t.focus();
    const sep = Math.hypot(f1[0] - f0[0], f1[1] - f0[1], f1[2] - f0[2]);
    const log0 = this.logDist;
    const log1 = Math.max(Math.log10(Math.max(t.distance, t.minDistance ?? 0)), Math.log10(t.minDistance ?? 1));
    const hop = sep > 0 ? Math.max(0, Math.log10(sep * 1.6) - Math.max(log0, log1)) : 0;
    const q1 = new THREE.Quaternion();
    if (t.up) q1.setFromUnitVectors(Y, new THREE.Vector3(...t.up).normalize());
    else q1.copy(this.targetFrame);
    const span = Math.abs(log1 - log0) + 2 * hop;
    this.flight = {
      f0: [...f0] as Vec3,
      target: t.focus,
      log0,
      log1,
      hop,
      q0: this.frame.clone(),
      q1,
      t: 0,
      duration: t.duration ?? Math.min(7, 1.4 + span * 0.32),
      minDistance: t.minDistance ?? 1e3,
    };
    this.tracking = null;
  }

  cancelFlight(): void {
    if (!this.flight) return;
    const f = this.flight;
    this.flight = null;
    this.targetLog = this.logDist;
    this.tracking = f.target;
    this.targetFrame.copy(this.frame);
  }

  update(dt: number): void {
    const k = 1 - Math.exp(-dt * 7);
    if (this.flight) {
      const f = this.flight;
      f.t += dt;
      const s = Math.min(1, f.t / f.duration);
      const e = easeInOut(s);
      this.logDist = f.log0 + (f.log1 - f.log0) * e + f.hop * Math.sin(Math.PI * s) ** 1.2;
      const w = f.hop > 0.05 ? smooth(0.15, 0.85, s) : e;
      const target = f.target();
      this.focus = [
        f.f0[0] + (target[0] - f.f0[0]) * w,
        f.f0[1] + (target[1] - f.f0[1]) * w,
        f.f0[2] + (target[2] - f.f0[2]) * w,
      ];
      this.frame.slerpQuaternions(f.q0, f.q1, e);
      if (s >= 1) {
        this.flight = null;
        this.tracking = f.target;
        this.targetLog = this.logDist = f.log1;
        this.targetFrame.copy(f.q1);
        this.minDistance = f.minDistance;
      }
    } else {
      if (this.tracking) this.focus = this.tracking();
      this.logDist += (this.targetLog - this.logDist) * k;
      this.frame.slerp(this.targetFrame, k * 0.6);
    }
    if (this.autoRotate && this.pointers.size === 0) this.targetYaw += dt * 0.05;
    this.yaw += (this.targetYaw - this.yaw) * k;
    this.pitch += (this.targetPitch - this.pitch) * k;

    const d = this.distance;
    const cp = Math.cos(this.pitch);
    const offset = new THREE.Vector3(cp * Math.sin(this.yaw), Math.sin(this.pitch), cp * Math.cos(this.yaw)).applyQuaternion(this.frame);
    const up = Y.clone().applyQuaternion(this.frame);
    const m = new THREE.Matrix4().lookAt(offset, new THREE.Vector3(0, 0, 0), up);
    this.camQuat.setFromRotationMatrix(m);
    this.camPos[0] = this.focus[0] + offset.x * d;
    this.camPos[1] = this.focus[1] + offset.y * d;
    this.camPos[2] = this.focus[2] + offset.z * d;
  }
}
