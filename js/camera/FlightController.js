import * as THREE from 'three';
import { CONFIG } from '../utils/config.js';
import Logger from '../utils/Logger.js';
import {
  RATE_DAMP_FACTOR,
  INITIAL_PITCH,
} from '../constants/camera.js';

export default class FlightController {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.position = new THREE.Vector3().copy(camera.position);
    this.quaternion = new THREE.Quaternion();
    this.yaw = 0;
    this.pitch = INITIAL_PITCH;
    this.yawRate = 0;
    this.pitchRate = 0;
    this.keys = {};
    this.locked = false;
    this.enabled = true;

    this._pendingYaw = 0;
    this._pendingPitch = 0;
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this._qYaw = new THREE.Quaternion();
    this._qPitch = new THREE.Quaternion();
    this._axisY = new THREE.Vector3(0, 1, 0);
    this._axisX = new THREE.Vector3(1, 0, 0);
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._lastLogTime = 0;

    // Initialize quaternion from initial pitch
    this.setOrientation(0, INITIAL_PITCH);

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
    this._pendingYaw += -e.movementX * CONFIG.mouseSensitivity;
    this._pendingPitch += -e.movementY * CONFIG.mouseSensitivity;
  }

  _onKeyDown(e) {
    this.keys[e.code] = true;
  }

  _onKeyUp(e) {
    this.keys[e.code] = false;
  }

  setOrientation(yaw, pitch) {
    this._euler.set(pitch, yaw, 0, 'YXZ');
    this.quaternion.setFromEuler(this._euler);
    this.yaw = yaw;
    this.pitch = pitch;
    this._pendingYaw = 0;
    this._pendingPitch = 0;
  }

  update(dt) {
    if (!this.enabled) return;

    // Accumulate yaw/pitch as scalars (no gimbal lock)
    this.yaw += this._pendingYaw;
    this.pitch += this._pendingPitch;
    this._pendingYaw = 0;
    this._pendingPitch = 0;

    // Rebuild quaternion from scalar angles
    this._euler.set(this.pitch, this.yaw, 0, 'YXZ');
    this.quaternion.setFromEuler(this._euler);

    // Derive forward and right vectors from quaternion
    this._forward.set(0, 0, -1).applyQuaternion(this.quaternion);
    this._right.set(1, 0, 0).applyQuaternion(this.quaternion);

    const speed = CONFIG.cameraSpeed * dt;
    const fx = this._forward.x;
    const fy = this._forward.y;
    const fz = this._forward.z;
    const rx = this._right.x;
    const rz = this._right.z;

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
