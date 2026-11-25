import * as THREE from 'three';
import { CONFIG } from '../utils/config.js';
import { RATE_DAMP_FACTOR, INITIAL_PITCH } from '../constants/camera.js';

/**
 * Exploration mode: free flight with no physics, to travel fast and set up
 * views. The aircraft turns as the mouse or the stick moves (yaw and pitch,
 * full loops allowed) and moves along its nose at the Speed setting while
 * flying forward, or sideways on the horizontal plane; nothing stops it at the
 * ground.
 *
 * Turns are applied once a frame from the control commands, motion at every
 * simulation step. The turn rates of the commands, damped over time, drive the
 * banking of the model and of the view.
 */
export default class ExplorationFlight {
  /** @param {import('./AircraftState.js').default} aircraft */
  constructor(aircraft) {
    this.aircraft = aircraft;
    /** Off while the autopilot or the benchmark fly the aircraft */
    this.enabled = true;
    this.yaw = 0;
    this.pitch = INITIAL_PITCH;
    this.yawRate = 0;
    this.pitchRate = 0;
    this._forward = 0;
    this._strafe = 0;

    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this._nose = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._orient();
    aircraft.settle();
  }

  get position() {
    return this.aircraft.position;
  }

  /** Whether the aircraft is pushed forward */
  get thrusting() {
    return this.enabled && this._forward > 0;
  }

  /**
   * Turn to an orientation at once, without interpolation from the previous one
   * @param {number} yaw - rad, 0 = north, positive to the west
   * @param {number} pitch - rad, positive nose up
   */
  setOrientation(yaw, pitch) {
    this.yaw = yaw;
    this.pitch = pitch;
    this._orient();
    this.aircraft.settle();
  }

  /** Jump to a pose, without interpolation from the previous one */
  teleport(position, yaw = this.yaw, pitch = this.pitch) {
    this.aircraft.position.copy(position);
    this.aircraft.velocity.set(0, 0, 0);
    this.setOrientation(yaw, pitch);
  }

  /**
   * Turn with this frame's commands
   * @param {import('../input/ControlInputs.js').default['commands']} commands
   * @param {number} dt - frame time (s)
   */
  applyControls(commands, dt) {
    if (this.enabled) {
      this.yaw += commands.lookYaw;
      this.pitch += commands.lookPitch;
      if (commands.yawRate !== null) this.yawRate = commands.yawRate;
      if (commands.pitchRate !== null) this.pitchRate = commands.pitchRate;
      this._forward = commands.forward;
      this._strafe = commands.strafe;
    }
    const damping = Math.max(0, 1 - RATE_DAMP_FACTOR * dt);
    this.yawRate *= damping;
    this.pitchRate *= damping;
  }

  /** Advance one simulation step */
  step(dt) {
    if (!this.enabled) return;
    const aircraft = this.aircraft;
    aircraft.beginStep();
    this._orient();

    // Nose direction for forward, horizontal right for sideways; full speed
    // whatever the mix of the two, partial speed for a partial command
    const nose = this._nose.set(0, 0, -1).applyQuaternion(aircraft.quaternion);
    const right = this._right.set(1, 0, 0).applyQuaternion(aircraft.quaternion);
    const f = this._forward;
    const s = this._strafe;
    let mx = nose.x * f + right.x * s;
    let my = nose.y * f;
    let mz = nose.z * f + right.z * s;
    const length = Math.hypot(mx, my, mz);
    if (length > 0) {
      const speed = (CONFIG.cameraSpeed * Math.min(1, Math.hypot(f, s))) / length;
      mx *= speed;
      my *= speed;
      mz *= speed;
    }
    aircraft.velocity.set(mx, my, mz);
    aircraft.position.addScaledVector(aircraft.velocity, dt);
  }

  _orient() {
    this._euler.set(this.pitch, this.yaw, 0, 'YXZ');
    this.aircraft.quaternion.setFromEuler(this._euler);
    this.aircraft.yaw = this.yaw;
    this.aircraft.pitch = this.pitch;
  }
}
