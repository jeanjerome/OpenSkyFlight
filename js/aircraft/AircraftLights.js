import * as THREE from 'three';
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu';
import {
  Fn,
  cameraFar,
  cameraNear,
  cameraProjectionMatrix,
  exp,
  float,
  getScreenPosition,
  instanceIndex,
  max,
  modelViewMatrix,
  perspectiveDepthToViewZ,
  positionGeometry,
  select,
  uniform,
  uniformArray,
  uv,
  varying,
  vec3,
  vec4,
} from 'three/tsl';
import { GLOW_LAYER, SCENE_UNIT_LUMINANCE } from '../constants/rendering.js';
import { CONFIG } from '../utils/config.js';
import { AIRCRAFT_LIGHTS, GLOW_MIN_PIXELS, LIGHT_LENS_RADIUS } from '../constants/aircraft.js';

/** Distance by which a light may lie behind the scene and still show: its own lens covers it */
const OCCLUSION_BIAS = 0.3;

/**
 * Whether a point (view space) lies in front of the scene drawn by the main
 * pass, read from its depth, with OCCLUSION_BIAS of tolerance
 */
const inFrontOfScene = (sceneDepth, pointView) => {
  const screen = getScreenPosition(pointView, cameraProjectionMatrix);
  const sceneZ = perspectiveDepthToViewZ(sceneDepth.sample(screen).r, cameraNear, cameraFar);
  return pointView.z.add(OCCLUSION_BIAS).greaterThan(sceneZ);
};

/**
 * Luminance (scene unit) of a lens of LIGHT_LENS_RADIUS emitting an intensity
 * in candelas
 * @param {number} candelas
 */
function lensLuminance(candelas) {
  return candelas / (Math.PI * LIGHT_LENS_RADIUS ** 2) / SCENE_UNIT_LUMINANCE;
}

/**
 * Position lights and anti-collision lights of the aircraft.
 *
 * Each light is a glass lens added to the model (lit by day, emissive when on)
 * and a halo drawn by the glow pass (see ScenePipeline.setGlowLayer): the glare
 * of a bright source in the eye, which keeps a light visible as a point from
 * afar. A halo shows when its light is in front of the scene (not hidden by the
 * airframe or the terrain) and within the light's field of view. Steady
 * position lights (red left, green right, white tail), red beacons flashing on
 * the fin and under the fuselage, double white strobes on the wingtips. The
 * flashing lights (anti-collision) have their own switch (CONFIG.antiCollisionLights).
 *
 * Two draw calls in all, since each object costs main-thread time: the lenses
 * and the halos are instanced (per-light values in uniform arrays).
 *
 * Positions are in the model's own frame (metres, x left, y up, z forward).
 * Luminances are in the scene unit, multiplied by the night exposure of light
 * sources (AtmosphericSky.emissiveExposure).
 */
export default class AircraftLights {
  /**
   * @param {THREE.Object3D} model - the aircraft model, in its own frame
   * @param {{emissiveExposure: Node, sceneDepth: Node}} rendering
   */
  constructor(model, { emissiveExposure, sceneDepth }) {
    this.model = model;
    this.exposure = emissiveExposure;
    this.sceneDepth = sceneDepth;

    this._time = 0;
    this._toCamera = new THREE.Vector3();
    this._axis = new THREE.Vector3();
    this._worldPosition = new THREE.Vector3();
    this._normalMatrix = new THREE.Matrix3();

    // Size of a pixel at unit distance, for the halos' smallest size on screen
    this._pixelAngle = uniform(0.001);

    this._specs = AIRCRAFT_LIGHTS;
    // Per light: lens luminance when on (scene unit) times its current level
    this._lensLevels = uniformArray(new Array(AIRCRAFT_LIGHTS.length).fill(0), 'float');
    this._haloLevels = uniformArray(new Array(AIRCRAFT_LIGHTS.length).fill(0), 'float');
    this._colors = uniformArray(
      AIRCRAFT_LIGHTS.map((spec) => new THREE.Color(...spec.color)),
      'color',
    );
    this._createLenses();
    this._createHalos();
  }

