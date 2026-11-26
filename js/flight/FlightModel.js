import * as THREE from 'three';
import { isa, SEA_LEVEL_DENSITY } from '../sim/atmosphere.js';
import { alphaForLift, dragCoefficient, liftCoefficient } from './aerodynamics.js';
import Engines from './Engines.js';
import GearSequence from './GearSequence.js';
import {
  AIRBRAKE_DRAG,
  ALPHA_MAX,
  ALPHA_MIN,
  ANGULAR_ACCELERATION_MAX,
  BASIC_MASS,
  GEAR_DRAG,
  INTERNAL_FUEL,
  LOAD_FACTOR_MAX,
  LOAD_FACTOR_MIN,
  PITCH_RESPONSE_DAMPING,
  PITCH_RESPONSE_FREQUENCY,
  ROLL_RATE_FULL_PRESSURE,
  ROLL_RATE_MAX,
  ROLL_RESPONSE_TIME,
  SIDE_FORCE_SLOPE,
  SIDESLIP_MAX,
  STORES_MASS,
  WING_AREA,
} from '../constants/rafale.js';

/** Standard gravity (m/s²) */
export const G = 9.80665;

/** Gain closing the gap between the commanded and the actual angle of attack (1/s) */
const ALPHA_GAIN = 6;

/** Gain closing the gap between the commanded and the actual sideslip (1/s) */
const SIDESLIP_GAIN = 3;

/** Dynamic pressure from which the control surfaces have their full authority (Pa) */
const CONTROL_PRESSURE = 1500;

/** Largest turn rate of the flight path followed by the airframe (rad/s) */
const PATH_RATE_MAX = 2;

/** Gain bringing the flight path back to the angle held at neutral stick (1/s) */
const PATH_HOLD_GAIN = 0.6;

/** Stick deflection below which the stick is neutral */
const STICK_NEUTRAL = 0.02;

/** Steepest flight path the neutral stick holds (rad): near the vertical the bank is meaningless */
const PATH_HOLD_MAX = (60 * Math.PI) / 180;

/** Bank angle up to which neutral stick keeps a level turn (rad) */
const LEVEL_TURN_BANK = Math.PI / 3;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * Flight model of the Rafale: a rigid body with six degrees of freedom.
 *
 * Translation is physical: lift, drag and side force from the aerodynamic
 * coefficients at the angle of attack, sideslip and Mach of the moment, thrust
 * of the engines, gravity, in the standard atmosphere; the mass falls as fuel
 * burns.
 *
 * Rotation is set by the fly-by-wire control system, as on the real aircraft
 * where the pilot commands a load factor and a roll rate and the computers
 * move the surfaces: the stick sets a load factor (neutral holds the flight
 * path angle it was released at, wings level or in a turn up to 60° of bank),
 * limited to +9 / −3.2 g and
 * 29° of angle of attack; the angle of attack follows the command with the
 * short-period response of a second-order system; the aircraft rolls about its
 * flight path at up to 270°/s (less below about 300 kt, with the square root
 * of the dynamic pressure); sideslip is held
 * at zero, or at the small angle commanded by the rudder at low speed. The
 * airframe turns with its flight path plus these corrections, within the
 * angular accelerations the surfaces can produce, and loses authority at low
 * dynamic pressure.
 *
 * Frames: world metres, y up; body x right, y up, −z forward.
 */
