import * as THREE from 'three';
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  Discard,
  Fn,
  If,
  Loop,
  attribute,
  cameraFar,
  cameraNear,
  cameraProjectionMatrix,
  ceil,
  clamp,
  exp,
  float,
  fract,
  getScreenPosition,
  int,
  max,
  min,
  mix,
  perspectiveDepthToViewZ,
  positionGeometry,
  positionLocal,
  positionView,
  screenCoordinate,
  select,
  sign,
  sin,
  smoothstep,
  time,
  uniform,
  uniformArray,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { GLOW_LAYER } from '../constants/rendering.js';
import { CONFIG, onChange } from '../utils/config.js';
import { SCENE_ILLUMINANCE_PER_LUX } from '../atmosphere/AtmosphericSky.js';
import {
  AFTERBURNER_INTENSITY,
  AFTERBURNER_LIGHT_COLOR,
  AFTERBURNER_LUMINANCE,
  ENGINE_NOZZLES,
  NOZZLE_FLAP_HINGE_Z,
  NOZZLE_GLOW_LUMINANCE,
  NOZZLE_MODEL_EXIT_RADIUS,
} from '../constants/aircraft.js';
import { EXIT_DIAMETER_REHEAT, FLAME_LENGTH_MAX } from '../flight/exhaust.js';

/** Radius (m) of the volume the flame is drawn in, around each nozzle axis */
const FLAME_VOLUME_RADIUS = 0.7;

/** Length (m) of that volume, past the longest flame */
const FLAME_VOLUME_LENGTH = FLAME_LENGTH_MAX + 0.5;

/**
 * Distance between samples along a line of sight through the flame (m), and
 * their largest number: the flame is smooth along its axis, the sharp shock
 * diamonds are integrated exactly
 */
const SAMPLE_STEP = 0.25;
const MAX_SAMPLES = 24;

/** Shock diamonds drawn, and how much shorter each cell is than the one before */
const DIAMOND_COUNT = 8;
const CELL_SHORTENING = 0.05;

/** Share (as a power) of the night exposure of light sources the flame takes */
const FLAME_EXPOSURE_SHARE = 0.35;

/** Distance of the afterburner's light aft of the nozzle exits (m): about the middle of the bright flame */
const LIGHT_AFT = 2.5;

/** Model's exit radius per metre of real exit diameter: the model's nozzles are a little larger */
const MODEL_RADIUS_PER_DIAMETER = NOZZLE_MODEL_EXIT_RADIUS / EXIT_DIAMETER_REHEAT;

/** Colors of the flame (linear): white-yellow core, orange soot, blue-violet chemiluminescence */
const CORE_COLOR = [1.0, 0.55, 0.2];
const SOOT_COLOR = [1.0, 0.3, 0.05];
const SHEATH_COLOR = [0.42, 0.3, 1.0];
const DIAMOND_COLOR = [1.0, 0.75, 0.45];

/**
 * Engine nozzles and exhaust of the aircraft:
 * - the nozzles' convergent flaps close at full dry power and open at idle
 *   and with the afterburner (exitDiameter of the jet, see flight/exhaust.js);
 * - the turbine and flame holder glow through the nozzle with power;
 * - the afterburner flame, a glowing volume integrated along each line of
 *   sight: a white-yellow core, a mantle of orange soot, a faint blue-violet
 *   sheath (visible at night), and the shock diamonds of the underexpanded jet
 *   at their physical spacing, cells shortening downstream.
 *
 * The flame is drawn by the glow pass (see ScenePipeline.setGlowLayer) on a
 * cylinder around each nozzle axis: each fragment marches its line of sight
 * through the cylinder up to the scene in front of it (airframe, terrain), so
 * the flame looks right from any side, down its axis included.
 */
