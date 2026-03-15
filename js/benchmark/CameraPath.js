import { CONFIG } from '../utils/config.js';

const FLIGHT_DURATION = 300; // 5 minutes
const MIN_AGL = 50; // minimum altitude above ground (meters)

export default class CameraPath {
  constructor(camera) {
    // Capture starting state
    this.startX = camera.position.x;
    this.startY = camera.position.y;
    this.startZ = camera.position.z;
    this.startYaw = camera.rotation.y;
    this.startPitch = camera.rotation.x;

    this.totalDuration = FLIGHT_DURATION;
    this.elapsed = 0;
    this.finished = false;

    // Current orientation (will be animated)
    this.yaw = this.startYaw;
    this.pitch = this.startPitch;
  }

  update(dt, camera, getGroundElevation) {
    if (this.finished) return false;

    this.elapsed += dt;
    if (this.elapsed >= this.totalDuration) {
      this.finished = true;
      return false;
    }

    const t = this.elapsed / this.totalDuration; // 0..1 over 5 min

    // Yaw: full 360° loop (returns to start heading)
    this.yaw = this.startYaw + t * Math.PI * 2;

    // Pitch: gentle oscillation, stays slightly nose-down
    this.pitch = -0.08 + Math.sin(t * Math.PI * 6) * 0.06;

    // Apply rotation
    camera.rotation.order = 'YXZ';
    camera.rotation.y = this.yaw;
    camera.rotation.x = this.pitch;
    camera.rotation.z = 0;

    // Move forward (same physics as FPSController with W held)
    const speed = CONFIG.cameraSpeed * dt;
    const sinYaw = Math.sin(this.yaw);
    const cosYaw = Math.cos(this.yaw);
    const cosPitch = Math.cos(this.pitch);
    const sinPitch = Math.sin(this.pitch);

    camera.position.x += -sinYaw * cosPitch * speed;
    camera.position.y += sinPitch * speed;
    camera.position.z += -cosYaw * cosPitch * speed;

    // Clamp altitude: stay at least MIN_AGL above ground
    if (getGroundElevation) {
      const ground = getGroundElevation(camera.position.x, camera.position.z);
      const minY = ground + MIN_AGL;
      if (camera.position.y < minY) {
        camera.position.y = minY;
      }
    }

    return true;
  }

  getElapsed() {
    return this.elapsed;
  }

  isFinished() {
    return this.finished;
  }
}
