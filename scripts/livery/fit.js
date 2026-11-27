// Registration of the model's surfaces on the islands of a livery sheet: each
// surface is projected on a plane, and an affine map from that plane to the
// sheet's pixels is fitted so that the projected silhouette covers the island.

/**
 * Island of a sheet: the pixels connected to `seed` that are not background.
 * Background pixels have the colour found at `bgAt`; with `flat`, only whole
 * 4×4 blocks of that colour count, for sheets whose background is the same
 * grey as the paint but perfectly even. The background is grown from the
 * sheet's edges (dark details inside an island stay part of it), or with
 * `holes` every background pixel, enclosed ones included, is left out. A
 * `clip` polygon (sheet pixels) cuts an island from the parts it touches.
 */
export function islandMask(sheet, seed, options = {}) {
  const island = growIsland(sheet, seed, options);
  if (options.clip) {
    const { width, mask } = island;
    for (let i = 0; i < mask.length; i++)
      if (mask[i] && !inPolygon(options.clip, (i % width) + 0.5, Math.floor(i / width) + 0.5)) mask[i] = 0;
  }
  return island;
}

function inPolygon(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Per-pixel background flags of a sheet (see islandMask for the options) */
export function backgroundMask(sheet, options = {}) {
  const isBg = backgroundTest(sheet, options);
  const mask = new Uint8Array(sheet.width * sheet.height);
  for (let i = 0; i < mask.length; i++) mask[i] = isBg(i) ? 1 : 0;
  return mask;
}

function backgroundTest(sheet, { bgAt = [1, 1], tolerance = 18, flat = false }) {
  const { width, height, data } = sheet;
  const bi = (bgAt[1] * width + bgAt[0]) * 4;
  const bg = [data[bi], data[bi + 1], data[bi + 2]];
  const near = (i, tol) =>
    Math.abs(data[i * 4] - bg[0]) + Math.abs(data[i * 4 + 1] - bg[1]) + Math.abs(data[i * 4 + 2] - bg[2]) <= tol;
  let isBg = (i) => near(i, tolerance);
  if (flat) {
    const blocks = new Uint8Array((width / 4) * (height / 4));
    for (let by = 0; by < height / 4; by++)
      for (let bx = 0; bx < width / 4; bx++) {
        let even = 1;
        for (let k = 0; k < 16 && even; k++) even = near((by * 4 + (k >> 2)) * width + bx * 4 + (k & 3), 2) ? 1 : 0;
        blocks[by * (width / 4) + bx] = even;
      }
    isBg = (i) => blocks[Math.floor(i / width / 4) * (width / 4) + Math.floor((i % width) / 4)] === 1;
  }
  return isBg;
}

function growIsland(sheet, seed, options) {
  const { width, height } = sheet;
  const { holes = false } = options;
  const isBg = backgroundTest(sheet, options);
  const s = seed[1] * width + seed[0];
  if (isBg(s)) throw new Error(`seed ${seed} lies on the background`);
  if (holes) return { width, height, mask: flood(width, height, [s], (i) => !isBg(i)) };
  const background = flood(width, height, edgeSeeds(width, height).filter(isBg), isBg);
  return { width, height, mask: flood(width, height, [s], (i) => !background[i]) };
}

function edgeSeeds(width, height) {
  const seeds = [];
  for (let x = 0; x < width; x++) seeds.push(x, (height - 1) * width + x);
  for (let y = 0; y < height; y++) seeds.push(y * width, y * width + width - 1);
  return seeds;
}

function flood(width, height, seeds, accept) {
  const mask = new Uint8Array(width * height);
  const stack = [];
  for (const s of seeds) if (!mask[s]) ((mask[s] = 1), stack.push(s));
  while (stack.length) {
    const i = stack.pop();
    const x = i % width;
    const y = (i - x) / width;
    for (const [nx, ny] of [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ]) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const j = ny * width + nx;
      if (!mask[j] && accept(j)) ((mask[j] = 1), stack.push(j));
    }
  }
  return mask;
}

