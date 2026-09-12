import * as THREE from 'three';

export type BlockType = 'grass' | 'stone' | 'wood' | 'glass' | 'metal';

export interface BlockDefinition {
  id: BlockType;
  name: string;
  color: number;
  topColor?: number;
  transparent?: boolean;
  metalness?: number;
  roughness?: number;
}

export const BLOCKS: Record<BlockType, BlockDefinition> = {
  grass: { id: 'grass', name: '草地', color: 0x78716c, topColor: 0x4ade80, roughness: 0.9 },
  stone: { id: 'stone', name: '石头', color: 0x9ca3af, roughness: 0.85 },
  wood: { id: 'wood', name: '木材', color: 0xa16207, roughness: 0.75 },
  glass: { id: 'glass', name: '玻璃', color: 0x93c5fd, transparent: true, roughness: 0.1, metalness: 0.1 },
  metal: { id: 'metal', name: '金属', color: 0xcbd5e1, metalness: 0.8, roughness: 0.25 },
};

const BLOCK_ORDER: BlockType[] = ['grass', 'stone', 'wood', 'glass', 'metal'];

export function getBlockByIndex(index: number): BlockType {
  return BLOCK_ORDER[index] ?? 'grass';
}

export function createBlockMaterial(type: BlockType): THREE.Material {
  const def = BLOCKS[type];

  if (def.transparent) {
    return new THREE.MeshPhysicalMaterial({
      color: def.color,
      transparent: true,
      opacity: 0.45,
      metalness: def.metalness ?? 0,
      roughness: def.roughness ?? 0.5,
      transmission: 0.6,
      thickness: 0.5,
    });
  }

  if (def.topColor) {
    const materials = [
      new THREE.MeshStandardMaterial({ color: def.color, roughness: def.roughness }),
      new THREE.MeshStandardMaterial({ color: def.color, roughness: def.roughness }),
      new THREE.MeshStandardMaterial({ color: def.topColor, roughness: def.roughness }),
      new THREE.MeshStandardMaterial({ color: def.color, roughness: def.roughness }),
      new THREE.MeshStandardMaterial({ color: def.color, roughness: def.roughness }),
      new THREE.MeshStandardMaterial({ color: def.color, roughness: def.roughness }),
    ];
    return materials as unknown as THREE.Material;
  }

  return new THREE.MeshStandardMaterial({
    color: def.color,
    metalness: def.metalness ?? 0,
    roughness: def.roughness ?? 0.7,
  });
}
