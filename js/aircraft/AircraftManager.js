import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import Logger from '../utils/Logger.js';
import { CONFIG } from '../utils/config.js';
import AircraftLights from './AircraftLights.js';
import EngineExhaust from './EngineExhaust.js';
import { exhaustJet } from '../flight/exhaust.js';
import ControlSurfaces from './ControlSurfaces.js';
import { SHADOW_CASTER_LAYER } from '../constants/rendering.js';
import {
  AIRCRAFT_TARGET_LENGTH,
  VISUAL_ROLL_FACTOR,
  VISUAL_ROLL_MAX,
  VISUAL_PITCH_FACTOR,
  VISUAL_PITCH_MAX,
  VISUAL_SMOOTH,
  AFTERBURNER_SPEED,
} from '../constants/aircraft.js';

/** Time constant of the engines' power changes in the Exploration mode (s) */
const EXPLORATION_SPOOL_TIME = 0.8;

/** Speed of sound for the Exploration mode's Mach number (m/s), at about 6 000 m */
const SPEED_OF_SOUND = 316;

export default class AircraftManager {
  /**
   * @param {THREE.Scene} scene
   * @param {{emissiveExposure: Node, sceneDepth: Node, camera: THREE.Camera, renderer: THREE.WebGPURenderer}} rendering -
   *   what the aircraft's lights need (see AircraftLights)
   */
  constructor(scene, rendering) {
    this.scene = scene;
    this.rendering = rendering;
    this.lights = null;
    this.exhaust = null;
    /** Engines as shown and heard: core power, afterburner stage, flight Mach number, running */
    this.engines = { core: 0, reheat: 0, mach: 0, running: true };
    /** Exhaust jet of each engine (see flight/exhaust.js) */
    this.jet = exhaustJet(0, 0, 0);
    this._bufferSize = new THREE.Vector2();
    this.mesh = null;
    this.ready = false;

    this._visualRoll = 0;
    this._visualPitch = 0;

    this._qVisualRoll = new THREE.Quaternion();
    this._qVisualPitch = new THREE.Quaternion();
    this._qRoll = new THREE.Quaternion();
    this._axisZ = new THREE.Vector3(0, 0, 1);
    this._axisX = new THREE.Vector3(1, 0, 0);
  }

  async load(url) {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    this.mesh = gltf.scene;

    const box = new THREE.Box3().setFromObject(this.mesh);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const scaleFactor = AIRCRAFT_TARGET_LENGTH / maxDim;
    this.mesh.scale.setScalar(scaleFactor);

    const center = new THREE.Vector3();
    box.getCenter(center);
    center.multiplyScalar(scaleFactor);
    this.mesh.position.sub(center);

    this.group = new THREE.Group();
    this.group.add(this.mesh);

    this.mesh.rotation.y = Math.PI;

    const texture = await new THREE.TextureLoader().loadAsync('assets/models/rafale/Rafale_texture.png');
    texture.flipY = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    this.mesh.traverse((child) => {
      if (child.isMesh && child.material && child.material.map) {
        child.material.map = texture;
        child.material.needsUpdate = true;
      }
      // The airframe darkens under and inside the clouds and in the shade of
      // the relief (their shadows scale the direct light) and casts its own
      // shadow; the lights and the exhaust, added below, glow on
      if (child.isMesh) {
        child.receiveShadow = child.castShadow = true;
        child.layers.enable(SHADOW_CASTER_LAYER);
      }
    });

    const hiddenGearParts = new Set([
      'GearBoxRear',
      'GearBoxFront',
      'WheelL',
      'WheelR',
      'NoseWheelL',
      'NoseWheelR',
      'UpperStrutL',
      'UpperStrutR',
      'MainStrutL',
      'MainStrutR',
      'SideStrutL',
      'SideStrutR',
      'Strut1L',
      'Strut1R',
      'Strut2L',
      'Strut2R',
      'Strut3L',
      'Strut3R',
      'FrontMainStrut',
      'FrontLowerStrut',
      'FrontStrut1',
      'FrontStrut2',
      'FrontLights',
    ]);
    this.mesh.traverse((child) => {
      if (hiddenGearParts.has(child.name)) child.visible = false;
    });

    this.lights = new AircraftLights(this.mesh, this.rendering);
    this.exhaust = new EngineExhaust(this.mesh, this.rendering);
    this.surfaces = new ControlSurfaces(this.mesh);

    this.group.traverse((child) => {
      child.frustumCulled = false;
    });

    this.scene.add(this.group);
    this.ready = true;
    Logger.info(
      'Aircraft',
      `Rafale loaded — scaled ${scaleFactor.toFixed(2)}x (${size.x.toFixed(1)}×${size.y.toFixed(1)}×${size.z.toFixed(1)} → ${AIRCRAFT_TARGET_LENGTH}m)`,
    );
  }

  update(state, dt) {
    if (!this.ready) return;

    const { position, roll, yawRate, pitchRate, quaternion } = state;

    // Smooth visual roll and pitch (cosmetic tilt on the mesh)
    const targetRoll = Math.max(-VISUAL_ROLL_MAX, Math.min(VISUAL_ROLL_MAX, yawRate * VISUAL_ROLL_FACTOR));
    const targetPitch = Math.max(-VISUAL_PITCH_MAX, Math.min(VISUAL_PITCH_MAX, pitchRate * VISUAL_PITCH_FACTOR));
    const t = Math.min(1, VISUAL_SMOOTH * dt);
    this._visualRoll += (targetRoll - this._visualRoll) * t;
    this._visualPitch += (targetPitch - this._visualPitch) * t;

    // Start from base quaternion orientation
    this.group.position.copy(position);
    this.group.quaternion.copy(quaternion);

    // Apply roll + visual roll around local Z axis
    this._qRoll.setFromAxisAngle(this._axisZ, roll + this._visualRoll);
    this.group.quaternion.multiply(this._qRoll);

    // Apply visual pitch around local X axis
    this._qVisualPitch.setFromAxisAngle(this._axisX, this._visualPitch);
    this.group.quaternion.multiply(this._qVisualPitch);

    // Control surfaces as the flight control system moves them, neutral in free flight
    this.surfaces.update(dt, state.model ? state.model.surfaces : null);

    this._updateEngines(state, dt);
    exhaustJet(this.engines.core, this.engines.reheat, this.engines.mach, this.jet);
    this.exhaust.update(dt, this.engines, this.jet);
    const { camera, renderer } = this.rendering;
    renderer.getDrawingBufferSize(this._bufferSize);
    this.lights.update(dt, camera, this._bufferSize.y);
  }

  /**
   * Engines of the flight model; in the Exploration mode and along imposed
   * paths, full power while pushed forward, with the afterburner at high
   * speed, spooling at about the real engines' pace
   */
  _updateEngines(state, dt) {
    const engines = this.engines;
    if (state.engines) {
      Object.assign(engines, state.engines);
      return;
    }
    const core = state.thrust ? 1 : 0.3;
    const reheat = state.thrust && CONFIG.cameraSpeed >= AFTERBURNER_SPEED ? 1 : 0;
    const rate = Math.min(1, dt / EXPLORATION_SPOOL_TIME);
    engines.core += (core - engines.core) * rate;
    engines.reheat += (Math.min(reheat, engines.core) - engines.reheat) * rate;
    engines.mach = state.thrust ? CONFIG.cameraSpeed / SPEED_OF_SOUND : 0.3;
    engines.running = true;
  }

  setVisible(visible) {
    if (this.ready) this.group.visible = visible;
  }
}
