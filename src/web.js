function mulberry32(seed) {
  let state = seed >>> 0;
  return function rand() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng) {
  const u = Math.max(rng(), 1e-12);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v);
}

function randomInSphere(rng, radius = 1) {
  const r = radius * Math.cbrt(rng());
  const cosTheta = 1 - 2 * rng();
  const sinTheta = Math.sqrt(Math.max(1 - cosTheta * cosTheta, 0));
  const phi = Math.PI * 2 * rng();
  return [r * sinTheta * Math.cos(phi), r * cosTheta, r * sinTheta * Math.sin(phi)];
}

function randomDirection(rng) {
  return randomInSphere(rng, 1).map((component, index, arr) => {
    const len = Math.hypot(...arr);
    return component / len;
  });
}

function clampLength(p, max) {
  const len = Math.hypot(...p) || 1;
  if (len <= max) return p;
  return p.map((component) => (component * max) / len);
}

function quad(a, b, c, t) {
  const u = 1 - t;
  return [
    u * u * a[0] + 2 * u * t * b[0] + t * t * c[0],
    u * u * a[1] + 2 * u * t * b[1] + t * t * c[1],
    u * u * a[2] + 2 * u * t * b[2] + t * t * c[2],
  ];
}

function makeNodes(rng, count) {
  const nodes = [];
  const randomCount = Math.floor(count * 0.5);
  for (let i = 0; i < randomCount; i += 1) {
    nodes.push({ p: randomInSphere(rng, 0.96), mass: 0.45 + rng(), kind: "knot" });
  }

  const sheets = [0, 1, 2].map(() => randomDirection(rng));
  const sheetCount = Math.floor(count * 0.22);
  for (let i = 0; i < sheetCount; i += 1) {
    const normal = sheets[i % sheets.length];
    const seed = randomInSphere(rng, 0.9);
    const along = seed[0] * normal[0] + seed[1] * normal[1] + seed[2] * normal[2];
    const p = clampLength(
      [
        seed[0] - along * normal[0] + normal[0] * gaussian(rng) * 0.018,
        seed[1] - along * normal[1] + normal[1] * gaussian(rng) * 0.018,
        seed[2] - along * normal[2] + normal[2] * gaussian(rng) * 0.018,
      ],
      0.96,
    );
    nodes.push({ p, mass: 0.55 + rng() * 0.7, kind: "sheet" });
  }

  const lines = [];
  for (let i = 0; i < 5; i += 1) {
    lines.push([randomInSphere(rng, 0.8), randomInSphere(rng, 0.45), randomInSphere(rng, 0.8)]);
  }
  while (nodes.length < count) {
    const line = lines[nodes.length % lines.length];
    const p = clampLength(
      quad(line[0], line[1], line[2], rng()).map((component) => component + gaussian(rng) * 0.02),
      0.96,
    );
    nodes.push({ p, mass: 0.35 + rng() * 0.4, kind: "filament" });
  }
  return nodes;
}

