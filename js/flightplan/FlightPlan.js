import * as THREE from 'three';
import { CONFIG } from '../utils/config.js';

const MIN_AGL = 50;
const TARGET_AGL = 150;
const LOOKAHEAD_DISTANCES = [200, 500, 1000];
const PITCH_SMOOTH = 3.0;
const YAW_SMOOTH = 3.0;
const MAX_PITCH = 0.25;
const MIN_PITCH = -0.15;
const TERRAIN_PITCH_GAIN = 0.003;

function clamp(v, min, max) { return v < min ? min : v > max ? max : v; }
function lerp(a, b, t) { return a + (b - a) * clamp(t, 0, 1); }
function angleDiff(a, b) { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }
function lerpAngle(a, b, t) { return a + angleDiff(b, a) * clamp(t, 0, 1); }

export default class FlightPlan {
  constructor(waypoints, camera) {
    this.waypoints = waypoints;
    this.elapsed = 0;
    this.finished = false;

    // Current orientation (smoothed)
    this.yaw = camera.rotation.y;
    this.pitch = camera.rotation.x || 0;
    this.roll = 0;
    this.yawRate = 0;
    this.pitchRate = 0;

    this._buildSpline();
  }

  _buildSpline() {
    const points = this.waypoints.map(wp => wp.position.clone());
    this.positionSpline = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.5);

    // Total arc length → duration at CONFIG.cameraSpeed
    this.arcLength = this.positionSpline.getLength();
    this.totalDuration = this.arcLength / CONFIG.cameraSpeed;

    // Build yaw keyframes: each waypoint maps to a normalized t value
    this.yawKeyframes = [];
    const lengths = this.positionSpline.getLengths(this.waypoints.length - 1);
    const totalLen = lengths[lengths.length - 1];
    for (let i = 0; i < this.waypoints.length; i++) {
      this.yawKeyframes.push({
        t: totalLen > 0 ? lengths[i] / totalLen : i / (this.waypoints.length - 1),
        yaw: this.waypoints[i].yaw,
      });
    }
  }

  _getYawAtT(t) {
    const kf = this.yawKeyframes;
    if (t <= kf[0].t) return kf[0].yaw;
    if (t >= kf[kf.length - 1].t) return kf[kf.length - 1].yaw;

    for (let i = 0; i < kf.length - 1; i++) {
      if (t >= kf[i].t && t <= kf[i + 1].t) {
        const segT = (t - kf[i].t) / (kf[i + 1].t - kf[i].t);
        // Smoothstep
        const smooth = segT * segT * (3 - 2 * segT);
        return lerpAngle(kf[i].yaw, kf[i + 1].yaw, smooth);
      }
    }
    return kf[kf.length - 1].yaw;
  }

  update(dt, camera, getGroundElevation) {
    if (this.finished) return false;

    this.elapsed += dt;
    if (this.elapsed >= this.totalDuration) {
      this.finished = true;
      return false;
    }

    const t = clamp(this.elapsed / this.totalDuration, 0, 1);

    // 1. Position from spline (arc-length parameterization = constant speed)
    const targetPos = this.positionSpline.getPointAt(t);

    // 2. Yaw from spline tangent (aligns nose with travel direction)
    const tangent = this.positionSpline.getTangentAt(t);
    const targetYaw = Math.atan2(-tangent.x, -tangent.z);

    // 3. Pitch from spline tangent
    let targetPitch = Math.asin(clamp(tangent.y, -1, 1));
    targetPitch = clamp(targetPitch, MIN_PITCH, MAX_PITCH);

    // 4. Terrain avoidance
    if (getGroundElevation) {
      const sinYaw = Math.sin(this.yaw);
      const cosYaw = Math.cos(this.yaw);
      let maxElevation = getGroundElevation(targetPos.x, targetPos.z);

      for (const dist of LOOKAHEAD_DISTANCES) {
        const probeX = targetPos.x + (-sinYaw) * dist;
        const probeZ = targetPos.z + (-cosYaw) * dist;
        const elev = getGroundElevation(probeX, probeZ);
        if (elev > maxElevation) maxElevation = elev;
      }

      const targetAltitude = maxElevation + TARGET_AGL;
      if (targetPos.y < targetAltitude) {
        const altitudeError = targetAltitude - targetPos.y;
        const correction = clamp(altitudeError * TERRAIN_PITCH_GAIN, 0, MAX_PITCH);
        targetPitch = clamp(targetPitch + correction, MIN_PITCH, MAX_PITCH);
        targetPos.y = Math.max(targetPos.y, maxElevation + MIN_AGL);
      }
    }

    // 5. Smooth yaw — compute rate before updating
    const prevYaw = this.yaw;
    const prevPitch = this.pitch;
    this.yaw = lerpAngle(this.yaw, targetYaw, YAW_SMOOTH * dt);

    // 6. Smooth pitch
    this.pitch = lerp(this.pitch, targetPitch, PITCH_SMOOTH * dt);
    this.pitch = clamp(this.pitch, MIN_PITCH, MAX_PITCH);

    // 7. Expose per-frame deltas (same scale as FPSController.yawRate/pitchRate)
    this.yawRate = angleDiff(this.yaw, prevYaw);
    this.pitchRate = this.pitch - prevPitch;

    // 8. Apply position and rotation (no roll — AircraftManager handles visual banking)
    camera.position.copy(targetPos);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = this.yaw;
    camera.rotation.x = this.pitch;
    camera.rotation.z = 0;

    // 9. Safety net: hard clamp MIN_AGL
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

  getProgress() {
    return this.totalDuration > 0 ? clamp(this.elapsed / this.totalDuration, 0, 1) : 0;
  }

  getNextWaypointIndex() {
    const t = this.getProgress();
    for (let i = 0; i < this.yawKeyframes.length; i++) {
      if (this.yawKeyframes[i].t > t) return i;
    }
    return this.waypoints.length - 1;
  }

  getSplinePoints(n) {
    if (!this.positionSpline) return [];
    const pts = [];
    for (let i = 0; i <= n; i++) {
      pts.push(this.positionSpline.getPointAt(i / n));
    }
    return pts;
  }
}
