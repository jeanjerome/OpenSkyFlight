import { CONFIG } from '../utils/config.js';

/**
 * Subsystem timer — measures per-subsystem time within each frame.
 * Usage: timer.begin('terrain'); ... timer.end('terrain');
 */
class SubsystemTimer {
  constructor() {
    this._starts = {};
    this._current = {};
  }

  begin(name) {
    this._starts[name] = performance.now();
  }

  end(name) {
    if (this._starts[name] !== undefined) {
      this._current[name] = performance.now() - this._starts[name];
      delete this._starts[name];
    }
  }

  /** Returns snapshot of current frame's subsystem times and resets. */
  flush() {
    const snap = {};
    for (const k in this._current) {
      snap[k] = Math.round(this._current[k] * 100) / 100;
    }
    this._current = {};
    return snap;
  }
}

export default class MetricsCollector {
  constructor() {
    this.frames = [];
    this.startTime = performance.now();
    this.subsystemTimer = new SubsystemTimer();
  }

  record(renderer, gpuTimer) {
    const now = performance.now();
    const timestamp = now - this.startTime;
    const info = renderer.info;
    const prev = this.frames.length > 0 ? this.frames[this.frames.length - 1] : null;
    const frameTime = prev ? timestamp - prev.t : 0;

    // Subsystem timings for this frame
    const subs = this.subsystemTimer.flush();

    // Memory (Chrome only)
    const mem = performance.memory
      ? {
          jsHeapUsed: performance.memory.usedJSHeapSize,
          jsHeapTotal: performance.memory.totalJSHeapSize,
        }
      : null;

    // GPU time (Sprint 4.3)
    const gpuMs = gpuTimer ? gpuTimer.getLastGPUTimeMs() : 0;

    this.frames.push({
      t: Math.round(timestamp * 10) / 10,
      ft: Math.round(frameTime * 10) / 10,
      fps: frameTime > 0 ? Math.round(10000 / frameTime) / 10 : 0,
      tri: info.render.triangles,
      dc: info.render.calls,
      geo: info.memory.geometries,
      tex: info.memory.textures,
      subs,
      mem,
      gpu: gpuMs > 0 ? Math.round(gpuMs * 100) / 100 : undefined,
    });
  }

