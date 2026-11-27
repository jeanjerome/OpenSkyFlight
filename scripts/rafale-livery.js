// Builds the Rafale in the Armée de l'Air livery: the DCS livery sheets
// (assets/models/rafale/ada/source) are redrawn from what they tell — panel
// lines, rivets and markings over a plain paint, their grime left behind —,
// projected onto the surfaces of our model, gathered with its former texture
// in one atlas, and written with new texture coordinates as
// assets/models/rafale/ada/Rafale.gltf.
//
// Each triangle goes to the first region whose nodes and test it matches; a
// region projects its triangles on a plane of the model (x span, positive on
// the left wing, y up, z forward, in metres) and maps that plane onto its
// sheet, by an affine map fitted on the sheet's island, by a thin-plate spline
// through landmarks, or by the map of another region (control surfaces and
// canards borrow a clean patch of the wing). Triangles matching no region
// keep the former texture.
//
// Usage: npm run livery:build
import { Buffer } from 'node:buffer';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { readGltf } from './livery/gltf.js';
import {
  decodeDds,
  decodePng,
  encodePng,
  createImage,
  fillHoles,
  normalsFromDetail,
  redraw,
  featherEdges,
} from './livery/images.js';
import { islandMask, backgroundMask, coverage, fitAffine, applyAffine } from './livery/fit.js';
import { thinPlateSpline } from './livery/warp.js';

const MODEL = 'assets/models/rafale/Rafale.gltf';
const FORMER_TEXTURE = 'assets/models/rafale/Rafale_texture.png';
const SOURCE = 'assets/models/rafale/ada/source';
const OUT = 'assets/models/rafale/ada';

/**
 * Sheets, their slot in the atlas (four columns, two rows of 1024 px) and how
 * to tell their background: a colour sampled at `bgAt`, or with `flat` the even
 * 4×4 blocks of it, for the wing sheets whose background is the paint's grey;
 * `erase` rectangles [u0, v0, u1, v1] are repainted from their surroundings.
 * `paint`: a rectangle of plain paint whose median colour is brought to
 * PAINT (the sheets differ by up to 35 levels and lean green), offset by
 * `shade`. Each sheet is redrawn from its panel lines, rivets and markings
 * (see redraw), `lettering` keeping its dark markings too.
 */
const SHEETS = {
  wingLeft: {
    file: 'rafale_lw_t.dds',
    slot: 0,
    background: { bgAt: [700, 100], flat: true },
    paint: [0, 0, 560, 760],
    // Light housings at the wing root, upper and lower, which our model does not have
    erase: [
      [12, 655, 95, 735],
      [538, 353, 576, 391],
    ],
  },
  wingRight: {
    file: 'rafale_rw_t.dds',
    slot: 1,
    background: { bgAt: [300, 100], flat: true },
    paint: [464, 0, 1024, 760],
    erase: [
      [928, 655, 1012, 735],
      [448, 353, 486, 396],
    ],
  },
  fin: {
    file: 'rafale_derive_t.dds',
    slot: 2,
    lettering: true,
    background: { bgAt: [1000, 40], tolerance: 12 },
    paint: [0, 400, 1024, 1024],
  },
  nose: {
    file: 'rafale_nez_t.dds',
    slot: 3,
    background: { bgAt: [300, 50], tolerance: 12 },
    paint: [540, 260, 880, 800],
    // Formation lights, which the squeezed intake walls would show out of place
    erase: [
      [488, 378, 511, 432],
      [908, 378, 931, 432],
    ],
  },
  top: {
    file: 'rafale_fuselage_t.dds',
    slot: 4,
    background: { bgAt: [700, 100], flat: true },
    paint: [20, 0, 500, 1024],
    // Doors on the nacelles' shoulders, which land on our canard roots
    erase: [
      [66, 120, 104, 292],
      [406, 120, 444, 292],
    ],
  },
  belly: {
    file: 'rafale_fuselage2_t.dds',
    slot: 5,
    background: { bgAt: [700, 800], flat: true },
    paint: [0, 0, 440, 1024],
    shade: -6,
    // Main gear wells painted where the model has none: painted over
    erase: [
      [145, 465, 180, 550],
      [287, 465, 323, 550],
    ],
  },
  former: { png: FORMER_TEXTURE, slot: 6, paint: [0, 140, 560, 520] },
  // Painted here: tyre rubber, wheel hubs, plain paint, and the intake ducts' paint darkening with depth
  extras: { generate: true, slot: 7 },
};
/** Areas of the generated sheet (u0, v0, u1, v1) */
const EXTRAS = {
  rubber: [0, 0, 256, 256],
  hub: [256, 0, 512, 256],
  paint: [512, 0, 768, 256],
  duct: [0, 256, 512, 1024],
};
/** Intakes' lips (z) and the depth over which their ducts darken (m) */
const INTAKE_LIP = 2.62;
const DUCT_DEPTH = 1.6;
/** The airframe's grey (sRGB), a touch blue as on the aircraft */
const PAINT = [138, 141, 146];
/** Semi-matt paint */
const ROUGHNESS = 0.5;
/** Relief drawn from the sheets' panel lines and rivets only (see normalsFromDetail) */
const NORMALS = { radius: 1, clip: 12, dead: 2, strength: 0.05 };
/** What is kept of the sheets (see redraw): lines and rivets, lettering under 60 % of the paint */
const REDRAW = { radius: 3, dead: 3, max: 40, margin: 4, lettering: 0.6 };
/** Width (px) over which the islands' edges fade into the plain paint */
const FEATHER = 12;
const SHEET_SIZE = 1024;
const ATLAS = { width: 4 * SHEET_SIZE, height: 2 * SHEET_SIZE };

