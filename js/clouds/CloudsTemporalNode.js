import * as THREE from 'three';
import { FloatType, HalfFloatType, Node, NodeMaterial, NodeUpdateType, QuadMesh, RenderTarget, RendererUtils } from 'three/webgpu';
import {
  Fn,
  If,
  abs,
  clamp,
  context,
  dot,
  exp,
  float,
  floatBitsToUint,
  ivec2,
  log,
  max,
  min,
  mix,
  outputStruct,
  passTexture,
  property,
  screenCoordinate,
  select,
  sqrt,
  texture,
  uniform,
  uvec4,
  vec2,
  vec4,
} from 'three/tsl';
import { CLOUD_CURRENT_WEIGHT, CLOUD_HISTORY_DEPTH_TOLERANCE, CLOUD_VARIANCE_GAMMA } from '../constants/clouds.js';

/** Side of the blocks of pixels of which one is marched per frame */
const BLOCK = 4;

/**
 * Order in which the pixels of a block are marched (Bayer matrix, row by row):
 * consecutive frames march pixels far apart in the block
 */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const BAYER_OFFSETS = BAYER.map((_, frame) => {
  const index = BAYER.indexOf(frame);
  return [index % BLOCK, Math.floor(index / BLOCK)];
});

/** How fast the weight of a marched pixel falls with the ratio of its scene distance to the pixel's */
const DEPTH_SHARPNESS = 8;

/** Scene distances are kept in the history in km, within the range of half floats */
const HISTORY_DISTANCE_SCALE = 1e-3;

const _quad = /* @__PURE__ */ new QuadMesh();
const _position = /* @__PURE__ */ new THREE.Vector3();
const _translation = /* @__PURE__ */ new THREE.Matrix4();
let _rendererState;

/**
 * Whether no channel of a vec4 is infinite or NaN, from the exponent bits:
 * comparisons of a NaN may be optimized away by the shader compiler
 */
function isFinite4(value) {
  const exponent = uvec4(0x7f800000);
  return floatBitsToUint(value).bitAnd(exponent).notEqual(exponent).all();
}

/**
 * History clipped to a box (all four channels): toward the centre of the box
 * until it is inside
 */
function clipToBox(history, low, high) {
  const centre = high.add(low).mul(0.5).toConst();
  const offset = history.sub(centre).toConst();
  const units = abs(offset.div(high.sub(low).mul(0.5).add(1e-7))).toConst();
  const largest = max(max(units.x, units.y), max(units.z, units.w));
  return select(largest.greaterThan(1), centre.add(offset.div(largest)), history);
}

/**
 * The volumetric clouds in front of the scene, at the resolution of the scene
 * pass, for the cost of marching a sixteenth of its pixels each frame (after
 * takram's three-clouds temporal upscaling):
 *
 * - each frame marches one pixel of every 4×4 block, in the order of a Bayer
 *   matrix, so that all of them are marched over sixteen frames, into a target
 *   holding the clouds and, for each, the distance of their front and of the
 *   scene behind them;
 * - the resolve reprojects the previous result of the pass to where the
 *   point each pixel shows was in the previous frame, and blends the pixels
 *   marched this frame with it (the others keep it as is). That point lies at the pixel's own
 *   scene distance (full resolution) or at the front of the clouds marched
 *   around it, whichever is nearer, so that the clouds stay put behind the
 *   silhouettes of the relief. The history is kept only where the scene
 *   distance it was made at matches the pixel's, and clipped to the spread of
 *   the clouds marched around the pixel;
 * - where the history is rejected (disocclusions, the edges of the screen,
 *   the first frame), the clouds marched around the pixel are blended with
 *   weights falling with the difference of their scene distance from the
 *   pixel's, and those whose clouds start behind the pixel's surface count as
 *   clear, so that the clouds over the sky do not bleed onto the relief or the
 *   aircraft.
 *
 * The output is premultiplied: light of the clouds (rgb), opacity (a).
 */
export default class CloudsTemporalNode extends Node {
  static get type() {
    return 'CloudsTemporalNode';
  }

