// Image input and output for the livery build: DXT1 DDS and PNG decoding, PNG
// encoding, all on plain RGBA byte arrays ({ width, height, data }).
import { Buffer } from 'node:buffer';
import { inflateSync, deflateSync } from 'node:zlib';

export function createImage(width, height) {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

/** First level of a DXT1 (BC1) DDS file */
export function decodeDds(buffer) {
  if (buffer.toString('latin1', 0, 4) !== 'DDS ') throw new Error('not a DDS file');
  const height = buffer.readUInt32LE(12);
  const width = buffer.readUInt32LE(16);
  const fourCC = buffer.toString('latin1', 84, 88);
  if (fourCC !== 'DXT1') throw new Error(`unsupported DDS format ${fourCC}`);
  const image = createImage(width, height);
  const out = image.data;
  const palette = new Uint8Array(16);
  const rgb565 = (c, o) => {
    palette[o] = (((c >> 11) & 31) * 255) / 31;
    palette[o + 1] = (((c >> 5) & 63) * 255) / 63;
    palette[o + 2] = ((c & 31) * 255) / 31;
    palette[o + 3] = 255;
  };
  let p = 128;
  for (let by = 0; by < height; by += 4) {
    for (let bx = 0; bx < width; bx += 4) {
      const c0 = buffer.readUInt16LE(p);
      const c1 = buffer.readUInt16LE(p + 2);
      const bits = buffer.readUInt32LE(p + 4);
      p += 8;
      rgb565(c0, 0);
      rgb565(c1, 4);
      for (let k = 0; k < 3; k++) {
        if (c0 > c1) {
          palette[8 + k] = (2 * palette[k] + palette[4 + k]) / 3;
          palette[12 + k] = (palette[k] + 2 * palette[4 + k]) / 3;
        } else {
          palette[8 + k] = (palette[k] + palette[4 + k]) / 2;
          palette[12 + k] = 0;
        }
      }
      palette[11] = 255;
      palette[15] = c0 > c1 ? 255 : 0;
      for (let i = 0; i < 16; i++) {
        const x = bx + (i & 3);
        const y = by + (i >> 2);
        if (x >= width || y >= height) continue;
        const idx = ((bits >>> (2 * i)) & 3) * 4;
        out.set(palette.subarray(idx, idx + 4), (y * width + x) * 4);
      }
    }
  }
  return image;
}

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(bytes) {
  let c = -1;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, payload) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(payload.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), payload])));
  return Buffer.concat([head, payload, crc]);
}

/** PNG of an image, RGB unless `alpha`, rows filtered with the Paeth predictor */
export function encodePng(image, { alpha = false } = {}) {
  const { width, height, data } = image;
  const channels = alpha ? 4 : 3;
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  const row = new Uint8Array(stride);
  const prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < channels; c++) row[x * channels + c] = data[(y * width + x) * 4 + c];
    }
    const o = y * (stride + 1);
    raw[o] = 4;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? row[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      raw[o + 1 + i] = (row[i] - paeth(a, b, c)) & 0xff;
    }
    prev.set(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = alpha ? 6 : 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** 8-bit non-interlaced PNG (grey, RGB, palette-free RGBA or grey+alpha) */
export function decodePng(buffer) {
  let p = 8;
  let width, height, colorType, bitDepth, interlace;
  const idat = [];
  while (p < buffer.length) {
    const length = buffer.readUInt32BE(p);
    const type = buffer.toString('latin1', p + 4, p + 8);
    const body = buffer.subarray(p + 8, p + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      bitDepth = body[8];
      colorType = body[9];
      interlace = body[12];
    } else if (type === 'IDAT') idat.push(body);
    p += 12 + length;
  }
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (bitDepth !== 8 || !channels || interlace) throw new Error('unsupported PNG layout');
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const rows = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? rows[dst + i - channels] : 0;
      const b = y ? rows[dst - stride + i] : 0;
      const c = y && i >= channels ? rows[dst - stride + i - channels] : 0;
      const pred = [0, a, b, (a + b) >> 1, paeth(a, b, c)][filter];
      rows[dst + i] = (raw[src + i] + pred) & 0xff;
    }
  }
  const image = createImage(width, height);
  for (let i = 0; i < width * height; i++) {
    const s = i * channels;
    const grey = channels < 3;
    image.data[i * 4] = rows[s];
    image.data[i * 4 + 1] = grey ? rows[s] : rows[s + 1];
    image.data[i * 4 + 2] = grey ? rows[s] : rows[s + 2];
    image.data[i * 4 + 3] = channels === 4 ? rows[s + 3] : channels === 2 ? rows[s + 1] : 255;
  }
  return image;
}

