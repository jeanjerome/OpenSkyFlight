/**
 * A scripted pilot that flies a left-hand circuit from a runway and lands
 * back on it, through the same inputs as a player with a gamepad (stick,
 * rudder, throttle lever moves, airbrake and wheel brakes, gear handle): the
 * whole chain of the Simulation mode is exercised, its fly-by-wire laws,
 * ground physics and crash checks included. It records how the flight went
 * (see `report`), so that the flight model and the runway environment can be
 * checked in the application by a script (scripts/flight-scenario.js) as by
 * unit tests on a flat ground.
 *
 * Runway frame: `along` from the threshold towards the far end (m), `cross`
 * to the right of the landing direction (m), heights above the threshold.
 */

import * as THREE from 'three';

const DEG = Math.PI / 180;
const KNOT = 0.514444;

/** Circuit (left-hand), in metres and m/s; speeds are indicated */
export const CIRCUIT = {
  height: 450,
  downwindOffset: 3000,
  baseFrom: 5000,
  rotateSpeed: 130 * KNOT,
  rotatePitch: 12 * DEG,
  climbPath: 8 * DEG,
  gearUpHeight: 60,
  circuitSpeed: 220 * KNOT,
  downwindSpeed: 180 * KNOT,
  approachSpeed: 140 * KNOT,
  glide: 3 * DEG,
  aimPoint: 300,
  flareHeight: 15,
  idleHeight: 6,
  circuitBank: 45 * DEG,
  finalBank: 25 * DEG,
};

/** Standard gravity (m/s²) */
const G = 9.80665;

/** Radius of a turn at a speed and bank (m), which the turns are begun ahead of their line */
const turnRadius = (speed, bank) => (speed * speed) / (G * Math.tan(bank));

/** Rate at which the pilot moves the controls (Hz of simulated time) */
const CONTROL_RATE = 60;

/** Height of the centre of gravity above the ground with the wheels just touching, near enough (m) */
const WHEELS_HEIGHT = 1.8;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const wrap = (a) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));

export default class PilotBot {
  /**
   * @param {object} placed - the runway in world metres (see airports/RunwaysInWorld.js)
   * @param {number} endIndex - the runway end taken off from and landed on (0 or 1)
   */
  constructor(placed, endIndex) {
    this.placed = placed;
    this.end = placed.runway.ends[endIndex];
    this.direction = endIndex === 0 ? 1 : -1;
    this.threshold = endIndex === 0 ? this.end.displaced : placed.length - this.end.displaced;
    /** Compass heading of the landing direction (rad, clockwise from north) */
    this.course = Math.atan2(this.direction * placed.ux, -this.direction * placed.uz);
    /** Runway length from the threshold to the far end (m) */
    this.available = placed.length - this.end.displaced;

    this.phase = 'lineup';
    this.time = 0;
    this.done = false;
    this._phaseTime = 0;
    this._clock = 0;
    this._gearUp = false;
    this._gearDown = false;
    this._lastSpeed = null;
    this._finalSamples = [];
    this._nose = new THREE.Vector3();
    this.report = {
      runway: `${placed.runway.airport} ${this.end.ident}`,
      phases: [],
      takeoffRun: null,
      liftOffSpeed: null,
      maxLoadFactor: 1,
      minLoadFactor: 1,
      circuitHeightError: null,
      final: null,
      touchdown: null,
      rollout: null,
      crash: null,
    };
    this._startAlong = null;
    this._touchdownAlong = null;
    this._enter('lineup');
  }

  /**
   * Called every simulation step before it: moves the controls at CONTROL_RATE
   * @param {import('./SimulatedFlight.js').default} flight
   * @param {number} dt - s
   */
  tick(flight, dt) {
    if (this.done) return;
    this.time += dt;
    this._phaseTime += dt;
    this._clock += dt;
    const model = flight.model;
    // The vertical speed of the first wheel to touch, in the step it touches
    if (this.phase === 'flare' || this.phase === 'final') {
      this._sink = Math.max(this._sink ?? 0, model.wheels.touchdownSink);
    }
    if (this.phase !== 'lineup') {
      this.report.maxLoadFactor = Math.max(this.report.maxLoadFactor, model.loadFactor);
      this.report.minLoadFactor = Math.min(this.report.minLoadFactor, model.loadFactor);
    }
    if (flight.crash) {
      this.report.crash = { ...flight.crash, phase: this.phase };
      this._finish();
      return;
    }
    if (this._clock < 1 / CONTROL_RATE) return;
    const step = this._clock;
    this._clock = 0;
    flight.applyControls({ flight: this._fly(flight, step) }, step);
  }

