import { Game } from './game/Game';
import type { BlockType } from './game/BlockRegistry';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const startScreen = document.getElementById('start-screen')!;
const hud = document.getElementById('hud')!;
const pauseMenu = document.getElementById('pause-menu')!;
const startBtn = document.getElementById('start-btn')!;
const resumeBtn = document.getElementById('resume-btn')!;
const resetBtn = document.getElementById('reset-btn')!;
const exportBtn = document.getElementById('export-btn')!;
const blockCountEl = document.getElementById('block-count')!;
const positionEl = document.getElementById('position-display')!;
const saveIndicator = document.getElementById('save-indicator')!;
const toolbar = document.getElementById('toolbar')!;

const game = new Game(canvas, {
  onSaveIndicator: (pending) => {
    saveIndicator.textContent = pending ? '保存中...' : '已保存';
    saveIndicator.classList.toggle('pending', pending);
  },
  onBlockCount: (count) => {
    blockCountEl.textContent = `方块: ${count}`;
  },
  onPosition: (x, y, z) => {
    positionEl.textContent = `位置: ${x}, ${y}, ${z}`;
  },
  onPause: (paused) => {
    pauseMenu.classList.toggle('hidden', !paused);
  },
});

function selectBlock(type: BlockType): void {
  game.setSelectedBlock(type);
  toolbar.querySelectorAll('.tool-slot').forEach((slot) => {
    slot.classList.toggle('active', slot.getAttribute('data-block') === type);
  });
}

toolbar.querySelectorAll('.tool-slot').forEach((slot) => {
  slot.addEventListener('click', () => {
    selectBlock(slot.getAttribute('data-block') as BlockType);
  });
});

startBtn.addEventListener('click', () => {
  startScreen.classList.add('hidden');
  hud.classList.remove('hidden');
  game.start();
});

resumeBtn.addEventListener('click', () => {
  game.resume();
});

resetBtn.addEventListener('click', () => {
  if (confirm('确定要重置世界吗？所有建造内容将丢失。')) {
    game.resetWorld();
    game.resume();
  }
});

exportBtn.addEventListener('click', () => {
  game.exportSave();
});

document.addEventListener('keydown', (e) => {
  if (e.code.startsWith('Digit') && e.code >= 'Digit1' && e.code <= 'Digit5') {
    const index = parseInt(e.code.replace('Digit', ''), 10) - 1;
    const types: BlockType[] = ['grass', 'stone', 'wood', 'glass', 'metal'];
    selectBlock(types[index]);
  }
});

// 阻止右键菜单
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
