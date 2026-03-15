import CameraPath from './CameraPath.js';
import MetricsCollector from './MetricsCollector.js';
import Logger from '../utils/Logger.js';

const WARMUP_DURATION = 15; // seconds — camera stays still, tiles load

export default class BenchmarkRunner {
  constructor() {
    this.running = false;
    this.warmup = false;
    this.warmupElapsed = 0;
    this.cameraPath = null;
    this.metrics = null;
    this.getGroundElevation = null;
  }

  isRunning() {
    return this.running;
  }

  isWarmup() {
    return this.warmup;
  }

  getElapsed() {
    if (this.warmup) return 0;
    return this.cameraPath ? this.cameraPath.getElapsed() : 0;
  }

  getWarmupRemaining() {
    return Math.max(0, WARMUP_DURATION - this.warmupElapsed);
  }

  start(fpsController, camera, getGroundElevation) {
    if (this.running) return;
    this.running = true;
    this.warmup = true;
    this.warmupElapsed = 0;
    this.cameraPath = new CameraPath(camera);
    this.metrics = null;
    this.getGroundElevation = getGroundElevation;
    fpsController.enabled = false;
    Logger.info('Benchmark', `Warmup ${WARMUP_DURATION}s — then ${this.cameraPath.totalDuration}s benchmark`);
  }

  stop(fpsController, renderer) {
    if (!this.running) return;
    this.running = false;
    this.warmup = false;
    fpsController.enabled = true;

    if (this.metrics) {
      const report = this.metrics.buildReport(renderer);
      if (report.summary) {
        Logger.info('Benchmark', `Completed — ${report.summary.totalFrames} frames, avg ${report.summary.fps.avg} FPS`);
        Logger.info('Benchmark', `P1=${report.summary.fps.p1} P5=${report.summary.fps.p5} min=${report.summary.fps.min} max=${report.summary.fps.max}`);
        this._downloadJSON(report);
      }
    }

    this.cameraPath = null;
    this.metrics = null;
    this.getGroundElevation = null;
  }

  update(dt, renderer, camera, fpsController) {
    if (!this.running) return;

    if (this.warmup) {
      this.warmupElapsed += dt;
      // Camera stays still during warmup — tiles load around it
      if (this.warmupElapsed >= WARMUP_DURATION) {
        this.warmup = false;
        this.metrics = new MetricsCollector();
        Logger.info('Benchmark', 'Warmup done — recording started');
      }
      return;
    }

    const ok = this.cameraPath.update(dt, camera, this.getGroundElevation);
    if (!ok) {
      this.stop(fpsController, renderer);
      return;
    }

    this.metrics.record(renderer);
  }

  _downloadJSON(report) {
    const json = JSON.stringify(report, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.download = `benchmark-${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