/** Wing root (|x|) and elevon hinge line (z) of the model, in metres */
const ROOT = 1.3;
const HINGE = -4.45;
/** Radome joint (z) */
const RADOME = 5.55;

/** Wing leading edge, slats included (z at |x|), swept 49° from the root */
const leadingEdge = (x) => 0.84 - 1.16 * (Math.abs(x) - ROOT);
/** Points ahead of the leading edge pulled back onto the wing's paint, clear of the dark strip along the sheets' edge */
const behindLeadingEdge = ([x, y, z]) => [x, y, Math.min(z, leadingEdge(x) - 0.12)];

/** Projection planes: model point → plane coordinates */
const PLANES = {
  plan: (p) => [p[0], p[2]],
  side: (p) => [p[2], -p[1]],
};

const up = (n) => n[1] > 0;
const left = (c) => c[0] > 0;
/** Where a face looks: 'top' and 'bottom' within 45° of the vertical, else 'side' */
const facing = (n) => (n[1] >= Math.abs(n[0]) ? 'top' : -n[1] >= Math.abs(n[0]) ? 'bottom' : 'side');

// Fuselage maps, in sheet pixels, read off the sheets against the model's
// landmarks: the canopy (z 5.27 to 1.08), the intakes' lips (z 2.5), the fin's
// root (z −2.16), the main gear bays and the nozzles (z −6.1)
/** Forward fuselage top (nez): rows along z, the canopy opening from v 290 to 815 about u 709.5 */
const NOSE_AXIS = 709.5;
const noseRow = (z) => 290 + (5.27 - z) * 125.3;
/** Dorsal spine from the canopy to the fin: the panel and intake behind the canopy (nez) */
const spine = ([x, , z]) => [NOSE_AXIS - 140 * x, 825 + ((1.0 - z) / 3.2) * 175];
/** Rear fuselage top (fuselage): engine nacelles from the intakes, the spine strip under the fin */
const rearTop = ([x, , z]) => {
  const v = 10 + (2.5 - z) * 115;
  if (Math.abs(x) < 0.38 && z < -2.15) return [255 - 132 * x, v];
  return [x > 0 ? 241.4 - 132 * x : 273.6 - 132 * x, v];
};
/** Underside (fuselage2): from the intakes to the tail, symmetric about u 217 */
const belly = ([x, , z]) => [217 + 123 * x, (2.1 - z) * 123];
/** Forward underside (fuselage2): its dark slot on the nose gear doors */
const forwardBelly = ([x, , z]) => [797 + 123 * x, 260 + (4.64 - z) * 123];
/** Lower sides of the nacelles (fuselage2): the strips along the underside */
const lowerSide = ([x, y, z]) => [x > 0 ? 380 + (y - 1.2) * 123 : 55 - (y - 1.2) * 123, (2.1 - z) * 123];

// --- Sources: graded to one paint, redrawn from their lines and markings, their islands' edges faded into it ---
const { json, primitives } = readGltf(MODEL);
const sheets = {};
for (const [key, s] of Object.entries(SHEETS)) {
  if (s.generate) {
    sheets[key] = extrasSheet();
    continue;
  }
  if (s.png) {
    sheets[key] = decodePng(readFileSync(s.png));
  } else {
    sheets[key] = decodeDds(readFileSync(`${SOURCE}/${s.file}`));
  }
  const sheet = sheets[key];
  // The background and the 2 px fringe where DXT blocks blend it with the paint
  const holes = s.background ? grow(backgroundMask(sheet, s.background), sheet.width, 2) : null;
  for (const [u0, v0, u1, v1] of s.erase ?? [])
    for (let v = v0; v < v1; v++) holes.fill(1, v * sheet.width + u0, v * sheet.width + u1);
  const paint = PAINT.map((c) => c + (s.shade ?? 0));
  const median = paintMedian(sheet, s.paint, holes);
  const gains = median.map((m, c) => paint[c] / m);
  for (let i = 0; i < sheet.data.length; i += 4) for (let c = 0; c < 3; c++) sheet.data[i + c] *= gains[c];
  console.log(`${key}: paint ${median.join(',')} → gains ${gains.map((g) => g.toFixed(3)).join(' ')}`);
  if (!holes) continue;
  // Filled first so that the blur behind the redrawing sees paint, not background
  fillHoles(sheet, holes);
  redraw(sheet, paint, { ...REDRAW, darkMarkings: s.lettering ? REDRAW.lettering : 0 });
  featherEdges(sheet, holes, paint, FEATHER);
}

