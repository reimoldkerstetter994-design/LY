import { Game } from './game.js';

const canvas = document.getElementById('game-canvas');
const game = new Game(canvas);

game.load().catch(err => {
  console.error('游戏加载失败:', err);
  document.getElementById('loading-text').textContent = '加载失败，请刷新页面重试';
});
