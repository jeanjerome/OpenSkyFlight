import * as THREE from 'three';
import { sample } from './keyframes.js';

/** Spacing of the samples along the path (m) */
const STEP = 2;

/** Time step of the integration of the speed along the path (s) */
const TIME_STEP = 1 / 240;

/**
 * A smooth path through control points, flown at a speed that may change
 * over time. The horizontal track is a centripetal Catmull-Rom spline through
 * the points. Each point sets the altitude there, above sea level (`msl`) or
 * above the ground (`agl`); between two points it eases from one to the
 * other. Above the ground the altitude follows the relief as a pilot would:
 * it climbs and descends no steeper than `maxGradient`, starting early enough
 * to clear what lies ahead, smoothed over `smoothing` metres, and never
 * passes lower than `minClearance` above the ground.
 */
export default class FlightPath {
  /**
   * @param {{x: number, z: number, agl?: number, msl?: number}[]} points - world positions (m)
   * @param {(x: number, z: number) => number} ground - ground elevation at a world position (m)
   * @param {{speed?: number|Array, maxGradient?: number, smoothing?: number, minClearance?: number}} [options]
   */
  constructor(points, ground, { speed = 230, maxGradient = 0.35, smoothing = 250, minClearance = 25 } = {}) {
    if (points.length < 2) throw new Error('A path needs at least two points');
    this.speed = speed;
    const { xs, zs, knots } = track(points);
    const n = xs.length;
    this.xs = xs;
    this.zs = zs;
    this.length = (n - 1) * STEP;

    // Ground below the track, and the altitude each point asks for
    const groundAt = new Float64Array(n);
    for (let k = 0; k < n; k++) groundAt[k] = ground(xs[k], zs[k]);
    const target = new Float64Array(n);
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      for (let k = knots[i]; k <= knots[i + 1]; k++) {
        const w = knots[i + 1] > knots[i] ? (k - knots[i]) / (knots[i + 1] - knots[i]) : 0;
        const e = w * w * (3 - 2 * w);
        const va = a.msl ?? groundAt[k] + (a.agl ?? 100);
        const vb = b.msl ?? groundAt[k] + (b.agl ?? 100);
        target[k] = va + (vb - va) * e;
      }
    }

    // Climbs and descents no steeper than the gradient: the highest cone over the targets
    const slope = maxGradient * STEP;
    const ys = Float64Array.from(target);
    for (let k = 1; k < n; k++) ys[k] = Math.max(ys[k], ys[k - 1] - slope);
    for (let k = n - 2; k >= 0; k--) ys[k] = Math.max(ys[k], ys[k + 1] - slope);
    let smoothed = gaussian(ys, smoothing / STEP);
    for (let k = 0; k < n; k++) smoothed[k] = Math.max(smoothed[k], groundAt[k] + minClearance);
    smoothed = gaussian(smoothed, smoothing / STEP / 3);
    for (let k = 0; k < n; k++) smoothed[k] = Math.max(smoothed[k], groundAt[k] + minClearance * 0.8);
    this.ys = smoothed;
    this.ground = groundAt;

    // Distance flown against time
    const distances = [0];
    let s = 0;
    let t = 0;
    while (s < this.length) {
      s += sample(speed, t + TIME_STEP / 2, 'smooth') * TIME_STEP;
      t += TIME_STEP;
      distances.push(s);
    }
    this._distances = Float64Array.from(distances);
    /** Time to fly the whole path (s) */
    this.duration = t;
  }

  /** Distance flown at time t (m); past either end, at the speed there */
  distanceAt(t) {
    const d = this._distances;
    if (t <= 0) return t * sample(this.speed, 0);
    const f = t / TIME_STEP;
    const i = Math.floor(f);
    if (i >= d.length - 1) return d[d.length - 1] + (t - (d.length - 1) * TIME_STEP) * sample(this.speed, t);
    return d[i] + (d[i + 1] - d[i]) * (f - i);
  }

  /** Speed at time t (m/s) */
  speedAt(t) {
    return sample(this.speed, Math.max(0, t));
  }

  /** World position at a distance along the path; past either end, straight on */
  positionAtDistance(s, target = new THREE.Vector3()) {
    const n = this.xs.length;
    const f = s / STEP;
    let i = Math.floor(f);
    let w = f - i;
    if (i < 0) {
      i = 0;
      w = f;
    } else if (i >= n - 1) {
      i = n - 2;
      w = f - i;
    }
    const at = (a) => a[i] + (a[i + 1] - a[i]) * w;
    return target.set(at(this.xs), at(this.ys), at(this.zs));
  }

  /** World position at time t */
  positionAt(t, target = new THREE.Vector3()) {
    return this.positionAtDistance(this.distanceAt(t), target);
  }

  /** Ground elevation below a distance along the path (m) */
  groundAtDistance(s) {
    const k = Math.max(0, Math.min(this.ground.length - 1, Math.round(s / STEP)));
    return this.ground[k];
  }

  /** Time at which the path passes closest to a world position (s) */
  closestTime(point) {
    let best = Infinity;
    let bestK = 0;
    for (let k = 0; k < this.xs.length; k++) {
      const d = (this.xs[k] - point.x) ** 2 + (this.ys[k] - point.y) ** 2 + (this.zs[k] - point.z) ** 2;
      if (d < best) {
        best = d;
        bestK = k;
      }
    }
    return this.timeAtDistance(bestK * STEP);
  }

  /** Time at which a distance along the path is reached (s) */
  timeAtDistance(s) {
    const d = this._distances;
    let lo = 0;
    let hi = d.length - 1;
    if (s >= d[hi]) return hi * TIME_STEP;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (d[mid] < s) lo = mid;
      else hi = mid;
    }
    return (lo + (s - d[lo]) / Math.max(1e-9, d[hi] - d[lo])) * TIME_STEP;
  }
}

