import * as THREE from 'three';
import { mrt, output, pass, uniform, vec4, velocity } from 'three/tsl';
import { taau } from 'three/addons/tsl/display/TAAUNode.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { BLOOM_STRENGTH, BLOOM_RADIUS } from '../constants/rendering.js';

/** Bloom threshold that no HalfFloat value reaches, until the lighting sets one */
const NO_BLOOM_THRESHOLD = 1e6;

/**
 * Frame rendering through a RenderPipeline: the scene is rendered into a
 * HalfFloat (HDR) target, post-processing effects operate on that linear HDR
 * image, and tone mapping and the output color space conversion are applied
 * once, at the end of the chain.
 *
 * Anti-aliasing is temporal, with upscaling (TAAU): the camera is jittered by a
 * sub-pixel offset every frame and the frames are accumulated, reprojected with
 * a per-pixel velocity buffer written by the scene pass. The scene pass can be
 * rendered below the output resolution (see setRenderScale); the accumulation
 * then reconstructs an output-resolution image from the jittered samples.
 * MSAA is off, as temporal anti-aliasing requires.
 *
 * Bloom spreads the light of the pixels brighter than a threshold over their
 * surroundings, as the scattering in a camera lens or in the eye does. It reads
 * the anti-aliased image, so that sub-pixel highlights do not flicker in the
 * glow, and is added to it before tone mapping. The threshold is a scene
 * radiance set by the lighting (see setBloom).
 *
 * Tone mapping is read from renderer.toneMapping (set by AtmosphericSky, none in
 * SAR mode); the pipeline rebuilds its output node when it changes. The exposure
 * is read live from renderer.toneMappingExposure.
 */
export default class ScenePipeline {
  constructor(renderer, scene, camera) {
    this._renderer = renderer;

    this.scenePass = pass(scene, camera, { samples: 0 });
    // Reversed depth buffer: a 32-bit float depth keeps its precision up to the far plane
    this.scenePass.renderTarget.depthTexture.type = THREE.FloatType;
    this.scenePass.setMRT(mrt({ output, velocity }));

    this.taauNode = taau(
      this.scenePass.getTextureNode('output'),
      this.scenePass.getTextureNode('depth'),
      this.scenePass.getTextureNode('velocity'),
      camera,
    );
    this._antiAliased = this.taauNode.getTextureNode();

    this._bloomThreshold = uniform(NO_BLOOM_THRESHOLD);
    this.bloomNode = bloom(this._antiAliased, BLOOM_STRENGTH, BLOOM_RADIUS, this._bloomThreshold);
    this._bloomEnabled = true;

    this._pipeline = new THREE.RenderPipeline(renderer);
    this._pipeline.outputNode = this._buildOutput();
    this._toneMapping = renderer.toneMapping;
  }

  _buildOutput() {
    if (!this._bloomEnabled) return this._antiAliased;
    return vec4(this._antiAliased.rgb.add(this.bloomNode.rgb), this._antiAliased.a);
  }

  /**
   * @param {boolean} enabled - whether the bloom pass runs
   * @param {number} [threshold] - luminance of the scene radiance (before
   *   exposure) above which pixels bloom
   */
  setBloom(enabled, threshold = NO_BLOOM_THRESHOLD) {
    this._bloomThreshold.value = threshold;
    // A soft knee as wide as the threshold: highlights fade into the bloom
    // instead of popping in as they cross it
    this.bloomNode.smoothWidth.value = threshold;
    if (enabled !== this._bloomEnabled) {
      this._bloomEnabled = enabled;
      this._pipeline.outputNode = this._buildOutput();
      this._pipeline.needsUpdate = true;
    }
  }

  /**
   * @param {number} scale - resolution of the scene pass relative to the output,
   *   in (0, 1]. Applied from the next frame; the effects after the
   *   reconstruction keep running at the output resolution.
   */
  setRenderScale(scale) {
    this.scenePass.setResolutionScale(scale);
  }

  /** @returns {number} */
  get renderScale() {
    return this.scenePass.getResolutionScale();
  }

  /**
   * Render one frame.
   * @param {number} [repeats=1] - times the whole frame is rendered, for GPU time
   *   measurements that repeat the frame (see GPUTimer). The scene pass and the
   *   effects render once per node frame however often the pipeline runs, so the
   *   node frame is advanced between repeats: each one renders all of the frame.
   *   (Per-render updates would not do: three counts every quad render of an
   *   effect as a render, so the scene would render again inside the
   *   anti-aliasing resolve.)
   */
  render(repeats = 1) {
    if (this._renderer.toneMapping !== this._toneMapping) {
      this._toneMapping = this._renderer.toneMapping;
      this._pipeline.needsUpdate = true;
    }
    for (let i = 0; i < repeats; i++) {
      if (i > 0) this._renderer._nodes.nodeFrame.update();
      this._pipeline.render();
    }
  }

  dispose() {
    this._pipeline.dispose();
    this.bloomNode.dispose();
    this.taauNode.dispose();
    this.scenePass.dispose();
  }
}