function connect(nodes) {
  const edges = [];
  const seen = new Set();
  for (let i = 0; i < nodes.length; i += 1) {
    const nearest = [];
    for (let j = 0; j < nodes.length; j += 1) {
      if (i === j) continue;
      const dx = nodes[i].p[0] - nodes[j].p[0];
      const dy = nodes[i].p[1] - nodes[j].p[1];
      const dz = nodes[i].p[2] - nodes[j].p[2];
      nearest.push({ j, d: Math.hypot(dx, dy, dz) });
    }
    nearest.sort((a, b) => a.d - b.d);
    for (let k = 0; k < 3 && k < nearest.length; k += 1) {
      if (nearest[k].d > 0.48) break;
      const a = Math.min(i, nearest[k].j);
      const b = Math.max(i, nearest[k].j);
      const key = `${a}-${b}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ a, b, d: nearest[k].d });
    }
  }
  return edges;
}

const COLOR = {
  knot: [1, 0.84, 0.58],
  sheet: [0.68, 0.82, 1],
  filament: [0.48, 0.7, 1],
  field: [0.55, 0.6, 0.72],
};

function jitterColor(rgb, rng, amount = 0.08) {
  return rgb.map((channel) => Math.min(1, Math.max(0.05, channel + (rng() - 0.5) * amount)));
}

/**
 * Unit-sphere cosmic web. Positions lie in a ball of radius 1.
 * `web` is the present-day clustered layout; `uniform` is the same particles
 * before structure formation.
 */
export function generateWeb({
  seed = 42,
  count = 16000,
  nodes = 120,
  haloSigma = 0.02,
  filamentSigma = 0.01,
} = {}) {
  const rng = mulberry32(seed);
  const nodeList = makeNodes(rng, nodes);
  const edges = connect(nodeList);
  const knotCount = Math.floor(count * 0.4);
  const filamentCount = Math.floor(count * 0.48);
  const fieldCount = count - knotCount - filamentCount;
  const total = knotCount + filamentCount + fieldCount;

  const web = new Float32Array(total * 3);
  const uniform = new Float32Array(total * 3);
  const baseColor = new Float32Array(total * 3);
  const baseSize = new Float32Array(total);
  const formA = new Float32Array(total);
  const hash = new Float32Array(total);

  const massSum = nodeList.reduce((sum, node) => sum + node.mass, 0);
  const edgeSum = edges.reduce((sum, edge) => sum + edge.d, 0) || 1;

  function write(index, position, kind) {
    const p = clampLength(position, 0.985);
    const u = randomInSphere(rng, 0.985);
    const o = index * 3;
    web[o] = p[0];
    web[o + 1] = p[1];
    web[o + 2] = p[2];
    uniform[o] = u[0];
    uniform[o + 1] = u[1];
    uniform[o + 2] = u[2];
    const color = jitterColor(COLOR[kind], rng);
    baseColor[o] = color[0];
    baseColor[o + 1] = color[1];
    baseColor[o + 2] = color[2];
    hash[index] = rng();
    if (kind === "knot") {
      baseSize[index] = 1.8 + rng() * 1.3;
      formA[index] = 0.05 + rng() * 0.08;
    } else if (kind === "field") {
      baseSize[index] = 0.55 + rng() * 0.45;
      formA[index] = 0.25 + rng() * 0.4;
    } else {
      baseSize[index] = 0.9 + rng() * 0.7;
      formA[index] = 0.11 + rng() * 0.16;
    }
  }

  for (let i = 0; i < knotCount; i += 1) {
    let ticket = rng() * massSum;
    let node = nodeList[0];
    for (const candidate of nodeList) {
      ticket -= candidate.mass;
      if (ticket <= 0) {
        node = candidate;
        break;
      }
    }
    const sigma = node.kind === "knot" ? haloSigma : haloSigma * 1.6;
    write(
      i,
      node.p.map((component) => component + gaussian(rng) * sigma),
      node.kind === "filament" ? "filament" : "knot",
    );
  }

  for (let i = 0; i < filamentCount; i += 1) {
    let ticket = rng() * edgeSum;
    let edge = edges[0];
    for (const candidate of edges) {
      ticket -= candidate.d;
      if (ticket <= 0) {
        edge = candidate;
        break;
      }
    }
    if (!edge) {
      write(knotCount + i, randomInSphere(rng), "field");
      continue;
    }
    const from = nodeList[edge.a].p;
    const to = nodeList[edge.b].p;
    const t = rng();
    const axis = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
    const len = Math.hypot(...axis) || 1;
    const tangent = axis.map((component) => component / len);
    let helper = Math.abs(tangent[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const side = [
      tangent[1] * helper[2] - tangent[2] * helper[1],
      tangent[2] * helper[0] - tangent[0] * helper[2],
      tangent[0] * helper[1] - tangent[1] * helper[0],
    ];
    const sideLen = Math.hypot(...side) || 1;
    const s = side.map((component) => component / sideLen);
    const b = [
      tangent[1] * s[2] - tangent[2] * s[1],
      tangent[2] * s[0] - tangent[0] * s[2],
      tangent[0] * s[1] - tangent[1] * s[0],
    ];
    const radial = gaussian(rng) * filamentSigma;
    const vertical = gaussian(rng) * filamentSigma;
    write(
      knotCount + i,
      [
        from[0] + axis[0] * t + s[0] * radial + b[0] * vertical,
        from[1] + axis[1] * t + s[1] * radial + b[1] * vertical,
        from[2] + axis[2] * t + s[2] * radial + b[2] * vertical,
      ],
      "filament",
    );
  }

  for (let i = 0; i < fieldCount; i += 1) {
    write(knotCount + filamentCount + i, randomInSphere(rng, 0.98), "field");
  }

  return { count: total, web, uniform, baseColor, baseSize, formA, hash };
}
