/**
 * Figures of the Dassault Rafale used by the flight model.
 *
 * Official figures (Dassault Aviation, Safran) and flight-test figures
 * (Flight International) where published; otherwise estimates calibrated so
 * that the model meets the published performance (see
 * docs/gameplay-roadmap.md, reference data, and `npm run flight:bench`).
 */

/** Wing area (m²) */
export const WING_AREA = 45.7;

/** Wing span (m) */
export const WING_SPAN = 10.9;

/** Basic mass: empty aircraft with pilot, gun ammunition and oil (kg) */
export const BASIC_MASS = 10300;

/** Mass of the stores carried by the model: 2 MICA and 2 Meteor (kg) */
export const STORES_MASS = 2 * 112 + 2 * 190;

/** Internal fuel (kg) */
export const INTERNAL_FUEL = 4700;

// ── Aerodynamics (estimates) ──

/** Highest lift coefficient of the clean aircraft at low Mach, reached at ALPHA_CL_MAX */
export const CL_MAX = 1.7;

/** Angle of attack of the highest lift (rad) */
export const ALPHA_CL_MAX = (32 * Math.PI) / 180;

/** Zero-lift drag coefficient of the aircraft with its stores, subsonic */
export const CD0_SUBSONIC = 0.023;

/** Zero-lift drag coefficient at the peak of the transonic drag rise (Mach ≈ 1.1) */
export const CD0_TRANSONIC = 0.044;

/** Zero-lift drag coefficient at Mach 2 */
export const CD0_SUPERSONIC = 0.038;

/** Induced drag factor k of CD = CD0 + k·CL², subsonic (1 / (π·e·A), A = 2.6, e ≈ 0.8) */
export const INDUCED_DRAG_SUBSONIC = 0.153;

/** Induced drag factor at Mach 2 */
export const INDUCED_DRAG_SUPERSONIC = 0.4;

/** Side force slope with sideslip (per rad) */
export const SIDE_FORCE_SLOPE = -0.9;

/** Zero-lift drag added by the canards and elevons deflected as an airbrake */
export const AIRBRAKE_DRAG = 0.06;

/**
 * Zero-lift drag added by the landing gear down and its open doors, an
 * estimate in the range of fighters' gear (≈ 0.015–0.025 on the wing area)
 */
export const GEAR_DRAG = 0.02;

// ── Engines: 2 × Safran M88-2 ──

/** Sea-level static thrust of one engine at full dry power (N) [official] */
export const DRY_THRUST = 50000;

/** Sea-level static thrust of one engine at full afterburner (N) [official] */
export const REHEAT_THRUST = 75000;

/** Number of engines */
export const ENGINE_COUNT = 2;

/** Idle thrust as a share of full dry thrust */
export const IDLE_THRUST_SHARE = 0.05;

/** Thrust of the lowest afterburner as a share of the step from dry to full afterburner */
export const MIN_REHEAT_SHARE = 0.25;

/**
 * Throttle ratio of the thrust lapse (Mattingly, low-bypass afterburning
 * turbofan): above this ratio of the total to the sea-level temperature at the
 * inlet, the engine control lowers thrust to protect the turbine. It sets the
 * top speed: Mach 1.8 at altitude and about 750 kt at sea level, where the
 * inlet total temperature is the same.
 */
export const THROTTLE_RATIO = 1.07;

/** Thrust-specific fuel consumption at dry power (kg/(N·s)) */
export const TSFC_DRY = 22.1e-6;

/** Thrust-specific fuel consumption at full afterburner (kg/(N·s)) */
export const TSFC_REHEAT = 47.1e-6;

/** Time constant of the engine core spooling up near full power (s): idle to full afterburner in ≈ 4 s */
export const SPOOL_TIME = 0.9;

/** Time constant of the afterburner lighting or changing stage (s) */
export const REHEAT_TIME = 0.35;

// ── Flight control system (flight-test figures where stated) ──

/** Load factor limits in air-to-air configuration [official, flight test] */
export const LOAD_FACTOR_MAX = 9;
export const LOAD_FACTOR_MIN = -3.2;

/** Angle of attack limit in air-to-air configuration (rad) [flight test: 29°] */
export const ALPHA_MAX = (29 * Math.PI) / 180;

/** Lowest angle of attack the control system commands (rad) */
export const ALPHA_MIN = (-10 * Math.PI) / 180;

/** Steady roll rate at 350 to 450 kt (rad/s) [flight test: 270°/s] */
export const ROLL_RATE_MAX = (270 * Math.PI) / 180;

/** Dynamic pressure from which the full roll rate is available (Pa, ≈ 300 kt at sea level) */
export const ROLL_RATE_FULL_PRESSURE = 12000;

/** Sideslip commanded by full rudder at low speed (rad) */
export const SIDESLIP_MAX = (6 * Math.PI) / 180;

/** Natural frequency (rad/s) and damping of the commanded angle of attack response */
export const PITCH_RESPONSE_FREQUENCY = 4;
export const PITCH_RESPONSE_DAMPING = 0.75;

/** Time constant of the roll rate response (s) */
export const ROLL_RESPONSE_TIME = 0.12;

/** Largest angular accelerations the control surfaces produce (rad/s²): roll, pitch, yaw */
export const ANGULAR_ACCELERATION_MAX = [14, 4, 2];
