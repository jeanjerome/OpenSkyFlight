import { Node, NodeUpdateType } from 'three/webgpu';
import {
  Fn,
  If,
  Loop,
  atomicAdd,
  atomicLoad,
  atomicStore,
  clamp,
  exp2,
  float,
  instanceIndex,
  instancedArray,
  int,
  ivec2,
  log2,
  luminance,
  select,
  texture,
  uint,
  uniform,
  vec2,
} from 'three/tsl';
import {
  AUTO_EXPOSURE_BINS,
  AUTO_EXPOSURE_LOG_MIN,
  AUTO_EXPOSURE_LOG_MAX,
  AUTO_EXPOSURE_GRID,
  AUTO_EXPOSURE_LOW_PERCENTILE,
  AUTO_EXPOSURE_HIGH_PERCENTILE,
  AUTO_EXPOSURE_REFERENCE_LUMINANCE,
  AUTO_EXPOSURE_COMPENSATION,
  AUTO_EXPOSURE_MIN_EV,
  AUTO_EXPOSURE_MAX_EV,
  AUTO_EXPOSURE_SPEED_TO_BRIGHT,
  AUTO_EXPOSURE_SPEED_TO_DARK,
} from '../constants/rendering.js';

const LOG_RANGE = AUTO_EXPOSURE_LOG_MAX - AUTO_EXPOSURE_LOG_MIN;
const BIN_WIDTH = LOG_RANGE / AUTO_EXPOSURE_BINS;
const [GRID_X, GRID_Y] = AUTO_EXPOSURE_GRID;

/**
 * Automatic exposure, metered on the GPU like a camera's matrix metering.
 *
 * Every frame a compute pass samples the HDR image on a fixed grid and builds a
 * histogram of log2 luminance; a second pass averages the log luminance of the
 * samples between two percentiles (so that the sun disc and the darkest
 * shadows do not sway it) and moves the adapted luminance toward it, faster
 * when the scene gets brighter than when it gets darker, as the eye does.
 * The state stays on the GPU: the node evaluates to the exposure factor read
 * from it, with no readback.
 *
 * The factor corrects the base exposure of the tone mapping
 * (renderer.toneMappingExposure, calibrated for a reference scene luminance):
 * it is 1 when the adapted luminance equals AUTO_EXPOSURE_REFERENCE_LUMINANCE and
 * otherwise compensates part of the deviation (AUTO_EXPOSURE_COMPENSATION),
 * within [AUTO_EXPOSURE_MIN_EV, AUTO_EXPOSURE_MAX_EV] stops.
 *
 * Needs compute shaders with atomics: WebGPU backend only.
 */
export default class AutoExposureNode extends Node {
  static get type() {
    return 'AutoExposureNode';
  }

  /** @param {import('three/webgpu').TextureNode} inputNode - HDR image to meter */
  constructor(inputNode) {
    super('float');
    this.inputNode = inputNode;
    this.updateBeforeType = NodeUpdateType.FRAME;

    this._histogram = instancedArray(AUTO_EXPOSURE_BINS, 'uint').toAtomic();
    // [0]: adapted log2 luminance
    this._state = instancedArray(1, 'float');
    this._deltaTime = uniform(0);
    // 1 on the first frame after (re)starting: adopt the metered luminance at once
    this._reset = uniform(1);

    this._meterNode = null;
    this._adaptNode = null;
  }

  /** Adopt the next metered luminance without adapting to it gradually. */
  reset() {
    this._reset.value = 1;
  }

  /** @returns {Promise<number>} adapted scene luminance (debugging and measurements) */
  async readAdaptedLuminance(renderer) {
    const buffer = await renderer.getArrayBufferAsync(this._state.value);
    return 2 ** new Float32Array(buffer)[0];
  }

  setup() {
    const image = texture(this.inputNode.value);
    const histogram = this._histogram;
    const state = this._state;

    this._meterNode = Fn(() => {
      const size = image.size(int(0));
      const x = instanceIndex.mod(uint(GRID_X));
      const y = instanceIndex.div(uint(GRID_X));
      const uv = vec2(float(x).add(0.5).div(GRID_X), float(y).add(0.5).div(GRID_Y));
      const texel = ivec2(uv.mul(vec2(size)));
      const lum = luminance(image.load(texel).rgb);
      // Black pixels (no light at all) carry no exposure information
      If(lum.greaterThan(2 ** AUTO_EXPOSURE_LOG_MIN), () => {
        const position = log2(lum).sub(AUTO_EXPOSURE_LOG_MIN).div(BIN_WIDTH);
        const bin = clamp(int(position), int(0), int(AUTO_EXPOSURE_BINS - 1));
        atomicAdd(histogram.element(bin), uint(1));
      });
    })().compute(GRID_X * GRID_Y, [64]);

    this._adaptNode = Fn(() => {
      const total = float(0).toVar();
      Loop(AUTO_EXPOSURE_BINS, ({ i }) => {
        total.addAssign(float(atomicLoad(histogram.element(i))));
      });

      const low = total.mul(AUTO_EXPOSURE_LOW_PERCENTILE);
      const high = total.mul(AUTO_EXPOSURE_HIGH_PERCENTILE);
      const below = float(0).toVar();
      const weightedLog = float(0).toVar();
      const weight = float(0).toVar();
      Loop(AUTO_EXPOSURE_BINS, ({ i }) => {
        const count = float(atomicLoad(histogram.element(i)));
        // Part of this bin's samples that falls between the two percentiles
        const inside = clamp(below.add(count), low, high).sub(clamp(below, low, high));
        const binLog = float(i).add(0.5).mul(BIN_WIDTH).add(AUTO_EXPOSURE_LOG_MIN);
        weightedLog.addAssign(inside.mul(binLog));
        weight.addAssign(inside);
        below.addAssign(count);
        atomicStore(histogram.element(i), uint(0));
      });

      If(weight.greaterThan(0), () => {
        const target = weightedLog.div(weight);
        const current = state.element(0);
        const speed = select(target.greaterThan(current), AUTO_EXPOSURE_SPEED_TO_BRIGHT, AUTO_EXPOSURE_SPEED_TO_DARK);
        const blend = float(1).sub(exp2(this._deltaTime.mul(speed).mul(-1.4427)));
        current.assign(select(this._reset.greaterThan(0), target, current.add(target.sub(current).mul(blend))));
      });
    })().compute(1, [1]);

    const correction = clamp(
      float(Math.log2(AUTO_EXPOSURE_REFERENCE_LUMINANCE)).sub(state.element(0)).mul(AUTO_EXPOSURE_COMPENSATION),
      AUTO_EXPOSURE_MIN_EV,
      AUTO_EXPOSURE_MAX_EV,
    );
    return exp2(correction);
  }

  updateBefore(frame) {
    const { renderer } = frame;
    this._deltaTime.value = Math.min(frame.deltaTime || 0, 0.1);
    renderer.compute([this._meterNode, this._adaptNode]);
    this._reset.value = 0;
  }

  dispose() {
    super.dispose();
    this._meterNode?.dispose?.();
    this._adaptNode?.dispose?.();
  }
}
