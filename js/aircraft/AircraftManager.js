import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import Logger from '../utils/Logger.js';

const VISUAL_ROLL_FACTOR = 120;
const VISUAL_ROLL_MAX = 1.57;
const VISUAL_PITCH_FACTOR = 15;
const VISUAL_PITCH_ANGLE_FACTOR = 1.0;
const VISUAL_PITCH_MAX = 0.4;
const VISUAL_SMOOTH = 5;

export default class AircraftManager {
  constructor(scene) {
    this.scene = scene;
    this.mesh = null;
    this.ready = false;

    this._visualRoll = 0;
    this._visualPitch = 0;

    this._aircraftEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  }

  async load(url) {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    this.mesh = gltf.scene;

    const box = new THREE.Box3().setFromObject(this.mesh);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const targetLength = 15;
    const scaleFactor = targetLength / maxDim;
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

    const gearParts = new Set([
      'GearBoxRear', 'GearBoxFront',
      'DoorsRear1L', 'DoorsRear1R', 'DoorsRear2L', 'DoorsRear2R',
      'DoorsFront1', 'DoorsFront2R', 'DoorsFront2L',
      'WheelL', 'WheelR', 'NoseWheelL', 'NoseWheelR',
      'UpperStrutL', 'UpperStrutR', 'MainStrutL', 'MainStrutR',
      'SideStrutL', 'SideStrutR',
      'Strut1L', 'Strut1R', 'Strut2L', 'Strut2R', 'Strut3L', 'Strut3R',
      'FrontMainStrut', 'FrontLowerStrut', 'FrontStrut1', 'FrontStrut2',
      'FrontLights',
    ]);
    this.mesh.traverse((child) => {
      if (gearParts.has(child.name)) child.visible = false;
    });

    this.group.traverse((child) => { child.frustumCulled = false; });

    this.scene.add(this.group);
    this.ready = true;
    Logger.info('Aircraft', `Rafale loaded — scaled ${scaleFactor.toFixed(2)}x (${size.x.toFixed(1)}×${size.y.toFixed(1)}×${size.z.toFixed(1)} → ${targetLength}m)`);
  }

  update(state, dt) {
    if (!this.ready) return;

    const { position, yaw, pitch, roll, yawRate, pitchRate } = state;

    // Smooth visual roll and pitch (cosmetic tilt on the mesh)
    const targetRoll = Math.max(-VISUAL_ROLL_MAX, Math.min(VISUAL_ROLL_MAX, yawRate * VISUAL_ROLL_FACTOR));
    const ratePitch = pitchRate * VISUAL_PITCH_FACTOR;
    const anglePitch = pitch * VISUAL_PITCH_ANGLE_FACTOR;
    const targetPitch = Math.max(-VISUAL_PITCH_MAX, Math.min(VISUAL_PITCH_MAX, ratePitch + anglePitch));
    const t = Math.min(1, VISUAL_SMOOTH * dt);
    this._visualRoll += (targetRoll - this._visualRoll) * t;
    this._visualPitch += (targetPitch - this._visualPitch) * t;

    this._aircraftEuler.set(pitch + this._visualPitch, yaw, roll + this._visualRoll, 'YXZ');
    this.group.position.copy(position);
    this.group.rotation.copy(this._aircraftEuler);
  }

  setVisible(visible) {
    if (this.ready) this.group.visible = visible;
  }
}
