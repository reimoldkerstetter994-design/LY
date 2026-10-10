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
import { LabelSystem, type LabelCandidate } from './Labels';
import { CosmicLayer } from './layers/CosmicLayer';
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

const SOLID_KINDS = new Set(['planet', 'dwarf-planet', 'moon', 'star']);

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
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.55, 0.12);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.labels = new LabelSystem(labelRoot, {
      onClick: (id) => this.cb.onSelect(id),
      onDoubleClick: (id) => {
        this.cb.onSelect(id);
        this.flyTo(id);
      },
    });

    this.cam.attach(canvas);
    canvas.addEventListener('pointerup', this.onCanvasClick);
    canvas.addEventListener('dblclick', this.onCanvasDouble);
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
    this.layers.sort((a, b) => b.unit - a.unit);
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
    const solid = SOLID_KINDS.has(o.kind) && o.radius > 1e5;
    this.focusId = id;
    this.cb.onFocus(id);
    this.cam.flyTo({
      focus,
      distance: logDistance !== undefined ? Math.pow(10, logDistance) : o.viewDistance,
      up: up ?? o.up,
      minDistance: solid ? o.radius * 1.15 : 1e3,
    });
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
    const rect = this.canvas.getBoundingClientRect();
    const id = this.labels.pick(e.clientX - rect.left, e.clientY - rect.top, 18);
    this.cb.onSelect(id);
  };

  private onCanvasDouble = (e: MouseEvent) => {
    if (this.mode !== 'explore') return;
    const rect = this.canvas.getBoundingClientRect();
    const id = this.labels.pick(e.clientX - rect.left, e.clientY - rect.top, 24);
    if (id) this.flyTo(id);
  };

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
    this.resizeObserver.disconnect();
    this.cam.detach();
    this.canvas.removeEventListener('pointerup', this.onCanvasClick);
    this.canvas.removeEventListener('dblclick', this.onCanvasDouble);
    this.evo?.dispose();
    this.labels.clear();
    this.labelRoot.replaceChildren();
    this.composer.dispose();
    this.renderer.dispose();
  }
}
