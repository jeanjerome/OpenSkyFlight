import * as THREE from 'three';

/** Steepest aim above or below the horizon (rad) */
const AIM_PITCH_MAX = (89 * Math.PI) / 180;

/**
 * Angles between the nose and the aim (rad): beyond BANK_FULL the instructor
 * banks to put the aim above the canopy; within BANK_FROM it flies upright,
 * banked in proportion to how far the aim lies to the side; in between it blends
 */
const BANK_FROM = (8 * Math.PI) / 180;
const BANK_FULL = (20 * Math.PI) / 180;

/** Bank (rad) per rad of the aim's angle to the side, near the aim, and its limit */
const SIDE_BANK_GAIN = 10;
const SIDE_BANK_MAX = (60 * Math.PI) / 180;

/** Below the nose and within this angle, the instructor pushes instead of rolling inverted (rad) */
const PUSH_WITHIN = (15 * Math.PI) / 180;

/** Gains of the instructor: bank error to roll stick, pitch error to pitch stick, and their rate damping */
const ROLL_GAIN = 1.6;
const ROLL_DAMPING = 0.15;
const PITCH_GAIN = 6;
const PITCH_DAMPING = 1.6;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
/** Angle brought to [-π, π] */
const wrap = (a) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Mouse aim: the mouse moves an aim direction in the world, and an
 * instructor flies the aircraft so that its nose points at it, through the
 * same stick commands as a pilot and so within the limits of the flight
 * control system.
 *
 * Far from the aim the instructor banks so that the aim lies above the
 * canopy, then pulls; near it the aircraft flies upright, banked towards the
 * side the aim lies on, and pushes to reach an aim a little below the nose
 * rather than rolling inverted.
 */
export default class MouseAim {
  constructor() {
    /** Aim direction as yaw (0 north, positive west) and pitch (positive up), rad */
    this.yaw = 0;
    this.pitch = 0;
    this.direction = new THREE.Vector3(0, 0, -1);
    this._body = new THREE.Vector3();
    this._nose = new THREE.Vector3();
    this._rollDirection = 0;
    this._qInv = new THREE.Quaternion();
  }

  /** Aim where the nose points */
  syncTo(quaternion) {
    const nose = this._body.set(0, 0, -1).applyQuaternion(quaternion);
    this.yaw = Math.atan2(-nose.x, -nose.z);
    this.pitch = Math.asin(clamp(nose.y, -1, 1));
    this._update();
  }

  /** Move the aim by mouse deltas (rad) */
  move(dYaw, dPitch) {
    this.yaw += dYaw;
    this.pitch = clamp(this.pitch + dPitch, -AIM_PITCH_MAX, AIM_PITCH_MAX);
    this._update();
  }

  /**
   * Stick commands turning the nose towards the aim
   * @param {import('./FlightModel.js').default} model
   * @param {{pitch: number, roll: number}} out
   */
  steer(model, out) {
    const local = this._body.copy(this.direction).applyQuaternion(this._qInv.copy(model.quaternion).invert());
    const right = local.x;
    const up = local.y;
    const ahead = -local.z;
    const offset = Math.acos(clamp(ahead, -1, 1));

    // Far: bank so that the aim lies above the canopy (a slightly low aim is
    // reached by pushing, so the bank only matches its sideways part)
    const push = up < 0 && offset < PUSH_WITHIN;
    const over = Math.atan2(right, push ? -up : up);
    // Near: upright, banked towards the side of the aim, measured between
    // headings so that it does not flip when the aircraft is inverted
    const nose = this._nose.set(0, 0, -1).applyQuaternion(model.quaternion);
    const side = wrap(Math.atan2(-nose.x, -nose.z) - this.yaw);
    // Past 90° of bank, roll back upright the way it started, without
    // hesitating as the bank flips between +π and −π
    let upright;
    if (Math.abs(model.bank) > Math.PI / 2) {
      this._rollDirection ||= -Math.sign(model.bank) || 1;
      upright = this._rollDirection * Math.abs(model.bank);
    } else {
      this._rollDirection = 0;
      upright = clamp(SIDE_BANK_GAIN * side, -SIDE_BANK_MAX, SIDE_BANK_MAX) - model.bank;
    }
    // Inverted near the aim (end of a half loop): roll upright first
    const inverted = Math.abs(model.bank) > Math.PI / 2 && offset < BANK_FULL;
    const toward = inverted ? 0 : smoothstep(BANK_FROM, BANK_FULL, offset);
    const bankError = toward * over + (1 - toward) * upright;
    const rollRate = -model.angularVelocity.z;
    out.roll = clamp(ROLL_GAIN * bankError - ROLL_DAMPING * rollRate, -1, 1);

    // Pitch towards the aim in the plane of the wings' normal
    const pitchError = Math.atan2(up, Math.max(ahead, 0.05));
    out.pitch = clamp(PITCH_GAIN * pitchError - PITCH_DAMPING * model.angularVelocity.x, -1, 1);
    return out;
  }

  _update() {
    const cp = Math.cos(this.pitch);
    this.direction.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }
}
