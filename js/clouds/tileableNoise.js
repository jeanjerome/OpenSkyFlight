import { Fn, Loop, dot, float, floor, fract, min, mix, normalize, uvec3, vec3 } from 'three/tsl';

/*
 * Tileable noise functions for the cloud volumes, in TSL: every function takes
 * a point of the unit cube and a whole number of cells (or a whole frequency)
 * across it, and wraps around the cube, so that the textures it fills repeat
 * without seams.
 *
 * The Perlin-Worley construction follows Sébastien Hillaire's
 * TileableVolumeNoise (MIT) and its use in takram's three-clouds (MIT): the
 * feature points and gradients come here from an integer hash (PCG3D) instead
 * of a sine hash, which put every feature point on the diagonal of its cell.
 */

/**
 * PCG3D hash (Jarzynski and Olano, 2020): three uniform values in [0, 1)
 * from three whole numbers
 */
const hash3 = /* @__PURE__ */ Fn(([cell]) => {
  const v = uvec3(cell).mul(1664525).add(1013904223).toVar();
  v.x.addAssign(v.y.mul(v.z));
  v.y.addAssign(v.z.mul(v.x));
  v.z.addAssign(v.x.mul(v.y));
  v.bitXorAssign(v.shiftRight(uvec3(16)));
  v.x.addAssign(v.y.mul(v.z));
  v.y.addAssign(v.z.mul(v.x));
  v.z.addAssign(v.x.mul(v.y));
  return vec3(v.shiftRight(uvec3(8))).mul(1 / 16777216);
}).setLayout({ name: 'cloudHash3', type: 'vec3', inputs: [{ name: 'cell', type: 'vec3' }] });

/** Cell coordinates wrapped into [0, period) */
function wrap(cell, period) {
  return cell.sub(period.mul(floor(cell.div(period))));
}

/**
 * Worley noise: squared distance to the nearest feature point, one random
 * point per cell, clamped to [0, 1] (in cell units)
 * @param {Node} point - vec3 in the unit cube
 * @param {Node|number} cellCount - cells across the cube
 */
export const worley = /* @__PURE__ */ Fn(([point, cellCount]) => {
  const cell = point.mul(cellCount).toConst();
  const base = floor(cell).toConst();
  const nearest = float(1e10).toVar();
  Loop(3, 3, 3, ({ i, j, k }) => {
    const neighbour = base.add(vec3(float(i), float(j), float(k)).sub(1));
    const feature = neighbour.add(hash3(wrap(neighbour, vec3(cellCount))));
    const offset = cell.sub(feature);
    nearest.assign(min(nearest, dot(offset, offset)));
  });
  return nearest.clamp(0, 1);
}).setLayout({
  name: 'cloudWorley',
  type: 'float',
  inputs: [
    { name: 'point', type: 'vec3' },
    { name: 'cellCount', type: 'float' },
  ],
});

/** Gradient of a lattice point: a random unit vector */
function gradient(cell, period) {
  return normalize(hash3(wrap(cell, period)).mul(2).sub(1).add(1e-4));
}

/**
 * Perlin (gradient) noise, about [-1, 1]
 * @param {Node} point - vec3, in lattice units
 * @param {Node} period - vec3, lattice cells after which the noise repeats
 */
const perlin = /* @__PURE__ */ Fn(([point, period]) => {
  const cell = floor(point).toConst();
  const f = fract(point).toConst();
  const corner = (x, y, z) => {
    const c = vec3(x, y, z);
    return dot(gradient(cell.add(c), period), f.sub(c));
  };
  // Quintic fade (improved Perlin noise)
  const u = f
    .mul(f)
    .mul(f)
    .mul(f.mul(f.mul(6).sub(15)).add(10))
    .toConst();
  const x00 = mix(corner(0, 0, 0), corner(1, 0, 0), u.x);
  const x10 = mix(corner(0, 1, 0), corner(1, 1, 0), u.x);
  const x01 = mix(corner(0, 0, 1), corner(1, 0, 1), u.x);
  const x11 = mix(corner(0, 1, 1), corner(1, 1, 1), u.x);
  const value = mix(mix(x00, x10, u.y), mix(x01, x11, u.y), u.z);
  // Scaled as Gustavson's periodic noise, which takram's parameters assume
  return value.mul(2.2);
}).setLayout({
  name: 'cloudPerlin',
  type: 'float',
  inputs: [
    { name: 'point', type: 'vec3' },
    { name: 'period', type: 'vec3' },
  ],
});

/**
 * Fractal sum of Perlin noise, each octave twice the frequency of the previous
 * one and half its weight, normalised by the sum of the weights (not clamped)
 * @param {Node} point - vec3 in the unit cube
 * @param {number[]} frequency - whole frequencies of the first octave along x, y, z
 * @param {number} octaveCount
 */
export function perlinFbm(point, frequency, octaveCount) {
  let sum = float(0);
  let weight = 1;
  let weightSum = 0;
  for (let i = 0; i < octaveCount; i++) {
    const f = vec3(...frequency.map((value) => value * 2 ** i));
    sum = sum.add(perlin(point.mul(f), f).mul(weight));
    weightSum += weight;
    weight *= 0.5;
  }
  return sum.div(weightSum);
}
