import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { buildCatalog, type Catalog } from '../data/catalog';
import { SCALE_PRESETS } from '../data/presets';
import type { CatalogObject } from '../data/types';
import type { Vec3 } from '../physics/coords';
import type { Cosmology } from '../physics/cosmology';
import { bodyPosition } from '../sim/ephemeris';
import type { EvoVisual } from '../sim/evolution';
import { CameraController } from './CameraController';
import { shared, type EngineSettings, type FrameContext, type Layer } from './core';
import { EvolutionScene } from './EvolutionScene';
import { approachLimit, pickRadiusPx } from './interact';
import { LabelSystem, projectToScreen, type LabelCandidate } from './Labels';
import { CosmicLayer } from './layers/CosmicLayer';
import { FocusBodyLayer } from './layers/FocusBodyLayer';
import { GalaxyLayer } from './layers/GalaxyLayer';
import { LocalUniverseLayer } from './layers/LocalUniverseLayer';
import { SolarSystemLayer } from './layers/SolarSystemLayer';
import { StarsLayer } from './layers/StarsLayer';

export type EngineMode = 'explore' | 'evolution' | 'idle';
export type Lang = 'zh' | 'en';

export interface HudInfo {
  logView: number;
  viewDist: number;
  focusId: string | null;
  camFromSun: number;
  jd: number;
  fps: number;
  flying: boolean;
}

export interface EngineCallbacks {
  onHud: (hud: HudInfo) => void;
  onSelect: (id: string | null) => void;
  onFocus: (id: string | null) => void;
}

class LayeredRenderPass extends Pass {
  constructor(private readonly draw: (renderer: THREE.WebGLRenderer) => void) {
    super();
    this.needsSwap = false;
  }

