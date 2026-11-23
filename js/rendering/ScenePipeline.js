import * as THREE from 'three';
import { NodeUpdateType } from 'three/webgpu';
import { mrt, output, pass, velocity } from 'three/tsl';
import { traa } from 'three/addons/tsl/display/TRAANode.js';

/**
 * Frame rendering through a RenderPipeline: the scene is rendered into a
 * HalfFloat (HDR) target, post-processing effects operate on that linear HDR
 * image, and tone mapping and the output color space conversion are applied
 * once, at the end of the chain.
 *
 * Anti-aliasing is temporal (TRAA): the camera is jittered by a sub-pixel offset
 * every frame and the frames are accumulated, reprojected with a per-pixel
 * velocity buffer written by the scene pass. MSAA is off, as TRAA requires.
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

    this.traaNode = traa(
      this.scenePass.getTextureNode('output'),
      this.scenePass.getTextureNode('depth'),
      this.scenePass.getTextureNode('velocity'),
      camera,
    );

    this._pipeline = new THREE.RenderPipeline(renderer);
    this._pipeline.outputNode = this.traaNode;
    this._toneMapping = renderer.toneMapping;
  }

  /**
   * Render one frame.
   * @param {number} [repeats=1] - times the whole frame is rendered. The scene
   *   pass normally renders once per frame however often the pipeline runs; with
   *   repeats > 1 it renders on every run, so that GPU time measurements that
   *   repeat the frame (see GPUTimer) repeat all of it.
   */
  render(repeats = 1) {
    if (this._renderer.toneMapping !== this._toneMapping) {
      this._toneMapping = this._renderer.toneMapping;
      this._pipeline.needsUpdate = true;
    }
    this.scenePass.updateBeforeType = repeats > 1 ? NodeUpdateType.RENDER : NodeUpdateType.FRAME;
    for (let i = 0; i < repeats; i++) this._pipeline.render();
  }

  dispose() {
    this._pipeline.dispose();
    this.traaNode.dispose();
    this.scenePass.dispose();
  }
}
