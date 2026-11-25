import { isa } from '../sim/atmosphere.js';
import { alphaForLift, dragCoefficient, inducedDragFactor, liftCoefficient, zeroLiftDrag } from './aerodynamics.js';
import Engines from './Engines.js';
import { G } from './FlightModel.js';
import { ALPHA_MAX, LOAD_FACTOR_MAX, WING_AREA } from '../constants/rafale.js';

/**
 * Steady performance of the flight model, computed from the same aerodynamic
 * and engine functions: what the verification bench compares with the
 * published figures of the Rafale.
 */

/** Available thrust (N) at an altitude and Mach, for a lever position held long enough */
export function thrustAvailable(altitude, mach, lever = 1) {
  const engines = new Engines();
  engines.setLever(lever);
  return engines.update(0, lever, isa(altitude), mach, true);
}

/** Drag (N) in flight at a load factor */
export function drag(altitude, mach, mass, loadFactor = 1) {
  const air = isa(altitude);
  const v = mach * air.speedOfSound;
  const qS = 0.5 * air.density * v * v * WING_AREA;
  const cl = (loadFactor * mass * G) / qS;
  return qS * dragCoefficient(alphaForLift(cl, mach), cl, mach);
}

/** Turn rate (rad/s) of a level turn at a load factor and speed */
export function turnRate(loadFactor, speed) {
  return loadFactor > 1 ? (G * Math.sqrt(loadFactor * loadFactor - 1)) / speed : 0;
}

/**
 * Instantaneous turn: the load factor reached at the angle of attack limit or
 * the load factor limit, whichever comes first
 */
export function instantaneousTurn(altitude, mach, mass) {
  const air = isa(altitude);
  const v = mach * air.speedOfSound;
  const qS = 0.5 * air.density * v * v * WING_AREA;
  const n = Math.min(LOAD_FACTOR_MAX, (qS * liftCoefficient(ALPHA_MAX, mach)) / (mass * G));
  return { loadFactor: n, rate: turnRate(n, v) };
}

/** Sustained turn: the load factor at which drag equals full afterburner thrust */
export function sustainedTurn(altitude, mach, mass) {
  const air = isa(altitude);
  const v = mach * air.speedOfSound;
  const qS = 0.5 * air.density * v * v * WING_AREA;
  const thrust = thrustAvailable(altitude, mach);
  const k = inducedDragFactor(mach);
  const cl = Math.sqrt(Math.max(0, (thrust / qS - zeroLiftDrag(mach)) / k));
  const limit = instantaneousTurn(altitude, mach, mass).loadFactor;
  const n = Math.min(limit, (qS * cl) / (mass * G));
  return { loadFactor: n, rate: turnRate(n, v) };
}

/** Highest Mach of level flight at full afterburner (or another lever position) */
export function topSpeed(altitude, mass, lever = 1) {
  let best = 0;
  for (let mach = 0.3; mach <= 3; mach += 0.005) {
    if (thrustAvailable(altitude, mach, lever) >= drag(altitude, mach, mass)) best = mach;
  }
  return best;
}

/** Specific excess power (m/s): climb rate available at a speed */
export function excessPower(altitude, mach, mass, lever = 1) {
  const v = mach * isa(altitude).speedOfSound;
  return ((thrustAvailable(altitude, mach, lever) - drag(altitude, mach, mass)) * v) / (mass * G);
}

/** Highest climb rate (m/s) over the speeds of level flight */
export function bestClimbRate(altitude, mass, lever = 1) {
  let best = -Infinity;
  for (let mach = 0.2; mach <= 2.5; mach += 0.01) best = Math.max(best, excessPower(altitude, mach, mass, lever));
  return best;
}

/** Altitude (m) where the best climb rate falls to 100 ft/min: the service ceiling */
export function serviceCeiling(mass) {
  let altitude = 0;
  while (altitude < 25000 && bestClimbRate(altitude, mass) > 0.508) altitude += 100;
  return altitude;
}

/** Equivalent airspeed (m/s) of 1 g flight at an angle of attack, at sea level, without thrust */
export function speedAtAlpha(alpha, mass) {
  let v = 80;
  for (let i = 0; i < 20; i++) {
    const mach = v / isa(0).speedOfSound;
    v = Math.sqrt((2 * mass * G) / (isa(0).density * WING_AREA * liftCoefficient(alpha, mach)));
  }
  return v;
}

/** Time (s) to accelerate in level flight between two true airspeeds at full afterburner */
export function accelerationTime(altitude, mass, fromSpeed, toSpeed) {
  const air = isa(altitude);
  let v = fromSpeed;
  let t = 0;
  const dt = 0.01;
  while (v < toSpeed && t < 600) {
    const mach = v / air.speedOfSound;
    v += ((thrustAvailable(altitude, mach) - drag(altitude, mach, mass)) / mass) * dt;
    t += dt;
  }
  return t;
}
