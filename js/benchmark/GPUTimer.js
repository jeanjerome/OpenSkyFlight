import Logger from '../utils/Logger.js';

/**
 * GPU timing with backend detection.
 * - WebGL2: uses EXT_disjoint_timer_query_webgl2 (reads results with 2-frame delay).
 * - WebGPU: GPU timestamp queries are optional and rarely exposed;
 *   falls back to performance.now() around render calls.
 */
export default class GPUTimer {
  constructor(renderer) {
    this._available = false;
    this._gl = null;
    this._ext = null;
    this._pendingQueries = [];
    this._frameId = 0;
    this._lastGPUTimeMs = 0;
    this._cpuRenderStart = 0;

    // Detect backend: WebGPURenderer exposes a .backend property
    this._isWebGPU = !!renderer.backend;

    if (this._isWebGPU) {
      Logger.info('GPUTimer', 'WebGPU backend — using CPU render timing as surrogate');
    } else {
      // WebGL2 path
      try {
        this._gl = renderer.getContext();
        this._ext = this._gl.getExtension('EXT_disjoint_timer_query_webgl2');
        this._available = !!this._ext;
      } catch (_) {
        // getContext() may not return a WebGL2 context
      }

      if (this._available) {
        Logger.info('GPUTimer', 'EXT_disjoint_timer_query_webgl2 available');
      } else {
        Logger.info('GPUTimer', 'GPU timing not available — falling back to CPU-only metrics');
      }
    }
  }

  get available() {
    return this._available || this._isWebGPU;
  }

  /** Call before renderer.render() */
  beginFrame() {
    if (this._isWebGPU) {
      this._cpuRenderStart = performance.now();
      return;
    }
    if (!this._available) return;
    const gl = this._gl;
    const query = gl.createQuery();
    gl.beginQuery(this._ext.TIME_ELAPSED_EXT, query);
    this._pendingQueries.push({ query, frameId: this._frameId });
    this._frameId++;
  }

  /** Call after renderer.render() */
  endFrame() {
    if (this._isWebGPU) {
      this._lastGPUTimeMs = performance.now() - this._cpuRenderStart;
      return;
    }
    if (!this._available) return;
    const gl = this._gl;
    gl.endQuery(this._ext.TIME_ELAPSED_EXT);

    // Check for disjoint — GPU results may be invalid
    const disjoint = gl.getParameter(this._ext.GPU_DISJOINT_EXT);
    if (disjoint) {
      for (const p of this._pendingQueries) {
        gl.deleteQuery(p.query);
      }
      this._pendingQueries = [];
      return;
    }

    // Harvest results from queries older than 2 frames
    while (this._pendingQueries.length > 0) {
      const oldest = this._pendingQueries[0];
      if (this._frameId - oldest.frameId < 2) break;

      const available = gl.getQueryParameter(oldest.query, gl.QUERY_RESULT_AVAILABLE);
      if (!available) break;

      const nanoseconds = gl.getQueryParameter(oldest.query, gl.QUERY_RESULT);
      this._lastGPUTimeMs = nanoseconds / 1e6;
      gl.deleteQuery(oldest.query);
      this._pendingQueries.shift();
    }

    // Prevent unbounded growth — discard very old queries
    while (this._pendingQueries.length > 10) {
      const old = this._pendingQueries.shift();
      this._gl.deleteQuery(old.query);
    }
  }

  /** Returns the last measured GPU render time in milliseconds. */
  getLastGPUTimeMs() {
    return this._lastGPUTimeMs;
  }

  dispose() {
    for (const p of this._pendingQueries) {
      this._gl.deleteQuery(p.query);
    }
    this._pendingQueries = [];
  }
}
