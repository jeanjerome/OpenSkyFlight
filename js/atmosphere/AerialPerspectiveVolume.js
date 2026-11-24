import * as THREE from 'three';
import { Node, NodeUpdateType, Storage3DTexture } from 'three/webgpu';
import {
  Fn,
  If,
  Return,
  float,
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
import { AERIAL_PERSPECTIVE_VOLUME_SIZE, AERIAL_PERSPECTIVE_VOLUME_DISTANCE } from '../constants/rendering.js';

const [WIDTH, HEIGHT, DEPTH] = AERIAL_PERSPECTIVE_VOLUME_SIZE;
const WORKGROUP = [4, 4, 4];

/**
 * Distances over which far points are moved onto the ellipsoid, as the
 * per-pixel aerial perspective of the atmosphere library does: from the
 * horizon distance of the highest summit to that of the top of the atmosphere
 * (m). Beyond them the flat map is far above the curved ground.
 */
const GEOMETRIC_CORRECTION_START = 336e3;
const GEOMETRIC_CORRECTION_END = 876e3;

function createVolume(name) {
  const texture = new Storage3DTexture(WIDTH, HEIGHT, DEPTH);
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
   */
  constructor(colorNode, depthNode, atmosphere, camera) {
    super('vec3');
    this.colorNode = colorNode;
    this.depthNode = depthNode;
    this.atmosphere = atmosphere;
    this.camera = camera;
    this.updateBeforeType = NodeUpdateType.FRAME;

    this._luminance = createVolume('aerialPerspectiveLuminance');
    this._transmittance = createVolume('aerialPerspectiveTransmittance');
    this._projectionInverse = uniform(new THREE.Matrix4());
    this._cameraWorld = uniform(new THREE.Matrix4());
    this._computeNode = null;
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
    const { matrixWorldToECEF, sunDirectionECEF, cameraPositionUnit, altitudeCorrectionUnit } = atmosphere;
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
        sunDirectionECEF,
      ).toConst();
      textureStore(this._luminance, globalId, vec4(scattering.get('luminance'), 1));
      textureStore(this._transmittance, globalId, vec4(scattering.get('transmittance'), 1));
    })()
      .context({ getAtmosphere: () => context })
      .computeKernel(WORKGROUP)
      .setName('aerialPerspectiveVolume');
  }

  setup(builder) {
    this._computeNode ??= this._buildCompute();

    const screen = uv();
    const ndc = vec2(screen.x, screen.y.oneMinus()).mul(2).sub(1);
    const point = this._projectionInverse.mul(vec4(ndc, this.depthNode.r, 1));
    const distance = point.xyz.div(point.w).length();
    const coordinates = vec3(screen, sqrt(distance.div(AERIAL_PERSPECTIVE_VOLUME_DISTANCE)));

    const luminance = texture3D(this._luminance, coordinates).rgb;
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
  }

  dispose() {
    super.dispose();
    this._computeNode?.dispose?.();
    this._luminance.dispose();
    this._transmittance.dispose();
  }
}
