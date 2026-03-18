import Waypoint from './Waypoint.js';
import FlightPlan from './FlightPlan.js';
import Logger from '../utils/Logger.js';

export default class FlightPlanRecorder {
  constructor() {
    this._recording = false;
    this._waypoints = [];
    this._plan = null;
    this._autopilotActive = false;
  }

  startRecording() {
    this._recording = true;
    Logger.info('FlightPlan', 'Recording started');
  }

  stopRecording() {
    this._recording = false;
    if (this._waypoints.length >= 2) {
      this._downloadJSON();
    }
    Logger.info('FlightPlan', `Recording stopped — ${this._waypoints.length} waypoints`);
  }

  toJSON() {
    const now = new Date();
    return {
      name: `flightplan-${now.toISOString().slice(0, 19).replace(/[:.]/g, '-')}`,
      date: now.toISOString(),
      waypoints: this._waypoints.map(wp => ({
        x: Math.round(wp.position.x * 10) / 10,
        y: Math.round(wp.position.y * 10) / 10,
        z: Math.round(wp.position.z * 10) / 10,
        yaw: Math.round(wp.yaw * 10000) / 10000,
      })),
    };
  }

  _downloadJSON() {
    const data = this.toJSON();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${data.name}.json`;
    a.click();
    URL.revokeObjectURL(url);
    Logger.info('FlightPlan', `Downloaded ${data.name}.json`);
  }

  loadFromJSON(data) {
    this.clear();
    if (data.waypoints) {
      for (const wp of data.waypoints) {
        this._waypoints.push(new Waypoint(wp.x, wp.y, wp.z, wp.yaw));
      }
    }
    this._loadedName = data.name || null;
    Logger.info('FlightPlan', `Loaded plan "${data.name}" with ${this._waypoints.length} waypoints`);
  }

  isRecording() {
    return this._recording;
  }

  addWaypoint(camera) {
    const wp = new Waypoint(
      camera.position.x,
      camera.position.y,
      camera.position.z,
      camera.rotation.y
    );
    this._waypoints.push(wp);
    this._plan = null; // invalidate existing plan
    Logger.info('FlightPlan', `Waypoint ${this._waypoints.length} added at (${wp.position.x.toFixed(0)}, ${wp.position.y.toFixed(0)}, ${wp.position.z.toFixed(0)})`);
  }

  buildPlan(camera) {
    if (this._waypoints.length < 2) {
      Logger.warn('FlightPlan', 'Need at least 2 waypoints to build a plan');
      return null;
    }
    this._plan = new FlightPlan(this._waypoints, camera);
    return this._plan;
  }

  clear() {
    this._waypoints = [];
    this._plan = null;
    this._recording = false;
    this._autopilotActive = false;
    Logger.info('FlightPlan', 'Flight plan cleared');
  }

  hasValidPlan() {
    return this._waypoints.length >= 2;
  }

  getPlan() {
    return this._plan;
  }

  getWaypoints() {
    return this._waypoints;
  }

  getWaypointCount() {
    return this._waypoints.length;
  }

  get autopilotActive() {
    return this._autopilotActive;
  }

  set autopilotActive(v) {
    this._autopilotActive = v;
  }
}
