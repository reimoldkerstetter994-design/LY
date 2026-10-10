import * as THREE from 'three';
import type { Vec3 } from '../physics/coords';

export interface LabelCandidate {
  id: string;
  text: string;
  position: Vec3;
  color?: string;
  priority: number;
  kind: string;
  interactive: boolean;
  forced?: boolean;
  selected?: boolean;
}

export interface LabelHandlers {
  onClick: (id: string) => void;
  onDoubleClick: (id: string) => void;
}

interface Placed {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const qInv = new THREE.Quaternion();
const v = new THREE.Vector3();

export interface ScreenPoint {
  x: number;
  y: number;
  depth: number;
}

/** Projects a world position (metres) to CSS pixels; returns null when behind the camera. */
export function projectToScreen(
  p: Vec3,
  camPos: Vec3,
  camQuat: THREE.Quaternion,
  fovDeg: number,
  width: number,
  height: number,
): ScreenPoint | null {
  qInv.copy(camQuat).invert();
  v.set(p[0] - camPos[0], p[1] - camPos[1], p[2] - camPos[2]).applyQuaternion(qInv);
  if (v.z >= 0) return null;
  const t = Math.tan((fovDeg * Math.PI) / 360);
  const aspect = width / height;
  const nx = v.x / -v.z / (t * aspect);
  const ny = v.y / -v.z / t;
  return { x: ((nx + 1) / 2) * width, y: ((1 - ny) / 2) * height, depth: -v.z };
}

const textWidth = (s: string) => {
  let w = 0;
  for (const ch of s) w += ch.charCodeAt(0) > 0x2e80 ? 13 : 7;
  return w;
};

export class LabelSystem {
  private nodes = new Map<string, HTMLDivElement>();
  private visible = new Set<string>();
  /** Screen positions of interactive labels from the last frame (for canvas picking). */
  hits: { id: string; x: number; y: number }[] = [];
  private hoverId: string | null = null;

  /** Highlights the label of the object currently under the pointer. */
  setHover(id: string | null): void {
    this.hoverId = id;
  }

  constructor(
    private root: HTMLElement,
    private handlers: LabelHandlers,
  ) {}

  private node(c: LabelCandidate): HTMLDivElement {
    let el = this.nodes.get(c.id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'lbl';
      const dot = document.createElement('i');
      const span = document.createElement('span');
      el.append(dot, span);
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (el!.dataset.interactive === '1') this.handlers.onClick(el!.dataset.id!);
      });
      el.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        if (el!.dataset.interactive === '1') this.handlers.onDoubleClick(el!.dataset.id!);
      });
      el.dataset.id = c.id;
      this.root.appendChild(el);
      this.nodes.set(c.id, el);
    }
    return el;
  }

  update(cands: LabelCandidate[], camPos: Vec3, camQuat: THREE.Quaternion, fovDeg: number, width: number, height: number): void {
    cands.sort((a, b) => Number(!!b.forced) - Number(!!a.forced) || b.priority - a.priority);
    const placed: Placed[] = [];
    const shown = new Set<string>();
    this.hits = [];
    let count = 0;
    for (const c of cands) {
      if (count > 90 && !c.forced) break;
      const sp = projectToScreen(c.position, camPos, camQuat, fovDeg, width, height);
      if (!sp || sp.x < -40 || sp.y < -20 || sp.x > width + 40 || sp.y > height + 20) continue;
      const w = textWidth(c.text) + 18;
      const r: Placed = { x0: sp.x - 6, y0: sp.y - 9, x1: sp.x + w, y1: sp.y + 9 };
      if (!c.forced && placed.some((p) => r.x0 < p.x1 && r.x1 > p.x0 && r.y0 < p.y1 && r.y1 > p.y0)) continue;
      placed.push(r);
      const el = this.node(c);
      if (el.dataset.text !== c.text) {
        el.dataset.text = c.text;
        (el.lastChild as HTMLSpanElement).textContent = c.text;
      }
      el.dataset.interactive = c.interactive ? '1' : '0';
      el.dataset.kind = c.kind;
      el.classList.toggle('sel', !!c.selected);
      el.classList.toggle('hot', c.id === this.hoverId);
      if (c.color) el.style.setProperty('--c', c.color);
      el.style.transform = `translate3d(${sp.x.toFixed(1)}px, ${sp.y.toFixed(1)}px, 0)`;
      if (!this.visible.has(c.id)) el.style.display = '';
      shown.add(c.id);
      if (c.interactive) this.hits.push({ id: c.id, x: sp.x, y: sp.y });
      count++;
    }
    for (const id of this.visible) {
      if (!shown.has(id)) {
        const el = this.nodes.get(id);
        if (el) el.style.display = 'none';
      }
    }
    this.visible = shown;
  }

  clear(): void {
    for (const el of this.nodes.values()) el.style.display = 'none';
    this.visible.clear();
    this.hits = [];
  }

  pick(x: number, y: number, radius = 16): string | null {
    let best: string | null = null;
    let bestD = radius * radius;
    for (const h of this.hits) {
      const d = (h.x - x) ** 2 + (h.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = h.id;
      }
    }
    return best;
  }
}
