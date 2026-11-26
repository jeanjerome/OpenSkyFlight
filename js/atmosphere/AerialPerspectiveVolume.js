import * as THREE from 'three';
import { Node, NodeUpdateType, Storage3DTexture } from 'three/webgpu';
import {
  Fn,
  If,
  Loop,
  Return,
  exp,
  float,
  fract,
  length,
  max,
  min,
  globalId,
  mix,
  remapClamp,
  select,
  sqrt,
  texture3D,
  textureStore,
  uniform,
  uv,
  uvec3,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { getIndirectLuminanceToPoint } from '@takram/three-atmosphere/webgpu';
import { rayEllipsoidIntersection } from '@takram/three-geospatial/webgpu';
import { EARTH_RADIUS } from 'three-tile';
import {
  AERIAL_PERSPECTIVE_VOLUME_SIZE,
  AERIAL_PERSPECTIVE_VOLUME_DISTANCE,
  LIGHT_SHAFT_DISTANCE,
  LIGHT_SHAFT_SAMPLES,
  LIGHT_SHAFT_STRENGTH,
  LIGHT_SHAFT_VOLUME_SIZE,
} from '../constants/rendering.js';

const [WIDTH, HEIGHT, DEPTH] = AERIAL_PERSPECTIVE_VOLUME_SIZE;
const [SHAFT_WIDTH, SHAFT_HEIGHT, SHAFT_DEPTH] = LIGHT_SHAFT_VOLUME_SIZE;
const WORKGROUP = [4, 4, 4];
const SHAFT_WORKGROUP = [8, 8, 1];

/**
 * Distances over which far points are moved onto the ellipsoid, as the
 * per-pixel aerial perspective of the atmosphere library does: from the
 * horizon distance of the highest summit to that of the top of the atmosphere
 * (m). Beyond them the flat map is far above the curved ground.
 */
const GEOMETRIC_CORRECTION_START = 336e3;
const GEOMETRIC_CORRECTION_END = 876e3;

function createVolume(name, [width, height, depth] = AERIAL_PERSPECTIVE_VOLUME_SIZE) {
  const texture = new Storage3DTexture(width, height, depth);
  texture.type = THREE.HalfFloatType;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.NoColorSpace;
  texture.generateMipmaps = false;
  texture.name = name;
  return texture;
}

/**
 * Aerial perspective read from a volume aligned with the camera frustum
 * (froxels, Hillaire 2020) instead of evaluated at every pixel.
 *
 * Every frame a compute pass evaluates, at the centre of each cell of a
 * WIDTH × HEIGHT × DEPTH grid spanning the screen and the distance from the
 * camera, the light scattered toward the camera by the air in front of that
 * point and the transmittance of that air, with the functions of the
 * atmosphere library (the same evaluation as its per-pixel aerial perspective).
 * Each pixel then reads both at its own screen position and distance, with
 * trilinear filtering, and applies them to the scene color; pixels without
 * geometry are left as they are.
 *
 * Cells are spaced quadratically with the distance (the distance is
 * AERIAL_PERSPECTIVE_VOLUME_DISTANCE × w², w being the depth texture
 * coordinate), so that they are a few hundred metres apart near the camera and
 * tens of kilometres apart toward the horizon, where the scattering varies
 * slowly with the distance. Points beyond the last cell take its value.
 *
 * Light shafts: with the shadows of the clouds, the air they shade scatters
 * no sunlight. A second volume, finer across the screen and spanning only the
 * LIGHT_SHAFT_DISTANCE the map of their shadows covers, holds the light the
 * shaded air would have sent: each of its columns follows its view ray, reads
 * the share of the light the clouds hide at a few points of each of its
 * cells, and sums the light scattered over each cell (the difference of the
 * aerial perspective volume between its ends) weighted by that share and by
 * LIGHT_SHAFT_STRENGTH (the shaded air still scatters the light of the sky). Pixels
 * subtract it at their distance, the sky behind the scene that of the whole
 * column (see skyShade).
 *
 * Needs compute shaders with 3D storage textures: WebGPU backend only.
 */
export default class AerialPerspectiveVolume extends Node {
  static get type() {
    return 'AerialPerspectiveVolume';
  }

  /**
   * @param {Node} colorNode - scene color
   * @param {Node} depthNode - scene depth (reversed or not, as the renderer)
   * @param {import('@takram/three-atmosphere/webgpu').AtmosphereContext} atmosphere
   * @param {THREE.Camera} camera
   * @param {{directionECEF: Node, scale: Node}} light - direction of the sun or the moon, and its
   *   brightness relative to the sun
   * @param {?import('../clouds/CloudShadow.js').default} shadow - the clouds' shadows, or null for none
   */
  constructor(colorNode, depthNode, atmosphere, camera, light, shadow = null) {
    super('vec3');
    this.colorNode = colorNode;
    this.depthNode = depthNode;
    this.atmosphere = atmosphere;
    this.camera = camera;
    this.light = light;
    this.shadow = shadow;
    this.updateBeforeType = NodeUpdateType.FRAME;

    this._luminance = createVolume('aerialPerspectiveLuminance');
    this._transmittance = createVolume('aerialPerspectiveTransmittance');
    this._projectionInverse = uniform(new THREE.Matrix4());
    this._cameraWorld = uniform(new THREE.Matrix4());
    this._computeNode = null;
    if (shadow) {
      this._shaded = createVolume('lightShafts', LIGHT_SHAFT_VOLUME_SIZE);
      this._cameraHeight = uniform(0);
      /** Random offset of the shadow samples, changed every frame for the anti-aliasing to average */
      this._jitter = uniform(0);
      this._frame = 0;
      this._shaftNode = null;
    }
  }

  /** Direction of the view ray through a screen position (uv, y down), in the world frame */
  _rayDirectionWorld(screen) {
    const ndc = vec2(screen.x, screen.y.oneMinus()).mul(2).sub(1);
    const point = this._projectionInverse.mul(vec4(ndc, 0.5, 1));
    const direction = point.xyz.div(point.w).normalize();
    return this._cameraWorld.mul(vec4(direction, 0)).xyz;
  }

  _buildCompute() {
    const { atmosphere } = this;
    const { worldToUnit } = atmosphere.parameters;
    const { matrixWorldToECEF, cameraPositionUnit, altitudeCorrectionUnit } = atmosphere;
    const radii = vec3(atmosphere.ellipsoid.radii).mul(worldToUnit);
    // The ray march places its samples by spatio-temporal blue noise at the
    // pixel's screen position, which a compute pass has not: mid-segment here
    const context = Object.create(atmosphere);
    context.raymarchSampleOffset = float(0.5);

    return Fn(() => {
      If(globalId.greaterThanEqual(uvec3(WIDTH, HEIGHT, DEPTH)).any(), () => {
        Return();
      });
      const cell = vec3(globalId)
        .add(0.5)
        .div(vec3(WIDTH, HEIGHT, DEPTH))
        .toConst();
      const distance = cell.z.pow2().mul(AERIAL_PERSPECTIVE_VOLUME_DISTANCE).toConst();

      const direction = matrixWorldToECEF
        .mul(vec4(this._rayDirectionWorld(cell.xy), 0))
        .xyz.normalize()
        .toConst();
      const point = cameraPositionUnit.add(direction.mul(distance.mul(worldToUnit))).toVar();

      // Far points onto the ellipsoid along the ray, or straight below when it misses
      const correction = remapClamp(distance, GEOMETRIC_CORRECTION_START, GEOMETRIC_CORRECTION_END);
      If(correction.greaterThan(0), () => {
        const hit = rayEllipsoidIntersection(cameraPositionUnit, direction, radii).x;
        const onEllipsoid = select(
          hit.greaterThanEqual(0),
          cameraPositionUnit.add(direction.mul(hit)),
          point.div(radii.pow2()).normalize().mul(radii),
        );
        point.assign(mix(point, onEllipsoid, correction));
      });

      const scattering = getIndirectLuminanceToPoint(
        cameraPositionUnit.add(altitudeCorrectionUnit),
        point.add(altitudeCorrectionUnit),
        vec2(0),
        this.light.directionECEF,
      ).toConst();
      textureStore(this._luminance, globalId, vec4(scattering.get('luminance').mul(this.light.scale), 1));
      textureStore(this._transmittance, globalId, vec4(scattering.get('transmittance'), 1));
    })()
      .context({ getAtmosphere: () => context })
      .computeKernel(WORKGROUP)
      .setName('aerialPerspectiveVolume');
  }

  /** Distance of the end of a cell of the shaft volume (m), quadratic as the main volume's */
  static _shaftDistance(index) {
    return index.div(SHAFT_DEPTH).pow2().mul(LIGHT_SHAFT_DISTANCE);
  }

  _buildShaftCompute() {
    const R = EARTH_RADIUS;
    return Fn(() => {
      If(globalId.xy.greaterThanEqual(uvec3(SHAFT_WIDTH, SHAFT_HEIGHT, 1).xy).any(), () => {
        Return();
      });
      // Interleaved gradient noise over the columns, shifted every frame
      const noise = fract(
        fract(float(globalId.x).mul(0.06711056).add(float(globalId.y).mul(0.00583715))).mul(52.9829189),
      );
      const jitter = fract(noise.add(this._jitter)).toConst();
      const screen = vec2(globalId.xy).add(jitter).div(vec2(SHAFT_WIDTH, SHAFT_HEIGHT)).toConst();
      const direction = this._rayDirectionWorld(screen).normalize().toConst();
      // The aerial perspective volume at a distance along this column
      const scattered = (distance) =>
        texture3D(this._luminance, vec3(screen, sqrt(distance.div(AERIAL_PERSPECTIVE_VOLUME_DISTANCE)))).level(0).rgb;
      const shaded = vec3(0).toVar();
      const previous = vec3(0).toVar();
      const start = float(0).toVar();
      Loop(SHAFT_DEPTH, ({ i }) => {
        const end = AerialPerspectiveVolume._shaftDistance(float(i).add(1)).toConst();
        const width = end.sub(start).toConst();
        // Share of the light the clouds hide over the cell
        const hidden = float(0).toVar();
        for (let k = 0; k < LIGHT_SHAFT_SAMPLES; k++) {
          const t = start.add(width.mul(jitter.add(k).div(LIGHT_SHAFT_SAMPLES)));
          const offset = direction.mul(t).toConst();
          const height = length(vec3(offset.x, offset.y.add(this._cameraHeight).add(R), offset.z)).sub(R);
          hidden.addAssign(exp(this.shadow.opticalDepth(offset.xz, height).negate()).oneMinus());
        }
        const current = scattered(end).toConst();
        shaded.addAssign(max(current.sub(previous), 0).mul(hidden.mul(LIGHT_SHAFT_STRENGTH / LIGHT_SHAFT_SAMPLES)));
        textureStore(this._shaded, uvec3(globalId.xy, i), vec4(shaded, 1));
        previous.assign(current);
        start.assign(end);
      });
    })()
      .computeKernel(SHAFT_WORKGROUP)
      .setName('lightShafts');
  }

  /**
   * Light the clouds' shade takes from the air in front of a point
   * @param {Node} screen - uv, y down
   * @param {Node} distance - m (beyond LIGHT_SHAFT_DISTANCE, that of the whole shaft volume)
   */
  _shade(screen, distance) {
    const depth = sqrt(min(distance, LIGHT_SHAFT_DISTANCE).div(LIGHT_SHAFT_DISTANCE));
    // Cell i holds the sum up to its end, where depth = (i + 1) / SHAFT_DEPTH
    const w = depth.mul(SHAFT_DEPTH).sub(0.5).div(SHAFT_DEPTH);
    // Short of the first cell's end, a share of it
    return texture3D(this._shaded, vec3(screen, w)).rgb.mul(min(depth.mul(SHAFT_DEPTH), 1));
  }

  /**
   * Light the clouds' shade takes from the sky behind the scene through a
   * point of the screen, or null without the clouds' shadows
   * @param {Node} screen - uv, y down
   */
  skyShade(screen) {
    return this.shadow ? texture3D(this._shaded, vec3(screen, 1)).rgb : null;
  }

  setup(builder) {
    this._computeNode ??= this._buildCompute();
    if (this.shadow) this._shaftNode ??= this._buildShaftCompute();

    const screen = uv();
    const ndc = vec2(screen.x, screen.y.oneMinus()).mul(2).sub(1);
    const point = this._projectionInverse.mul(vec4(ndc, this.depthNode.r, 1));
    const distance = point.xyz.div(point.w).length();
    const coordinates = vec3(screen, sqrt(distance.div(AERIAL_PERSPECTIVE_VOLUME_DISTANCE)));

    let luminance = texture3D(this._luminance, coordinates).rgb;
    if (this.shadow) luminance = max(luminance.sub(this._shade(screen, distance)), 0);
    const transmittance = texture3D(this._transmittance, coordinates).rgb;
    // Pixels without geometry (sky) are left as they are
    const depth = this.depthNode.r;
    const empty = builder.renderer.reversedDepthBuffer ? depth.lessThanEqual(0) : depth.greaterThanEqual(1);
    return select(empty, this.colorNode.rgb, this.colorNode.rgb.mul(transmittance).add(luminance));
  }

  updateBefore({ renderer }) {
    this._projectionInverse.value.copy(this.camera.projectionMatrixInverse);
    this._cameraWorld.value.copy(this.camera.matrixWorld);
    renderer.compute(this._computeNode, [
      Math.ceil(WIDTH / WORKGROUP[0]),
      Math.ceil(HEIGHT / WORKGROUP[1]),
      Math.ceil(DEPTH / WORKGROUP[2]),
    ]);
    if (this.shadow) {
      this._cameraHeight.value = this.camera.position.y;
      this._jitter.value = fractional(this._frame++ * 0.6180339887);
      renderer.compute(this._shaftNode, [
        Math.ceil(SHAFT_WIDTH / SHAFT_WORKGROUP[0]),
        Math.ceil(SHAFT_HEIGHT / SHAFT_WORKGROUP[1]),
        1,
      ]);
    }
  }

  dispose() {
    super.dispose();
    this._computeNode?.dispose?.();
    this._luminance.dispose();
    this._transmittance.dispose();
    this._shaftNode?.dispose?.();
    this._shaded?.dispose();
  }
}

/** Fractional part on the CPU */
function fractional(x) {
  return x - Math.floor(x);
}