/** Bilinear sample with clamped edges, into `out` (RGBA floats 0–255) */
export function sampleBilinear(image, u, v, out) {
  const { width, height, data } = image;
  const x = Math.min(width - 1, Math.max(0, u - 0.5));
  const y = Math.min(height - 1, Math.max(0, v - 0.5));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  for (let c = 0; c < 4; c++) {
    const a = data[(y0 * width + x0) * 4 + c] * (1 - fx) + data[(y0 * width + x1) * 4 + c] * fx;
    const b = data[(y1 * width + x0) * 4 + c] * (1 - fx) + data[(y1 * width + x1) * 4 + c] * fx;
    out[c] = a * (1 - fy) + b * fy;
  }
  return out;
}

/**
 * Fills the pixels flagged in `holes` from their surroundings (push-pull: the
 * valid pixels averaged down a pyramid, then pulled back up into the holes),
 * so that samples taken just outside an island find its paint, not the
 * sheet's background
 */
export function fillHoles(image, holes) {
  const levels = [];
  let w = image.width;
  let h = image.height;
  let color = new Float32Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const weight = holes[i] ? 0 : 1;
    for (let c = 0; c < 3; c++) color[i * 4 + c] = image.data[i * 4 + c] * weight;
    color[i * 4 + 3] = weight;
  }
  levels.push({ w, h, color });
  while (w > 1 && h > 1) {
    const nw = w >> 1;
    const nh = h >> 1;
    const next = new Float32Array(nw * nh * 4);
    for (let y = 0; y < nh; y++)
      for (let x = 0; x < nw; x++)
        for (let c = 0; c < 4; c++) {
          const s = (dx, dy) => color[((2 * y + dy) * w + 2 * x + dx) * 4 + c];
          next[(y * nw + x) * 4 + c] = s(0, 0) + s(1, 0) + s(0, 1) + s(1, 1);
        }
    // Keep sums of colour weighted by coverage, normalised to at most one sample
    for (let i = 0; i < nw * nh; i++) {
      const a = next[i * 4 + 3];
      if (a > 1) for (let c = 0; c < 4; c++) next[i * 4 + c] /= a;
    }
    levels.push({ w: nw, h: nh, color: next });
    w = nw;
    h = nh;
    color = next;
  }
  // Pull: holes take the coarser level, bilinearly interpolated
  for (let l = levels.length - 2; l >= 0; l--) {
    const fine = levels[l];
    const coarse = levels[l + 1];
    const at = (x, y, c) =>
      coarse.color[
        (Math.min(coarse.h - 1, Math.max(0, y)) * coarse.w + Math.min(coarse.w - 1, Math.max(0, x))) * 4 + c
      ];
    for (let y = 0; y < fine.h; y++)
      for (let x = 0; x < fine.w; x++) {
        const i = (y * fine.w + x) * 4;
        const a = fine.color[i + 3];
        if (a >= 1) continue;
        const cx = (x + 0.5) / 2 - 0.5;
        const cy = (y + 0.5) / 2 - 0.5;
        const x0 = Math.floor(cx);
        const y0 = Math.floor(cy);
        const fx = cx - x0;
        const fy = cy - y0;
        const lerp = (c) =>
          (at(x0, y0, c) * (1 - fx) + at(x0 + 1, y0, c) * fx) * (1 - fy) +
          (at(x0, y0 + 1, c) * (1 - fx) + at(x0 + 1, y0 + 1, c) * fx) * fy;
        const ca = lerp(3);
        if (ca <= 0) continue;
        for (let c = 0; c < 3; c++) fine.color[i + c] += (lerp(c) / ca) * (1 - a);
        fine.color[i + 3] = 1;
      }
  }
  const top = levels[0].color;
  for (let i = 0; i < image.width * image.height; i++) {
    if (!holes[i]) continue;
    const a = top[i * 4 + 3] || 1;
    for (let c = 0; c < 3; c++) image.data[i * 4 + c] = top[i * 4 + c] / a;
  }
}

/**
 * The sheet redrawn from what it tells, not copied: plain `paint`, darkened
 * along its panel lines and rivets (its luminance below a blur of `radius` px,
 * past `dead` levels, at most `max`), with its markings kept as they are —
 * coloured pixels (roundels, lights), and with `darkMarkings` also those darker
 * than that share of the paint (lettering), each with `margin` px around.
 * Grime, stains, dents and blotches are left behind.
 */
