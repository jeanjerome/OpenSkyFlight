import * as THREE from 'three';
import {
  BRAKE_FRICTION,
  GEAR_LEGS,
  ROLLING_RESISTANCE,
  STEERING_MAX,
  STEERING_SIDE_ACCELERATION,
  TYRE_FRICTION,
} from '../constants/rafale.js';

/** Steering rate of the nose wheel (rad/s) */
const STEERING_RATE = (90 * Math.PI) / 180;

/**
 * Slip speeds over which the tyres' forces build up (m/s): below them the
 * forces are proportional to the slip, so that a wheel at rest holds still
 * without the forces flipping each step
 */
const ROLLING_SLIP = 0.2;
const SIDE_SLIP = 0.3;

/** Stiffness past the end of the strut's travel, as a multiple of the strut's own */
const BOTTOMED_STIFFNESS = 10;

/** Time for an airborne wheel to stop spinning (s) */
const SPIN_DOWN_TIME = 4;

/** Distance between the ground samples giving the slope (m) */
const SLOPE_BASE = 3;

/** Height of the centre of gravity above the ground beyond which no wheel can touch (m) */
const CONTACT_HEIGHT = 4;

/**
 * Wheels of the landing gear on the ground: each leg is a spring and damper
 * along the aircraft's vertical axis, its tyre pressed on the ground plane
 * with a friction limit shared by braking, rolling resistance and cornering;
 * the nose wheel steers with the rudder (widely while taxiing, less and less
 * with speed), the main wheels brake. Gives the force (world frame) and moment
 * (body frame) of the wheels about the centre of gravity.
 */
export default class GearContact {
  constructor() {
    this.legs = GEAR_LEGS.map((spec) => ({
      spec,
      position: new THREE.Vector3(...spec.position),
      /** Strut compression (m) */
      compression: 0,
      /** Ground speed of the wheel along its heading (m/s): its spin, kept by an airborne wheel */
      wheelSpeed: 0,
      /** Load on the wheel (N) */
      load: 0,
      contact: false,
    }));
    /** Nose-wheel steering angle (rad), right positive */
    this.steering = 0;
    /** Distance from the nose wheel to the main wheels (m) */
    this.wheelbase =
      Math.max(...GEAR_LEGS.map((leg) => leg.position[2])) - Math.min(...GEAR_LEGS.map((leg) => leg.position[2]));
    /** Whether any wheel touches the ground */
    this.onGround = false;
    /** Height of the centre of gravity above the ground (m), Infinity where unknown */
    this.height = Infinity;
    /** Fastest vertical speed at which a wheel touched the ground in the last step (m/s) */
    this.touchdownSink = 0;
    this.force = new THREE.Vector3();
    this.moment = new THREE.Vector3();

    this._normal = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._arm = new THREE.Vector3();
    this._wheel = new THREE.Vector3();
    this._pointVelocity = new THREE.Vector3();
    this._omega = new THREE.Vector3();
    this._heading = new THREE.Vector3();
    this._side = new THREE.Vector3();
    this._legForce = new THREE.Vector3();
    this._torque = new THREE.Vector3();
    this._qInv = new THREE.Quaternion();
  }