  override render(renderer: THREE.WebGLRenderer, _write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget): void {
    renderer.setRenderTarget(this.renderToScreen ? null : read);
    this.draw(renderer);
  }
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  readonly cam = new CameraController();
  private layers: Layer[] = [];
  private readonly focusBody = new FocusBodyLayer();
  private cosmic: CosmicLayer | null = null;
  private labels: LabelSystem;
  private evo: EvolutionScene | null = null;
  private catalog: Catalog | null = null;
  private mode: EngineMode = 'explore';
  private settings: EngineSettings = {
    labels: true,
    orbits: true,
    bloom: true,
    shells: true,
    cmbSky: false,
    autoRotate: false,
    quality: 'high',
  };
  private lang: Lang = 'zh';
  private selected: string | null = null;
  private focusId: string | null = null;
  jd = 2451545;
  rate = 0;
  playing = false;
  private raf = 0;
  private last = 0;
  private time = 0;
  private fps = 60;
  private hudTimer = 0;
  private clickTimer = 0;
  private armedId: string | null = null;
  private width = 1;
  private height = 1;
  private ready = false;
  private disposed = false;
  private resizeObserver: ResizeObserver;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly labelRoot: HTMLElement,
    private readonly cb: EngineCallbacks,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.autoClear = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new LayeredRenderPass((r) => this.drawScene(r)));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.45, 0.78);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.labels = new LabelSystem(labelRoot, {
      onClick: (id) => this.armObjectClick(id),
      onDoubleClick: (id) => this.frameObject(id),
    });

    this.cam.resolveAnchor = (x, y) => this.zoomAnchor(x, y);
    this.cam.attach(canvas);
    canvas.addEventListener('pointerup', this.onCanvasClick);
    canvas.addEventListener('dblclick', this.onCanvasDouble);
    canvas.addEventListener('pointermove', this.onPointerMove);
    labelRoot.addEventListener('pointermove', this.onPointerMove);
    labelRoot.addEventListener('wheel', this.onLabelWheel, { passive: false });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();
  }

  /** Builds every scale layer, yielding between steps so the UI can show progress. */
  async init(cosmo: Cosmology, quality: EngineSettings['quality'], onProgress: (p: number, key: string) => void): Promise<void> {
    this.settings.quality = quality;
    const steps: [string, () => Layer][] = [
      ['solar', () => new SolarSystemLayer(quality)],
      ['stars', () => new StarsLayer(quality)],
      ['galaxy', () => new GalaxyLayer(quality)],
      ['local', () => new LocalUniverseLayer(quality)],
      ['cosmic', () => (this.cosmic = new CosmicLayer(quality))],
    ];
    for (let i = 0; i < steps.length; i++) {
      onProgress(i / steps.length, steps[i][0]);
      await nextFrame();
      if (this.disposed) return;
      this.layers.push(steps[i][1]());
    }
    // Largest scales are drawn first (as background), finest last.
    // The focus-body stand-in is appended afterwards so it stays on top even after its unit changes.
    this.layers.sort((a, b) => b.unit - a.unit);
    this.layers.push(this.focusBody);
    this.setCosmology(cosmo);
    onProgress(1, 'done');
    this.ready = true;
    const preset = SCALE_PRESETS.find((p) => p.id === 'solar')!;
    this.focusId = 'sun';
    this.cam.tracking = () => [0, 0, 0];
    this.cam.setUp(preset.up, true);
    this.cam.setLogDistance(preset.log + 0.25, true);
    this.cam.yaw = 0.6;
    this.cam.pitch = 0.5;
    this.cam.update(0);
    this.cb.onFocus('sun');
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  /** Layers in draw order (for diagnostics). */
  get layerList(): readonly Layer[] {
    return this.layers;
  }

  get objects(): CatalogObject[] {
    return this.catalog?.objects ?? [];
  }

  getObject(id: string): CatalogObject | undefined {
    return this.catalog?.byId.get(id);
  }

  /** Current world position (metres) of a catalog object. */
  positionOf(id: string): Vec3 {
    const o = this.catalog?.byId.get(id);
    if (!o) return [0, 0, 0];
    return o.dynamic ? bodyPosition(id, this.jd) : o.position;
  }

  setCosmology(cosmo: Cosmology, zStar?: number): void {
    this.catalog = buildCatalog(cosmo);
    this.cosmic?.setCosmology(cosmo, zStar);
  }

  setCmbTexture(rgba: Uint8ClampedArray, w: number, h: number): void {
    this.cosmic?.setCmbTexture(rgba, w, h);
  }

  setLanguage(lang: Lang): void {
    this.lang = lang;
  }

  setSettings(s: Partial<EngineSettings>): void {
    this.settings = { ...this.settings, ...s };
    this.bloom.enabled = this.settings.bloom;
    this.cam.autoRotate = this.settings.autoRotate;
    if (!this.settings.labels) this.labels.clear();
  }

  setSelected(id: string | null): void {
    this.selected = id;
  }

  setMode(mode: EngineMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    if (mode === 'evolution' && !this.evo) {
      this.evo = new EvolutionScene(this.canvas, this.settings.quality);
      this.evo.resize(this.width / this.height);
    }
    this.evo?.setActive(mode === 'evolution');
    if (mode === 'explore') this.cam.attach(this.canvas);
    else this.cam.detach();
    if (mode !== 'explore') this.labels.clear();
  }

  applyEvolution(v: EvoVisual, showDM: boolean): void {
    this.evo?.apply(v, showDM);
  }

  setTime(jd: number): void {
    this.jd = jd;
  }

  flyTo(id: string, logDistance?: number, up?: Vec3): void {
    const o = this.catalog?.byId.get(id);
    if (!o) return;
    const focus = o.dynamic ? () => bodyPosition(id, this.jd) : () => o.position;
    this.focusId = id;
    this.cb.onFocus(id);
    this.cam.flyTo({
      focus,
      distance: logDistance !== undefined ? Math.pow(10, logDistance) : o.viewDistance,
      up: up ?? o.up,
      minDistance: approachLimit(o.kind, o.radius),
    });
  }

  /** Select an object and move about 10× closer, or frame it when it is still far away. */
  zoomInOn(id: string): void {
    const o = this.catalog?.byId.get(id);
    if (!o) return;
    this.cb.onSelect(id);
    const camD = this.focusId === id ? this.cam.distance : this.distanceTo(id);
    if (camD > o.viewDistance * 1.4) {
      this.flyTo(id);
      return;
    }
    const next = Math.max(approachLimit(o.kind, o.radius) * 1.02, camD / 10);
    this.flyTo(id, Math.log10(next));
  }

  /** Select an object and step back out, at least to a wide view of it. */
  zoomOutFrom(id: string): void {
    const o = this.catalog?.byId.get(id);
    if (!o) return;
    this.cb.onSelect(id);
    const camD = this.focusId === id ? this.cam.distance : this.distanceTo(id);
    const next = Math.min(Math.pow(10, this.cam.maxLog) * 0.98, Math.max(camD, o.viewDistance) * 8);
    this.flyTo(id, Math.log10(next));
  }

  flyToPreset(id: string): void {
    const p = SCALE_PRESETS.find((x) => x.id === id);
    if (p) this.flyTo(p.focusId, p.log, p.up);
  }

  zoomBy(dLog: number): void {
    this.cam.zoomBy(dLog);
  }

  private onCanvasClick = (e: PointerEvent) => {
    if (this.mode !== 'explore' || !this.cam.wasClick || e.button !== 0) return;
    const id = this.pickObject(e.clientX, e.clientY);
    if (id) this.armObjectClick(id);
    else {
      this.clearArmed();
      this.cb.onSelect(null);
    }
  };

  private onCanvasDouble = (e: MouseEvent) => {
    if (this.mode !== 'explore') return;
    const id = this.pickObject(e.clientX, e.clientY);
    if (id) this.frameObject(id);
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.mode !== 'explore') return;
    this.labels.setHover(this.pickObject(e.clientX, e.clientY));
  };

  /** Labels sit above the canvas, so the wheel has to be forwarded or it never reaches the camera. */
  private onLabelWheel = (e: WheelEvent) => {
    if (this.mode !== 'explore') return;
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    const anchor = this.cam.resolveAnchor?.(e.clientX, e.clientY) ?? null;
    this.cam.zoomBy(dy * 0.0016, anchor);
    this.cam.onInteract?.();
  };

  /** A single click zooms in; a second click, or a double-click, frames the best view. */
  private armObjectClick(id: string): void {
    if (this.clickTimer && this.armedId === id) {
      this.frameObject(id);
      return;
    }
    this.clearArmed();
    this.armedId = id;
    this.clickTimer = window.setTimeout(() => {
      this.clickTimer = 0;
      this.armedId = null;
      this.zoomInOn(id);
    }, 260);
  }

  private frameObject(id: string): void {
    this.clearArmed();
    this.cb.onSelect(id);
    this.flyTo(id);
  }

  private clearArmed(): void {
    if (this.clickTimer) {
      clearTimeout(this.clickTimer);
      this.clickTimer = 0;
    }
    this.armedId = null;
  }

  private distanceTo(id: string): number {
    const p = this.positionOf(id);
    const c = this.cam.camPos;
    return Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]);
  }

  private pointerLocal(clientX: number, clientY: number): { x: number; y: number; w: number; h: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return null;
    return { x: clientX - rect.left, y: clientY - rect.top, w: rect.width, h: rect.height };
  }

  /**
   * Object under the pointer: a label first, otherwise the nearest catalog body whose
   * projected disc covers the cursor. Huge shells only respond near their centre.
   */
  private pickObject(clientX: number, clientY: number): string | null {
    const local = this.pointerLocal(clientX, clientY);
    if (!local) return null;
    const labeled = this.labels.pick(local.x, local.y, 22);
    if (labeled && this.catalog?.byId.has(labeled)) return labeled;
    const objects = this.catalog?.objects;
    if (!objects) return null;
    const tan = Math.tan((this.cam.fov * Math.PI) / 360);
    const viewport = Math.min(local.w, local.h);
    let bestId: string | null = null;
    let bestDist = Infinity;
    let bestPx = Infinity;
    for (const o of objects) {
      const pos = o.dynamic ? bodyPosition(o.id, this.jd) : o.position;
      const sp = projectToScreen(pos, this.cam.camPos, this.cam.camQuat, this.cam.fov, local.w, local.h);
      if (!sp) continue;
      const angular = (Math.max(o.radius, 1) / sp.depth) * (local.h / 2) / tan;
      const rad = pickRadiusPx(o.kind, angular, viewport);
      const sd = Math.hypot(sp.x - local.x, sp.y - local.y);
      if (sd > rad) continue;
      const closer = sp.depth < bestDist * 0.98;
      const tighter = sp.depth <= bestDist * 1.02 && sd < bestPx;
      if (bestId === null || closer || tighter) {
        bestId = o.id;
        bestDist = sp.depth;
        bestPx = sd;
      }
    }
    return bestId;
  }

  /** World point a scroll should hold still: the object under the cursor, or the focus plane. */
  private zoomAnchor(clientX: number, clientY: number): Vec3 | null {
    if (this.cam.flight) return null;
    const id = this.pickObject(clientX, clientY);
    const o = id ? this.catalog?.byId.get(id) : undefined;
    if (o && id) {
      const pos = this.positionOf(id);
      const focus = this.cam.tracking ? this.cam.tracking() : this.cam.focus;
      const sep = Math.hypot(pos[0] - focus[0], pos[1] - focus[1], pos[2] - focus[2]);
      const limit = approachLimit(o.kind, o.radius);
      if (sep < this.cam.distance * 0.22 && limit < this.cam.distance * 0.98) {
        const already = this.focusId === id;
        this.cam.minDistance = limit;
        if (!already) {
          this.focusId = id;
          this.cb.onFocus(id);
        }
        if (already && sep < this.cam.distance * 0.04) {
          this.cam.tracking = o.dynamic ? () => bodyPosition(id, this.jd) : () => o.position;
        }
      }
      return pos;
    }
    return this.cursorOnFocusPlane(clientX, clientY);
  }

  /** Intersection of the cursor ray with the plane through the focus, facing the camera. */
  private cursorOnFocusPlane(clientX: number, clientY: number): Vec3 | null {
    const local = this.pointerLocal(clientX, clientY);
    if (!local) return null;
    const ndcX = (local.x / local.w) * 2 - 1;
    const ndcY = 1 - (local.y / local.h) * 2;
    const tan = Math.tan((this.cam.fov * Math.PI) / 360);
    const dir = new THREE.Vector3(ndcX * (local.w / local.h) * tan, ndcY * tan, -1).applyQuaternion(this.cam.camQuat);
    const focus = this.cam.tracking ? this.cam.tracking() : this.cam.focus;
    const cam = this.cam.camPos;
    const nx = focus[0] - cam[0];
    const ny = focus[1] - cam[1];
    const nz = focus[2] - cam[2];
    const denom = dir.x * nx + dir.y * ny + dir.z * nz;
    if (denom <= 1e-12) return null;
    const s = (nx * nx + ny * ny + nz * nz) / denom;
    if (s <= 0) return null;
    return [cam[0] + dir.x * s, cam[1] + dir.y * s, cam[2] + dir.z * s];
  }

  private resize(): void {
    const parent = this.canvas.parentElement ?? this.canvas;
    const w = Math.max(1, parent.clientWidth);
    const h = Math.max(1, parent.clientHeight);
    this.width = w;
    this.height = h;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w * dpr, h * dpr);
    this.evo?.resize(w / h);
  }

  private frameContext(dt: number): FrameContext {
    const cam = this.cam;
    return {
      camPos: cam.camPos,
      camQuat: cam.camQuat,
      focus: cam.focus,
      viewDist: cam.distance,
      logView: cam.logDist,
      jd: this.jd,
      time: this.time,
      dt,
      fov: cam.fov,
      aspect: this.width / this.height,
      heightPx: this.height * this.renderer.getPixelRatio(),
      settings: this.settings,
      focusId: this.focusId,
    };
  }

  private drawScene(renderer: THREE.WebGLRenderer): void {
    if (this.mode === 'evolution' && this.evo) {
      renderer.setClearColor(this.evo.clearColor, 1);
      renderer.clear(true, true, true);
      renderer.render(this.evo.scene, this.evo.camera);
      return;
    }
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, true, true);
    for (const layer of this.layers) {
      if (layer.opacity <= 0.002) continue;
      renderer.clearDepth();
      renderer.render(layer.scene, layer.camera);
    }
  }

  private loop = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    if (this.mode === 'idle' || !this.ready) return;
    this.time += dt;
    if (dt > 0) this.fps += (1 / dt - this.fps) * 0.05;
    if (this.playing) this.jd += this.rate * dt;

    const fovRad = (this.cam.fov * Math.PI) / 180;
    shared.uScale.value = (this.height * this.renderer.getPixelRatio()) / (2 * Math.tan(fovRad / 2));

    if (this.mode === 'evolution' && this.evo) {
      this.evo.update(dt);
      shared.uScale.value = (this.height * this.renderer.getPixelRatio()) / (2 * Math.tan((this.evo.camera.fov * Math.PI) / 360));
    } else {
      this.cam.update(dt);
      const focusObj = this.focusId ? (this.catalog?.byId.get(this.focusId) ?? null) : null;
      this.focusBody.setTarget(focusObj, focusObj ? this.positionOf(focusObj.id) : [0, 0, 0]);
      const ctx = this.frameContext(dt);
      for (const layer of this.layers) {
        layer.opacity = layer.computeOpacity(ctx);
        if (layer.opacity <= 0.002) continue;
        layer.syncCamera(ctx);
        layer.update(ctx);
      }
      this.updateLabels(ctx);
    }
    this.composer.render(dt);

    this.hudTimer += dt;
    if (this.hudTimer > 0.12) {
      this.hudTimer = 0;
      const p = this.cam.camPos;
      this.cb.onHud({
        logView: this.cam.logDist,
        viewDist: this.cam.distance,
        focusId: this.focusId,
        camFromSun: Math.hypot(p[0], p[1], p[2]),
        jd: this.jd,
        fps: this.fps,
        flying: !!this.cam.flight,
      });
    }
  };

  private updateLabels(ctx: FrameContext): void {
    if (!this.settings.labels || !this.catalog) {
      this.labels.clear();
      return;
    }
    const cands: LabelCandidate[] = [];
    const camPos = ctx.camPos;
    for (const o of this.catalog.objects) {
      const forced = o.id === this.selected || o.id === this.focusId;
      const base = o.dynamic ? bodyPosition(o.id, this.jd) : o.position;
      const p: Vec3 = o.labelOffset ? [base[0] + o.labelOffset[0], base[1] + o.labelOffset[1], base[2] + o.labelOffset[2]] : base;
      const d = Math.hypot(p[0] - camPos[0], p[1] - camPos[1], p[2] - camPos[2]);
      const visible =
        d < o.labelMaxDist && d > (o.labelMinDist ?? 0) && ctx.viewDist >= (o.labelMinView ?? 0);
      if (!visible && !(forced && d < o.labelMaxDist * 30)) continue;
      cands.push({
        id: o.id,
        text: o.name[this.lang],
        position: p,
        color: o.color,
        priority: o.priority,
        kind: o.kind,
        interactive: true,
        forced,
        selected: o.id === this.selected,
      });
    }
    if (this.cosmic && this.cosmic.opacity > 0.05) {
      for (const s of this.cosmic.shellLabels(ctx)) {
        cands.push({
          id: `shell-${s.key}`,
          text: s.text[this.lang],
          position: s.position,
          color: s.color,
          priority: 1,
          kind: 'shell',
          interactive: false,
        });
      }
    }
    this.labels.update(cands, camPos, ctx.camQuat, ctx.fov, this.width, this.height);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.clearArmed();
    this.resizeObserver.disconnect();
    this.cam.detach();
    this.canvas.removeEventListener('pointerup', this.onCanvasClick);
    this.canvas.removeEventListener('dblclick', this.onCanvasDouble);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.labelRoot.removeEventListener('pointermove', this.onPointerMove);
    this.labelRoot.removeEventListener('wheel', this.onLabelWheel);
    this.evo?.dispose();
    this.labels.clear();
    this.labelRoot.replaceChildren();
    this.composer.dispose();
    this.renderer.dispose();
  }
}
