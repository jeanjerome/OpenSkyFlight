import * as THREE from 'three';
import { HalfFloatType, NodeMaterial, QuadMesh, RenderTarget, RendererUtils } from 'three/webgpu';
import {
  Fn,
  If,
  abs,
  cos,
  float,
  fract,
  ivec2,
  mix,
  normalize,
  positionWorld,
  renderGroup,
  screenCoordinate,
  select,
  sin,
  smoothstep,
  sqrt,
  texture,
  uniform,
  vec3,
  vec4,
} from 'three/tsl';
import {
  CLOUD_AMBIENT_BLEND,
  CLOUD_AMBIENT_RADIUS,
  CLOUD_AMBIENT_RAYS,
  CLOUD_SKY_DISTANCE,
} from '../constants/clouds.js';

const frameUniform = (value) => uniform(value).setGroup(renderGroup);

/** Axes of the six faces of the ambient cube: +x, −x, +y, −y, +z, −z */
const AXES = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/** Additive recurrence of the plastic number (R2 sequence): well spread pairs of random numbers */
const R2 = [0.7548776662466927, 0.5698402909980532];

/** Distance the aircraft moves between two renders beyond which the cube starts again (m) */
const MAX_MOVE = 200;

const _quad = /* @__PURE__ */ new QuadMesh();
let _rendererState;

/**
 * The light of the clouds around the aircraft, for the surfaces near it: in a
 * cloud, or above or below one, the clear sky the atmosphere lights them with
 * is partly hidden, and the clouds send their own, whiter light instead.
 *
 * Each render marches the clouds along a few view rays from the aircraft, in
 * random directions over each of the six faces of a cube (cosine weighted
 * around its axis), with the same march as the view rays of the camera. The
 * mean light of the rays of a face is the irradiance the clouds send onto a
 * surface facing that way, and their mean transmittance the share of the sky
 * that still lights it. Both are blended with the previous renders, smoothing
 * out the randomness of the rays, into an ambient cube (Valve, 2006) that the
 * surfaces read with their normal.
 */
export default class CloudAmbient {
  /** @param {import('./VolumetricClouds.js').default} clouds */
  constructor(clouds) {
    this.clouds = clouds;
    this._rays = new RenderTarget(CLOUD_AMBIENT_RAYS, AXES.length, { depthBuffer: false, type: HalfFloatType });
    this._rays.texture.name = 'clouds.ambientRays';
    this._cubes = [0, 1].map((i) => {
      const target = new RenderTarget(AXES.length, 1, { depthBuffer: false, type: HalfFloatType });
      target.texture.name = `clouds.ambient${'AB'[i]}`;
      return target;
    });
    this._write = 0;

    /** Position of the aircraft relative to the camera (world, m) */
    this._offset = frameUniform(new THREE.Vector3());
    /** Position of the aircraft (world, m) */
    this._position = frameUniform(new THREE.Vector3());
    /** Random offset of this render's directions */
    this._seed = frameUniform(new THREE.Vector2());
    /** Share of this render in the cube, 1 to start it again */
    this._blend = frameUniform(1);
    /** 1 while the clouds light the surfaces around the aircraft, 0 for none */
    this.enabled = frameUniform(0);
    /** Where the rays start: the aircraft (world, m; see VolumetricClouds.update) */
    this.position = new THREE.Vector3();
    this._renders = 0;

    this._raysTexture = texture(this._rays.texture);
    this._historyTexture = texture(this._cubes[1].texture);
    /** The ambient cube the surfaces read (the target written last) */
    this._cubeTexture = texture(this._cubes[0].texture);

    this._raysMaterial = new NodeMaterial();
    this._raysMaterial.name = 'clouds.ambientRays';
    // Outputs, not colors: an opaque material's alpha would be forced to 1
    this._raysMaterial.outputNode = this._raysNode();
    this._cubeMaterial = new NodeMaterial();
    this._cubeMaterial.name = 'clouds.ambientCube';
    this._cubeMaterial.outputNode = this._cubeNode();
    for (const material of [this._raysMaterial, this._cubeMaterial]) material.depthTest = material.depthWrite = false;
  }

  /** One ray per pixel: row = face of the cube, column = ray */
  _raysNode() {
    return Fn(() => {
      const pixel = screenCoordinate.xy.floor().toConst();
      const index = pixel.x.add(pixel.y.mul(CLOUD_AMBIENT_RAYS));
      const u = fract(this._seed.add(index.mul(R2[0]), index.mul(R2[1]))).toConst();
      // Cosine-weighted direction around the face's axis
      const radius = sqrt(u.x);
      const angle = u.y.mul(2 * Math.PI);
      const local = vec3(radius.mul(cos(angle)), radius.mul(sin(angle)), sqrt(u.x.oneMinus())).toConst();
      const face = pixel.y.toInt();
      const axis = vec3(0).toVar();
      AXES.forEach((a, i) => If(face.equal(i), () => axis.assign(vec3(...a))));
      const helper = select(abs(axis.y).greaterThan(0.5), vec3(1, 0, 0), vec3(0, 1, 0));
      const tangent = normalize(helper.cross(axis)).toConst();
      const bitangent = axis.cross(tangent);
      const direction = tangent.mul(local.x).add(bitangent.mul(local.y)).add(axis.mul(local.z)).normalize();
      const { color } = this.clouds.march(direction, float(CLOUD_SKY_DISTANCE), this._offset);
      return vec4(color.rgb, color.a.oneMinus());
    })();
  }