export default class EngineExhaust {
  /**
   * @param {THREE.Object3D} model - the aircraft model, in its own frame (metres, x left, y up, z forward)
   * @param {{emissiveExposure: Node, sceneDepth: Node}} rendering
   */
  constructor(model, { emissiveExposure, sceneDepth }) {
    this.model = model;
    this.exposure = emissiveExposure;
    this.sceneDepth = sceneDepth;

    this._heat = 0;
    this._reheatGlow = 0;
    this._heatUniform = uniform(0);
    this._reheatUniform = uniform(0);
    // Change of the model's nozzle exit radius (m)
    this._opening = uniform(0);
    // Jet and flame of the current power (see flight/exhaust.js)
    this._exitRadius = uniform(NOZZLE_MODEL_EXIT_RADIUS);
    this._flame = uniform(0);
    this._flameLength = uniform(1);
    // Per diamond: distance from the exit (m), radius and half-thickness (1/e, m), brightness
    this._diamondShapes = Array.from({ length: DIAMOND_COUNT }, () => new THREE.Vector4());
    this._diamondUniforms = uniformArray(this._diamondShapes, 'vec4');
    // Camera position in the model's frame, set as the flame is drawn
    this._camera = uniform(new THREE.Vector3());
    this._inverse = new THREE.Matrix4();

    this._createNozzles();
    this._createGlow();
    this._createFlames();
    this._createLight();
  }

  /**
   * The afterburner's light on the airframe and the ground, from a point a
   * little aft of the nozzles (CONFIG.afterburnerLight). While enabled it stays
   * in the scene, dark without afterburner: adding or removing a light
   * recompiles every lit material, and every lit fragment pays for it.
   */
  _createLight() {
    const [, y, z] = ENGINE_NOZZLES[0].position;
    this._light = new THREE.PointLight(new THREE.Color(...AFTERBURNER_LIGHT_COLOR), 0, 0, 2);
    this._light.position.set(0, y, z - LIGHT_AFT);
    this._light.name = 'AfterburnerLight';
    const apply = (enabled) => {
      if (enabled) this.model.add(this._light);
      else this.model.remove(this._light);
    };
    apply(CONFIG.afterburnerLight);
    onChange((key, value) => {
      if (key === 'afterburnerLight') apply(value);
    });
  }

  /** Bare, heat-tinted metal in place of the airframe paint, with flaps that open and close */
  _createNozzles() {
    const material = new MeshStandardNodeMaterial({ color: 0x4a4744, metalness: 0.85, roughness: 0.42 });
    const exitZ = ENGINE_NOZZLES[0].position[2];
    const [cx, cy] = ENGINE_NOZZLES[0].position;
    const opening = this._opening;
    material.positionNode = Fn(() => {
      const p = positionLocal;
      // Each nozzle lies on its side of the centre line
      const centre = vec2(sign(p.x).mul(cx), cy);
      const flap = clamp(p.z.sub(NOZZLE_FLAP_HINGE_Z).div(exitZ - NOZZLE_FLAP_HINGE_Z), 0, 1);
      return vec3(p.xy.add(p.xy.sub(centre).normalize().mul(flap.mul(opening))), p.z);
    })();
    for (const { mesh } of ENGINE_NOZZLES) {
      const nozzle = this.model.getObjectByName(mesh);
      if (nozzle?.isMesh) nozzle.material = material;
    }
  }

