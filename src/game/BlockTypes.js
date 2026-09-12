export const BLOCK_TYPES = {
  grass: { id: "grass", name: "草地", color: "#3da633", model: "grass" },
  dirt: { id: "dirt", name: "泥土", color: "#73522e", model: "dirt" },
  stone: { id: "stone", name: "石头", color: "#808084", model: "stone" },
  wood: { id: "wood", name: "木材", color: "#8c6138", model: "wood" },
  glass: { id: "glass", name: "玻璃", color: "#99d9f2", model: "glass", transparent: true },
  brick: { id: "brick", name: "砖块", color: "#b34d38", model: "brick" },
  metal: { id: "metal", name: "金属", color: "#a8adb8", model: "metal" },
  glow: { id: "glow", name: "发光", color: "#33ccff", model: "glow", emissive: true },
};

export const BLOCK_KEYS = ["grass", "dirt", "stone", "wood", "glass", "brick", "metal", "glow"];

export const PROP_TYPES = {
  tree: { id: "tree", name: "树木", model: "tree", scale: 1 },
  crystal: { id: "crystal", name: "水晶", model: "crystal", scale: 1 },
  workbench: { id: "workbench", name: "工作台", model: "workbench", scale: 1 },
  lamp: { id: "lamp", name: "灯", model: "lamp", scale: 1 },
};

export const PROP_KEYS = ["tree", "crystal", "workbench", "lamp"];
