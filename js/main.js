import { createScore } from "./audio.js";
import { render, textEnvelope } from "./render.js";
import { beatAt, chapters, DURATION, formatTime } from "./timeline.js";

const ASPECT = 2.39;
const picture = document.querySelector("#picture");
const frame = document.querySelector("#frame");
const plate = document.querySelector("#plate");
const kicker = document.querySelector("#kicker");
const hero = document.querySelector("#hero");
const line = document.querySelector("#line");
const hud = document.querySelector("#hud");
const elapsed = document.querySelector("#elapsed");
const scrub = document.querySelector("#scrub");
const fill = document.querySelector("#fill");
const chapterNav = document.querySelector("#chapters");
const gate = document.querySelector("#gate");
const app = document.querySelector("#app");
const replay = document.querySelector("#replay");
const ctx = picture.getContext("2d");
const score = createScore();

let view = { w: 1280, h: 536 };
let filmTime = 0;
let playing = false;
let lastTs = 0;
let hideTimer = 0;

scrub.max = String(DURATION);

chapters.forEach((chapter, index) => {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = chapter.id;
  button.dataset.start = String(chapter.start);
  button.setAttribute("aria-label", `跳到${chapter.id}`);
  if (index === 0) button.setAttribute("aria-current", "true");
  chapterNav.append(button);
});

function fit(width, height) {
  let w = width;
  let h = w / ASPECT;
  if (h > height) {
    h = height;
    w = h * ASPECT;
  }
  return {
    x: (width - w) / 2,
    y: (height - h) / 2,
    w,
    h,
  };
}

function layout() {
  const rect = fit(window.innerWidth, window.innerHeight);
  view = rect;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  for (const element of [picture, frame, plate]) {
    element.style.left = `${rect.x}px`;
    element.style.top = `${rect.y}px`;
    element.style.width = `${rect.w}px`;
    element.style.height = `${rect.h}px`;
  }
  frame.style.left = `${rect.x + 22}px`;
  frame.style.top = `${rect.y + 18}px`;
  frame.style.width = `${rect.w - 44}px`;
  frame.style.height = `${rect.h - 36}px`;
  picture.width = Math.max(1, Math.round(rect.w * dpr));
  picture.height = Math.max(1, Math.round(rect.h * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  hud.style.left = `${rect.x}px`;
  hud.style.width = `${rect.w}px`;
  const below = rect.y + rect.h + 18;
  if (below + 72 < window.innerHeight) {
    hud.style.top = `${below}px`;
    hud.style.bottom = "auto";
  } else {
    hud.style.top = "auto";
    hud.style.bottom = "16px";
    hud.style.width = `${Math.min(rect.w - 48, window.innerWidth - 32)}px`;
    hud.style.left = `${rect.x + 24}px`;
  }
  replay.style.left = `${rect.x + rect.w / 2}px`;
  replay.style.top = `${rect.y + rect.h * 0.72}px`;
}

function seek(next, fromUser) {
  filmTime = Math.min(DURATION, Math.max(0, next));
  if (filmTime < DURATION) replay.hidden = true;
  if (fromUser) score.align(filmTime);
  draw();
}

function toggle() {
  if (gate.hidden === false) return;
  if (filmTime >= DURATION) {
    filmTime = 0;
    replay.hidden = true;
  }
  playing = !playing;
  app.classList.toggle("paused", !playing);
  if (playing) revealUi(true);
}

function revealUi(sticky) {
  app.classList.add("show-ui");
  clearTimeout(hideTimer);
  if (!sticky && playing) {
    hideTimer = setTimeout(() => app.classList.remove("show-ui"), 2200);
  }
}

function draw() {
  render(ctx, view.w, view.h, filmTime);
  const beat = beatAt(filmTime);
  const progress = beat.dur === 0 ? 1 : (filmTime - beat.start) / beat.dur;
  const opacity = textEnvelope(Math.min(1, progress), beat.kind);
  plate.style.opacity = opacity.toFixed(4);
  plate.dataset.tone = beat.palette === "paper" ? "light" : "dark";
  plate.className = beat.kind;
  const index = chapters.findIndex((chapter) => chapter.id === beat.chapter);
  const show = beat.kind !== "void" && beat.kind !== "horizon";
  kicker.textContent = show ? `${String(index).padStart(2, "0")}  ·  ${beat.chapter}` : "";
  hero.textContent = beat.kind === "title" ? beat.title || "" : "";
  line.textContent = show ? beat.line || "" : "";
  elapsed.textContent = formatTime(filmTime);
  scrub.value = String(filmTime);
  fill.style.width = `${(filmTime / DURATION) * 100}%`;
  for (const button of chapterNav.querySelectorAll("button")) {
    const current = beat.chapter === button.textContent;
    if (current) button.setAttribute("aria-current", "true");
    else button.removeAttribute("aria-current");
  }
  replay.hidden = filmTime < DURATION;
  app.classList.toggle("ended", filmTime >= DURATION);
}

function tick(ts) {
  if (!lastTs) lastTs = ts;
  const delta = Math.min(0.1, (ts - lastTs) / 1000);
  lastTs = ts;
  if (playing) {
    filmTime = Math.min(DURATION, filmTime + delta);
    if (filmTime >= DURATION) {
      playing = false;
      app.classList.add("paused", "show-ui");
    }
  }
  draw();
  score.sync(filmTime, playing && filmTime < DURATION);
  requestAnimationFrame(tick);
}

document.querySelector("#start").addEventListener("click", async () => {
  gate.hidden = true;
  app.classList.add("running");
  score.start();
  playing = true;
  app.focus();
  revealUi(false);
});

replay.addEventListener("click", () => {
  filmTime = 0;
  replay.hidden = true;
  playing = true;
  app.classList.remove("ended");
  app.classList.remove("paused");
  score.align(0);
  score.start();
});

picture.addEventListener("click", () => {
  if (!gate.hidden) return;
  toggle();
});

scrub.addEventListener("input", () => {
  seek(Number(scrub.value), true);
});

chapterNav.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  seek(Number(button.dataset.start), true);
  if (!playing && filmTime < DURATION && gate.hidden) {
    playing = true;
    app.classList.remove("paused");
  }
});

window.addEventListener("keydown", (event) => {
  if (event.target === scrub) return;
  if (event.code === "Space") {
    event.preventDefault();
    if (!gate.hidden) document.querySelector("#start").click();
    else toggle();
  } else if (event.code === "ArrowRight") {
    event.preventDefault();
    seek(filmTime + (event.shiftKey ? 60 : 10), true);
  } else if (event.code === "ArrowLeft") {
    event.preventDefault();
    seek(filmTime - (event.shiftKey ? 60 : 10), true);
  } else if (event.key === "f" || event.key === "F") {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  }
});

window.addEventListener("mousemove", () => {
  if (gate.hidden) revealUi(false);
});

window.addEventListener("resize", () => {
  layout();
  draw();
});

const params = new URLSearchParams(location.search);
if (params.has("t")) seek(Number(params.get("t")), true);
if (params.get("reveal") === "1") {
  gate.hidden = true;
  app.classList.add("running", "paused", "show-ui");
}
layout();
draw();
requestAnimationFrame(tick);
