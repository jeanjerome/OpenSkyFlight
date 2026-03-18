import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import Logger from '../utils/Logger.js';

const CHASE_DISTANCE = 30;
const CHASE_HEIGHT = 8;
const VISUAL_ROLL_FACTOR = 25;   // how much yawRate translates to visual bank
const VISUAL_ROLL_MAX = 0.8;     // max bank angle (radians, ~45°)
const VISUAL_PITCH_FACTOR = 15;  // how much pitchRate translates to visual pitch
const VISUAL_PITCH_MAX = 0.4;    // max extra pitch (radians, ~23°)
const VISUAL_SMOOTH = 5;         // lerp speed for visual rotations

export default class AircraftManager {
  constructor(scene) {
    this.scene = scene;
    this.mesh = null;
    this.ready = false;

    // Smoothed visual rotations (extra tilt on top of base orientation)
    this._visualRoll = 0;
    this._visualPitch = 0;

    // Reusable objects
    this._offset = new THREE.Vector3();
    this._quat = new THREE.Quaternion();
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this._aircraftEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  }

  async load(url) {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    this.mesh = gltf.scene;

    // Normalize scale: real Rafale is ~15m long
    const box = new THREE.Box3().setFromObject(this.mesh);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const targetLength = 15;
    const scaleFactor = targetLength / maxDim;
    this.mesh.scale.setScalar(scaleFactor);

    // Center the mesh on its bounding box
    const center = new THREE.Vector3();
    box.getCenter(center);
    center.multiplyScalar(scaleFactor);
    this.mesh.position.sub(center);

    // Wrap in a group so we can position/rotate the group cleanly
    this.group = new THREE.Group();
    this.group.add(this.mesh);

    // The GLTF model may face +Z; rotate 180° so nose points -Z (Three.js forward)
    this.mesh.rotation.y = Math.PI;

    // Replace the embedded texture with the custom one
    const texture = await new THREE.TextureLoader().loadAsync('assets/models/rafale/Rafale_texture.png');
    texture.flipY = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    this.mesh.traverse((child) => {
      if (child.isMesh && child.material && child.material.map) {
        child.material.map = texture;
        child.material.needsUpdate = true;
      }
    });

    // Hide landing gear parts (gear boxes, doors, wheels, struts, lights)
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

    // Disable frustum culling so the model never disappears
    this.group.traverse((child) => { child.frustumCulled = false; });

    this.scene.add(this.group);
    this.ready = true;
    Logger.info('Aircraft', `Rafale loaded — scaled ${scaleFactor.toFixed(2)}x (${size.x.toFixed(1)}×${size.y.toFixed(1)}×${size.z.toFixed(1)} → ${targetLength}m)`);
  }

  update(aircraftPos, yaw, pitch, roll, yawRate, pitchRate, camera, dt) {
    if (!this.ready) return;

    // Smooth visual roll (bank into turns) and pitch (nose up/down)
    const targetRoll = Math.max(-VISUAL_ROLL_MAX, Math.min(VISUAL_ROLL_MAX, yawRate * VISUAL_ROLL_FACTOR));
    const targetPitch = Math.max(-VISUAL_PITCH_MAX, Math.min(VISUAL_PITCH_MAX, pitchRate * VISUAL_PITCH_FACTOR));
    const t = Math.min(1, VISUAL_SMOOTH * dt);
    this._visualRoll += (targetRoll - this._visualRoll) * t;
    this._visualPitch += (targetPitch - this._visualPitch) * t;

    // Aircraft gets base orientation + extra visual tilt
    this._aircraftEuler.set(pitch + this._visualPitch, yaw, roll + this._visualRoll, 'YXZ');
    this.group.position.copy(aircraftPos);
    this.group.rotation.copy(this._aircraftEuler);

    // Chase cam offset uses base orientation (no visual tilt)
    this._euler.set(pitch, yaw, 0, 'YXZ');
    this._offset.set(0, CHASE_HEIGHT, CHASE_DISTANCE);
    this._quat.setFromEuler(this._euler);
    this._offset.applyQuaternion(this._quat);

    // Camera: rigid position, level horizon (no roll)
    camera.position.copy(aircraftPos).add(this._offset);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(pitch, yaw, 0);
  }
}