  getSummary(_renderer) {
    // Skip first frame (no meaningful frameTime)
    const measured = this.frames.slice(1);
    if (measured.length === 0) return null;

    const fpsValues = measured.map((f) => f.fps).sort((a, b) => a - b);
    const ftValues = measured.map((f) => f.ft).sort((a, b) => a - b);
    const triValues = measured.map((f) => f.tri);
    const dcValues = measured.map((f) => f.dc);

    const percentile = (arr, p) => {
      const idx = Math.max(0, Math.ceil((arr.length * p) / 100) - 1);
      return arr[idx];
    };
    const avg = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;
    const round1 = (v) => Math.round(v * 10) / 10;

    // --- Histogram of frame times ---
    const histogram = { '<8ms': 0, '<16.7ms': 0, '<33.3ms': 0, '<50ms': 0, '>=50ms': 0 };
    for (const f of measured) {
      if (f.ft < 8) histogram['<8ms']++;
      else if (f.ft < 16.7) histogram['<16.7ms']++;
      else if (f.ft < 33.3) histogram['<33.3ms']++;
      else if (f.ft < 50) histogram['<50ms']++;
      else histogram['>=50ms']++;
    }

    // --- Jank detection ---
    const avgFt = avg(measured.map((f) => f.ft));
    let jankCount = 0;
    let longestStableStreak = 0;
    let currentStreak = 0;
    for (const f of measured) {
      if (f.ft > 2 * avgFt) {
        jankCount++;
        currentStreak = 0;
      } else if (f.ft <= 16.7) {
        currentStreak++;
        if (currentStreak > longestStableStreak) longestStableStreak = currentStreak;
      } else {
        currentStreak = 0;
      }
    }

    // --- Subsystem aggregation (avg / p95 / max) ---
    const subsNames = new Set();
    for (const f of measured) {
      if (f.subs) for (const k of Object.keys(f.subs)) subsNames.add(k);
    }
    const subsAgg = {};
    for (const name of subsNames) {
      const vals = measured.map((f) => (f.subs && f.subs[name]) || 0).sort((a, b) => a - b);
      subsAgg[name] = {
        avg: round1(avg(vals)),
        p95: round1(percentile(vals, 95)),
        max: round1(Math.max(...vals)),
      };
    }

    // --- Memory stats ---
    const memFrames = measured.filter((f) => f.mem);
    let memSummary = null;
    if (memFrames.length > 0) {
      const heapUsed = memFrames.map((f) => f.mem.jsHeapUsed);
      memSummary = {
        jsHeapUsed: {
          min: Math.min(...heapUsed),
          max: Math.max(...heapUsed),
          avg: Math.round(avg(heapUsed)),
        },
        geometries: {
          min: Math.min(...measured.map((f) => f.geo)),
          max: Math.max(...measured.map((f) => f.geo)),
          avg: Math.round(avg(measured.map((f) => f.geo))),
        },
        textures: {
          min: Math.min(...measured.map((f) => f.tex)),
          max: Math.max(...measured.map((f) => f.tex)),
          avg: Math.round(avg(measured.map((f) => f.tex))),
        },
      };
    }

    // --- GPU time aggregation ---
    const gpuFrames = measured.filter((f) => f.gpu && f.gpu > 0);
    let gpuSummary = null;
    if (gpuFrames.length > 0) {
      const gpuVals = gpuFrames.map((f) => f.gpu).sort((a, b) => a - b);
      gpuSummary = {
        avg: round1(avg(gpuVals)),
        p95: round1(percentile(gpuVals, 95)),
        max: round1(Math.max(...gpuVals)),
      };
    }

    return {
      totalFrames: this.frames.length,
      fps: {
        avg: round1(avg(fpsValues)),
        min: round1(Math.min(...fpsValues)),
        max: round1(Math.max(...fpsValues)),
        p1: round1(percentile(fpsValues, 1)),
        p5: round1(percentile(fpsValues, 5)),
        p95: round1(percentile(fpsValues, 95)),
      },
      frameTime: {
        avg: round1(avg(ftValues)),
        min: round1(Math.min(...ftValues)),
        max: round1(Math.max(...ftValues)),
        p1: round1(percentile(ftValues, 1)),
        p5: round1(percentile(ftValues, 5)),
        p95: round1(percentile(ftValues, 95)),
      },
      triangles: {
        avg: Math.round(avg(triValues)),
        max: Math.max(...triValues),
      },
      drawCalls: {
        avg: Math.round(avg(dcValues)),
        max: Math.max(...dcValues),
      },
      histogram,
      jankCount,
      longestStableStreak,
      subs: subsAgg,
      mem: memSummary,
      gpuTime: gpuSummary,
    };
  }

  getMachineInfo(renderer) {
    let gpu = 'unknown';
    let backend = 'unknown';

    let gpuTimestamp = false;

    try {
      if (renderer.backend) {
        backend = 'WebGPU';
        gpuTimestamp = !!renderer.backend.trackTimestamp;
        const adapter = renderer.backend.adapter;
        if (adapter) {
          const info = adapter.info || adapter;
          gpu = info.description || info.architecture || info.vendor || info.device || 'WebGPU adapter';
        }
      } else if (renderer.getContext) {
        const gl = renderer.getContext();
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        gpu = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'unknown';
        backend = 'WebGL2';
        gpuTimestamp = !!gl.getExtension('EXT_disjoint_timer_query_webgl2');
      }
    } catch {
      // Graceful fallback if context methods are unavailable
    }

    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      cpuCores: navigator.hardwareConcurrency || 0,
      deviceMemory: navigator.deviceMemory || 0,
      gpu,
      backend,
      gpuTimestamp,
      canvasWidth: renderer.domElement.clientWidth,
      canvasHeight: renderer.domElement.clientHeight,
      pixelRatio: renderer.getPixelRatio(),
    };
  }

  getConfigSnapshot() {
    return {
      hiResMode: CONFIG.hiResMode,
      zoom: CONFIG.zoom,
      fogEnabled: CONFIG.fogEnabled,
      showClouds: CONFIG.showClouds,
      maxPixelRatio: CONFIG.maxPixelRatio,
    };
  }

  buildReport(renderer) {
    const elapsed = (performance.now() - this.startTime) / 1000;
    return {
      version: 2,
      date: new Date().toISOString(),
      duration: Math.round(elapsed * 10) / 10,
      machine: this.getMachineInfo(renderer),
      config: this.getConfigSnapshot(),
      summary: this.getSummary(renderer),
      frames: this.frames,
    };
  }
}
