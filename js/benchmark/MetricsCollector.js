import { CONFIG } from '../utils/config.js';

export default class MetricsCollector {
  constructor() {
    this.frames = [];
    this.startTime = performance.now();
  }

  record(renderer) {
    const now = performance.now();
    const timestamp = now - this.startTime;
    const info = renderer.info;
    const prev = this.frames.length > 0 ? this.frames[this.frames.length - 1] : null;
    const frameTime = prev ? timestamp - prev.t : 0;

    this.frames.push({
      t: Math.round(timestamp * 10) / 10,
      ft: Math.round(frameTime * 10) / 10,
      fps: frameTime > 0 ? Math.round(10000 / frameTime) / 10 : 0,
      tri: info.render.triangles,
      dc: info.render.calls,
      geo: info.memory.geometries,
      tex: info.memory.textures,
    });
  }

  getSummary(renderer) {
    // Skip first frame (no meaningful frameTime)
    const measured = this.frames.slice(1);
    if (measured.length === 0) return null;

    const fpsValues = measured.map(f => f.fps).sort((a, b) => a - b);
    const ftValues = measured.map(f => f.ft).sort((a, b) => a - b);
    const triValues = measured.map(f => f.tri);
    const dcValues = measured.map(f => f.dc);

    const percentile = (arr, p) => {
      const idx = Math.max(0, Math.ceil(arr.length * p / 100) - 1);
      return arr[idx];
    };
    const avg = arr => arr.reduce((s, v) => s + v, 0) / arr.length;

    return {
      totalFrames: this.frames.length,
      fps: {
        avg: Math.round(avg(fpsValues) * 10) / 10,
        min: Math.round(Math.min(...fpsValues) * 10) / 10,
        max: Math.round(Math.max(...fpsValues) * 10) / 10,
        p1: Math.round(percentile(fpsValues, 1) * 10) / 10,
        p5: Math.round(percentile(fpsValues, 5) * 10) / 10,
        p95: Math.round(percentile(fpsValues, 95) * 10) / 10,
      },
      frameTime: {
        avg: Math.round(avg(ftValues) * 10) / 10,
        min: Math.round(Math.min(...ftValues) * 10) / 10,
        max: Math.round(Math.max(...ftValues) * 10) / 10,
        p1: Math.round(percentile(ftValues, 1) * 10) / 10,
        p5: Math.round(percentile(ftValues, 5) * 10) / 10,
        p95: Math.round(percentile(ftValues, 95) * 10) / 10,
      },
      triangles: {
        avg: Math.round(avg(triValues)),
        max: Math.max(...triValues),
      },
      drawCalls: {
        avg: Math.round(avg(dcValues)),
        max: Math.max(...dcValues),
      },
    };
  }

  getMachineInfo(renderer) {
    const gl = renderer.getContext();
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'unknown';

    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      cpuCores: navigator.hardwareConcurrency || 0,
      deviceMemory: navigator.deviceMemory || 0,
      gpu,
      canvasWidth: renderer.domElement.clientWidth,
      canvasHeight: renderer.domElement.clientHeight,
      pixelRatio: renderer.getPixelRatio(),
    };
  }

  getConfigSnapshot() {
    return {
      terrainMode: CONFIG.terrainMode,
      chunkResolution: CONFIG.chunkResolution,
      viewDistance: CONFIG.viewDistance,
      hiResMode: CONFIG.hiResMode,
      wireframe: CONFIG.wireframe,
      zoom: CONFIG.zoom,
      fogEnabled: CONFIG.fogEnabled,
      showClouds: CONFIG.showClouds,
      maxPixelRatio: CONFIG.maxPixelRatio,
    };
  }

  buildReport(renderer) {
    const elapsed = (performance.now() - this.startTime) / 1000;
    return {
      version: 1,
      date: new Date().toISOString(),
      duration: Math.round(elapsed * 10) / 10,
      machine: this.getMachineInfo(renderer),
      config: this.getConfigSnapshot(),
      summary: this.getSummary(renderer),
      frames: this.frames,
    };
  }
}