export default class FlightModel {
  constructor() {
    this.position = new THREE.Vector3();
    /** World velocity (m/s), no wind: also the air-relative velocity */
    this.velocity = new THREE.Vector3();
    /** Body to world rotation */
    this.quaternion = new THREE.Quaternion();
    /** Body angular velocity (rad/s): x pitch up, y yaw left, z roll left */
    this.angularVelocity = new THREE.Vector3();
    this.fuel = INTERNAL_FUEL;
    this.engines = new Engines();
    this.air = isa(0);

    /** Pilot commands: stick pitch (pull +), roll (right +), yaw (right +), throttle lever, airbrake, gear down */
    this.controls = { pitch: 0, roll: 0, yaw: 0, lever: 0.6, airbrake: 0, gear: false };
    this.gear = new GearSequence();

    // Flight data of the last step
    this.alpha = 0;
    this.beta = 0;
    this.mach = 0;
    /** True airspeed (m/s) */
    this.airspeed = 0;
    /** Equivalent airspeed (m/s), what the airspeed indicator shows */
    this.indicatedAirspeed = 0;
    this.dynamicPressure = 0;
    /** Load factor felt along the airframe's up axis (g) */
    this.loadFactor = 1;
    /** Highest load factor since the last reset (g) */
    this.peakLoadFactor = 1;
    this.commandedLoadFactor = 1;
    /** Flight path angle and bank angle (rad) */
    this.pathAngle = 0;
    this.bank = 0;
    /** Control surface deflections, normalized to [-1, 1] (see AircraftManager) */
    this.surfaces = { pitch: 0, roll: 0, yaw: 0, canard: 0, slat: 0, airbrake: 0 };

    this._alphaRef = 0;
    this._alphaRefRate = 0;
    this._rollRate = 0;
    /** Flight path angle held at neutral stick, null while the stick is moved */
    this._pathHold = null;

    this._qInv = new THREE.Quaternion();
    this._dq = new THREE.Quaternion();
    this._vb = new THREE.Vector3();
    this._vHat = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._nose = new THREE.Vector3();
    this._liftDir = new THREE.Vector3();
    this._sideDir = new THREE.Vector3();
    this._force = new THREE.Vector3();
    this._accel = new THREE.Vector3();
    this._pathRate = new THREE.Vector3();
    this._desired = new THREE.Vector3();
    this._axis = new THREE.Vector3();
  }

  /** Mass with the fuel left (kg) */
  get mass() {
    return BASIC_MASS + STORES_MASS + this.fuel;
  }

  /**
   * Start in trimmed flight along a path: the airframe is pitched up from the
   * path by the angle of attack that carries the weight
   * @param {THREE.Vector3} position
   * @param {THREE.Quaternion} quaternion - orientation of the flight path (nose along it, wings level or banked)
   * @param {number} speed - true airspeed (m/s)
   * @param {number} lever - throttle lever, 0 to 1
   * @param {boolean} [gearDown=false] - whether the gear is down and locked
   */
  reset(position, quaternion, speed, lever, gearDown = false) {
    this.position.copy(position);
    this.angularVelocity.set(0, 0, 0);
    const air = isa(position.y, this.air);
    const qS = 0.5 * air.density * speed * speed * WING_AREA;
    const mach = speed / air.speedOfSound;
    const alpha = qS > 1 ? clamp(alphaForLift((this.mass * G) / qS, mach), ALPHA_MIN, ALPHA_MAX) : 0;
    this.velocity.set(0, 0, -speed).applyQuaternion(quaternion);
    this.quaternion
      .copy(quaternion)
      .multiply(this._dq.setFromAxisAngle(this._axis.set(1, 0, 0), alpha))
      .normalize();
    this._alphaRef = alpha;
    this._alphaRefRate = 0;
    this._rollRate = 0;
    this._pathHold = null;
    this.controls.lever = lever;
    this.engines.setLever(lever);
    this.controls.gear = gearDown;
    this.gear = new GearSequence(gearDown);
    this.peakLoadFactor = 1;
  }

