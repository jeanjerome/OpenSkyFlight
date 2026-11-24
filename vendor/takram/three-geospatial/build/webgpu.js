import { Fn as U, positionView as jt, cameraFar as je, cameraNear as Ee, cameraPosition as Et, cameraProjectionMatrixInverse as kt, cameraWorldMatrix as It, cameraProjectionMatrix as Lt, cameraViewMatrix as Wt, reference as le, uniform as v, vec4 as z, positionGeometry as ct, texture as oe, uv as I, vec2 as f, add as B, luminance as $t, smoothstep as ut, OnBeforeObjectUpdate as qt, OnObjectUpdate as Gt, screenCoordinate as ke, time as Ht, vec3 as M, equirectUV as Yt, fwidth as Xt, abs as _, positionLocal as Zt, positionPrevious as _t, sub as ie, nodeImmutable as lt, instancedArray as Xe, storage as Kt, uvec2 as re, If as ae, globalId as Ae, Return as Qt, atomicAdd as Jt, instanceIndex as es, mat3 as dt, struct as Ie, min as ht, mul as ts, fract as ss, distance as os, mix as ne, rtt as ns, convertToTexture as Oe, overloadingFn as Le, sqrt as Se, dot as Te, bvec2 as pt, bvec3 as mt, uvec3 as pe, bvec4 as ft, uvec4 as me, bool as Me, color as is, mat4 as rs, mat2 as as, ivec4 as xt, ivec3 as cs, ivec2 as O, uint as us, int as K, float as G, viewZToLogarithmicDepth as vt, logarithmicDepthToViewZ as gt, perspectiveDepthToViewZ as yt, orthographicDepthToViewZ as ls, PI2 as ds, PI as hs, cos as Ze, sin as _e, viewZToPerspectiveDepth as ps, workgroupArray as ms, greaterThan as fs, invocationLocalIndex as we, workgroupBarrier as xs, textureStore as vs, workgroupId as Ke, and as wt, frameId as gs, screenUV as ys, step as ws, textureSize as Ns, max as Nt } from "three/tsl";
import { Vector3 as Tt, Plane as Ts, Mesh as bt, Scene as bs, Camera as Ss, RenderTarget as St, RGBAFormat as Mt, HalfFloatType as zt, LinearFilter as ce, Matrix4 as be, Vector2 as ve, AdditiveBlending as Ms, PlaneGeometry as zs, PerspectiveCamera as Cs, SRGBColorSpace as Rs, CanvasTexture as Ds, NoColorSpace as Bs, Vector4 as As, DepthTexture as Vs } from "three";
import { CSMShadowNode as Ps } from "three/examples/jsm/csm/CSMShadowNode.js";
import { NodeMaterial as ue, TextureNode as Fs, TempNode as Q, NodeUpdateType as H, RendererUtils as ge, QuadMesh as ze, StructTypeNode as Os, IndirectStorageBufferAttribute as Us, MeshBasicNodeMaterial as js, NodeBuilder as Es, Node as ks, Texture3DNode as Ct, StorageTexture as Is, Data3DTexture as Ls, RedFormat as Ws, NearestFilter as Qe, RepeatWrapping as Ve, StorageTextureNode as $s } from "three/webgpu";
import { Q as qs, D as Gs, S as Hs } from "./shared2.js";
import { i as y } from "./shared.js";
import { NodeUtils as OSF_NodeUtils } from "three/webgpu";
const { hash: We, hashString: Ys } = OSF_NodeUtils;
let Pe;
function J(s, e, t) {
  Pe ??= /* @__PURE__ */ new WeakMap();
  let o = Pe.get(s);
  return o == null && (o = {}, Pe.set(s, o)), o[e] ??= t();
}
const un = (s) => s != null ? J(
  s,
  "projectionMatrix",
  () => le("projectionMatrix", "mat4", s).setName(
    "projectionMatrix"
  )
) : Lt, ln = (s) => s != null ? J(
  s,
  "viewMatrix",
  () => le("matrixWorldInverse", "mat4", s).setName("viewMatrix")
) : Wt, dn = (s) => s != null ? J(
  s,
  "inverseProjectionMatrix",
  () => le("projectionMatrixInverse", "mat4", s).setName(
    "inverseProjectionMatrix"
  )
) : kt, hn = (s) => s != null ? J(
  s,
  "inverseViewMatrix",
  () => le("matrixWorld", "mat4", s).setName("inverseViewMatrix")
) : It, pn = (s) => s != null ? J(
  s,
  "cameraPositionWorld",
  () => v("vec3").setName("cameraPositionWorld").onRenderUpdate((e, { value: t }) => {
    t.setFromMatrixPosition(s.matrixWorld);
  })
) : Et, fe = (s) => s != null ? J(
  s,
  "cameraNear",
  () => le("near", "float", s).setName("cameraNear")
) : Ee, xe = (s) => s != null ? J(
  s,
  "cameraFar",
  () => le("far", "float", s).setName("cameraFar")
) : je, mn = U(() => jt.z).once()().toVar("viewZ"), Xs = /* @__PURE__ */ new Tt(), Zs = /* @__PURE__ */ new Ts();
class fn extends Ps {
  updateBefore(e) {
    super.updateBefore(e);
    const { lights: t } = this;
    if (t.length < 2)
      return;
    const o = t[t.length - 1], n = Xs.subVectors(o.target.position, o.position).normalize(), i = Zs.setFromNormalAndCoplanarPoint(
      n,
      o.position
    );
    for (let r = 0; r < t.length - 1; ++r) {
      const c = t[r];
      i.projectPoint(c.position, c.position), c.target.position.copy(c.position).add(n);
    }
  }
}
async function Ce(s, e) {
  const t = new bt(new qs(), e);
  try {
    return await s.debug.getShaderAsync(new bs(), new Ss(), t);
  } catch (o) {
    return console.error(o), { vertexShader: null, fragmentShader: null };
  } finally {
    t.geometry.dispose();
  }
}
async function xn(s, e) {
  const { vertexShader: t, fragmentShader: o } = await Ce(s, e);
  return t != null && o != null ? `// Vertex shader

${t}
// Fragment shader

${o}` : null;
}
async function vn(s, e) {
  return (await Ce(s, e)).vertexShader;
}
async function gn(s, e) {
  return (await Ce(s, e)).fragmentShader;
}
async function yn(s, e) {
  const t = new ue();
  t.vertexNode = z(ct.xy, 0, 1), t.fragmentNode = e.toConst("debugNode");
  const o = await Ce(s, t);
  return t.dispose(), o.fragmentShader;
}
function wn(s, e, t) {
  const o = s[e];
  return s[e] = ((...n) => (t(...n), o.apply(s, n))), s;
}
class _s extends Fs {
  static get type() {
    return "OutputTextureNode";
  }
  constructor(e, t) {
    super(t), this.owner = e, this.setUpdateMatrix(!1);
  }
  setup(e) {
    return this.owner.build(e), super.setup(e);
  }
  clone() {
    const e = new this.constructor(this.owner, this.value);
    return e.uvNode = this.uvNode, e.levelNode = this.levelNode, e.biasNode = this.biasNode, e.sampler = this.sampler, e.depthNode = this.depthNode, e.compareNode = this.compareNode, e.gradNode = this.gradNode, e.offsetNode = this.offsetNode, e;
  }
}
const $e = (...s) => new _s(...s);
class Re extends Q {
  constructor(e) {
    super("vec4"), this.resolutionScale = 1, this.renderTargets = [], this.updateBeforeType = H.FRAME, this.inputNode = e;
  }
  static get type() {
    return "FilterNode";
  }
  createRenderTarget(e) {
    const t = new St(1, 1, {
      depthBuffer: !1,
      type: zt,
      format: Mt
    }), o = t.texture;
    o.minFilter = ce, o.magFilter = ce, o.generateMipmaps = !1;
    const n = this.constructor.type;
    return o.name = e != null ? `${n}_${e}` : n, this.renderTargets.push(t), t;
  }
  getTextureNode() {
    return y(
      this.textureNode != null,
      "outputTexture must be specified before getTextureNode() is called."
    ), this.textureNode;
  }
  get outputTexture() {
    return this.textureNode?.value ?? null;
  }
  set outputTexture(e) {
    this.textureNode = e != null ? $e(this, e) : void 0;
  }
  setup(e) {
    const { inputNode: t, textureNode: o } = this;
    return y(
      t != null,
      "inputNode must be specified before being setup."
    ), y(
      o != null,
      "outputTexture must be specified before being setup."
    ), o.uvNode = t.uvNode, o;
  }
  dispose() {
    for (const e of this.renderTargets)
      e.dispose();
    super.dispose();
  }
}
const { resetRendererState: Ks, restoreRendererState: Qs } = ge;
class qe extends Re {
  constructor(e, t) {
    super(e), this.downsampleRTs = [], this.upsampleRTs = [], this.downsampleMaterial = new ue(), this.upsampleMaterial = new ue(), this.mesh = new ze(), this.inputTexelSize = v("vec2"), this.downsampleNode = oe();
    const o = this.constructor.type.replace(/Node$/, "");
    this.downsampleMaterial.name = `${o}_downsample`, this.upsampleMaterial.name = `${o}_upsample`, this.mesh.name = o;
    for (let n = 0; n < t; ++n)
      this.downsampleRTs[n] = this.createRenderTarget(`downsample${n}`), n < t - 1 && (this.upsampleRTs[n] = this.createRenderTarget(`upsample${n}`));
    this.outputTexture = this.upsampleRTs[0].texture;
  }
  setSize(e, t) {
    const { resolutionScale: o } = this;
    let n = Math.max(Math.round(e * o), 1), i = Math.max(Math.round(t * o), 1);
    const { downsampleRTs: r, upsampleRTs: c } = this;
    for (let a = 0; a < r.length; ++a)
      n = Math.max(Math.round(n / 2), 1), i = Math.max(Math.round(i / 2), 1), r[a].setSize(n, i), a < c.length && c[a].setSize(n, i);
    return this;
  }
  updateBefore({ renderer: e }) {
    if (e == null)
      return;
    const {
      downsampleRTs: t,
      upsampleRTs: o,
      mesh: n,
      inputNode: i,
      inputTexelSize: r,
      downsampleNode: c
    } = this;
    y(i != null);
    const { width: a, height: d } = i.value;
    this.setSize(a, d);
    const l = i.value;
    this.rendererState = Ks(e, this.rendererState), n.material = this.downsampleMaterial;
    for (const u of t) {
      const { width: p, height: h } = i.value;
      r.value.set(1 / p, 1 / h), e.setRenderTarget(u), n.render(e), i.value = u.texture;
    }
    n.material = this.upsampleMaterial;
    for (let u = o.length - 1; u >= 0; --u) {
      const p = o[u], { width: h, height: m } = i.value;
      r.value.set(1 / h, 1 / m), c.value = t[u].texture, e.setRenderTarget(p), n.render(e), i.value = p.texture;
    }
    Qs(e, this.rendererState), i.value = l;
  }
  setup(e) {
    const { inputNode: t } = this;
    y(t != null);
    const { downsampleMaterial: o, upsampleMaterial: n } = this;
    return o.fragmentNode = this.setupDownsampleNode(e), n.fragmentNode = this.setupUpsampleNode(e), o.needsUpdate = !0, n.needsUpdate = !0, super.setup(e);
  }
  dispose() {
    for (const e of this.downsampleRTs)
      e.dispose();
    for (const e of this.upsampleRTs)
      e.dispose();
    this.downsampleMaterial.dispose(), this.upsampleMaterial.dispose(), this.mesh.geometry.dispose(), super.dispose();
  }
}
const Rt = (s, e) => {
  const t = I(), o = z(1, 1, -1, -1).mul(e.xyxy).add(t.xyxy).toVertexStage(), n = z(2, 2, -2, -2).mul(e.xyxy).add(t.xyxy).toVertexStage(), i = o.zy, r = o.xy, c = o.zw, a = o.xw, d = f(t.x, n.y), l = f(n.z, t.y), u = f(n.x, t.y), p = f(t.x, n.w), h = n.zy, m = n.xy, x = n.zw, w = n.xw;
  return B(
    B(
      s.sample(t),
      s.sample(i),
      s.sample(r),
      s.sample(c),
      s.sample(a)
    ).mul(1 / 8),
    B(
      s.sample(d),
      s.sample(l),
      s.sample(u),
      s.sample(p)
    ).mul(1 / 16),
    B(
      s.sample(h),
      s.sample(m),
      s.sample(x),
      s.sample(w)
    ).mul(1 / 32)
  );
}, Js = (s, e) => {
  const t = I(), o = z(1, 1, -1, -1).mul(e.xyxy).add(t.xyxy).toVertexStage(), n = f(t.x, o.y), i = f(o.z, t.y), r = f(o.x, t.y), c = f(t.x, o.w), a = o.zy, d = o.xy, l = o.zw, u = o.xw;
  return B(
    s.sample(t).mul(0.25),
    B(
      s.sample(n),
      s.sample(i),
      s.sample(r),
      s.sample(c)
    ).mul(0.125),
    B(
      s.sample(a),
      s.sample(d),
      s.sample(l),
      s.sample(u)
    ).mul(0.0625)
  );
};
class eo extends qe {
  static get type() {
    return "MipmapBlurNode";
  }
  constructor(e, t = 4) {
    super(e, t), this.resolutionScale = 0.5;
  }
  setupDownsampleNode(e) {
    return y(this.inputNode != null), Rt(this.inputNode, this.inputTexelSize);
  }
  setupUpsampleNode(e) {
    return y(this.inputNode != null), Js(this.inputNode, this.inputTexelSize);
  }
}
const Nn = (...s) => new eo(...s), { resetRendererState: to, restoreRendererState: so } = ge;
class oo extends Re {
  constructor(e) {
    super(e), this.material = new ue(), this.mesh = new ze(this.material), this.inputTexelSize = v("vec2");
    const t = this.constructor.type.replace(/Node$/, "");
    this.material.name = t, this.mesh.name = t, this.renderTarget = this.createRenderTarget(), this.outputTexture = this.renderTarget.texture;
  }
  setSize(e, t) {
    const { resolutionScale: o } = this, n = Math.max(Math.round(e * o), 1), i = Math.max(Math.round(t * o), 1);
    return this.renderTarget.setSize(n, i), this;
  }
  updateBefore({ renderer: e }) {
    if (e == null)
      return;
    const { inputNode: t } = this;
    y(t != null);
    const { width: o, height: n } = t.value;
    this.setSize(o, n), this.inputTexelSize.value.set(1 / o, 1 / n), this.rendererState = to(e, this.rendererState), e.setRenderTarget(this.renderTarget), this.mesh.render(e), so(e, this.rendererState);
  }
  setup(e) {
    const { inputNode: t } = this;
    y(t != null);
    const { material: o } = this;
    return o.fragmentNode = this.setupOutputNode(e), o.needsUpdate = !0, super.setup(e);
  }
  dispose() {
    this.renderTarget.dispose(), this.material.dispose(), this.mesh.geometry.dispose(), super.dispose();
  }
}
class Dt extends oo {
  constructor(e) {
    super(e), this.thresholdLevel = v(5), this.thresholdRange = v(1), this.resolutionScale = 0.5;
  }
  static get type() {
    return "DownsampleThresholdNode";
  }
  setupOutputNode() {
    const { inputNode: e, thresholdLevel: t, thresholdRange: o, inputTexelSize: n } = this;
    y(e != null);
    const i = Rt(e, n), r = $t(i.rgb), c = ut(
      t,
      t.add(o),
      r
    );
    return z(i.rgb, r).mul(c);
  }
}
const Tn = (...s) => new Dt(...s), bn = (s) => {
  const e = Gt(s);
  return e.updateType = H.NONE, e;
}, Sn = (s) => {
  const e = qt(s);
  return e.updateBeforeType = H.FRAME, e;
};
function Je(s) {
  if (typeof s == "string")
    return s;
  if (Reflect.get(s, "isStructTypeNode") === !0) {
    if (s.name == null)
      throw new Error("Struct name is required.");
    return s.name;
  }
  if ("layout" in s && s.layout instanceof Os) {
    if (s.layout.name == null)
      throw new Error("Struct name is required.");
    return s.layout.name;
  }
  throw new Error(`Unsupported layout type: ${s}`);
}
function V({
  typeOnly: s = !1,
  ...e
}) {
  return s ? (t) => U(t) : (t) => U(t).setLayout({
    ...e,
    type: Je(e.type),
    inputs: e.inputs?.map((o) => ({
      ...o,
      type: Je(o.type)
    })) ?? []
  });
}
function L(s) {
  return U((e, t) => {
    const o = s(...e);
    return typeof o == "function" ? o(t) : o;
  });
}
const { resetRendererState: no, restoreRendererState: io } = ge;
class ro extends Re {
  constructor(e) {
    super(e), this.iterations = 1, this.material = new ue(), this.mesh = new ze(this.material), this.inputTexelSize = v("vec2"), this.direction = v("vec2");
    const t = this.constructor.type.replace(/Node$/, "");
    this.material.name = t, this.mesh.name = t, this.horizontalRT = this.createRenderTarget("horizontal"), this.verticalRT = this.createRenderTarget("vertical"), this.outputTexture = this.verticalRT.texture;
  }
  setSize(e, t) {
    const { resolutionScale: o } = this, n = Math.max(Math.round(e * o), 1), i = Math.max(Math.round(t * o), 1);
    return this.horizontalRT.setSize(n, i), this.verticalRT.setSize(n, i), this;
  }
  updateBefore({ renderer: e }) {
    if (e == null)
      return;
    const { horizontalRT: t, verticalRT: o, mesh: n, inputNode: i, direction: r } = this;
    y(i != null);
    const { width: c, height: a } = i.value;
    this.setSize(c, a), this.inputTexelSize.value.set(1 / c, 1 / a);
    const d = i.value;
    this.rendererState = no(e, this.rendererState);
    for (let l = 0; l < this.iterations; ++l)
      r.value.set(1, 0), e.setRenderTarget(t), n.render(e), i.value = t.texture, r.value.set(0, 1), e.setRenderTarget(o), n.render(e), i.value = o.texture;
    io(e, this.rendererState), i.value = d;
  }
  setup(e) {
    const { inputNode: t } = this;
    y(t != null);
    const { material: o } = this;
    return o.fragmentNode = this.setupOutputNode(e), o.needsUpdate = !0, super.setup(e);
  }
  dispose() {
    this.horizontalRT.dispose(), this.verticalRT.dispose(), this.material.dispose(), this.mesh.geometry.dispose(), super.dispose();
  }
}
function et(s) {
  if (y(s >= 0), s === 0)
    return new Float64Array(0);
  if (s === 1)
    return new Float64Array([1]);
  let e = new Float64Array(s), t = new Float64Array(s), o = t;
  for (let n = 1; n <= s; ++n) {
    for (let i = 0; i < n; ++i)
      t[i] = i === 0 || i === n - 1 ? 1 : e[i - 1] + e[i];
    o = t, t = e, e = o;
  }
  return o;
}
function ao(s, e = 2) {
  y(s >= 3);
  const t = s + e * 2, o = e > 0 ? et(t).slice(e, -e) : et(t), n = Math.floor((o.length - 1) / 2), i = o.reduce((u, p) => u + p, 0), r = o.slice(n), c = [...Array(n + 1).keys()], a = new Float64Array(Math.floor(c.length / 2)), d = new Float64Array(a.length);
  a[0] = r[0] / i;
  for (let u = 1, p = 1; u < c.length - 1; u += 2, ++p) {
    const h = c[u], m = c[u + 1], x = r[u], w = r[u + 1], N = x + w, C = (h * x + m * w) / N;
    a[p] = N / i, d[p] = C;
  }
  const l = (a.reduce((u, p) => u + p, 0) - a[0] * 0.5) * 2;
  if (l !== 0) {
    const u = 1 / l;
    for (let p = 0; p < a.length; ++p)
      a[p] *= u;
  }
  return {
    offsets: d,
    weights: a
  };
}
class Bt extends ro {
  static get type() {
    return "GaussianBlurNode";
  }
  constructor(e, t = 35) {
    super(e), this.kernelSize = t;
  }
  setupOutputNode(e) {
    const { inputNode: t, inputTexelSize: o, direction: n } = this;
    y(t != null);
    const { offsets: i, weights: r } = ao(this.kernelSize);
    return U(() => {
      const c = I(), a = n.mul(o).toVertexStage(), d = t.sample(c).mul(r[0]);
      for (let l = 1; l < i.length; ++l) {
        const u = a.mul(i[l]);
        d.addAssign(
          B(
            t.sample(c.add(u)),
            t.sample(c.sub(u))
          ).mul(r[l])
        );
      }
      return d;
    })();
  }
}
const Mn = (...s) => new Bt(...s), co = (s) => s.dot(f(0.06711056, 583715e-8)).fract().mul(52.9829189).fract(), zn = /* @__PURE__ */ U(() => {
  const s = f(ke.xy).add(Ht.fract().mul(1337)), e = co(s);
  return M(e, e.oneMinus(), e).sub(0.5).div(255);
}).once()(), Cn = (s, e, t = f(90, 45)) => {
  const o = Yt(s), n = Xt(o), i = e.mul(n).mul(0.5), r = _(o.mul(t).fract().sub(0.5)).div(t), c = ut(i, i.add(n), r).oneMinus();
  return c.x.add(c.y).clamp(0, 1);
};
class uo extends Q {
  constructor() {
    super("vec3"), this.currentProjectionMatrix = v("mat4"), this.previousProjectionMatrix = v("mat4"), this.currentModelViewMatrix = v("mat4"), this.previousModelViewMatrix = v("mat4"), this.objectModelViewMatrices = /* @__PURE__ */ new WeakMap(), this.updateType = H.FRAME, this.updateBeforeType = H.OBJECT, this.updateAfterType = H.OBJECT;
  }
  static get type() {
    return "HighpVelocityNode";
  }
  setProjectionMatrix(e) {
    return this.projectionMatrix = e, this;
  }
  // Executed once per frame:
  update({ camera: e }) {
    if (e == null)
      return;
    const {
      currentProjectionMatrix: t,
      previousProjectionMatrix: o
    } = this, n = this.projectionMatrix ?? e.projectionMatrix;
    o.value == null ? o.value = new be().copy(n) : o.value.copy(t.value), t.value.copy(n);
  }
  // Executed once per object before rendering:
  updateBefore({ object: e, camera: t }) {
    if (e == null || t == null)
      return;
    const {
      currentModelViewMatrix: o,
      previousModelViewMatrix: n,
      objectModelViewMatrices: i
    } = this;
    o.value.multiplyMatrices(
      t.matrixWorldInverse,
      e.matrixWorld
    ), n.value = i.get(e) ?? o.value;
  }
  // Executed once per object after rendering:
  updateAfter({ object: e }) {
    if (e == null)
      return;
    const {
      currentModelViewMatrix: t,
      objectModelViewMatrices: o
    } = this;
    let n = o.get(e);
    n == null && (n = new be(), o.set(e, n)), n.copy(t.value);
  }
  setup(e) {
    const t = this.currentProjectionMatrix.mul(this.currentModelViewMatrix).mul(Zt).toVertexStage(), o = this.previousProjectionMatrix.mul(this.previousModelViewMatrix).mul(_t).toVertexStage(), n = t.xyz.div(t.w), i = o.xyz.div(o.w);
    return ie(n, i);
  }
}
const tt = /* @__PURE__ */ lt(uo);
class lo extends qe {
  static get type() {
    return "KawaseBlurNode";
  }
  constructor(e, t = 4) {
    super(e, t), this.resolutionScale = 0.5;
  }
  setupDownsampleNode(e) {
    const { inputNode: t, inputTexelSize: o } = this;
    y(t != null);
    const n = I(), i = z(1, 1, -1, -1).mul(o.xyxy.mul(0.5)).add(n.xyxy).toVertexStage(), r = i.zy, c = i.xy, a = i.xw, d = i.zw;
    return B(
      t.sample(n).mul(4),
      t.sample(r),
      t.sample(c),
      t.sample(a),
      t.sample(d)
    ).mul(1 / 8);
  }
  setupUpsampleNode(e) {
    const { inputNode: t, inputTexelSize: o } = this;
    y(t != null);
    const n = I(), i = z(1, 1, -1, -1).mul(o.xyxy.mul(0.5)).add(n.xyxy).toVertexStage(), r = i.zy, c = i.xy, a = i.xw, d = i.zw, l = f(i.z, n.y), u = f(i.x, n.y), p = f(n.x, i.y), h = f(n.x, i.w);
    return B(
      B(
        t.sample(r),
        t.sample(c),
        t.sample(a),
        t.sample(d)
      ).mul(1 / 12),
      B(
        t.sample(l),
        t.sample(u),
        t.sample(p),
        t.sample(h)
      ).mul(1 / 6)
    );
  }
}
const Rn = (...s) => new lo(...s);
class ho extends Q {
  constructor(e) {
    super("vec3"), this.intensity = v(1e-5), this.inputNode = e;
  }
  static get type() {
    return "LensGhostNode";
  }
  setup(e) {
    const { inputNode: t, intensity: o } = this;
    y(t != null);
    const n = V({
      name: "sampleGhost",
      type: "vec3",
      inputs: [
        { name: "uv", type: "vec2" },
        { name: "direction", type: "vec2" },
        { name: "color", type: "vec3" },
        { name: "offset", type: "float" }
      ]
    })(([a, d, l, u]) => {
      const p = d.mul(u).add(a.oneMinus()).saturate(), h = t.sample(p).rgb.mul(l), m = ie(0.5, p).length().mul(1 / (Math.SQRT2 / 4)).saturate();
      return h.mulAssign(m.oneMinus().pow(3)), h;
    }), i = I(), r = i.sub(0.5);
    return B(
      n(i, r, M(0.8, 0.8, 1), -5),
      n(i, r, M(1, 0.8, 0.4), -1.5),
      n(i, r, M(0.9, 1, 0.8), -0.4),
      n(i, r, M(1, 0.8, 0.4), -0.2),
      n(i, r, M(0.9, 0.7, 0.7), -0.1),
      n(i, r, M(0.5, 1, 0.4), 0.7),
      n(i, r, M(0.5, 0.5, 0.5), 1),
      n(i, r, M(1, 1, 0.6), 2.5),
      n(i, r, M(0.5, 0.8, 1), 10)
    ).mul(o);
  }
}
const { resetRendererState: po, restoreRendererState: mo } = ge;
function fo() {
  const o = document.createElement("canvas");
  o.width = 256, o.height = 32;
  const n = o.getContext("2d");
  y(n != null), n.beginPath(), n.moveTo(0, 32 / 2), n.lineTo(256 / 2, 5), n.lineTo(256, 32 / 2), n.lineTo(256 / 2, 27), n.closePath();
  const i = n.createLinearGradient(0, 0, 256, 0);
  return i.addColorStop(0, "#000000"), i.addColorStop(0.5, "#ffffff"), i.addColorStop(1, "#000000"), n.fillStyle = i, n.fill(), new Ds(o);
}
const st = /* @__PURE__ */ Ie({
  color: "vec3",
  luminance: "float",
  position: "vec2",
  scale: "float",
  sin: "float",
  cos: "float"
});
class xo extends Re {
  constructor(e) {
    super(e), this.spikePairCount = 6, this.wireframe = !1, this.intensity = v(1e-5), this.sizeScale = v(new ve(1.5, 0.01)), this.luminanceThreshold = v(100), this.indirectBuffer = new Us(
      new Uint32Array([6, 0, 0, 0, 0]),
      1
    ), this.instanceBuffer = Xe(1, st), this.renderTarget = this.createRenderTarget(), this.material = new js({
      depthTest: !1,
      depthWrite: !1,
      transparent: !0,
      blending: Ms
    }), this.mesh = new bt(new zs(1, 1), this.material), this.camera = new Cs(), this.inputTexelSize = v("vec2"), this.outputTexelSize = v("vec2"), this.geometryRatio = v("vec2"), this.material.name = "LensGlare", this.inputNode = e, this.resolutionScale = 0.5, this.outputTexture = this.renderTarget.texture, this.mesh.geometry.indirect = this.indirectBuffer;
  }
  customCacheKey() {
    return We(this.spikePairCount, +this.wireframe);
  }
  setSize(e, t) {
    const { resolutionScale: o } = this, n = Math.max(Math.round(e * o), 1), i = Math.max(Math.round(t * o), 1);
    this.renderTarget.setSize(n, i);
    const r = Math.floor(n / 2), c = Math.floor(i / 2), a = r * c;
    return this.instanceBuffer.bufferCount < a && (this.instanceBuffer.dispose(), this.instanceBuffer = Xe(a, st), this.setupCompute(r, c), this.setupMaterial()), this;
  }
  updateBefore({ renderer: e }) {
    if (e == null)
      return;
    const { inputNode: t } = this;
    y(t != null);
    const { width: o, height: n } = t.value;
    this.setSize(o, n);
    const { computeNode: i, indirectBuffer: r, renderTarget: c } = this;
    y(i != null), this.inputTexelSize.value.set(1 / o, 1 / n);
    const a = o / n;
    a > 1 ? this.geometryRatio.value.set(1 / a, 1) : this.geometryRatio.value.set(1, a);
    const { width: d, height: l } = c;
    this.outputTexelSize.value.set(1 / d, 1 / l), r.array[1] = 0, r.needsUpdate = !0, e.compute(i), this.rendererState = po(e, this.rendererState), e.setRenderTarget(c), e.render(this.mesh, this.camera), mo(e, this.rendererState);
  }
  setupCompute(e, t) {
    const {
      spikePairCount: o,
      inputNode: n,
      indirectBuffer: i,
      instanceBuffer: r,
      outputTexelSize: c
    } = this;
    y(n != null);
    const a = Kt(
      i,
      "uint",
      i.count
    ).toAtomic();
    this.computeNode = U(() => {
      const d = re(e, t);
      ae(Ae.xy.greaterThanEqual(d).any(), () => {
        Qt();
      });
      const l = f(Ae.xy).mul(c).mul(2), u = n.sample(l), p = u.a;
      ae(p.greaterThan(0.1), () => {
        const h = Jt(
          a.element(1),
          o
        );
        for (let m = 0; m < o; ++m) {
          const x = r.element(h.add(m));
          x.get("color").assign(u.rgb), x.get("luminance").assign(p), x.get("position").assign(Ae.xy), x.get("scale").assign(m % 2 === 0 ? 1 : 0.5);
          const w = Math.PI * (3 - Math.sqrt(5)), N = Math.PI / o * m + w;
          x.get("sin").assign(Math.sin(N)), x.get("cos").assign(Math.cos(N));
        }
      });
    })().compute(
      // @ts-expect-error "count" can be dimensional
      [Math.ceil(e / 8), Math.ceil(t / 8), 1],
      [8, 8, 1]
    );
  }
  setupMaterial() {
    const {
      inputNode: e,
      spikeNode: t,
      instanceBuffer: o,
      luminanceThreshold: n,
      intensity: i,
      sizeScale: r,
      outputTexelSize: c,
      geometryRatio: a
    } = this;
    y(e != null), y(t != null);
    const d = o.element(es);
    this.material.colorNode = this.wireframe ? z(1) : t.mul(d.get("color").mul(i)), this.material.vertexNode = U(() => {
      const l = d.get("sin"), u = d.get("cos"), p = dt(u, l, 0, l.negate(), u, 0, 0, 0, 1), m = d.get("position").mul(c).mul(2), x = m.flipY().mul(2).sub(1), N = d.get("luminance").div(n).saturate(), C = f(N, 1).mul(
        d.get("scale"),
        r,
        // Make the spike to shrink at screen borders:
        m.sub(0.5).length().mul(2).oneMinus().mul(0.5).add(0.5)
      ), j = p.mul(ct.mul(z(C, 1, 1))).mul(a).add(M(x, 0));
      return z(j, 1);
    })(), this.material.wireframe = this.wireframe, this.material.needsUpdate = !0;
  }
  setup(e) {
    if (this.spikeNode == null) {
      const t = fo();
      t.colorSpace = Rs, this.spikeNode = oe(t);
    }
    return this.setupMaterial(), super.setup(e);
  }
  dispose() {
    this.renderTarget.dispose(), this.material.dispose(), this.mesh.geometry.dispose(), super.dispose();
  }
}
const vo = /* @__PURE__ */ new ve();
class go extends Q {
  constructor(e) {
    super("vec3"), this.intensity = v(1e-5), this.chromaticAberration = v(5e-3), this.aspectRatio = v(0), this.updateBeforeType = H.FRAME, this.inputNode = e;
  }
  static get type() {
    return "LensHaloNode";
  }
  updateBefore({ renderer: e }) {
    if (e == null)
      return;
    const { width: t, height: o } = e.getDrawingBufferSize(vo);
    this.aspectRatio.value = t / o;
  }
  setup(e) {
    const { inputNode: t, intensity: o, chromaticAberration: n, aspectRatio: i } = this;
    y(t != null);
    const r = V({
      name: "cubicRingMask",
      type: "float",
      inputs: [
        { name: "x", type: "float" },
        { name: "radius", type: "float" },
        { name: "thickness", type: "float" }
      ]
    })(([l, u, p]) => {
      const h = ht(_(l.sub(u)).div(p), 1);
      return ts(h, h, ie(3, h.mul(2))).oneMinus();
    }), c = V({
      name: "sampleHalo",
      type: "vec3",
      inputs: [
        { name: "uv", type: "vec2" },
        { name: "radius", type: "float" }
      ]
    })(([l, u]) => {
      const p = f(i, 1), h = l.sub(0.5).mul(p).normalize().div(p), m = M(n).mul(M(-1, 0, 1)), x = ss(h.mul(u).add(l.oneMinus())), w = M(
        t.sample(h.mul(m.r).add(x)).r,
        t.sample(h.mul(m.g).add(x)).g,
        t.sample(h.mul(m.b).add(x)).b
      ), N = l.sub(f(0.5, 0)).mul(p).add(f(0.5, 0)), C = os(N, f(0.5)).saturate();
      return w.mulAssign(r(C, 0.45, 0.25)), w;
    }), a = I();
    return c(a, 0.3).mul(o);
  }
}
const E = (s) => s.greaterThanEqual(0).all().and(s.lessThanEqual(1).all()).toFloat();
class At extends qe {
  constructor(e, t = 4) {
    super(e, t), this.blendAmount = v(0.85), this.resolutionScale = 0.5;
  }
  static get type() {
    return "MipmapSurfaceBlurNode";
  }
  setupDownsampleNode(e) {
    const { inputNode: t, inputTexelSize: o } = this;
    return y(t != null), U(() => {
      const n = I(), i = z(1, 1, -1, -1).mul(o.xyxy).add(n.xyxy).toVertexStage(), r = z(2, 2, -2, -2).mul(o.xyxy).add(n.xyxy).toVertexStage(), c = i.zy, a = i.xy, d = i.zw, l = i.xw, u = r.zy, p = r.xy, h = r.zw, m = r.xw, x = f(n.x, r.y), w = f(r.z, n.y), N = f(r.x, n.y), C = f(n.x, r.w), j = 1 / 4 / 2, R = 1 / 9 / 2, F = t.sample(n).mul(R);
      let S;
      return S = z(
        E(c),
        E(a),
        E(d),
        E(l)
      ).mul(j), F.addAssign(
        t.sample(c).mul(S.x),
        t.sample(a).mul(S.y),
        t.sample(d).mul(S.z),
        t.sample(l).mul(S.w)
      ), S = z(
        E(u),
        E(p),
        E(h),
        E(m)
      ).mul(R), F.addAssign(
        t.sample(u).mul(S.x),
        t.sample(p).mul(S.y),
        t.sample(h).mul(S.z),
        t.sample(m).mul(S.w)
      ), S = z(
        E(x),
        E(w),
        E(N),
        E(C)
      ).mul(R), F.addAssign(
        t.sample(x).mul(S.x),
        t.sample(w).mul(S.y),
        t.sample(N).mul(S.z),
        t.sample(C).mul(S.w)
      ), F;
    })();
  }
  setupUpsampleNode(e) {
    const { inputNode: t, inputTexelSize: o, downsampleNode: n } = this;
    y(t != null);
    const i = I(), r = z(1, 1, -1, -1).mul(o.xyxy).add(i.xyxy).toVertexStage(), c = f(i.x, r.y), a = f(r.z, i.y), d = f(r.x, i.y), l = f(i.x, r.w), u = r.zy, p = r.xy, h = r.zw, m = r.xw, x = B(
      t.sample(i).mul(1 / 4),
      B(
        t.sample(c),
        t.sample(a),
        t.sample(d),
        t.sample(l)
      ).mul(1 / 8),
      B(
        t.sample(u),
        t.sample(p),
        t.sample(h),
        t.sample(m)
      ).mul(1 / 16)
    );
    return ne(n.sample(i), x, this.blendAmount);
  }
}
const Dn = (...s) => new At(...s);
function Vt(s) {
  return (s instanceof Es ? s.renderer.backend : "backend" in s ? s.backend : s).isWebGPUBackend === !0;
}
class yo extends Q {
  constructor(e) {
    super("vec4"), this.bloomIntensity = v(0.05), this.inputNode = e, this.thresholdNode = new Dt(), this.blurNode = new Bt(), this.ghostNode = new ho(), this.haloNode = new go(), this.bloomNode = new At(null, 8), this.glareNode = new xo(), this.featuresNode = ns(B(this.ghostNode, this.haloNode)), this.featuresNode.value.name = "LensFlare_features", this.featuresNode.pixelRatio = 0.5, this.blurNode.resolutionScale = 1, this.bloomNode.resolutionScale = 1, this.glareNode.resolutionScale = 1;
  }
  static get type() {
    return "LensFlareNode";
  }
  setup(e) {
    const {
      inputNode: t,
      thresholdNode: o,
      blurNode: n,
      ghostNode: i,
      haloNode: r,
      bloomNode: c,
      featuresNode: a,
      glareNode: d
    } = this;
    y(t != null);
    const l = o.getTextureNode(), u = n.getTextureNode();
    o.inputNode = t, n.inputNode = l, i.inputNode = u, r.inputNode = u, c.inputNode = l, d.inputNode = l;
    const p = c.getTextureNode().mul(this.bloomIntensity), h = d.getTextureNode();
    return U(() => {
      const m = t;
      return m.addAssign(p), Vt(e) && m.addAssign(h), m.add(a);
    })();
  }
  dispose() {
    this.thresholdNode.dispose(), this.blurNode.dispose(), this.ghostNode.dispose(), this.haloNode.dispose(), this.bloomNode.dispose(), this.glareNode.dispose(), this.featuresNode.dispose(), super.dispose();
  }
}
const Bn = (s) => new yo(s != null ? Oe(s) : null), wo = /* @__PURE__ */ V({
  name: "bvec2Not",
  type: "bvec2",
  inputs: [{ name: "x", type: "bvec2" }]
})(([s]) => s.notEqual(Me(!0))), No = /* @__PURE__ */ V({
  name: "bvec3Not",
  type: "bvec3",
  inputs: [{ name: "x", type: "bvec3" }]
})(([s]) => s.notEqual(Me(!0))), To = /* @__PURE__ */ V({
  name: "bvec4Not",
  type: "bvec4",
  inputs: [{ name: "x", type: "bvec4" }]
})(([s]) => s.notEqual(Me(!0))), An = /* @__PURE__ */ Le([
  wo,
  No,
  To
]), bo = /* @__PURE__ */ V({
  name: "bvec2And",
  type: "bvec2",
  inputs: [
    { name: "x", type: "bvec2" },
    { name: "y", type: "bvec2" }
  ]
})(([s, e]) => pt(re(s).mul(re(e)))), So = /* @__PURE__ */ V({
  name: "bvec3And",
  type: "bvec3",
  inputs: [
    { name: "x", type: "bvec3" },
    { name: "y", type: "bvec3" }
  ]
})(([s, e]) => mt(pe(s).mul(pe(e)))), Mo = /* @__PURE__ */ V({
  name: "bvec4And",
  type: "bvec4",
  inputs: [
    { name: "x", type: "bvec4" },
    { name: "y", type: "bvec4" }
  ]
})(([s, e]) => ft(me(s).mul(me(e)))), Vn = /* @__PURE__ */ Le([
  bo,
  So,
  Mo
]), zo = /* @__PURE__ */ V({
  name: "bvec2Or",
  type: "bvec2",
  inputs: [
    { name: "x", type: "bvec2" },
    { name: "y", type: "bvec2" }
  ]
})(([s, e]) => re(s).add(re(e)).notEqual(0)), Co = /* @__PURE__ */ V({
  name: "bvec3Or",
  type: "bvec3",
  inputs: [
    { name: "x", type: "bvec3" },
    { name: "y", type: "bvec3" }
  ]
})(([s, e]) => pe(s).add(pe(e)).notEqual(0)), Ro = /* @__PURE__ */ V({
  name: "bvec4Or",
  type: "bvec4",
  inputs: [
    { name: "x", type: "bvec4" },
    { name: "y", type: "bvec4" }
  ]
})(([s, e]) => me(s).add(me(e)).notEqual(0)), Pn = /* @__PURE__ */ Le([zo, Co, Ro]), Fn = /* @__PURE__ */ L(
  (s, e, t, o) => {
    const n = s.sub(t), i = Te(e, n), r = Te(n, n).sub(o.pow2()), c = i.pow2().sub(r).toConst(), a = f(-1);
    return ae(c.greaterThanEqual(0), () => {
      const d = Se(c);
      a.assign(f(i.negate().sub(d), i.negate().add(d)));
    }), a;
  }
), Do = /* @__PURE__ */ Ie({
  near: "vec4",
  far: "vec4"
}), On = /* @__PURE__ */ L(
  (s, e, t, o) => {
    const n = s.sub(t), i = Te(e, n), r = Te(n, n).sub(o.pow2()), c = i.pow2().sub(r).toConst(), a = f(c.greaterThanEqual(0)).toConst(), d = a.oneMinus().toConst(), l = Se(c.max(0)).toConst(), u = a.mul(i.negate().sub(l)).sub(d), p = a.mul(i.negate().add(l)).sub(d);
    return Do(u, p);
  }
), Un = /* @__PURE__ */ L(
  (s, e, t) => {
    const o = s.div(t), n = e.div(t), i = n.dot(n), r = o.dot(n), c = o.dot(o), a = r.pow2().sub(i.mul(c.sub(1))).toConst(), d = f(-1);
    return ae(a.greaterThanEqual(0), () => {
      const l = Se(a);
      d.assign(f(r.negate().sub(l), r.negate().add(l)).div(i));
    }), d;
  }
), Bo = {
  float: G,
  int: K,
  uint: us,
  bool: Me,
  vec2: f,
  ivec2: O,
  uvec2: re,
  bvec2: pt,
  vec3: M,
  ivec3: cs,
  uvec3: pe,
  bvec3: mt,
  vec4: z,
  ivec4: xt,
  uvec4: me,
  bvec4: ft,
  mat2: as,
  mat3: dt,
  mat4: rs,
  color: is
}, jn = ks;
function En(s) {
  return Bo[s];
}
class Ao extends Ct {
  static get type() {
    return "OutputTexture3DNode";
  }
  constructor(e, t) {
    super(t), this.owner = e, this.setUpdateMatrix(!1);
  }
  setup(e) {
    return this.owner.build(e), super.setup(e);
  }
  clone() {
    const e = new this.constructor(this.owner, this.value);
    return e.uvNode = this.uvNode, e.levelNode = this.levelNode, e.biasNode = this.biasNode, e.sampler = this.sampler, e.depthNode = this.depthNode, e.compareNode = this.compareNode, e.gradNode = this.gradNode, e.offsetNode = this.offsetNode, e;
  }
}
const kn = (...s) => new Ao(...s), Vo = ["x", "y", "z", "w"], In = /* @__PURE__ */ L(
  (s, e, t = 0) => {
    let o;
    if (typeof t == "number")
      o = t;
    else if (t?.isConstNode === !0)
      o = t.value;
    else
      throw new Error("Component must be a constant.");
    const n = s.size(), i = O(e.mul(n).sub(0.5).floor()).toConst(), r = xt(i, i.add(1)).toConst(), c = Vo[o];
    return z(
      s.load(r.xw)[c],
      // min, max
      s.load(r.zw)[c],
      // max, max
      s.load(r.zy)[c],
      // max, min
      s.load(r.xy)[c]
      // min, min
    );
  }
), Ln = /* @__PURE__ */ L(
  (s, e = I()) => {
    const t = f(s.size()), o = t.reciprocal(), n = e.mul(t), i = n.sub(0.5).floor().add(0.5), r = n.sub(i), c = r.mul(r.mul(r.mul(0.5).oneMinus()).sub(0.5)), a = r.mul(r).mul(r.mul(1.5).sub(2.5)).add(1), d = r.mul(r.mul(ie(2, r.mul(1.5))).add(0.5)), l = r.mul(r).mul(r.mul(0.5).sub(0.5)), u = a.add(d), p = d.div(a.add(d)), h = i.sub(1).mul(o), m = i.add(2).mul(o), x = i.add(p).mul(o);
    return B(
      s.sample(f(h.x, h.y)).mul(c.x).mul(c.y),
      s.sample(f(x.x, h.y)).mul(u.x).mul(c.y),
      s.sample(f(m.x, h.y)).mul(l.x).mul(c.y),
      s.sample(f(h.x, x.y)).mul(c.x).mul(u.y),
      s.sample(f(x.x, x.y)).mul(u.x).mul(u.y),
      s.sample(f(m.x, x.y)).mul(l.x).mul(u.y),
      s.sample(f(h.x, m.y)).mul(c.x).mul(l.y),
      s.sample(f(x.x, m.y)).mul(u.x).mul(l.y),
      s.sample(f(m.x, m.y)).mul(l.x).mul(l.y)
    );
  }
), Po = /* @__PURE__ */ L(
  (s, e, t, o) => (n) => {
    t ??= fe(e), o ??= xe(e);
    const i = e?.isPerspectiveCamera === !0;
    return n.renderer.logarithmicDepthBuffer ? gt(s, t, o) : i ? yt(s, t, o) : ls(s, t, o);
  }
), Ue = (s, e, t) => {
  e ??= Ee, t ??= je;
  const o = gt(s, e, t);
  return ps(o, e, t);
}, Wn = (s, e, t) => {
  e ??= Ee, t ??= je;
  const o = yt(s, e, t);
  return vt(o, e, t);
}, $n = (s, e, t, o, n) => {
  const i = o.element(K(2)).element(K(3)), r = o.element(K(3)).element(K(3)), a = z(M(s.flipY(), e).mul(2).sub(1), 1).mul(t.mul(i).add(r));
  return n.mul(a).xyz;
}, Fe = [
  [58.1375, 2.7747, 26.8183],
  [-150.5666, 4.2109, -88.5066],
  [130.5887, -14.0195, 109.0745],
  [-42.3277, 4.8052, -60.1097],
  [4.5974, 2.1856, 12.5925],
  [0.1357, 0.0914, 0.1067]
], Fo = /* @__PURE__ */ V({
  name: "turbo",
  type: "vec3",
  inputs: [{ name: "x", type: "float" }]
})(([s]) => {
  const e = M(...Fe[0]).toVar();
  for (let t = 1; t < Fe.length; ++t)
    e.assign(M(...Fe[t]).add(s.mul(e)));
  return e;
}), qn = L(
  (s, e, t, o) => {
    t ??= fe(e), o ??= xe(e);
    const n = Po(s, e, t, o);
    return Fo(vt(n, t, o));
  }
), Gn = /* @__PURE__ */ V({
  name: "equirectToDirectionWorld",
  type: "vec3",
  inputs: [{ name: "uv", type: "vec2" }]
})(([s]) => {
  const e = ie(0.5, s.x).mul(ds), t = ie(s.y, 0.5).mul(hs), o = Ze(t);
  return M(o.mul(Ze(e)), _e(t), o.mul(_e(e)));
}), D = 64;
function Ne(s) {
  return Math.floor(Math.max(0, s) / D);
}
class Oo {
  constructor() {
    this.size = [0, 0, 0], this.offset = { x: 0, y: 0 };
  }
  copy(e) {
    return [this.size[0], this.size[1], this.size[2]] = e.size, this.offset.x = e.offset.x, this.offset.y = e.offset.y, this;
  }
}
const Uo = /* @__PURE__ */ new Tt(), jo = /* @__PURE__ */ new As(), Eo = /* @__PURE__ */ new ve(), ko = /* @__PURE__ */ new be();
class Io extends Q {
  constructor(e, t, o) {
    super("float"), this.sampleCount = 60, this.hardShadowSamples = 4, this.fadeOutSamples = 8, this.thickness = v(5e-3), this.shadowContrast = v(4), this.shadowIntensity = v(1), this.bilinearThreshold = v(0.02), this.lightCoordinate = v("vec4"), this.dispatchOffset = v("ivec2"), this.dispatchIndex = v(0), this.dispatches = Array.from(
      // Populate the max number of dispatches
      { length: 8 },
      () => new Oo()
    ), this.dispatchCount = 0, this.updateBeforeType = H.FRAME, this.depthNode = e, this.camera = t, this.mainLight = o;
    const n = new Is(1, 1);
    n.colorSpace = Bs, n.minFilter = ce, n.magFilter = ce, n.generateMipmaps = !1, n.name = "ScreenSpaceShadow", this.outputTexture = n, this.textureNode = $e(this, n), this.computeNode = this.createComputeNode();
  }
  get type() {
    return "ScreenSpaceShadowNode";
  }
  customCacheKey() {
    return We(
      this.camera?.id ?? -1,
      this.mainLight?.id ?? -1,
      this.sampleCount,
      this.hardShadowSamples,
      this.fadeOutSamples
    );
  }
  getTextureNode() {
    return this.textureNode;
  }
  setSize(e, t) {
    const { outputTexture: o } = this;
    return (e !== o.width || t !== o.height) && (o.setSize(e, t, 0), o.needsUpdate = !0), this;
  }
  updateBefore(e) {
    const { renderer: t } = e;
    if (t == null)
      return;
    const o = t.getDrawingBufferSize(Eo);
    this.setSize(o.width, o.height);
    const { camera: n, mainLight: i } = this, r = ko.multiplyMatrices(
      n.projectionMatrix,
      n.matrixWorldInverse
    ), c = Uo.copy(i.position).sub(i.target.position).normalize(), a = jo.set(c.x, c.y, c.z, 0).applyMatrix4(r);
    this.updateDispatchList(a, o);
    for (let d = 0; d < this.dispatchCount; ++d) {
      const l = this.dispatches[d];
      this.dispatchOffset.value.set(l.offset.x, l.offset.y), this.dispatchIndex.value = d, t.compute(this.computeNode, l.size);
    }
  }
  // See bend_sss_cpu.h
  updateDispatchList(e, { width: t, height: o }) {
    let n = e.w;
    const i = 2e-6 * D;
    n >= 0 && n < i ? n = i : n < 0 && n > -i && (n = -i), this.lightCoordinate.value.set(
      (e.x / n * 0.5 + 0.5) * t,
      (e.y / n * -0.5 + 0.5) * o,
      e.w === 0 ? 0 : e.z / e.w,
      e.w > 0 ? 1 : -1
    );
    const r = Math.round(this.lightCoordinate.value.x), c = Math.round(this.lightCoordinate.value.y), a = -r, d = -(o - c), l = t - r, u = c;
    let p = 0;
    for (let h = 0; h < 4; ++h) {
      const m = h === 0 || h === 3, x = (h & 1) > 0, w = (h & 2) > 0, N = Ne(x ? a : -l), C = Ne(w ? d : -u), j = D * (m ? 1 : 2) - 1, R = D * (m ? 2 : 1) - 1, F = Ne((x ? l : -a) + j), S = Ne((w ? u : -d) + R);
      if (F - N > 0 && S - C > 0) {
        const k = h === 2 || h === 3 ? 1 : 0, W = h === 1 || h === 3 ? 1 : 0, g = this.dispatches[p++];
        g.size[0] = D, g.size[1] = F - N, g.size[2] = S - C, g.offset.x = (x ? N : -F) + k, g.offset.y = (w ? -S : C) + W;
        let A;
        if (h === 0 ? A = a - d : h === 1 ? A = l + d : h === 2 ? A = -a - u : A = -l + u, A = (A + D - 1) / D | 0, A > 0) {
          const T = this.dispatches[p++].copy(g);
          h === 0 ? (T.size[2] = Math.min(g.size[2], A), g.size[2] -= T.size[2], T.offset.y = g.offset.y + g.size[2], T.offset.x -= 1, T.size[1] += 1) : h === 1 ? (T.size[1] = Math.min(g.size[1], A), g.size[1] -= T.size[1], T.offset.x = g.offset.x + g.size[1], T.size[2] += 1) : h === 2 ? (T.size[1] = Math.min(g.size[1], A), g.size[1] -= T.size[1], g.offset.x += T.size[1], T.size[2] += 1, T.offset.y -= 1) : h === 3 && (T.size[2] = Math.min(g.size[2], A), g.size[2] -= T.size[2], g.offset.y += T.size[2], ++T.size[1]), (T.size[1] <= 0 || T.size[2] <= 0) && T.copy(this.dispatches[--p]), (g.size[1] <= 0 || g.size[2] <= 0) && g.copy(this.dispatches[--p]);
        }
      }
    }
    for (let h = 0; h < p; ++h) {
      const m = this.dispatches[h];
      m.offset.x *= D, m.offset.y *= D;
    }
    this.dispatchCount = p;
  }
  // See bend_sss_gpu.h
  createComputeNode() {
    const {
      depthNode: e,
      camera: t,
      sampleCount: o,
      hardShadowSamples: n,
      fadeOutSamples: i,
      outputTexture: r,
      thickness: c,
      shadowContrast: a,
      shadowIntensity: d,
      bilinearThreshold: l,
      lightCoordinate: u,
      dispatchOffset: p
    } = this, h = Math.floor(o / D) + 2, m = ms("float", h * D), x = () => {
      const w = O(Ke.yz).mul(D).add(p).toConst(), N = u.xy.floor().add(0.5).toConst(), C = u.xy.sub(N).toConst(), j = u.w.greaterThan(0), R = O(w.sign()).toConst(), F = _(w.x.add(R.y)).lessThan(_(w.y.sub(R.x))).toConst(), S = O(
        F.select(R.y, 0),
        F.select(0, R.x.negate())
      ), k = f(S.mul(Ke.x).add(w)).toConst(), W = _(k.x).greaterThan(_(k.y)).toConst(), g = W.select(k.x, k.y).toConst(), A = g.abs().toConst(), T = A.sub(D), $ = W.select(C.x, C.y).toVar();
      $.assign(
        g.greaterThan(0).select($.negate(), $)
      );
      const Y = k.add(N).toConst(), X = ne(
        u.xy,
        Y,
        T.add($).div(A.add($))
      ).toConst(), ee = Y.sub(X).toConst(), te = G(
        j.select(
          we,
          we.bitXor(D - 1)
        )
      ).toConst(), Z = ne(Y, X, te.div(D)).toVar(), q = A.sub(te).add($).toConst();
      return { pixelXY: Z, pixelDistance: q, xyDelta: ee, xAxisMajor: W };
    };
    return U((w) => {
      const [N, C] = w.renderer.reversedDepthBuffer ? [G(1), G(0)] : [G(0), G(1)], j = (b) => {
        let P = e.load(b);
        return w.renderer.logarithmicDepthBuffer && (P = Ue(
          P,
          fe(t),
          xe(t)
        )), P = P.toConst(), wt(
          b.greaterThanEqual(0).all(),
          b.lessThan(e.size()).all()
        ).select(P, C);
      }, { pixelXY: R, xyDelta: F, pixelDistance: S, xAxisMajor: k } = x(), W = u.w.negate(), g = N.greaterThan(C).select(-1, 1).toConst(), A = O(R.floor()).toConst();
      let T, $, Y;
      for (let b = 0; b < h; ++b) {
        const P = O(R.floor()).toConst(), he = k.select(R.y, R.x).fract().sub(0.5).greaterThan(0).select(1, -1).toConst(), Pt = O(
          k.select(0, he),
          k.select(he, 0)
        ), se = j(P).toConst(), He = j(P.add(Pt)).toConst(), Ye = C.sub(se).abs().toConst(), Ft = fs(
          se.sub(He).abs(),
          Ye.mul(l)
        ), Ot = se.add(
          _(se.sub(He)).mul(g)
        ), Ut = Ft.select(se, Ot), De = b === 0 ? S : W.mul(D * b).add(S).toConst();
        let Be = Ut.sub(u.z).div(De).toConst();
        b > 0 && (Be = De.greaterThan(0).select(Be, 1e10).toConst()), m.element(we.add(D * b)).assign(Be), b === 0 && (T = se, $ = Ye, Y = De), R.addAssign(F.mul(W));
      }
      xs();
      const X = T.sub(u.z).div(Y).toVar(), ee = Y.add(W).min(c.reciprocal()).mul(Y).div($).toConst();
      X.assign(X.mul(ee).sub(g));
      const te = we.add(1).toConst(), Z = G(1).toVar();
      for (let b = 0; b < n; ++b) {
        const P = X.sub(m.element(te.add(b)).mul(ee)).abs();
        Z.assign(Z.min(P));
      }
      const q = z(1).toVar();
      for (let b = n; b < o - i; ++b) {
        const P = X.sub(m.element(te.add(b)).mul(ee)).abs(), de = K(b & 3).toConst();
        q.element(de).assign(q.element(de).min(P));
      }
      for (let b = o - i; b < o; ++b) {
        const P = X.sub(m.element(te.add(b)).mul(ee)).abs(), de = (b + 1 - (o - i)) / (i + 1) * 0.75, he = K(b & 3).toConst();
        q.element(he).assign(q.element(he).min(P.add(de)));
      }
      const Ge = a.oneMinus().toConst();
      Z.assign(
        Z.mul(a).add(Ge).saturate()
      ), q.assign(
        q.mul(a).add(Ge).saturate()
      );
      const ye = G(0).toVar();
      ye.assign(q.dot(z(0.25))), ye.assign(ht(Z, ye)), vs(r, A, ne(1, ye, d));
    })().computeKernel([D, 1, 1]);
  }
  setup(e) {
    return this.textureNode;
  }
  dispose() {
    this.outputTexture.dispose();
  }
}
const Hn = (...s) => new Io(...s), Lo = /* @__PURE__ */ (() => {
  const s = new Ls(new Uint8Array(1));
  return s.format = Ws, s.minFilter = Qe, s.magFilter = Qe, s.wrapS = Ve, s.wrapT = Ve, s.wrapR = Ve, s.needsUpdate = !0, s;
})();
class Wo extends Ct {
  constructor() {
    super(Lo), this.url = Gs;
  }
  customCacheKey() {
    return Ys(this.url);
  }
  setup(e) {
    return new Hs().loadAsync(this.url).then((t) => {
      this.value = t;
    }).catch((t) => {
      console.error(t);
    }), super.setup(e);
  }
  clone() {
    const e = new this.constructor();
    return e.uvNode = this.uvNode, e.levelNode = this.levelNode, e.biasNode = this.biasNode, e.sampler = this.sampler, e.depthNode = this.depthNode, e.compareNode = this.compareNode, e.gradNode = this.gradNode, e.offsetNode = this.offsetNode, e;
  }
}
const $o = /* @__PURE__ */ lt(Wo), Yn = /* @__PURE__ */ U(() => $o.sample(M(ke.xy, gs.mod(64)).div(M(128, 128, 64))).r.toConst("stbn")).once()();
class qo extends $s {
  static get type() {
    return "StorageTexture3DNode";
  }
  getDefaultUV() {
    return M(0.5, 0.5, 0.5);
  }
  setUpdateMatrix(e) {
  }
  generateUV(e, t) {
    return t.build(e, this.sampler ? "vec3" : "ivec3");
  }
  generateOffset(e, t) {
    return t.build(e, "ivec3");
  }
}
const Xn = (...s) => new qo(...s);
function ot(s, e) {
  let t = 1, o = 0;
  for (; s > 0; )
    t /= e, o += t * (s % e), s = Math.floor(s / e);
  return o;
}
const nt = /* @__PURE__ */ Array.from(
  { length: 16 },
  (s, e) => new ve(ot(e + 1, 2), ot(e + 1, 3))
), { resetRendererState: Go, restoreRendererState: Ho } = ge;
function Yo(s) {
  return s.isPerspectiveCamera === !0 || s.isOrthographicCamera === !0 || "updateProjectionMatrix" in s && "setViewOffset" in s && "clearViewOffset" in s;
}
const Xo = /* @__PURE__ */ V({
  name: "clipAABB",
  type: "vec4",
  inputs: [
    { name: "current", type: "vec4" },
    { name: "history", type: "vec4" },
    { name: "minColor", type: "vec4" },
    { name: "maxColor", type: "vec4" }
  ]
})(([s, e, t, o]) => {
  const n = o.rgb.add(t.rgb).mul(0.5).toConst(), i = o.rgb.sub(t.rgb).mul(0.5).add(1e-7), r = e.sub(z(n, s.a)).toConst(), a = r.xyz.div(i).abs().toConst(), d = Nt(a.x, a.y, a.z).toConst();
  return d.greaterThan(1).select(z(n, s.a).add(r.div(d)), e);
}), it = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, 0]
], Zo = /* @__PURE__ */ L(
  (s, e, t, o, n) => {
    const i = t.toVar(), r = t.pow2().toVar();
    for (const [p, h] of it) {
      const m = s.load(e.add(O(p, h))).toConst();
      i.addAssign(m), r.addAssign(m.pow2());
    }
    const c = it.length + 1, a = i.div(c).toConst(), d = Se(r.div(c).sub(a.pow2()).max(0)).mul(n).toConst(), l = a.sub(d).toConst(), u = a.add(d).toConst();
    return Xo(a.clamp(l, u), o, l, u);
  }
), _o = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 0],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1]
], Ko = /* @__PURE__ */ Ie({
  closestCoord: "ivec2",
  closestDepth: "float"
}), Qo = /* @__PURE__ */ L(
  (s, e) => (t) => {
    const o = O(0).toVar(), n = G(1).toVar();
    for (const [i, r] of _o) {
      const c = e.add(O(i, r)).toConst();
      let a = s.load(c).r;
      t.renderer.reversedDepthBuffer && (a = a.oneMinus()), a = a.toConst(), ae(a.lessThan(n), () => {
        o.assign(c), n.assign(a);
      });
    }
    return Ko(o, n);
  }
), Jo = /* @__PURE__ */ L(
  (s, e) => {
    const o = s.mul(e).fract().abs(), n = Nt(o, o.oneMinus());
    return n.x.mul(n.y).oneMinus().div(0.75);
  }
), rt = /* @__PURE__ */ new ve(), en = /* @__PURE__ */ new Vs(1, 1);
class at extends Q {
  constructor(e, t, o, n) {
    if (super("vec4"), this.temporalAlpha = v(0.05), this.varianceGamma = v(1), this.velocityThreshold = v(0.1), this.depthError = v(1e-3), this.debugShowRejection = !1, this.resolveRT = this.createRenderTarget("resolve"), this.historyRT = this.createRenderTarget("history"), this.resolveMaterial = new ue(), this.mesh = new ze(), this.needsSyncRenderPipeline = !1, this.needsClearHistory = !1, this.resolveNode = oe(this.resolveRT.texture), this.historyNode = oe(this.historyRT.texture), this.previousDepthNode = oe(en), this.originalProjectionMatrix = new be(), this.jitterIndex = 0, this.updateBeforeType = H.FRAME, this.resolveMaterial.name = "TemporalAntialias_resolve", this.mesh.name = "TemporalAntialias", this.inputNode = e, this.depthNode = t, this.velocityNode = o, !Yo(n))
      throw new Error("The provided camera is not supported.");
    this.camera = n, this.textureNode = $e(this, this.resolveRT.texture);
  }
  static get type() {
    return "TemporalAntialiasNode";
  }
  customCacheKey() {
    return We(this.camera.id, +this.debugShowRejection);
  }
  createRenderTarget(e) {
    const t = new St(1, 1, {
      depthBuffer: !1,
      type: zt,
      format: Mt
    }), o = t.texture;
    o.minFilter = ce, o.magFilter = ce, o.generateMipmaps = !1;
    const n = this.constructor.type;
    return o.name = e != null ? `${n}_${e}` : n, t;
  }
  getTextureNode() {
    return this.textureNode;
  }
  setSize(e, t) {
    const { resolveRT: o, historyRT: n } = this;
    return (e !== n.width || t !== n.height) && (o.setSize(e, t), n.setSize(e, t), this.needsClearHistory = !0), this;
  }
  clearHistory(e) {
    e.setRenderTarget(this.resolveRT), e.clear(), e.setRenderTarget(this.historyRT), e.clear(), this.needsClearHistory = !1;
  }
  setViewOffset(e, t) {
    const { camera: o } = this;
    o.updateProjectionMatrix(), this.originalProjectionMatrix.copy(o.projectionMatrix), tt.setProjectionMatrix(this.originalProjectionMatrix);
    const n = nt[this.jitterIndex], i = n.x - 0.5, r = n.y - 0.5;
    o.setViewOffset(e, t, i, r, e, t);
  }
  clearViewOffset() {
    this.camera.clearViewOffset(), tt.setProjectionMatrix(null), this.jitterIndex = (this.jitterIndex + 1) % nt.length;
  }
  copyDepthTexture(e) {
    const t = this.depthNode.value, o = this.previousDepthTexture ??= t.clone();
    (o.image.width !== t.width || o.image.height !== t.height) && (o.image.width = t.width, o.image.height = t.height, o.needsUpdate = !0), e.copyTextureToTexture(t, o), this.previousDepthNode.value = o;
  }
  swapBuffers() {
    const { resolveRT: e, historyRT: t } = this;
    this.resolveRT = t, this.historyRT = e, this.resolveNode.value = t.texture, this.historyNode.value = e.texture, this.textureNode.value = e.texture;
  }
  updateBefore({ renderer: e }) {
    if (e == null)
      return;
    const t = e.getDrawingBufferSize(rt);
    this.setSize(t.x, t.y), this.rendererState = Go(e, this.rendererState), this.needsClearHistory && this.clearHistory(e), e.setRenderTarget(this.resolveRT), this.mesh.material = this.resolveMaterial, this.mesh.render(e), Ho(e, this.rendererState), Vt(e) && this.copyDepthTexture(e), this.swapBuffers(), this.needsSyncRenderPipeline && this.clearViewOffset();
  }
  setupResolveNode({ renderer: e }) {
    const t = (o) => {
      const { previousDepthNode: n } = this, i = n.load(O(o.mul(n.size()).sub(0.5))).toConst();
      return e.logarithmicDepthBuffer ? Ue(
        i,
        fe(this.camera),
        xe(this.camera)
      ) : e.reversedDepthBuffer ? i.oneMinus() : i;
    };
    return U(() => {
      const o = O(ke), n = ys, i = Qo(this.depthNode, o).toConst(), r = i.get("closestCoord"), c = i.get("closestDepth"), a = this.velocityNode.load(r).xyz.mul(M(0.5, -0.5, 0.5)).toConst(), d = a.xy.length().div(this.velocityThreshold).oneMinus().saturate(), l = n.sub(a.xy).toConst(), u = t(l), p = e.logarithmicDepthBuffer ? Ue(
        c,
        fe(this.camera),
        xe(this.camera)
      ) : c, h = ws(
        p.add(a.z),
        u.add(this.depthError)
      ), m = d.mul(h), x = wt(
        l.greaterThanEqual(0).all(),
        l.lessThanEqual(1).all()
      ).toFloat(), w = c.notEqual(1).toFloat(), N = this.inputNode.load(o).toVar();
      return ae(x.mul(w).mul(m).greaterThan(0), () => {
        const C = oe(this.historyNode, l), j = Zo(
          this.inputNode,
          o,
          N,
          C,
          this.varianceGamma
        ), R = ne(
          this.temporalAlpha,
          0.4,
          Jo(a.xy, Ns(this.inputNode))
        ).saturate();
        N.assign(ne(j, N, R));
      }).Else(() => {
        this.debugShowRejection && N.assign(M(1, 0, 0));
      }), N;
    })();
  }
  setup(e) {
    const t = () => {
      const n = e.renderer.getDrawingBufferSize(rt);
      this.setViewOffset(n.width, n.height);
    };
    if (e.context.renderPipeline != null) {
      const { context: n } = e.context.renderPipeline;
      n.onBeforeRenderPipeline = t, this.needsSyncRenderPipeline = !0;
    }
    if (e.context.postProcessing != null) {
      const { context: n } = e.context.postProcessing;
      n.onBeforePostProcessing = t, this.needsSyncRenderPipeline = !0;
    }
    const { resolveMaterial: o } = this;
    return o.fragmentNode = this.setupResolveNode(e), o.needsUpdate = !0, this.textureNode.uvNode = this.inputNode.uvNode, this.textureNode;
  }
  dispose() {
    this.resolveRT.dispose(), this.historyRT.dispose(), this.previousDepthTexture?.dispose(), this.resolveMaterial.dispose(), this.mesh.geometry.dispose(), super.dispose();
  }
}
function Zn(...s) {
  if (s.length === 1)
    return (i, r, c, a) => new at(
      Oe(i),
      r,
      c,
      a
    );
  const [e, t, o, n] = s;
  return new at(
    Oe(e),
    t,
    o,
    n
  );
}
export {
  fn as CascadedShadowMapsNode,
  Dt as DownsampleThresholdNode,
  V as FnLayout,
  L as FnVar,
  Bt as GaussianBlurNode,
  uo as HighpVelocityNode,
  lo as KawaseBlurNode,
  yo as LensFlareNode,
  eo as MipmapBlurNode,
  At as MipmapSurfaceBlurNode,
  jn as Node,
  Sn as OnBeforeFrameUpdate,
  bn as OnFrameUpdate,
  Ao as OutputTexture3DNode,
  _s as OutputTextureNode,
  Wo as STBNTextureNode,
  Io as ScreenSpaceShadowNode,
  qo as StorageTexture3DNode,
  at as TemporalAntialiasNode,
  Vn as bvecAnd,
  An as bvecNot,
  Pn as bvecOr,
  xe as cameraFar,
  fe as cameraNear,
  pn as cameraPositionWorld,
  gn as debugFragmentNode,
  xn as debugMaterial,
  yn as debugNode,
  vn as debugVertexNode,
  qn as depthToColor,
  Po as depthToViewZ,
  zn as dithering,
  Tn as downsampleThreshold,
  Cn as equirectGrid,
  Gn as equirectToDirectionWorld,
  Mn as gaussianBlur,
  tt as highpVelocity,
  wn as hookFunction,
  co as interleavedGradientNoise,
  dn as inverseProjectionMatrix,
  hn as inverseViewMatrix,
  Vt as isWebGPU,
  Rn as kawaseBlur,
  Bn as lensFlare,
  Ue as logarithmicToPerspectiveDepth,
  Nn as mipmapBlur,
  Rt as mipmapBlurDownsample,
  Js as mipmapBlurUpsample,
  Dn as mipmapSurfaceBlur,
  En as node,
  $e as outputTexture,
  kn as outputTexture3D,
  Wn as perspectiveToLogarithmicDepth,
  un as projectionMatrix,
  Un as rayEllipsoidIntersection,
  Fn as raySphereIntersection,
  On as raySpheresIntersections,
  Do as raySpheresIntersectionsStruct,
  Hn as screenSpaceShadow,
  $n as screenToPositionView,
  Yn as stbn,
  $o as stbnTexture,
  Xn as storageTexture3D,
  Zn as temporalAntialias,
  Ln as textureCatmullRom,
  In as textureGather,
  Fo as turbo,
  ln as viewMatrix,
  mn as viewZ
};
