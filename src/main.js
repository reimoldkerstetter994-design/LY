import { Game } from "./game.js";

const game = new Game();
game.load().catch((err) => {
  const el = document.getElementById("loader");
  el.textContent = `加载失败：${err.message}`;
  console.error(err);
});
