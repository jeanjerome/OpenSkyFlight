import * as THREE from 'three';
import { STIFFNESS_ATTACHED } from '../constants/camera.js';

const DEG = Math.PI / 180;

/** Distance from the aircraft at which the view opens (m), and its range */
const START_DISTANCE = 18;
const MIN_DISTANCE = 8;
const MAX_DISTANCE = 150;

/** Angles at which the view opens: from behind, to the right and a little above (rad) */
const START_YAW = 35 * DEG;
const START_PITCH = 10 * DEG;

/** Steepest view from above or below (rad) */
const MAX_PITCH = 85 * DEG;

/** Distance aft of the aircraft's centre the view looks at (m): between the airframe and its flame */
const TARGET_AFT = 3;

/** Distance change per wheel step (a factor per 100 pixels of scroll) */
const WHEEL_ZOOM = 1.12;

/** Lowest height of the camera above the ground (m) */
const GROUND_CLEARANCE = 2;

/**
 * Free exterior view: the camera turns around the aircraft at a chosen
 * heading, elevation and distance, in the aircraft's own frame (it rolls and
 * pitches with it, a little late, like the attached chase view), looking at a
 * point just aft of the aircraft so that the airframe and its exhaust share
 * the frame. Turned with the mouse or the gamepad's right stick, the distance
 * set with the wheel.
 */
export default class OrbitCameraController {
  /** @param {function(number, number): ?number} groundHeight - ground height at a world position, null if unknown */
  constructor(groundHeight) {
    this.groundHeight = groundHeight;
    this.yaw = START_YAW;
    this.pitch = START_PITCH;
    this.distance = START_DISTANCE;
    this._needsInit = true;
    this._frame = new THREE.Quaternion();
    this._offset = new THREE.Vector3();
    this._target = new THREE.Vector3();
    this._up = new THREE.Vector3();
  }

  /** Follow the aircraft's orientation afresh (on entering the view) */
  reset() {
    this._needsInit = true;
  }

  /**
   * @param {{yaw: number, pitch: number, zoom: number}} turn - turn of the view this frame, as a
   *   look around (rad; positive yaw looks left, so the camera swings to the aircraft's right;
   *   positive pitch looks up, so the camera goes lower) and wheel scroll (pixels, positive away)
   */
  turn({ yaw, pitch, zoom }) {
    this.yaw += yaw;
    this.pitch = THREE.MathUtils.clamp(this.pitch - pitch, -MAX_PITCH, MAX_PITCH);
    if (zoom) {
      this.distance = THREE.MathUtils.clamp(
        this.distance * Math.pow(WHEEL_ZOOM, zoom / 100),
        MIN_DISTANCE,
        MAX_DISTANCE,
      );
    }
  }

  /**
   * @param {{position: THREE.Vector3, quaternion: THREE.Quaternion}} state
   * @param {THREE.Camera} camera
   * @param {number} dt - s
   */
  update(state, camera, dt) {
    if (this._needsInit) {
      this._frame.copy(state.quaternion);
      this._needsInit = false;
    }
    this._frame.slerp(state.quaternion, 1 - Math.exp(-STIFFNESS_ATTACHED * dt));

    // Aircraft frame: x right, y up, z aft (the nose looks down −z)
    this._target.set(0, 0, TARGET_AFT).applyQuaternion(this._frame).add(state.position);
    this._offset
      .set(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch))
      .multiplyScalar(this.distance)
      .applyQuaternion(this._frame);
    camera.position.copy(this._target).add(this._offset);

    const ground = this.groundHeight(camera.position.x, camera.position.z);
    if (ground !== null && camera.position.y < ground + GROUND_CLEARANCE) camera.position.y = ground + GROUND_CLEARANCE;

    camera.up.copy(this._up.set(0, 1, 0).applyQuaternion(this._frame));
    camera.lookAt(this._target);
    camera.up.set(0, 1, 0);
  }
}
