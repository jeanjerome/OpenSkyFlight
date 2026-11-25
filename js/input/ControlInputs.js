import { CONFIG } from '../utils/config.js';
import {
  GAMEPAD,
  GAMEPAD_DEADZONE,
  GAMEPAD_EXPO,
  GAMEPAD_PITCH_RATE,
  GAMEPAD_TRIGGER_DEADZONE,
  GAMEPAD_YAW_RATE,
  MOUSE_EVENT_RATE,
} from '../constants/controls.js';

/** Minor-axis share of a mouse sweep below which it is mouse drift (≈ 7 % typical) */
const MOUSE_DRIFT_RATIO = 0.2;

/**
 * Flight controls from the keyboard, the mouse and a gamepad, gathered once a
 * frame into one set of commands (`commands`):
 * - lookYaw, lookPitch: turn to apply this frame (rad), mouse moves plus stick
 *   rate × frame time; positive yaw turns left, positive pitch raises the nose
 * - yawRate, pitchRate: turn rate of the device this frame, in radians per
 *   mouse event (see MOUSE_EVENT_RATE); null when the device did not turn
 * - forward, strafe: from -1 to 1 (W/S or triggers, A/D or right stick)
 *
 * The mouse steers only while the pointer is locked to the view (click on the
 * view); the keyboard and the gamepad steer without it. Gamepads are read in
 * the standard layout: left stick turns (pulling back raises the nose, unless
 * invertStickPitch), triggers fly forward and backward, right stick slides
 * sideways. Buttons run the handlers given to onButton when pressed.
 */
export default class ControlInputs {
  constructor(domElement) {
    this.domElement = domElement;
    this.keys = {};
    /** Whether the pointer is locked to the view */
    this.locked = false;
    /** Device last used to fly: 'keyboard' | 'mouse' | 'gamepad' */
    this.device = 'keyboard';
    /** Called with the gamepad when one is connected, with null when it is disconnected */
    this.onGamepadChange = null;

    this.commands = { lookYaw: 0, lookPitch: 0, yawRate: null, pitchRate: null, forward: 0, strafe: 0 };

    this._mouseYaw = 0;
    this._mousePitch = 0;
    this._mouseYawRate = null;
    this._mousePitchRate = null;
    this._buttonHandlers = [];
    this._buttonsDown = [];

    this._onMouseMove = this._onMouseMove.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onPointerLockChange = () => {
      this.locked = document.pointerLockElement === this.domElement;
    };
    this._onClick = () => {
      if (!this.locked) this.domElement.requestPointerLock();
    };
    this._onGamepadConnected = (e) => this.onGamepadChange?.(e.gamepad);
    this._onGamepadDisconnected = () => {
      if (!this._gamepad()) this.onGamepadChange?.(null);
    };

    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
    domElement.addEventListener('click', this._onClick);
    window.addEventListener('gamepadconnected', this._onGamepadConnected);
    window.addEventListener('gamepaddisconnected', this._onGamepadDisconnected);
  }

  /**
   * Run a handler when a gamepad button is pressed
   * @param {number} button - index in the standard layout (see GAMEPAD)
   * @param {() => void} handler
   */
  onButton(button, handler) {
    this._buttonHandlers.push({ button, handler });
  }

  /**
   * Gather the commands of this frame; call once per frame, also while paused
   * (dt = 0) so that button presses are seen.
   * @param {number} dt - frame time (s)
   * @returns {ControlInputs['commands']}
   */
  sample(dt) {
    const c = this.commands;

    // Mouse: drop the minor pitch of a mostly horizontal sweep, mouse drift
    let pitch = this._mousePitch;
    const absYaw = Math.abs(this._mouseYaw);
    if (absYaw > 0.0001 && Math.abs(pitch) / absYaw < MOUSE_DRIFT_RATIO) pitch = 0;
    c.lookYaw = this._mouseYaw;
    c.lookPitch = pitch;
    c.yawRate = this._mouseYawRate;
    c.pitchRate = this._mousePitchRate;
    this._mouseYaw = 0;
    this._mousePitch = 0;
    this._mouseYawRate = null;
    this._mousePitchRate = null;

    const k = this.keys;
    let forward = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    let strafe = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);

    const pad = this._gamepad();
    if (pad) {
      const x = stick(pad.axes[GAMEPAD.LEFT_STICK_X]);
      const y = stick(pad.axes[GAMEPAD.LEFT_STICK_Y]);
      const side = stick(pad.axes[GAMEPAD.RIGHT_STICK_X]);
      const throttle = trigger(pad.buttons[GAMEPAD.RT]) - trigger(pad.buttons[GAMEPAD.LT]);

      if (x || y) {
        const sensitivity = CONFIG.gamepadSensitivity;
        const yawRate = -x * GAMEPAD_YAW_RATE * sensitivity;
        const pitchRate = (CONFIG.invertStickPitch ? -y : y) * GAMEPAD_PITCH_RATE * sensitivity;
        c.lookYaw += yawRate * dt;
        c.lookPitch += pitchRate * dt;
        c.yawRate = yawRate / MOUSE_EVENT_RATE;
        c.pitchRate = pitchRate / MOUSE_EVENT_RATE;
      }
      forward += throttle;
      strafe += side;
      if (x || y || side || throttle) this.device = 'gamepad';

      this._readButtons(pad);
    }

    c.forward = Math.max(-1, Math.min(1, forward));
    c.strafe = Math.max(-1, Math.min(1, strafe));
    return c;
  }

  dispose() {
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    this.domElement.removeEventListener('click', this._onClick);
    window.removeEventListener('gamepadconnected', this._onGamepadConnected);
    window.removeEventListener('gamepaddisconnected', this._onGamepadDisconnected);
  }

  /** First connected gamepad, in the standard layout when there is one */
  _gamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let found = null;
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      if (pad.mapping === 'standard') return pad;
      found ??= pad;
    }
    return found;
  }

  _readButtons(pad) {
    for (let i = 0; i < pad.buttons.length; i++) {
      const down = pad.buttons[i].pressed;
      if (down && !this._buttonsDown[i]) {
        this.device = 'gamepad';
        for (const { button, handler } of this._buttonHandlers) if (button === i) handler();
      }
      this._buttonsDown[i] = down;
    }
  }

  _onMouseMove(e) {
    if (!this.locked) return;
    const yaw = -e.movementX * CONFIG.mouseSensitivity;
    const pitch = -e.movementY * CONFIG.mouseSensitivity;
    this._mouseYaw += yaw;
    this._mousePitch += pitch;
    this._mouseYawRate = yaw;
    this._mousePitchRate = pitch;
    this.device = 'mouse';
  }

  _onKeyDown(e) {
    if (isTextField(e.target)) return;
    this.keys[e.code] = true;
  }

  _onKeyUp(e) {
    if (isTextField(e.target)) return;
    this.keys[e.code] = false;
  }
}

function isTextField(target) {
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
}

/** Stick axis with its dead zone removed and the response curve applied, in [-1, 1] */
function stick(value = 0) {
  const magnitude = Math.abs(value);
  if (magnitude <= GAMEPAD_DEADZONE) return 0;
  const travel = Math.min(1, (magnitude - GAMEPAD_DEADZONE) / (1 - GAMEPAD_DEADZONE));
  return Math.sign(value) * Math.pow(travel, GAMEPAD_EXPO);
}

/** Trigger travel in [0, 1], 0 below its dead zone */
function trigger(button) {
  const value = button ? button.value : 0;
  return value > GAMEPAD_TRIGGER_DEADZONE ? value : 0;
}
