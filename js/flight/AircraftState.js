import * as THREE from 'three';

/**
 * State of the player's aircraft, advanced at the fixed steps of the
 * simulation by whichever model flies it, and read by the camera, the model,
 * the HUD and the map through an interpolated pose.
 *
 * World frame: metres, y up, x east, -z north at the map centre. Body frame
 * (three.js convention): x right, y up, -z forward. `yaw` and `pitch` are the
 * angles of the YXZ Euler decomposition of the orientation, kept as scalars so
 * that the yaw keeps counting past ±π.
 */
export default class AircraftState {
  constructor() {
    this.position = new THREE.Vector3();
    /** World velocity (m/s) */
    this.velocity = new THREE.Vector3();
    /** Body to world rotation */
    this.quaternion = new THREE.Quaternion();
    this.yaw = 0;
    this.pitch = 0;

    this._previous = {
      position: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
      yaw: 0,
      pitch: 0,
    };
  }

  /** Keep the current state as the start of the step about to run */
  beginStep() {
    const p = this._previous;
    p.position.copy(this.position);
    p.quaternion.copy(this.quaternion);
    p.yaw = this.yaw;
    p.pitch = this.pitch;
  }

  /** Forget the previous step: the pose jumped (teleport), nothing to interpolate */
  settle() {
    this.beginStep();
  }

  /**
   * Pose between the previous and the current step.
   * @param {number} alpha - fraction of the step, from the simulation clock
   * @param {{position: THREE.Vector3, quaternion: THREE.Quaternion, yaw: number, pitch: number}} out
   */
  interpolate(alpha, out) {
    const p = this._previous;
    out.position.lerpVectors(p.position, this.position, alpha);
    out.quaternion.slerpQuaternions(p.quaternion, this.quaternion, alpha);
    out.yaw = p.yaw + (this.yaw - p.yaw) * alpha;
    out.pitch = p.pitch + (this.pitch - p.pitch) * alpha;
    return out;
  }
}