  /**
   * Hot turbine and flame holder seen through the nozzle, dark metal by day:
   * barely glowing at idle, dull orange at full dry thrust, white-yellow with
   * the afterburner
   */
  _createGlow() {
    const heatLevel = this._heatUniform;
    const reheat = this._reheatUniform;
    const discs = ENGINE_NOZZLES.map(({ position: [x, y, z], radius }) => {
      const disc = new THREE.CircleGeometry(radius * 1.2, 24);
      disc.rotateY(Math.PI); // facing aft
      disc.translate(x, y, z + 0.6);
      return disc;
    });
    const material = new MeshStandardNodeMaterial({ color: 0x15130f, metalness: 0.8, roughness: 0.5 });
    material.emissiveNode = Fn(() => {
      const r = uv().sub(0.5).length().mul(2);
      const core = smoothstep(0.2, 1, r).oneMinus();
      const heat = heatLevel.mul(0.95).add(0.05).add(reheat.mul(2));
      const color = mix(vec3(0.9, 0.18, 0.03), vec3(1.0, 0.75, 0.4), reheat.add(core.mul(0.3)).min(1));
      const glow = mix(float(NOZZLE_GLOW_LUMINANCE), float(AFTERBURNER_LUMINANCE * 0.1), reheat);
      return color.mul(core.mul(0.7).add(0.3)).mul(heat).mul(glow).mul(this.exposure);
    })();
    const glow = new THREE.Mesh(mergeGeometries(discs), material);
    glow.name = 'NozzleGlow';
    this.model.add(glow);
  }

  _createFlames() {
    const volumes = ENGINE_NOZZLES.map(({ position: [x, y, z] }, i) => {
      const volume = new THREE.CylinderGeometry(
        FLAME_VOLUME_RADIUS,
        FLAME_VOLUME_RADIUS,
        FLAME_VOLUME_LENGTH,
        24,
        1,
        false,
      );
      volume.rotateX(Math.PI / 2); // axis along z
      volume.translate(x, y, z - FLAME_VOLUME_LENGTH / 2);
      volume.setAttribute(
        'nozzle',
        new THREE.Float32BufferAttribute(new Array(volume.attributes.position.count).fill(i), 1),
      );
      return volume;
    });

    const material = new MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    material.colorNode = Fn(() => {
      // Line of sight in the frame of this nozzle (x, y across, z forward,
      // origin at the exit centre): P(t) = origin + t·dir, t = 1 at this fragment
      const first = attribute('nozzle', 'float').lessThan(0.5);
      const centre = select(first, vec3(...ENGINE_NOZZLES[0].position), vec3(...ENGINE_NOZZLES[1].position));
      const origin = this._camera.sub(centre).toVar();
      const dir = positionGeometry.sub(this._camera).toVar();

      // Entry and exit of the cylinder around the axis...
      const a = dir.xy.dot(dir.xy).max(1e-8);
      const b = origin.xy.dot(dir.xy);
      const c = origin.xy.dot(origin.xy).sub(FLAME_VOLUME_RADIUS * FLAME_VOLUME_RADIUS);
      const disc = b.mul(b).sub(a.mul(c));
      If(disc.lessThan(0), () => {
        Discard();
      });
      const root = disc.sqrt();
      // ...between the exit plane and the tip of the flame...
      const dz = select(dir.z.abs().lessThan(1e-6), float(1e-6), dir.z);
      const tExitPlane = origin.z.negate().div(dz);
      const tEnd = this._flameLength.negate().sub(origin.z).div(dz);
      const tIn = max(max(b.negate().sub(root).div(a), min(tExitPlane, tEnd)), 0);
      // ...and in front of the scene drawn at this pixel (same ratio in view space)
      const screen = getScreenPosition(positionView, cameraProjectionMatrix);
      const sceneZ = perspectiveDepthToViewZ(this.sceneDepth.sample(screen).r, cameraNear, cameraFar);
      const tOut = min(min(b.negate().add(root).div(a), max(tExitPlane, tEnd)), sceneZ.div(positionView.z));
      If(tOut.lessThanEqual(tIn), () => {
        Discard();
      });

      const metres = dir.length();
      const count = clamp(ceil(tOut.sub(tIn).mul(metres).div(SAMPLE_STEP)), 4, MAX_SAMPLES);
      const step = tOut.sub(tIn).div(count);
      // Samples offset per pixel (interleaved gradient noise): noise instead of banding
      const jitter = fract(screenCoordinate.xy.dot(vec2(0.06711056, 0.00583715)).fract().mul(52.9829189));
      const sum = vec3(0).toVar();
      Loop({ start: int(0), end: count.toInt(), type: 'int', condition: '<' }, ({ i }) => {
        const q = origin.add(dir.mul(tIn.add(float(i).add(jitter).mul(step))));
        sum.addAssign(this._emission(q));
      });
      sum.mulAssign(step);
      sum.addAssign(this._diamonds(origin, dir, tOut));

      const flicker = sin(time.mul(31)).mul(0.04).add(0.96);
      // The night exposure of light sources would turn so large a source white: a softer share keeps its colors
      const exposure = this.exposure.pow(FLAME_EXPOSURE_SHARE);
      return vec4(sum.mul(metres).mul(flicker).mul(this._flame).mul(exposure), 1);
    })();

    this._flameMesh = new THREE.Mesh(mergeGeometries(volumes), material);
    this._flameMesh.layers.set(GLOW_LAYER);
    this._flameMesh.frustumCulled = false;
    this._flameMesh.name = 'AfterburnerFlames';
    // The camera as this frame draws it, in the model's frame
    this._flameMesh.onBeforeRender = (renderer, scene, camera) => {
      this._inverse.copy(this._flameMesh.matrixWorld).invert();
      this._camera.value.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(this._inverse);
    };
    this.model.add(this._flameMesh);
  }