  /**
   * Forces of the wheels on the ground for this step, in `force` and `moment`
   * @param {import('./FlightModel.js').default} model
   * @param {((x: number, z: number) => number|null)|null} groundHeight - none away from any ground
   * @param {boolean} extended - whether the legs are down and locked
   * @param {{yaw: number, brake: number}} controls - rudder (right +) and wheel brakes, 0 to 1
   * @param {number} dt - s
   */
  update(model, groundHeight, extended, controls, dt) {
    const force = this.force.set(0, 0, 0);
    const moment = this.moment.set(0, 0, 0);
    const { position, velocity, quaternion } = model;

    // Nose-wheel steering: a wide range while taxiing, narrowing with speed
    // so that the turn stays within a sideways acceleration
    const groundSpeed = Math.hypot(velocity.x, velocity.z);
    const range = Math.min(STEERING_MAX, Math.atan((this.wheelbase * STEERING_SIDE_ACCELERATION) / groundSpeed ** 2));
    const step = STEERING_RATE * dt;
    this.steering += clamp(controls.yaw * range - this.steering, -step, step);

    const below = groundHeight ? groundHeight(position.x, position.z) : null;
    this.height = below === null ? Infinity : position.y - below;
    this.onGround = false;
    this.touchdownSink = 0;
    if (!extended || this.height > CONTACT_HEIGHT) {
      for (const leg of this.legs) this._airborne(leg, dt);
      return;
    }

    // Ground plane under the aircraft, from the slope around it
    const east = groundHeight(position.x + SLOPE_BASE, position.z) ?? below;
    const south = groundHeight(position.x, position.z + SLOPE_BASE) ?? below;
    const normal = this._normal.set(-(east - below) / SLOPE_BASE, 1, -(south - below) / SLOPE_BASE).normalize();
    const up = this._up.set(0, 1, 0).applyQuaternion(quaternion);
    const upright = up.dot(normal);
    const omega = this._omega.copy(model.angularVelocity).applyQuaternion(quaternion);

    for (const leg of this.legs) {
      const spec = leg.spec;
      const arm = this._arm.copy(leg.position).applyQuaternion(quaternion);
      const wheel = this._wheel.copy(position).add(arm);
      const ground = groundHeight(wheel.x, wheel.z);
      const depth = ground === null ? 0 : (ground - wheel.y) * normal.y;
      if (depth <= 0 || upright < 0.3) {
        this._airborne(leg, dt);
        continue;
      }

      // Strut: spring and damper along the aircraft's vertical axis
      const compression = depth / upright;
      const pointVelocity = this._pointVelocity.crossVectors(omega, arm).add(velocity);
      const rate = -pointVelocity.dot(normal) / upright;
      let strut = spec.stiffness * Math.min(compression, spec.travel) + spec.damping * rate;
      if (compression > spec.travel) strut += BOTTOMED_STIFFNESS * spec.stiffness * (compression - spec.travel);
      const load = Math.max(0, strut);

      // Tyre: heading of the wheel on the ground plane, slip along and across it
      const heading = this._heading.set(
        spec.steers ? Math.sin(this.steering) : 0,
        0,
        -(spec.steers ? Math.cos(this.steering) : 1),
      );
      heading.applyQuaternion(quaternion).addScaledVector(normal, -heading.dot(normal)).normalize();
      const side = this._side.crossVectors(heading, normal);
      const along = pointVelocity.dot(heading);
      const across = pointVelocity.dot(side);
      const braking = spec.brakes ? controls.brake * BRAKE_FRICTION : 0;
      let longitudinal = -(ROLLING_RESISTANCE + braking) * load * Math.tanh(along / ROLLING_SLIP);
      let lateral = -TYRE_FRICTION * load * clamp(across / SIDE_SLIP, -1, 1);
      const limit = TYRE_FRICTION * load;
      const total = Math.hypot(longitudinal, lateral);
      if (total > limit) {
        longitudinal *= limit / total;
        lateral *= limit / total;
      }

      const legForce = this._legForce
        .copy(normal)
        .multiplyScalar(load)
        .addScaledVector(heading, longitudinal)
        .addScaledVector(side, lateral);
      force.add(legForce);
      moment.add(this._torque.crossVectors(arm, legForce));

      if (!leg.contact) this.touchdownSink = Math.max(this.touchdownSink, -pointVelocity.dot(normal));
      leg.compression = Math.min(compression, spec.travel);
      leg.wheelSpeed = along;
      leg.load = load;
      leg.contact = true;
      this.onGround = true;
    }
    moment.applyQuaternion(this._qInv.copy(quaternion).invert());
  }

  _airborne(leg, dt) {
    leg.compression = 0;
    leg.load = 0;
    leg.contact = false;
    leg.wheelSpeed *= Math.exp(-dt / SPIN_DOWN_TIME);
  }
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
