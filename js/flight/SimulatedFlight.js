import * as THREE from 'three';
import FlightModel from './FlightModel.js';
import MouseAim from './MouseAim.js';
import { DRY_DETENT } from './Engines.js';
import { groundStrike } from './GroundStrike.js';
import { GEAR_LEGS, INTERNAL_FUEL, TOUCHDOWN_SINK_LIMIT } from '../constants/rafale.js';

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

/**
 * Autopilot: time over which it closes an altitude gap at the current speed
 * (s), and the steepest climb or descent it flies (rad)
 */
const AUTOPILOT_ALTITUDE_TIME = 20;
const AUTOPILOT_PATH_MAX = (8 * Math.PI) / 180;

/** Stick or aim input that disconnects the autopilot */
const AUTOPILOT_OVERRIDE = 0.05;

/** Height of the centre of gravity above the ground with the wheels just touching (m) */
const WHEELS_HEIGHT = -Math.min(...GEAR_LEGS.map((leg) => leg.position[1]));

/**
 * Simulation mode: the aircraft flies by its flight model (FlightModel).
 *
 * Steering: the mouse moves an aim the instructor flies the nose to
 * (MouseAim); the keys and the gamepad move the stick directly, and while
 * they do the aim follows the nose. The throttle lever moves while W/S or the
 * triggers are held; it stops at full dry power, and a new press goes on
 * into the afterburner. Space or the B button opens the airbrake and, on the
 * ground, brakes the wheels; G or the X button lowers or raises the landing
 * gear. On the ground the mouse aim steers the nose wheel towards the aim and
 * keeps the wings level. The autopilot (C) holds the heading and the
 * altitude it was engaged at, through the mouse aim's instructor; moving the
 * stick or the aim disconnects it.
 *
 * The wheels carry the aircraft (FlightModel, GearContact). A wheel touching
 * down faster than the gear takes, or any other part of the airframe touching
 * the ground, is a crash: the flight stops where it is and `onCrash` is called
 * with what happened, until it restarts (teleport, placeOnGround).
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
    this.model.groundHeight = groundHeight;
    this.aim = new MouseAim();
    /** Off while the autopilot or the benchmark fly the aircraft */
    this.enabled = true;
    /** Cosmetic turn rates of the Exploration mode: the airframe here banks for real */
    this.yawRate = 0;
    this.pitchRate = 0;
    /** Whether the aim leads (mouse) or follows the nose (keys, gamepad) */
    this.aiming = true;
    /**
     * Called when the aircraft crashes, with what happened: the part that hit
     * the ground ('wheels' for a touchdown too hard, or nose, belly, tail,
     * wingtip, top), the vertical speed of the impact (m/s), the airspeed
     * (m/s), whether the gear was down
     * @type {((crash: {part: string, sink: number, speed: number, gearDown: boolean}) => void)|null}
     */
    this.onCrash = null;
    /** The crash the flight stopped at, null while flying */
    this.crash = null;
    /** Where the flight last started on the ground, to restart there: {x, z, yaw} */
    this.groundStart = null;
    /** Standing still, waiting for the ground to load before placeOnGround */
    this.holding = false;
    /** Heading (rad, 0 north, positive west) and altitude (m) held by the autopilot; null when off */
    this.autopilot = null;
    /** Called when the autopilot disconnects itself (stick input, touchdown) */
    this.onAutopilotOff = null;

    this._stick = { pitch: 0, roll: 0, yaw: 0 };
    this._rudder = 0;
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
    this.crash = null;
    this.holding = false;
    this.autopilot = null;
    this.aim.syncTo(model.quaternion);
    this._publish(true);
  }

  /**
   * Stand still at a position, gear down, until placeOnGround: while the
   * ground there loads
   * @param {THREE.Vector3} position
   * @param {number} yaw - heading (rad, 0 = north, positive to the west)
   */
  hold(position, yaw) {
    this._euler.set(0, yaw, 0, 'YXZ');
    this._quaternion.setFromEuler(this._euler);
    this.model.reset(position, this._quaternion, 0, 0, true);
    this.crash = null;
    this.autopilot = null;
    this.holding = true;
    this.aim.syncTo(this.model.quaternion);
    this._publish(true);
  }

  /**
   * Read this frame's commands
   * @param {import('../input/ControlInputs.js').default['commands']} commands
   * @param {number} dt - frame time (s)
   */
  applyControls(commands, dt) {
    if (!this.enabled || this.crash || this.holding) return;
    const f = commands.flight;
    const model = this.model;

    // Keyboard and gamepad stick, eased in so that a key does not slam it
    const ease = (target, current) =>
      current +
      (target - current) * Math.min(1, dt / (Math.abs(target) < Math.abs(current) ? KEY_RELEASE_TIME : KEY_STICK_TIME));
    this._keyStick.pitch = ease(f.pitch, this._keyStick.pitch);
    this._keyStick.roll = ease(f.roll, this._keyStick.roll);
    this._rudder = f.yaw;

    const input = Math.max(Math.abs(f.pitch), Math.abs(f.roll), Math.abs(f.yaw));
    if (this.autopilot && (input > AUTOPILOT_OVERRIDE || f.aimYaw || f.aimPitch)) this._autopilotOff();

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
    model.controls.brake = f.airbrake ? 1 : 0;
  }

  /**
   * Stand still on the ground, gear down, engines at idle, wings level
   * @param {number} x - world position (m)
   * @param {number} z
   * @param {number} yaw - heading (rad, 0 = north, positive to the west)
   * @returns {boolean} false where the ground is not loaded yet
   */
  placeOnGround(x, z, yaw = this.aircraft.yaw) {
    const ground = this.groundHeight(x, z);
    if (ground === null) return false;
    this._euler.set(0, yaw, 0, 'YXZ');
    this._quaternion.setFromEuler(this._euler);
    const model = this.model;
    model.fuel = INTERNAL_FUEL;
    model.reset(new THREE.Vector3(x, ground + WHEELS_HEIGHT, z), this._quaternion, 0, 0, true);
    this._detentFree = false;
    this.crash = null;
    this.autopilot = null;
    this.holding = false;
    this.groundStart = { x, z, yaw };
    this.aim.syncTo(model.quaternion);
    this._publish(true);
    return true;
  }

  /**
   * Engages the autopilot on the current heading and altitude, or disengages it
   * @returns {boolean} whether it is now engaged
   */
  toggleAutopilot() {
    if (this.autopilot) {
      this.autopilot = null;
      return false;
    }
    if (this.model.onGround) return false;
    this.autopilot = { heading: this.aircraft.yaw, altitude: this.model.position.y };
    this.aiming = true;
    return true;
  }

  _autopilotOff() {
    this.autopilot = null;
    this.onAutopilotOff?.();
  }

  /**
   * Commands the landing gear the other way; while the wheels carry the
   * aircraft the handle stays locked down
   * @returns {boolean|null} whether it is now commanded down, null when locked
   */
  toggleGear() {
    const controls = this.model.controls;
    if (controls.gear && this.model.onGround) return null;
    controls.gear = !controls.gear;
    return controls.gear;
  }

  /** Advance one simulation step */
  step(dt) {
    if (!this.enabled || this.crash || this.holding) return;
    const model = this.model;
    this.aircraft.beginStep();

    // The autopilot sets the aim: its heading, and the nose above the path that
    // closes the altitude gap by the angle of attack
    if (this.autopilot) {
      if (model.onGround) {
        this._autopilotOff();
      } else {
        const gap = this.autopilot.altitude - model.position.y;
        const path = Math.atan(gap / (Math.max(model.airspeed, 50) * AUTOPILOT_ALTITUDE_TIME));
        const clamped = Math.max(-AUTOPILOT_PATH_MAX, Math.min(AUTOPILOT_PATH_MAX, path));
        this.aim.set(this.autopilot.heading, clamped + model.alpha);
      }
    }

    // Direct stick where a key or the gamepad moves it, the instructor elsewhere
    const stick = this._stick;
    const keys = this._keyStick;
    stick.yaw = this._rudder;
    if (this.aiming) {
      if (model.onGround) {
        this.aim.steerOnGround(model, stick);
        if (Math.abs(this._rudder) > 0.02) stick.yaw = this._rudder;
      } else {
        this.aim.steer(model, stick);
      }
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

    const sink = model.wheels.touchdownSink;
    const strike = sink > TOUCHDOWN_SINK_LIMIT ? { part: 'wheels', sink } : groundStrike(model, this.groundHeight);
    if (strike) {
      this.crash = { ...strike, speed: model.airspeed, gearDown: model.gear.downLocked };
      this.onCrash?.(this.crash);
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
