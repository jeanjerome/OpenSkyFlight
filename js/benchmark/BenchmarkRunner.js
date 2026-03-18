import { createDefaultFlightPlan } from '../flightplan/DefaultFlightPlan.js';
import MetricsCollector from './MetricsCollector.js';
import BenchmarkComparator from './BenchmarkComparator.js';
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
    this._lastReport = null;
    this.gpuTimer = null;
    this._stopped = false; // flag to signal stop was called during tickPath
  }

  isRunning() {
    return this.running;
  }

  isWarmup() {
    return this.warmup;
  }

  /** Returns the subsystem timer (for instrumenting the render loop). */
  getSubsystemTimer() {
    return this.metrics ? this.metrics.subsystemTimer : null;
  }

  getElapsed() {
    if (this.warmup) return 0;
    return this.cameraPath ? this.cameraPath.getElapsed() : 0;
  }

  getWarmupRemaining() {
    return Math.max(0, WARMUP_DURATION - this.warmupElapsed);
  }

  start(fpsController, camera, getGroundElevation, gpuTimer, flightPlan) {
    if (this.running) return;
    this.running = true;
    this.warmup = true;
    this.warmupElapsed = 0;
    this.cameraPath = flightPlan || createDefaultFlightPlan(camera);
    this.metrics = null;
    this.getGroundElevation = getGroundElevation;
    this.gpuTimer = gpuTimer || null;
    this._stopped = false;
    fpsController.enabled = false;
    Logger.info('Benchmark', `Warmup ${WARMUP_DURATION}s — then ${this.cameraPath.totalDuration.toFixed(0)}s benchmark`);
  }

  stop(fpsController, renderer) {
    if (!this.running) return;
    this.running = false;
    this.warmup = false;
    this._stopped = true;
    fpsController.enabled = true;

    if (this.metrics) {
      const report = this.metrics.buildReport(renderer);
      this._lastReport = report;

      if (report.summary) {
        Logger.info('Benchmark', `Completed — ${report.summary.totalFrames} frames, avg ${report.summary.fps.avg} FPS`);
        Logger.info('Benchmark', `P1=${report.summary.fps.p1} P5=${report.summary.fps.p5} min=${report.summary.fps.min} max=${report.summary.fps.max}`);

        // A/B comparison against stored baseline
        const comparison = BenchmarkComparator.compare(report);
        if (comparison) {
          BenchmarkComparator.logComparison(comparison);
        }

        this._downloadJSON(report);
      }
    }

    this.cameraPath = null;
    this.metrics = null;
    this.getGroundElevation = null;
  }

  /**
   * Advance camera path and handle warmup timing.
   * Call BEFORE renderer.render() so the camera is positioned for this frame.
   */
  tickPath(dt, camera, fpsController, renderer) {
    if (!this.running) return;

    if (this.warmup) {
      this.warmupElapsed += dt;
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
    }
  }

  /**
   * Record metrics for the current frame.
   * Call AFTER renderer.render() so renderer.info reflects the current frame.
   */
  recordMetrics(renderer) {
    if (!this.running || this.warmup || !this.metrics) return;
    this.metrics.record(renderer, this.gpuTimer);
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