/** Rubber, hub grey, plain paint and the duct's darkening paint, with a faint grain */
function extrasSheet() {
  const sheet = createImage(SHEET_SIZE, SHEET_SIZE);
  let seed = 1;
  const grain = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 6;
  const fill = ([u0, v0, u1, v1], colour) => {
    for (let v = v0; v < v1; v++)
      for (let u = u0; u < u1; u++) {
        const c = colour(v - v0, v1 - v0);
        const g = grain();
        sheet.data.set([c[0] + g, c[1] + g, c[2] + g, 255], (v * SHEET_SIZE + u) * 4);
      }
  };
  fill(EXTRAS.rubber, () => [34, 34, 36]);
  fill(EXTRAS.hub, () => [150, 153, 157]);
  fill(EXTRAS.paint, () => PAINT);
  // Paint at the lip, near black past DUCT_DEPTH
  fill(EXTRAS.duct, (v, h) => {
    const t = Math.min(1, v / h);
    const k = 0.18 + 0.82 * (1 - t) ** 1.6;
    return PAINT.map((c) => c * k);
  });
  return sheet;
}

/** Median colour of the paint in a rectangle: its pixels lighter than the dark details, background left out */
function paintMedian({ width, data }, [u0, v0, u1, v1], holes) {
  const channels = [[], [], []];
  for (let v = v0; v < v1; v++)
    for (let u = u0; u < u1; u++) {
      const i = (v * width + u) * 4;
      if (holes?.[v * width + u] || data[i] + data[i + 1] + data[i + 2] < 270) continue;
      for (let c = 0; c < 3; c++) channels[c].push(data[i + c]);
    }
  return channels.map((values) => values.sort((a, b) => a - b)[values.length >> 1]);
}

// --- Forward fuselage top: our two-seat canopy and the fuselage's top edge
// (where its faces turn past 45°) pinned, row by row, on the single-seat
// canopy opening and the outer edge of the nose sheet's top island ---
const noseTop = (() => {
  const sheet = decodeDds(readFileSync(`${SOURCE}/${SHEETS.nose.file}`));
  const bg = backgroundMask(sheet, SHEETS.nose.background);
  const extent = (re, z, keep) => {
    let max = 0;
    for (const prim of primitives) {
      if (!re.test(prim.node)) continue;
      const { position: P, normal: N } = prim;
      for (let i = 0; i < P.length / 3; i++) {
        if (Math.abs(P[i * 3 + 2] - z) > 0.08) continue;
        const n = [N[i * 3], N[i * 3 + 1], N[i * 3 + 2]];
        if (keep(Math.abs(P[i * 3]), n)) max = Math.max(max, Math.abs(P[i * 3]));
      }
    }
    return max;
  };
  const pairs = [];
  for (let z = 1.25; z <= 5.5; z += 0.25) {
    const v = Math.round(noseRow(z));
    const isBg = (u) => bg[v * SHEET_SIZE + Math.round(u)] === 1;
    // Canopy opening, then the island's edge beyond it, on the left half (the rows are symmetric)
    let u = NOSE_AXIS;
    while (isBg(u) && u > 0) u--;
    const hole = NOSE_AXIS - u;
    while (!isBg(u) && u > 0) u--;
    const outer = Math.min(NOSE_AXIS - u, hole + 110);
    const canopy = extent(/^(Canopy|Glass)/, z, () => true);
    const edge = extent(/^Fuselage$/, z, (ax, n) => ax < 1.25 && n[1] >= Math.abs(n[0]));
    for (const s of [1, -1]) {
      if (hole > 2 && canopy > 0)
        pairs.push([
          [s * canopy, z],
          [NOSE_AXIS - s * hole, v],
        ]);
      if (edge > canopy + 0.05)
        pairs.push([
          [s * edge, z],
          [NOSE_AXIS - s * outer, v],
        ]);
    }
    if (hole <= 2 || canopy === 0)
      pairs.push([
        [0, z],
        [NOSE_AXIS, v],
      ]);
  }
  const spline = thinPlateSpline(pairs);
  console.log(`noseTop: ${pairs.length} landmarks`);
  return ([x, , z]) => spline(x, z);
})();

