import { create } from 'zustand';
import type { EngineSettings } from '../engine/core';
import type { HudInfo } from '../engine/Engine';
import { GYR_S } from '../physics/constants';
import { Cosmology, PLANCK18, type CosmoParams } from '../physics/cosmology';
import { julianDate } from '../physics/kepler';
import { computeIonizationHistory, type IonizationHistory } from '../physics/recombination';
import type { Lang } from '../utils/format';

export type Mode = 'explore' | 'evolution' | 'lab' | 'cmb' | 'calc';

export interface EvoState {
  /** log10 of cosmic time in seconds. */
  logT: number;
  playing: boolean;
  /** Decades of log-time per second of playback. */
  speed: number;
  showDM: boolean;
  physical: boolean;
}

export interface CmbOptions {
  seed: number;
  res: 256 | 512 | 1024;
  lMin: number;
  lMax: number;
  dipole: boolean;
  beam: number;
  range: number;
}

const PREFS_KEY = 'huanyu.prefs.v1';
interface Prefs {
  lang?: Lang;
  settings?: Partial<EngineSettings>;
}
function loadPrefs(): Prefs {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Prefs;
  } catch {
    return {};
  }
}
function savePrefs(p: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable */
  }
}

const prefs = typeof localStorage !== 'undefined' ? loadPrefs() : {};
const defaultLang: Lang = prefs.lang ?? (typeof navigator !== 'undefined' && !navigator.language.startsWith('zh') ? 'en' : 'zh');

function safeCosmology(p: CosmoParams, fallback?: Cosmology): Cosmology {
  try {
    const c = new Cosmology(p);
    if (!Number.isFinite(c.age0) && c.fate.kind !== 'bounce') throw new Error('invalid');
    return c;
  } catch {
    return fallback ?? new Cosmology(PLANCK18);
  }
}

const initialCosmo = new Cosmology(PLANCK18);

export interface AppState {
  mode: Mode;
  lang: Lang;
  params: CosmoParams;
  cosmo: Cosmology;
  hist: IonizationHistory;
  settings: EngineSettings;
  selectedId: string | null;
  focusId: string | null;
  hud: HudInfo | null;
  jd: number;
  rate: number;
  playing: boolean;
  evo: EvoState;
  cmbOpts: CmbOptions;
  panels: { catalog: boolean; settings: boolean; help: boolean };
  tour: { active: boolean; step: number };
  ready: boolean;
  loading: { progress: number; stage: string };
  webglError: boolean;
  setMode: (m: Mode) => void;
  setLang: (l: Lang) => void;
  setParams: (p: Partial<CosmoParams>) => void;
  resetParams: () => void;
  setSettings: (s: Partial<EngineSettings>) => void;
  select: (id: string | null) => void;
  setFocus: (id: string | null) => void;
  setHud: (h: HudInfo) => void;
  setTime: (jd: number) => void;
  setRate: (rate: number) => void;
  setPlaying: (p: boolean) => void;
  setEvo: (e: Partial<EvoState>) => void;
  setCmbOpts: (o: Partial<CmbOptions>) => void;
  togglePanel: (k: keyof AppState['panels'], v?: boolean) => void;
  setTour: (t: Partial<AppState['tour']>) => void;
  setLoading: (progress: number, stage: string) => void;
  setReady: () => void;
  setWebglError: () => void;
}

let histTimer: ReturnType<typeof setTimeout> | undefined;

export const useApp = create<AppState>((set, get) => ({
  mode: 'explore',
  lang: defaultLang,
  params: { ...PLANCK18 },
  cosmo: initialCosmo,
  hist: computeIonizationHistory(initialCosmo, PLANCK18.tau),
  settings: {
    labels: true,
    orbits: true,
    bloom: true,
    shells: true,
    cmbSky: false,
    autoRotate: false,
    quality: 'high',
    ...prefs.settings,
  },
  selectedId: null,
  focusId: 'sun',
  hud: null,
  jd: julianDate(new Date()),
  rate: 1 / 86400,
  playing: true,
  evo: { logT: Math.log10(initialCosmo.age0 * GYR_S), playing: false, speed: 1.2, showDM: false, physical: false },
  cmbOpts: { seed: 2026, res: 512, lMin: 2, lMax: 2000, dipole: false, beam: 0, range: 300 },
  panels: { catalog: true, settings: false, help: false },
  tour: { active: false, step: 0 },
  ready: false,
  loading: { progress: 0, stage: 'solar' },
  webglError: false,

  setMode: (mode) => set({ mode }),
  setLang: (lang) => {
    set({ lang });
    savePrefs({ lang, settings: get().settings });
  },
  setParams: (p) => {
    const params = { ...get().params, ...p };
    if (params.Ob > params.Om) params.Ob = params.Om;
    const cosmo = safeCosmology(params, get().cosmo);
    set({ params, cosmo });
    clearTimeout(histTimer);
    histTimer = setTimeout(() => {
      const c = get().cosmo;
      set({ hist: computeIonizationHistory(c, get().params.tau) });
    }, 140);
  },
  resetParams: () => {
    const cosmo = new Cosmology(PLANCK18);
    set({ params: { ...PLANCK18 }, cosmo, hist: computeIonizationHistory(cosmo, PLANCK18.tau) });
  },
  setSettings: (s) => {
    const settings = { ...get().settings, ...s };
    set({ settings });
    savePrefs({ lang: get().lang, settings });
  },
  select: (selectedId) => set({ selectedId }),
  setFocus: (focusId) => set({ focusId }),
  setHud: (hud) => set({ hud, jd: hud.jd }),
  setTime: (jd) => set({ jd }),
  setRate: (rate) => set({ rate }),
  setPlaying: (playing) => set({ playing }),
  setEvo: (e) => set({ evo: { ...get().evo, ...e } }),
  setCmbOpts: (o) => set({ cmbOpts: { ...get().cmbOpts, ...o } }),
  togglePanel: (k, v) => set({ panels: { ...get().panels, [k]: v ?? !get().panels[k] } }),
  setTour: (t) => set({ tour: { ...get().tour, ...t } }),
  setLoading: (progress, stage) => set({ loading: { progress, stage } }),
  setReady: () => set({ ready: true }),
  setWebglError: () => set({ webglError: true }),
}));
