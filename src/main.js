import { Game } from "./game/game.js";

const canvas = document.getElementById("view");
const game = new Game(canvas);
window.game = game;
game.load().catch((err) => {
  console.error(err);
  const t = document.getElementById("loadtxt");
  if (t) t.textContent = `世界编译失败：${err.message}`;
});
