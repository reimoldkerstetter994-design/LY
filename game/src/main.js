import { Game } from "./game.js";

const canvas = document.getElementById("c");
const game = new Game(canvas);

document.getElementById("start").addEventListener("click", () => game.start());
document.getElementById("resume").addEventListener("click", () => game.resume());
document.getElementById("again").addEventListener("click", () => game.restart());

window.addEventListener("resize", () => game.resize());
window.addEventListener("keydown", (e) => game.onKey(e, true));
window.addEventListener("keyup", (e) => game.onKey(e, false));
canvas.addEventListener("mousedown", (e) => game.onPointerDown(e));
window.addEventListener("mouseup", () => game.onPointerUp());
window.addEventListener("mousemove", (e) => game.onPointerMove(e));
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
