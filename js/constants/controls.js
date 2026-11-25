/** Stick deflection below which a gamepad stick reads as centred */
export const GAMEPAD_DEADZONE = 0.15;

/** Exponent of the stick response: fine control near the centre, full rate at the end */
export const GAMEPAD_EXPO = 1.6;

/** Trigger travel below which a gamepad trigger reads as released */
export const GAMEPAD_TRIGGER_DEADZONE = 0.05;

/** Turn rate (rad/s) at full stick in the Exploration mode, at sensitivity 1 */
export const GAMEPAD_YAW_RATE = 1.2;

/** Pitch rate (rad/s) at full stick in the Exploration mode, at sensitivity 1 */
export const GAMEPAD_PITCH_RATE = 0.9;

/**
 * Mouse events per second the turn rates of the mouse are expressed in (the
 * rates drive the banking of the model, see AircraftManager): a stick turning
 * at a given rate banks the aircraft as the mouse turning at the same rate.
 */
export const MOUSE_EVENT_RATE = 120;

/** Buttons and axes of the standard gamepad layout (W3C Gamepad, "standard" mapping) */
export const GAMEPAD = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  BACK: 8,
  START: 9,
  LEFT_STICK_X: 0,
  LEFT_STICK_Y: 1,
  RIGHT_STICK_X: 2,
  RIGHT_STICK_Y: 3,
};