// --- Forward fuselage sides: the side faces' top and bottom edges pinned, row
// by row, inside the nose sheet's left and right strips ---
const noseSide = (() => {
  const sheet = decodeDds(readFileSync(`${SOURCE}/${SHEETS.nose.file}`));
  const bg = backgroundMask(sheet, SHEETS.nose.background);
  const INSET = 6;
  const spans = { left: [], right: [] };
  for (let z = 2.5; z <= 5.5; z += 0.25) {
    let top = -Infinity;
    let bottom = Infinity;
    for (const prim of primitives) {
      if (prim.node !== 'Fuselage') continue;
      const { position: P, normal: N } = prim;
      for (let i = 0; i < P.length / 3; i++) {
        if (Math.abs(P[i * 3 + 2] - z) > 0.15 || Math.abs(P[i * 3]) > 1.2) continue;
        const n = [N[i * 3], N[i * 3 + 1], N[i * 3 + 2]];
        if (facing(n) !== 'side') continue;
        top = Math.max(top, P[i * 3 + 1]);
        bottom = Math.min(bottom, P[i * 3 + 1]);
      }
    }
    // The mesh has rows of vertices only every so often along z
    if (!Number.isFinite(top) || top - bottom < 0.1) continue;
    const v = Math.round(noseRow(z));
    const isBg = (u) => u < 0 || u >= SHEET_SIZE || bg[v * SHEET_SIZE + u] === 1;
    // First pixel from `u` along `step` that starts a run of `run` pixels of the
    // wanted kind (dark details inside the strips are not its edge)
    const edge = (u, step, wantBg, run) => {
      for (; u > 0 && u < SHEET_SIZE - 1; u += step) {
        let k = 0;
        while (k < run && isBg(u + k * step) === wantBg) k++;
        if (k === run) return u;
      }
      return u;
    };
    // Left strip: its inner edge (the top) leftwards from u 545, then its outer edge
    const leftIn = edge(545, -1, false, 6);
    const leftOut = edge(leftIn, -1, true, 12);
    spans.left.push(
      [
        [top, z],
        [leftIn - INSET, v],
      ],
      [
        [bottom, z],
        [leftOut + INSET, v],
      ],
    );
    // Right strip, rightwards from u 870
    const rightIn = edge(870, 1, false, 6);
    const rightOut = edge(rightIn, 1, true, 12);
    spans.right.push(
      [
        [top, z],
        [rightIn + INSET, v],
      ],
      [
        [bottom, z],
        [rightOut - INSET, v],
      ],
    );
  }
  const left = thinPlateSpline(spans.left);
  const right = thinPlateSpline(spans.right);
  return ([x, y, z]) => (x > 0 ? left(y, z) : right(y, z));
})();
/** Upper sides of the rear fuselage (fuselage): the narrow outer strips beside the nacelles */
const rearSide = ([x, y, z]) => {
  const t = Math.min(1, Math.max(0, (2.65 - y) / 0.9));
  return [x > 0 ? 66 - t * 42 : 449 + t * 38, Math.max(330, 10 + (2.5 - z) * 115)];
};