  /** Position and motion of the aircraft in the runway frame */
  _frame(model) {
    const { x0, z0, ux, uz, k } = this.placed;
    const rx = (model.position.x - x0) / k;
    const rz = (model.position.z - z0) / k;
    const s = rx * ux + rz * uz;
    const t = rz * ux - rx * uz;
    const along = this.direction * (s - this.threshold);
    const cross = this.direction * t;
    const heading = wrap(Math.atan2(model.velocity.x, -model.velocity.z));
    // Heading and pitch of the nose: on the ground the track is not defined at rest
    const nose = this._nose.set(0, 0, -1).applyQuaternion(model.quaternion);
    const noseHeading = Math.atan2(nose.x, -nose.z);
    const pitch = Math.asin(clamp(nose.y, -1, 1));
    const height = model.position.y - this.end.elevation - WHEELS_HEIGHT;
    const radio = model.wheels.height - WHEELS_HEIGHT;
    return { along, cross, heading, noseHeading, pitch, height, radio };
  }

  _enter(phase) {
    this.phase = phase;
    this._phaseTime = 0;
    this.report.phases.push({ phase, time: +this.time.toFixed(2) });
  }

  _finish() {
    this.done = true;
    this._enter('done');
  }

  /** The controls for this moment, as a gamepad would give them */
  _fly(flight, dt) {
    const model = flight.model;
    const c = CIRCUIT;
    const f = this._frame(model);
    const speed = model.indicatedAirspeed;
    const out = {
      pitch: 0,
      roll: 0,
      yaw: 0,
      throttle: 0,
      airbrake: false,
      direct: true,
      aimYaw: 0,
      aimPitch: 0,
    };
    const accel = this._lastSpeed === null ? 0 : (speed - this._lastSpeed) / dt;
    this._lastSpeed = speed;
    const holdSpeed = (target) => clamp(0.12 * (target - speed) - 0.8 * accel, -1, 1);
    // Stick for a flight path angle: the fly-by-wire turns a pull into load factor
    const holdPath = (target) => clamp((Math.max(model.airspeed, 60) / 90) * (target - model.pathAngle) * 0.9, -1, 1);
    // Roll stick for a bank, the bank for a heading
    const holdBank = (target) => clamp(2.5 * (target - model.bank) - 0.3 * -model.angularVelocity.z, -1, 1);
    const holdHeading = (target, maxBank = c.circuitBank) =>
      holdBank(clamp(2.5 * wrap(target - f.heading), -maxBank, maxBank));
    // Track along a line parallel to the runway, offset across (m), with the landing direction or against it
    const lineHeading = (offset, against, reach) => {
      const sense = against ? -1 : 1;
      return this.course + (against ? Math.PI : 0) - sense * Math.atan((f.cross - offset) / reach);
    };
    const holdHeight = (target) =>
      holdPath(clamp(Math.atan((target - f.height) / (model.airspeed * 15)), -5 * DEG, 8 * DEG));
    const steer = () => clamp(-(0.04 * f.cross + 2 * wrap(f.noseHeading - this.course)), -1, 1);

    switch (this.phase) {
      case 'lineup':
        out.airbrake = true;
        out.throttle = 1;
        out.yaw = steer();
        if (this._phaseTime > 3) {
          this._startAlong = f.along;
          this._enter('takeoff');
        }
        break;
      case 'takeoff':
        out.throttle = 1;
        out.yaw = steer();
        if (speed >= c.rotateSpeed) this._enter('rotate');
        break;
      case 'rotate': {
        out.throttle = 1;
        out.yaw = steer();
        out.pitch = clamp(6 * (c.rotatePitch - f.pitch), 0, 1);
        if (!model.onGround) {
          this.report.takeoffRun = +(f.along - this._startAlong).toFixed(1);
          this.report.liftOffSpeed = +(speed / KNOT).toFixed(1);
          this._enter('climb');
        }
        break;
      }
      case 'climb':
        out.throttle = speed < c.circuitSpeed ? 1 : holdSpeed(c.circuitSpeed);
        out.pitch = holdPath(Math.min(c.climbPath, Math.atan((c.height - f.height) / 300)));
        out.roll = holdHeading(lineHeading(0, false, 800), 15 * DEG);
        if (!this._gearUp && f.radio > c.gearUpHeight) {
          flight.toggleGear();
          this._gearUp = true;
        }
        if (f.along > this.available + 500 && f.height > 250) this._enter('crosswind');
        break;
      case 'crosswind':
        out.throttle = holdSpeed(c.circuitSpeed);
        out.pitch = holdHeight(c.height);
        out.roll = holdHeading(this.course - Math.PI / 2);
        if (f.cross < -(c.downwindOffset - turnRadius(model.airspeed, c.circuitBank))) this._enter('downwind');
        break;
      case 'downwind': {
        out.throttle = holdSpeed(f.along < this.available / 2 ? c.downwindSpeed : c.circuitSpeed);
        out.pitch = holdHeight(c.height);
        out.roll = holdHeading(lineHeading(-c.downwindOffset, true, 1500));
        this._sampleCircuit(f);
        if (!this._gearDown && f.along < 0) {
          flight.toggleGear();
          this._gearDown = true;
        }
        if (f.along < -c.baseFrom) this._enter('base');
        break;
      }
      case 'base':
        out.throttle = holdSpeed(c.approachSpeed + 15 * KNOT);
        out.pitch = holdHeight(Math.tan(c.glide) * (-f.along + c.aimPoint) + 60);
        out.roll = holdHeading(this.course + Math.PI / 2);
        if (f.cross > -1.2 * turnRadius(model.airspeed, c.finalBank)) this._enter('final');
        break;
      case 'final': {
        const glideHeight = Math.tan(c.glide) * (-f.along + c.aimPoint);
        const error = f.height - glideHeight;
        out.throttle = holdSpeed(c.approachSpeed);
        out.pitch = holdPath(-c.glide - clamp(Math.atan(error / (model.airspeed * 6)), -3 * DEG, 3 * DEG));
        out.roll = holdHeading(lineHeading(0, false, 600), c.finalBank);
        // Once established: from 3 km to 500 m before the threshold
        if (-f.along < 3000 && -f.along > 500) this._finalSamples.push([f.cross, error]);
        if (f.radio < c.flareHeight) {
          this._summariseFinal();
          this._enter('flare');
        }
        break;
      }
      case 'flare': {
        const share = clamp(f.radio / c.flareHeight, 0, 1);
        out.throttle = f.radio < c.idleHeight ? -1 : holdSpeed(c.approachSpeed);
        out.pitch = holdPath(-c.glide * share - 0.5 * DEG * (1 - share));
        out.roll = holdHeading(lineHeading(0, false, 400), 10 * DEG);
        if (model.onGround) {
          this._touchdownAlong = f.along;
          this.report.touchdown = {
            sink: +(this._sink ?? 0).toFixed(2),
            along: +f.along.toFixed(1),
            cross: +f.cross.toFixed(1),
            speed: +(speed / KNOT).toFixed(1),
            pitch: +(f.pitch / DEG).toFixed(1),
          };
          this._enter('rollout');
        }
        break;
      }
      case 'rollout':
        out.throttle = -1;
        out.yaw = steer();
        // Brakes once the nose wheel is down
        out.airbrake = this._phaseTime > 2;
        if (model.velocity.length() < 1) {
          this.report.rollout = +(f.along - this._touchdownAlong).toFixed(1);
          this._finish();
        }
        break;
      default:
        break;
    }
    return out;
  }

  _sampleCircuit(f) {
    this._circuit = this._circuit ?? { n: 0, sum: 0 };
    const e = f.height - CIRCUIT.height;
    this._circuit.n++;
    this._circuit.sum += e * e;
    this.report.circuitHeightError = +Math.sqrt(this._circuit.sum / this._circuit.n).toFixed(1);
  }

  _summariseFinal() {
    const n = this._finalSamples.length;
    if (!n) return;
    const rms = (k) => Math.sqrt(this._finalSamples.reduce((sum, sample) => sum + sample[k] ** 2, 0) / n);
    this.report.final = { centreLine: +rms(0).toFixed(1), glidePath: +rms(1).toFixed(1) };
  }
}
