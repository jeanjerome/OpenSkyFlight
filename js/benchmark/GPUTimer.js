import Logger from '../utils/Logger.js';

const FRAME_UID = /:f(\d+)$/;
const MAX_TRACKED_FRAMES = 64;

/**
 * GPU timing with backend detection.
 * - WebGPU with timestamp-query: reads the render pass timestamps of each frame.
 * - WebGPU without timestamp-query: falls back to performance.now() around render calls.
 * - WebGL2: uses EXT_disjoint_timer_query_webgl2 (reads results with 2-frame delay).
 *
 * On WebGPU the reported value is the GPU span of one frame: from the start of its
 * first render pass to the end of its last one. Summing pass durations, as
 * `renderer.resolveTimestampsAsync()` does, overcounts on tile-based GPUs (Apple
 * silicon), where a pass starts its vertex work while the previous pass is still
 * shading: on the reference views, the two passes of a frame overlap and their
 * summed durations exceed the span by about 60 %.
 *
 * At vsync a light frame leaves the GPU idle, and the GPU then lowers its clock: the
 * same frame measures 2–3 ms or 6 ms depending on the clock state the driver picked.
 * Set `rendersPerFrame` above 1 while rendering the frame that many times to keep the
 * GPU busy; the reported value is then the span divided by the number of renders.
 */
export default class GPUTimer {
  constructor(renderer) {
    this._renderer = renderer;
    this._available = false;
    this._gl = null;
    this._ext = null;
    this._pendingQueries = [];
    this._frameId = 0;
    this._lastGPUTimeMs = 0;
    this._cpuRenderStart = 0;

    /** Number of times the scene is rendered in each frame (see class comment). */
    this.rendersPerFrame = 1;
    this._rendersByFrame = new Map();
    this._hookedPool = null;
    this._spanTiming = false;

    // Detect backend: WebGPURenderer exposes a .backend property
    this._isWebGPU = !!renderer.backend;
    this._hasTimestampQuery = false;

    if (this._isWebGPU) {
      // Check if trackTimestamp was enabled and the adapter supports it
      this._hasTimestampQuery = !!renderer.backend.trackTimestamp;

      if (this._hasTimestampQuery) {
        Logger.info('GPUTimer', 'WebGPU backend — using native GPU timestamp queries');
      } else {
        Logger.info('GPUTimer', 'WebGPU backend — timestamp-query not available, using CPU render timing as surrogate');
      }
    } else {
      // WebGL2 path
      try {
        this._gl = renderer.getContext();
        this._ext = this._gl.getExtension('EXT_disjoint_timer_query_webgl2');
        this._available = !!this._ext;
      } catch {
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

  /** Whether getLastGPUTimeMs() is a GPU measurement rather than the CPU time of the render call */
  get measuresGpu() {
    return this._isWebGPU ? this._hasTimestampQuery : this._available;
  }

  /** Call before renderer.render() */
  beginFrame() {
    if (this._isWebGPU) {
      if (!this._hasTimestampQuery) {
        this._cpuRenderStart = performance.now();
      }
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
      if (this._hasTimestampQuery) {
        this._trackFrame();
        // Intentional fire-and-forget: the pool resolves at most one batch at a time
        // and the spans are recorded by the hook installed in _hookTimestampPool().
        this._renderer
          .resolveTimestampsAsync('render')
          .then((durationMs) => {
            if (!this._spanTiming && durationMs > 0) this._lastGPUTimeMs = durationMs;
          })
          .catch(() => {
            // Silently ignore — timestamp may not be available on every frame
          });
      } else {
        this._lastGPUTimeMs = (performance.now() - this._cpuRenderStart) / this.rendersPerFrame;
      }
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

  /** Remembers how many renders the current frame holds, keyed by the renderer's frame id. */
  _trackFrame() {
    this._rendersByFrame.set(this._renderer.info.frame, this.rendersPerFrame);
    if (this._rendersByFrame.size > MAX_TRACKED_FRAMES) {
      this._rendersByFrame.delete(this._rendersByFrame.keys().next().value);
    }
    this._hookTimestampPool();
  }

  /**
   * three (r183) resolves the render timestamps into a mapped buffer and keeps only
   * per-pass durations. Read the raw begin/end timestamps when three maps that buffer,
   * so that the span of each frame can be computed. The pool is created with the first
   * timed render pass; if its layout differs (other three release), fall back to the
   * summed durations returned by resolveTimestampsAsync().
   */
  _hookTimestampPool() {
    const pool = this._renderer.backend.timestampQueryPool?.render;
    if (!pool || pool === this._hookedPool) return;
    this._hookedPool = pool;

    const buffer = pool.resultBuffer;
    if (typeof pool._resolveQueries !== 'function' || !(pool.queryOffsets instanceof Map) || !buffer?.getMappedRange) {
      Logger.warn('GPUTimer', 'Unknown timestamp pool layout — reporting summed pass durations');
      return;
    }
    this._spanTiming = true;

    let offsets = null;
    const resolveQueries = pool._resolveQueries.bind(pool);
    pool._resolveQueries = () => {
      offsets = new Map(pool.queryOffsets);
      return resolveQueries();
    };

    const getMappedRange = buffer.getMappedRange.bind(buffer);
    buffer.getMappedRange = (offset, size) => {
      const range = getMappedRange(offset, size);
      if (offsets) this._recordSpans(new BigUint64Array(range), offsets);
      offsets = null;
      return range;
    };
  }

  /** Stores the GPU span of the most recent frame found in a resolved batch. */
  _recordSpans(times, offsets) {
    const frames = new Map();
    for (const [uid, base] of offsets) {
      const match = FRAME_UID.exec(uid);
      if (!match) continue;
      const start = times[base];
      const end = times[base + 1];
      if (end <= start) continue;
      const frame = Number(match[1]);
      const span = frames.get(frame);
      if (!span) {
        frames.set(frame, { start, end });
      } else {
        if (start < span.start) span.start = start;
        if (end > span.end) span.end = end;
      }
    }
    if (frames.size === 0) return;

    const lastFrame = Math.max(...frames.keys());
    const { start, end } = frames.get(lastFrame);
    const renders = this._rendersByFrame.get(lastFrame) ?? 1;
    this._lastGPUTimeMs = Number(end - start) / 1e6 / renders;
  }

  /** Returns the last measured GPU render time in milliseconds. */
  getLastGPUTimeMs() {
    return this._lastGPUTimeMs;
  }

  dispose() {
    if (this._gl) {
      for (const p of this._pendingQueries) {
        this._gl.deleteQuery(p.query);
      }
    }
    this._pendingQueries = [];
  }
}
