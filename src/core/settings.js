/**
 * Persisted user settings + quality / difficulty presets.
 */

const KEY = 'hollow-ward.settings.v1';

export const QUALITY = {
  low: {
    label: '流畅',
    labelEn: 'Performance',
    pixelRatio: 0.75,
    shadowMapSize: 512,
    shadowLights: 1,
    ao: false,
    bloom: true,
    bloomStrength: 0.42,
    smaa: false,
    textureSize: 256,
    anisotropy: 2,
    fogDensity: 0.062,
    propDensity: 0.55,
    volumetricSteps: 0,
    lampShadows: false,
  },
  medium: {
    label: '均衡',
    labelEn: 'Balanced',
    pixelRatio: 1,
    shadowMapSize: 1024,
    shadowLights: 2,
    ao: false,
    bloom: true,
    bloomStrength: 0.5,
    smaa: true,
    textureSize: 512,
    anisotropy: 4,
    fogDensity: 0.055,
    propDensity: 0.85,
    volumetricSteps: 24,
    lampShadows: true,
  },
  high: {
    label: '极致',
    labelEn: 'Ultra',
    pixelRatio: 1.25,
    shadowMapSize: 2048,
    shadowLights: 3,
    ao: true,
    bloom: true,
    bloomStrength: 0.55,
    smaa: true,
    textureSize: 1024,
    anisotropy: 8,
    fogDensity: 0.05,
    propDensity: 1,
    volumetricSteps: 40,
    lampShadows: true,
  },
};

export const DIFFICULTY = {
  calm: {
    label: '胆小',
    labelEn: 'Timid',
    fuses: 4,
    monsterSpeed: 2.35,
    monsterHunger: 0.68,
    hearingRange: 15,
    sightRange: 15,
    sanityDrain: 0.7,
    batteryDrain: 0.75,
    grabTime: 1.05,
    stalkChance: 0.35,
    extraMonsterAfter: Infinity,
  },
  normal: {
    label: '标准',
    labelEn: 'Standard',
    fuses: 5,
    monsterSpeed: 2.95,
    monsterHunger: 1,
    hearingRange: 21,
    sightRange: 21,
    sanityDrain: 1,
    batteryDrain: 1,
    grabTime: 0.72,
    stalkChance: 0.55,
    extraMonsterAfter: 3,
  },
  nightmare: {
    label: '噩梦',
    labelEn: 'Nightmare',
    fuses: 6,
    monsterSpeed: 3.5,
    monsterHunger: 1.4,
    hearingRange: 28,
    sightRange: 27,
    sanityDrain: 1.45,
    batteryDrain: 1.3,
    grabTime: 0.42,
    stalkChance: 0.8,
    extraMonsterAfter: 2,
  },
};

const DEFAULTS = {
  quality: 'medium',
  difficulty: 'normal',
  sensitivity: 1,
  volume: 0.8,
  fov: 75,
  headBob: true,
  flashes: true,
  showStats: false,
};

export class Settings {
  constructor() {
    this.data = { ...DEFAULTS };
    this.load();
  }

  get q() {
    return QUALITY[this.data.quality] ?? QUALITY.medium;
  }

  get diff() {
    return DIFFICULTY[this.data.difficulty] ?? DIFFICULTY.normal;
  }

  get(k) {
    return this.data[k];
  }

  set(k, v) {
    this.data[k] = v;
    this.save();
  }

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) Object.assign(this.data, JSON.parse(raw));
    } catch {
      /* storage disabled — defaults are fine */
    }
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* ignore */
    }
  }
}
