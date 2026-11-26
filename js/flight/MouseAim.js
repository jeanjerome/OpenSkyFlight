import * as THREE from 'three';

/** Steepest aim above or below the horizon (rad) */
const AIM_PITCH_MAX = (89 * Math.PI) / 180;

/**
 * Angles between the nose and the aim (rad): beyond BANK_FULL the instructor
 * rolls so that the aim lies above the canopy (and pulls) or below the floor
 * (and pushes); within BANK_FROM it flies upright, banked in proportion to how
 * far the aim lies to the side. In between it blends the two when upright
 * and pulling, where they agree. Pushing, where they would pull the roll in
 * opposite directions, it keeps one until within BANK_FROM and the other
 * until beyond BANK_FULL; inverted, it pulls until the nose is on the aim
 * (ROLL_BACK_WITHIN).
 */
const BANK_FROM = (8 * Math.PI) / 180;
const BANK_FULL = (20 * Math.PI) / 180;

/** Bank (rad) per rad of the aim's angle to the side, near the aim, and its limit */
const SIDE_BANK_GAIN = 10;
const SIDE_BANK_MAX = (60 * Math.PI) / 180;

/**
 * Pushing: an aim below the wings is reached by pushing when it lies nearly
 * under the floor, within PUSH_ROLL of it (an aim further to the side is
 * reached by banking towards it and pulling), and within PUSH_MAX below the
 * wings (a steeper aim is reached by rolling inverted and pulling). Once
 * chosen, pushing goes on until the aim lies SWITCH_MARGIN further aside.
 */
const PUSH_ROLL = (40 * Math.PI) / 180;
const PUSH_MAX = (40 * Math.PI) / 180;
const SWITCH_MARGIN = (15 * Math.PI) / 180;

/**
 * Inverted (after a half loop or a split S), the aircraft rolls back upright
 * once its nose is this close to the aim (rad): a roll about the nose then
 * keeps it there, where an earlier roll would sweep the still-turning nose
 * past the aim. Once started, the roll goes on until upright.
 */
const ROLL_BACK_WITHIN = (3 * Math.PI) / 180;

/** Roll left to go (rad) beyond which the roll keeps the direction it started in */
const ROLL_COMMIT = (150 * Math.PI) / 180;

/** Gains of the instructor: bank error to roll stick, pitch error to pitch stick, and their rate damping */
const ROLL_GAIN = 1.6;
const ROLL_DAMPING = 0.15;
const PITCH_GAIN = 6;
const PITCH_DAMPING = 1.6;

/** Heading gap to the aim giving full rudder on the ground (rad) */
const GROUND_STEER_GAP = (15 * Math.PI) / 180;

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
 * Far from the aim the instructor rolls so that the aim lies above the
 * canopy, then pulls, as a pilot would; an aim moderately below the wings is
 * reached by rolling the other way, putting it below the floor, and pushing,
 * when that needs less roll. Near the aim the aircraft flies upright, banked
 * towards the side the aim lies on.
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
    this._pushing = false;
    this._near = false;
    this._rollingBack = false;
    this._turnDirection = 0;
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

    // Far: roll so that the aim lies above the canopy and pull, or, for an aim
    // a little below the nose, below the floor and push
    const pull = Math.atan2(right, up);
    const pushRoll = Math.atan2(-right, -up);
    const elevation = Math.asin(clamp(up, -1, 1));
    const canPush = up < 0 && ahead > 0 && elevation > -PUSH_MAX;
    this._pushing = canPush && Math.abs(pushRoll) < PUSH_ROLL + (this._pushing ? SWITCH_MARGIN : 0);
    let over = this._pushing ? pushRoll : pull;
    // An aim right behind the roll axis gives a roll of ±180° whose sign
    // flips with the slightest sideways move: keep the direction first taken
    if (Math.abs(over) > ROLL_COMMIT) {
      this._turnDirection ||= Math.sign(over) || 1;
      over = this._turnDirection * Math.abs(over);
    } else if (Math.abs(over) < Math.PI / 2) {
      this._turnDirection = 0;
    }
    // Near: upright, banked towards the side of the aim, measured between
    // headings so that it does not flip when the aircraft is inverted, as an
    // angle (headings converge towards the vertical: a steep climb would
    // otherwise magnify it and rock the wings)
    const nose = this._nose.set(0, 0, -1).applyQuaternion(model.quaternion);
    const side = wrap(Math.atan2(-nose.x, -nose.z) - this.yaw) * Math.cos(this.pitch);
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
    if (offset < BANK_FROM) this._near = true;
    else if (offset > BANK_FULL) this._near = false;
    const inverted = Math.abs(model.bank) > Math.PI / 2;
    if (!inverted) this._rollingBack = false;
    else if (offset < ROLL_BACK_WITHIN) this._rollingBack = true;
    let bankError;
    // One target or the other: blended, they would hold the roll halfway
    if (inverted) {
      bankError = this._rollingBack ? upright : over;
    } else if (this._pushing) {
      bankError = this._near ? upright : over;
    } else {
      const toward = smoothstep(BANK_FROM, BANK_FULL, offset);
      bankError = toward * over + (1 - toward) * upright;
    }
    const rollRate = -model.angularVelocity.z;
    out.roll = clamp(ROLL_GAIN * bankError - ROLL_DAMPING * rollRate, -1, 1);

    // Pitch towards the aim in the plane of the wings' normal; far from an aim
    // it does not push towards, it rolls and pulls rather than push (pushing
    // banked away from the aim's side would cancel the turn)
    const pitchError = Math.atan2(up, Math.max(ahead, 0.05));
    const lowest = this._pushing || this._near ? -1 : 0;
    out.pitch = clamp(PITCH_GAIN * pitchError - PITCH_DAMPING * model.angularVelocity.x, lowest, 1);
    return out;
  }

  /**
   * On the ground: the wings stay level, the rudder (and so the nose wheel)
   * turns towards the aim's heading, the stick raises the nose towards it
   * @param {import('./FlightModel.js').default} model
   * @param {{pitch: number, roll: number, yaw: number}} out
   */
  steerOnGround(model, out) {
    this.steer(model, out);
    const nose = this._nose.set(0, 0, -1).applyQuaternion(model.quaternion);
    // Headings are positive to the left, the rudder to the right
    const gap = wrap(this.yaw - Math.atan2(-nose.x, -nose.z));
    out.roll = 0;
    out.yaw = clamp(-gap / GROUND_STEER_GAP, -1, 1);
    return out;
  }

  _update() {
    const cp = Math.cos(this.pitch);
    this.direction.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }
}
