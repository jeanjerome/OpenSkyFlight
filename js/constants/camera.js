/** Default field of view (degrees) */
export const DEFAULT_FOV = 70;

/** Default near plane */
export const DEFAULT_NEAR = 1;

/** Default far plane */
export const DEFAULT_FAR = 100000;

/** Starting altitude in realworld mode (meters) */
export const REALWORLD_START_ALTITUDE = 6000;

// --- Chase camera ---

/** Boom distance behind aircraft */
export const BOOM_DISTANCE = 30;

/** Boom height above aircraft */
export const BOOM_HEIGHT = 8;

/** Spring stiffness for yaw following */
export const STIFFNESS_YAW = 8;

/** Spring stiffness for pitch following */
export const STIFFNESS_PITCH = 6;

/** Spring stiffness for roll following */
export const STIFFNESS_ROLL = 15;

/** How much of the aircraft yaw to follow (1.0 = full) */
export const FOLLOW_YAW = 1.0;

/** How much of the aircraft pitch to follow */
export const FOLLOW_PITCH = 0.65;

/** How much of the aircraft roll to follow (0 = no roll follow) */
export const FOLLOW_ROLL = 0.0;

// --- FPS controller ---

/** Maximum pitch angle (just under ±90°) */
export const PITCH_CLAMP = Math.PI / 2 - 0.01;

/** Maximum bank roll during turns */
export const MAX_ROLL = 0.5;

/** Yaw-rate to roll multiplier */
export const ROLL_SENSITIVITY = 25;

/** Roll interpolation speed */
export const ROLL_DAMP_SPEED = 5;

/** Rate damping factor per second */
export const RATE_DAMP_FACTOR = 8;

/** Initial pitch angle */
export const INITIAL_PITCH = -0.3;
