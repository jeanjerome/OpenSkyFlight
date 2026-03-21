import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import Logger from '../utils/Logger.js';
import {
  AIRCRAFT_TARGET_LENGTH,
  VISUAL_ROLL_FACTOR,
  VISUAL_ROLL_MAX,
  VISUAL_PITCH_FACTOR,
  VISUAL_PITCH_ANGLE_FACTOR,
  VISUAL_PITCH_MAX,
  VISUAL_SMOOTH,
} from '../constants/aircraft.js';

export default class AircraftManager {
  constructor(scene) {
    this.scene = scene;
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

    const { position, pitch, roll, yawRate, pitchRate, quaternion } = state;

    // Smooth visual roll and pitch (cosmetic tilt on the mesh)
    const targetRoll = Math.max(-VISUAL_ROLL_MAX, Math.min(VISUAL_ROLL_MAX, yawRate * VISUAL_ROLL_FACTOR));
    const ratePitch = pitchRate * VISUAL_PITCH_FACTOR;
    const anglePitch = pitch * VISUAL_PITCH_ANGLE_FACTOR;
    const targetPitch = Math.max(-VISUAL_PITCH_MAX, Math.min(VISUAL_PITCH_MAX, ratePitch + anglePitch));
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
  }

  setVisible(visible) {
    if (this.ready) this.group.visible = visible;
  }
}
