import * as THREE from 'three';
import { distance, float, mix, positionWorld, renderGroup, shadow, smoothstep, uniform } from 'three/tsl';
import { AIRCRAFT_TARGET_LENGTH } from '../constants/aircraft.js';
import { AIRCRAFT_SHADOW_MAP_SIZE, SHADOW_CASTER_LAYER } from '../constants/rendering.js';
import { SUN_ANGULAR_RADIUS } from '../constants/terrain.js';

/** Radius of a sphere holding the aircraft (m) */
const RADIUS = AIRCRAFT_TARGET_LENGTH * 0.6;

/**
 * Distance behind the aircraft at which the sun's disc is no longer hidden
 * by it anywhere: beyond, only a faint penumbra is left, which is not drawn
 */
const UMBRA_LENGTH = AIRCRAFT_TARGET_LENGTH / (2 * SUN_ANGULAR_RADIUS);

const _centre = /* @__PURE__ */ new THREE.Vector3();
const _light = /* @__PURE__ */ new THREE.Vector3();

/**
 * Shadow of the aircraft, on itself and on the ground, as a factor of the
 * direct light of the sun or the moon: a shadow map fitted around the
 * aircraft along the light, which only the aircraft is drawn into (its meshes
 * cast shadows, nothing else does). The shadow fades out toward the end of
 * its umbra: further behind, the aircraft hides too little of the sun's disc.
 */
export default class AircraftShadow {
  /**
   * @param {import('../atmosphere/AtmosphericSky.js').default} sky
   * @param {import('./AircraftManager.js').default} aircraft - its model loads later
   */
  constructor(sky, aircraft) {
    this.sky = sky;
    this.aircraft = aircraft;

    // Places the shadow camera only: never added to the scene, it lights nothing
    this._light = new THREE.DirectionalLight();
    this._shadow = this._light.shadow;
    this._shadow.mapSize.setScalar(AIRCRAFT_SHADOW_MAP_SIZE);
    const camera = this._shadow.camera;
    camera.left = camera.bottom = -RADIUS;
    camera.right = camera.top = RADIUS;
    camera.layers.set(SHADOW_CASTER_LAYER);
    camera.near = RADIUS;
    camera.far = 3 * RADIUS + UMBRA_LENGTH;
    camera.updateProjectionMatrix();

    this._centre = uniform(new THREE.Vector3()).setGroup(renderGroup);
    /** 1 while the aircraft casts its shadow, 0 for none */
    this.enabled = uniform(1).setGroup(renderGroup);
    const fade = smoothstep(UMBRA_LENGTH, UMBRA_LENGTH * 0.3, distance(positionWorld, this._centre)).mul(this.enabled);
    /** Factor of the direct light where it is evaluated */
    this.node = mix(float(1), shadow(this._light, this._shadow), fade);
  }

  /**
   * Cast the aircraft's shadow, or not: off, its shadow map is no longer drawn
   * @param {boolean} on
   */
  setEnabled(on) {
    this.enabled.value = on ? 1 : 0;
    this._shadow.autoUpdate = on;
  }

  /** Fit the shadow map around the aircraft. Call once per frame, after the light has been updated. */
  update() {
    const group = this.aircraft.group;
    if (!group) return;
    const centre = group.getWorldPosition(_centre);
    this._centre.value.copy(centre);
    const light = this.sky.lightDirectionWorld(_light);
    this._light.position.copy(centre).addScaledVector(light, 2 * RADIUS);
    this._light.target.position.copy(centre);
    this._light.updateMatrixWorld();
    this._light.target.updateMatrixWorld();
  }
}
