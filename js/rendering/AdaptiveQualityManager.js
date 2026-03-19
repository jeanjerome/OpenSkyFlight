import { CONFIG } from '../utils/config.js';
import {
  FRAME_TIME_RING_SIZE,
  ADAPTIVE_MIN_SAMPLES,
  ADAPTIVE_HIGH_FRAME_TIME,
  ADAPTIVE_LOW_FRAME_TIME,
  ADAPTIVE_SCALE_DOWN_STEP,
  ADAPTIVE_SCALE_UP_STEP,
  ADAPTIVE_MIN_PIXEL_RATIO,
  ADAPTIVE_RATIO_EPSILON,
} from '../constants/rendering.js';

export default class AdaptiveQualityManager {
  constructor(renderer) {
    this._renderer = renderer;
    this._basePixelRatio = Math.min(window.devicePixelRatio, CONFIG.maxPixelRatio);
    this._currentPixelRatio = this._basePixelRatio;
    this._ringBuffer = new Float32Array(FRAME_TIME_RING_SIZE);
    this._ringIndex = 0;
    this._ringFilled = false;
  }

  update(frameTimeMs) {
    this._ringBuffer[this._ringIndex] = frameTimeMs;
    this._ringIndex = (this._ringIndex + 1) % FRAME_TIME_RING_SIZE;
    if (this._ringIndex === 0) this._ringFilled = true;

    const count = this._ringFilled ? FRAME_TIME_RING_SIZE : this._ringIndex;
    if (count < ADAPTIVE_MIN_SAMPLES) return;

    let sum = 0;
    for (let i = 0; i < count; i++) sum += this._ringBuffer[i];
    const avgFt = sum / count;

    let targetRatio = this._currentPixelRatio;
    if (avgFt > ADAPTIVE_HIGH_FRAME_TIME) {
      targetRatio = Math.max(ADAPTIVE_MIN_PIXEL_RATIO, this._currentPixelRatio - ADAPTIVE_SCALE_DOWN_STEP);
    } else if (avgFt < ADAPTIVE_LOW_FRAME_TIME) {
      targetRatio = Math.min(this._basePixelRatio, this._currentPixelRatio + ADAPTIVE_SCALE_UP_STEP);
    }

    if (Math.abs(targetRatio - this._currentPixelRatio) > ADAPTIVE_RATIO_EPSILON) {
      this._currentPixelRatio = targetRatio;
      this._renderer.setPixelRatio(this._currentPixelRatio);
    }
  }
}
