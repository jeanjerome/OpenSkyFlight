import { CONFIG } from '../utils/config.js';

export default class FPSController {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.yaw = 0;
    this.pitch = -0.3;
    this.roll = 0;
    this.yawRate = 0;
    this.keys = {};
    this.locked = false;

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
    this.yaw -= e.movementX * CONFIG.mouseSensitivity;
    this.pitch -= e.movementY * CONFIG.mouseSensitivity;
    this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
  }

  _onKeyDown(e) {
    this.keys[e.code] = true;
  }

  _onKeyUp(e) {
    this.keys[e.code] = false;
  }

  update(dt) {
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

    let mx = 0, my = 0, mz = 0;

    if (this.keys['ArrowUp'] || this.keys['KeyW']) { mx += fx; my += fy; mz += fz; }
    if (this.keys['ArrowDown'] || this.keys['KeyS']) { mx -= fx; my -= fy; mz -= fz; }
    if (this.keys['ArrowLeft'] || this.keys['KeyA']) { mx -= rx; mz -= rz; }
    if (this.keys['ArrowRight'] || this.keys['KeyD']) { mx += rx; mz += rz; }

    const len = Math.sqrt(mx * mx + my * my + mz * mz);
    if (len > 0) { mx /= len; my /= len; mz /= len; }

    this.camera.position.x += mx * speed;
    this.camera.position.y += my * speed;
    this.camera.position.z += mz * speed;

    // Roll (bank) en virage
    const targetRoll = Math.max(-0.5, Math.min(0.5, this.yawRate * 25));
    this.roll += (targetRoll - this.roll) * 5 * dt;
    this.yawRate *= Math.max(0, 1 - 8 * dt);

    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    this.camera.rotation.z = this.roll;
  }

  dispose() {
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    this.domElement.removeEventListener('click', this._onClick);
  }
}
