import * as THREE from 'three';
import FlightModel from './FlightModel.js';
import MouseAim from './MouseAim.js';
import { DRY_DETENT } from './Engines.js';
import { INTERNAL_FUEL } from '../constants/rafale.js';

/** Speed given to the aircraft when the Simulation mode starts or restarts (m/s, ≈ 430 kt) */
export const ENTRY_SPEED = 220;

/** Throttle lever position given at the start: cruise power */
export const ENTRY_LEVER = 0.62;

/** Lever travel per second with the throttle key held or the trigger fully pressed */
const LEVER_RATE = 0.5;

/** Time for a keyboard stick to reach full deflection (s): keys do not slam the stick */
const KEY_STICK_TIME = 0.3;

/** Time for it to come back to neutral when the key is released (s) */
const KEY_RELEASE_TIME = 0.08;

/** Height above the ground below which the aircraft has crashed (m), until the landing gear exists */
const CRASH_HEIGHT = 1;

/**
 * Simulation mode: the aircraft flies by its flight model (FlightModel).
 *
 * Steering: the mouse moves an aim the instructor flies the nose to
 * (MouseAim); the keys and the gamepad move the stick directly, and while
 * they do the aim follows the nose. The throttle lever moves while W/S or the
 * triggers are held; it stops at full dry power, and a new press goes on
 * into the afterburner. Space or the B button opens the airbrake; G or the
 * X button lowers or raises the landing gear.
 *
 * Until the landing gear and the ground physics exist, touching the ground is
 * a crash: `onCrash` is called and the flight restarts above that point.
 */
export default class SimulatedFlight {
  /**
   * @param {import('./AircraftState.js').default} aircraft
   * @param {(x: number, z: number) => number|null} groundHeight
   */
  constructor(aircraft, groundHeight) {
    this.aircraft = aircraft;
    this.groundHeight = groundHeight;
    this.model = new FlightModel();
    this.aim = new MouseAim();
    /** Off while the autopilot or the benchmark fly the aircraft */
    this.enabled = true;
    /** Cosmetic turn rates of the Exploration mode: the airframe here banks for real */
    this.yawRate = 0;
    this.pitchRate = 0;
    /** Whether the aim leads (mouse) or follows the nose (keys, gamepad) */
    this.aiming = true;
    /** Called when the aircraft hits the ground, with its position */
    this.onCrash = null;

    this._stick = { pitch: 0, roll: 0, yaw: 0 };
    this._keyStick = { pitch: 0, roll: 0 };
    this._detentFree = false;
    this._throttleHeld = false;
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this._quaternion = new THREE.Quaternion();
    this._nose = new THREE.Vector3();
  }

  get position() {
    return this.aircraft.position;
  }

  get yaw() {
    return this.aircraft.yaw;
  }

  get pitch() {
    return this.aircraft.pitch;
  }

  /** Whether the engines push: above idle */
  get thrusting() {
    return this.model.engines.core > 0.05;
  }

  /**
   * Start flying from a pose: trimmed along the nose at a speed, wings level
   * @param {THREE.Vector3} position
   * @param {number} yaw - rad, 0 = north, positive to the west
   * @param {number} pitch - rad, positive nose up
   * @param {number} [speed] - m/s
   */
  teleport(position, yaw = this.aircraft.yaw, pitch = this.aircraft.pitch, speed = ENTRY_SPEED) {
    this._euler.set(pitch, yaw, 0, 'YXZ');
    this._quaternion.setFromEuler(this._euler);
    const model = this.model;
    model.fuel = INTERNAL_FUEL;
    model.reset(position, this._quaternion, speed, ENTRY_LEVER);
    this._detentFree = false;
    this.aim.syncTo(model.quaternion);
    this._publish(true);
  }

  /**
   * Read this frame's commands
   * @param {import('../input/ControlInputs.js').default['commands']} commands
   * @param {number} dt - frame time (s)
   */
  applyControls(commands, dt) {
    if (!this.enabled) return;
    const f = commands.flight;
    const model = this.model;

    // Keyboard and gamepad stick, eased in so that a key does not slam it
    const ease = (target, current) =>
      current +
      (target - current) * Math.min(1, dt / (Math.abs(target) < Math.abs(current) ? KEY_RELEASE_TIME : KEY_STICK_TIME));
    this._keyStick.pitch = ease(f.pitch, this._keyStick.pitch);
    this._keyStick.roll = ease(f.roll, this._keyStick.roll);
    this._stick.yaw = f.yaw;

    if (f.aimYaw || f.aimPitch) {
      this.aiming = true;
      this.aim.move(f.aimYaw, f.aimPitch);
    }
    if (f.direct) this.aiming = false;

    // Throttle lever with a detent at full dry power
    const lever = model.controls.lever;
    let next = Math.min(1, Math.max(0, lever + f.throttle * LEVER_RATE * dt));
    if (lever <= DRY_DETENT && next > DRY_DETENT && !this._detentFree) next = DRY_DETENT;
    if (f.throttle <= 0 && lever >= DRY_DETENT - 1e-6) this._detentFree = true;
    if (next < DRY_DETENT) this._detentFree = false;
    model.controls.lever = next;
    model.controls.airbrake = f.airbrake ? 1 : 0;
  }

  /**
   * Commands the landing gear the other way
   * @returns {boolean} whether it is now commanded down
   */
  toggleGear() {
    const controls = this.model.controls;
    controls.gear = !controls.gear;
    return controls.gear;
  }

  /** Advance one simulation step */
  step(dt) {
    if (!this.enabled) return;
    const model = this.model;
    this.aircraft.beginStep();

    // Direct stick where a key or the gamepad moves it, the instructor elsewhere
    const stick = this._stick;
    const keys = this._keyStick;
    if (this.aiming) {
      this.aim.steer(model, stick);
      if (Math.abs(keys.pitch) > 0.02) stick.pitch = keys.pitch;
      if (Math.abs(keys.roll) > 0.02) stick.roll = keys.roll;
    } else {
      stick.pitch = keys.pitch;
      stick.roll = keys.roll;
      this.aim.syncTo(model.quaternion);
    }
    model.controls.pitch = stick.pitch;
    model.controls.roll = stick.roll;
    model.controls.yaw = stick.yaw;

    model.step(dt);
    this._publish(false);

    const ground = this.groundHeight(model.position.x, model.position.z);
    if (ground !== null && model.position.y < ground + CRASH_HEIGHT) {
      const at = model.position.clone();
      this.onCrash?.(at, ground);
    }
  }

  /** Copy the model's state to the aircraft state the rest of the app reads */
  _publish(settle) {
    const model = this.model;
    const aircraft = this.aircraft;
    aircraft.position.copy(model.position);
    aircraft.velocity.copy(model.velocity);
    aircraft.quaternion.copy(model.quaternion);
    // Heading and pitch of the nose; the heading keeps counting past ±π
    const nose = this._nose.set(0, 0, -1).applyQuaternion(model.quaternion);
    const yaw = Math.atan2(-nose.x, -nose.z);
    let turn = yaw - aircraft.yaw;
    turn -= 2 * Math.PI * Math.round(turn / (2 * Math.PI));
    aircraft.yaw = settle ? yaw : aircraft.yaw + turn;
    aircraft.pitch = Math.asin(Math.max(-1, Math.min(1, nose.y)));
    if (settle) aircraft.settle();
  }
}