  /** Advance one simulation step of dt seconds */
  step(dt) {
    const c = this.controls;
    const q = this.quaternion;
    const air = isa(this.position.y, this.air);

    // ── Air data ──
    const speed = this.velocity.length();
    this._qInv.copy(q).invert();
    const vb = this._vb.copy(this.velocity).applyQuaternion(this._qInv);
    const alpha = speed > 1 ? Math.atan2(-vb.y, -vb.z) : 0;
    const beta = speed > 1 ? Math.asin(clamp(vb.x / speed, -1, 1)) : 0;
    const mach = speed / air.speedOfSound;
    const qbar = 0.5 * air.density * speed * speed;
    const qS = qbar * WING_AREA;

    // ── Engines and fuel ──
    const thrust = this.engines.update(dt, c.lever, air, mach, this.fuel > 0);
    this.fuel = Math.max(0, this.fuel - this.engines.fuelFlow * dt);
    const mass = this.mass;
    const weight = mass * G;
    this.gear.command(c.gear);
    this.gear.update(dt);
    const gearDrag = GEAR_DRAG * this.gear.legs;

    // ── Forces ──
    const right = this._right.set(1, 0, 0).applyQuaternion(q);
    const up = this._up.set(0, 1, 0).applyQuaternion(q);
    const nose = this._nose.set(0, 0, -1).applyQuaternion(q);
    const force = this._force.copy(nose).multiplyScalar(thrust);
    const vHat = this._vHat;
    const cl = liftCoefficient(alpha, mach);
    if (speed > 1) {
      vHat.copy(this.velocity).divideScalar(speed);
      const liftDir = this._liftDir.crossVectors(right, vHat).normalize();
      const sideDir = this._sideDir.crossVectors(vHat, liftDir).normalize();
      const cd = dragCoefficient(alpha, cl, mach, c.airbrake * AIRBRAKE_DRAG + gearDrag);
      force.addScaledVector(liftDir, qS * cl);
      force.addScaledVector(vHat, -qS * cd);
      force.addScaledVector(sideDir, qS * SIDE_FORCE_SLOPE * beta);
    } else {
      vHat.copy(nose);
    }
    const loadFactor = force.dot(up) / weight;
    force.y -= weight;
    const accel = this._accel.copy(force).divideScalar(mass);

    // ── Flight control system ──
    const pathAngle = Math.asin(clamp(vHat.y, -1, 1));
    const bank = Math.atan2(-right.y, up.y);
    const stick = c.pitch;
    let neutral = neutralLoadFactor(pathAngle, bank);
    if (Math.abs(stick) < STICK_NEUTRAL && Math.abs(pathAngle) < PATH_HOLD_MAX) {
      this._pathHold ??= pathAngle;
      const correction = (PATH_HOLD_GAIN * (this._pathHold - pathAngle) * speed) / G;
      neutral += clamp(correction, -1, 1) * Math.cos(bank);
    } else {
      this._pathHold = null;
    }
    const commanded = clamp(
      stick >= 0 ? neutral + stick * (LOAD_FACTOR_MAX - neutral) : neutral + stick * (neutral - LOAD_FACTOR_MIN),
      LOAD_FACTOR_MIN,
      LOAD_FACTOR_MAX,
    );
    const alphaCommand =
      qS > 1 ? clamp(alphaForLift((commanded * weight) / qS, mach), ALPHA_MIN, ALPHA_MAX) : this._alphaRef;
    const w = PITCH_RESPONSE_FREQUENCY;
    this._alphaRefRate +=
      (w * w * (alphaCommand - this._alphaRef) - 2 * PITCH_RESPONSE_DAMPING * w * this._alphaRefRate) * dt;
    this._alphaRef += this._alphaRefRate * dt;
    const alphaRate = this._alphaRefRate + ALPHA_GAIN * (this._alphaRef - alpha);

    const authority = clamp(qbar / CONTROL_PRESSURE, 0, 1);
    const rollRateMax = ROLL_RATE_MAX * clamp(Math.sqrt(qbar / ROLL_RATE_FULL_PRESSURE), 0.2, 1);
    const rollCommand = c.roll * rollRateMax;
    this._rollRate += (rollCommand - this._rollRate) * Math.min(1, dt / ROLL_RESPONSE_TIME);
    // Rudder right: nose right of the path, sideslip negative
    const betaCommand = -c.yaw * SIDESLIP_MAX * clamp(1 - qbar / 30000, 0.2, 1);
    const betaRate = SIDESLIP_GAIN * (betaCommand - beta);

    // Turn rate of the flight path, from the acceleration across it
    const pathRate = this._pathRate.set(0, 0, 0);
    if (speed > 1) {
      const along = accel.dot(vHat);
      pathRate.copy(accel).addScaledVector(vHat, -along).cross(vHat).negate().divideScalar(speed);
      const rate = pathRate.length();
      if (rate > PATH_RATE_MAX) pathRate.multiplyScalar(PATH_RATE_MAX / rate);
    }
    // Rotation wanted: follow the path, roll about it, correct the angle of
    // attack about the wing axis and the sideslip about the airframe's up axis
    const desired = this._desired
      .copy(pathRate)
      .addScaledVector(vHat, this._rollRate)
      .addScaledVector(right, alphaRate)
      .addScaledVector(up, betaRate)
      .multiplyScalar(authority)
      .applyQuaternion(this._qInv);
    const omega = this.angularVelocity;
    const reach = Math.max(0.1, authority) * dt;
    omega.x += clamp(desired.x - omega.x, -ANGULAR_ACCELERATION_MAX[1] * reach, ANGULAR_ACCELERATION_MAX[1] * reach);
    omega.y += clamp(desired.y - omega.y, -ANGULAR_ACCELERATION_MAX[2] * reach, ANGULAR_ACCELERATION_MAX[2] * reach);
    omega.z += clamp(desired.z - omega.z, -ANGULAR_ACCELERATION_MAX[0] * reach, ANGULAR_ACCELERATION_MAX[0] * reach);

    // ── Integration (semi-implicit Euler) ──
    const angle = omega.length() * dt;
    if (angle > 1e-12) {
      this._dq.setFromAxisAngle(this._axis.copy(omega).normalize(), angle);
      q.multiply(this._dq).normalize();
    }
    this.velocity.addScaledVector(accel, dt);
    this.position.addScaledVector(this.velocity, dt);

    // ── Flight data ──
    this.alpha = alpha;
    this.beta = beta;
    this.mach = mach;
    this.airspeed = speed;
    this.indicatedAirspeed = speed * Math.sqrt(air.density / SEA_LEVEL_DENSITY);
    this.dynamicPressure = qbar;
    this.loadFactor = loadFactor;
    this.peakLoadFactor = Math.max(this.peakLoadFactor, loadFactor);
    this.commandedLoadFactor = commanded;
    this.pathAngle = pathAngle;
    this.bank = bank;

    const s = this.surfaces;
    s.pitch = clamp(0.6 * ((commanded - 1) / (LOAD_FACTOR_MAX - 1)) + 0.3 * (commanded - loadFactor), -1, 1);
    s.roll = clamp(this._rollRate / ROLL_RATE_MAX + (2 * (rollCommand - this._rollRate)) / rollRateMax, -1, 1);
    s.yaw = clamp(-betaCommand / SIDESLIP_MAX + 3 * beta, -1, 1);
    s.canard = clamp(-alpha / ALPHA_MAX + 0.4 * s.pitch, -1, 1);
    s.slat = clamp((alpha - 0.09) / 0.26, 0, 1);
    s.airbrake = c.airbrake;
  }
}

/**
 * Load factor commanded by the neutral stick: holds the flight path wings
 * level, and a level turn up to 60° of bank; past it fades to zero at 90°,
 * and when inverted pushes to keep the path from curving down.
 */
function neutralLoadFactor(pathAngle, bank) {
  const cosPath = Math.cos(pathAngle);
  const b = Math.abs(bank);
  if (b <= LEVEL_TURN_BANK) return cosPath / Math.cos(b);
  if (b <= Math.PI / 2)
    return (cosPath / Math.cos(LEVEL_TURN_BANK)) * ((Math.PI / 2 - b) / (Math.PI / 2 - LEVEL_TURN_BANK));
  return cosPath * Math.cos(b);
}
