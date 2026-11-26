/** Target length (meters) for the loaded aircraft model */
export const AIRCRAFT_TARGET_LENGTH = 15;

/**
 * Centre of gravity in the model's frame (model units: x left, y up, z
 * forward), an estimate: on the fuselage's axis, ahead of the main wheels so
 * that the nose wheel carries about 12 % of the weight. The model is drawn
 * with this point on the aircraft's position, the point the flight model
 * moves; the wheels' positions in GEAR_LEGS (constants/rafale.js) are measured
 * from it.
 */
export const AIRCRAFT_CG = [0, 1.95, -1.5];

/** Yaw-rate to visual roll multiplier */
export const VISUAL_ROLL_FACTOR = 120;

/** Maximum visual roll angle (radians, ~90°) */
export const VISUAL_ROLL_MAX = 1.57;

/** Pitch-rate to visual pitch multiplier */
export const VISUAL_PITCH_FACTOR = 15;

/** Maximum visual pitch offset (radians) */
export const VISUAL_PITCH_MAX = 0.4;

/** Smoothing factor for visual roll/pitch transitions */
export const VISUAL_SMOOTH = 5;

/** Speed (m/s) from which the engines run with afterburner while thrusting */
export const AFTERBURNER_SPEED = 300;

/**
 * Lights of the aircraft, in the model's frame (metres, x left, y up, z forward):
 * - candelas: luminous intensity; haloShare: luminance of the halo's centre
 *   relative to the lens; haloSize: halo diameter (m)
 * - axis, coverage: direction the light shines toward and half-angle (degrees)
 *   it is seen within; none for all-round lights
 * - flash: see AircraftLights; none for steady lights
 */
export const AIRCRAFT_LIGHTS = [
  {
    name: 'PositionLeft',
    position: [5.2, 1.52, -3.44],
    color: [1, 0.04, 0.02],
    candelas: 120,
    haloShare: 0.04,
    haloSize: 1.2,
    axis: [0.82, 0, 0.57],
    coverage: 85,
  },
  {
    name: 'PositionRight',
    position: [-5.2, 1.52, -3.44],
    color: [0.05, 1, 0.3],
    candelas: 120,
    haloShare: 0.04,
    haloSize: 1.2,
    axis: [-0.82, 0, 0.57],
    coverage: 85,
  },
  {
    name: 'Tail',
    position: [0, 4.94, -7.78],
    color: [1, 0.95, 0.85],
    candelas: 60,
    haloShare: 0.04,
    haloSize: 1,
    axis: [0, 0, -1],
    coverage: 70,
  },
  {
    name: 'BeaconTop',
    position: [0, 5.37, -7.03],
    color: [1, 0.08, 0.03],
    candelas: 300,
    haloShare: 0.05,
    haloSize: 2,
    flash: { period: 1.1, duration: 0.12 },
  },
  {
    name: 'BeaconBottom',
    position: [0, 1.26, -2.5],
    color: [1, 0.08, 0.03],
    candelas: 300,
    haloShare: 0.05,
    haloSize: 2,
    flash: { period: 1.1, duration: 0.12, offset: 0.55 },
  },
  {
    name: 'StrobeLeft',
    position: [5.29, 1.53, -4.95],
    color: [1, 1, 1],
    candelas: 2500,
    haloShare: 0.006,
    haloSize: 2.5,
    flash: { period: 1.3, duration: 0.05, count: 2, gap: 0.12 },
  },
  {
    name: 'StrobeRight',
    position: [-5.29, 1.53, -4.95],
    color: [1, 1, 1],
    candelas: 2500,
    haloShare: 0.006,
    haloSize: 2.5,
    flash: { period: 1.3, duration: 0.05, count: 2, gap: 0.12 },
  },
];

/** Radius of the light lenses (m) */
export const LIGHT_LENS_RADIUS = 0.05;

/** Smallest size of a light's halo on screen (pixels), so that it shows from afar */
export const GLOW_MIN_PIXELS = 6;

/** Nozzle exits, in the model's frame: centre (m), radius (m) and the model's nozzle mesh */
export const ENGINE_NOZZLES = [
  { position: [0.693, 1.974, -6.64], radius: 0.37, mesh: 'EngineL' },
  { position: [-0.693, 1.974, -6.64], radius: 0.37, mesh: 'EngineR' },
];

/**
 * Convergent flaps of the model's nozzles: they hinge on the ring at this z
 * (m) and close toward the exit, whose inner radius (m) the model draws
 * at the opening of full afterburner
 */
export const NOZZLE_FLAP_HINGE_Z = -6.15;
export const NOZZLE_MODEL_EXIT_RADIUS = 0.36;

/** Luminance (scene unit) of the hot turbine seen through the nozzle at full dry thrust: 3 cd/m² */
export const NOZZLE_GLOW_LUMINANCE = 3 / 72000;

/**
 * Luminous intensity of the two afterburner flames at full afterburner (cd),
 * as a light on the airframe and the ground: about 20 000 cd/m² seen across
 * some 8 m² of flame [estimate]
 */
export const AFTERBURNER_INTENSITY = 160000;

/** Color of the afterburner's light (linear): the orange of its soot */
export const AFTERBURNER_LIGHT_COLOR = [1.0, 0.55, 0.25];

/** Luminance (scene unit) of the afterburner flame's core: 100 000 cd/m² */
export const AFTERBURNER_LUMINANCE = 100000 / 72000;
