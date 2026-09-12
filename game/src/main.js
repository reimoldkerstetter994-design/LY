import { Game } from './game/Game.js';

const canvas = document.getElementById('game-canvas');
const game = new Game(canvas);

document.getElementById('play-btn').addEventListener('click', () => {
  game.start();
});

document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && game.running) {
    canvas.requestPointerLock();
  }
});
