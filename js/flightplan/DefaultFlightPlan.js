import { CONFIG } from '../utils/config.js';
import Waypoint from './Waypoint.js';
import FlightPlan from './FlightPlan.js';

// Reproduced from the old CameraPath segments
const FLIGHT_SEGMENTS = [
  { duration: 30, yawRate: 0, pitchBias: 0 },
  { duration: 25, yawRate: 0.025, pitchBias: 0 },
  { duration: 20, yawRate: 0, pitchBias: 0 },
  { duration: 15, yawRate: 0, pitchBias: 0.04 },
  { duration: 30, yawRate: -0.03, pitchBias: 0 },
  { duration: 20, yawRate: 0, pitchBias: -0.03 },
  { duration: 25, yawRate: 0, pitchBias: 0 },
  { duration: 20, yawRate: 0.04, pitchBias: 0 },
  { duration: 15, yawRate: 0, pitchBias: 0.04 },
  { duration: 20, yawRate: 0, pitchBias: 0 },
  { duration: 25, yawRate: -0.025, pitchBias: 0 },
  { duration: 15, yawRate: 0, pitchBias: -0.03 },
  { duration: 20, yawRate: 0, pitchBias: 0 },
  { duration: 20, yawRate: 0.035, pitchBias: 0 },
];

export function createDefaultFlightPlan(camera) {
  const startX = camera.position.x;
  const startY = camera.position.y;
  const startZ = camera.position.z;
  const startYaw = camera.rotation.y;

  const speed = CONFIG.cameraSpeed;
  const waypoints = [];

  // Simulate the old CameraPath step by step (1 step/s) and place a waypoint
  // at each segment boundary
  let x = startX;
  let y = startY;
  let z = startZ;
  let yaw = startYaw;
  let pitch = 0;

  // First waypoint at start position
  waypoints.push(new Waypoint(x, y, z, yaw));

  for (const seg of FLIGHT_SEGMENTS) {
    const steps = Math.round(seg.duration);
    const dt = seg.duration / steps;

    for (let s = 0; s < steps; s++) {
      yaw += seg.yawRate * dt;
      pitch += (seg.pitchBias - pitch) * 3.0 * dt;

      const sinYaw = Math.sin(yaw);
      const cosYaw = Math.cos(yaw);
      const cosPitch = Math.cos(pitch);
      const sinPitch = Math.sin(pitch);

      x += -sinYaw * cosPitch * speed * dt;
      y += sinPitch * speed * dt;
      z += -cosYaw * cosPitch * speed * dt;
    }

    // Place a waypoint at the end of each segment
    waypoints.push(new Waypoint(x, y, z, yaw));
  }

  return new FlightPlan(waypoints, camera);
}
