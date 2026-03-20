import * as THREE from 'three';
import SpringScalar from './SpringScalar.js';
import {
  BOOM_DISTANCE,
  BOOM_HEIGHT,
  STIFFNESS_YAW,
  STIFFNESS_PITCH,
  FOLLOW_YAW,
} from '../constants/camera.js';

export default class ChaseCameraController {
  constructor() {
    this.yawFollower = new SpringScalar(0, true);
    this.pitchFollower = new SpringScalar(0, false);

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

    // 1. Update angular followers (springs on yaw/pitch)
    this.yawFollower.update(state.yaw * FOLLOW_YAW, STIFFNESS_YAW, 0, dt);
    this.pitchFollower.update(state.pitch, STIFFNESS_PITCH, 0, dt);

    // 2. Boom quaternion from sprung angles (gimbal-lock free)
    this._euler.set(this.pitchFollower.value, this.yawFollower.value, 0, 'YXZ');
    this._quat.setFromEuler(this._euler);

    // 3. Boom offset rotated by quaternion
    this._offset.set(0, BOOM_HEIGHT, BOOM_DISTANCE);
    this._offset.applyQuaternion(this._quat);

    // 4. Camera position: aircraft + boom offset
    camera.position.copy(state.position).add(this._offset);

    // 5. Camera looks forward (same direction as aircraft) via boom quaternion
    //    No gimbal lock: Euler→Quaternion is always well-defined
    camera.quaternion.copy(this._quat);
  }

  _initFromState(state) {
    this.yawFollower.reset(state.yaw * FOLLOW_YAW);
    this.pitchFollower.reset(state.pitch);
  }
}
