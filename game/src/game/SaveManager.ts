import type { BlockType } from './BlockRegistry';

const STORAGE_KEY = 'devworld-save-v1';

export interface WorldSaveData {
  version: number;
  blocks: Array<{ x: number; y: number; z: number; type: BlockType }>;
  player: { x: number; y: number; z: number };
  timestamp: number;
}

export class SaveManager {
  save(data: WorldSaveData): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  load(): WorldSaveData | null {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as WorldSaveData;
    } catch {
      return null;
    }
  }

  clear(): void {
    localStorage.removeItem(STORAGE_KEY);
  }

  exportJson(data: WorldSaveData): void {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `devworld-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
