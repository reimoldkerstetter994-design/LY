export const BLOCK_TYPES = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  WOOD: 4,
  LEAVES: 5,
  SAND: 6,
  WATER: 7,
  BRICK: 8,
  GLASS: 9,
};

export const BLOCK_DEFS = {
  [BLOCK_TYPES.AIR]: { name: '空气', color: null, solid: false, transparent: true },
  [BLOCK_TYPES.GRASS]: { name: '草方块', color: '#5a9e3e', topColor: '#6bb84a', sideColor: '#7a5c3a', solid: true },
  [BLOCK_TYPES.DIRT]: { name: '泥土', color: '#8b6914', solid: true },
  [BLOCK_TYPES.STONE]: { name: '石头', color: '#888888', solid: true },
  [BLOCK_TYPES.WOOD]: { name: '木头', color: '#6b4226', topColor: '#8b5a2b', sideColor: '#5a3520', solid: true },
  [BLOCK_TYPES.LEAVES]: { name: '树叶', color: '#2d6b2d', solid: true, transparent: true },
  [BLOCK_TYPES.SAND]: { name: '沙子', color: '#d4c48a', solid: true },
  [BLOCK_TYPES.WATER]: { name: '水', color: '#3388cc', solid: false, transparent: true, opacity: 0.6 },
  [BLOCK_TYPES.BRICK]: { name: '砖块', color: '#a0522d', solid: true },
  [BLOCK_TYPES.GLASS]: { name: '玻璃', color: '#aaddff', solid: true, transparent: true, opacity: 0.3 },
};

export const HOTBAR_BLOCKS = [
  BLOCK_TYPES.GRASS,
  BLOCK_TYPES.DIRT,
  BLOCK_TYPES.STONE,
  BLOCK_TYPES.WOOD,
  BLOCK_TYPES.LEAVES,
  BLOCK_TYPES.SAND,
  BLOCK_TYPES.BRICK,
  BLOCK_TYPES.GLASS,
  BLOCK_TYPES.WATER,
];

export function isSolid(type) {
  return BLOCK_DEFS[type]?.solid ?? false;
}

export function isTransparent(type) {
  return BLOCK_DEFS[type]?.transparent ?? false;
}
