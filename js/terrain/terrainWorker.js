// Web Worker — generates chunk vertex buffers off-thread
// Simplex noise inlined (no imports in workers without module support)

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const grad3 = [
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function buildPermTable(seed) {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
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
  const x0 = x - (i - t);
  const y0 = y - (j - t);
  const i1 = x0 > y0 ? 1 : 0;
  const j1 = x0 > y0 ? 0 : 1;
  const x1 = x0 - i1 + G2;
  const y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2;
  const y2 = y0 - 1 + 2 * G2;
  const ii = i & 255;
  const jj = j & 255;
  let n0 = 0,
    n1 = 0,
    n2 = 0;
  let t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 > 0) {
    t0 *= t0;
    const gi = permMod8[ii + perm[jj]];
    n0 = t0 * t0 * (grad3[gi][0] * x0 + grad3[gi][1] * y0);
  }
  let t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 > 0) {
    t1 *= t1;
    const gi = permMod8[ii + i1 + perm[jj + j1]];
    n1 = t1 * t1 * (grad3[gi][0] * x1 + grad3[gi][1] * y1);
  }
  let t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 > 0) {
    t2 *= t2;
    const gi = permMod8[ii + 1 + perm[jj + 1]];
    n2 = t2 * t2 * (grad3[gi][0] * x2 + grad3[gi][1] * y2);
  }
  return 70 * (n0 + n1 + n2);
}

function fbm(x, y, perm, permMod8, octaves, lacunarity, persistence) {
  let value = 0,
    amplitude = 1,
    frequency = 1,
    max = 0;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * simplex2D(x * frequency, y * frequency, perm, permMod8);
    max += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }
  return (value / max + 1) * 0.5;
}

const COLOR_STOPS = [
  { t: 0.0, r: 0.1, g: 0.15, b: 0.5 },
  { t: 0.15, r: 0.15, g: 0.3, b: 0.6 },
  { t: 0.2, r: 0.76, g: 0.7, b: 0.5 },
  { t: 0.3, r: 0.3, g: 0.6, b: 0.2 },
  { t: 0.5, r: 0.2, g: 0.45, b: 0.15 },
  { t: 0.65, r: 0.45, g: 0.35, b: 0.2 },
  { t: 0.8, r: 0.55, g: 0.45, b: 0.35 },
  { t: 0.9, r: 0.7, g: 0.65, b: 0.6 },
  { t: 1.0, r: 0.95, g: 0.95, b: 0.97 },
];

function getColor(h) {
  for (let i = 1; i < COLOR_STOPS.length; i++) {
    if (h <= COLOR_STOPS[i].t) {
      const a = COLOR_STOPS[i - 1],
        b = COLOR_STOPS[i];
      const t = (h - a.t) / (b.t - a.t);
      return [a.r + t * (b.r - a.r), a.g + t * (b.g - a.g), a.b + t * (b.b - a.b)];
    }
  }
  const l = COLOR_STOPS[COLOR_STOPS.length - 1];
  return [l.r, l.g, l.b];
}

let tables = null;

self.onmessage = function (e) {
  const { type } = e.data;

  if (type === 'init') {
    tables = buildPermTable(e.data.seed);
    self.postMessage({ type: 'ready' });
    return;
  }

  if (type === 'generate-real') {
    const { cx, cz, heightmap, chunkSize, elevationScale, res, zoom } = e.data;
    const count = res * res;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const uvs = new Float32Array(count * 2);

    // Max real-world elevation for color palette normalization (meters)
    const COLOR_MAX_ELEV = 4500;

    // heightmap is 256×256, sample it at the requested resolution
    const hmSize = 256;

    for (let z = 0; z < res; z++) {
      for (let x = 0; x < res; x++) {
        // Map grid vertex to heightmap pixel
        const hmX = Math.min(Math.floor((x / (res - 1)) * (hmSize - 1)), hmSize - 1);
        const hmZ = Math.min(Math.floor((z / (res - 1)) * (hmSize - 1)), hmSize - 1);
        const elevation = heightmap[hmZ * hmSize + hmX];

        // Normalize elevation for color mapping against real-world max
        const h = Math.max(0, Math.min(1, elevation / COLOR_MAX_ELEV));

        const idx = z * res + x;
        const i3 = idx * 3;
        positions[i3] = (x / (res - 1)) * chunkSize;
        positions[i3 + 1] = Math.max(0, elevation) * elevationScale;
        positions[i3 + 2] = (z / (res - 1)) * chunkSize;

        const [r, g, b] = getColor(h);
        colors[i3] = r;
        colors[i3 + 1] = g;
        colors[i3 + 2] = b;

        const i2 = idx * 2;
        uvs[i2] = x / (res - 1);
        uvs[i2 + 1] = z / (res - 1);
      }
    }

    const idxArr = [];
    for (let z = 0; z < res - 1; z++) {
      for (let x = 0; x < res - 1; x++) {
        const a = z * res + x;
        const b = a + 1;
        const c = a + res;
        const d = c + 1;
        idxArr.push(a, b, c, b, d, c);
      }
    }
    const indices = count <= 65536 ? new Uint16Array(idxArr) : new Uint32Array(idxArr);

    self.postMessage({ type: 'chunk', cx, cz, positions, colors, indices, uvs, res, zoom }, [
      positions.buffer,
      colors.buffer,
      indices.buffer,
      uvs.buffer,
    ]);
    return;
  }

  if (type === 'generate') {
    const { cx, cz, res, chunkSize, maxHeight, octaves, lacunarity, persistence, redistribution } = e.data;
    const count = res * res;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    const scale = 0.002; // world-space noise frequency

    for (let z = 0; z < res; z++) {
      for (let x = 0; x < res; x++) {
        const wx = cx * chunkSize + (x / (res - 1)) * chunkSize;
        const wz = cz * chunkSize + (z / (res - 1)) * chunkSize;

        let h = fbm(wx * scale, wz * scale, tables.perm, tables.permMod8, octaves, lacunarity, persistence);
        h = Math.pow(h, redistribution);

        const idx = z * res + x;
        const i3 = idx * 3;
        positions[i3] = (x / (res - 1)) * chunkSize;
        positions[i3 + 1] = h * maxHeight;
        positions[i3 + 2] = (z / (res - 1)) * chunkSize;

        const [r, g, b] = getColor(h);
        colors[i3] = r;
        colors[i3 + 1] = g;
        colors[i3 + 2] = b;
      }
    }

    // Build indices
    const idxArr = [];
    for (let z = 0; z < res - 1; z++) {
      for (let x = 0; x < res - 1; x++) {
        const a = z * res + x;
        const b = a + 1;
        const c = a + res;
        const d = c + 1;
        idxArr.push(a, b, c, b, d, c);
      }
    }
    const indices = count <= 65536 ? new Uint16Array(idxArr) : new Uint32Array(idxArr);

    self.postMessage({ type: 'chunk', cx, cz, positions, colors, indices, res }, [
      positions.buffer,
      colors.buffer,
      indices.buffer,
    ]);
  }
};
