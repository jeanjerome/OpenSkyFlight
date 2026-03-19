import * as THREE from 'three';
import { CONFIG } from '../utils/config.js';
import Logger from '../utils/Logger.js';
import {
  PITCH_CLAMP,
  MAX_ROLL,
  ROLL_SENSITIVITY,
  ROLL_DAMP_SPEED,
  RATE_DAMP_FACTOR,
  INITIAL_PITCH,
} from '../constants/camera.js';

export default class FPSController {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.position = new THREE.Vector3().copy(camera.position);
    this.yaw = 0;
    this.pitch = INITIAL_PITCH;
    this.roll = 0;
    this.yawRate = 0;
    this.pitchRate = 0;
    this.keys = {};
    this.locked = false;
    this.enabled = true;

    this._lastLogTime = 0;

    this._onMouseMove = this._onMouseMove.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onPointerLockChange = this._onPointerLockChange.bind(this);
    this._onClick = this._onClick.bind(this);

    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
    domElement.addEventListener('click', this._onClick);
  }

  _onClick() {
    if (!this.locked) {
      this.domElement.requestPointerLock();
    }
  }

  _onPointerLockChange() {
    this.locked = document.pointerLockElement === this.domElement;
  }

  _onMouseMove(e) {
    if (!this.locked) return;
    this.yawRate = -e.movementX * CONFIG.mouseSensitivity;
    this.pitchRate = -e.movementY * CONFIG.mouseSensitivity;
    this.yaw -= e.movementX * CONFIG.mouseSensitivity;
    this.pitch -= e.movementY * CONFIG.mouseSensitivity;
    this.pitch = Math.max(-PITCH_CLAMP, Math.min(PITCH_CLAMP, this.pitch));
  }

  _onKeyDown(e) {
    this.keys[e.code] = true;
  }

  _onKeyUp(e) {
    this.keys[e.code] = false;
  }

  update(dt) {
    if (!this.enabled) return;
    const speed = CONFIG.cameraSpeed * dt;
    const sinYaw = Math.sin(this.yaw);
    const cosYaw = Math.cos(this.yaw);
    const cosPitch = Math.cos(this.pitch);
    const sinPitch = Math.sin(this.pitch);

    // Forward vector: follows camera look direction (pitch + yaw)
    const fx = -sinYaw * cosPitch;
    const fy = sinPitch;
    const fz = -cosYaw * cosPitch;

    // Right vector: always horizontal, perpendicular to forward
    const rx = cosYaw;
    const rz = -sinYaw;

    let mx = 0,
      my = 0,
      mz = 0;

    if (this.keys['ArrowUp'] || this.keys['KeyW']) {
      mx += fx;
      my += fy;
      mz += fz;
    }
    if (this.keys['ArrowDown'] || this.keys['KeyS']) {
      mx -= fx;
      my -= fy;
      mz -= fz;
    }
    if (this.keys['ArrowLeft'] || this.keys['KeyA']) {
      mx -= rx;
      mz -= rz;
    }
    if (this.keys['ArrowRight'] || this.keys['KeyD']) {
      mx += rx;
      mz += rz;
    }

    const len = Math.sqrt(mx * mx + my * my + mz * mz);
    if (len > 0) {
      mx /= len;
      my /= len;
      mz /= len;
    }

    this.position.x += mx * speed;
    this.position.y += my * speed;
    this.position.z += mz * speed;

    // Roll (bank) en virage
    const targetRoll = Math.max(-MAX_ROLL, Math.min(MAX_ROLL, this.yawRate * ROLL_SENSITIVITY));
    this.roll += (targetRoll - this.roll) * ROLL_DAMP_SPEED * dt;
    this.yawRate *= Math.max(0, 1 - RATE_DAMP_FACTOR * dt);
    this.pitchRate *= Math.max(0, 1 - RATE_DAMP_FACTOR * dt);

    const now = performance.now();
    if (now - this._lastLogTime > 2000) {
      this._lastLogTime = now;
      const p = this.position;
      Logger.debug(
        'Camera',
        `pos=(${p.x.toFixed(0)}, ${p.y.toFixed(0)}, ${p.z.toFixed(0)}) pitch=${this.pitch.toFixed(2)} yaw=${this.yaw.toFixed(2)}`,
      );
    }
  }

  dispose() {
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    this.domElement.removeEventListener('click', this._onClick);
  }
}
