import { CONFIG } from '../utils/config.js';
import {
  ADAPTIVE_WINDOW_FRAMES,
  ADAPTIVE_TARGET_FRAME_MS,
  ADAPTIVE_DOWN_LOAD,
  ADAPTIVE_UP_LOAD,
  ADAPTIVE_UP_HOLD_MS,
  ADAPTIVE_SCALE_UP_STEP,
  ADAPTIVE_MIN_SCALE_STEP,
  ADAPTIVE_MIN_RENDER_SCALE,
  ADAPTIVE_FALLBACK_HIGH_FRAME_MS,
  ADAPTIVE_FALLBACK_LOW_FRAME_MS,
} from '../constants/rendering.js';

/**
 * Dynamic resolution: scales the scene pass of the render pipeline, whose
 * temporal anti-aliasing reconstructs the output resolution, so that the GPU
 * time of a frame stays within the frame budget (ADAPTIVE_TARGET_FRAME_MS).
 * The output resolution (pixel ratio) and the effects after the reconstruction
 * are left alone.
 *
 * The signal is the GPU time of the frame, as a median over a window of frames.
 * The frame interval would not do: at vsync it is the refresh interval, so a
 * 60 Hz display reads as a 16.7 ms frame whatever the frame costs.
 *
 * A light frame does not show its headroom either: the GPU lowers its clock
 * until the frame fills about three quarters of the refresh interval. The scale
 * therefore drops in proportion to the overload as soon as the GPU time nears
 * the budget, and rises by small steps after a hold, whenever the GPU time is
 * clearly below the budget; a step too far is undone after one window.
 *
 * Without GPU timing (WebGL2 without timer queries, WebGPU without timestamp
 * queries) the frame interval is used, with thresholds wide enough for vsync.
 *
 * CONFIG.renderScale is the highest scale; with CONFIG.dynamicResolution off the
 * scene pass is rendered at that scale. Raising it moves the scale straight to it.
 */
export default class AdaptiveQualityManager {
  /**
   * @param {import('./ScenePipeline.js').default} pipeline
   * @param {import('../benchmark/GPUTimer.js').default} gpuTimer
   */
  constructor(pipeline, gpuTimer) {
    this._pipeline = pipeline;
    this._gpuTimer = gpuTimer;
    this._window = new Float32Array(ADAPTIVE_WINDOW_FRAMES);
    this._count = 0;
    this._lastChange = performance.now();
    this._maxScale = CONFIG.renderScale;
    this._apply(CONFIG.renderScale);
  }

  /** @param {number} frameTimeMs - interval since the previous frame */
  update(frameTimeMs) {
    const maxScale = CONFIG.renderScale;
    // A raised ceiling (a higher image sharpness picked in the menu) applies at once,
    // instead of being reached step by step; the scale drops again if the GPU cannot keep up
    if (maxScale > this._maxScale) {
      this._apply(maxScale);
      this._lastChange = performance.now();
    }
    this._maxScale = maxScale;
    const scale = this._pipeline.renderScale;
    if (!CONFIG.dynamicResolution || scale > maxScale) {
      if (scale !== maxScale) this._apply(maxScale);
      if (!CONFIG.dynamicResolution) return;
    }

    const measuresGpu = this._gpuTimer.measuresGpu;
    this._window[this._count++] = measuresGpu ? this._gpuTimer.getLastGPUTimeMs() : frameTimeMs;
    if (this._count < ADAPTIVE_WINDOW_FRAMES) return;
    this._count = 0;
    const median = this._window.sort()[ADAPTIVE_WINDOW_FRAMES >> 1];
    if (!(median > 0)) return;

    const now = performance.now();
    const current = this._pipeline.renderScale;
    let target = current;
    if (measuresGpu) {
      if (median > ADAPTIVE_TARGET_FRAME_MS * ADAPTIVE_DOWN_LOAD) {
        // Pixel count, hence GPU time, goes with the square of the scale
        target = current * Math.sqrt((ADAPTIVE_TARGET_FRAME_MS * ADAPTIVE_UP_LOAD) / median);
        target = Math.min(target, current - ADAPTIVE_MIN_SCALE_STEP);
      } else if (median < ADAPTIVE_TARGET_FRAME_MS * ADAPTIVE_UP_LOAD && now - this._lastChange > ADAPTIVE_UP_HOLD_MS) {
        target = current + ADAPTIVE_SCALE_UP_STEP;
      }
    } else if (median > ADAPTIVE_FALLBACK_HIGH_FRAME_MS) {
      target = current - ADAPTIVE_MIN_SCALE_STEP;
    } else if (median < ADAPTIVE_FALLBACK_LOW_FRAME_MS && now - this._lastChange > ADAPTIVE_UP_HOLD_MS) {
      target = current + ADAPTIVE_SCALE_UP_STEP;
    }

    target = Math.min(maxScale, Math.max(ADAPTIVE_MIN_RENDER_SCALE, target));
    if (Math.abs(target - current) >= ADAPTIVE_MIN_SCALE_STEP / 2) {
      this._apply(target);
      this._lastChange = now;
    }
  }

  _apply(scale) {
    // Whole hundredths: no render target reallocation for imperceptible changes
    this._pipeline.setRenderScale(Math.round(scale * 100) / 100);
    this._count = 0;
  }
}