  /**
   * @param {import('./VolumetricClouds.js').default} clouds
   * @param {Node} depthNode - scene depth
   * @param {boolean} reversedDepth
   */
  constructor(clouds, depthNode, reversedDepth) {
    super('vec4');
    this.updateBeforeType = NodeUpdateType.FRAME;
    this.clouds = clouds;
    this.depthNode = depthNode;
    this.reversedDepth = reversedDepth;

    const target = (name, type) => {
      const renderTarget = new RenderTarget(1, 1, { depthBuffer: false, type, count: 2 });
      renderTarget.textures[0].name = `${name}.color`;
      renderTarget.textures[1].name = `${name}.distance`;
      return renderTarget;
    };
    // Distances in metres up to the sky distance: single floats
    this._current = target('clouds.current', FloatType);
    // The resolve alternates between two targets, the other one holding the history
    this._resolves = [target('clouds.resolveA', HalfFloatType), target('clouds.resolveB', HalfFloatType)];
    this._write = 0;
    this._historyColor = texture(this._resolves[1].textures[0]);
    this._historyDistance = texture(this._resolves[1].textures[1]);

    this._marchMaterial = new NodeMaterial();
    this._marchMaterial.name = 'clouds.march';
    this._resolveMaterial = new NodeMaterial();
    this._resolveMaterial.name = 'clouds.resolve';

    this._size = uniform(new THREE.Vector2(1, 1));
    this._currentSize = uniform(new THREE.Vector2(1, 1));
    this._offset = uniform(new THREE.Vector2());
    this._reprojection = uniform(new THREE.Matrix4());
    this._historyValid = uniform(0);

    this._frame = 0;
    this._previousProjection = new THREE.Matrix4();
    this._previousView = new THREE.Matrix4();
    this._hasPrevious = false;

    this._textureNode = passTexture(this, this._resolves[0].textures[0]);
  }

  getTextureNode() {
    return this._textureNode;
  }

  updateBefore(frame) {
    const { renderer } = frame;
    const image = this.depthNode.value?.image;
    const width = image?.width ?? 0;
    const height = image?.height ?? 0;
    if (width === 0 || height === 0) return;

    const resolve = this._resolves[this._write];
    const history = this._resolves[1 - this._write];
    const resized = resolve.width !== width || resolve.height !== height;
    if (resized) {
      const currentWidth = Math.ceil(width / BLOCK);
      const currentHeight = Math.ceil(height / BLOCK);
      this._current.setSize(currentWidth, currentHeight);
      for (const target of this._resolves) target.setSize(width, height);
      this._size.value.set(width, height);
      this._currentSize.value.set(currentWidth, currentHeight);
    }

    const [x, y] = BAYER_OFFSETS[this._frame % BAYER_OFFSETS.length];
    this._offset.value.set(x, y);
    this._frame++;

    // From an offset to the camera (world) to the clip space of the previous
    // frame, composed in doubles: the camera's position cancels out
    const camera = this.clouds.camera;
    _translation.makeTranslation(_position.setFromMatrixPosition(camera.matrixWorld));
    this._reprojection.value.multiplyMatrices(this._previousProjection, this._previousView).multiply(_translation);
    this._historyValid.value = this._hasPrevious && !resized ? 1 : 0;

    _rendererState = RendererUtils.resetRendererState(renderer, _rendererState);

    renderer.setRenderTarget(this._current);
    _quad.material = this._marchMaterial;
    _quad.name = 'clouds.march';
    _quad.render(renderer);

    this._historyColor.value = history.textures[0];
    this._historyDistance.value = history.textures[1];
    renderer.setRenderTarget(resolve);
    _quad.material = this._resolveMaterial;
    _quad.name = 'clouds.resolve';
    _quad.render(renderer);
    renderer.setRenderTarget(null);

    RendererUtils.restoreRendererState(renderer, _rendererState);

    this._textureNode.value = resolve.textures[0];
    this._write = 1 - this._write;

    // The matrices the frame was drawn with (jittered by the anti-aliasing)
    this._previousProjection.copy(camera.projectionMatrix);
    this._previousView.copy(camera.matrixWorldInverse);
    this._hasPrevious = true;
  }