/**
 * Horizontal track through the points, resampled every STEP metres
 * @returns {{xs: Float64Array, zs: Float64Array, knots: number[]}} - knots: sample index of each point
 */
function track(points) {
  const p = points.map(({ x, z }) => new THREE.Vector2(x, z));
  const first = p[0].clone().multiplyScalar(2).sub(p[1]);
  const last = p[p.length - 1]
    .clone()
    .multiplyScalar(2)
    .sub(p[p.length - 2]);
  const ctrl = [first, ...p, last];
  // Dense polyline with its cumulative length
  const dense = [];
  const denseLength = [0];
  const knotLength = [0];
  const SUB = 400;
  for (let i = 1; i < ctrl.length - 2; i++) {
    for (let j = i === 1 ? 0 : 1; j <= SUB; j++) {
      const q = catmullRom(ctrl[i - 1], ctrl[i], ctrl[i + 1], ctrl[i + 2], j / SUB);
      if (dense.length) denseLength.push(denseLength[denseLength.length - 1] + q.distanceTo(dense[dense.length - 1]));
      dense.push(q);
    }
    knotLength.push(denseLength[denseLength.length - 1]);
  }
  const total = denseLength[denseLength.length - 1];
  const n = Math.max(2, Math.floor(total / STEP) + 1);
  const xs = new Float64Array(n);
  const zs = new Float64Array(n);
  let j = 0;
  for (let k = 0; k < n; k++) {
    const s = k * STEP;
    while (j < dense.length - 2 && denseLength[j + 1] < s) j++;
    const w = Math.min(1, (s - denseLength[j]) / Math.max(1e-9, denseLength[j + 1] - denseLength[j]));
    xs[k] = dense[j].x + (dense[j + 1].x - dense[j].x) * w;
    zs[k] = dense[j].y + (dense[j + 1].y - dense[j].y) * w;
  }
  const knots = knotLength.map((s) => Math.min(n - 1, Math.round(s / STEP)));
  return { xs, zs, knots };
}

/** Centripetal Catmull-Rom point between p1 and p2 */
function catmullRom(p0, p1, p2, p3, u) {
  const alpha = 0.5;
  const t0 = 0;
  const t1 = t0 + Math.max(1e-6, p0.distanceTo(p1) ** alpha);
  const t2 = t1 + Math.max(1e-6, p1.distanceTo(p2) ** alpha);
  const t3 = t2 + Math.max(1e-6, p2.distanceTo(p3) ** alpha);
  const t = t1 + (t2 - t1) * u;
  const lerp = (a, b, ta, tb) =>
    a
      .clone()
      .multiplyScalar((tb - t) / (tb - ta))
      .add(b.clone().multiplyScalar((t - ta) / (tb - ta)));
  const a1 = lerp(p0, p1, t0, t1);
  const a2 = lerp(p1, p2, t1, t2);
  const a3 = lerp(p2, p3, t2, t3);
  const b1 = lerp(a1, a2, t0, t2);
  const b2 = lerp(a2, a3, t1, t3);
  return lerp(b1, b2, t1, t2);
}

/** Gaussian blur of a series, sigma in samples; the ends are held */
function gaussian(values, sigma) {
  if (sigma < 0.5) return Float64Array.from(values);
  const radius = Math.ceil(sigma * 3);
  const kernel = new Float64Array(2 * radius + 1);
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    kernel[i + radius] = Math.exp(-(i * i) / (2 * sigma * sigma));
    sum += kernel[i + radius];
  }
  const n = values.length;
  const out = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    let acc = 0;
    for (let i = -radius; i <= radius; i++) {
      const j = Math.max(0, Math.min(n - 1, k + i));
      acc += values[j] * kernel[i + radius];
    }
    out[k] = acc / sum;
  }
  return out;
}
