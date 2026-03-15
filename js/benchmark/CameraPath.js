import { CONFIG } from '../utils/config.js';

const FLIGHT_DURATION = 300; // 5 minutes
const MIN_AGL = 50;          // Safety net altitude above ground (m)
const TARGET_AGL = 150;      // Target altitude above terrain (m)
const LOOKAHEAD_DISTANCES = [200, 500, 1000]; // Terrain probe distances (m)
const PITCH_SMOOTH = 3.0;    // Pitch smoothing factor
const YAW_SMOOTH = 2.0;      // Yaw transition smoothing factor
const BANK_FACTOR = 15;      // Roll intensity in turns
const BANK_SMOOTH = 4.0;     // Roll smoothing factor
const MAX_PITCH = 0.25;      // Max climb pitch (~14°)
const MIN_PITCH = -0.15;     // Max descent pitch (~-8.5°)
const TERRAIN_PITCH_GAIN = 0.003; // Pitch correction gain for altitude error
const SEGMENT_BLEND_TIME = 2.0;   // Seconds of blending between segments

const FLIGHT_SEGMENTS = [
  { duration: 30, yawRate: 0,      pitchBias: 0 },      // straight
  { duration: 25, yawRate: 0.025,  pitchBias: 0 },      // gentle right turn
  { duration: 20, yawRate: 0,      pitchBias: 0 },      // straight
  { duration: 15, yawRate: 0,      pitchBias: 0.04 },   // climb
  { duration: 30, yawRate: -0.03,  pitchBias: 0 },      // left turn
  { duration: 20, yawRate: 0,      pitchBias: -0.03 },  // gentle descent
  { duration: 25, yawRate: 0,      pitchBias: 0 },      // straight
  { duration: 20, yawRate: 0.04,   pitchBias: 0 },      // tight right turn
  { duration: 15, yawRate: 0,      pitchBias: 0.04 },   // climb
  { duration: 20, yawRate: 0,      pitchBias: 0 },      // straight
  { duration: 25, yawRate: -0.025, pitchBias: 0 },      // left turn
  { duration: 15, yawRate: 0,      pitchBias: -0.03 },  // descent
  { duration: 20, yawRate: 0,      pitchBias: 0 },      // straight
  { duration: 20, yawRate: 0.035,  pitchBias: 0 },      // wide right turn
];

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function lerp(a, b, t) {
  return a + (b - a) * clamp(t, 0, 1);
}

export default class CameraPath {
  constructor(camera) {
    this.startX = camera.position.x;
    this.startY = camera.position.y;
    this.startZ = camera.position.z;
    this.startYaw = camera.rotation.y;

    this.totalDuration = FLIGHT_DURATION;
    this.elapsed = 0;
    this.finished = false;

    // Precalculate cumulative segment timestamps
    this.segmentStarts = [];
    let cumulative = 0;
    for (const seg of FLIGHT_SEGMENTS) {
      this.segmentStarts.push(cumulative);
      cumulative += seg.duration;
    }
    this.segmentsTotalDuration = cumulative;

    // Current smoothed orientation
    this.yaw = this.startYaw;
    this.pitch = 0;
    this.roll = 0;
    this.currentYawRate = 0;
    this.currentPitchBias = 0;
  }

  _getSegmentAt(time) {
    // Loop segments if flight exceeds segments total duration
    const loopedTime = time % this.segmentsTotalDuration;

    for (let i = FLIGHT_SEGMENTS.length - 1; i >= 0; i--) {
      if (loopedTime >= this.segmentStarts[i]) {
        const timeInSegment = loopedTime - this.segmentStarts[i];
        return { index: i, timeInSegment };
      }
    }
    return { index: 0, timeInSegment: 0 };
  }

  _getInterpolatedSegmentValues(time) {
    const { index, timeInSegment } = this._getSegmentAt(time);
    const seg = FLIGHT_SEGMENTS[index];
    const nextIndex = (index + 1) % FLIGHT_SEGMENTS.length;
    const nextSeg = FLIGHT_SEGMENTS[nextIndex];

    // Blend during the last SEGMENT_BLEND_TIME seconds of the current segment
    const timeRemaining = seg.duration - timeInSegment;
    if (timeRemaining < SEGMENT_BLEND_TIME && seg.duration > SEGMENT_BLEND_TIME) {
      const blendT = 1 - timeRemaining / SEGMENT_BLEND_TIME;
      // Smooth step for nicer transitions
      const smooth = blendT * blendT * (3 - 2 * blendT);
      return {
        yawRate: lerp(seg.yawRate, nextSeg.yawRate, smooth),
        pitchBias: lerp(seg.pitchBias, nextSeg.pitchBias, smooth),
      };
    }

    return { yawRate: seg.yawRate, pitchBias: seg.pitchBias };
  }

  update(dt, camera, getGroundElevation) {
    if (this.finished) return false;

    this.elapsed += dt;
    if (this.elapsed >= this.totalDuration) {
      this.finished = true;
      return false;
    }

    // 1. Get interpolated segment values
    const { yawRate, pitchBias } = this._getInterpolatedSegmentValues(this.elapsed);

    // 2. Smooth yawRate and pitchBias transitions
    this.currentYawRate = lerp(this.currentYawRate, yawRate, YAW_SMOOTH * dt);
    this.currentPitchBias = lerp(this.currentPitchBias, pitchBias, YAW_SMOOTH * dt);

    // 3. Update yaw
    this.yaw += this.currentYawRate * dt;

    // 4. Terrain lookahead
    let terrainPitchCorrection = 0;
    if (getGroundElevation) {
      const sinYaw = Math.sin(this.yaw);
      const cosYaw = Math.cos(this.yaw);
      let maxElevation = getGroundElevation(camera.position.x, camera.position.z);

      for (const dist of LOOKAHEAD_DISTANCES) {
        const probeX = camera.position.x + (-sinYaw) * dist;
        const probeZ = camera.position.z + (-cosYaw) * dist;
        const elev = getGroundElevation(probeX, probeZ);
        if (elev > maxElevation) {
          maxElevation = elev;
        }
      }

      const targetAltitude = maxElevation + TARGET_AGL;
      const altitudeError = targetAltitude - camera.position.y;
      terrainPitchCorrection = clamp(altitudeError * TERRAIN_PITCH_GAIN, MIN_PITCH, MAX_PITCH);
    }

    // 5. Combine pitch bias and terrain correction
    const targetPitch = clamp(this.currentPitchBias + terrainPitchCorrection, MIN_PITCH, MAX_PITCH);

    // 6. Smooth pitch
    this.pitch = lerp(this.pitch, targetPitch, PITCH_SMOOTH * dt);
    this.pitch = clamp(this.pitch, MIN_PITCH, MAX_PITCH);

    // 7. Roll banking
    this.roll = lerp(this.roll, this.currentYawRate * BANK_FACTOR, BANK_SMOOTH * dt);

    // 8. Apply rotation
    camera.rotation.order = 'YXZ';
    camera.rotation.y = this.yaw;
    camera.rotation.x = this.pitch;
    camera.rotation.z = this.roll;

    // 9. Move forward
    const speed = CONFIG.cameraSpeed * dt;
    const sinYaw = Math.sin(this.yaw);
    const cosYaw = Math.cos(this.yaw);
    const cosPitch = Math.cos(this.pitch);
    const sinPitch = Math.sin(this.pitch);

    camera.position.x += -sinYaw * cosPitch * speed;
    camera.position.y += sinPitch * speed;
    camera.position.z += -cosYaw * cosPitch * speed;

    // 10. Safety net: hard clamp MIN_AGL
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
