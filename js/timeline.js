export const DURATION = 30 * 60;

export const palettes = {
  ink: ["#090908", "#161410", "#c6a56e", "#f3efe6"],
  dawn: ["#140e0c", "#3c2418", "#e4c09a", "#f6f1e8"],
  stone: ["#101214", "#2a2e32", "#b7b1a6", "#ece7df"],
  water: ["#0b1418", "#14383f", "#a9d4d6", "#e8f3f3"],
  paper: ["#d8d0c3", "#efe8dc", "#7a6e62", "#1b1714"],
  metal: ["#0e1014", "#2a3140", "#d5dbe6", "#f4f6f8"],
  night: ["#07080e", "#15182a", "#e6b15c", "#f4efe4"],
};

export const MOTIFS = [
  "room",
  "wall",
  "dust",
  "chair",
  "window",
  "still",
  "stone",
  "water",
  "paper",
  "metal",
  "clock",
  "shadow",
  "wait",
  "nightedge",
  "hold",
  "windows",
  "rain",
  "lamps",
  "onewindow",
  "far",
];

export const beats = [
  { start: 0, dur: 18, chapter: "序", kind: "void", palette: "ink" },
  { start: 18, dur: 52, chapter: "序", kind: "horizon", palette: "ink" },
  { start: 70, dur: 90, chapter: "序", kind: "title", title: "LY", line: "一部关于光的影片", palette: "ink" },
  { start: 160, dur: 80, chapter: "序", kind: "verse", line: "光还没有名字", palette: "dawn" },

  { start: 240, dur: 60, chapter: "静", kind: "verse", motif: "room", line: "房间记得黄昏", palette: "dawn" },
  { start: 300, dur: 60, chapter: "静", kind: "verse", motif: "wall", line: "墙比人更慢", palette: "ink" },
  { start: 360, dur: 60, chapter: "静", kind: "verse", motif: "dust", line: "尘埃比脚步诚实", palette: "stone" },
  { start: 420, dur: 60, chapter: "静", kind: "verse", motif: "chair", line: "一把椅子，对着空", palette: "ink" },
  { start: 480, dur: 60, chapter: "静", kind: "verse", motif: "window", line: "窗把天空裁成方形", palette: "dawn" },
  { start: 540, dur: 60, chapter: "静", kind: "verse", motif: "still", line: "静，是一种亮度", palette: "paper" },

  { start: 600, dur: 90, chapter: "材", kind: "study", motif: "stone", line: "石，冷却了金", palette: "stone" },
  { start: 690, dur: 90, chapter: "材", kind: "study", motif: "water", line: "水记住天空的形状", palette: "water" },
  { start: 780, dur: 90, chapter: "材", kind: "study", motif: "paper", line: "纸上留着一句没写完的话", palette: "paper" },
  { start: 870, dur: 90, chapter: "材", kind: "study", motif: "metal", line: "金属只反射，不解释", palette: "metal" },

  { start: 960, dur: 60, chapter: "时", kind: "study", motif: "clock", line: "一秒被拉成一条河", palette: "ink" },
  { start: 1020, dur: 60, chapter: "时", kind: "verse", motif: "shadow", line: "影子比时钟先到", palette: "dawn" },
  { start: 1080, dur: 60, chapter: "时", kind: "verse", motif: "wait", line: "我们把等待做成形状", palette: "stone" },
  { start: 1140, dur: 60, chapter: "时", kind: "verse", motif: "nightedge", line: "夜色从边缘渗进来", palette: "night" },
  { start: 1200, dur: 60, chapter: "时", kind: "verse", motif: "hold", line: "时间不走，它停在这里", palette: "ink" },

  { start: 1260, dur: 60, chapter: "城", kind: "study", motif: "windows", line: "窗格把夜分成许多小夜", palette: "night" },
  { start: 1320, dur: 60, chapter: "城", kind: "study", motif: "rain", line: "雨是城市的笔迹", palette: "water" },
  { start: 1380, dur: 60, chapter: "城", kind: "verse", motif: "lamps", line: "街灯站成一列缓慢的金", palette: "night" },
  { start: 1440, dur: 60, chapter: "城", kind: "study", motif: "onewindow", line: "有一扇窗还亮着", palette: "night" },
  { start: 1500, dur: 60, chapter: "城", kind: "verse", motif: "far", line: "远方不肯熄灭", palette: "dawn" },

  { start: 1560, dur: 50, chapter: "名", kind: "title", title: "LY", line: "", palette: "ink" },
  { start: 1610, dur: 60, chapter: "名", kind: "verse", line: "不是一句口号", palette: "ink" },
  { start: 1670, dur: 70, chapter: "名", kind: "verse", line: "是把光放回它的位置", palette: "dawn" },
  { start: 1740, dur: 60, chapter: "名", kind: "end", line: "此后，慢慢地亮", palette: "paper" },
];

export const chapters = [];
for (const beat of beats) {
  if (!chapters.some((chapter) => chapter.id === beat.chapter)) {
    chapters.push({ id: beat.chapter, start: beat.start });
  }
}

export function beatAt(time) {
  const t = Math.min(Math.max(time, 0), DURATION);
  if (t >= DURATION) return beats[beats.length - 1];
  return beats.find((beat) => t >= beat.start && t < beat.start + beat.dur) ?? null;
}

export function previousBeat(beat) {
  const index = beats.indexOf(beat);
  return index > 0 ? beats[index - 1] : null;
}

export function formatTime(time) {
  const whole = Math.min(DURATION, Math.max(0, Math.floor(time)));
  const minutes = Math.floor(whole / 60);
  const seconds = whole % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