  setup(builder) {
    this.depthNode.build(builder);

    const clouds = this.clouds;
    const colorOutput = property('vec4');
    const distanceOutput = property('vec4');
    const outputNode = outputStruct(colorOutput, distanceOutput);
    const sharedContext = context(builder.getSharedContext());

    /** Screen position and scene distance of a pixel of the scene pass */
    const scene = (pixel) => {
      const screen = pixel.add(0.5).div(this._size).toConst();
      const depth = this.depthNode.load(ivec2(min(pixel, this._size.sub(1)))).r;
      return { screen, distance: clouds.sceneDistance(screen, depth, this.reversedDepth).toConst() };
    };

    // One pixel of each block: clouds, distance of their front and of the scene
    this._marchMaterial.colorNode = Fn(() => {
      const pixel = screenCoordinate.xy.floor().mul(BLOCK).add(this._offset).toConst();
      const { screen, distance } = scene(pixel);
      const { color, front } = clouds.march(clouds.viewDirection(screen), distance);
      colorOutput.assign(color);
      distanceOutput.assign(vec4(front, distance, 0, 1));
      return vec4(0);
    })();
    this._marchMaterial.outputNode = outputNode;
    this._marchMaterial.contextNode = sharedContext;

    this._resolveMaterial.colorNode = Fn(() => {
      const pixel = screenCoordinate.xy.floor().toConst();
      const { screen, distance } = scene(pixel);
      const current = texture(this._current.textures[0]);
      const marched = texture(this._current.textures[1]);
      const cell = ivec2(pixel.div(BLOCK).floor()).toConst();
      const lastCell = ivec2(this._currentSize.sub(1)).toConst();
      const centre = pixel.add(0.5).toConst();

      // Marched pixels around, weighted by their distance on screen and the
      // similarity of their scene distance to this pixel's
      const sum = vec4(0).toVar();
      const squares = vec4(0).toVar();
      const frontSum = float(0).toVar();
      const weightSum = float(0).toVar();
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const tap = clamp(cell.add(ivec2(dx, dy)), ivec2(0), lastCell).toConst();
          const distances = marched.load(tap).toConst();
          // Clouds starting behind this pixel's surface are hidden by it
          const hidden = distances.x.greaterThan(distance.mul(1 + CLOUD_HISTORY_DEPTH_TOLERANCE));
          const color = select(hidden, vec4(0), current.load(tap)).toConst();
          const offset = vec2(tap).mul(BLOCK).add(this._offset).add(0.5).sub(centre).div(BLOCK);
          const similarity = exp(abs(log(distances.y.div(distance))).mul(-DEPTH_SHARPNESS));
          const weight = exp(dot(offset, offset).mul(-2))
            .mul(similarity.add(1e-3))
            .toConst();
          sum.addAssign(color.mul(weight));
          squares.addAssign(color.mul(color).mul(weight));
          frontSum.addAssign(distances.x.mul(weight));
          weightSum.addAssign(weight);
        }
      }
      const mean = sum.div(weightSum).toConst();
      const spread = sqrt(max(squares.div(weightSum).sub(mean.mul(mean)), 0))
        .mul(CLOUD_VARIANCE_GAMMA)
        .toConst();

      // Where the point the pixel shows was in the previous frame
      const history = vec4(0).toVar();
      const hasHistory = float(0).toVar();
      const reach = min(distance, frontSum.div(weightSum));
      const clip = this._reprojection.mul(vec4(clouds.viewDirection(screen).mul(reach), 1)).toConst();
      const previous = vec2(clip.x, clip.y.negate()).div(clip.w).mul(0.5).add(0.5).toConst();
      const inside = this._historyValid
        .greaterThan(0)
        .and(clip.w.greaterThan(0))
        .and(previous.greaterThanEqual(0).all())
        .and(previous.lessThanEqual(1).all());
      If(inside, () => {
        const texel = ivec2(min(previous.mul(this._size), this._size.sub(1)));
        const historyDistance = this._historyDistance.load(texel).r.div(HISTORY_DISTANCE_SCALE);
        const previousColor = this._historyColor.sample(previous).level(0).toConst();
        // A NaN in the history would stay there for good: clipping and blending keep it
        If(abs(log(historyDistance.div(distance))).lessThan(CLOUD_HISTORY_DEPTH_TOLERANCE).and(isFinite4(previousColor)), () => {
          history.assign(clipToBox(previousColor, mean.sub(spread), mean.add(spread)));
          hasHistory.assign(1);
        });
      });

      const result = vec4(mean).toVar();
      If(pixel.mod(BLOCK).equal(this._offset).all(), () => {
        // Marched this frame: accumulated with its history
        const marchedColor = current.load(cell);
        result.assign(select(hasHistory.greaterThan(0), mix(history, marchedColor, CLOUD_CURRENT_WEIGHT), marchedColor));
      }).ElseIf(hasHistory.greaterThan(0), () => {
        result.assign(history);
      });
      colorOutput.assign(result);
      distanceOutput.assign(vec4(distance.mul(HISTORY_DISTANCE_SCALE), 0, 0, 1));
      return vec4(0);
    })();
    this._resolveMaterial.outputNode = outputNode;
    this._resolveMaterial.contextNode = sharedContext;

    return this._textureNode;
  }

  dispose() {
    super.dispose();
    this._current.dispose();
    for (const target of this._resolves) target.dispose();
    this._marchMaterial.dispose();
    this._resolveMaterial.dispose();
  }
}
