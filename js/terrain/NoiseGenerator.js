// Simplex 2D noise — adapted from Stefan Gustavson's implementation
// Self-contained, no external dependencies

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

const grad3 = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1],
];

function buildPermTable(seed) {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  // Seed-based shuffle (simple hash)
  let s = 0;
  for (let i = 0; i < seed.length; i++) {
    s = ((s << 5) - s + seed.charCodeAt(i)) | 0;
  }
  for (let i = 255; i > 0; i--) {
    s = (s * 16807 + 0) & 0x7fffffff;
    const j = s % (i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }
  const perm = new Uint8Array(512);
  const permMod8 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) {
    perm[i] = p[i & 255];
    permMod8[i] = perm[i] % 8;
  }
  return { perm, permMod8 };
}

function simplex2D(x, y, perm, permMod8) {
  const s = (x + y) * F2;
  const i = Math.floor(x + s);
  const j = Math.floor(y + s);
  const t = (i + j) * G2;
  const X0 = i - t;
  const Y0 = j - t;
  const x0 = x - X0;
  const y0 = y - Y0;

  const i1 = x0 > y0 ? 1 : 0;
  const j1 = x0 > y0 ? 0 : 1;

  const x1 = x0 - i1 + G2;
  const y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2;
  const y2 = y0 - 1 + 2 * G2;

  const ii = i & 255;
  const jj = j & 255;

  let n0 = 0, n1 = 0, n2 = 0;

  let t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 > 0) {
    t0 *= t0;
    const gi0 = permMod8[ii + perm[jj]];
    n0 = t0 * t0 * (grad3[gi0][0] * x0 + grad3[gi0][1] * y0);
  }

  let t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 > 0) {
    t1 *= t1;
    const gi1 = permMod8[ii + i1 + perm[jj + j1]];
    n1 = t1 * t1 * (grad3[gi1][0] * x1 + grad3[gi1][1] * y1);
  }

  let t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 > 0) {
    t2 *= t2;
    const gi2 = permMod8[ii + 1 + perm[jj + 1]];
    n2 = t2 * t2 * (grad3[gi2][0] * x2 + grad3[gi2][1] * y2);
  }

  return 70 * (n0 + n1 + n2);
}

// fBm multi-octave noise, returns [0, 1]
function fbm(x, y, perm, permMod8, octaves, lacunarity, persistence) {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let max = 0;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * simplex2D(x * frequency, y * frequency, perm, permMod8);
    max += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }
  return (value / max + 1) * 0.5; // normalize to [0, 1]
}

// Altitude-based color palette
const COLOR_STOPS = [
  { t: 0.00, r: 0.10, g: 0.15, b: 0.50 }, // deep water
  { t: 0.15, r: 0.15, g: 0.30, b: 0.60 }, // shallow water
  { t: 0.20, r: 0.76, g: 0.70, b: 0.50 }, // beach
  { t: 0.30, r: 0.30, g: 0.60, b: 0.20 }, // plains
  { t: 0.50, r: 0.20, g: 0.45, b: 0.15 }, // grass
  { t: 0.65, r: 0.45, g: 0.35, b: 0.20 }, // hills
  { t: 0.80, r: 0.55, g: 0.45, b: 0.35 }, // mountains
  { t: 0.90, r: 0.70, g: 0.65, b: 0.60 }, // high mountains
  { t: 1.00, r: 0.95, g: 0.95, b: 0.97 }, // snow
];

function getColor(h) {
  for (let i = 1; i < COLOR_STOPS.length; i++) {
    if (h <= COLOR_STOPS[i].t) {
      const a = COLOR_STOPS[i - 1];
      const b = COLOR_STOPS[i];
      const t = (h - a.t) / (b.t - a.t);
      return {
        r: a.r + t * (b.r - a.r),
        g: a.g + t * (b.g - a.g),
        b: a.b + t * (b.b - a.b),
      };
    }
  }
  const last = COLOR_STOPS[COLOR_STOPS.length - 1];
  return { r: last.r, g: last.g, b: last.b };
}

export { buildPermTable, fbm, getColor, simplex2D };