/** Grid samples (plane coordinates) covering the given 2D triangles, `step` apart */
export function coverage(triangles, step) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const t of triangles)
    for (const [x, y] of t) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  const nx = Math.ceil((maxX - minX) / step) + 1;
  const ny = Math.ceil((maxY - minY) / step) + 1;
  const hit = new Uint8Array(nx * ny);
  for (const [a, b, c] of triangles) {
    const d = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
    if (Math.abs(d) < 1e-12) continue;
    const x0 = Math.floor((Math.min(a[0], b[0], c[0]) - minX) / step);
    const x1 = Math.ceil((Math.max(a[0], b[0], c[0]) - minX) / step);
    const y0 = Math.floor((Math.min(a[1], b[1], c[1]) - minY) / step);
    const y1 = Math.ceil((Math.max(a[1], b[1], c[1]) - minY) / step);
    for (let j = y0; j <= y1; j++)
      for (let i = x0; i <= x1; i++) {
        const px = minX + i * step;
        const py = minY + j * step;
        const l0 = ((b[0] - px) * (c[1] - py) - (c[0] - px) * (b[1] - py)) / d;
        const l1 = ((c[0] - px) * (a[1] - py) - (a[0] - px) * (c[1] - py)) / d;
        if (l0 >= -1e-9 && l1 >= -1e-9 && l0 + l1 <= 1 + 1e-9) hit[j * nx + i] = 1;
      }
  }
  const points = [];
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) if (hit[j * nx + i]) points.push([minX + i * step, minY + j * step]);
  return { points, step };
}

/** Affine map [a, b, c, d, e, f]: (x, y) → (a·x + b·y + c, d·x + e·y + f) */
export const applyAffine = (m, x, y) => [m[0] * x + m[1] * y + m[2], m[3] * x + m[4] * y + m[5]];

/** Least-squares affine map through point pairs [[x, y], [u, v]] (three or more) */
export function affineFromPairs(pairs) {
  const ata = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const atu = [0, 0, 0];
  const atv = [0, 0, 0];
  for (const [[x, y], [u, v]] of pairs) {
    const r = [x, y, 1];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) ata[i][j] += r[i] * r[j];
      atu[i] += r[i] * u;
      atv[i] += r[i] * v;
    }
  }
  return [...solve3(ata, atu), ...solve3(ata, atv)];
}

function solve3(m, b) {
  const det = (a) =>
    a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) -
    a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) +
    a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
  const d = det(m);
  return [0, 1, 2].map((k) => det(m.map((row, i) => row.map((v, j) => (j === k ? b[i] : v)))) / d);
}

/** Share of the union covered by both the mapped silhouette and the island */
export function overlap(m, cover, island) {
  const { width, height, mask } = island;
  let inside = 0;
  for (const [x, y] of cover.points) {
    const [u, v] = applyAffine(m, x, y);
    const i = Math.floor(u);
    const j = Math.floor(v);
    if (i >= 0 && j >= 0 && i < width && j < height && mask[j * width + i]) inside++;
  }
  const cell = Math.abs(m[0] * m[4] - m[1] * m[3]) * cover.step * cover.step;
  const islandArea = island.area ?? (island.area = mask.reduce((s, v) => s + v, 0));
  const inter = inside * cell;
  return inter / (cover.points.length * cell + islandArea - inter);
}

function moments(points) {
  let mx = 0,
    my = 0;
  for (const [x, y] of points) ((mx += x), (my += y));
  mx /= points.length;
  my /= points.length;
  let sxx = 0,
    sxy = 0,
    syy = 0;
  for (const [x, y] of points) {
    sxx += (x - mx) ** 2;
    sxy += (x - mx) * (y - my);
    syy += (y - my) ** 2;
  }
  const n = points.length;
  return { mean: [mx, my], cov: [sxx / n, sxy / n, syy / n] };
}

