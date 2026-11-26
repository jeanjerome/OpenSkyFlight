import * as THREE from 'three';
import {
  Break,
  If,
  Loop,
  dot,
  exp,
  float,
  length,
  max,
  min,
  mix,
  normalize,
  pow,
  remapClamp,
  renderGroup,
  saturate,
  select,
  sqrt,
  texture,
  texture3D,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { getIndirectLuminanceToPoint, getSplitScalarIlluminance } from '@takram/three-atmosphere/webgpu';
import { stbn } from '@takram/three-geospatial/webgpu';
import { EARTH_RADIUS } from 'three-tile';
import CloudTextures from './CloudTextures.js';
import CloudsTemporalNode from './CloudsTemporalNode.js';
import {
  CLOUD_CIRRUS_FIBRES,
  CLOUD_CIRRUS_TILE,
  CLOUD_DEFAULT_COVERAGE,
  CLOUD_DETAIL_DISTANCE,
  CLOUD_DETAIL_TILE,
  CLOUD_LAYERS,
  CLOUD_LIGHT_MIN_STEP,
  CLOUD_LIGHT_STEPS,
  CLOUD_LIGHT_STEP_GROWTH,
  CLOUD_MAX_DISTANCE,
  CLOUD_MAX_STEP,
  CLOUD_MAX_STEPS,
  CLOUD_MIN_STEP,
  CLOUD_MIN_TRANSMITTANCE,
  CLOUD_PHASE_G,
  CLOUD_PHASE_MIX,
  CLOUD_SCATTERING_DECAY,
  CLOUD_SCATTERING_OCTAVES,
  CLOUD_SHAPE_TILE,
  CLOUD_SKY_DISTANCE,
  CLOUD_SKY_LIGHT_SCALE,
  CLOUD_STEP_GROWTH,
  CLOUD_WEATHER_TILE,
  CLOUD_WIND,
} from '../constants/clouds.js';

const R = EARTH_RADIUS;
const RECIPROCAL_PI4 = 1 / (4 * Math.PI);

/** Densities and extinctions below these are taken as empty space */
const MIN_DENSITY = 1e-5;
const MIN_EXTINCTION = 1e-5;

/**
 * Shortest distance at which the air in front of the clouds is applied (m):
 * the atmosphere's frame is in km from the Earth's centre, where single floats
 * are about a metre apart, so that the direction toward a nearer point is lost.
 * The air over this distance is negligible.
 */
const MIN_AIR_DISTANCE = 100;

/** A frame-wide uniform (three's default group is per object, compared and uploaded at every draw call) */
const frameUniform = (value) => uniform(value).setGroup(renderGroup);

/** Fractional part, kept in doubles on the CPU before it reaches a float uniform */
const fract = (x) => x - Math.floor(x);

/**
 * Henyey-Greenstein phase function
 * @param {Node} g - anisotropy
 * @param {Node} cosTheta - cosine of the angle between the light and the view ray
 */
function henyeyGreenstein(g, cosTheta) {
  const g2 = g.mul(g);
  return g2
    .oneMinus()
    .div(max(pow(g2.add(1).sub(g.mul(cosTheta).mul(2)), 1.5), 1e-7))
    .mul(RECIPROCAL_PI4);
}

/**
 * Volumetric clouds: layers of cumulus, mid-level clouds and cirrus in shells
 * around the Earth, ray marched through their density along the view rays of a
 * pass of their own (see march() and CloudsTemporalNode).
 *
 * The density follows Schneider's model (Horizon Zero Dawn, 2015) as takram's
 * three-clouds implements it (MIT): a weather map tells where each layer forms,
 * the coverage thresholds it, the height in the layer rounds the tops, and the
 * shape and detail noise volumes erode it (see CloudTextures). The cirrus only
 * form along the fibres of a map of their own. The light that
 * reaches each sample is the sunlight (or moonlight) through the cloud between
 * it and the light, marched in a few growing steps, scattered by a two-lobe
 * Henyey-Greenstein phase function with Wrenninge's approximation of multiple
 * scattering, plus the sky light.
 * The scattered light is integrated over each step analytically (Hillaire,
 * Frostbite 2016). The sunlight and the sky light at the clouds' altitudes come
 * from the scattering tables of the atmosphere, and the air between the camera
 * and the clouds is applied at their mean distance, weighted by their opacity,
 * so that distant clouds fade into the haze.
 *
 * The shells are centred on the Earth's centre below the camera, as the
 * terrain is lowered by the curvature of the Earth around the camera: clouds
 * dip below the horizon with the terrain.
 */
export default class VolumetricClouds {
  /**
   * @param {import('../atmosphere/AtmosphericSky.js').default} sky
   * @param {THREE.Camera} camera
   */
  constructor(sky, camera) {
    this.sky = sky;
    this.camera = camera;
    this.textures = new CloudTextures();

    /** Sky fraction the clouds cover (0 clear, 1 overcast) */
    this.coverage = frameUniform(CLOUD_DEFAULT_COVERAGE);

    this._cameraHeight = frameUniform(0);
    this._weatherOrigin = frameUniform(new THREE.Vector2());
    this._cirrusOrigin = frameUniform(new THREE.Vector2());
    this._shapeOrigin = frameUniform(new THREE.Vector3());
    this._detailOrigin = frameUniform(new THREE.Vector3());
    this._layerBottoms = frameUniform(new THREE.Vector4());
    this._layerTops = frameUniform(new THREE.Vector4());
    this._minHeight = frameUniform(0);
    this._maxHeight = frameUniform(0);
    this._projectionInverse = frameUniform(new THREE.Matrix4()).onRenderUpdate(() => camera.projectionMatrixInverse);
    this._cameraWorld = frameUniform(new THREE.Matrix4()).onRenderUpdate(() => camera.matrixWorld);

    const layer = (key, fallback = 0) => new THREE.Vector4(...[0, 1, 2, 3].map((i) => CLOUD_LAYERS[i]?.[key] ?? fallback));
    this._densities = layer('density');
    this._shapeAmounts = layer('shape');
    this._detailAmounts = layer('detail');
    this._weatherExponents = layer('weatherExponent', 1);
    this._biases = layer('bias', 1);
    this._edges = layer('edge', 1);

    /** Distance the wind has carried the clouds (m), in doubles */
    this._drift = new THREE.Vector2();
    this.setBase(3500);
  }

  /** @param {number} altitude - base of the cumulus layer (m above sea level) */
  setBase(altitude) {
    const bottoms = CLOUD_LAYERS.map((l) => l.altitude ?? altitude + l.base);
    const tops = CLOUD_LAYERS.map((l, i) => bottoms[i] + l.thickness);
    this._layerBottoms.value.set(...bottoms, 0);
    this._layerTops.value.set(...tops, 1);
    this._minHeight.value = Math.min(...bottoms);
    this._maxHeight.value = Math.max(...tops);
  }

  /** Bring the clouds back to where they were before the wind carried them */
  resetWind() {
    this._drift.set(0, 0);
  }

  /** @param {THREE.WebGPURenderer} renderer */
  init(renderer) {
    this.textures.generate(renderer);
  }

  /**
   * @param {number} dt - seconds
   * @param {THREE.Vector3} cameraPosition - world
   */
  update(dt, cameraPosition) {
    this._drift.x += CLOUD_WIND[0] * dt;
    this._drift.y += CLOUD_WIND[1] * dt;
    this._cameraHeight.value = cameraPosition.y;
    // Texture coordinates of the point below the camera (the samples add
    // their offset from it), wrapped while still in doubles. The wind carries
    // the detail noise along with the clouds, or their eroded edges would
    // stay put while the clouds slide under them
    const x = cameraPosition.x - this._drift.x;
    const z = cameraPosition.z - this._drift.y;
    this._weatherOrigin.value.set(fract(x / CLOUD_WEATHER_TILE), fract(z / CLOUD_WEATHER_TILE));
    this._cirrusOrigin.value.set(fract(x / CLOUD_CIRRUS_TILE), fract(z / CLOUD_CIRRUS_TILE));
    this._shapeOrigin.value.set(fract(x / CLOUD_SHAPE_TILE), fract(z / CLOUD_SHAPE_TILE), 0);
    this._detailOrigin.value.set(fract(x / CLOUD_DETAIL_TILE), fract(z / CLOUD_DETAIL_TILE), 0);
  }

  /**
   * Density of each layer at a point, from the weather map and the height in
   * the layer, before the noise erodes it
   * @param {Node} position - vec3, relative to the Earth's centre below the camera (m)
   * @param {Node} height - above sea level (m)
   */
  _weather(position, height) {
    const fraction = remapClamp(vec4(height), this._layerBottoms, this._layerTops).toConst();
    const map = texture(this.textures.weather, this._weatherOrigin.add(position.xz.div(CLOUD_WEATHER_TILE))).level(0);
    const local = pow(map, vec4(this._weatherExponents));
    // Semicircle over the height in the layer: rounded tops, flat bottoms
    const x = pow(fraction, vec4(this._biases)).mul(2).sub(1).clamp(-1, 1);
    const heightScale = x.mul(x).oneMinus();
    // The coverage lowers the threshold the weather map must exceed (Skybolt)
    const threshold = this.coverage.mul(heightScale).oneMinus();
    const edges = vec4(this._edges);
    const covered = remapClamp(mix(local, vec4(1), edges), threshold, threshold.add(edges)).toConst();
    // The high layer only forms along the cirrus fibres, wider where it is denser
    const fibres = texture(this.textures.cirrus, this._cirrusOrigin.add(position.xz.div(CLOUD_CIRRUS_TILE))).level(0).r;
    const fill = mix(float(1), float(CLOUD_CIRRUS_FIBRES.fill), covered.z);
    const cirrus = remapClamp(fibres, fill, fill.add(CLOUD_CIRRUS_FIBRES.softness)).mul(covered.z);
    const density = vec4(covered.xy, cirrus, covered.w);
    return { fraction, density };
  }

  /**
   * Density of each layer eroded by the noise, and the resulting extinction
   * (per metre, the clouds absorb nothing: extinction = scattering)
   * @param {{fraction: Node, density: Node}} weather
   * @param {Node} position - vec3, relative to the Earth's centre below the camera (m)
   * @param {Node} height - m
   * @param {?Node} detailed - bool, whether to read the detail noise
   */
  _media(weather, position, height, detailed) {
    const shapePoint = this._shapeOrigin.add(vec3(position.x, position.z, height).div(CLOUD_SHAPE_TILE));
    const shape = texture3D(this.textures.shape, shapePoint, 0).r;
    const density = remapClamp(weather.density, vec4(shape.oneMinus()).mul(vec4(this._shapeAmounts)), vec4(1)).toVar();
    if (detailed) {
      If(detailed, () => {
        const detailPoint = this._detailOrigin.add(vec3(position.x, position.z, height).div(CLOUD_DETAIL_TILE));
        const detail = texture3D(this.textures.detail, detailPoint, 0).r;
        // Billowy at the top, wispy at the bottom
        const modifier = mix(vec4(pow(detail, 6)), vec4(detail.oneMinus()), remapClamp(weather.fraction, vec4(0.2), vec4(0.4))).mul(
          vec4(this._detailAmounts),
        );
        density.assign(remapClamp(density.mul(2), modifier.mul(0.5), vec4(1)));
      });
    }
    // Denser toward the top of each layer
    const profile = weather.fraction.mul(0.75).add(0.25);
    const layered = saturate(density.mul(vec4(this._densities)).mul(profile)).toConst();
    const extinction = dot(layered, vec4(1)).toConst();
    return { extinction, weight: layered.div(max(extinction, 1e-7)) };
  }

  /**
   * Optical depth between a point and the light, marched in steps of growing
   * length without the detail noise
   */
  _opticalDepthToLight(position, lightDirection, jitter) {
    let depth = float(0);
    let step = CLOUD_LIGHT_MIN_STEP;
    let distance = jitter.mul(step);
    for (let i = 0; i < CLOUD_LIGHT_STEPS; i++) {
      const point = position.add(lightDirection.mul(distance));
      const height = length(point).sub(R);
      const media = this._media(this._weather(point, height), point, height, null);
      depth = depth.add(media.extinction.mul(step));
      distance = distance.add(step);
      step *= CLOUD_LIGHT_STEP_GROWTH;
    }
    return depth;
  }

  /**
   * Ray distances where a ray from the camera enters and leaves a sphere
   * around the Earth's centre, of radius R + height. The camera is on the axis
   * at R + cameraHeight: the constant term is factored to keep its precision.
   */
  _sphere(direction, height) {
    const b = this._cameraHeight.add(R).mul(direction.y);
    const c = this._cameraHeight.sub(height).mul(this._cameraHeight.add(height).add(2 * R));
    const discriminant = b.mul(b).sub(c).toConst();
    const root = sqrt(max(discriminant, 0));
    return { hit: discriminant.greaterThanEqual(0), near: b.negate().sub(root), far: b.negate().add(root) };
  }

  /** Point of the atmosphere's frame (ECEF, its length unit) at an offset from the camera (world, m) */
  _toAtmosphere(offset) {
    const { atmosphere } = this.sky;
    return atmosphere.cameraPositionUnit.add(
      atmosphere.matrixWorldToECEF.mul(vec4(offset, 0)).xyz.mul(atmosphere.parameters.worldToUnit),
    );
  }

  /**
   * Direction of the view ray through a point of the screen (world)
   * @param {Node} screen - vec2, uv with y down
   */
  viewDirection(screen) {
    const ndc = vec2(screen.x, screen.y.oneMinus()).mul(2).sub(1);
    const target = this._projectionInverse.mul(vec4(ndc, 0.5, 1));
    return this._cameraWorld.mul(vec4(target.xyz.div(target.w).normalize(), 0)).xyz.normalize();
  }

  /**
   * Distance from the camera to the scene through a point of the screen (m),
   * CLOUD_SKY_DISTANCE where the scene pass left the sky
   * @param {Node} screen - vec2, uv with y down
   * @param {Node} depth - scene depth there
   * @param {boolean} reversedDepth
   */
  sceneDistance(screen, depth, reversedDepth) {
    const ndc = vec2(screen.x, screen.y.oneMinus()).mul(2).sub(1);
    const point = this._projectionInverse.mul(vec4(ndc, depth, 1));
    const empty = reversedDepth ? depth.lessThanEqual(0) : depth.greaterThanEqual(1);
    return select(empty, CLOUD_SKY_DISTANCE, min(point.xyz.div(point.w).length(), CLOUD_SKY_DISTANCE));
  }

  /**
   * The clouds in front of the scene along one view ray, to call inside a
   * shader function: their light, premultiplied (rgb) and opacity (a), the
   * air in front of them included, and the distance of their front, weighted
   * by their opacity (the scene distance where the ray meets none)
   * @param {Node} direction - vec3, view ray (world)
   * @param {Node} sceneDistance - m
   * @returns {{color: Node, front: Node}}
   */
  march(direction, sceneDistance) {
    const { atmosphere } = this.sky;
    const lightECEF = this.sky.lightDirectionECEF;
    const lightScale = this.sky.lightScale;

    direction = vec3(direction).toConst();
    const origin = vec3(0, this._cameraHeight.add(R), 0).toConst();
    const lightDirection = atmosphere.matrixECEFToWorld.mul(vec4(lightECEF, 0)).xyz.normalize().toConst();
    const cosTheta = dot(direction, lightDirection).toConst();

    // Part of the ray in the shell of the layers
    const ground = this._sphere(direction, float(0));
    const bottom = this._sphere(direction, this._minHeight);
    const top = this._sphere(direction, this._maxHeight);
    const hitsGround = ground.hit.and(ground.far.greaterThan(0));
    const hitsBottom = bottom.hit.and(bottom.near.greaterThan(0));
    const near = float(-1).toVar();
    const far = float(-1).toVar();
    If(this._cameraHeight.lessThan(this._minHeight), () => {
      If(hitsGround.not(), () => {
        near.assign(bottom.far);
        far.assign(top.far);
      });
    })
      .ElseIf(this._cameraHeight.lessThan(this._maxHeight), () => {
        near.assign(0);
        far.assign(select(hitsBottom, bottom.near, top.far));
      })
      .Else(() => {
        If(top.hit.and(top.near.greaterThan(0)), () => {
          near.assign(top.near);
          far.assign(select(hitsBottom, bottom.near, top.far));
        });
      });
    far.assign(min(far, min(sceneDistance, near.add(CLOUD_MAX_DISTANCE))));

    const color = vec4(0).toVar();
    const front = float(sceneDistance).toVar();
    If(far.greaterThan(near).and(far.greaterThan(0)), () => {
      const jitter = stbn;
      const start = origin.add(direction.mul(near)).toConst();

      // Sunlight and sky light at the bottom and the top of the layers, above the entry point
      const up = normalize(start);
      const irradiance = (height) => {
        const point = this._toAtmosphere(up.mul(height.add(R)).sub(origin)).add(atmosphere.altitudeCorrectionUnit);
        const light = getSplitScalarIlluminance(point, lightECEF).toConst();
        return { sun: light.get('direct').mul(lightScale), sky: light.get('indirect').mul(lightScale) };
      };
      const low = irradiance(this._minHeight);
      const high = irradiance(this._maxHeight);
      const sunLow = vec3(low.sun).toConst();
      const sunHigh = vec3(high.sun).toConst();
      const skyLow = vec3(low.sky).toConst();
      const skyHigh = vec3(high.sky).toConst();

      // Phase of each octave of the multiple scattering, of decreasing anisotropy
      const phases = [];
      for (let i = 0; i < CLOUD_SCATTERING_OCTAVES; i++) {
        const attenuation = CLOUD_SCATTERING_DECAY.anisotropy ** i;
        phases.push(
          mix(
            henyeyGreenstein(float(CLOUD_PHASE_G[0] * attenuation), cosTheta),
            henyeyGreenstein(float(CLOUD_PHASE_G[1] * attenuation), cosTheta),
            CLOUD_PHASE_MIX,
          ).toConst(),
        );
      }
      const multipleScattering = (opticalDepth) =>
        phases.reduce(
          (sum, phase, i) =>
            sum.add(exp(opticalDepth.mul(-(CLOUD_SCATTERING_DECAY.opticalDepth ** i))).mul(phase).mul(CLOUD_SCATTERING_DECAY.energy ** i)),
          float(0),
        );

      const radiance = vec3(0).toVar();
      const transmittance = float(1).toVar();
      const weightedDistance = float(0).toVar();
      const weightSum = float(0).toVar();
      const span = far.sub(near).toConst();
      const step = float(CLOUD_MIN_STEP).add(near.mul(CLOUD_STEP_GROWTH - 1)).toVar();
      // Start of the current step along the ray, from the entry into the layers
      const t = float(0).toVar();

      Loop(CLOUD_MAX_STEPS, () => {
        If(t.greaterThanEqual(span), () => Break());
        // One sample anywhere in each step (stratified): the steps follow the
        // camera, and samples at fixed places in them would alias the noise
        // into patterns that roll through the clouds as it moves. The last
        // step ends at the scene (the aircraft inside a cloud)
        const stepLength = min(step, span.sub(t)).toConst();
        const sampleT = t.add(stepLength.mul(jitter)).toConst();
        const position = start.add(direction.mul(sampleT)).toConst();
        const height = length(position).sub(R).toConst();
        const weather = this._weather(position, height);
        If(weather.density.greaterThan(vec4(MIN_DENSITY)).any(), () => {
          const media = this._media(weather, position, height, near.add(sampleT).lessThan(CLOUD_DETAIL_DISTANCE));
          const extinction = media.extinction;
          If(extinction.greaterThan(MIN_EXTINCTION), () => {
            const alpha = remapClamp(height, this._minHeight, this._maxHeight);
            const opticalDepth = this._opticalDepthToLight(position, lightDirection, jitter);
            const skyGradient = dot(weather.fraction.mul(0.5).add(0.5), media.weight);
            const scattered = mix(sunLow, sunHigh, alpha)
              .mul(multipleScattering(opticalDepth))
              .add(mix(skyLow, skyHigh, alpha).mul(RECIPROCAL_PI4 * CLOUD_SKY_LIGHT_SCALE).mul(skyGradient))
              .mul(extinction);
            // Scattered light integrated over the step (energy conserving)
            const stepTransmittance = exp(extinction.mul(stepLength).negate()).toConst();
            radiance.addAssign(transmittance.mul(scattered.sub(scattered.mul(stepTransmittance)).div(extinction)));
            transmittance.mulAssign(stepTransmittance);
            weightedDistance.addAssign(near.add(sampleT).mul(transmittance));
            weightSum.addAssign(transmittance);
          });
        });
        If(transmittance.lessThanEqual(CLOUD_MIN_TRANSMITTANCE), () => Break());
        t.addAssign(stepLength);
        step.assign(min(step.mul(CLOUD_STEP_GROWTH), CLOUD_MAX_STEP));
      });

      If(weightSum.greaterThan(0), () => {
        // The air between the camera and the clouds, at their mean distance.
        // Inside a cloud it is zero where the first sample, taken at the
        // camera, is dense enough to end the march: the luminance toward a
        // point at the camera itself is undefined (a zero direction).
        const distance = max(weightedDistance.div(weightSum), MIN_AIR_DISTANCE).toConst();
        const air = getIndirectLuminanceToPoint(
          atmosphere.cameraPositionUnit.add(atmosphere.altitudeCorrectionUnit),
          this._toAtmosphere(direction.mul(distance)).add(atmosphere.altitudeCorrectionUnit),
          vec2(0),
          lightECEF,
        ).toConst();
        const opacity = remapClamp(transmittance, 1, CLOUD_MIN_TRANSMITTANCE);
        color.assign(
          vec4(radiance.mul(air.get('transmittance')).add(air.get('luminance').mul(lightScale).mul(opacity)), opacity),
        );
        front.assign(min(distance, sceneDistance));
      });
    });
    return { color, front };
  }

  /**
   * The pass drawing the clouds in front of the scene (see CloudsTemporalNode)
   * @param {Node} depthNode - scene depth
   * @param {boolean} reversedDepth
   */
  pass(depthNode, reversedDepth) {
    return new CloudsTemporalNode(this, depthNode, reversedDepth);
  }

  dispose() {
    this.textures.dispose();
  }
}