  /**
   * Light emitted per metre (scene unit of luminance) at a point of the jet
   * @param {Node} q - point in the nozzle's frame (m)
   */
  _emission(q) {
    const length = this._flameLength;
    const exit = this._exitRadius;
    // Distance downstream of the exit, as a share of the flame, and from the axis
    const x = q.z.negate();
    const u = x.div(length);
    const r = q.xy.length();
    // The flame narrows to its tip, its faint sheath widens; the turbulent mixing layer flickers
    const flameRadius = exit.mul(u.mul(-0.55).add(1.05));
    const sheathRadius = exit.mul(u.mul(0.15).add(1.3));
    const swirl = sin(time.mul(47).add(x.mul(5.3)).add(q.x.add(q.y).mul(9)))
      .mul(0.2)
      .add(0.8);

    // Core, shrinking to nothing at mid-flame
    const coreRadius = exit.mul(u.div(0.55).oneMinus().max(0.02)).mul(0.8);
    const core = exp(r.div(coreRadius).pow2().mul(-2)).mul(select(u.lessThan(0.55), float(1), float(0)));
    const soot = exp(r.div(flameRadius).pow2().mul(-3))
      .mul(exp(u.mul(-1.6)))
      .mul(swirl);
    const sheath = exp(r.div(sheathRadius).pow2().mul(-2.5)).mul(exp(u.mul(-2)));

    // Nothing past the tip, nor at the edge of the volume drawn
    const tip = smoothstep(0.6, 1, u)
      .oneMinus()
      .mul(select(u.greaterThanEqual(0), float(1), float(0)));
    const edge = smoothstep(FLAME_VOLUME_RADIUS, FLAME_VOLUME_RADIUS * 0.75, r);
    const color = vec3(...CORE_COLOR)
      .mul(core.mul(0.5))
      .add(vec3(...SOOT_COLOR).mul(soot.mul(0.18)))
      .add(vec3(...SHEATH_COLOR).mul(sheath.mul(0.04)));
    return color.mul(tip.mul(edge)).mul(AFTERBURNER_LUMINANCE);
  }