export function redraw(image, paint, { radius = 3, dead = 3, max = 40, darkMarkings = 0, margin = 4 } = {}) {
  const { width, height, data } = image;
  const n = width * height;
  const lum = (i) => 0.3 * data[i * 4] + 0.59 * data[i * 4 + 1] + 0.11 * data[i * 4 + 2];
  const paintLum = 0.3 * paint[0] + 0.59 * paint[1] + 0.11 * paint[2];
  const l = new Float32Array(n);
  const marking = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    l[i] = lum(i);
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const top = Math.max(r, g, b);
    if ((top > 40 && (top - Math.min(r, g, b)) / top > 0.2) || l[i] < darkMarkings * paintLum) marking[i] = 1;
  }
  const near = boxBlur(marking, width, height, margin);
  const blurred = boxBlur(boxBlur(l, width, height, radius), width, height, radius);
  for (let i = 0; i < n; i++) {
    if (near[i] > 0) continue;
    const line = Math.min(max, Math.max(0, blurred[i] - l[i] - dead));
    const k = 1 - line / paintLum;
    for (let c = 0; c < 3; c++) data[i * 4 + c] = paint[c] * k;
  }
}

/**
 * Island edges faded into plain `paint` over `width` px, and the background
 * set to it: wherever a region of the model stops on an island's edge, the
 * next one starts on the same plain paint, with no seam
 */
export function featherEdges(image, holes, paint, width) {
  const { width: w, height: h, data } = image;
  // Distance (px) from the background, by successive one-pixel growths
  const dist = new Uint8Array(w * h).fill(255);
  let front = [];
  for (let i = 0; i < w * h; i++) if (holes[i]) ((dist[i] = 0), front.push(i));
  for (let d = 1; d <= width && front.length; d++) {
    const next = [];
    for (const i of front) {
      const x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j < 0 || j >= w * h || dist[j] <= d) continue;
        dist[j] = d;
        next.push(j);
      }
    }
    front = next;
  }
  for (let i = 0; i < w * h; i++) {
    if (dist[i] > width) continue;
    const t = dist[i] / width;
    const k = t * t * (3 - 2 * t);
    for (let c = 0; c < 3; c++) data[i * 4 + c] = paint[c] + (data[i * 4 + c] - paint[c]) * k;
  }
}

/**
 * Tangent-space normal map (glTF convention: +X along u, +Y towards the top of
 * the image) from the fine relief of a colour image: its luminance minus a
 * blur of `radius` px, clipped to ±`clip` levels so that markings stay flat
 * paint, the dark panel lines and rivets coming out as grooves and dimples
 */
export function normalsFromDetail(image, { radius = 3, clip = 14, dead = 0, strength = 0.06 } = {}) {
  const { width, height, data } = image;
  const lum = new Float32Array(width * height);
  for (let i = 0; i < lum.length; i++) lum[i] = 0.3 * data[i * 4] + 0.59 * data[i * 4 + 1] + 0.11 * data[i * 4 + 2];
  const blurred = boxBlur(boxBlur(lum, width, height, radius), width, height, radius);
  const h = new Float32Array(lum.length);
  // Below `dead` levels the paint's grain and blotches stay flat; only lines and rivets stand out
  for (let i = 0; i < h.length; i++) {
    const d = lum[i] - blurred[i];
    h[i] = Math.sign(d) * Math.min(clip, Math.max(0, Math.abs(d) - dead));
  }
  const out = createImage(width, height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const at = (dx, dy) =>
        h[Math.min(height - 1, Math.max(0, y + dy)) * width + Math.min(width - 1, Math.max(0, x + dx))];
      const du = (at(1, 0) - at(-1, 0)) * 0.5 * strength;
      const dv = (at(0, 1) - at(0, -1)) * 0.5 * strength;
      const len = Math.hypot(du, dv, 1);
      const i = (y * width + x) * 4;
      out.data[i] = (0.5 - du / len / 2) * 255;
      out.data[i + 1] = (0.5 + dv / len / 2) * 255;
      out.data[i + 2] = (0.5 + 0.5 / len) * 255;
      out.data[i + 3] = 255;
    }
  return out;
}

function boxBlur(src, width, height, r) {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < height; y++) {
    let sum = 0;
    for (let x = -r; x <= r; x++) sum += src[y * width + Math.min(width - 1, Math.max(0, x))];
    for (let x = 0; x < width; x++) {
      tmp[y * width + x] = sum / (2 * r + 1);
      sum += src[y * width + Math.min(width - 1, x + r + 1)] - src[y * width + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += tmp[Math.min(height - 1, Math.max(0, y)) * width + x];
    for (let y = 0; y < height; y++) {
      out[y * width + x] = sum / (2 * r + 1);
      sum += tmp[Math.min(height - 1, y + r + 1) * width + x] - tmp[Math.max(0, y - r) * width + x];
    }
  }
  return out;
}