  _createLenses() {
    const color = this._colors.element(instanceIndex);
    const material = new MeshStandardNodeMaterial({ roughness: 0.15, metalness: 0 });
    // Colored glass by day, emissive when on
    material.colorNode = varying(color.mul(0.35));
    material.emissiveNode = varying(color.mul(this._lensLevels.element(instanceIndex))).mul(this.exposure);
    const lenses = new THREE.InstancedMesh(
      new THREE.SphereGeometry(LIGHT_LENS_RADIUS, 12, 8),
      material,
      this._specs.length,
    );
    const matrix = new THREE.Matrix4();
    this._specs.forEach((spec, i) => lenses.setMatrixAt(i, matrix.makeTranslation(...spec.position)));
    lenses.name = 'LightLenses';
    lenses.frustumCulled = false;
    this.model.add(lenses);
  }

  /** Halos: billboards at the lights, a narrow core and a wider glare, at least GLOW_MIN_PIXELS across */
  _createHalos() {
    const positions = uniformArray(
      this._specs.map((spec) => new THREE.Vector3(...spec.position)),
      'vec3',
    );
    const sizes = uniformArray(
      this._specs.map((spec) => spec.haloSize),
      'float',
    );
    const material = new MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    const center = modelViewMatrix.mul(vec4(positions.element(instanceIndex), 1)).xyz;
    const size = max(sizes.element(instanceIndex), center.length().mul(this._pixelAngle).mul(GLOW_MIN_PIXELS));
    material.vertexNode = cameraProjectionMatrix.mul(vec4(center.add(vec3(positionGeometry.xy.mul(size), 0)), 1));
    // Whether the light is visible, tested once per halo at its centre
    const shown = select(inFrontOfScene(this.sceneDepth, center), float(1), float(0));
    const light = varying(this._colors.element(instanceIndex).mul(this._haloLevels.element(instanceIndex)).mul(shown));
    material.colorNode = Fn(() => {
      const r = uv().sub(0.5).length().mul(2);
      // Both terms fall to 10⁻⁴ at the edge, where a light thousands of times
      // brighter than the night scene would otherwise still saturate
      const falloff = exp(r.pow2().mul(-40))
        .mul(0.65)
        .add(exp(r.pow2().mul(-9)).mul(0.35));
      return vec4(light.mul(falloff).mul(this.exposure), 1);
    })();
    const halos = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), material, this._specs.length);
    halos.layers.set(GLOW_LAYER);
    halos.frustumCulled = false;
    halos.name = 'LightHalos';
    this.model.add(halos);
  }

  /**
   * @param {number} dt - seconds
   * @param {THREE.Camera} camera
   * @param {number} viewportHeight - pixels
   */
  update(dt, camera, viewportHeight) {
    this._time += dt;
    this._pixelAngle.value = (2 * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, viewportHeight);

    // The model's world matrix of the previous frame: a frame late at most
    this._normalMatrix.getNormalMatrix(this.model.matrixWorld);
    const lens = this._lensLevels.array;
    const halo = this._haloLevels.array;
    this._specs.forEach((spec, i) => {
      let on = spec.flash && !CONFIG.antiCollisionLights ? 0 : flashing(spec.flash, this._time);
      // Field of view of the light: full inside, fading over 10° at its edge
      if (spec.axis && on > 0) {
        this._worldPosition.set(...spec.position).applyMatrix4(this.model.matrixWorld);
        this._toCamera.subVectors(camera.position, this._worldPosition).normalize();
        this._axis
          .set(...spec.axis)
          .applyMatrix3(this._normalMatrix)
          .normalize();
        const angle = Math.acos(THREE.MathUtils.clamp(this._axis.dot(this._toCamera), -1, 1)) * (180 / Math.PI);
        on *= THREE.MathUtils.clamp((spec.coverage - angle) / 10 + 0.5, 0, 1);
      }
      lens[i] = on * lensLuminance(spec.candelas);
      halo[i] = on * lensLuminance(spec.candelas) * spec.haloShare;
    });
  }
}

/**
 * Light level of a flashing pattern at a time
 * @param {?{period: number, duration: number, count?: number, gap?: number, offset?: number}} flash -
 *   flashes of `duration` seconds every `period` seconds, `count` in a row `gap` seconds apart;
 *   null for a steady light
 * @param {number} t - seconds
 */
function flashing(flash, t) {
  if (!flash) return 1;
  const phase = (t + (flash.offset ?? 0)) % flash.period;
  for (let i = 0; i < (flash.count ?? 1); i++) {
    const start = i * (flash.gap ?? 0);
    if (phase >= start && phase < start + flash.duration) return 1;
  }
  return 0;
}