  /**
   * Light of the shock diamonds along a line of sight, per unit of t (see
   * _createFlames). Each Mach disc is a Gaussian ellipsoid, flat along the
   * axis, whose integral along a line has a closed form: with A its inverse
   * squared radii, p the line's origin from its centre and v its direction,
   * ∫exp(−(p + tv)ᵀA(p + tv))dt = √(π/a)·exp(b²/a − c), a = vᵀAv, b = pᵀAv,
   * c = pᵀAp. A diamond counts when the closest point lies in front of the scene.
   * @param {Node} origin - line origin in the nozzle's frame (m)
   * @param {Node} dir - line direction, per unit of t
   * @param {Node} tOut - where the line meets the scene or leaves the flame
   */
  _diamonds(origin, dir, tOut) {
    const sum = float(0).toVar();
    Loop(DIAMOND_COUNT, ({ i }) => {
      const shape = this._diamondUniforms.element(i);
      const inverse = vec3(shape.y, shape.y, shape.z)
        .mul(vec3(shape.y, shape.y, shape.z))
        .reciprocal();
      const p = origin.add(vec3(0, 0, shape.x));
      const a = dir.mul(dir).dot(inverse);
      const b = p.mul(dir).dot(inverse);
      const c = p.mul(p).dot(inverse);
      const closest = b.negate().div(a);
      const seen = select(closest.lessThan(tOut), shape.w, float(0));
      sum.addAssign(
        float(Math.PI)
          .div(a)
          .sqrt()
          .mul(exp(b.mul(b).div(a).sub(c)))
          .mul(seen),
      );
    });
    // Peak emission per metre of a Mach disc
    return vec3(...DIAMOND_COLOR).mul(sum.mul(2.2 * AFTERBURNER_LUMINANCE));
  }

  /**
   * @param {number} dt - s
   * @param {{core: number, reheat: number}} engines - core power (0 idle, 1 full dry) and afterburner
   *   stage (0 off, 1 full)
   * @param {import('../flight/exhaust.js').Jet} jet
   */
  update(dt, { core, reheat }, jet) {
    // The hot parts take time to glow and cool
    this._heat += (core - this._heat) * Math.min(1, dt * 2.5);
    this._reheatGlow += (reheat - this._reheatGlow) * Math.min(1, dt * 6);
    this._heatUniform.value = this._heat;
    this._reheatUniform.value = this._reheatGlow;

    const exitRadius = jet.exitDiameter * MODEL_RADIUS_PER_DIAMETER;
    this._opening.value = exitRadius - NOZZLE_MODEL_EXIT_RADIUS;
    this._exitRadius.value = exitRadius;
    this._flame.value = jet.flame;
    this._flameLength.value = Math.max(0.1, jet.flameLength);
    this._updateDiamonds(jet, exitRadius);
    this._flameMesh.visible = jet.flame > 0.01;
    // Under the flame's own exposure, so that what it lights is no brighter than the flame itself
    const exposure = this.exposure.value ** FLAME_EXPOSURE_SHARE;
    this._light.intensity = AFTERBURNER_INTENSITY * jet.flame * SCENE_ILLUMINANCE_PER_LUX * exposure;
  }

  /**
   * Mach discs of the underexpanded jet: the first at jet.firstDisc, then one
   * per cell, each cell a little shorter than the last, smaller and dimmer
   * downstream, none past the flame tip (or without shock cells)
   */
  _updateDiamonds(jet, exitRadius) {
    const length = Math.max(0.1, jet.flameLength);
    let x = jet.firstDisc;
    this._diamondShapes.forEach((shape, n) => {
      const cell = jet.cellSpacing * (1 - CELL_SHORTENING * n);
      const u = x / length;
      const tip = u < 0.6 ? 1 : u < 1 ? 1 - smooth((u - 0.6) / 0.4) : 0;
      // cos¹⁶(πφ) ≈ exp(−8π²φ²): a disc 0.11 of a cell thick
      shape.set(
        x,
        0.53 * exitRadius * (1 - 0.04 * n),
        Math.max(0.01, 0.1125 * cell),
        jet.cellSpacing > 0 ? Math.exp(-2.5 * u) * tip : 0,
      );
      x += cell;
    });
  }
}

/** Smoothstep from 0 to 1 */
function smooth(t) {
  return t * t * (3 - 2 * t);
}
