import * as THREE from 'three';
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial, SpriteNodeMaterial } from 'three/webgpu';
import {
  Discard,
  Fn,
  If,
  cameraFar,
  cameraNear,
  cameraProjectionMatrix,
  cos,
  exp,
  float,
  getScreenPosition,
  max,
  mix,
  modelViewMatrix,
  normalView,
  perspectiveDepthToViewZ,
  positionGeometry,
  positionView,
  pow,
  sin,
  smoothstep,
  time,
  uniform,
  uv,
  vec3,
  vec4,
} from 'three/tsl';
import { GLOW_LAYER, SCENE_UNIT_LUMINANCE } from '../constants/rendering.js';
import {
  AIRCRAFT_LIGHTS,
  AFTERBURNER_FLAME_LENGTH,
  AFTERBURNER_LUMINANCE,
  ENGINE_NOZZLES,
  GLOW_MIN_PIXELS,
  LIGHT_LENS_RADIUS,
  NOZZLE_GLOW_LUMINANCE,
} from '../constants/aircraft.js';

/** Material of the engine nozzles: bare steel and titanium, darkened by heat */
const NOZZLE_METAL = new MeshStandardNodeMaterial({ color: 0x4a4744, metalness: 0.85, roughness: 0.42 });

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
 * Position lights, anti-collision lights and engine glow of the aircraft.
 *
 * Each light is a glass lens added to the model (lit by day, emissive when on)
 * and a halo drawn by the glow pass (see ScenePipeline.setGlowLayer): the glare
 * of a bright source in the eye, which keeps a light visible as a point from
 * afar. A halo shows when its light is in front of the scene (not hidden by the
 * airframe or the terrain) and within the light's field of view. Steady
 * position lights (red left, green right, white tail), red beacons flashing on
 * the fin and under the fuselage, double white strobes on the wingtips.
 *
 * The engines glow from inside their nozzles with thrust, and the afterburner
 * adds a flame with shock diamonds, also drawn by the glow pass.
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
    this._throttle = 0;
    this._afterburner = 0;
    this._toCamera = new THREE.Vector3();
    this._axis = new THREE.Vector3();
    this._worldPosition = new THREE.Vector3();
    this._normalMatrix = new THREE.Matrix3();

    // Size of a pixel at unit distance, for the halos' smallest size on screen
    this._pixelAngle = uniform(0.001);

    this._lights = AIRCRAFT_LIGHTS.map((spec) => this._createLight(spec));
    this._engines = ENGINE_NOZZLES.map((nozzle) => this._createEngine(nozzle));
  }

  _createLight(spec) {
    const color = new THREE.Color(...spec.color);
    const level = uniform(0);

    // Lens: colored glass by day, emissive when on
    const lensMaterial = new MeshStandardNodeMaterial({ roughness: 0.15, metalness: 0 });
    lensMaterial.colorNode = vec3(...color.clone().multiplyScalar(0.35).toArray());
    lensMaterial.emissiveNode = vec3(...color.toArray())
      .mul(level)
      .mul(lensLuminance(spec.candelas))
      .mul(this.exposure);
    const lens = new THREE.Mesh(new THREE.SphereGeometry(LIGHT_LENS_RADIUS, 12, 8), lensMaterial);
    lens.position.set(...spec.position);
    lens.name = `Light_${spec.name}`;
    this.model.add(lens);

    // Halo: a narrow core and a wider glare, at least GLOW_MIN_PIXELS across
    const haloMaterial = new SpriteNodeMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    const center = modelViewMatrix.mul(vec4(0, 0, 0, 1)).xyz;
    haloMaterial.scaleNode = max(float(spec.haloSize), center.length().mul(this._pixelAngle).mul(GLOW_MIN_PIXELS));
    haloMaterial.colorNode = Fn(() => {
      If(inFrontOfScene(this.sceneDepth, center).not(), () => {
        Discard();
      });
      const r = uv().sub(0.5).length().mul(2);
      // Both terms fall to 10⁻⁴ at the edge, where a light thousands of times
      // brighter than the night scene would otherwise still saturate
      const falloff = exp(r.pow2().mul(-40))
        .mul(0.65)
        .add(exp(r.pow2().mul(-9)).mul(0.35));
      const luminance = level.mul(lensLuminance(spec.candelas) * spec.haloShare).mul(this.exposure);
      return vec4(
        vec3(...color.toArray())
          .mul(falloff)
          .mul(luminance),
        1,
      );
    })();
    const halo = new THREE.Sprite(haloMaterial);
    halo.position.set(...spec.position);
    halo.layers.set(GLOW_LAYER);
    halo.frustumCulled = false;
    halo.name = `Halo_${spec.name}`;
    this.model.add(halo);

    return { spec, level, lens, halo };
  }

  _createEngine({ position, radius, mesh }) {
    const [x, y, z] = position;
    const throttle = uniform(0);
    const afterburner = uniform(0);

    // The model paints its nozzles like the airframe: bare, heat-tinted metal instead
    const nozzle = this.model.getObjectByName(mesh);
    if (nozzle?.isMesh) nozzle.material = NOZZLE_METAL;

    // Hot turbine and flame holder seen through the nozzle, dark metal by day:
    // barely glowing at idle, dull orange at full dry thrust, white-yellow with
    // the afterburner
    const discMaterial = new MeshStandardNodeMaterial({ color: 0x15130f, metalness: 0.8, roughness: 0.5 });
    discMaterial.emissiveNode = Fn(() => {
      const r = uv().sub(0.5).length().mul(2);
      const core = smoothstep(1, 0.2, r);
      const heat = throttle.mul(0.95).add(0.05).add(afterburner.mul(2));
      const color = mix(vec3(0.9, 0.18, 0.03), vec3(1.0, 0.75, 0.4), afterburner.add(core.mul(0.3)).min(1));
      const glow = mix(float(NOZZLE_GLOW_LUMINANCE), float(AFTERBURNER_LUMINANCE), afterburner);
      return color.mul(core.mul(0.7).add(0.3)).mul(heat).mul(glow).mul(this.exposure);
    })();
    const disc = new THREE.Mesh(new THREE.CircleGeometry(radius * 1.2, 24), discMaterial);
    disc.position.set(x, y, z + 0.6);
    disc.rotation.y = Math.PI; // facing aft
    disc.name = 'NozzleGlow';
    this.model.add(disc);

    // Afterburner flame: a cone from the nozzle exit, brighter where the line
    // of sight crosses more of it, with shock diamonds fading downstream
    const length = AFTERBURNER_FLAME_LENGTH;
    const geometry = new THREE.CylinderGeometry(radius * 0.35, radius * 0.95, length, 24, 24, true);
    geometry.rotateX(-Math.PI / 2); // axis along z, top (narrow end) aft
    geometry.translate(0, 0, -length / 2);
    const flameMaterial = new MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    flameMaterial.colorNode = Fn(() => {
      If(inFrontOfScene(this.sceneDepth, positionView).not(), () => {
        Discard();
      });
      // 0 at the nozzle exit, 1 at the tip
      const t = positionGeometry.z.negate().div(length).clamp(0, 1);
      const facing = normalView.dot(positionView.normalize().negate()).abs();
      const thickness = pow(facing, 1.5);
      const diamonds = pow(cos(t.mul(length / 0.75).mul(Math.PI * 2)).max(0), 6).mul(t.oneMinus());
      const fade = pow(t.oneMinus(), 1.4).mul(smoothstep(0, 0.04, t));
      const flicker = sin(time.mul(53).add(t.mul(17)))
        .mul(0.06)
        .add(0.94);
      const color = mix(vec3(1.0, 0.42, 0.1), vec3(1.0, 0.82, 0.55), diamonds.add(thickness.mul(0.4)).min(1));
      const luminance = afterburner.mul(AFTERBURNER_LUMINANCE).mul(this.exposure);
      return vec4(
        color
          .mul(thickness.mul(0.35).add(diamonds.mul(1.6)))
          .mul(fade)
          .mul(flicker)
          .mul(luminance),
        1,
      );
    })();
    const flame = new THREE.Mesh(geometry, flameMaterial);
    flame.position.set(x, y, z);
    flame.layers.set(GLOW_LAYER);
    flame.frustumCulled = false;
    flame.name = 'AfterburnerFlame';
    this.model.add(flame);

    return { throttle, afterburner, disc, flame };
  }

  /**
   * @param {number} dt - seconds
   * @param {{thrust: boolean, afterburner: boolean}} engines - engine commands
   * @param {THREE.Camera} camera
   * @param {number} viewportHeight - pixels
   */
  update(dt, { thrust, afterburner }, camera, viewportHeight) {
    this._time += dt;
    this._pixelAngle.value = (2 * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, viewportHeight);

    // Engines spool up in about a second, the afterburner lights faster
    this._throttle += ((thrust ? 1 : 0) - this._throttle) * Math.min(1, dt * 2.5);
    this._afterburner += ((thrust && afterburner ? 1 : 0) - this._afterburner) * Math.min(1, dt * 6);
    for (const engine of this._engines) {
      engine.throttle.value = this._throttle;
      engine.afterburner.value = this._afterburner;
      engine.flame.visible = this._afterburner > 0.01;
    }

    this._normalMatrix.getNormalMatrix(this.model.matrixWorld);
    for (const light of this._lights) {
      const { spec } = light;
      let on = flashing(spec.flash, this._time);
      // Field of view of the light: full inside, fading over 10° at its edge
      if (spec.axis && on > 0) {
        light.lens.getWorldPosition(this._worldPosition);
        this._toCamera.subVectors(camera.position, this._worldPosition).normalize();
        this._axis
          .set(...spec.axis)
          .applyMatrix3(this._normalMatrix)
          .normalize();
        const angle = Math.acos(THREE.MathUtils.clamp(this._axis.dot(this._toCamera), -1, 1)) * (180 / Math.PI);
        on *= THREE.MathUtils.clamp((spec.coverage - angle) / 10 + 0.5, 0, 1);
      }
      light.level.value = on;
      light.halo.visible = on > 0;
    }
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
