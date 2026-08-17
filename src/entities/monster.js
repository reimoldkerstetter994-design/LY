/**
 * The thing in the ward.
 *
 * Built from primitives into a hand-rigged hierarchy and animated entirely in
 * code (no skinning, no assets): a hunched, over-long humanoid that walks with
 * a broken gait, drops onto all fours to sprint, and unhinges its jaw when it
 * commits to a chase.
 *
 * The AI is a state machine over an A* path with separate hearing and sight
 * senses, a short memory of where you were last, and a stalking behaviour that
 * exists purely to be glimpsed at the end of a corridor.
 */

import {
  Bone,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  LatheGeometry,
  Matrix4,
  SphereGeometry,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
  Vector2,
  Vector3,
  MathUtils,
} from 'three';
import { clamp, clamp01, damp, lerp, makeNoise2D, shortestAngle, smoothstep, TAU } from '../core/utils.js';
import { CELL } from '../world/maze.js';

const surfNoise = makeNoise2D(5150);

/**
 * The skin material reads vertex colours (the swept body bakes creases and
 * grime into them), so every other part sharing that material needs the
 * attribute too — a missing one reads as black.
 */
function whiteColors(geometry) {
  const n = geometry.attributes.position.count;
  geometry.setAttribute('color', new Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  return geometry;
}

const _v = new Vector3();
const _m = new Matrix4();
const _mRoot = new Matrix4();

/**
 * Two-link IK in the sagittal plane.
 *
 * Both chains hang along their bone-local -Y, so a limb is described entirely by
 * two rotations about X. Given where the foot (or hand) should be relative to
 * the hip (or shoulder), this returns those two angles.
 *
 * Solving for the *contact point* rather than animating the joint angles
 * directly is what keeps the feet on the floor. Hand-tuned angles cannot: the
 * relationship between them and the resulting limb length is trigonometric, so
 * the same swing amplitude that looks right mid-stride lifted the support foot
 * 70 cm into the air at the extremes of the sprint.
 *
 * @returns {{hip:number, knee:number}} rotations about X, knee relative to hip
 */
function twoLinkIK(dz, dy, upper, lower) {
  const MIN = Math.abs(upper - lower) + 0.03;
  const MAX = upper + lower - 0.012;
  let dist = Math.hypot(dz, dy);
  const clamped = clamp(dist, MIN, MAX);
  if (clamped !== dist) {
    const k = clamped / (dist || 1);
    dz *= k;
    dy *= k;
    dist = clamped;
  }
  // Direction from the joint to the target, as a rotation off straight-down.
  const aim = Math.atan2(-dz, -dy);
  const cosA = clamp((upper * upper + dist * dist - lower * lower) / (2 * upper * dist), -1, 1);
  const cosK = clamp((upper * upper + lower * lower - dist * dist) / (2 * upper * lower), -1, 1);
  // Elbow/knee is placed on the forward side of the hip-to-ankle line, which
  // gives a knee that points the way a human's does rather than a bird's.
  return { hip: aim + Math.acos(cosA), knee: Math.acos(cosK) - Math.PI };
}

/** Signed angular difference, wrapped to (-PI, PI]. */
function angDelta(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/**
 * Sweep a chain of rings into one continuous skinned surface.
 *
 * The creature's body is built entirely this way instead of from stacked
 * primitives. A capsule (or lathe) per bone segment is what made the earlier
 * version read as an artist's mannequin: the silhouette stepped at every joint,
 * a sphere ballooned out of each one, and anything added on top — ribs, brows,
 * cheekbones — sat *proud* of the surface and caught the torch as bright white
 * bars. Sweeping one skin lets those features be pushed into or pulled out of
 * the same surface, which is how they read on a real body.
 *
 * Rest pose is deliberately axis-aligned — every chain hangs straight down — so
 * the ring frame is constant: +cos(a) runs along -X, +sin(a) points at the
 * creature's face (-Z). a = PI/2 is therefore dead centre of the front.
 *
 * @param {object}   o
 * @param {Array}    o.stations  [{y, r, cx, cz, sz, w:[[bone,weight],...]}] bottom→top
 * @param {Map}      o.boneIndex bone → skeleton index
 * @param {number}   [o.radial]  vertices per ring
 * @param {Function} [o.deform]  (a, y, st) => radius delta in metres
 * @param {Function} [o.shade]   (a, y, st) => 0..1 darkening
 * @param {Function} [o.reweight] (a, y, st, out) => mutate the influence list
 */
function sweepSkin({ stations, boneIndex, radial = 22, deform, shade, reweight, uvScale = 1 }) {
  const pos = [];
  const uv = [];
  const col = [];
  const idx = [];
  const skinIdx = [];
  const skinWgt = [];

  // Arc length along the chain, for a v coordinate that doesn't stretch.
  const arc = [0];
  for (let i = 1; i < stations.length; i++) {
    const a = stations[i - 1];
    const b = stations[i];
    arc.push(arc[i - 1] + Math.hypot(b.y - a.y, (b.cx ?? 0) - (a.cx ?? 0), (b.cz ?? 0) - (a.cz ?? 0)));
  }
  const total = arc[arc.length - 1] || 1;

  for (let i = 0; i < stations.length; i++) {
    const st = stations[i];
    const cx = st.cx ?? 0;
    const cz = st.cz ?? 0;
    const sz = st.sz ?? 1;
    const v = arc[i] / total;
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU;
      let r = st.r + (deform ? deform(a, st.y, st) : 0);
      if (r < 0) r = 0;
      pos.push(cx - Math.cos(a) * r, st.y, cz - Math.sin(a) * r * sz);
      uv.push((j / radial) * uvScale, v * uvScale * (total / 0.6));
      const d = shade ? clamp01(shade(a, st.y, st)) : 0;
      col.push(1 - d, 1 - d, 1 - d);

      const infl = st.w.map(([b, w]) => [b, w]);
      reweight?.(a, st.y, st, infl);
      // Normalise and pad to the four slots three.js expects.
      let sum = 0;
      for (const e of infl) sum += e[1];
      if (!sum) sum = 1;
      infl.sort((p, q) => q[1] - p[1]);
      for (let k = 0; k < 4; k++) {
        const e = infl[k];
        skinIdx.push(e ? boneIndex.get(e[0]) : 0);
        skinWgt.push(e ? e[1] / sum : 0);
      }
    }
  }

  // Winding has to follow the direction the stations run: the torso is listed
  // bottom-up and the limbs top-down, and getting this wrong turns the surface
  // inside out. Inverted normals don't vanish — they light as though the surface
  // faced away, which is why the arms and legs first came out looking like flat
  // dark ribbons.
  const ascending = stations[stations.length - 1].y >= stations[0].y;
  const perRing = radial + 1;
  for (let i = 0; i < stations.length - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * perRing + j;
      const b = a + 1;
      const c = a + perRing;
      const d = c + 1;
      if (ascending) idx.push(a, c, b, b, c, d);
      else idx.push(a, b, c, b, d, c);
    }
  }

  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.setAttribute('skinIndex', new Uint16BufferAttribute(skinIdx, 4));
  g.setAttribute('skinWeight', new Float32BufferAttribute(skinWgt, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Stations for a limb: a straight vertical run of rings from `y0` downward,
 * with radii interpolated through `keys` and skin weights blended across each
 * joint so the surface creases instead of shearing.
 *
 * @param {Array} chain  [{bone, y}] joints, top to bottom
 * @param {Array} keys   [[t, radius]] t is 0..1 along the whole chain
 */
function limbStations(chain, keys, { cx, cz = 0, sz = 1, rings = 5 }) {
  const top = chain[0].y;
  const bottom = chain[chain.length - 1].y;
  const span = top - bottom;
  const radiusAt = (t) => {
    for (let i = 1; i < keys.length; i++) {
      if (t <= keys[i][0]) {
        const [t0, r0] = keys[i - 1];
        const [t1, r1] = keys[i];
        return lerp(r0, r1, (t - t0) / (t1 - t0 || 1));
      }
    }
    return keys[keys.length - 1][1];
  };

  const stations = [];
  for (let s = 0; s < chain.length - 1; s++) {
    const a = chain[s];
    const b = chain[s + 1];
    const last = s === chain.length - 2;
    for (let k = 0; k <= rings; k++) {
      if (k === rings && !last) continue; // next segment starts here
      const f = k / rings;
      const y = lerp(a.y, b.y, f);
      // Blend into the neighbouring joints near each end of the segment. A hard
      // handover creases the surface into a visible hinge.
      const w = [[a.bone, 1]];
      if (f > 0.62) w.push([b.bone, ((f - 0.62) / 0.38) * 0.48]);
      if (f < 0.38 && s > 0) w.push([chain[s - 1].bone, ((0.38 - f) / 0.38) * 0.42]);
      stations.push({ y, r: radiusAt((top - y) / span), cx, cz, sz, w });
    }
  }
  return stations;
}

/* Rig proportions. The leg chain is deliberately only just long enough to
 * reach the floor from the standing hip height, which produces the stiff,
 * over-extended gait without any inverse kinematics. */
const THIGH = 0.62;
const SHIN = 0.56;
const HIP_STAND = 1.22;
/* Dropped right down. At 1.14 the "sprint" was a standing figure bent double at
 * the waist with its legs out in front — it read as sitting on an invisible
 * chair. A quadruped has to get its shoulders inside arm's reach of the floor. */
const HIP_CRAWL = 0.9;
/** Ankle height when the sole is flat on the floor (the foot pad hangs below). */
const ANKLE_GROUND = 0.055;
/** Wrist height when the knuckles are taking weight. */
const WRIST_GROUND = 0.23;

export const STATE = {
  DORMANT: 'dormant',
  PATROL: 'patrol',
  INVESTIGATE: 'investigate',
  SEARCH: 'search',
  STALK: 'stalk',
  HUNT: 'hunt',
  ATTACK: 'attack',
  RETREAT: 'retreat',
  INSPECT: 'inspect',
};

export class Monster {
  constructor({ scene, level, audio, settings, bus, rng, phantom = false }) {
    this.scene = scene;
    this.level = level;
    this.audio = audio;
    this.settings = settings;
    this.bus = bus;
    this.rng = rng;
    /** A phantom is a hallucination: visible, silent, harmless, vanishes. */
    this.phantom = phantom;

    const c = level.monsterSpawnCell;
    const w = level.maze.worldOf(c.x, c.y);
    this.pos = new Vector3(w.x, 0, w.z);
    this.yaw = rng.range(0, TAU);
    this.speed = 0;
    this.state = phantom ? STATE.STALK : STATE.PATROL;
    this.stateTime = 0;

    this.path = [];
    this.pathIndex = 0;
    this.repathTimer = 0;
    this.target = new Vector3().copy(this.pos);
    this.lastKnown = null;
    this.awareness = 0;
    this.rage = 0;
    this.gait = 0; // 0 = upright walk, 1 = quadruped sprint
    this.stepPhase = 0;
    this.visible = false;
    this.distanceToPlayer = 999;
    this.grabbing = 0;
    this.stalkCooldown = rng.range(18, 40);
    this.lookedAt = 0;
    this.inspectLocker = null;
    this.alive = true;
    this.headTurn = 0;
    this.jaw = 0;
    this.twitch = 0;

    this._build();
    this._unsub = [bus.on('noise', (e) => this.hear(e))];
  }

  /* ----------------------------------------------------------------- rig */

  _build() {
    const mat = this.level.mats.skin;
    const eyeMat = this.level.mats.eye;
    // The rig is built with the root at the origin so the skeleton's bind pose
    // is in plain rig space (floor at y = 0). The root is moved to the
    // creature's actual position at the end.
    const root = new Group();
    this.root = root;
    this.scene.add(root);

    const bones = [];
    const bone = (parent, x, y, z) => {
      const b = new Bone();
      b.position.set(x, y, z);
      parent.add(b);
      bones.push(b);
      return b;
    };
    /**
     * One limb segment, growing from the joint along -Y (bone-local down).
     *
     * This is a single lathed surface rather than a capsule: rounded cap, taper
     * down the shaft with a slight bulge, rounded cap. Uniform capsules with 8
     * radial segments are what made the creature read as a jointed artist's
     * mannequin — the silhouette stepped at every joint and each segment was
     * visibly octagonal. The caps overrun both joints so consecutive segments
     * always overlap, however far the joint is bent.
     */
    const limb = (parent, rTop, rBot, length, { squash = 1, bulge = 0.08 } = {}) => {
      const pts = [];
      const CAP = 5;
      for (let i = 0; i <= CAP; i++) {
        const a = (i / CAP) * (Math.PI / 2);
        pts.push(new Vector2(Math.sin(a) * rTop, Math.cos(a) * rTop));
      }
      const RINGS = 5;
      for (let i = 1; i < RINGS; i++) {
        const t = i / RINGS;
        const r = lerp(rTop, rBot, t) * (1 + Math.sin(t * Math.PI) * bulge);
        pts.push(new Vector2(r, -t * length));
      }
      for (let i = 0; i <= CAP; i++) {
        const a = (i / CAP) * (Math.PI / 2);
        pts.push(new Vector2(Math.cos(a) * rBot, -length - Math.sin(a) * rBot));
      }
      const m = new Mesh(whiteColors(new LatheGeometry(pts, 16)), mat);
      m.scale.set(1, 1, squash);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };

    /* ------------------------------------------------------------- skeleton */
    // Hips carry the legs and nothing else — the hunch lives on the spine, so
    // leaning the torso never lifts the feet off the floor.
    this.hips = bone(root, 0, HIP_STAND, 0);
    this.hips.name = 'pelvis';
    this.spine = bone(this.hips, 0, 0, 0);
    this.chest = bone(this.spine, 0, 0.46, 0);
    this.neck = bone(this.chest, 0, 0.38, 0.02);
    this.head = bone(this.neck, 0, 0.2, 0);
    this.jawBone = bone(this.head, 0, -0.005, -0.015);

    this.arms = [];
    for (const sx of [-1, 1]) {
      // One arm is slightly longer than the other, which the eye reads as
      // "wrong" before it reads as "long".
      const upper = 0.6 + (sx > 0 ? 0.03 : 0);
      const fore = 0.56 + (sx > 0 ? 0.025 : 0);
      const shoulder = bone(this.chest, sx * 0.2, 0.325, 0);
      const elbow = bone(shoulder, 0, -upper, 0);
      const wrist = bone(elbow, 0, -fore, 0);
      this.arms.push({ shoulder, elbow, wrist, side: sx, upper, fore });
    }

    this.legs = [];
    for (const sx of [-1, 1]) {
      const hip = bone(this.hips, sx * 0.115, -0.04, 0);
      const knee = bone(hip, 0, -THIGH, 0);
      const ankle = bone(knee, 0, -SHIN, 0);
      this.legs.push({ hip, knee, ankle, side: sx });
    }

    root.updateMatrixWorld(true);
    const skeleton = new Skeleton(bones);
    const boneIndex = new Map(bones.map((b, i) => [b, i]));
    this.meshes = [];
    /**
     * Skinned surfaces live outside the root: the bones' world matrices already
     * carry the root transform, so parenting the mesh to the root as well would
     * apply it twice. Bounding volumes are in bind space for the same reason,
     * hence no frustum culling.
     */
    const skinned = (geometry) => {
      const m = new SkinnedMesh(geometry, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      this.scene.add(m);
      m.bind(skeleton, new Matrix4());
      this.meshes.push(m);
      return m;
    };

    /* ---------------------------------------------------------------- torso */
    // Heights are absolute in rig space. The face is laid out between 2.26 (jaw
    // hinge) and 2.56 (crown), so the deform below can carve into it.
    //
    // The profile is given as sparse keys and then resampled every 14 mm. Coarse
    // stations silently swallow every feature finer than their spacing: at 80 mm
    // apart the ribs (55 mm pitch) aliased away completely and the chest came out
    // as a smooth cone.
    const profileKeys = [
      // y,    r,     cz,     sz
      [1.0, 0.02, 0, 0.85],
      [1.06, 0.095, 0, 0.85],
      [1.13, 0.126, 0, 0.82],
      [1.22, 0.134, 0, 0.8],
      [1.3, 0.126, -0.005, 0.8],
      [1.4, 0.113, -0.012, 0.8],
      [1.5, 0.11, -0.014, 0.78],
      [1.6, 0.126, -0.008, 0.75],
      [1.68, 0.146, 0, 0.72],
      [1.76, 0.16, 0.004, 0.7],
      [1.86, 0.163, 0.006, 0.7],
      [1.94, 0.15, 0.004, 0.72],
      [2.0, 0.118, 0.008, 0.8],
      [2.06, 0.085, 0.02, 0.9],
      [2.13, 0.072, 0.02, 0.92],
      [2.2, 0.076, 0.014, 0.95],
      [2.26, 0.098, 0.004, 1.0],
      [2.3, 0.114, -0.005, 1.02],
      [2.34, 0.128, 0.002, 1.02],
      [2.38, 0.134, 0.012, 1.02],
      [2.42, 0.138, 0.02, 1.01],
      [2.46, 0.136, 0.028, 1.0],
      [2.5, 0.124, 0.035, 1.0],
      [2.53, 0.104, 0.042, 1.0],
      [2.55, 0.075, 0.046, 1.0],
      [2.56, 0.0, 0.048, 1.0],
    ];

    // Section boundaries are the joints; the ramps around them are what let the
    // surface crease instead of shearing apart when a joint bends.
    const sections = [
      { bone: this.hips, from: -9, to: 1.22 },
      { bone: this.spine, from: 1.22, to: 1.68 },
      { bone: this.chest, from: 1.68, to: 2.06 },
      { bone: this.neck, from: 2.06, to: 2.26 },
      { bone: this.head, from: 2.26, to: 9 },
    ];
    const BLEND = 0.06;
    const torsoWeights = (y) => {
      const out = [];
      for (const s of sections) {
        const w =
          smoothstep((y - s.from + BLEND) / (2 * BLEND)) *
          (1 - smoothstep((y - s.to + BLEND) / (2 * BLEND)));
        if (w > 0.002) out.push([s.bone, w]);
      }
      return out.length ? out : [[this.head, 1]];
    };

    // Resampling density has to beat the finest feature carved below, or the
    // feature simply is not there. At a flat 14 mm the mouth (a 9 mm groove) was
    // skipped between rings entirely, which is why the face came out with a
    // painted-on line for a mouth and shallow almonds for sockets.
    const stepFor = (y) => (y > 2.14 ? 0.0045 : y > 1.6 ? 0.011 : 0.016);

    const torsoStations = [];
    for (let k = 1; k < profileKeys.length; k++) {
      const [y0, r0, z0, s0] = profileKeys[k - 1];
      const [y1, r1, z1, s1] = profileKeys[k];
      const steps = Math.max(1, Math.round((y1 - y0) / stepFor(y0)));
      for (let i = 0; i < steps; i++) {
        const f = i / steps;
        const y = lerp(y0, y1, f);
        torsoStations.push({
          y,
          r: lerp(r0, r1, f),
          cz: lerp(z0, z1, f),
          sz: lerp(s0, s1, f),
          w: torsoWeights(y),
        });
      }
    }
    const last = profileKeys[profileKeys.length - 1];
    torsoStations.push({ y: last[0], r: last[1], cz: last[2], sz: last[3], w: torsoWeights(last[0]) });

    // a = PI/2 is the centre of the face; +/- from there runs round the head.
    const FRONT = Math.PI / 2;
    const BACK = -Math.PI / 2;
    /** Smooth elliptical blob in (angle, height) space. */
    const blob = (a, y, ca, cy, wa, wy) => {
      const q = (angDelta(a, ca) / wa) ** 2 + ((y - cy) / wy) ** 2;
      return q > 4 ? 0 : Math.exp(-q * 1.5);
    };
    /** Band that wraps the body at a height. */
    const band = (y, cy, wy) => Math.exp(-(((y - cy) / wy) ** 2) * 1.5);
    /**
     * Blob whose centre height sags as it wraps away from `ca`.
     *
     * Needed for the mouth. A groove at constant y, seen on a curved head from
     * below, arcs *upward* on screen because the corners are further away — the
     * face came out wearing a faint smile. Dropping the corners cancels it.
     */
    const droopBlob = (a, y, ca, cy, wa, wy, droop) => {
      const da = angDelta(a, ca);
      return blob(a, y + droop * (da / wa) ** 2, ca, cy, wa, wy);
    };

    /* Socket geometry, shared with the glints below. Deriving their position
     * from these numbers instead of hand-placing it is the only way to be sure
     * they stay *in* the hole: hand-placed, they sat 5 cm proud of a 2 cm dent
     * and read as a doll's painted-on eyes. */
    const SOCKET = { y: 2.402, wa: 0.27, wy: 0.03, depth: 0.056, r: 0.136, cz: 0.0165 };
    const socketAngle = (s) => FRONT + s * (0.47 + (s > 0 ? 0.03 : -0.015));

    /**
     * Signed rib field, -1 in a gap and +1 on a rib. Shared with the shader
     * below so the ribs can be sold with contact shadow instead of relief —
     * pushing them out far enough to see in silhouette turned the chest into a
     * length of corrugated pipe.
     *
     * Real ribs slope down and forward from the spine and stop at the costal
     * cartilage, so the phase shifts with angle and the whole thing is muted
     * across the sternum.
     */
    const ribField = (a, y) => {
      if (y < 1.68 || y > 1.99) return 0;
      const da = Math.abs(angDelta(a, FRONT));
      // Slope: at the flanks a given rib sits ~3 cm higher than at the sternum.
      const slope = 0.03 * smoothstep(da / 1.2);
      const ripple = Math.cos(((y + slope - 1.735) / 0.072) * TAU);
      // Muted over the cartilage at the centre line, gone by the spine.
      const gap = smoothstep((da - 0.26) / 0.3);
      const wrap = clamp01(0.05 + 0.95 * Math.sin(a)) ** 1.2;
      const ends = smoothstep((1.99 - y) / 0.055) * smoothstep((y - 1.68) / 0.04);
      return ripple * gap * wrap * ends;
    };

    const torsoDeform = (a, y) => {
      let d = 0;
      const front = Math.max(0, Math.sin(a));
      const da = Math.abs(angDelta(a, FRONT));

      // Just enough relief to catch a raking torch; the rest is shading.
      d += ribField(a, y) * 0.0038;
      // Sternum: a hollow between the two halves of the cage.
      d -= blob(a, y, FRONT, 1.86, 0.22, 0.1) * 0.016;
      // Collarbones, and the pit between them.
      for (const s of [-1, 1]) d += blob(a, y, FRONT + s * 0.62, 1.995, 0.34, 0.02) * 0.02;
      d -= blob(a, y, FRONT, 2.02, 0.28, 0.022) * 0.016;
      // Vertebrae marching up the back.
      if (y > 1.26 && y < 2.12) {
        d += Math.max(0, -Math.sin(a)) ** 3 * (0.007 + Math.cos(y * 78) * 0.005);
      }
      // Shoulder blades.
      for (const s of [-1, 1]) d += blob(a, y, BACK + s * 0.55, 1.87, 0.28, 0.065) * 0.022;
      // Deltoids: the torso has to reach out sideways to meet the arm tubes,
      // otherwise the arms hang detached with their open ends showing.
      for (const s of [0, Math.PI]) d += blob(a, y, s, 2.0, 0.66, 0.07) * 0.105;
      // Hip points standing out of a body with nothing left on it.
      for (const s of [-1, 1]) d += blob(a, y, FRONT + s * 1.15, 1.27, 0.3, 0.032) * 0.018;
      // A distended, sagging belly hanging over them.
      d += blob(a, y, FRONT, 1.44, 1.0, 0.09) * 0.032;

      /* ----------------------------------------------------------- the neck */
      // Cords standing off a neck held under permanent tension, and a larynx
      // shoved too far forward. A smooth tube here reads as a mannequin's post.
      for (const s of [-1, 1]) d += blob(a, y, FRONT + s * 0.5, 2.14, 0.3, 0.09) * 0.011;
      d += blob(a, y, FRONT, 2.16, 0.24, 0.028) * 0.009;
      d -= blob(a, y, FRONT, 2.1, 0.34, 0.03) * 0.006;
      // Trapezius sloping up out of the shoulders into the base of the skull.
      for (const s of [-1, 1]) d += blob(a, y, BACK + s * 0.45, 2.1, 0.5, 0.13) * 0.02;

      /* -------------------------------------------------------------- face */
      // Cranium first: an egg is what made the head read as a doll's, so a
      // couple of asymmetric dents go in before anything else. Kept shallow —
      // deep ones stack with the sockets and the whole skull reads as melted.
      d -= blob(a, y, FRONT - 1.35, 2.5, 0.4, 0.045) * 0.007;
      d -= blob(a, y, FRONT + 1.62, 2.47, 0.32, 0.05) * 0.005;
      // A brow that overhangs, with the temples scooped out behind it. The
      // overhang is what shadows the sockets — the darkness has to be cast, not
      // painted on, or the face reads as a mask with two ovals drawn on it.
      for (const s of [-1, 1]) d += blob(a, y, FRONT + s * 0.42, 2.451, 0.36, 0.014) * 0.034;
      // Glabella: the notch between the two halves of the brow.
      d -= blob(a, y, FRONT, 2.447, 0.13, 0.016) * 0.014;
      // Temples, dug in behind the brow ridge.
      for (const s of [-1, 1]) d -= blob(a, y, FRONT + s * 1.02, 2.432, 0.3, 0.045) * 0.018;
      // Sockets: deep, narrow, empty, and not quite a matched pair. Perfect
      // symmetry is most of what makes a face read as manufactured.
      for (const s of [-1, 1]) {
        d -= blob(a, y, socketAngle(s), SOCKET.y + s * 0.004, SOCKET.wa, SOCKET.wy) * SOCKET.depth;
        // Inner corner, where the socket runs into the nose.
        d -= blob(a, y, FRONT + s * 0.24, 2.396, 0.14, 0.022) * 0.022;
      }
      // Zygomatic arch: a hard ridge from the socket back toward the ear, with
      // the cheek starved away underneath it.
      for (const s of [-1, 1]) {
        d += blob(a, y, FRONT + s * 0.72, 2.362, 0.3, 0.017) * 0.02;
        d -= blob(a, y, FRONT + s * 0.6, 2.305, 0.27, 0.03) * 0.032;
      }
      // No nose: a bony ridge with the aperture opened straight into the skull.
      d += blob(a, y, FRONT, 2.4, 0.1, 0.05) * 0.012;
      d -= blob(a, y, FRONT, 2.352, 0.17, 0.019) * 0.02;
      for (const s of [-1, 1]) d -= blob(a, y, FRONT + s * 0.14, 2.348, 0.1, 0.016) * 0.022;
      // Nasolabial folds running down around the mouth.
      for (const s of [-1, 1]) d -= blob(a, y, FRONT + s * 0.42, 2.318, 0.11, 0.033) * 0.014;
      // The mouth: a wide lipless gash, corners dragged down, and the upper lip
      // pulled back off the teeth.
      d -= droopBlob(a, y, FRONT, 2.292, 0.72, 0.011, 0.03) * 0.03;
      d += droopBlob(a, y, FRONT, 2.309, 0.6, 0.012, 0.028) * 0.008;
      // Receding chin, and the jaw line under it.
      d += blob(a, y, FRONT, 2.262, 0.34, 0.018) * 0.015;
      for (const s of [-1, 1]) d += blob(a, y, FRONT + s * 0.78, 2.276, 0.26, 0.02) * 0.009;

      // Everything is slightly wrong everywhere. Without this the body is a
      // machined surface of revolution and reads as moulded plaster.
      d += (surfNoise.fbm(a * 1.9, y * 4.4, 4) * 0.5) * 0.011;
      d += (surfNoise.fbm(a * 5.5 + 30, y * 13, 3) * 0.5) * 0.004;
      // Finer still over the face, where the camera gets closest.
      d += (surfNoise.fbm(a * 11 + 70, y * 26, 3) - 0.5) * 0.0024 * smoothstep((y - 2.2) / 0.1);
      return d;
    };

    const torsoShade = (a, y) => {
      let s = 0;
      const front = Math.max(0, Math.sin(a));
      // Contact shading in the recesses. The sockets go almost to black: a real
      // eye socket lit from the front is a hole, and any light left in there is
      // what turns the face back into a mask with two ovals painted on it.
      for (const k of [-1, 1]) {
        s += blob(a, y, socketAngle(k), SOCKET.y, SOCKET.wa + 0.02, SOCKET.wy + 0.002) * 0.95;
        s += blob(a, y, FRONT + k * 0.24, 2.396, 0.15, 0.024) * 0.6;
      }
      // The mouth line and the nasal aperture, both openings rather than marks.
      s += droopBlob(a, y, FRONT, 2.292, 0.74, 0.013, 0.03) * 0.85;
      s += blob(a, y, FRONT, 2.352, 0.18, 0.021) * 0.8;
      for (const k of [-1, 1]) s += blob(a, y, FRONT + k * 0.14, 2.348, 0.11, 0.018) * 0.8;
      // Temples and the hollow under each cheekbone.
      for (const k of [-1, 1]) {
        s += blob(a, y, FRONT + k * 1.02, 2.432, 0.3, 0.048) * 0.4;
        s += blob(a, y, FRONT + k * 0.6, 2.305, 0.28, 0.032) * 0.45;
        s += blob(a, y, FRONT + k * 0.42, 2.318, 0.12, 0.035) * 0.3;
      }
      // Ribs: dirt and self-shadow in the gaps is what actually reads as a cage
      // under skin, so the grooves get darkened far harder than they are deep.
      s += clamp01(-ribField(a, y)) * 0.44;
      s += blob(a, y, FRONT, 2.02, 0.3, 0.024) * 0.35;
      // Grime gathers in the groin, under the belly and in the armpits.
      s += smoothstep((1.12 - y) / 0.12) * 0.4;
      s += band(y, 1.52, 0.06) * front * 0.16;
      for (const k of [-1, 1]) s += blob(a, y, FRONT + k * 1.45, 1.95, 0.3, 0.06) * 0.3;
      // Coarse blotching — dead patches and ingrained filth. This is the body's
      // large-scale tonal variation, and it lives here rather than in the albedo
      // map because the map tiles several times across the torso and anything
      // this size baked into it repeats as an obvious grid.
      s += smoothstep((surfNoise.fbm(a * 1.5 + 11, y * 1.9, 4) - 0.45) * 3.2) * 0.4;
      s += smoothstep((surfNoise.fbm(a * 3.1 + 63, y * 4.2, 4) - 0.5) * 3.6) * 0.22;
      s += clamp01(surfNoise.fbm(a * 7 + 44, y * 9, 3) * 0.7 + 0.35) * 0.1;
      return s;
    };

    // Below the mouth line and around the front, the skin belongs to the jaw:
    // opening it stretches the whole lower face instead of dropping a
    // disconnected box off the chin.
    const jawReweight = (a, y, st, infl) => {
      if (y > 2.318 || y < 2.2) return;
      const grip =
        smoothstep((2.318 - y) / 0.05) *
        smoothstep((0.95 - Math.abs(angDelta(a, FRONT))) / 0.5) *
        smoothstep((y - 2.2) / 0.045);
      if (grip <= 0.001) return;
      for (const e of infl) e[1] *= 1 - grip;
      infl.push([this.jawBone, grip]);
    };

    skinned(
      sweepSkin({
        stations: torsoStations,
        boneIndex,
        // 44 was too coarse around the head: at ~19 mm apart the nostrils and
        // the corners of the mouth fell between vertices and smeared.
        radial: 72,
        deform: torsoDeform,
        shade: torsoShade,
        reweight: jawReweight,
        uvScale: 1.6,
      }),
    );

    // A wet glint far too deep inside each socket. There is nothing else in
    // there: no eyeball geometry, because a sphere in a socket reads as a doll's
    // eye and, worse, pokes back out through the face.
    //
    // Placed by evaluating the same surface equation the sweep uses at the
    // bottom of the socket, then sunk a further centimetre, so it is physically
    // impossible for it to surface.
    const HEAD_ORIGIN = { y: HIP_STAND + 0.46 + 0.38 + 0.2, z: 0.02 };
    for (const s of [-1, 1]) {
      const a = socketAngle(s);
      const r = SOCKET.r - SOCKET.depth - 0.012;
      const glint = new Mesh(whiteColors(new SphereGeometry(0.007, 8, 6)), eyeMat);
      glint.position.set(
        -Math.cos(a) * r,
        SOCKET.y + s * 0.004 - HEAD_ORIGIN.y,
        SOCKET.cz - Math.sin(a) * r - HEAD_ORIGIN.z,
      );
      glint.scale.set(1.2, 0.85, 0.7);
      this.head.add(glint);
    }
    // The mouth interior, sat well back so it only shows when the jaw drops.
    const maw = new Mesh(whiteColors(new SphereGeometry(0.062, 12, 10)), this.level.mats.maw);
    maw.position.set(0, 0.022, -0.028);
    maw.scale.set(1.05, 0.62, 0.8);
    this.head.add(maw);
    // Teeth, uneven, because nothing here grew properly.
    for (let i = 0; i < 9; i++) {
      const t = (i - 4) / 4;
      const up = i % 2 === 0;
      const tooth = new Mesh(whiteColors(new SphereGeometry(0.0075, 6, 5)), mat);
      tooth.position.set(t * 0.05, 0.028 + (up ? 0.004 : -0.007), -0.088 + t * t * 0.026);
      tooth.scale.set(1, 1.6 + (i % 3) * 0.6, 1);
      tooth.rotation.z = t * 0.3;
      tooth.castShadow = false;
      (up ? this.head : this.jawBone).add(tooth);
    }

    /* ----------------------------------------------------------------- arms */
    for (const arm of this.arms) {
      const { shoulder, elbow, wrist, side: sx, upper, fore } = arm;
      const shoulderY = HIP_STAND + 0.46 + 0.325;
      const chain = [
        { bone: shoulder, y: shoulderY },
        { bone: elbow, y: shoulderY - upper },
        { bone: wrist, y: shoulderY - upper - fore },
        { bone: wrist, y: shoulderY - upper - fore - 0.15 },
      ];
      const stations = limbStations(
        chain,
        [
          [0, 0.082],
          [0.07, 0.075],
          [0.28, 0.062],
          [0.4, 0.056],
          [0.46, 0.052],
          [0.56, 0.047],
          [0.68, 0.039],
          [0.85, 0.032],
          [0.9, 0.04],
          [0.97, 0.032],
          [1, 0.004],
        ],
        { cx: sx * 0.2, cz: 0, sz: 0.9, rings: 6 },
      );
      // Cap the top and tuck it inside the chest, so a raised arm never shows a
      // hole where the shoulder should be.
      //
      // The cap is weighted to the *chest*, not the shoulder. Anything above the
      // shoulder pivot that rotates with the arm swings away from the body as the
      // arm lifts, and during the grab that left the whole limb hanging in the
      // air as a detached tube with its open end facing the camera.
      stations.unshift(
        { y: shoulderY + 0.062, r: 0.0, cx: sx * 0.152, cz: 0.004, sz: 0.9, w: [[this.chest, 1]] },
        { y: shoulderY + 0.044, r: 0.048, cx: sx * 0.164, cz: 0.003, sz: 0.9, w: [[this.chest, 1]] },
        { y: shoulderY + 0.022, r: 0.068, cx: sx * 0.182, cz: 0.002, sz: 0.9, w: [[this.chest, 1]] },
      );
      // Hand the deltoid back to the chest gradually, so the shoulder creases
      // and stretches over the joint instead of shearing at one ring.
      for (const st of stations) {
        if (st.y > shoulderY) continue;
        const grip = clamp01((st.y - (shoulderY - 0.1)) / 0.1) * 0.85;
        if (grip <= 0.001) continue;
        for (const e of st.w) e[1] *= 1 - grip;
        st.w.push([this.chest, grip]);
      }
      skinned(
        sweepSkin({
          stations,
          boneIndex,
          radial: 20,
          deform: (a, y) => {
            let d = (surfNoise.fbm(a * 2.1, y * 5.5, 3) * 0.5) * 0.007;
            // Tendons standing off the back of the forearm and the wrist.
            const t = (shoulderY - y) / (upper + fore + 0.15);
            if (t > 0.5 && t < 0.9) d += Math.max(0, -Math.sin(a)) ** 2 * 0.0035;
            return d;
          },
          shade: (a, y) => {
            const t = (shoulderY - y) / (upper + fore + 0.15);
            // Occlusion where the arm faces the ribs, deepest in the armpit.
            // Without it the limb is an evenly lit tube and reads as a wire.
            const inner = clamp01(Math.cos(a) * sx);
            // Filthiest at the hands.
            return (
              inner * (0.15 + 0.4 * smoothstep((0.22 - t) / 0.22)) +
              smoothstep((t - 0.72) / 0.3) * 0.35 +
              // Coarse blotching, unique per vertex so it cannot tile.
              smoothstep((surfNoise.fbm(a * 1.6 + 21, y * 2.1, 4) - 0.46) * 3.2) * 0.36 +
              (1 - surfNoise.fbm(a * 2.7, y * 3, 3)) * 0.1
            );
          },
          uvScale: 0.9,
        }),
      );

      // Fingers: two jointed segments each, splayed across the palm and
      // half-curled, so the hand reads as a hand rather than a garden rake.
      for (let f = 0; f < 4; f++) {
        const t = (f - 1.5) / 1.5;
        const len1 = 0.14 - Math.abs(t) * 0.022;
        const base = bone(wrist, t * 0.03, -0.155, -0.004);
        base.rotation.z = t * 0.2;
        base.rotation.x = -0.28 + Math.abs(t) * 0.1;
        limb(base, 0.0135, 0.0105, len1, { bulge: 0.04 });
        const knuckle = bone(base, 0, -len1, 0);
        knuckle.rotation.x = -0.5;
        limb(knuckle, 0.0105, 0.0045, 0.11 - Math.abs(t) * 0.018, { bulge: 0.03 });
      }
      // Thumb, set back along the palm.
      const thumb = bone(wrist, sx * 0.038, -0.085, -0.008);
      thumb.rotation.z = sx * -0.95;
      thumb.rotation.x = -0.32;
      limb(thumb, 0.0145, 0.0085, 0.115, { bulge: 0.04 });
      arm.hand = wrist;
    }

    /* ----------------------------------------------------------------- legs */
    for (const leg of this.legs) {
      const { hip, knee, ankle, side: sx } = leg;
      const hipY = HIP_STAND - 0.04;
      const chain = [
        { bone: hip, y: hipY },
        { bone: knee, y: hipY - THIGH },
        { bone: ankle, y: hipY - THIGH - SHIN },
      ];
      const stations = limbStations(
        chain,
        [
          [0, 0.1],
          [0.1, 0.092],
          [0.38, 0.073],
          [0.52, 0.064],
          [0.62, 0.072],
          [0.8, 0.048],
          [0.94, 0.036],
          [1, 0.034],
        ],
        { cx: sx * 0.125, cz: 0, sz: 0.92, rings: 7 },
      );
      // Cap the top inside the pelvis and the bottom under the foot.
      stations.unshift(
        { y: hipY + 0.075, r: 0, cx: sx * 0.09, sz: 0.92, w: [[hip, 1]] },
        { y: hipY + 0.045, r: 0.062, cx: sx * 0.1, sz: 0.92, w: [[hip, 1]] },
        { y: hipY + 0.02, r: 0.09, cx: sx * 0.112, sz: 0.92, w: [[hip, 1]] },
      );
      stations.push({ y: hipY - THIGH - SHIN - 0.012, r: 0, cx: sx * 0.125, sz: 0.92, w: [[ankle, 1]] });
      skinned(
        sweepSkin({
          stations,
          boneIndex,
          radial: 22,
          deform: (a, y) => {
            let d = (surfNoise.fbm(a * 2.0 + 4, y * 5.2, 3) * 0.5) * 0.008;
            const t = (hipY - y) / (THIGH + SHIN);
            // Shin bone right under the skin at the front.
            if (t > 0.55) d += Math.max(0, Math.sin(a)) ** 3 * 0.004;
            // Knee cap.
            d += blob(a, y, FRONT, hipY - THIGH + 0.01, 0.55, 0.035) * 0.011;
            return d;
          },
          shade: (a, y) => {
            const t = (hipY - y) / (THIGH + SHIN);
            // Occlusion on the inner thigh, where the two legs face each other.
            const inner = clamp01(Math.cos(a) * sx) * smoothstep((0.45 - t) / 0.45);
            return (
              inner * 0.4 +
              smoothstep((t - 0.8) / 0.25) * 0.4 +
              smoothstep((surfNoise.fbm(a * 1.6 + 35, y * 2.1, 4) - 0.46) * 3.2) * 0.36 +
              (1 - surfNoise.fbm(a * 2.4 + 8, y * 3, 3)) * 0.1
            );
          },
          uvScale: 1.1,
        }),
      );

      const foot = new Group();
      ankle.add(foot);
      const pad = new Mesh(whiteColors(new SphereGeometry(0.058, 14, 10)), mat);
      pad.position.set(0, -0.028, -0.045);
      pad.scale.set(0.92, 0.46, 1.95);
      pad.castShadow = true;
      foot.add(pad);
      const heel = new Mesh(whiteColors(new SphereGeometry(0.042, 10, 8)), mat);
      heel.position.set(0, -0.018, 0.055);
      heel.scale.set(0.9, 0.8, 0.9);
      heel.castShadow = false;
      foot.add(heel);
      for (let t = -1; t <= 1; t++) {
        const toe = bone(foot, t * 0.03, -0.036, -0.135);
        toe.rotation.x = Math.PI / 2 - 0.12;
        toe.rotation.z = t * 0.16;
        limb(toe, 0.017, 0.009, 0.075 - Math.abs(t) * 0.012, { bulge: 0.02 });
      }
      leg.foot = foot;
    }

    root.position.copy(this.pos);

    if (this.phantom) {
      // Hallucinations render slightly wrong: darker and shadowless.
      for (const r of [this.root, ...this.meshes]) {
        r.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = false;
            o.receiveShadow = false;
          }
        });
      }
    }
    this.skeleton = skeleton;
  }

  /** Show or hide every part of the body at once. */
  setVisible(v) {
    this.root.visible = v;
    for (const m of this.meshes) m.visible = v;
  }

  /**
   * The rig is modelled facing local -Z (eyes, jaw and toes all point that
   * way), so "forward" for this creature is the opposite of the usual +Z.
   */
  forward(out = new Vector3()) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  /** Yaw that makes the creature face a world position. */
  yawToward(x, z) {
    return Math.atan2(-(x - this.pos.x), -(z - this.pos.z));
  }

  /* ---------------------------------------------------------------- senses */

  hear(evt) {
    if (this.phantom || !this.alive) return;
    const diff = this.settings.diff;
    const d = this.pos.distanceTo(evt.pos);
    const range = diff.hearingRange * (0.35 + evt.level * 1.15) * (1 + this.rage * 0.4);
    if (d > range) return;
    // Closer + louder = more certain.
    const cert = clamp01((1 - d / range) * (0.35 + evt.level));
    this.awareness = clamp01(this.awareness + cert * 0.85);
    this.lastKnown = evt.pos.clone();
    if (this.state === STATE.PATROL || this.state === STATE.SEARCH || this.state === STATE.STALK) {
      if (this.awareness > 0.35) this._setState(STATE.INVESTIGATE);
    }
  }

  /** Sight check against the player. */
  _look(player) {
    const eye = new Vector3(this.pos.x, 1.7, this.pos.z);
    const to = new Vector3().subVectors(player.eyePosition, eye);
    const dist = to.length();
    this.distanceToPlayer = dist;
    const diff = this.settings.diff;
    if (dist > diff.sightRange * (1 + this.rage * 0.3)) return 0;
    if (!this.level.hasLineOfSight(this.pos, player.pos)) return 0;

    to.normalize();
    const fwd = this.forward();
    const facing = fwd.dot(new Vector3(to.x, 0, to.z).normalize());
    // ~150° cone, and it notices motion in the periphery.
    if (facing < -0.25) return 0;

    // How visible is the player right now?
    let exposure = 0.16;
    exposure += this.level.lightAt(player.pos) * 0.9;
    if (player.flashOn && player.flashHealth > 0.2) {
      // A lit torch is a beacon; pointing it at the monster is worse.
      const playerFwd = player.forward();
      const towardMonster = playerFwd.dot(new Vector3(-to.x, 0, -to.z).normalize());
      exposure += 0.55 + clamp01(towardMonster) * 0.55;
    }
    if (player.crouching) exposure *= 0.55;
    if (player.moveSpeed > 3) exposure *= 1.45;
    if (player.hiding) exposure *= 0.05;

    const proximity = clamp01(1 - dist / (diff.sightRange + 4));
    return clamp01(exposure * (0.35 + proximity) * clamp01(facing + 0.5));
  }

  /* ----------------------------------------------------------------- paths */

  _setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.stateTime = 0;
    if (s === STATE.HUNT && !this.phantom) {
      this.audio.scream(0.85, clamp(this._pan ?? 0, -1, 1));
      this.bus.emit('hunt-begin', this);
      this.jaw = 1;
    }
    if (s === STATE.SEARCH) this.path = [];
  }

  _pathTo(worldTarget) {
    const maze = this.level.maze;
    const a = maze.cellOf(this.pos.x, this.pos.z);
    const b = maze.cellOf(worldTarget.x, worldTarget.z);
    if (!maze.isFloor(b.x, b.y)) {
      // Snap to the nearest walkable cell.
      let best = null;
      let bd = Infinity;
      for (const f of maze.floors) {
        const d = (f.x - b.x) ** 2 + (f.y - b.y) ** 2;
        if (d < bd) {
          bd = d;
          best = f;
        }
      }
      if (!best) return;
      b.x = best.x;
      b.y = best.y;
    }
    const cells = maze.findPath(a.x, a.y, b.x, b.y);
    this.path = cells.map((c) => {
      const w = maze.worldOf(c.x, c.y);
      return new Vector3(w.x, 0, w.z);
    });
    this.pathIndex = 0;
  }

  _wanderTarget(playerPos) {
    const maze = this.level.maze;
    // Prefer somewhere far from where it already is, loosely toward the player
    // so it never fully abandons the map region you are in.
    const candidates = [];
    for (let i = 0; i < 26; i++) {
      const f = this.rng.pick(maze.floors);
      const w = maze.worldOf(f.x, f.y);
      const p = new Vector3(w.x, 0, w.z);
      const dSelf = p.distanceTo(this.pos);
      const dPlayer = playerPos ? p.distanceTo(playerPos) : 30;
      if (dSelf < 8) continue;
      candidates.push({ p, score: dSelf * 0.4 - Math.abs(dPlayer - 18) * 0.6 });
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates.length ? candidates[0].p : this.pos.clone();
  }

  /** Somewhere the player can see, at the end of a corridor, far enough away. */
  _stalkSpot(player) {
    const maze = this.level.maze;
    const pc = maze.cellOf(player.pos.x, player.pos.z);
    const best = [];
    for (let i = 0; i < 90; i++) {
      const f = this.rng.pick(maze.floors);
      const w = maze.worldOf(f.x, f.y);
      const p = new Vector3(w.x, 0, w.z);
      const d = p.distanceTo(player.pos);
      if (d < 9 || d > 22) continue;
      if (!maze.lineOfSight(pc.x, pc.y, f.x, f.y)) continue;
      // Prefer spots roughly in front of the player.
      const fwd = player.forward();
      const to = new Vector3().subVectors(p, player.pos).normalize();
      const infront = fwd.dot(to);
      best.push({ p, score: infront * 2 + (1 - Math.abs(d - 15) / 15) });
    }
    best.sort((a, b) => b.score - a.score);
    return best.length ? best[0].p : null;
  }

  /* ---------------------------------------------------------------- update */

  update(dt, ctx) {
    if (!this.alive) return;
    const player = ctx.player;
    const diff = this.settings.diff;
    this.stateTime += dt;
    this._pan = ctx.pan ?? 0;

    const seeing = this.phantom ? 0 : this._look(player);
    this.distanceToPlayer = this.pos.distanceTo(player.pos);

    /* ------------------------------------------------------- awareness */
    if (seeing > 0.02) {
      this.awareness = clamp01(this.awareness + seeing * dt * 2.1 * (1 + this.rage * 0.5));
      this.lastKnown = player.pos.clone();
    } else {
      this.awareness = clamp01(this.awareness - dt * 0.16);
    }

    /* ------------------------------------------------------ transitions */
    if (!this.phantom) {
      if (this.awareness >= 1 && this.state !== STATE.HUNT && this.state !== STATE.ATTACK) {
        this._setState(STATE.HUNT);
      }
      switch (this.state) {
        case STATE.PATROL:
          this.stalkCooldown -= dt;
          if (
            this.stalkCooldown <= 0 &&
            this.rng.chance(diff.stalkChance * dt * 0.8) &&
            this.distanceToPlayer > 10
          ) {
            const spot = this._stalkSpot(player);
            if (spot) {
              this.pos.copy(spot);
              this.path = [];
              this.stalkCooldown = this.rng.range(28, 55);
              this._setState(STATE.STALK);
            }
          }
          break;

        case STATE.STALK:
          // It stands perfectly still and watches. If you stare back, or come
          // too close, the illusion breaks.
          this.yaw += shortestAngle(this.yaw, this.yawToward(player.pos.x, player.pos.z)) * clamp01(4 * dt);
          if (ctx.playerLookingAt) this.lookedAt += dt;
          else this.lookedAt = Math.max(0, this.lookedAt - dt * 0.5);
          if (this.lookedAt > 1.4 || this.distanceToPlayer < 7 || this.stateTime > 14) {
            this.lookedAt = 0;
            if (this.distanceToPlayer < 9 || this.rng.chance(0.3)) {
              this._setState(STATE.HUNT);
            } else {
              this.audio.clang({ pan: this._pan, distance: this.distanceToPlayer, intensity: 0.9 });
              this.bus.emit('stalk-vanish', this);
              const t = this._wanderTarget(player.pos);
              this.pos.copy(t);
              this._setState(STATE.PATROL);
            }
          }
          break;

        case STATE.INVESTIGATE:
          if (this.lastKnown && this.pos.distanceTo(this.lastKnown) < 1.6) this._setState(STATE.SEARCH);
          if (this.stateTime > 22) this._setState(STATE.PATROL);
          break;

        case STATE.SEARCH: {
          // Sweep the area, and check any locker nearby — it knows the trick.
          if (this.stateTime > 9) {
            this._setState(STATE.PATROL);
          } else if (!this.inspectLocker && this.stateTime > 1.2) {
            const near = this.level.lockers
              .map((l) => ({ l, d: l.pos.distanceTo(this.pos) }))
              .filter((o) => o.d < 6.5)
              .sort((a, b) => a.d - b.d)[0];
            if (near && this.rng.chance(0.5)) {
              this.inspectLocker = near.l;
              this._setState(STATE.INSPECT);
            }
          }
          break;
        }

        case STATE.INSPECT: {
          const l = this.inspectLocker;
          if (!l) {
            this._setState(STATE.SEARCH);
            break;
          }
          const standoff = new Vector3(
            l.pos.x + Math.sin(l.yaw) * 1.1,
            0,
            l.pos.z + Math.cos(l.yaw) * 1.1,
          );
          if (this.pos.distanceTo(standoff) > 1.2) {
            this.target.copy(standoff);
          } else {
            this.target.copy(this.pos);
            // Standing right outside, breathing. Then it either rips the door
            // open or loses interest.
            if (this.stateTime > 3.4) {
              const playerInside = player.hiding && player.hideLocker === l;
              if (playerInside && (this.awareness > 0.5 || this.rng.chance(0.55))) {
                l.targetOpen = 1;
                this.audio.creak({ pan: this._pan, duration: 0.5, intensity: 1.4 });
                this.bus.emit('locker-opened', l);
                this._setState(STATE.ATTACK);
              } else {
                if (playerInside) this.bus.emit('near-miss', l);
                this.inspectLocker = null;
                this._setState(STATE.PATROL);
              }
            }
          }
          break;
        }

        case STATE.HUNT:
          if (this.distanceToPlayer < 1.85 && (this.level.hasLineOfSight(this.pos, player.pos) || player.hiding)) {
            this._setState(STATE.ATTACK);
          } else if (this.awareness < 0.25 && this.stateTime > 4) {
            this._setState(STATE.SEARCH);
          }
          break;

        case STATE.ATTACK:
          if (this.distanceToPlayer > 2.9) this._setState(STATE.HUNT);
          break;

        case STATE.RETREAT:
          if (this.stateTime > 8) this._setState(STATE.PATROL);
          break;

        default:
          break;
      }
    } else if (this.stateTime > 6) {
      // Phantoms never last long.
      this.bus.emit('phantom-expire', this);
    }

    /* ------------------------------------------------------------ goals */
    let moveSpeed = 0;
    switch (this.state) {
      case STATE.PATROL:
        moveSpeed = 1.42 + this.rage * 0.4;
        this.repathTimer -= dt;
        if (!this.path.length || this.pathIndex >= this.path.length || this.repathTimer <= 0) {
          this.repathTimer = 6;
          this._pathTo(this._wanderTarget(player.pos));
        }
        break;
      case STATE.INVESTIGATE:
        moveSpeed = 2.15 + this.rage * 0.5;
        this.repathTimer -= dt;
        if (this.repathTimer <= 0 && this.lastKnown) {
          this.repathTimer = 1.2;
          this._pathTo(this.lastKnown);
        }
        break;
      case STATE.SEARCH:
        moveSpeed = 1.15;
        this.repathTimer -= dt;
        if (this.repathTimer <= 0) {
          this.repathTimer = 2.6;
          const around = this.lastKnown ?? this.pos;
          const jitter = new Vector3(
            around.x + this.rng.range(-CELL * 2, CELL * 2),
            0,
            around.z + this.rng.range(-CELL * 2, CELL * 2),
          );
          this._pathTo(jitter);
        }
        break;
      case STATE.INSPECT:
        moveSpeed = 1.7;
        this.repathTimer -= dt;
        if (this.repathTimer <= 0) {
          this.repathTimer = 1.5;
          this._pathTo(this.target);
        }
        break;
      case STATE.HUNT:
        moveSpeed = diff.monsterSpeed * (1 + this.rage * 0.16);
        this.repathTimer -= dt;
        if (this.repathTimer <= 0) {
          this.repathTimer = 0.32;
          this._pathTo(this.lastKnown ?? player.pos);
        }
        break;
      case STATE.ATTACK:
        moveSpeed = diff.monsterSpeed * 1.12;
        this.path = [];
        break;
      case STATE.RETREAT:
        moveSpeed = 1.9;
        this.repathTimer -= dt;
        if (this.repathTimer <= 0) {
          this.repathTimer = 3;
          this._pathTo(this._wanderTarget(player.pos));
        }
        break;
      case STATE.STALK:
      default:
        moveSpeed = 0;
        break;
    }

    /* --------------------------------------------------------- steering */
    let desired = null;
    if (this.state === STATE.ATTACK) {
      desired = new Vector3(player.pos.x, 0, player.pos.z);
    } else if (this.path.length && this.pathIndex < this.path.length) {
      const wp = this.path[this.pathIndex];
      if (this.pos.distanceTo(wp) < 0.75) this.pathIndex++;
      desired = this.path[Math.min(this.pathIndex, this.path.length - 1)];
    }

    if (desired && moveSpeed > 0) {
      const to = new Vector3().subVectors(desired, this.pos);
      to.y = 0;
      const dist = to.length();
      if (dist > 0.02) {
        to.normalize();
        const wantYaw = this.yawToward(desired.x, desired.z);
        const turnRate = this.state === STATE.HUNT || this.state === STATE.ATTACK ? 7.5 : 3.4;
        this.yaw += shortestAngle(this.yaw, wantYaw) * clamp01(turnRate * dt);
        // It only accelerates once it is roughly facing the way it wants to go.
        const align = clamp01(1 - Math.abs(shortestAngle(this.yaw, wantYaw)) / 1.6);
        const step = moveSpeed * (0.35 + align * 0.65) * dt;
        const nx = this.pos.x - Math.sin(this.yaw) * step;
        const nz = this.pos.z - Math.cos(this.yaw) * step;
        const res = this.level.resolveCircle(nx, nz, 0.42);
        this.speed = damp(this.speed, moveSpeed * align, 8, dt);
        this.pos.x = res.x;
        this.pos.z = res.z;
        if (res.hit) this.repathTimer = Math.min(this.repathTimer, 0.15);
      }
    } else {
      this.speed = damp(this.speed, 0, 8, dt);
    }

    /* --------------------------------------------------------- the grab */
    if (this.state === STATE.ATTACK && !this.phantom) {
      const reach = player.hiding ? 1.6 : 1.35;
      if (this.distanceToPlayer < reach) {
        this.grabbing += dt;
        this.jaw = 1;
        player.shake(0.6, 2);
        if (this.grabbing > diff.grabTime) {
          this.bus.emit('caught', this);
          this.grabbing = 0;
        }
      } else {
        this.grabbing = Math.max(0, this.grabbing - dt * 0.6);
      }
    } else {
      this.grabbing = Math.max(0, this.grabbing - dt);
    }

    /* ---------------------------------------------------------- animate */
    this._animate(dt, ctx);

    /* ------------------------------------------------- monster footsteps */
    if (!this.phantom && this.speed > 0.4) {
      const stride = this.gait > 0.5 ? 1.05 : 1.45;
      this.stepPhase += (this.speed / stride) * dt * Math.PI;
      if (this.stepPhase >= Math.PI) {
        this.stepPhase -= Math.PI;
        const att = clamp01(1 - this.distanceToPlayer / 24);
        if (att > 0.02) {
          this.audio.footstep({
            intensity: 0.35 + att * 1.15,
            surface: this.rng.chance(0.25) ? 'metal' : 'concrete',
            pan: this._pan,
          });
        }
      }
    }
  }

  _animate(dt, ctx) {
    const t = ctx.time;
    const running = this.state === STATE.HUNT || this.state === STATE.ATTACK;
    this.gait = damp(this.gait, running && this.speed > 2.2 ? 1 : 0, 3.2, dt);
    const g = this.gait;

    // Stride phase advances with actual movement so feet don't skate.
    this._animPhase = (this._animPhase ?? 0) + this.speed * dt * (g > 0.5 ? 3.4 : 2.5);
    const p = this._animPhase;
    const moving = clamp01(this.speed / 2);

    // Idle: shoulders rise and fall, head twitches.
    this.twitch -= dt;
    if (this.twitch <= 0 && this.rng.chance(dt * 0.6)) {
      this.twitch = this.rng.range(0.08, 0.22);
      this.headTurn = this.rng.range(-0.7, 0.7);
    }
    const breath = Math.sin(t * (running ? 4.4 : 1.35)) * (running ? 0.05 : 0.022);

    /* --------------------------------------------------------- posture */
    this.root.position.set(this.pos.x, 0, this.pos.z);
    this.root.rotation.y = this.yaw;

    // The pelvis only bobs and rolls; the fold lives on the spine so the legs
    // always hang straight down from under the body.
    this.hips.position.y =
      lerp(HIP_STAND, HIP_CRAWL, g) + breath * 0.5 - Math.abs(Math.sin(p)) * 0.03 * moving;
    this.hips.rotation.x = 0;
    this.hips.rotation.z = Math.sin(p) * 0.05 * moving;
    this.hips.rotation.y = Math.sin(p) * 0.09 * moving;

    // Hunched when walking, folded almost horizontal when it goes to all fours.
    //
    // These pitches are all negative: a bone's child sits at local +Y, so a
    // positive rotation about X carries it toward +Z, and the rig faces -Z. The
    // signs used to be the other way round, which arched the creature over
    // backwards and left it walking around staring at the ceiling.
    this.spine.rotation.x = lerp(-0.26, -1.15, g) - breath;
    this.spine.rotation.z = Math.sin(p + 0.6) * 0.06 * moving;
    this.chest.rotation.x = lerp(0.08, 0.2, g);
    this.chest.rotation.y = Math.sin(p) * 0.12 * moving;

    // Head: held level on a craned neck, so the face stays pointed at you no
    // matter how far the spine folds over.
    const wantHeadTurn = running ? 0 : this.headTurn;
    this.neck.rotation.x = lerp(0.1, 0.72, g) + Math.sin(t * 2.1) * 0.03;
    this.neck.rotation.y = damp(this.neck.rotation.y, wantHeadTurn, 8, dt);
    this.head.rotation.x = lerp(0.04, 0.12, g) - (running ? Math.sin(t * 9) * 0.05 : 0);
    this.head.rotation.z = Math.sin(t * 1.7) * 0.06;

    // Jaw hangs open, wider when it is hunting.
    const jawTarget = running ? 0.55 + Math.sin(t * 7) * 0.18 : 0.12 + Math.sin(t * 1.1) * 0.06;
    this.jaw = damp(this.jaw, jawTarget, 6, dt);
    this.jawBone.rotation.x = this.jaw;

    /* The limbs are solved against contact points on the floor, which needs the
     * torso's world transform to be current — everything above this line has
     * already been posed, so one update here is enough. */
    this.root.updateMatrixWorld(true);
    const invRoot = _mRoot.copy(this.root.matrixWorld).invert();

    /**
     * Point a two-bone chain at a target given in rig space (floor at y = 0,
     * +X right, -Z forward, before the root's own yaw).
     */
    const reachFor = (joint, child, x, y, z, upper, lower) => {
      // Into the frame the joint's own rotation acts in, i.e. its parent's.
      _m.copy(joint.parent.matrixWorld).premultiply(invRoot).invert();
      _v.set(x, y, z).applyMatrix4(_m).sub(joint.position);
      const r = twoLinkIK(_v.z, _v.y, upper, lower);
      joint.rotation.x = r.hip;
      child.rotation.x = r.knee;
      return r;
    };

    /* ------------------------------------------------------------ legs */
    // Stride and lift, in metres, resolved through IK so the planted foot stays
    // planted however far the body folds over.
    const stride = lerp(0.42, 0.78, g) * moving;
    const clearance = lerp(0.16, 0.3, g) * moving;
    this.legs.forEach((leg, i) => {
      const ph = p + (i === 0 ? 0 : Math.PI);
      const sw = Math.sin(ph);
      const lift = Math.max(0, sw);
      leg.hip.rotation.z = leg.side * lerp(0.05, 0.16, g);
      _v.setFromMatrixPosition(leg.hip.matrixWorld).applyMatrix4(invRoot);
      const r = reachFor(
        leg.hip,
        leg.knee,
        _v.x,
        ANKLE_GROUND + lift * clearance,
        _v.z - sw * stride * 0.5,
        THIGH,
        SHIN,
      );
      // Sole roughly level, rolling onto the toes as the foot leaves the floor.
      leg.ankle.rotation.x = -(r.hip + r.knee) + lerp(0.06, 0.2, g) - lift * 0.34;
    });

    /* ------------------------------------------------------------ arms */
    // Upright: they dangle past the knees and swing out of phase with the legs.
    // Quadruped: they plant on the floor ahead of the body and take the weight,
    // diagonally opposite the legs.
    this.arms.forEach((arm, i) => {
      const ph = p + (i === 0 ? Math.PI : 0);
      const swing = Math.sin(ph) * moving;
      arm.shoulder.rotation.z = arm.side * lerp(0.14, 0.26, g);
      arm.shoulder.rotation.x = -0.08 + swing * -0.4;
      arm.elbow.rotation.x = -0.3 - Math.abs(swing) * 0.22;
      arm.wrist.rotation.x = lerp(0.12, -0.2, g);

      if (g > 0.01) {
        // Plant ahead of the shoulder, reaching further on the swing.
        _v.setFromMatrixPosition(arm.shoulder.matrixWorld).applyMatrix4(invRoot);
        const sx = _v.x;
        const sz = _v.z;
        const lift = Math.max(0, -swing);
        const walkX = arm.shoulder.rotation.x;
        const walkE = arm.elbow.rotation.x;
        const r = reachFor(
          arm.shoulder,
          arm.elbow,
          sx,
          WRIST_GROUND + lift * 0.34,
          sz - 0.16 - Math.max(0, swing) * 0.3,
          arm.upper,
          arm.fore,
        );
        arm.shoulder.rotation.x = lerp(walkX, r.hip, g);
        arm.elbow.rotation.x = lerp(walkE, r.knee, g);
      }

      if (this.state === STATE.ATTACK) {
        const reach = clamp01(this.grabbing / 0.4 + 0.35);
        // Held back from horizontal on purpose. Linear blend skinning loses
        // volume in proportion to the angle it has to blend across, and past
        // about 80 degrees the shoulder collapsed into a visible pinch.
        arm.shoulder.rotation.x = lerp(arm.shoulder.rotation.x, 1.15 + reach * 0.25, 0.8);
        arm.elbow.rotation.x = lerp(arm.elbow.rotation.x, -0.34, 0.8);
        arm.shoulder.rotation.z = arm.side * (0.45 - reach * 0.3);
        arm.wrist.rotation.x = 0.5;
      }
    });

    // Visibility for the audio mix and the director.
    this.visible = ctx.isVisible?.(this) ?? false;
  }

  /** Called when the level's power comes back on. */
  enrage(amount = 1) {
    this.rage = clamp01(this.rage + amount);
    this.awareness = clamp01(this.awareness + 0.5);
    if (!this.phantom) this.audio.scream(1, this._pan ?? 0);
  }

  teleportNear(pos, minDist = 12, maxDist = 20) {
    const maze = this.level.maze;
    const options = [];
    for (let i = 0; i < 80; i++) {
      const f = this.rng.pick(maze.floors);
      const w = maze.worldOf(f.x, f.y);
      const p = new Vector3(w.x, 0, w.z);
      const d = p.distanceTo(pos);
      if (d < minDist || d > maxDist) continue;
      options.push(p);
    }
    if (options.length) {
      this.pos.copy(this.rng.pick(options));
      this.path = [];
      this.pathIndex = 0;
    }
  }

  dispose() {
    this._unsub.forEach((fn) => fn());
    this.alive = false;
    this.scene.remove(this.root);
    for (const m of this.meshes) {
      this.scene.remove(m);
      m.geometry.dispose();
    }
    this.meshes.length = 0;
    this.skeleton?.dispose();
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
  }
}
