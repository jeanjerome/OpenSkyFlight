import * as THREE from 'three';
import SpringScalar from './SpringScalar.js';
import {
  BOOM_DISTANCE,
  BOOM_HEIGHT,
  STIFFNESS_YAW,
  STIFFNESS_PITCH,
  STIFFNESS_ROLL,
  FOLLOW_YAW,
  FOLLOW_PITCH,
  FOLLOW_ROLL,
} from '../constants/camera.js';

export default class ChaseCameraController {
  constructor() {
    this.yawFollower = new SpringScalar(0, true);
    this.pitchFollower = new SpringScalar(0, false);
    this.rollFollower = new SpringScalar(0, false);

    this._needsInit = true;

    // Reusable objects
    this._offset = new THREE.Vector3();
    this._quat = new THREE.Quaternion();
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
  }

  reset() {
    this._needsInit = true;
  }

  update(state, camera, dt) {
    if (this._needsInit) {
      this._initFromState(state);
      this._needsInit = false;
    }

    // 1. Update angular followers (springs on yaw/pitch/roll only)
    this.yawFollower.update(state.yaw * FOLLOW_YAW, STIFFNESS_YAW, 0, dt);
    this.pitchFollower.update(state.pitch * FOLLOW_PITCH, STIFFNESS_PITCH, 0, dt);
    this.rollFollower.update(state.roll * FOLLOW_ROLL, STIFFNESS_ROLL, 0, dt);

    // 2. Compute boom offset using sprung yaw + full aircraft pitch for elevation
    this._euler.set(state.pitch, this.yawFollower.value, 0, 'YXZ');
    this._quat.setFromEuler(this._euler);
    this._offset.set(0, BOOM_HEIGHT, BOOM_DISTANCE);
    this._offset.applyQuaternion(this._quat);

    // 3. Camera position: rigid attachment to aircraft + sprung offset
    camera.position.copy(state.position).add(this._offset);

    // 4. Camera rotation from sprung angles
    camera.rotation.order = 'YXZ';
    camera.rotation.set(this.pitchFollower.value, this.yawFollower.value, this.rollFollower.value);
  }

  _initFromState(state) {
    this.yawFollower.reset(state.yaw * FOLLOW_YAW);
    this.pitchFollower.reset(state.pitch * FOLLOW_PITCH);
    this.rollFollower.reset(state.roll * FOLLOW_ROLL);
  }
}