  /** Mean of each face's rays, blended with the previous renders */
  _cubeNode() {
    return Fn(() => {
      const face = screenCoordinate.x.floor().toInt().toConst();
      const sum = vec4(0).toVar();
      for (let i = 0; i < CLOUD_AMBIENT_RAYS; i++) sum.addAssign(this._raysTexture.load(ivec2(i, face)));
      // Radiance averaged with cosine-weighted rays: irradiance = π × mean
      const mean = sum.div(CLOUD_AMBIENT_RAYS).mul(vec4(Math.PI, Math.PI, Math.PI, 1));
      const history = this._historyTexture.load(ivec2(face, 0));
      return mix(history, mean, this._blend);
    })();
  }

  /**
   * Ambient cube read with a direction: light of the clouds (rgb, irradiance)
   * and share of the sky left (a)
   */
  _cube(direction) {
    const weights = direction.mul(direction).toConst();
    const sample = (i) => this._cubeTexture.load(ivec2(i, 0));
    const x = select(direction.x.greaterThanEqual(0), sample(0), sample(1));
    const y = select(direction.y.greaterThanEqual(0), sample(2), sample(3));
    const z = select(direction.z.greaterThanEqual(0), sample(4), sample(5));
    return x.mul(weights.x).add(y.mul(weights.y)).add(z.mul(weights.z));
  }

  /** How much a surface point is lit by the cube: near the aircraft only */
  _weight() {
    const distance = positionWorld.sub(this._position).length();
    return smoothstep(CLOUD_AMBIENT_RADIUS, CLOUD_AMBIENT_RADIUS * 0.5, distance).mul(this.enabled);
  }

  /**
   * Diffuse light of a surface: the clear sky's, from the atmosphere, partly
   * hidden by the clouds, and the clouds' own
   * @param {Node} irradiance - vec3, of the clear sky
   * @param {Node} normal - vec3, of the surface (world)
   */
  irradiance(irradiance, normal) {
    return Fn(() => {
      const result = vec3(irradiance).toVar();
      const weight = this._weight().toConst();
      If(weight.greaterThan(0), () => {
        const cube = this._cube(normal).toConst();
        result.assign(mix(irradiance, irradiance.mul(cube.a).add(cube.rgb), weight));
      });
      return result;
    })();
  }

  /**
   * Reflected light of a surface: the environment map of the clear sky,
   * partly hidden by the clouds, and their light, taken as even over each face
   * @param {Node} radiance - vec3, of the environment
   * @param {Node} direction - vec3, of the reflection (world)
   */
  radiance(radiance, direction) {
    return Fn(() => {
      const result = vec3(radiance).toVar();
      const weight = this._weight().toConst();
      If(weight.greaterThan(0), () => {
        const cube = this._cube(direction).toConst();
        result.assign(mix(radiance, radiance.mul(cube.a).add(cube.rgb.div(Math.PI)), weight));
      });
      return result;
    })();
  }

  /**
   * Before each render: march the rays from the aircraft, and blend their
   * mean into the cube, started again after a jump (a teleport)
   * @param {THREE.WebGPURenderer} renderer
   */
  render(renderer) {
    const { camera } = this.clouds;
    const reset = this._position.value.distanceToSquared(this.position) > MAX_MOVE ** 2;
    this._offset.value.subVectors(this.position, camera.position);
    this._position.value.copy(this.position);
    const n = this._renders++;
    // The next stretch of the sequence each render
    const start = n * CLOUD_AMBIENT_RAYS * AXES.length;
    this._seed.value.set(fractional(start * R2[0]), fractional(start * R2[1]));
    this._blend.value = n === 0 || reset ? 1 : CLOUD_AMBIENT_BLEND;

    const cube = this._cubes[this._write];
    this._historyTexture.value = this._cubes[1 - this._write].texture;

    _rendererState = RendererUtils.resetRendererState(renderer, _rendererState);
    renderer.setRenderTarget(this._rays);
    _quad.material = this._raysMaterial;
    _quad.name = 'clouds.ambientRays';
    _quad.render(renderer);
    renderer.setRenderTarget(cube);
    _quad.material = this._cubeMaterial;
    _quad.name = 'clouds.ambientCube';
    _quad.render(renderer);
    RendererUtils.restoreRendererState(renderer, _rendererState);

    this._cubeTexture.value = cube.texture;
    this._write = 1 - this._write;
  }

  dispose() {
    this._rays.dispose();
    for (const target of this._cubes) target.dispose();
    this._raysMaterial.dispose();
    this._cubeMaterial.dispose();
  }
}

/** Fractional part on the CPU */
function fractional(x) {
  return x - Math.floor(x);
}
