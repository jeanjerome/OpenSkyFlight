import {
  DIRTY_YAW_THRESHOLD,
  DIRTY_PITCH_THRESHOLD,
  DIRTY_ALT_THRESHOLD,
  DIRTY_SPEED_THRESHOLD,
} from '../constants/hud.js';
import HUDRenderer from './hud/HUDRenderer.js';
import FlightPlanMenu from './hud/FlightPlanMenu.js';
import SpeedTracker from './hud/SpeedTracker.js';

/**
 * HUD facade — composes HUDRenderer, FlightPlanMenu, and SpeedTracker.
 * Exposes the same public API as before.
 */
export default class HUD {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.w = 0;
    this.h = 0;
    this.showStats = false;

    this._renderer = new HUDRenderer(this.ctx);
    this._menu = new FlightPlanMenu();
    this._speed = new SpeedTracker();

    // Dirty-flag state for change detection
    this._prevYaw = NaN;
    this._prevPitch = NaN;
    this._prevAlt = NaN;
    this._prevSpeed = NaN;
    this._prevBenchRunning = false;
    this._prevBenchBadgeEpoch = 0;
    this._prevRecording = false;
    this._prevAutopilot = false;
    this._prevWpCount = 0;
    this._prevMenuOpen = false;
    this._forceRedraw = true;

    this.resize();
  }

  toggleStats() {
    this.showStats = !this.showStats;
    this._forceRedraw = true;
    return this.showStats;
  }

  resize(w, h) {
    const dpr = window.devicePixelRatio || 1;
    this.w = w || window.innerWidth;
    this.h = h || window.innerHeight;
    this.canvas.width = this.w * dpr;
    this.canvas.height = this.h * dpr;
    this.canvas.style.width = this.w + 'px';
    this.canvas.style.height = this.h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._forceRedraw = true;
  }

  update(camera, groundElevation, benchmarkRunner, dt, flightPlanRecorder, aircraftState) {
    const yaw = aircraftState ? aircraftState.yaw : camera.rotation.y;
    const pitch = aircraftState ? aircraftState.pitch : camera.rotation.x;
    const altY = aircraftState ? aircraftState.position.y : camera.position.y;

    // Update speed tracker
    this._speed.update(camera.position.x, camera.position.z, dt);
    const speed = this._speed.groundSpeed;

    const benchRunning = benchmarkRunner && benchmarkRunner.isRunning();
    const benchBadgeEpoch = benchRunning
      ? benchmarkRunner.isWarmup()
        ? Math.ceil(benchmarkRunner.getWarmupRemaining())
        : Math.floor(benchmarkRunner.getElapsed())
      : 0;

    const fpRec = flightPlanRecorder;
    const isRecording = fpRec ? fpRec.isRecording() : false;
    const isAutopilot = fpRec ? fpRec.autopilotActive : false;
    const wpCount = fpRec ? fpRec.getWaypointCount() : 0;

    // Dirty-flag — skip redraw if nothing significant changed
    if (
      !this._forceRedraw &&
      Math.abs(yaw - this._prevYaw) < DIRTY_YAW_THRESHOLD &&
      Math.abs(pitch - this._prevPitch) < DIRTY_PITCH_THRESHOLD &&
      Math.abs(altY - this._prevAlt) < DIRTY_ALT_THRESHOLD &&
      Math.abs(speed - this._prevSpeed) < DIRTY_SPEED_THRESHOLD &&
      benchRunning === this._prevBenchRunning &&
      benchBadgeEpoch === this._prevBenchBadgeEpoch &&
      isRecording === this._prevRecording &&
      isAutopilot === this._prevAutopilot &&
      wpCount === this._prevWpCount &&
      this._menu.isOpen === this._prevMenuOpen
    ) {
      return;
    }

    this._prevYaw = yaw;
    this._prevPitch = pitch;
    this._prevAlt = altY;
    this._prevSpeed = speed;
    this._prevBenchRunning = benchRunning;
    this._prevBenchBadgeEpoch = benchBadgeEpoch;
    this._prevRecording = isRecording;
    this._prevAutopilot = isAutopilot;
    this._prevWpCount = wpCount;
    this._prevMenuOpen = this._menu.isOpen;
    this._forceRedraw = false;

    this.ctx.clearRect(0, 0, this.w, this.h);

    this._renderer.drawInstruments(this.w, this.h, yaw, pitch, altY, groundElevation, speed);
    this._renderer.drawBadges(this.w, benchmarkRunner, isRecording, wpCount, isAutopilot, fpRec);
    this._menu.draw(this.ctx, this.w, this.h);
  }

  // --- Flight plan menu delegation ---

  openFlightPlanMenu(files) {
    this._menu.show(files);
    this._forceRedraw = true;
  }

  closeFlightPlanMenu() {
    this._menu.close();
    this._forceRedraw = true;
  }

  isFlightPlanMenuOpen() {
    return this._menu.isOpen;
  }

  selectFlightPlan(index) {
    return this._menu.select(index);
  }
}
