import type { Vec3 } from '../physics/coords';
import type { Bilingual } from '../physics/timeline';

export type { Bilingual };

export type ObjectKind =
  | 'star'
  | 'planet'
  | 'dwarf-planet'
  | 'moon'
  | 'probe'
  | 'region'
  | 'nebula'
  | 'star-cluster'
  | 'black-hole'
  | 'galaxy'
  | 'group'
  | 'cluster'
  | 'supercluster'
  | 'void'
  | 'structure'
  | 'quasar'
  | 'cmb'
  | 'horizon';

/** Grouping used by the catalog browser, ordered from small to large scales. */
export type ScaleGroup = 'solar' | 'stars' | 'galaxy' | 'local-group' | 'local-universe' | 'deep';

export interface Fact {
  label: Bilingual;
  value: Bilingual | string;
}

export interface CatalogObject {
  id: string;
  name: Bilingual;
  kind: ObjectKind;
  group: ScaleGroup;
  /** World-frame position in metres relative to the Sun (static objects). */
  position: Vec3;
  /** Physical radius in metres. */
  radius: number;
  /** Distance from the Sun in metres (for display). */
  distance: number;
  /** Redshift for cosmologically distant objects. */
  z?: number;
  desc: Bilingual;
  facts: Fact[];
  /** Hide the label when the camera is farther than this (metres). */
  labelMaxDist: number;
  /** Hide the label when the camera is closer than this (metres). */
  labelMinDist?: number;
  /** Hide the label unless the camera is at least this far from its focus (metres). */
  labelMinView?: number;
  /** Where to draw the label relative to `position` (world metres), e.g. on a sphere's rim. */
  labelOffset?: Vec3;
  /** Larger values win when labels overlap. */
  priority: number;
  /** Preferred "up" axis for orbiting this object (world frame). */
  up?: Vec3;
  /** Default viewing distance when flying to this object (metres). */
  viewDistance: number;
  color?: string;
  /** Moving objects provide a position function of Julian date (world metres). */
  dynamic?: boolean;
  parent?: string;
}