/** Symmetric square root of a 2×2 covariance [xx, xy, yy] and its inverse */
function sqrtCov([a, b, c]) {
  const s = Math.sqrt(a * c - b * b);
  const t = Math.sqrt(a + c + 2 * s);
  const r = [(a + s) / t, b / t, (c + s) / t];
  const det = r[0] * r[2] - r[1] * r[1];
  return { r, inv: [r[2] / det, -r[1] / det, r[0] / det] };
}

/**
 * Affine map fitting the silhouette on the island: moments matched under every
 * rotation (and reflection when `mirror` is undefined), the best start refined
 * by a simplex search on the overlap
 */
export function fitAffine(cover, island, { start, mirror } = {}) {
  let best;
  if (start) best = { m: start, score: overlap(start, cover, island) };
  else {
    const pix = [];
    for (let j = 0; j < island.height; j += 2)
      for (let i = 0; i < island.width; i += 2) if (island.mask[j * island.width + i]) pix.push([i + 0.5, j + 0.5]);
    const ms = moments(pix);
    const mm = moments(cover.points);
    const ls = sqrtCov(ms.cov).r;
    const lm = sqrtCov(mm.cov).inv;
    const mul = (p, q) => [
      p[0] * q[0] + p[1] * q[2],
      p[0] * q[1] + p[1] * q[3],
      p[2] * q[0] + p[3] * q[2],
      p[2] * q[1] + p[3] * q[3],
    ];
    const S = [ls[0], ls[1], ls[1], ls[2]];
    const M = [lm[0], lm[1], lm[1], lm[2]];
    for (const flip of mirror === undefined ? [false, true] : [mirror]) {
      for (let deg = 0; deg < 360; deg += 3) {
        const a = (deg * Math.PI) / 180;
        const R = [Math.cos(a), -Math.sin(a), Math.sin(a), Math.cos(a)];
        const F = flip ? [1, 0, 0, -1] : [1, 0, 0, 1];
        const L = mul(S, mul(R, mul(F, M)));
        const t = [
          ms.mean[0] - L[0] * mm.mean[0] - L[1] * mm.mean[1],
          ms.mean[1] - L[2] * mm.mean[0] - L[3] * mm.mean[1],
        ];
        const m = [L[0], L[1], t[0], L[2], L[3], t[1]];
        const score = overlap(m, cover, island);
        if (!best || score > best.score) best = { m, score };
      }
    }
  }
  const refined = simplex((m) => -overlap(m, cover, island), best.m);
  return { m: refined, score: overlap(refined, cover, island) };
}

/** Nelder–Mead minimisation, steps scaled to each parameter */
function simplex(f, x0, iterations = 1500) {
  const n = x0.length;
  const scale = Math.max(Math.abs(x0[0]), Math.abs(x0[1]), Math.abs(x0[3]), Math.abs(x0[4]));
  const steps = [0.03 * scale, 0.03 * scale, 8, 0.03 * scale, 0.03 * scale, 8];
  let pts = [x0, ...steps.map((s, i) => x0.map((v, j) => (j === i ? v + s : v)))].map((x) => ({ x, f: f(x) }));
  for (let it = 0; it < iterations; it++) {
    pts.sort((a, b) => a.f - b.f);
    const c = new Array(n).fill(0);
    for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) c[j] += pts[k].x[j] / n;
    const worst = pts[n];
    const at = (t) => c.map((v, j) => v + t * (worst.x[j] - v));
    const r = { x: at(-1) };
    r.f = f(r.x);
    if (r.f < pts[0].f) {
      const e = { x: at(-2) };
      e.f = f(e.x);
      pts[n] = e.f < r.f ? e : r;
    } else if (r.f < pts[n - 1].f) pts[n] = r;
    else {
      const k = { x: at(0.5) };
      k.f = f(k.x);
      if (k.f < worst.f) pts[n] = k;
      else
        pts = pts
          .map((p, i) => (i === 0 ? p : { x: p.x.map((v, j) => pts[0].x[j] + 0.5 * (v - pts[0].x[j])) }))
          .map((p) => ({ x: p.x, f: p.f ?? f(p.x) }));
    }
  }
  pts.sort((a, b) => a.f - b.f);
  return pts[0].x;
}
