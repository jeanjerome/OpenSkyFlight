import * as THREE from 'three';
import { Storage3DTexture, StorageTexture } from 'three/webgpu';
import { Fn, If, Return, abs, float, globalId, pow, remap, saturate, smoothstep, textureStore, uvec2, uvec3, vec3, vec4 } from 'three/tsl';
import { perlinFbm, worley } from './tileableNoise.js';
import { CLOUD_CIRRUS_FIBRES, CLOUD_CIRRUS_SIZE, CLOUD_SHAPE_SIZE, CLOUD_DETAIL_SIZE, CLOUD_WEATHER_SIZE } from '../constants/clouds.js';

const WORKGROUP_3D = [4, 4, 4];
const WORKGROUP_2D = [8, 8, 1];

function plane(size, name) {
  const texture = new StorageTexture(size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  texture.generateMipmaps = false;
  texture.name = name;
  return texture;
}

function volume(size, name) {
  const texture = new Storage3DTexture(size, size, size);
  texture.wrapS = texture.wrapT = texture.wrapR = THREE.RepeatWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  texture.generateMipmaps = false;
  texture.name = name;
  return texture;
}

/** 1 − Worley noise for each cell count, weighted */
function worleySum(point, cellCounts, weights) {
  return cellCounts.reduce((sum, cells, i) => sum.add(worley(point, cells).oneMinus().mul(weights[i])), float(0));
}

/**
 * Worley fractal of four octaves (cell counts c, 2c, 4c, 8c) as Hillaire builds
 * it: three overlapping three-octave sums, themselves weighted
 */
function worleyFbm(point, cells) {
  const a = worleySum(point, [cells, cells * 2, cells * 4], [0.625, 0.25, 0.125]);
  const b = worleySum(point, [cells * 2, cells * 4, cells * 8], [0.625, 0.25, 0.125]);
  const c = worleySum(point, [cells * 4, cells * 8], [0.75, 0.25]);
  return a.mul(0.625).add(b.mul(0.25)).add(c.mul(0.125));
}

/**
 * Textures the volumetric clouds are built from, generated once on the GPU by
 * compute shaders (tileable, so that they repeat without seams):
 *
 * - shape (CLOUD_SHAPE_SIZE³): Perlin-Worley noise eroded by a Worley fractal,
 *   the billows of the clouds at the scale of a few kilometres;
 * - detail (CLOUD_DETAIL_SIZE³): Worley fractal, which erodes their edges at the
 *   scale of a hundred metres (wisps at the bottom, cauliflower at the top);
 * - weather (CLOUD_WEATHER_SIZE²): where each layer of clouds forms, before the
 *   coverage setting thresholds it: low cumulus (red), mid-level clouds (green),
 *   high cirrus (blue);
 * - cirrus (CLOUD_CIRRUS_SIZE²): the fibres along which the cirrus form, long
 *   streaks bent by broad swirls (mares' tails).
 *
 * Built after Hillaire's TileableVolumeNoise and takram's three-clouds (MIT).
 * The volumes and the cirrus map only fill their red channel: a single-channel format cannot be
 * written by a compute shader.
 *
 * Needs compute shaders with storage textures: WebGPU backend only.
 */
export default class CloudTextures {
  constructor() {
    this.shape = volume(CLOUD_SHAPE_SIZE, 'cloudShape');
    this.detail = volume(CLOUD_DETAIL_SIZE, 'cloudShapeDetail');

    this.weather = plane(CLOUD_WEATHER_SIZE, 'cloudWeather');
    this.cirrus = plane(CLOUD_CIRRUS_SIZE, 'cloudCirrus');

    this._generated = false;
  }

  _shapeKernel() {
    const size = CLOUD_SHAPE_SIZE;
    return Fn(() => {
      If(globalId.greaterThanEqual(uvec3(size)).any(), () => Return());
      const point = vec3(globalId).add(0.5).div(size).toConst();
      // Perlin noise with Worley billows filling its low values
      const perlin = saturate(perlinFbm(point, [8, 8, 8], 3));
      const billows = worleySum(point, [8, 32, 56], [0.625, 0.25, 0.125]);
      const perlinWorley = remap(perlin, 0, 1, billows, 1);
      const value = remap(perlinWorley, worleyFbm(point, 8).sub(1), 1, 0, 1).clamp(0, 1);
      textureStore(this.shape, globalId, vec4(value, 0, 0, 1));
    })()
      .computeKernel(WORKGROUP_3D)
      .setName('cloudShape');
  }

  _detailKernel() {
    const size = CLOUD_DETAIL_SIZE;
    return Fn(() => {
      If(globalId.greaterThanEqual(uvec3(size)).any(), () => Return());
      const point = vec3(globalId).add(0.5).div(size).toConst();
      textureStore(this.detail, globalId, vec4(worleyFbm(point, 2), 0, 0, 1));
    })()
      .computeKernel(WORKGROUP_3D)
      .setName('cloudShapeDetail');
  }

  _weatherKernel() {
    const size = CLOUD_WEATHER_SIZE;
    // Worley fractal with a gain of 0.95 per octave: patches of clouds
    const patches = (point, cells) =>
      [0, 1, 2, 3].reduce(
        (sum, i) =>
          sum.add(
            worley(point, cells * 2 ** i)
              .oneMinus()
              .mul(0.4 * 0.95 ** i),
          ),
        float(0),
      );
    return Fn(() => {
      If(globalId.xy.greaterThanEqual(uvec2(size)).any(), () => Return());
      const point = vec3(vec3(globalId).xy.add(0.5).div(size), 0).toConst();
      const mid = smoothstep(1, 1.4, patches(point.add(0.5), 8)).toConst();
      const low = saturate(smoothstep(0.8, 1.4, patches(point, 16)).sub(mid));
      const high = smoothstep(-0.5, 0.5, perlinFbm(point, [6, 12, 1], 8));
      textureStore(this.weather, globalId.xy, vec4(low, mid, high, 1));
    })()
      .computeKernel(WORKGROUP_2D)
      .setName('cloudWeather');
  }

  _cirrusKernel() {
    const size = CLOUD_CIRRUS_SIZE;
    const o = CLOUD_CIRRUS_FIBRES;
    // Ridges of Perlin noise stretched along x (the wind): thin streaks,
    // each octave half the weight of the previous one
    const ridges = (point) => {
      let sum = float(0);
      let weight = 1;
      let weightSum = 0;
      for (let i = 0; i < o.octaves; i++) {
        const cells = o.cells * 2 ** i;
        const ridge = pow(saturate(abs(perlinFbm(point, [cells, cells * o.stretch, 1], 1)).oneMinus()), o.sharpness);
        sum = sum.add(ridge.mul(weight));
        weightSum += weight;
        weight *= 0.5;
      }
      return sum.div(weightSum);
    };
    return Fn(() => {
      If(globalId.xy.greaterThanEqual(uvec2(size)).any(), () => Return());
      const point = vec3(vec3(globalId).xy.add(0.5).div(size), 0).toConst();
      // Broad swirls bend the streaks
      const warp = vec3(
        perlinFbm(point, [o.warpCells, o.warpCells, 1], 3),
        perlinFbm(point.add(vec3(0.31, 0.57, 0)), [o.warpCells, o.warpCells, 1], 3),
        0,
      ).mul(o.warp);
      textureStore(this.cirrus, globalId.xy, vec4(saturate(ridges(point.add(warp))), 0, 0, 1));
    })()
      .computeKernel(WORKGROUP_2D)
      .setName('cloudCirrus');
  }

  /**
   * Fill the textures, once
   * @param {THREE.WebGPURenderer} renderer
   */
  generate(renderer) {
    if (this._generated) return;
    this._generated = true;
    const groups = (size, [x, y, z], depth = size) => [
      Math.ceil(size / x),
      Math.ceil(size / y),
      Math.ceil(depth / z),
    ];
    const kernels = [
      [this._shapeKernel(), groups(CLOUD_SHAPE_SIZE, WORKGROUP_3D)],
      [this._detailKernel(), groups(CLOUD_DETAIL_SIZE, WORKGROUP_3D)],
      [this._weatherKernel(), groups(CLOUD_WEATHER_SIZE, WORKGROUP_2D, 1)],
      [this._cirrusKernel(), groups(CLOUD_CIRRUS_SIZE, WORKGROUP_2D, 1)],
    ];
    for (const [kernel, dispatch] of kernels) renderer.compute(kernel, dispatch);
  }

  dispose() {
    this.shape.dispose();
    this.detail.dispose();
    this.weather.dispose();
    this.cirrus.dispose();
  }
}
