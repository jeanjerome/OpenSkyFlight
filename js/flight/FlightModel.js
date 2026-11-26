import * as THREE from 'three';
import { isa, SEA_LEVEL_DENSITY } from '../sim/atmosphere.js';
import { alphaForLift, dragCoefficient, inducedDragFactor, liftCoefficient } from './aerodynamics.js';
import Engines from './Engines.js';
import GearContact from './GearContact.js';
import GearSequence from './GearSequence.js';
import {
  AIRBRAKE_DRAG,
  ALPHA_MAX,
  ALPHA_MIN,
  ANGULAR_ACCELERATION_MAX,
  BASIC_MASS,
  GEAR_DRAG,
  GROUND_PITCH_CONTROL,
  GROUND_PITCH_RATE,
  GROUND_ROLL_CONTROL,
  GROUND_ROLL_RATE,
  GROUND_YAW_CONTROL,
  INERTIA,
  INTERNAL_FUEL,
  LOAD_FACTOR_MAX,
  LOAD_FACTOR_MIN,
  MEAN_CHORD,
  PITCH_DAMPING,
  PITCH_RESPONSE_DAMPING,
  PITCH_RESPONSE_FREQUENCY,
  ROLL_DAMPING,
  ROLL_RATE_FULL_PRESSURE,
  ROLL_RATE_MAX,
  ROLL_RESPONSE_TIME,
  SIDE_FORCE_SLOPE,
  SIDESLIP_MAX,
  STORES_MASS,
  WEATHERCOCK_STABILITY,
  WING_AREA,
  WING_SPAN,
  YAW_DAMPING,
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

/** Lowest airspeed in the aerodynamic damping of the rotation on the ground (m/s) */
const DAMPING_SPEED = 10;

/** Gain of the control system's rate commands on the ground (1/s) */
const GROUND_RATE_GAIN = 25;

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
 * On the ground, the wheels (GearContact) carry the aircraft and the airframe
 * turns physically, within its moments of inertia, under the forces of the
 * wheels and the aerodynamic moments: the control system commands pitch and
 * roll rates with what moment the elevons and canards have at that speed
 * (holding the attitude at neutral stick), the rudder acts directly, until the
 * aircraft lifts off. Within about a wingspan of the
 * ground the induced drag falls (ground effect).
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

    /**
     * Pilot commands: stick pitch (pull +), roll (right +), yaw (right +),
     * throttle lever, airbrake, wheel brakes, gear down
     */
    this.controls = { pitch: 0, roll: 0, yaw: 0, lever: 0.6, airbrake: 0, brake: 0, gear: false };
    this.gear = new GearSequence();
    this.wheels = new GearContact();
    /** Height of the ground at a world position (m), null where unknown; none: no ground */
    this.groundHeight = null;

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
    this._omegaWorld = new THREE.Vector3();
    this._wasOnGround = false;
  }

  /** Whether the wheels carry the aircraft (last step) */
  get onGround() {
    return this.wheels.onGround;
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
    const wheels = this.wheels;
    wheels.update(this, this.groundHeight, this.gear.downLocked, c, dt);

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
      // Ground effect: the induced drag falls within a wingspan of the ground
      const h = (16 * Math.max(0.1, wheels.height)) / WING_SPAN;
      const groundEffect = 1 / (1 + h * h);
      const cd =
        dragCoefficient(alpha, cl, mach, c.airbrake * AIRBRAKE_DRAG + gearDrag) -
        groundEffect * inducedDragFactor(mach) * cl * cl;
      force.addScaledVector(liftDir, qS * cl);
      force.addScaledVector(vHat, -qS * cd);
      force.addScaledVector(sideDir, qS * SIDE_FORCE_SLOPE * beta);
    } else {
      vHat.copy(nose);
    }
    force.add(wheels.force);
    const loadFactor = force.dot(up) / weight;
    force.y -= weight;
    const accel = this._accel.copy(force).divideScalar(mass);

    if (wheels.onGround) {
      this._groundRotation(dt, qS, speed, beta);
      this._wasOnGround = true;
    } else {
      if (this._wasOnGround) this._liftOff(alpha, vHat);
      this._flyByWire(dt, { alpha, beta, mach, speed, qbar, qS, weight, right, up, vHat, accel, loadFactor });
    }

    // ── Integration (semi-implicit Euler) ──
    const omega = this.angularVelocity;
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
    this.pathAngle = Math.asin(clamp(vHat.y, -1, 1));
    this.bank = Math.atan2(-right.y, up.y);
  }

  /**
   * Rotation while the wheels carry the aircraft: the moments of the wheels,
   * of the controls (pitch and roll rate commands within the surfaces'
   * authority, direct rudder) and the aerodynamic damping of the rates
   */
  _groundRotation(dt, qS, speed, beta) {
    const c = this.controls;
    const omega = this.angularVelocity;
    const v = 2 * Math.max(speed, DAMPING_SPEED);
    const wheels = this.wheels.moment;
    // Roll rate is about the aft axis (roll left positive): roll right commands a negative rate
    const pitchAuthority = qS * MEAN_CHORD * GROUND_PITCH_CONTROL;
    const rollAuthority = qS * WING_SPAN * GROUND_ROLL_CONTROL;
    const pitchControl = clamp(
      GROUND_RATE_GAIN * INERTIA.pitch * (c.pitch * GROUND_PITCH_RATE - omega.x),
      -pitchAuthority,
      pitchAuthority,
    );
    const rollControl = clamp(
      GROUND_RATE_GAIN * INERTIA.roll * (-c.roll * GROUND_ROLL_RATE - omega.z),
      -rollAuthority,
      rollAuthority,
    );
    const pitch = wheels.x + pitchControl + (qS * MEAN_CHORD * MEAN_CHORD * PITCH_DAMPING * omega.x) / v;
    const roll = wheels.z + rollControl + (qS * WING_SPAN * WING_SPAN * ROLL_DAMPING * omega.z) / v;
    // Rudder right turns the nose right (yaw left positive); the sideslip turns it into the airflow
    const yaw =
      wheels.y +
      qS * WING_SPAN * (-GROUND_YAW_CONTROL * c.yaw - WEATHERCOCK_STABILITY * beta) +
      (qS * WING_SPAN * WING_SPAN * YAW_DAMPING * omega.y) / v;
    omega.x += (pitch / INERTIA.pitch) * dt;
    omega.y += (yaw / INERTIA.yaw) * dt;
    omega.z += (roll / INERTIA.roll) * dt;

    this.commandedLoadFactor = 1;
    const s = this.surfaces;
    s.pitch = pitchAuthority > 0 ? pitchControl / pitchAuthority : 0;
    s.roll = rollAuthority > 0 ? -rollControl / rollAuthority : 0;
    s.yaw = c.yaw;
    s.canard = 0.4 * s.pitch;
    s.slat = 0;
    s.airbrake = c.airbrake;
  }

  /** The control system takes over from where the airframe stands as the wheels leave the ground */
  _liftOff(alpha, vHat) {
    this._wasOnGround = false;
    this._alphaRef = alpha;
    this._alphaRefRate = 0;
    this._rollRate = this._omegaWorld.copy(this.angularVelocity).applyQuaternion(this.quaternion).dot(vHat);
    this._pathHold = null;
  }

  /** Rotation set by the fly-by-wire control system in flight */
  _flyByWire(dt, { alpha, beta, mach, speed, qbar, qS, weight, right, up, vHat, accel, loadFactor }) {
    const c = this.controls;

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

    this.commandedLoadFactor = commanded;

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