// --- Intake ducts: the faces inside them, found as those that see the airframe
// all round (rays cast over their hemisphere nearly all hit it) ---
const ducts = (() => {
  const inBox = (c, [x0, x1], [y0, y1], [z0, z1]) =>
    Math.abs(c[0]) >= x0 && Math.abs(c[0]) <= x1 && c[1] >= y0 && c[1] <= y1 && c[2] >= z0 && c[2] <= z1;
  const fuselage = primitives.find((p) => p.node === 'Fuselage');
  const { position: P, normal: N, index: I } = fuselage;
  const tri = (t) => [0, 1, 2].map((k) => [P[I[t + k] * 3], P[I[t + k] * 3 + 1], P[I[t + k] * 3 + 2]]);
  const occluders = [];
  const candidates = [];
  for (let t = 0; t < I.length; t += 3) {
    const v = tri(t);
    const c = [0, 1, 2].map((k) => (v[0][k] + v[1][k] + v[2][k]) / 3);
    if (inBox(c, [0.2, 2.0], [0.7, 2.5], [-1.5, 3.6])) occluders.push(v);
    if (inBox(c, [0.6, 1.5], [0.95, 1.95], [-1.0, INTAKE_LIP + 0.1])) candidates.push([t, c]);
  }
  // Cosine-weighted directions about +z, turned onto each face's normal
  const dirs = [];
  for (let i = 0; i < 16; i++) {
    const r = Math.sqrt((i + 0.5) / 16);
    const a = i * 2.39996;
    dirs.push([r * Math.cos(a), r * Math.sin(a), Math.sqrt(1 - r * r)]);
  }
  const inside = new Set();
  for (const [t, c] of candidates) {
    const n = [0, 1, 2].map((k) => N[I[t] * 3 + k] + N[I[t + 1] * 3 + k] + N[I[t + 2] * 3 + k]);
    const len = Math.hypot(...n);
    const w = n.map((x) => x / len);
    const a = Math.abs(w[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const u = normalize(cross(a, w));
    const b = cross(w, u);
    let hits = 0;
    for (const d of dirs) {
      const dir = [0, 1, 2].map((k) => u[k] * d[0] + b[k] * d[1] + w[k] * d[2]);
      const origin = c.map((x, k) => x + w[k] * 0.01);
      if (occluders.some((v) => rayHits(origin, dir, v, 2.5))) hits++;
    }
    if (hits >= 14) inside.add(t);
  }
  console.log(`intake ducts: ${inside.size} faces of ${candidates.length} near the intakes`);
  return inside;
})();

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalize(v) {
  const l = Math.hypot(...v);
  return v.map((x) => x / l);
}

/** Möller–Trumbore: does the ray meet the triangle within `far`? */
function rayHits(o, d, [a, b, c], far) {
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const p = cross(d, e2);
  const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
  if (Math.abs(det) < 1e-9) return false;
  const s = [o[0] - a[0], o[1] - a[1], o[2] - a[2]];
  const u = (s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) / det;
  if (u < 0 || u > 1) return false;
  const q = cross(s, e1);
  const v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) / det;
  if (v < 0 || u + v > 1) return false;
  const t = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det;
  return t > 1e-4 && t < far;
}

/** Wheels: centre and radius in the y–z plane (they turn about x) */
const wheels = new Map(
  primitives
    .filter((p) => /Wheel/.test(p.node))
    .map((p) => {
      let y0 = Infinity,
        y1 = -Infinity,
        z0 = Infinity,
        z1 = -Infinity;
      for (let i = 0; i < p.position.length; i += 3) {
        y0 = Math.min(y0, p.position[i + 1]);
        y1 = Math.max(y1, p.position[i + 1]);
        z0 = Math.min(z0, p.position[i + 2]);
        z1 = Math.max(z1, p.position[i + 2]);
      }
      return [p.node, { y: (y0 + y1) / 2, z: (z0 + z1) / 2, r: (y1 - y0) / 2 }];
    }),
);
const onTyre = (c, node) => {
  const w = wheels.get(node);
  return Math.hypot(c[1] - w.y, c[2] - w.z) > 0.62 * w.r;
};
const patch = ([u0, v0, u1, v1]) => [(u0 + u1) / 2, (v0 + v1) / 2];

/**
 * Regions, first match wins. `fit`: island seed (and a starting map when the
 * island's outline alone is ambiguous, as a triangle's is), the model point
 * moved first by `warp` when there is one; `map`: model point
 * → sheet pixel; `like`: the map of another region, after `warp` moves the
 * model point onto it.
 */
const REGIONS = [
  {
    // The strakes ahead of the wings' leading edges, round the canards' roots
    // and over the intakes: plain paint, where the wing, nose and intake maps
    // would otherwise meet in a saw-tooth of slightly different greys
    name: 'strakes',
    nodes: /^Fuselage$/,
    test: (c, n, node, t) =>
      Math.abs(c[0]) > 0.85 &&
      Math.abs(c[0]) < 1.75 &&
      c[2] > leadingEdge(c[0]) - 0.05 &&
      c[2] < 2.9 &&
      c[1] > 1.25 &&
      !ducts.has(t),
    sheet: 'extras',
    map: () => patch(EXTRAS.paint),
  },
  ...['Left', 'Right'].flatMap((side) => {
    const sheet = `wing${side}`;
    const isSide = side === 'Left' ? left : (c) => !left(c);
    const s = side === 'Left' ? 1 : -1;
    const wing = new RegExp(`^(Fuselage|Slat${side[0]})$`);
    const starts =
      side === 'Left'
        ? { upper: [135.4, 0, -166, 0, 138.6, 628.8], lower: [129, 0, 322, 0, -135, 404] }
        : { upper: [135.4, 0, 1189, 0, 138.6, 628.8], lower: [129, 0, 707.7, 0, -135, 404] };
    const seeds = side === 'Left' ? { upper: [200, 200], lower: [700, 800] } : { upper: [800, 200], lower: [300, 800] };
    // Outlines of the two surfaces, leaving out the strips that touch them
    const mirror = (poly) => (side === 'Left' ? poly : poly.map(([x, y]) => [SHEET_SIZE - x, y]));
    const clips = {
      upper: mirror([
        [0, 0],
        [560, 0],
        [560, 140],
        [0, 780],
      ]),
      lower: mirror([
        [480, 280],
        [1010, 895],
        [1010, 1024],
        [480, 1024],
      ]),
    };
    const { background } = SHEETS[sheet];
    // The wing's own surfaces and tips, not the nacelle walls at the root
    const onWing = (c, n) =>
      isSide(c) && Math.abs(c[0]) > ROOT && c[2] < 1.2 && (Math.abs(n[1]) >= Math.abs(n[0]) || Math.abs(c[0]) > 1.6);
    return [
      {
        name: `wing${side}Upper`,
        nodes: wing,
        test: (c, n) => onWing(c, n) && up(n),
        sheet,
        plane: 'plan',
        warp: behindLeadingEdge,
        fit: { seed: seeds.upper, start: starts.upper, ...background, clip: clips.upper },
      },
      {
        name: `wing${side}Lower`,
        nodes: wing,
        test: (c, n) => onWing(c, n) && !up(n),
        sheet,
        plane: 'plan',
        warp: behindLeadingEdge,
        fit: { seed: seeds.lower, start: starts.lower, ...background, clip: clips.lower },
      },
      // Control surfaces: the wing panel just ahead of the hinge, mirrored about
      // it, the elevons' moved inboard clear of the roundels
      ...['Upper', 'Lower'].map((face) => ({
        name: `controls${side}${face}`,
        nodes: new RegExp(`^(Flap|Eleron)${side[0]}$`),
        test: (c, n) => up(n) === (face === 'Upper'),
        like: `wing${side}${face}`,
        warp: (p, node) => [node.startsWith('Eleron') ? p[0] - s * 1.1 : p[0], p[1], 2 * HINGE - p[2]],
      })),
      // Canards: a clean patch of the inner wing
      ...['Upper', 'Lower'].map((face) => ({
        name: `canard${side}${face}`,
        nodes: new RegExp(`^Kanard${side[0]}$`),
        test: (c, n) => up(n) === (face === 'Upper'),
        like: `wing${side}${face}`,
        warp: (p) => [p[0] + s * 1.0, p[1], p[2] - 3.0],
      })),
    ];
  }),
  {
    name: 'finLeft',
    nodes: /^(Tail|Rudder)$/,
    test: (c, n) => n[0] > 0,
    sheet: 'fin',
    plane: 'side',
    fit: { seed: [500, 850] },
  },
  {
    name: 'finRight',
    nodes: /^(Tail|Rudder)$/,
    test: (c, n) => n[0] <= 0,
    sheet: 'fin',
    plane: 'side',
    fit: { seed: [500, 500] },
  },
  {
    // The drop tanks: plain paint (the former texture patched them in several greys)
    name: 'tanks',
    nodes: /^FuelTank[LR]$/,
    test: () => true,
    sheet: 'extras',
    map: () => patch(EXTRAS.paint),
  },
  {
    name: 'tyres',
    nodes: /Wheel/,
    test: (c, n, node) => onTyre(c, node),
    sheet: 'extras',
    map: () => patch(EXTRAS.rubber),
  },
  {
    name: 'hubs',
    nodes: /Wheel/,
    test: () => true,
    sheet: 'extras',
    map: () => patch(EXTRAS.hub),
  },
  {
    // Inside the intakes: the paint darkening with depth
    name: 'intakeDucts',
    nodes: /^Fuselage$/,
    test: (c, n, node, t) => ducts.has(t),
    sheet: 'extras',
    map: ([, , z]) => {
      const [u0, v0, u1, v1] = EXTRAS.duct;
      const depth = Math.min(1, Math.max(0, (INTAKE_LIP - z) / DUCT_DEPTH));
      return [(u0 + u1) / 2, v0 + 4 + depth * (v1 - v0 - 8)];
    },
  },
  {
    // The shoulders where the nacelles meet the wings: plain paint, these steep
    // faces would stretch any map from above into streaks
    name: 'shoulders',
    nodes: /^Fuselage$/,
    test: (c, n) => facing(n) !== 'bottom' && Math.abs(c[0]) > 1.15 && c[1] > 1.7 && c[2] < 1.0,
    sheet: 'extras',
    map: () => patch(EXTRAS.paint),
  },
  {
    // The radome: the smooth paint filling the nose sheet's canopy opening
    name: 'radome',
    nodes: /^Fuselage$/,
    test: (c) => c[2] > RADOME,
    sheet: 'nose',
    map: ([x, y, z]) => noseTop([x * 0.3, y, 4.5 - (z - RADOME) * 0.4]),
  },
  {
    // The intakes' outer walls and the canards' roots, beyond the nose sheet's
    // strips: the side panel further forward
    name: 'intakeSide',
    nodes: /^Fuselage$/,
    test: (c, n) =>
      facing(n) === 'side' && c[2] < 2.8 && ((c[2] > 0.5 && c[1] < 1.85) || (c[2] > 0 && Math.abs(c[0]) > 0.9)),
    sheet: 'nose',
    // Squeezed onto the strip's plain middle (clear of the intake's dark shading
    // further back), below its top edge, which the canards' roots rise above
    map: ([x, y, z]) => noseSide([x, Math.min(y, 2.1), 3.0 + Math.max(0, z) * 0.7]),
  },
  {
    name: 'spine',
    nodes: /^Fuselage$/,
    test: (c, n) => facing(n) !== 'bottom' && Math.abs(c[0]) < 0.55 && c[2] > -2.2 && c[2] <= 1.0 && c[1] > 2.0,
    sheet: 'nose',
    map: spine,
  },
  {
    name: 'noseTop',
    nodes: /^Fuselage$/,
    test: (c, n) => facing(n) === 'top' && c[2] > 1.0,
    sheet: 'nose',
    map: noseTop,
  },
  {
    name: 'rearTop',
    nodes: /^Fuselage$/,
    test: (c, n) => facing(n) === 'top',
    sheet: 'top',
    map: rearTop,
  },
  {
    name: 'rearSide',
    nodes: /^Fuselage$/,
    test: (c, n) => facing(n) === 'side' && c[2] <= 0.5 && c[1] >= 1.75 && Math.abs(c[0]) > 0.6,
    sheet: 'top',
    map: rearSide,
  },
  {
    name: 'noseSide',
    nodes: /^Fuselage$/,
    test: (c, n) => facing(n) === 'side' && c[2] > 0.5,
    sheet: 'nose',
    map: noseSide,
  },
  {
    name: 'lowerSide',
    nodes: /^Fuselage$/,
    test: (c, n) => facing(n) === 'side',
    sheet: 'belly',
    map: lowerSide,
  },
  {
    name: 'belly',
    nodes: /^(Fuselage|DoorsRear.*)$/,
    test: (c, n) => facing(n) === 'bottom' && c[2] < 2.0,
    sheet: 'belly',
    map: belly,
  },
  {
    name: 'forwardBelly',
    nodes: /^(Fuselage|DoorsFront.*)$/,
    test: (c, n) => facing(n) === 'bottom',
    sheet: 'belly',
    map: forwardBelly,
  },
];

/** Image at half its size, each pixel the mean of four */
function halve({ width, height, data }) {
  const out = createImage(width / 2, height / 2);
  for (let y = 0; y < height / 2; y++)
    for (let x = 0; x < width / 2; x++)
      for (let c = 0; c < 4; c++) {
        const at = (dx, dy) => data[((2 * y + dy) * width + 2 * x + dx) * 4 + c];
        out.data[(y * (width / 2) + x) * 4 + c] = (at(0, 0) + at(1, 0) + at(0, 1) + at(1, 1)) / 4;
      }
  return out;
}

/** Mask grown by `r` pixels */
function grow(mask, width, r) {
  let out = mask;
  for (let k = 0; k < r; k++) {
    const next = Uint8Array.from(out);
    for (let i = 0; i < out.length; i++) {
      if (out[i]) continue;
      const x = i % width;
      if ((x > 0 && out[i - 1]) || (x < width - 1 && out[i + 1]) || out[i - width] || out[i + width]) next[i] = 1;
    }
    out = next;
  }
  return out;
}

// --- Triangles of each region ---
const triangles = []; // { prim, ids, region }
const byRegion = new Map(REGIONS.map((r) => [r.name, []]));
for (const prim of primitives) {
  const { position: P, normal: N, index: I } = prim;
  for (let t = 0; t < I.length; t += 3) {
    const ids = [I[t], I[t + 1], I[t + 2]];
    const c = [0, 1, 2].map((k) => (P[ids[0] * 3 + k] + P[ids[1] * 3 + k] + P[ids[2] * 3 + k]) / 3);
    const n = [0, 1, 2].map((k) => N[ids[0] * 3 + k] + N[ids[1] * 3 + k] + N[ids[2] * 3 + k]);
    const region =
      prim.material === 0 ? REGIONS.find((r) => r.nodes.test(prim.node) && r.test(c, n, prim.node, t)) : null;
    triangles.push({ prim, ids, region });
    if (region) byRegion.get(region.name).push({ prim, ids });
  }
}

// --- Maps from model points to sheet pixels ---
const point = (prim, i) => [prim.position[i * 3], prim.position[i * 3 + 1], prim.position[i * 3 + 2]];
const maps = new Map();
for (const region of REGIONS.filter((r) => !r.like)) {
  const count = byRegion.get(region.name).length;
  if (region.map) {
    maps.set(region.name, { sheet: region.sheet, map: region.map });
    console.log(`${region.name}: ${count} triangles`);
    continue;
  }
  const plane = PLANES[region.plane];
  let toSheet;
  if (region.fit) {
    const { seed, start, ...options } = region.fit;
    // The island is found on the sheet as decoded, before its background is filled
    const island = islandMask(decodeDds(readFileSync(`${SOURCE}/${SHEETS[region.sheet].file}`)), seed, options);
    const flat = byRegion.get(region.name).map(({ prim, ids }) => ids.map((i) => plane(point(prim, i))));
    const { m, score } = fitAffine(coverage(flat, 0.02), island, { start });
    const scale = Math.sqrt(Math.abs(m[0] * m[4] - m[1] * m[3]));
    console.log(`${region.name}: ${count} triangles, overlap ${score.toFixed(3)}, ${scale.toFixed(0)} px/m`);
    toSheet = (x, y) => applyAffine(m, x, y);
  } else {
    toSheet = thinPlateSpline(region.landmarks);
    console.log(`${region.name}: ${count} triangles, ${region.landmarks.length} landmarks`);
  }
  const warp = region.warp ?? ((p) => p);
  maps.set(region.name, { sheet: region.sheet, map: (p) => toSheet(...plane(warp(p))) });
}
for (const region of REGIONS.filter((r) => r.like)) {
  const base = maps.get(region.like);
  maps.set(region.name, { sheet: base.sheet, map: (p, node) => base.map(region.warp(p, node)) });
  console.log(`${region.name}: ${byRegion.get(region.name).length} triangles, from ${region.like}`);
}
const unmapped = triangles.filter((t) => !t.region && t.prim.material === 0 && t.prim.node === 'Fuselage').length;
console.log(`fuselage triangles left on the former texture: ${unmapped}`);

// --- Atlas ---
const atlas = createImage(ATLAS.width, ATLAS.height);
const slotOrigin = (key) => {
  const slot = SHEETS[key].slot;
  return [(slot % 4) * SHEET_SIZE, Math.floor(slot / 4) * SHEET_SIZE];
};
for (const key of Object.keys(SHEETS)) {
  const [ox, oy] = slotOrigin(key);
  const { data, width } = sheets[key];
  for (let y = 0; y < SHEET_SIZE; y++) {
    atlas.data.set(data.subarray(y * width * 4, (y + 1) * width * 4), ((oy + y) * ATLAS.width + ox) * 4);
  }
}

// --- Model with the new texture coordinates ---
const toAtlas = (key, [u, v]) => {
  const [ox, oy] = slotOrigin(key);
  const clamp = (x) => Math.min(SHEET_SIZE - 0.5, Math.max(0.5, x));
  return [(ox + clamp(u)) / ATLAS.width, (oy + clamp(v)) / ATLAS.height];
};
const meshes = new Map(); // node name → { positions, normals, uvs, indices, material }
for (const { prim, ids, region } of triangles) {
  let mesh = meshes.get(prim.node);
  if (!mesh) {
    mesh = { positions: [], normals: [], uvs: [], indices: [], material: prim.material, vertices: new Map() };
    meshes.set(prim.node, mesh);
  }
  for (const i of ids) {
    const key = `${i}:${region ? region.name : ''}`;
    let v = mesh.vertices.get(key);
    if (v === undefined) {
      v = mesh.vertices.size;
      mesh.vertices.set(key, v);
      const p = point(prim, i);
      mesh.positions.push(...p);
      mesh.normals.push(prim.normal[i * 3], prim.normal[i * 3 + 1], prim.normal[i * 3 + 2]);
      const uv = region
        ? toAtlas(maps.get(region.name).sheet, maps.get(region.name).map(p, prim.node))
        : toAtlas('former', [prim.uv[i * 2] * SHEET_SIZE, prim.uv[i * 2 + 1] * SHEET_SIZE]);
      mesh.uvs.push(...uv);
    }
    mesh.indices.push(v);
  }
}

// --- Normal map: the livery's panel lines and rivets as relief, the former texture flat ---
const normals = createImage(ATLAS.width, ATLAS.height);
for (let i = 0; i < normals.data.length; i += 4) normals.data.set([128, 128, 255, 255], i);
for (const [key, s] of Object.entries(SHEETS)) {
  if (!s.file) continue;
  const [ox, oy] = slotOrigin(key);
  const { data } = normalsFromDetail(sheets[key], NORMALS);
  for (let y = 0; y < SHEET_SIZE; y++) {
    normals.data.set(data.subarray(y * SHEET_SIZE * 4, (y + 1) * SHEET_SIZE * 4), ((oy + y) * ATLAS.width + ox) * 4);
  }
}

mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/Rafale_color.png`, encodePng(atlas));
// At half the colour's resolution: relief this shallow needs no finer texels
writeFileSync(`${OUT}/Rafale_normal.png`, encodePng(halve(normals)));
writeModel(`${OUT}/Rafale.gltf`, `${OUT}/Rafale.bin`);
console.log(`wrote ${OUT}/Rafale.gltf, Rafale.bin, Rafale_color.png, Rafale_normal.png`);

function writeModel(gltfPath, binPath) {
  const chunks = [];
  let length = 0;
  const bufferViews = [];
  const accessors = [];
  const add = (array, target, type, componentType, minMax) => {
    const bytes = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
    const pad = (4 - (length % 4)) % 4;
    if (pad) (chunks.push(Buffer.alloc(pad)), (length += pad));
    bufferViews.push({ buffer: 0, byteOffset: length, byteLength: bytes.length, target });
    chunks.push(bytes);
    length += bytes.length;
    const n = { SCALAR: 1, VEC2: 2, VEC3: 3 }[type];
    const accessor = { bufferView: bufferViews.length - 1, componentType, count: array.length / n, type };
    if (minMax) {
      accessor.min = [0, 1, 2].map((k) => array.filter((_, i) => i % 3 === k).reduce((a, b) => Math.min(a, b)));
      accessor.max = [0, 1, 2].map((k) => array.filter((_, i) => i % 3 === k).reduce((a, b) => Math.max(a, b)));
    }
    accessors.push(accessor);
    return accessors.length - 1;
  };
  const nodes = [];
  const outMeshes = [];
  const nodeIndex = new Map();
  // Same hierarchy as the source, without its camera
  const kept = json.nodes.map((node, i) => [node, i]).filter(([node]) => node.camera === undefined);
  kept.forEach(([, i], k) => nodeIndex.set(i, k));
  for (const [node] of kept) {
    const out = { name: node.name };
    if (node.matrix) out.matrix = node.matrix;
    if (node.children) out.children = node.children.filter((c) => nodeIndex.has(c)).map((c) => nodeIndex.get(c));
    const mesh = meshes.get(node.name);
    if (node.mesh !== undefined && mesh) {
      out.mesh = outMeshes.length;
      outMeshes.push({
        name: node.name,
        primitives: [
          {
            attributes: {
              POSITION: add(Float32Array.from(mesh.positions), 34962, 'VEC3', 5126, true),
              NORMAL: add(Float32Array.from(mesh.normals), 34962, 'VEC3', 5126),
              TEXCOORD_0: add(Float32Array.from(mesh.uvs), 34962, 'VEC2', 5126),
            },
            indices: add(Uint32Array.from(mesh.indices), 34963, 'SCALAR', 5125),
            material: mesh.material,
          },
        ],
      });
    }
    nodes.push(out);
  }
  const bin = Buffer.concat(chunks);
  writeFileSync(binPath, bin);
  const gltf = {
    asset: { version: '2.0', generator: 'OpenSkyFlight livery build' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes,
    meshes: outMeshes,
    materials: [
      {
        name: 'Paint',
        pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: ROUGHNESS },
        normalTexture: { index: 1 },
      },
      json.materials[1],
    ],
    textures: [
      { source: 0, sampler: 0 },
      { source: 1, sampler: 0 },
    ],
    images: [
      { uri: 'Rafale_color.png', mimeType: 'image/png' },
      { uri: 'Rafale_normal.png', mimeType: 'image/png' },
    ],
    samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }],
    buffers: [{ uri: 'Rafale.bin', byteLength: bin.length }],
    bufferViews,
    accessors,
  };
  writeFileSync(gltfPath, JSON.stringify(gltf));
}
