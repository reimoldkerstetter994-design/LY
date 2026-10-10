import type { Engine } from '../engine/Engine';

let engine: Engine | null = null;

export const setEngine = (e: Engine | null): void => {
  engine = e;
};

export const getEngine = (): Engine | null => engine;
