import * as THREE from 'three';
import { clamp, log2, luminance, mix, mrt, output, pass, rtt, smoothstep, uv, vec3, vec4, velocity } from 'three/tsl';
import { taau } from 'three/addons/tsl/display/TAAUNode.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import {
  BLOOM_STRENGTH,
  BLOOM_RADIUS,
  GLOW_RESOLUTION_SCALE,
  HEAT_RESOLUTION_SCALE,
  NIGHT_VISION_COLOR,
  NIGHT_VISION_PHOTOPIC_LUMINANCE,
  NIGHT_VISION_SCOTOPIC_LUMINANCE,
  SCENE_UNIT_LUMINANCE,
} from '../constants/rendering.js';
import AutoExposureNode from './AutoExposureNode.js';

/**
 * Frame rendering through a RenderPipeline: the scene is rendered into a
 * HalfFloat (HDR) target, post-processing effects operate on that linear HDR
 * image, and tone mapping and the output color space conversion are applied
 * once, at the end of the chain.
 *
 * The atmosphere (aerial perspective) applies to the scene pass, at its
 * resolution, before the anti-aliasing (see setAtmosphere).
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
 * luminance set by the lighting (see setBloomThreshold).
 *
 * Automatic exposure meters the anti-aliased image and scales the result
 * before tone mapping, around the base exposure (see AutoExposureNode). It
 * needs compute shaders with atomics, so it stays off on the WebGL2 backend.
 *
 * Glows (halos of lights, afterburner flames) are rendered by a pass of their
 * own, at half the output resolution, and added after the anti-aliasing (see
 * setGlowLayer): additive and transparent, they would otherwise take the
 * aerial perspective and the motion of the scenery behind them.
 *
 * Heat haze: the hot air behind the engines bends the light through it. A
 * pass of its own draws the objects of a layer into a buffer of screen
 * offsets, at half resolution (see setHeatLayer); the atmosphere pass then
 * reads the scene's color and depth at the offset positions, before the
 * anti-aliasing. It adds no full-screen pass: the atmosphere pass reads the
 * scene anyway.
 *
 * Night vision: below a few candelas per square metre the eye's rods take
 * over from its cones, and colors fade into a bluish grey (see setNightVision).
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

    this._sceneColor = this.scenePass.getTextureNode('output');
    this._sceneDepth = this.scenePass.getTextureNode('depth');
    this._atmosphereNode = null;
    this._cloudsNode = null;
    this._clouds = null;
    /** Called before each render of the pipeline (passes the scene depends on) */
    this._beforeRender = null;

    this.taauNode = taau(this._sceneColor, this._sceneDepth, this.scenePass.getTextureNode('velocity'), camera);
    this._antiAliased = this.taauNode.getTextureNode();

    // No bloom until the lighting sets a threshold (see setBloomThreshold)
    this.bloomNode = bloom(this._antiAliased, BLOOM_STRENGTH, BLOOM_RADIUS);
    this._bloomEnabled = false;

    this.autoExposureSupported = renderer.backend.isWebGPUBackend === true;
    this.autoExposureNode = this.autoExposureSupported ? new AutoExposureNode(this._antiAliased) : null;
    this._autoExposureEnabled = false;
    this._preExposure = null;
    this._glowPass = null;
    this._heatPass = null;
    this._atmosphereApply = null;

    this._pipeline = new THREE.RenderPipeline(renderer);
    this._pipeline.outputNode = this._buildOutput();
    this._toneMapping = renderer.toneMapping;
  }

  _buildOutput() {
    let color = this._antiAliased.rgb;
    if (this._bloomEnabled) color = color.add(this.bloomNode.rgb);
    if (this._glowPass) color = color.add(this._glowPass.getTextureNode().rgb);
    if (this._preExposure) color = this._nightVision(color);
    if (this._autoExposureEnabled) color = color.mul(this.autoExposureNode);
    return vec4(color, this._antiAliased.a);
  }

  /**
   * Mesopic vision: the color of a pixel fades toward its luminance, tinted
   * blue, as its absolute luminance falls from NIGHT_VISION_PHOTOPIC_LUMINANCE
   * to NIGHT_VISION_SCOTOPIC_LUMINANCE (cd/m², on a logarithmic scale). Moonlit
   * snow keeps a trace of color, starlit ground none.
   *
   * Light sources take a smaller night exposure than the scene (see
   * AtmosphericSky.emissiveExposure), so their absolute luminance cannot be
   * recovered from the pixel: pixels far brighter than the luminance the eye
   * has adapted to are taken as lights, seen with the cones, in color.
   */
  _nightVision(color) {
    const y = luminance(color);
    const absolute = y.div(this._preExposure).mul(SCENE_UNIT_LUMINANCE).max(1e-12);
    const top = Math.log2(NIGHT_VISION_PHOTOPIC_LUMINANCE);
    const bottom = Math.log2(NIGHT_VISION_SCOTOPIC_LUMINANCE);
    const scotopic = clamp(
      log2(absolute)
        .sub(top)
        .div(bottom - top),
      0,
      1,
    );
    let rods = scotopic;
    if (this._autoExposureEnabled) {
      const adapted = this.autoExposureNode.adaptedLuminanceNode;
      rods = scotopic.mul(smoothstep(adapted.mul(2), adapted.mul(10), y).oneMinus());
    }
    return mix(color, vec3(...NIGHT_VISION_COLOR).mul(y), rods);
  }

  /**
   * Render the objects of a layer (and only them) in the glow pass.
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   * @param {number} layer
   */
  setGlowLayer(scene, camera, layer) {
    this._glowPass = pass(scene, camera, { samples: 0 });
    this._glowPass.setLayers(new THREE.Layers());
    this._glowPass.getLayers().set(layer);
    this._glowPass.setResolutionScale(GLOW_RESOLUTION_SCALE);
    this._rebuild();
  }

  /**
   * Render the objects of a layer (and only them) into the heat haze's buffer
   * of screen offsets (uv units, in its red and green), or stop the heat haze.
   * Applied through the atmosphere: without one (SAR mode), there is no haze.
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   * @param {?number} layer - null to stop
   */
  setHeatLayer(scene, camera, layer) {
    this._heatPass?.dispose();
    this._heatPass = null;
    if (layer !== null) {
      this._heatPass = pass(scene, camera, { samples: 0 });
      this._heatPass.setLayers(new THREE.Layers());
      this._heatPass.getLayers().set(layer);
      this._heatPass.setResolutionScale(HEAT_RESOLUTION_SCALE);
    }
    this._applyAtmosphere();
  }

  /** Scene depth, for the glow materials' own occlusion test */
  get sceneDepth() {
    return this._sceneDepth;
  }

  /**
   * @param {?Node} preExposure - exposure applied to the scene before the HDR
   *   targets, to recover absolute luminance; null disables night vision
   */
  setNightVision(preExposure) {
    if (preExposure === this._preExposure) return;
    this._preExposure = preExposure;
    this._rebuild();
  }

  _rebuild() {
    this._pipeline.outputNode = this._buildOutput();
    this._pipeline.needsUpdate = true;
  }

  /** @param {boolean} enabled - ignored without compute support (WebGL2 backend) */
  setAutoExposure(enabled) {
    enabled = enabled && this.autoExposureSupported;
    if (enabled === this._autoExposureEnabled) return;
    this._autoExposureEnabled = enabled;
    if (enabled) this.autoExposureNode.reset();
    this._rebuild();
  }

  /** @returns {Promise<number|null>} adapted scene luminance, null when automatic exposure is off */
  async readAdaptedLuminance() {
    if (!this._autoExposureEnabled) return null;
    return this.autoExposureNode.readAdaptedLuminance(this._renderer);
  }

  /** @param {boolean} enabled - whether the bloom pass runs */
  setBloom(enabled) {
    if (enabled !== this._bloomEnabled) {
      this._bloomEnabled = enabled;
      this._rebuild();
    }
  }

  /**
   * @param {Node} threshold - luminance (before exposure) above which pixels
   *   bloom, as a node evaluated by the bloom's high-pass filter
   */
  setBloomThreshold(threshold) {
    this.bloomNode.threshold = threshold;
    // A soft knee as wide as the threshold: highlights fade into the bloom
    // instead of popping in as they cross it
    this.bloomNode.smoothWidth = threshold;
    this._pipeline.needsUpdate = true;
  }

  /**
   * @param {?function(TextureNode, TextureNode, ?TextureNode): Node} apply - builds the
   *   atmosphere (sky and aerial perspective) over the scene from its color and
   *   depth, and the clouds' pass when there is one, or null for none. The
   *   result is rendered at the scene pass resolution and fed to the
   *   anti-aliasing in place of the scene color.
   * @param {?function(TextureNode, boolean): Node} clouds - builds the pass
   *   of the clouds in front of the scene (a node with getTextureNode(), whose
   *   texture holds their premultiplied luminance and opacity at the scene pass
   *   resolution) from the scene depth and whether it is reversed; null for none
   */
  setAtmosphere(apply, clouds = null) {
    this._atmosphereApply = apply;
    this._clouds = clouds;
    this._applyAtmosphere();
  }

  _applyAtmosphere() {
    const apply = this._atmosphereApply;
    this._atmosphereNode?.dispose();
    this._atmosphereNode = null;
    this._cloudsNode?.dispose();
    this._cloudsNode = null;
    let input = this._sceneColor;
    if (apply) {
      let color = this._sceneColor;
      let depth = this._sceneDepth;
      if (this._heatPass) {
        // Seen through the heat haze: the scene where the bent ray lands
        const bent = uv().add(this._heatPass.getTextureNode().sample(uv()).xy);
        color = this._sceneColor.sample(bent);
        depth = this._sceneDepth.sample(bent);
      }
      if (this._clouds) {
        this._cloudsNode = this._clouds(this._sceneDepth, this._renderer.reversedDepthBuffer);
      }
      const node = apply(color, depth, this._cloudsNode?.getTextureNode() ?? null);
      // The atmosphere covers every pixel (sky included): opaque
      this._atmosphereNode = rtt(vec4(node.rgb, 1), null, null, {
        resolutionScale: this.scenePass.getResolutionScale(),
      });
      input = this._atmosphereNode;
    }
    this.taauNode.beautyNode = input;
    // The anti-aliasing builds its input into materials of its own when the
    // pipeline is set up again, without marking them for recompilation: a
    // change made after the first frame would otherwise never show
    this.taauNode._resolveMaterial.needsUpdate = true;
    this.taauNode._seedMaterial.needsUpdate = true;
    this._pipeline.needsUpdate = true;
  }

  /**
   * @param {number} scale - resolution of the scene pass relative to the output,
   *   in (0, 1]. Applied from the next frame; the effects after the
   *   reconstruction keep running at the output resolution.
   */
  setRenderScale(scale) {
    this.scenePass.setResolutionScale(scale);
    this._atmosphereNode?.setResolutionScale(scale);
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
  /** @param {?function(): void} callback - drawn before each render of the pipeline, or null */
  setBeforeRender(callback) {
    this._beforeRender = callback;
  }

  render(repeats = 1) {
    if (this._renderer.toneMapping !== this._toneMapping) {
      this._toneMapping = this._renderer.toneMapping;
      this._pipeline.needsUpdate = true;
    }
    for (let i = 0; i < repeats; i++) {
      if (i > 0) this._renderer._nodes.nodeFrame.update();
      this._beforeRender?.();
      this._pipeline.render();
    }
  }

  dispose() {
    this._pipeline.dispose();
    this.bloomNode.dispose();
    this.autoExposureNode?.dispose();
    this.taauNode.dispose();
    this._atmosphereNode?.dispose();
    this._cloudsNode?.dispose();
    this._glowPass?.dispose();
    this._heatPass?.dispose();
    this.scenePass.dispose();
  }
}
