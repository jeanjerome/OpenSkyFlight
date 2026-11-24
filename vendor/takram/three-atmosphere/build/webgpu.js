import { struct as ut, uint as Q, uvec2 as Mt, ivec2 as ue, float as P, vec3 as E, uniform as O, clamp as cs, sqrt as _, max as ot, smoothstep as Ae, floor as de, vec4 as w, div as us, mul as pt, PI as Fe, add as Ct, bool as _t, If as D, min as Rt, exp as he, vec2 as U, Loop as wt, mix as ct, step as Un, cos as It, sin as Vt, mrt as we, screenCoordinate as at, acos as qs, Fn as Y, texture as Gt, texture3D as Ee, globalId as st, Return as fe, textureStore as kt, workgroupArray as fs, workgroupBarrier as vs, uvec3 as In, positionView as Pn, PI2 as Bn, fwidth as Zs, equirectUV as On, dFdx as Ns, dFdy as bs, log as Wn, instancedBufferAttribute as We, screenSize as $s, screenUV as kn, pow as Gn, uv as se, nodeProxy as Hs, positionGeometry as ds, remapClamp as qn, normalWorld as Zn, positionWorld as $n, cameraViewMatrix as Hn, int as Es, and as Xs, Break as Ms, uniformTexture as Xn, uvec4 as Rs, uniformArray as zs, instanceIndex as Ls, pmremTexture as Kn } from "three/tsl";
import { Vector3 as nt, RenderTarget as Ht, RGBAFormat as Bt, LinearFilter as X, NoColorSpace as De, RenderTarget3D as Qn, Vector2 as zt, Texture as Yn, FloatType as ls, HalfFloatType as Xt, Data3DTexture as _n, Sprite as jn, InstancedBufferAttribute as ke, AdditiveBlending as Jn, DirectionalLight as Ks, Matrix3 as to, RGFormat as ms, Box2 as eo, Matrix4 as Qs, Vector4 as so, PerspectiveCamera as no, Points as oo, BufferGeometry as io, BufferAttribute as ao, Mesh as ro, CubeRenderTarget as co, CubeCamera as uo } from "three";
import { reinterpretType as hs, radians as Ys, isFloatLinearSupported as lo, Geodetic as mo, Ellipsoid as ho, ArrayBufferLoader as po, floorPowerOfTwo as go, QuadGeometry as xo } from "@takram/three-geospatial";
import { l as rt, r as Vs, k as So, a as yo } from "./shared2.js";
import { QuadMesh as Kt, NodeMaterial as vt, StorageTexture as To, Storage3DTexture as Co, RendererUtils as Ot, Node as wo, NodeUpdateType as gt, TempNode as Qt, PointsNodeMaterial as _s, RenderTarget as fo, AnalyticLightNode as vo, LinearFilter as As } from "three/webgpu";
import { FnLayout as k, FnVar as W, stbn as No, outputTexture as ft, outputTexture3D as Ge, isWebGPU as bo, cameraNear as Eo, cameraFar as js, projectionMatrix as Js, equirectToDirectionWorld as Mo, inverseProjectionMatrix as Me, inverseViewMatrix as re, rayEllipsoidIntersection as Ro, depthToViewZ as zo, screenToPositionView as Lo, Node as ne, raySpheresIntersections as Vo, textureGather as tn, bvecNot as le, bvecAnd as jt, OnBeforeFrameUpdate as Jt } from "@takram/three-geospatial/webgpu";
import { NodeUtils as OSF_NodeUtils } from "three/webgpu";
const { hash: ps } = OSF_NodeUtils;
const H = "float", Ao = "float", q = "float", Fs = "float", Fo = "float", en = "float", Do = "vec3", qt = "vec3", Pt = "vec3", sn = "vec3", At = "vec3", nn = "vec3", Ds = "vec3", Re = /* @__PURE__ */ ut(
  {
    width: H,
    expTerm: q,
    expScale: Fs,
    linearTerm: Fs,
    constantTerm: q
  },
  "DensityProfileLayer"
), te = /* @__PURE__ */ ut(
  {
    layer0: (Re.layout?.name ?? Re.name),
    layer1: (Re.layout?.name ?? Re.name)
  },
  "DensityProfile"
), os = {
  worldToUnit: q,
  solarIrradiance: Pt,
  sunAngularRadius: Ao,
  bottomRadius: H,
  topRadius: H,
  rayleighDensity: (te.layout?.name ?? te.name),
  rayleighScattering: At,
  mieDensity: (te.layout?.name ?? te.name),
  mieScattering: At,
  mieExtinction: At,
  miePhaseFunctionG: q,
  absorptionDensity: (te.layout?.name ?? te.name),
  absorptionExtinction: At,
  groundAlbedo: qt,
  minCosLight: q,
  sunRadianceToLuminance: qt,
  skyRadianceToLuminance: qt,
  luminanceScale: q,
  transmittanceTextureSize: "uvec2",
  irradianceTextureSize: "uvec2",
  multipleScatteringTextureSize: "uvec2",
  scatteringTextureRadiusSize: "uint",
  scatteringTextureCosViewSize: "uint",
  scatteringTextureCosLightSize: "uint",
  scatteringTextureCosViewLightSize: "uint"
}, J = /* @__PURE__ */ ut(
  os,
  "AtmosphereParameters"
);
function Us(n, t) {
  const { width: e, expTerm: s, expScale: o, linearTerm: i, constantTerm: a } = n;
  return Re({
    // @ts-expect-error Object-style parameter is supported
    width: P(e * t),
    expTerm: P(s),
    expScale: P(o / t),
    linearTerm: P(i / t),
    constantTerm: P(a)
  });
}
function qe(n, t) {
  return te({
    // @ts-expect-error Object-style parameter is supported
    layer0: Us(n.layers[0], t),
    layer1: Us(n.layers[1], t)
  });
}
const Is = Symbol("DESTRUCTIBLE");
function j(n) {
  if (hs(n), n[Is] === !0)
    return n;
  for (const t in os)
    Object.hasOwn(os, t) && (n[t] = n.get(t));
  return n[Is] = !0, n;
}
class gs {
  constructor(t) {
    this.parameters = t;
    const {
      worldToUnit: e,
      solarIrradiance: s,
      sunAngularRadius: o,
      bottomRadius: i,
      topRadius: a,
      rayleighDensity: r,
      rayleighScattering: u,
      mieDensity: c,
      mieScattering: d,
      mieExtinction: l,
      miePhaseFunctionG: h,
      absorptionDensity: m,
      absorptionExtinction: p,
      groundAlbedo: y,
      minCosLight: g,
      sunRadianceToLuminance: S,
      skyRadianceToLuminance: x,
      luminanceScale: T,
      transmittanceTextureSize: C,
      irradianceTextureSize: f,
      multipleScatteringTextureSize: M,
      scatteringTextureRadiusSize: N,
      scatteringTextureCosViewSize: b,
      scatteringTextureCosLightSize: A,
      scatteringTextureCosViewLightSize: z
    } = t;
    this.parametersNode = j(
      J({
        // @ts-expect-error Object-style parameter is supported
        worldToUnit: P(e),
        solarIrradiance: E(s),
        sunAngularRadius: P(o),
        bottomRadius: P(i * e),
        topRadius: P(a * e),
        rayleighDensity: qe(r, e),
        rayleighScattering: E(
          u.x / e,
          u.y / e,
          u.z / e
        ),
        mieDensity: qe(c, e),
        // OSF: aerosol coefficients as uniforms, so the aerosol density can change
        // at runtime (new LUTs) without recompiling the shaders
        mieScattering: O(new nt().copy(d).divideScalar(e)).onRenderUpdate((OSF_f, { value: OSF_v }) => {
          OSF_v.copy(t.mieScattering).divideScalar(e);
        }),
        mieExtinction: O(new nt().copy(l).divideScalar(e)).onRenderUpdate((OSF_f, { value: OSF_v }) => {
          OSF_v.copy(t.mieExtinction).divideScalar(e);
        }),
        miePhaseFunctionG: P(h),
        absorptionDensity: qe(m, e),
        absorptionExtinction: E(
          p.x / e,
          p.y / e,
          p.z / e
        ),
        groundAlbedo: E(y),
        minCosLight: P(g),
        sunRadianceToLuminance: E(S),
        skyRadianceToLuminance: E(x),
        luminanceScale: P(T),
        transmittanceTextureSize: ue(C),
        irradianceTextureSize: ue(f),
        multipleScatteringTextureSize: Mt(M),
        scatteringTextureRadiusSize: Q(N),
        scatteringTextureCosViewSize: Q(b),
        scatteringTextureCosLightSize: Q(A),
        scatteringTextureCosViewLightSize: Q(
          z
        )
      }).toConst("atmosphereParameters")
    );
  }
  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  dispose() {
  }
}
function Nt(n) {
  if (typeof n.context.getAtmosphere != "function")
    throw new Error("getAtmosphere() was not found in the builder context.");
  const t = n.context.getAtmosphere();
  if (!(t instanceof gs))
    throw new Error(
      "getAtmosphere() must return an instanceof AtmosphereContextBase."
    );
  return t;
}
class on extends gs {
  constructor(t, e) {
    super(t), this.lambdas = O(new nt(680, 550, 440)), this.luminanceFromRadiance = O("mat3"), this.textureType = e;
  }
}
class an {
  setup(t, e) {
    this.parameters = t, this.textureType = e;
  }
  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  dispose() {
  }
}
const Tt = /* @__PURE__ */ k({
  name: "clampCosine",
  type: q,
  inputs: [{ name: "cosine", type: q }]
})(([n]) => cs(n, -1, 1)), rn = /* @__PURE__ */ k({
  name: "clampDistance",
  type: q,
  inputs: [{ name: "cosine", type: q }]
})(([n]) => ot(n, 0)), pe = /* @__PURE__ */ k({
  name: "clampRadius",
  type: H,
  inputs: [
    { name: "parameters", type: J },
    { name: "radius", type: H }
  ]
})(([n, t]) => {
  const { topRadius: e, bottomRadius: s } = j(n);
  return cs(t, s, e);
}), Ut = /* @__PURE__ */ k({
  name: "sqrtSafe",
  type: q,
  inputs: [{ name: "area", type: Fo }]
})(([n]) => _(ot(n, 0))), ee = /* @__PURE__ */ k({
  name: "distanceToTopAtmosphereBoundary",
  type: H,
  inputs: [
    { name: "parameters", type: J },
    { name: "radius", type: H },
    { name: "cosView", type: q }
  ]
})(([n, t, e]) => {
  const { topRadius: s } = j(n), o = t.pow2().mul(e.pow2().sub(1)).add(s.pow2());
  return rn(t.negate().mul(e).add(Ut(o)));
}), Uo = /* @__PURE__ */ k({
  name: "distanceToBottomAtmosphereBoundary",
  type: H,
  inputs: [
    { name: "parameters", type: J },
    { name: "radius", type: H },
    { name: "cosView", type: q }
  ]
})(([n, t, e]) => {
  const { bottomRadius: s } = j(n), o = t.pow2().mul(e.pow2().sub(1)).add(s.pow2());
  return rn(t.negate().mul(e).sub(Ut(o)));
}), cn = /* @__PURE__ */ k({
  name: "distanceToNearestAtmosphereBoundary",
  type: H,
  inputs: [
    { name: "parameters", type: J },
    { name: "radius", type: H },
    { name: "cosView", type: q },
    { name: "intersectsGround", type: "bool" }
  ]
})(([n, t, e, s]) => s.select(
  Uo(n, t, e),
  ee(n, t, e)
)), xs = /* @__PURE__ */ k({
  name: "rayIntersectsGround",
  type: "bool",
  inputs: [
    { name: "parameters", type: J },
    { name: "radius", type: H },
    { name: "cosView", type: q }
  ]
})(([n, t, e]) => {
  const { bottomRadius: s } = j(n);
  return e.lessThan(0).and(
    t.pow2().mul(e.pow2().sub(1)).add(s.pow2()).greaterThanEqual(0)
  );
}), Ft = /* @__PURE__ */ k({
  name: "getTextureCoordFromUnitRange",
  type: "float",
  inputs: [
    { name: "unit", type: "float" },
    { name: "textureSize", type: "float" }
  ]
})(([n, t]) => us(0.5, t).add(
  n.mul(t.reciprocal().oneMinus())
)), Io = /* @__PURE__ */ k({
  name: "getTransmittanceTextureUV",
  type: "vec2",
  inputs: [
    { name: "parameters", type: J },
    { name: "radius", type: H },
    { name: "cosView", type: q }
  ]
})(([n, t, e]) => {
  const { topRadius: s, bottomRadius: o, transmittanceTextureSize: i } = j(n), a = _(s.pow2().sub(o.pow2())).toConst(), r = Ut(
    t.pow2().sub(o.pow2())
  ).toConst(), u = ee(
    n,
    t,
    e
  ), c = s.sub(t).toConst(), d = r.add(a), l = u.remap(c, d), h = r.div(a);
  return U(
    Ft(l, i.x),
    Ft(h, i.y)
  );
}), Yt = /* @__PURE__ */ W(
  (n, t, e) => (s) => {
    const o = Nt(s), { parametersNode: i } = o, a = Io(i, t, e);
    return n.sample(a).rgb;
  }
), Ne = /* @__PURE__ */ W(
  (n, t, e, s, o) => (i) => {
    const a = Nt(i), { parametersNode: r } = a, u = pe(
      r,
      _(
        s.pow2().add(pt(2, t, e, s)).add(t.pow2())
      )
    ).toConst(), c = Tt(
      t.mul(e).add(s).div(u)
    ).toConst(), d = E(0).toVar();
    return D(o, () => {
      d.assign(
        Yt(
          n,
          u,
          c.negate()
        ).div(
          Yt(
            n,
            t,
            e.negate()
          )
        ).min(1)
      );
    }).Else(() => {
      d.assign(
        Yt(
          n,
          t,
          e
        ).div(
          Yt(
            n,
            u,
            c
          )
        ).min(1)
      );
    }), d;
  }
), $t = /* @__PURE__ */ W(
  (n, t, e) => (s) => {
    const o = Nt(s), { parametersNode: i } = o, { sunAngularRadius: a, bottomRadius: r } = i, u = r.div(t).toConst(), c = _(ot(u.pow2().oneMinus(), 0)).negate();
    return Yt(
      n,
      t,
      e
    ).mul(
      Ae(
        u.negate().mul(a),
        u.mul(a),
        e.sub(c)
      )
    );
  }
), ge = /* @__PURE__ */ k({
  name: "rayleighPhaseFunction",
  type: en,
  inputs: [{ name: "cosViewLight", type: q }]
})(([n]) => us(3, pt(16, Fe)).mul(n.pow2().add(1))), Ue = /* @__PURE__ */ k({
  name: "miePhaseFunction",
  type: en,
  inputs: [
    { name: "g", type: q },
    { name: "cosViewLight", type: q }
  ]
})(([n, t]) => us(3, Fe.mul(8)).mul(n.pow2().oneMinus()).div(n.pow2().add(2)).mul(t.pow2().add(1)).div(n.pow2().sub(n.mul(2).mul(t)).add(1).pow(1.5))), un = /* @__PURE__ */ k({
  name: "getScatteringTextureCoord",
  type: "vec4",
  inputs: [
    { name: "parameters", type: J },
    { name: "radius", type: H },
    { name: "cosView", type: q },
    { name: "cosLight", type: q },
    { name: "cosViewLight", type: q },
    { name: "intersectsGround", type: "bool" }
  ]
})(([
  n,
  t,
  e,
  s,
  o,
  i
]) => {
  const {
    topRadius: a,
    bottomRadius: r,
    minCosLight: u,
    scatteringTextureRadiusSize: c,
    scatteringTextureCosViewSize: d,
    scatteringTextureCosLightSize: l
  } = j(n), h = _(a.pow2().sub(r.pow2())).toConst(), m = Ut(
    t.pow2().sub(r.pow2())
  ).toConst(), p = Ft(
    m.div(h),
    c
  ), y = t.mul(e).toConst(), g = y.pow2().sub(t.pow2()).add(r.pow2()).toConst(), S = P(0).toVar();
  D(i, () => {
    const z = y.negate().sub(Ut(g)), L = t.sub(r).toConst(), R = m;
    S.assign(
      Ft(
        R.equal(L).select(0, z.remap(L, R)),
        d.div(2)
      ).oneMinus().mul(0.5)
    );
  }).Else(() => {
    const z = y.negate().add(Ut(g.add(h.pow2()))), L = a.sub(t).toConst(), R = m.add(h);
    S.assign(
      Ft(
        z.remap(L, R),
        d.div(2)
      ).add(1).mul(0.5)
    );
  });
  const x = a.sub(r).toConst(), T = h, f = ee(n, r, s).remap(x, T).toConst(), N = ee(
    n,
    r,
    u
  ).remap(x, T), b = Ft(
    ot(f.div(N).oneMinus(), 0).div(f.add(1)),
    l
  ), A = o.add(1).mul(0.5);
  return w(A, b, S, p);
}), ze = /* @__PURE__ */ W(
  (n, t, e, s, o, i) => (a) => {
    const r = Nt(a), { parametersNode: u } = r, { scatteringTextureCosViewLightSize: c } = u, d = un(
      u,
      t,
      e,
      s,
      o,
      i
    ).toConst(), l = d.x.mul(c.sub(1)).toConst(), h = de(l).toConst(), m = l.sub(h).toConst(), p = E(
      h.add(d.y).div(c),
      d.z,
      d.w
    ), y = E(
      h.add(1).add(d.y).div(c),
      d.z,
      d.w
    );
    return n.sample(p).mul(m.oneMinus()).add(n.sample(y).mul(m)).rgb;
  }
), Po = /* @__PURE__ */ k({
  name: "getIrradianceTextureUV",
  type: "vec2",
  inputs: [
    { name: "parameters", type: J },
    { name: "radius", type: H },
    { name: "cosLight", type: q }
  ]
})(([n, t, e]) => {
  const { topRadius: s, bottomRadius: o, irradianceTextureSize: i } = j(n), a = t.remap(o, s), r = e.mul(0.5).add(0.5);
  return U(
    Ft(r, i.x),
    Ft(a, i.y)
  );
}), Ss = /* @__PURE__ */ W(
  (n, t, e) => (s) => {
    const o = Nt(s), { parametersNode: i } = o, a = Po(i, t, e);
    return n.sample(a).rgb;
  }
), Ps = /* @__PURE__ */ k({
  name: "getLayerDensity",
  type: q,
  inputs: [
    { name: "layer", type: Re },
    { name: "altitude", type: H }
  ]
})(([n, t]) => {
  const e = n.get("expTerm"), s = n.get("expScale"), o = n.get("linearTerm"), i = n.get("constantTerm");
  return e.mul(he(s.mul(t))).add(o.mul(t)).add(i).saturate();
}), be = /* @__PURE__ */ k({
  name: "getProfileDensity",
  type: q,
  inputs: [
    { name: "layer", type: te },
    { name: "altitude", type: H }
  ]
})(([n, t]) => t.lessThan(n.get("layer0").get("width")).select(
  Ps(n.get("layer0"), t),
  Ps(n.get("layer1"), t)
)), Dt = /* @__PURE__ */ k({
  name: "getUnitRangeFromTextureCoord",
  type: "float",
  inputs: [
    { name: "coord", type: "float" },
    { name: "textureSize", type: "float" }
  ]
})(([n, t]) => {
  const e = t.reciprocal();
  return n.sub(e.mul(0.5)).div(e.oneMinus());
}), Le = /* @__PURE__ */ ut(
  {
    radius: H,
    cosView: q,
    cosLight: q,
    cosViewLight: q,
    intersectsGround: "bool"
  },
  "ScatteringParams"
), Bo = /* @__PURE__ */ k({
  // BUG: Cannot access vector component inside struct in layout function
  // https://github.com/mrdoob/three.js/issues/33345
  typeOnly: !0,
  name: "getParamsFromScatteringTextureCoord",
  type: Le,
  inputs: [
    { name: "parameters", type: J },
    { name: "coord", type: "vec4" }
  ]
})(([n, t]) => {
  const {
    bottomRadius: e,
    topRadius: s,
    minCosLight: o,
    scatteringTextureRadiusSize: i,
    scatteringTextureCosViewSize: a,
    scatteringTextureCosLightSize: r
  } = j(n), u = _(s.pow2().sub(e.pow2())).toConst(), c = u.mul(
    Dt(t.w, i)
  ).toConst(), d = _(c.pow2().add(e.pow2())), l = P(0).toVar(), h = _t().toVar();
  D(t.z.lessThan(0.5), () => {
    const M = d.sub(e).toConst(), N = c, b = M.add(
      N.sub(M).mul(
        Dt(
          t.z.mul(2).oneMinus(),
          a.div(2)
        )
      )
    ).toConst();
    l.assign(
      b.equal(0).select(
        -1,
        Tt(
          c.pow2().add(b.pow2()).negate().div(pt(2, d, b))
        )
      )
    ), h.assign(_t(!0));
  }).Else(() => {
    const M = s.sub(d).toConst(), N = c.add(u), b = M.add(
      N.sub(M).mul(
        Dt(
          t.z.mul(2).sub(1),
          a.div(2)
        )
      )
    ).toConst();
    l.assign(
      b.equal(0).select(
        1,
        Tt(
          u.pow2().sub(c.pow2()).sub(b.pow2()).div(pt(2, d, b))
        )
      )
    ), h.assign(_t(!1));
  });
  const m = Dt(
    t.y,
    r
  ).toConst(), p = s.sub(e).toConst(), y = u, S = ee(
    n,
    e,
    o
  ).remap(p, y).toConst(), x = S.sub(m.mul(S)).div(m.mul(S).add(1)), T = p.add(Rt(x, S).mul(y.sub(p))).toConst(), C = T.equal(0).select(
    1,
    Tt(
      u.pow2().sub(T.pow2()).div(pt(2, e, T))
    )
  ), f = Tt(t.x.mul(2).sub(1));
  return Le(
    d,
    l,
    C,
    f,
    h
  );
}), Oo = /* @__PURE__ */ k({
  // BUG: Cannot access vector component inside struct in layout function
  // https://github.com/mrdoob/three.js/issues/33345
  typeOnly: !0,
  name: "getParamsFromScatteringTextureFragCoord",
  type: Le,
  inputs: [
    { name: "parameters", type: J },
    { name: "fragCoord", type: "vec3" }
  ]
})(([n, t]) => {
  const {
    scatteringTextureRadiusSize: e,
    scatteringTextureCosViewSize: s,
    scatteringTextureCosLightSize: o,
    scatteringTextureCosViewLightSize: i
  } = j(n), a = de(
    t.x.div(o)
  ), r = t.x.mod(o), u = w(
    i.sub(1),
    o,
    s,
    e
  ), c = w(
    a,
    r,
    t.y,
    t.z
  ).div(u), d = Bo(
    n,
    c
  ).toConst(), l = d.get("radius"), h = d.get("cosView"), m = d.get("cosLight"), p = d.get("cosViewLight").toVar(), y = d.get("intersectsGround"), g = _(
    h.pow2().oneMinus().mul(m.pow2().oneMinus())
  ).toConst();
  return p.assign(
    cs(
      p,
      h.mul(m).sub(g),
      h.mul(m).add(g)
    )
  ), Le(
    l,
    h,
    m,
    p,
    y
  );
}), dn = /* @__PURE__ */ k({
  name: "getExtrapolatedSingleMieScattering",
  type: Pt,
  inputs: [
    { name: "scattering", type: "vec4" },
    { name: "rayleighScattering", type: "vec3" },
    { name: "mieScattering", type: "vec3" }
  ]
})(([n, t, e]) => {
  const s = E(0).toVar();
  return D(n.r.greaterThanEqual(1e-5), () => {
    s.assign(
      n.rgb.mul(n.a).div(n.r).mul(t.r.div(e.r)).mul(e.div(t))
    );
  }), s;
}), Wo = /* @__PURE__ */ ut(
  {
    scattering: Pt,
    singleMieScattering: Pt
  },
  "CombinedScattering"
), Zt = /* @__PURE__ */ W(
  (n, t, e, s, o, i, a, r) => (u) => {
    const c = Nt(u), {
      rayleighScattering: d,
      mieScattering: l,
      scatteringTextureCosViewLightSize: h
    } = j(n), m = un(
      n,
      s,
      o,
      i,
      a,
      r
    ).toConst(), p = m.x.mul(h.sub(1)).toConst(), y = de(p).toConst(), g = p.sub(y).toConst(), S = E(
      y.add(m.y).div(h),
      m.z,
      m.w
    ).toConst(), x = E(
      y.add(1).add(m.y).div(h),
      m.z,
      m.w
    ).toConst(), T = E(0).toVar(), C = E(0).toVar();
    if (c.parameters.combinedScatteringTextures) {
      const f = Ct(
        t.sample(S).mul(g.oneMinus()),
        t.sample(x).mul(g)
      ).toConst();
      T.assign(f.rgb), C.assign(
        dn(
          f,
          d,
          l
        )
      );
    } else
      T.assign(
        Ct(
          t.sample(S).mul(g.oneMinus()),
          t.sample(x).mul(g)
        ).rgb
      ), C.assign(
        Ct(
          e.sample(S).mul(g.oneMinus()),
          e.sample(x).mul(g)
        ).rgb
      );
    return Wo(T, C);
  }
), xe = /* @__PURE__ */ ut(
  {
    radiance: sn,
    transmittance: qt
  },
  "RadianceTransfer"
), ko = /* @__PURE__ */ k({
  name: "getSubUVFromTextureUnit",
  type: "vec2",
  inputs: [
    { name: "unit", type: "vec2" },
    { name: "textureSize", type: "vec2" }
  ]
})(([n, t]) => n.add(P(0.5).div(t)).mul(t.div(t.add(1)))), ln = /* @__PURE__ */ k({
  name: "getTextureUnitFromSubUV",
  type: "vec2",
  inputs: [
    { name: "subUV", type: "vec2" },
    { name: "textureSize", type: "vec2" }
  ]
})(([n, t]) => n.sub(P(0.5).div(t)).mul(t.div(t.sub(1)))), Bs = /* @__PURE__ */ ut(
  {
    rayleighScattering: At,
    mieScattering: At,
    scattering: At,
    extinction: At
  },
  "AtmosphereMedium"
), ys = /* @__PURE__ */ k({
  name: "sampleAtmosphereMedium",
  type: Bs,
  inputs: [
    { name: "parameters", type: J },
    { name: "altitude", type: H }
  ]
})(([n, t]) => {
  const e = j(n), s = be(e.rayleighDensity, t), o = be(e.mieDensity, t), i = be(e.absorptionDensity, t), a = s.mul(e.rayleighScattering), r = a, u = o.mul(e.mieScattering), c = o.mul(e.mieExtinction), d = i.mul(e.absorptionExtinction), l = Ct(a, u), h = Ct(r, c, d);
  return Bs(
    a,
    u,
    l,
    h
  );
}), Go = /* @__PURE__ */ ut(
  {
    multipleScattering: sn,
    transferFactor: qt
  },
  "MultipleScattering"
), mn = /* @__PURE__ */ W(
  (n, t, e, s, o, i) => {
    const { solarIrradiance: a, bottomRadius: r, groundAlbedo: u } = j(n), c = xs(
      n,
      e,
      s
    ).toConst(), d = cn(
      n,
      e,
      s,
      c
    ).toConst(), l = E(0).toVar(), h = E(0).toVar(), m = E(1).toVar(), p = P(0).toVar(), y = 20;
    return wt({ type: "float", start: 0, end: y }, ({ i: g }) => {
      const S = d.mul(g.add(0.3)).div(y).toConst(), x = S.sub(p).toConst();
      p.assign(S);
      const T = pe(
        n,
        _(
          S.pow2().add(pt(2, e, s, S)).add(e.pow2())
        )
      ).toConst(), C = Tt(
        e.mul(o).add(S.mul(i)).div(T)
      ).toConst(), f = T.sub(r), M = ys(n, f).toConst(), N = M.get("scattering"), b = M.get("extinction"), A = b.mul(x).toConst(), z = he(A.negate()).toConst(), L = $t(
        t,
        T,
        C
      ).toConst(), R = N.sub(N.mul(z)).div(b).toConst();
      h.addAssign(m.mul(R));
      const V = L.mul(N.mul(1 / (4 * Math.PI))).toConst(), I = V.sub(V.mul(z)).div(b).toConst();
      l.addAssign(
        m.mul(I)
      ), m.mulAssign(z);
    }), D(c, () => {
      const g = Tt(
        e.mul(o).add(d.mul(i)).div(r)
      ).toConst(), S = $t(
        t,
        r,
        g
      ).toConst();
      l.addAssign(
        a.mul(
          S,
          m,
          g.saturate(),
          u,
          1 / Math.PI
        )
      );
    }), Go(
      l,
      h
    );
  }
), hn = /* @__PURE__ */ W(
  (n, t, e, s) => {
    const { topRadius: o, bottomRadius: i, multipleScatteringTextureSize: a } = j(n), r = ko(
      U(
        s.mul(0.5).add(0.5),
        e.sub(i).div(o.sub(i))
      ).saturate(),
      a
    );
    return t.sample(r).rgb;
  }
), qo = /* @__PURE__ */ ut(
  {
    scattering: Pt,
    singleMieScattering: Pt,
    higherOrderScattering: Do
  },
  "Scattering"
), pn = /* @__PURE__ */ W(
  (n, t, e) => (s) => {
    const o = Nt(s), { parametersNode: i } = o, { solarIrradiance: a, bottomRadius: r } = i, u = Oo(
      i,
      e
    ).toConst(), c = u.get("radius"), d = u.get("cosView"), l = u.get("cosLight"), h = u.get("cosViewLight"), m = u.get("intersectsGround"), p = cn(
      i,
      c,
      d,
      m
    ).toConst(), S = ct(
      14,
      30,
      p.mul(1 / 100)
    ).toConst(), x = S.floor().toConst(), T = x.reciprocal().toConst(), C = p.mul(x).div(S).toConst(), f = ge(h).toConst(), M = E(0).toVar(), N = E(0).toVar(), b = E(0).toVar(), A = E(1).toVar();
    return wt({ type: "float", start: 0, end: S }, ({ i: z }) => {
      const L = z.mul(T).toVar(), R = z.add(1).mul(T).toVar();
      L.mulAssign(L), R.mulAssign(R), L.mulAssign(C), R.assign(
        R.greaterThan(1).select(p, C.mul(R))
      );
      const V = R.sub(L), I = L.add(V.mul(0.3)), F = pe(
        i,
        _(
          I.pow2().add(pt(2, c, d, I)).add(c.pow2())
        )
      ).toConst(), v = Tt(
        c.mul(l).add(I.mul(h)).div(F)
      ).toConst(), Z = F.sub(r), B = ys(
        i,
        Z
      ).toConst(), G = B.get("rayleighScattering"), $ = B.get("mieScattering"), dt = B.get("scattering"), tt = B.get("extinction"), xt = tt.mul(V), it = he(xt.negate()).toConst(), bt = $t(
        n,
        F,
        v
      ).toConst(), lt = hn(
        i,
        t,
        F,
        v
      ).mul(dt).toConst();
      let et = bt.mul(G);
      o.parameters.higherOrderScatteringTexture || (et = et.add(lt.div(f))), et = a.mul(et).toConst();
      const mt = et.sub(et.mul(it)).div(tt).toConst();
      M.addAssign(A.mul(mt));
      const St = a.mul(bt.mul($)).toConst(), Se = St.sub(St.mul(it)).div(tt).toConst();
      N.addAssign(A.mul(Se));
      const yt = a.mul(lt), ht = yt.sub(yt.mul(it)).div(tt).toConst();
      b.addAssign(A.mul(ht)), A.mulAssign(it);
    }), qo(M, N, b);
  }
), Zo = /* @__PURE__ */ W(
  (n, t, e, s, o, i, a) => {
    const { lutNode: r, parametersNode: u, scatteringSampleCount: c } = n, d = r.getTextureNode("transmittance"), l = r.getTextureNode("multipleScattering"), { solarIrradiance: h, bottomRadius: m, miePhaseFunctionG: p } = u, y = ct(
      c.x,
      c.y,
      i.mul(1 / 100)
    ).toConst(), g = y.floor().toConst(), S = g.reciprocal().toConst(), x = i.mul(g).div(y).toConst(), T = Ue(p, o).toConst(), C = ge(o).toConst(), f = U(
      a.y,
      a.y.add(a.x)
    ).toConst(), M = E(0).toVar(), N = E(1).toVar();
    return wt({ type: "float", start: 0, end: y }, ({ i: b }) => {
      const A = b.mul(S).toVar(), z = b.add(1).mul(S).toVar();
      A.mulAssign(A), z.mulAssign(z), A.mulAssign(x), z.assign(z.greaterThan(1).select(i, x.mul(z)));
      const L = z.sub(A), R = A.add(L.mul(No)), V = pe(
        u,
        _(
          R.pow2().add(pt(2, t, e, R)).add(t.pow2())
        )
      ).toConst(), I = Tt(
        t.mul(s).add(R.mul(o)).div(V)
      ).toConst(), F = V.sub(m), v = ys(u, F).toConst(), Z = v.get("rayleighScattering"), B = v.get("mieScattering"), G = v.get("scattering"), $ = v.get("extinction"), dt = $.mul(L), tt = he(dt.negate()).toConst(), xt = $t(
        d,
        V,
        I
      ).toConst(), it = hn(
        u,
        l,
        V,
        I
      ).mul(G).toConst(), bt = Un(
        U(R, f.y),
        U(f.x, R)
      ).toConst(), lt = bt.x.add(bt.y).min(1).toConst(), et = Ct(
        Z.mul(C),
        B.mul(T)
      );
      let mt;
      n.parameters.higherOrderScatteringTexture ? mt = h.mul(
        xt.mul(et).mul(lt).add(it)
      ).toConst() : mt = h.mul(
        xt.mul(et).add(it).mul(lt)
      ).toConst();
      const St = mt.sub(mt.mul(tt)).div($).toConst();
      M.addAssign(N.mul(St)), N.mulAssign(tt);
    }), xe(M, N);
  }
), Ze = /* @__PURE__ */ k({
  name: "computeOpticalDepthToTopAtmosphereBoundary",
  type: H,
  inputs: [
    { name: "parameters", type: J },
    { name: "profile", type: te },
    { name: "radius", type: H },
    { name: "cosView", type: q }
  ]
})(([n, t, e, s]) => {
  const { bottomRadius: o } = j(n), i = 500, a = ee(n, e, s).div(i).toConst(), r = P(0).toVar();
  return wt({ start: 0, end: i, condition: "<=" }, ({ i: u }) => {
    const c = P(u).mul(a).toConst(), d = _(
      Ct(c.pow2(), pt(2, e, s, c), e.pow2())
    ).toConst(), l = be(t, d.sub(o)), h = U(u).equal(U(0, i)).any().select(0.5, 1);
    r.addAssign(l.mul(h).mul(a));
  }), r;
}), $o = /* @__PURE__ */ k({
  name: "computeTransmittanceToTopAtmosphereBoundary",
  type: qt,
  inputs: [
    { name: "parameters", type: J },
    { name: "radius", type: H },
    { name: "cosView", type: q }
  ]
})(([n, t, e]) => {
  const {
    rayleighDensity: s,
    rayleighScattering: o,
    mieDensity: i,
    mieExtinction: a,
    absorptionDensity: r,
    absorptionExtinction: u
  } = j(n), c = Ze(
    n,
    s,
    t,
    e
  ), d = Ze(
    n,
    i,
    t,
    e
  ), l = Ze(
    n,
    r,
    t,
    e
  ), h = Ct(
    o.mul(c),
    a.mul(d),
    u.mul(l)
  ).toConst();
  return he(h.negate());
}), Ho = /* @__PURE__ */ k({
  // BUG: Cannot access vector component inside struct in layout function
  // https://github.com/mrdoob/three.js/issues/33345
  typeOnly: !0,
  name: "getParamsFromTransmittanceTextureUV",
  type: "vec2",
  inputs: [
    { name: "parameters", type: J },
    { name: "uv", type: "vec2" }
  ]
})(([n, t]) => {
  const { topRadius: e, bottomRadius: s, transmittanceTextureSize: o } = j(n), i = Dt(
    t.x,
    o.x
  ), a = Dt(
    t.y,
    o.y
  ), r = _(e.pow2().sub(s.pow2())).toConst(), u = r.mul(a).toConst(), c = _(u.pow2().add(s.pow2())), d = e.sub(c).toConst(), l = u.add(r), h = d.add(i.mul(l.sub(d))).toConst(), m = h.equal(0).select(
    1,
    r.pow2().sub(u.pow2()).sub(h.pow2()).div(pt(2, c, h))
  );
  return U(c, m);
}), gn = /* @__PURE__ */ W(
  (n) => (t) => {
    const e = Nt(t), { parametersNode: s } = e, { transmittanceTextureSize: o } = s, i = Ho(
      s,
      n.div(o)
    ).toConst(), a = i.x, r = i.y;
    return $o(
      s,
      a,
      r
    );
  }
), Xo = /* @__PURE__ */ k({
  // BUG: Cannot access vector component inside struct in layout function
  // https://github.com/mrdoob/three.js/issues/33345
  typeOnly: !0,
  name: "getParamsFromIrradianceTextureUV",
  type: "vec2",
  inputs: [
    { name: "parameters", type: J },
    { name: "uv", type: "vec2" }
  ]
})(([n, t]) => {
  const { topRadius: e, bottomRadius: s, irradianceTextureSize: o } = j(n), i = Dt(
    t.x,
    o.x
  ), a = Dt(t.y, o.y), r = s.add(a.mul(e.sub(s))), u = Tt(i.mul(2).sub(1));
  return U(r, u);
}), xn = /* @__PURE__ */ W(
  (n, t, e) => (s) => {
    const o = Nt(s), { parametersNode: i } = o, { miePhaseFunctionG: a, irradianceTextureSize: r } = i, u = Xo(
      i,
      e.div(r)
    ).toConst(), c = u.x, d = u.y, l = 32, h = Math.PI / l, m = Math.PI / l, p = E(0).toVar(), y = E(
      _(d.pow2().oneMinus()),
      0,
      d
    ).toConst();
    return wt({ start: 0, end: l / 2, name: "j" }, ({ j: g }) => {
      const S = P(g).add(0.5).mul(m).toConst();
      wt({ start: 0, end: l * 2 }, ({ i: x }) => {
        const T = P(x).add(0.5).mul(h).toConst(), C = E(
          It(T).mul(Vt(S)),
          Vt(T).mul(Vt(S)),
          It(S)
        ).toConst(), f = Vt(S).mul(m * h), M = C.dot(y), N = Zt(
          i,
          n,
          n,
          c,
          C.z,
          d,
          M,
          _t(!1)
        );
        let b = E(0);
        o.parameters.higherOrderScatteringTexture && (b = ze(
          t,
          c,
          C.z,
          d,
          M,
          _t(!1)
        ));
        const A = N.get("scattering"), z = N.get(
          "singleMieScattering"
        ), L = ge(M), R = Ue(a, M);
        p.addAssign(
          A.mul(L).add(z.mul(R)).add(b).mul(C.z, f)
        );
      });
    }), p;
  }
);
function $e(n) {
  const t = new Ht(1, 1, {
    depthBuffer: !1,
    format: Bt
  }), e = t.texture;
  return e.minFilter = X, e.magFilter = X, e.colorSpace = De, e.generateMipmaps = !1, e.name = n, t;
}
function He(n) {
  const t = new Qn(1, 1, 1, {
    depthBuffer: !1,
    format: Bt
  }), e = t.texture;
  return e.minFilter = X, e.magFilter = X, e.colorSpace = De, e.generateMipmaps = !1, e.name = n, t;
}
function Xe(n, t, e) {
  n.texture.type = t, n.setSize(e.x, e.y);
}
function Ke(n, t, e) {
  n.texture.type = t, n.setSize(e.x, e.y, e.z), n.texture.isArrayTexture = !1;
}
class Ko extends on {
}
class Qo extends an {
  constructor() {
    super(), this.mesh = new Kt(), this.layer = O(0), this.mesh.name = "AtmosphereLUTTexturesWebGL", this.transmittanceRT = $e("transmittance"), this.multipleScatteringRT = $e("multipleScattering"), this.scatteringRT = He("scattering"), this.singleMieScatteringRT = He("singleMieScattering"), this.higherOrderScatteringRT = He("higherOrderScattering"), this.irradianceRT = $e("irradiance");
  }
  get(t) {
    return this[`${t}RT`].texture;
  }
  createContext() {
    return rt(this.parameters != null), rt(this.textureType != null), new Ko(
      this.parameters,
      this.textureType
    );
  }
  renderToRenderTarget(t, e, s) {
    s != null && e.textures.push(...s.filter((o) => o != null)), t.setRenderTarget(e), this.mesh.render(t), e.textures.length = 1;
  }
  renderToRenderTarget3D(t, e, s, o) {
    o != null && e.textures.push(...o.filter((i) => i != null));
    for (let i = 0; i < e.depth; ++i)
      s.value = i, t.setRenderTarget(e, i), this.mesh.render(t);
    e.textures.length = 1;
  }
  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  createMaterial(t) {
    const e = new vt();
    return e.fragmentNode = t, e.needsUpdate = !0, e;
  }
  computeTransmittance(t, e) {
    this.transmittanceMaterial?.dispose(), this.transmittanceMaterial = this.createMaterial(
      // BUG: Context is not merged unless we wrap the node by OutputStructNode.
      we({
        transmittance: gn(at).context({
          getAtmosphere: () => e
        })
      })
    ), this.mesh.material = this.transmittanceMaterial, this.renderToRenderTarget(t, this.transmittanceRT);
  }
  computeMultipleScattering(t, e) {
    const { parameters: s, parametersNode: o } = e, i = 64, a = W((u) => {
      const c = P(u), d = c.mul(2 * Math.PI / ((1 + Math.sqrt(5)) / 2)), l = qs(
        c.add(0.5).mul(2 / i).oneMinus()
      ), h = It(l), m = Vt(l), p = It(d), y = Vt(d);
      return E(p.mul(m), y.mul(m), h);
    }), r = Y(() => {
      const u = U(s.multipleScatteringTextureSize), c = ln(
        at.div(u),
        u
      ).toConst(), { topRadius: d, bottomRadius: l } = o, h = c.x.mul(2).sub(1).toConst(), m = E(
        0,
        _(h.pow2().oneMinus().saturate()),
        h
      ).toConst(), p = 0, y = l.add(
        c.y.add(p).saturate().mul(d.sub(l).sub(p))
      ).toConst(), g = E(0).toVar(), S = E(0).toVar();
      return wt({ start: 0, end: i }, ({ i: x }) => {
        const T = a(x).toConst(), C = T.z, f = T.dot(m).toConst(), M = mn(
          o,
          Gt(this.transmittanceRT.texture),
          y,
          C,
          h,
          f
        ).context({ getAtmosphere: () => e }).toConst();
        g.addAssign(
          M.get("multipleScattering").div(i)
        ), S.addAssign(
          M.get("transferFactor").div(i)
        );
      }), g.mul(
        S.oneMinus().reciprocal()
      );
    });
    this.multipleScatteringMaterial?.dispose(), this.multipleScatteringMaterial = this.createMaterial(
      // BUG: Context is not merged unless we wrap the node by
      // OutputStructNode.
      we({
        multipleScattering: w(r(), 1)
      })
    ), this.mesh.material = this.multipleScatteringMaterial, this.renderToRenderTarget(t, this.multipleScatteringRT);
  }
  computeScattering(t, e) {
    const { parameters: s } = e;
    this.scatteringMaterial?.dispose(), this.scatteringMaterial = this.createMaterial(
      (() => {
        const i = pn(
          Gt(this.transmittanceRT.texture),
          Gt(this.multipleScatteringRT.texture),
          E(at, this.layer.add(0.5))
        ).context({ getAtmosphere: () => e }).toConst(), a = i.get("scattering"), r = i.get("singleMieScattering"), u = i.get("higherOrderScattering"), c = {};
        return s.combinedScatteringTextures ? c.scattering = w(a, r.r) : (c.scattering = w(a, r.r), c.singleMieScattering = w(r, 1)), s.higherOrderScatteringTexture && (c.higherOrderScattering = w(u, 1)), we(c);
      })()
    ), this.mesh.material = this.scatteringMaterial;
    const o = [];
    s.combinedScatteringTextures || o.push(this.singleMieScatteringRT.texture), s.higherOrderScatteringTexture && o.push(this.higherOrderScatteringRT.texture), this.renderToRenderTarget3D(
      t,
      this.scatteringRT,
      this.layer,
      o
    );
  }
  computeIrradiance(t, e) {
    this.irradianceMaterial?.dispose(), this.irradianceMaterial = this.createMaterial(
      // BUG: Context is not merged unless we wrap the node by OutputStructNode.
      we({
        irradiance: xn(
          Ee(this.scatteringRT.texture),
          Ee(this.higherOrderScatteringRT.texture),
          at
        ).context({ getAtmosphere: () => e })
      })
    ), this.mesh.material = this.irradianceMaterial, this.renderToRenderTarget(t, this.irradianceRT);
  }
  setup(t, e) {
    Xe(
      this.transmittanceRT,
      e,
      t.transmittanceTextureSize
    ), Xe(
      this.multipleScatteringRT,
      e,
      t.multipleScatteringTextureSize
    ), Ke(
      this.scatteringRT,
      e,
      t.scatteringTextureSize
    ), t.combinedScatteringTextures || Ke(
      this.singleMieScatteringRT,
      e,
      t.scatteringTextureSize
    ), t.higherOrderScatteringTexture && Ke(
      this.higherOrderScatteringRT,
      e,
      t.scatteringTextureSize
    ), Xe(
      this.irradianceRT,
      e,
      t.irradianceTextureSize
    ), super.setup(t, e);
  }
  dispose() {
    this.transmittanceRT.dispose(), this.multipleScatteringRT.dispose(), this.scatteringRT.dispose(), this.irradianceRT.dispose(), this.transmittanceMaterial?.dispose(), this.multipleScatteringMaterial?.dispose(), this.scatteringMaterial?.dispose(), this.irradianceMaterial?.dispose(), this.mesh.geometry.dispose(), super.dispose();
  }
}
function Qe(n) {
  const t = new To(1, 1);
  return t.minFilter = X, t.magFilter = X, t.colorSpace = De, t.generateMipmaps = !1, t.name = n, t;
}
function Ye(n) {
  const t = new Co(1, 1, 1);
  return t.minFilter = X, t.magFilter = X, t.colorSpace = De, t.generateMipmaps = !1, t.name = n, t;
}
function _e(n, t, e) {
  n.type = t, hs(n.image), n.image.width = e.x, n.image.height = e.y;
}
function je(n, t, e) {
  n.type = t, hs(n.image), n.image.width = e.x, n.image.height = e.y, n.image.depth = e.z;
}
class Yo extends on {
}
class _o extends an {
  constructor() {
    super(), this.transmittance = Qe("transmittance"), this.multipleScattering = Qe("multipleScattering"), this.scattering = Ye("scattering"), this.singleMieScattering = Ye("singleMieScattering"), this.higherOrderScattering = Ye("higherOrderScattering"), this.irradiance = Qe("irradiance");
  }
  get(t) {
    return this[t];
  }
  createContext() {
    return rt(this.parameters != null), rt(this.textureType != null), new Yo(
      this.parameters,
      this.textureType
    );
  }
  computeTransmittance(t, e) {
    const { parameters: s } = e, { x: o, y: i } = s.transmittanceTextureSize;
    this.transmittanceNode?.dispose(), this.transmittanceNode = Y(() => {
      const a = Mt(o, i);
      D(st.xy.greaterThanEqual(a).any(), () => {
        fe();
      });
      const r = gn(
        U(st.xy).add(0.5)
      );
      kt(this.transmittance, st.xy, r);
    })().context({ getAtmosphere: () => e }).computeKernel([8, 8, 1]).setName("transmittance"), t.compute(this.transmittanceNode, [
      Math.ceil(o / 8),
      Math.ceil(i / 8),
      1
    ]);
  }
  computeMultipleScattering(t, e) {
    const { parameters: s, parametersNode: o } = e, { x: i, y: a } = s.multipleScatteringTextureSize, r = 64, u = W((c) => {
      const d = P(c), l = d.mul(2 * Math.PI / ((1 + Math.sqrt(5)) / 2)), h = qs(
        d.add(0.5).mul(2 / r).oneMinus()
      ), m = It(h), p = Vt(h), y = It(l), g = Vt(l);
      return E(y.mul(p), g.mul(p), m);
    });
    this.multipleScatteringNode?.dispose(), this.multipleScatteringNode = Y(() => {
      const c = fs("vec3", r), d = fs("vec3", r), l = U(i, a).toConst(), h = U(st.xy).add(0.5), m = ln(h.div(l), l).toConst(), p = st.z, { topRadius: y, bottomRadius: g } = o, S = m.x.mul(2).sub(1).toConst(), x = E(
        0,
        _(S.pow2().oneMinus().saturate()),
        S
      ).toConst(), T = 0, C = g.add(
        m.y.add(T).saturate().mul(y.sub(g).sub(T))
      ).toConst(), f = u(p).toConst(), M = f.z, N = f.dot(x).toConst(), b = mn(
        o,
        Gt(this.transmittance),
        C,
        M,
        S,
        N
      ).toConst();
      c.element(p).assign(b.get("multipleScattering").div(r)), d.element(p).assign(b.get("transferFactor").div(r)), vs();
      for (let L = r >> 1; L > 0; L >>>= 1) {
        const R = Q(L);
        D(p.lessThan(R), () => {
          c.element(p).addAssign(c.element(p.add(R))), d.element(p).addAssign(d.element(p.add(R)));
        }), vs();
      }
      D(p.greaterThan(0), () => {
        fe();
      });
      const A = c.element(Q(0)), z = d.element(Q(0));
      kt(
        this.multipleScattering,
        st.xy,
        // This represents the amount of radiance scattered as if the integral
        // of scattered radiance over the sphere would be 1.
        // For a power-series, such integral is analytically:
        // sum_{n=0}^{n=+inf} = 1 + r + r^2 + r^3 + ... + r^n = 1 / (1 - r)
        w(A.mul(z.oneMinus().reciprocal()), 1)
      );
    })().context({ getAtmosphere: () => e }).computeKernel([1, 1, r]).setName("multipleScattering"), t.compute(this.multipleScatteringNode, [i, a, 1]);
  }
  computeScattering(t, e) {
    const { parameters: s } = e, { x: o, y: i, z: a } = s.scatteringTextureSize;
    this.scatteringNode?.dispose(), this.scatteringNode = Y(() => {
      const r = In(o, i, a);
      D(st.greaterThanEqual(r).any(), () => {
        fe();
      });
      const u = pn(
        Gt(this.transmittance),
        Gt(this.multipleScattering),
        E(st).add(0.5)
      ).toConst(), c = u.get("scattering"), d = u.get("singleMieScattering");
      if (s.combinedScatteringTextures ? kt(
        this.scattering,
        st,
        w(c, d.r)
      ) : (kt(this.scattering, st, w(c, 1)), kt(
        this.singleMieScattering,
        st,
        w(d, 1)
      )), s.higherOrderScatteringTexture) {
        const l = u.get("higherOrderScattering");
        kt(
          this.higherOrderScattering,
          st,
          w(l, 1)
        );
      }
    })().context({ getAtmosphere: () => e }).computeKernel([4, 4, 4]).setName("scattering"), t.compute(this.scatteringNode, [
      Math.ceil(o / 4),
      Math.ceil(i / 4),
      Math.ceil(a / 4)
    ]);
  }
  computeIrradiance(t, e) {
    const { parameters: s } = e, { x: o, y: i } = s.irradianceTextureSize;
    this.irradianceNode?.dispose(), this.irradianceNode = Y(() => {
      const a = Mt(o, i);
      D(st.xy.greaterThanEqual(a).any(), () => {
        fe();
      });
      const r = xn(
        Ee(this.scattering),
        Ee(this.higherOrderScattering),
        U(st.xy).add(0.5)
      );
      kt(this.irradiance, st.xy, r);
    })().context({ getAtmosphere: () => e }).computeKernel([8, 8, 1]).setName("irradiance"), t.compute(this.irradianceNode, [
      Math.ceil(o / 8),
      Math.ceil(i / 8),
      1
    ]);
  }
  setup(t, e) {
    _e(
      this.transmittance,
      e,
      t.transmittanceTextureSize
    ), _e(
      this.multipleScattering,
      e,
      t.multipleScatteringTextureSize
    ), je(
      this.scattering,
      e,
      t.scatteringTextureSize
    ), t.combinedScatteringTextures || je(
      this.singleMieScattering,
      e,
      t.scatteringTextureSize
    ), t.higherOrderScatteringTexture && je(
      this.higherOrderScattering,
      e,
      t.scatteringTextureSize
    ), _e(
      this.irradiance,
      e,
      t.irradianceTextureSize
    ), super.setup(t, e);
  }
  dispose() {
    this.transmittance.dispose(), this.multipleScattering.dispose(), this.scattering.dispose(), this.singleMieScattering.dispose(), this.higherOrderScattering.dispose(), this.irradiance.dispose(), this.transmittanceNode?.dispose(), this.multipleScatteringNode?.dispose(), this.scatteringNode?.dispose(), this.irradianceNode?.dispose(), super.dispose();
  }
}
class Lt {
  constructor(t = 0, e = 0, s = 0, o = 0, i = 0) {
    this.width = t, this.expTerm = e, this.expScale = s, this.linearTerm = o, this.constantTerm = i;
  }
  copy(t) {
    return this.width = t.width, this.expTerm = t.expTerm, this.expScale = t.expScale, this.linearTerm = t.linearTerm, this.constantTerm = t.constantTerm, this;
  }
  clone() {
    return new Lt().copy(this);
  }
}
class ce {
  constructor(t) {
    this.layers = t;
  }
  copy(t) {
    return this.layers = [t.layers[0].clone(), t.layers[1].clone()], this;
  }
  clone() {
    return new ce([this.layers[0].clone(), this.layers[1].clone()]);
  }
}
const jo = /* @__PURE__ */ new nt(0.2126, 0.7152, 0.0722);
class Ie {
  constructor() {
    this.worldToUnit = 1e-3, this.solarIrradiance = new nt(1.474, 1.8504, 1.91198), this.sunAngularRadius = 4675e-6, this.bottomRadius = 636e4, this.topRadius = 642e4, this.rayleighDensity = new ce([
      new Lt(),
      new Lt(0, 1, -1 / 8e3)
    ]), this.rayleighScattering = new nt(5802e-9, 13558e-9, 331e-7), this.mieDensity = new ce([
      new Lt(),
      new Lt(0, 1, -1 / 1200)
    ]), this.mieScattering = new nt().setScalar(3996e-9), this.mieExtinction = new nt().setScalar(444e-8), this.miePhaseFunctionG = 0.8, this.absorptionDensity = new ce([
      new Lt(25e3, 0, 0, 1 / 15e3, -2 / 3),
      new Lt(0, 0, 0, -1 / 15e3, 8 / 3)
    ]), this.absorptionExtinction = new nt(65e-8, 1881e-9, 85e-9), this.groundAlbedo = new nt().setScalar(0.3), this.minCosLight = Math.cos(Ys(120)), this.sunRadianceToLuminance = new nt(98242.786222, 69954.398112, 66475.012354), this.skyRadianceToLuminance = new nt(114974.91644, 71305.954816, 65310.548555), this.luminanceScale = 1 / jo.dot(this.sunRadianceToLuminance), this.combinedScatteringTextures = !0, this.higherOrderScatteringTexture = !0, this.transmittanceTextureSize = new zt(256, 64), this.irradianceTextureSize = new zt(64, 16), this.multipleScatteringTextureSize = new zt(64, 64), this.scatteringTextureRadiusSize = 32, this.scatteringTextureCosViewSize = 128, this.scatteringTextureCosLightSize = 32, this.scatteringTextureCosViewLightSize = 8, this.scatteringTextureSize = new nt(), this.update();
  }
  copy(t) {
    return this.worldToUnit = t.worldToUnit, this.solarIrradiance.copy(t.solarIrradiance), this.sunAngularRadius = t.sunAngularRadius, this.bottomRadius = t.bottomRadius, this.topRadius = t.topRadius, this.rayleighDensity.copy(t.rayleighDensity), this.rayleighScattering.copy(t.rayleighScattering), this.mieDensity.copy(t.mieDensity), this.mieScattering.copy(t.mieScattering), this.mieExtinction.copy(t.mieExtinction), this.miePhaseFunctionG = t.miePhaseFunctionG, this.absorptionDensity.copy(t.absorptionDensity), this.absorptionExtinction.copy(t.absorptionExtinction), this.groundAlbedo.copy(t.groundAlbedo), this.minCosLight = t.minCosLight, this.sunRadianceToLuminance.copy(t.sunRadianceToLuminance), this.skyRadianceToLuminance.copy(t.skyRadianceToLuminance), this.luminanceScale = t.luminanceScale, this.combinedScatteringTextures = t.combinedScatteringTextures, this.transmittanceTextureSize.copy(t.transmittanceTextureSize), this.irradianceTextureSize.copy(t.irradianceTextureSize), this.multipleScatteringTextureSize.copy(t.multipleScatteringTextureSize), this.scatteringTextureRadiusSize = t.scatteringTextureRadiusSize, this.scatteringTextureCosViewSize = t.scatteringTextureCosViewSize, this.scatteringTextureCosLightSize = t.scatteringTextureCosLightSize, this.scatteringTextureCosViewLightSize = t.scatteringTextureCosViewLightSize, this.scatteringTextureSize.copy(t.scatteringTextureSize), this;
  }
  update() {
    return this.scatteringTextureSize.set(
      this.scatteringTextureCosViewLightSize * this.scatteringTextureCosLightSize,
      this.scatteringTextureCosViewSize,
      this.scatteringTextureRadiusSize
    ), this;
  }
  clone() {
    return new Ie().copy(this);
  }
  /** @deprecated Use minCosLight */
  get minCosSun() {
    return this.minCosLight;
  }
  /** @deprecated Use minCosLight */
  set minCosSun(t) {
    this.minCosLight = t;
  }
  /** @deprecated Use scatteringTextureCosLightSize */
  get scatteringTextureCosSunSize() {
    return this.scatteringTextureCosLightSize;
  }
  /** @deprecated Use scatteringTextureCosLightSize */
  set scatteringTextureCosSunSize(t) {
    this.scatteringTextureCosLightSize = t;
  }
  /** @deprecated Use scatteringTextureCosViewLightSize */
  get scatteringTextureCosViewSunSize() {
    return this.scatteringTextureCosViewLightSize;
  }
  /** @deprecated Use scatteringTextureCosViewLightSize */
  set scatteringTextureCosViewSunSize(t) {
    this.scatteringTextureCosViewLightSize = t;
  }
  /** @deprecated This option was removed. */
  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  get transmittancePrecisionLog() {
    return !1;
  }
  /** @deprecated This option was removed. */
  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  set transmittancePrecisionLog(t) {
  }
}
const { resetRendererState: Jo, restoreRendererState: ti } = Ot;
async function ei(n) {
  const t = n[Symbol.iterator]();
  return await new Promise((e, s) => {
    const o = () => {
      try {
        const { value: i, done: a } = t.next();
        a === !0 ? e(i) : Vs(o);
      } catch (i) {
        s(i instanceof Error ? i : new Error());
      }
    };
    Vs(o);
  });
}
let Je;
function ve(n, t) {
  return Je = Jo(n, Je), n.setClearColor(0, 0), n.autoClear = !1, t(), ti(n, Je), !0;
}
const ts = /* @__PURE__ */ new Yn(), es = /* @__PURE__ */ (() => {
  const n = new _n(new Uint8Array(4));
  return n.format = Bt, n.needsUpdate = !0, n;
})(), si = { type: "update" };
class ni extends wo {
  constructor(t = new Ie(), e) {
    super(null), this.textureNodes = {
      transmittance: ft(this, ts),
      multipleScattering: ft(this, ts),
      scattering: Ge(this, es),
      singleMieScattering: Ge(this, es),
      higherOrderScattering: Ge(this, es),
      irradiance: ft(this, ts)
    }, this.updating = !1, this.updateBeforeType = gt.FRAME, this.parameters = t, this.textureType = e;
  }
  static get type() {
    return "AtmosphereLUTNode";
  }
  getTextureNode(t) {
    return this.textureNodes[t];
  }
  dispatchUpdate() {
    this.dispatchEvent(
      // @ts-expect-error Cannot specify the events map
      si
    );
  }
  *performCompute(t, e) {
    const { textures: s } = this;
    rt(s != null), yield ve(t, () => {
      s.computeTransmittance(t, e), this.dispatchUpdate();
    }), yield ve(t, () => {
      s.computeMultipleScattering(t, e), this.dispatchUpdate();
    }), yield ve(t, () => {
      s.computeScattering(t, e), this.dispatchUpdate();
    }), yield ve(t, () => {
      s.computeIrradiance(t, e), this.dispatchUpdate();
    });
  }
  async updateTextures(t) {
    rt(this.textures != null);
    const e = this.textures.createContext();
    this.updating = !0;
    try {
      await ei(this.performCompute(t, e));
    } finally {
      this.updating = !1, e.dispose(), this.disposeQueue?.();
    }
  }
  updateBefore({ renderer: t }) {
    t == null || this.version === this.currentVersion || (this.currentVersion = this.version, this.updateTextures(t).catch((e) => {
      throw e instanceof Error ? e : new Error();
    }));
  }
  setup(t) {
    if (this.textures == null) {
      this.textures = bo(t) ? new _o() : new Qo();
      const {
        transmittance: s,
        irradiance: o,
        multipleScattering: i,
        scattering: a,
        singleMieScattering: r,
        higherOrderScattering: u
      } = this.textureNodes;
      s.value = this.textures.get("transmittance"), i.value = this.textures.get("multipleScattering"), a.value = this.textures.get("scattering"), r.value = this.textures.get("singleMieScattering"), u.value = this.textures.get("higherOrderScattering"), o.value = this.textures.get("irradiance");
    }
    const e = lo(t.renderer) ? this.textureType ?? ls : Xt;
    return this.parameters.update(), this.textures.setup(this.parameters, e), super.setup(t);
  }
  dispose() {
    if (this.updating) {
      this.disposeQueue = () => {
        this.dispose(), this.disposeQueue = void 0;
      };
      return;
    }
    this.textures?.dispose(), this.textures = void 0, super.dispose();
  }
}
const oi = /* @__PURE__ */ new nt(), ii = /* @__PURE__ */ new mo();
class Sn extends gs {
  constructor(t = new Ie(), e = new ni(t)) {
    super(t), this.matrixWorldToECEF = O("mat4").setName("matrixWorldToECEF"), this.matrixECIToECEF = O("mat4").setName("matrixECIToECEF"), this.sunDirectionECEF = O("vec3").setName("sunDirectionECEF"), this.moonDirectionECEF = O("vec3").setName("moonDirectionECEF"), this.matrixMoonFixedToECEF = O("mat4").setName("matrixMoonFixedToECEF"), this.scatteringSampleCount = O(new zt(4, 14)), this.matrixECEFToWorld = O("mat4").setName("matrixECEFToWorld").onRenderUpdate((s, { value: o }) => {
      o.copy(this.matrixWorldToECEF.value).transpose();
    }), this.cameraPositionECEF = O("vec3").setName("cameraPositionECEF").onRenderUpdate((s, { value: o }) => {
      const i = this.camera ?? s.camera;
      i != null && o.setFromMatrixPosition(i.matrixWorld).applyMatrix4(this.matrixWorldToECEF.value);
    }), this.altitudeCorrectionECEF = O("vec3").setName("altitudeCorrectionECEF").onRenderUpdate((s, { value: o }) => {
      const i = this.camera ?? s.camera;
      i != null && So(
        o.setFromMatrixPosition(i.matrixWorld).applyMatrix4(this.matrixWorldToECEF.value),
        this.parameters.bottomRadius,
        this.ellipsoid,
        o
      );
    }), this.cameraHeight = O(0).setName("cameraHeight").onRenderUpdate((s, o) => {
      const i = this.camera ?? s.camera;
      if (i == null)
        return;
      const a = oi.setFromMatrixPosition(i.matrixWorld).applyMatrix4(this.matrixWorldToECEF.value);
      o.value = ii.setFromECEF(a).height;
    }), this.cameraPositionUnit = this.cameraPositionECEF.mul(this.parametersNode.worldToUnit).toConst("cameraPositionUnit"), this.altitudeCorrectionUnit = this.altitudeCorrectionECEF.mul(this.parametersNode.worldToUnit).toConst("altitudeCorrectionUnit"), this.ellipsoid = ho.WGS84, this.correctAltitude = !0, this.constrainCamera = !0, this.showGround = !0, this.accurateShadowScattering = !0, this.raymarchScattering = !0, this.lutNode = e;
  }
  dispose() {
    this.lutNode.dispose(), super.dispose();
  }
}
const da = Sn;
function K(n) {
  if (typeof n.context.getAtmosphere != "function")
    throw new Error("getAtmosphere() was not found in the builder context.");
  const t = n.context.getAtmosphere();
  if (!(t instanceof Sn))
    throw new Error(
      "getAtmosphere() must return an instanceof AtmosphereContext."
    );
  return t;
}
const la = Y((n) => {
  const { parametersNode: t } = K(n), { worldToUnit: e } = t;
  return Pn.z.mul(e);
}).once()().toVar("viewZUnit"), is = (n, t, e, s, o, i) => {
  const a = pe(
    n,
    _(
      i.pow2().add(pt(2, t, e, i)).add(t.pow2())
    )
  ).toConst(), r = t.mul(e).add(i).div(a).toConst(), u = t.mul(s).add(i.mul(o)).div(a).toConst();
  return {
    radius: a,
    cosView: r,
    cosLight: u
  };
}, ai = /* @__PURE__ */ W(
  (n, t, e, s, o) => {
    const { lutNode: i, parametersNode: a } = n, r = i.getTextureNode("transmittance"), u = i.getTextureNode("scattering"), c = i.getTextureNode(
      "singleMieScattering"
    ), { topRadius: d, bottomRadius: l, miePhaseFunctionG: h } = a, m = t.length().toVar();
    t = t.toVar(), n.constrainCamera && D(m.lessThan(l), () => {
      m.assign(l), t.assign(t.normalize().mul(m));
    });
    const p = t.dot(e).toVar(), y = p.negate().sub(
      Ut(p.pow2().sub(m.pow2()).add(d.pow2()))
    ).toConst();
    s = s.toVar(), D(y.greaterThan(0), () => {
      t.assign(t.add(e.mul(y))), m.assign(d), p.addAssign(y), s.y.assign(s.y.sub(y).max(0));
    });
    const g = E(0).toVar(), S = E(1).toVar();
    return D(m.lessThanEqual(d), () => {
      const x = p.div(m).toConst(), T = t.dot(o).div(m).toConst(), C = e.dot(o).toConst(), f = xs(
        a,
        m,
        x
      ).toVar();
      S.assign(
        f.select(
          0,
          Yt(
            r,
            m,
            x
          )
        )
      ), n.showGround || f.assign(_t(!1));
      const M = E(0).toVar(), N = E(0).toVar(), b = (v) => {
        const Z = is(
          a,
          m,
          x,
          T,
          C,
          v
        ), B = Zt(
          a,
          u,
          c,
          Z.radius,
          Z.cosView,
          Z.cosLight,
          C,
          f
        ).toConst(), G = Ne(
          r,
          m,
          x,
          v,
          f
        );
        return {
          S: B.get("scattering"),
          M: B.get("singleMieScattering"),
          T: G
        };
      }, A = s.y.add(s.x).toConst(), z = () => {
        const v = b(s.x);
        M.assign(v.T.mul(v.S)), N.assign(v.T.mul(v.M));
      }, L = () => {
        const v = Zt(
          a,
          u,
          c,
          m,
          x,
          T,
          C,
          f
        ).toConst(), Z = v.get("scattering"), B = v.get("singleMieScattering"), G = b(s.y), $ = b(A);
        M.assign(Z.sub(G.T.mul(G.S).sub($.T.mul($.S)).max(0))), N.assign(B.sub(G.T.mul(G.M).sub($.T.mul($.M)).max(0)));
      }, R = D(s.x.equal(0), () => {
        const v = Zt(
          a,
          u,
          c,
          m,
          x,
          T,
          C,
          f
        ).toConst();
        M.assign(v.get("scattering")), N.assign(
          v.get("singleMieScattering")
        );
      });
      n.accurateShadowScattering ? R.Else(L) : R.Else(z);
      let V = E(0);
      if (n.parameters.higherOrderScatteringTexture) {
        const v = i.getTextureNode(
          "higherOrderScattering"
        );
        V = ze(
          v,
          m,
          x,
          T,
          C,
          f
        );
      }
      const I = ge(C), F = Ue(h, C);
      g.assign(
        M.mul(I).add(N.mul(F)).add(V)
      );
    }), xe(g, S);
  }
), ri = /* @__PURE__ */ W(
  (n, t, e, s, o, i, a) => {
    const { lutNode: r, parametersNode: u } = n, c = r.getTextureNode("transmittance"), d = r.getTextureNode("scattering"), l = r.getTextureNode(
      "singleMieScattering"
    ), { rayleighScattering: h, mieScattering: m, miePhaseFunctionG: p } = u, y = xs(
      u,
      t,
      e
    ).toConst(), g = Ne(
      c,
      t,
      e,
      i,
      y
    ).toConst(), S = E(0).toVar(), x = E(0).toVar(), T = (V, I) => {
      const F = is(
        u,
        t,
        e,
        s,
        o,
        V
      ), v = Zt(
        u,
        d,
        l,
        F.radius,
        F.cosView,
        F.cosLight,
        o,
        y
      ).toConst();
      return {
        S: v.get("scattering"),
        M: v.get("singleMieScattering"),
        T: I ?? Ne(
          c,
          t,
          e,
          V,
          y
        )
      };
    }, C = a.y.add(a.x).toConst(), f = E(a.xy, i).greaterThan(E(0, 0, C)).toConst(), M = f.x, N = () => {
      const V = Zt(
        u,
        d,
        l,
        t,
        e,
        s,
        o,
        y
      ).toConst(), I = i.sub(a.x).max(0).toConst(), F = T(
        I,
        M.select(
          Ne(
            c,
            t,
            e,
            I,
            y
          ),
          g
        )
      ), v = V.get("scattering"), Z = V.get("singleMieScattering");
      S.assign(v.sub(F.T.mul(F.S))), x.assign(Z.sub(F.T.mul(F.M)));
    }, b = () => {
      const V = T(C), I = T(i, g);
      S.assign(V.T.mul(V.S).sub(g.mul(I.S))), x.assign(V.T.mul(V.M).sub(g.mul(I.M)));
    }, A = () => {
      const V = Zt(
        u,
        d,
        l,
        t,
        e,
        s,
        o,
        y
      ).toConst(), I = V.get("scattering"), F = V.get("singleMieScattering"), v = T(a.y), Z = T(C), B = T(i);
      S.assign(
        I.sub(g.mul(B.S), v.T.mul(v.S).sub(Z.T.mul(Z.S)).max(0))
      ), x.assign(
        F.sub(g.mul(B.M), v.T.mul(v.M).sub(Z.T.mul(Z.M)).max(0))
      );
    };
    n.accurateShadowScattering ? D(
      // shadowLength.y === 0 && distanceToPoint > shadowLimit
      M.and(f.y.not()).and(f.z),
      b
    ).ElseIf(
      // distanceToPoint > shadowLength.y + shadowLength.x
      M.and(f.z),
      A
    ).Else(N) : N(), n.parameters.combinedScatteringTextures && x.assign(
      dn(
        w(S, x.r),
        h,
        m
      )
    ), x.assign(
      x.mul(Ae(0, 0.01, s))
    );
    let z = E(0);
    if (n.parameters.higherOrderScatteringTexture) {
      const V = r.getTextureNode(
        "higherOrderScattering"
      ), I = ze(
        V,
        t,
        e,
        s,
        o,
        y
      ).toConst(), F = is(
        u,
        t,
        e,
        s,
        o,
        i
      ), v = ze(
        V,
        F.radius,
        F.cosView,
        F.cosLight,
        o,
        y
      ).toConst();
      z = I.sub(
        g.mul(v)
      );
    }
    const L = ge(o), R = Ue(p, o);
    return S.assign(
      S.mul(L).add(x.mul(R)).add(z)
    ), xe(S, g);
  }
), ci = /* @__PURE__ */ W(
  (n, t, e, s, o, i, a) => {
    const r = Zo(
      n,
      t,
      e,
      s,
      o,
      i,
      a
    ).toConst(), u = r.get("radiance"), c = r.get("transmittance");
    return xe(u, c);
  }
), ui = /* @__PURE__ */ W(
  (n, t, e, s, o) => {
    const { parametersNode: i } = n, { topRadius: a, bottomRadius: r } = i, u = E(0).toVar(), c = E(1).toVar(), d = e.sub(t).toConst(), l = t.dot(d).negate().div(d.dot(d)).saturate().toConst(), h = t.add(l.mul(d)).length().toConst();
    return D(h.lessThan(a), () => {
      const m = d.length().toConst();
      if (!n.raymarchScattering) {
        const N = r.add(a.sub(r).mul(0.01)).toConst(), b = e.mul(N.div(e.length()).max(1)).toConst(), A = d.div(m);
        t = ct(
          t.mul(N.div(t.length()).max(1)),
          t.add(b.sub(e)),
          t.normalize().dot(A).pow2()
        ).toConst(), e = b;
      }
      const p = e.sub(t).normalize().toConst(), y = t.length().toVar(), g = t.dot(p).toVar(), S = g.negate().sub(
        Ut(
          g.pow2().sub(y.pow2()).add(a.pow2())
        )
      ).toConst(), x = t.toVar();
      s = s.toVar(), D(S.greaterThan(0), () => {
        x.addAssign(p.mul(S)), y.assign(a), g.addAssign(S), s.y.assign(s.y.sub(S).max(0));
      });
      const T = g.div(y), C = x.dot(o).div(y), f = p.dot(o), M = x.distance(e);
      if (n.raymarchScattering) {
        const N = ci(
          n,
          y,
          T,
          C,
          f,
          M,
          s
        ).toConst();
        u.assign(N.get("radiance")), c.assign(N.get("transmittance"));
      } else {
        const N = ri(
          n,
          y,
          T,
          C,
          f,
          M,
          s
        ).toConst();
        u.assign(N.get("radiance")), c.assign(N.get("transmittance"));
      }
      if (!n.raymarchScattering) {
        const N = m.div(t.distance(e));
        u.assign(u.mul(N)), c.assign(c.pow(N));
      }
    }), xe(u, c);
  }
), yn = /* @__PURE__ */ ut(
  {
    direct: Pt,
    indirect: Pt
  },
  "SplitIrradiance"
), di = /* @__PURE__ */ W(
  (n, t, e, s) => {
    const { lutNode: o, parametersNode: i } = n, a = o.getTextureNode("transmittance"), r = o.getTextureNode("irradiance"), { solarIrradiance: u } = i, c = t.length().toConst(), d = t.dot(s).div(c).toConst(), l = u.mul(
      $t(a, c, d),
      e.dot(s).max(0)
    ), h = Ss(
      r,
      c,
      d
    ).mul(e.dot(t).div(c).add(1).mul(0.5));
    return yn(l, h);
  }
), li = /* @__PURE__ */ W(
  (n, t, e, s) => {
    const { lutNode: o } = n, i = o.getTextureNode("irradiance"), a = t.length().toConst(), r = t.dot(s).div(a).toConst();
    return Ss(i, a, r).mul(
      e.dot(t).div(a).add(1).mul(0.5)
    );
  }
), mi = /* @__PURE__ */ W(
  (n, t, e) => {
    const { lutNode: s, parametersNode: o } = n, i = s.getTextureNode("transmittance"), a = s.getTextureNode("irradiance"), { solarIrradiance: r } = o, u = t.length().toConst(), c = t.dot(e).div(u).toConst(), d = r.mul(
      $t(i, u, c)
    ), l = Ss(
      a,
      u,
      c
    ).mul(Bn);
    return yn(d, l);
  }
), hi = /* @__PURE__ */ W(
  () => (n) => {
    const t = Nt(n), { parametersNode: e } = t, {
      solarIrradiance: s,
      sunAngularRadius: o,
      sunRadianceToLuminance: i,
      luminanceScale: a
    } = e;
    return s.div(Fe.mul(o.pow2())).mul(i.mul(a));
  }
), Tn = /* @__PURE__ */ ut(
  {
    luminance: nn,
    transmittance: qt
  },
  "LuminanceTransfer"
), Os = /* @__PURE__ */ W(
  (n, t, e, s) => (o) => {
    const i = K(o), { parametersNode: a } = i, { skyRadianceToLuminance: r, luminanceScale: u } = a, c = ai(
      i,
      n,
      t,
      e,
      s
    ), d = c.get("radiance").mul(r.mul(u));
    return Tn(
      d,
      c.get("transmittance")
    );
  }
), Ws = /* @__PURE__ */ W(
  (n, t, e, s) => (o) => {
    const i = K(o), { parametersNode: a } = i, { skyRadianceToLuminance: r, luminanceScale: u } = a, c = ui(
      i,
      n,
      t,
      e,
      s
    ).toConst(), d = c.get("radiance").mul(r.mul(u));
    return Tn(
      d,
      c.get("transmittance")
    );
  }
), Cn = /* @__PURE__ */ ut(
  {
    direct: Ds,
    indirect: Ds
  },
  "SplitIlluminance"
), ks = /* @__PURE__ */ W(
  (n, t, e) => (s) => {
    const o = K(s), { parametersNode: i } = o, { sunRadianceToLuminance: a, skyRadianceToLuminance: r, luminanceScale: u } = i, c = di(
      o,
      n,
      t,
      e
    ).toConst(), d = c.get("direct").mul(a.mul(u)), l = c.get("indirect").mul(r.mul(u));
    return Cn(d, l);
  }
), pi = /* @__PURE__ */ W(
  (n, t, e) => (s) => {
    const o = K(s), { parametersNode: i } = o, { skyRadianceToLuminance: a, luminanceScale: r } = i;
    return li(
      o,
      n,
      t,
      e
    ).mul(a.mul(r));
  }
), ma = /* @__PURE__ */ W(
  (n, t) => (e) => {
    const s = K(e), { parametersNode: o } = s, { sunRadianceToLuminance: i, skyRadianceToLuminance: a, luminanceScale: r } = o, u = mi(
      s,
      n,
      t
    ).toConst(), c = u.get("direct").mul(i.mul(r)), d = u.get("indirect").mul(a.mul(r));
    return Cn(c, d);
  }
), gi = /* @__PURE__ */ k({
  name: "getLunarRadiance",
  type: nn,
  inputs: [
    { name: "parameters", type: J },
    { name: "moonAngularRadius", type: "float" }
  ]
})(([n, t]) => {
  const { solarIrradiance: e, sunRadianceToLuminance: s, luminanceScale: o } = j(n);
  return e.mul(25e-7).div(Fe.mul(t.pow2())).mul(s.mul(o));
}), xi = /* @__PURE__ */ k({
  name: "raySphereIntersectionNormal",
  type: "vec3",
  inputs: [
    { name: "rayDirection", type: "vec3" },
    { name: "centerDirection", type: "vec3" },
    { name: "angularRadius", type: "float" }
  ]
})(([n, t, e]) => {
  const s = t.dot(n), o = t.sub(n.mul(s)).negate().toConst(), i = _(e.pow2().sub(o.dot(o)).max(0));
  return o.sub(n.mul(i)).div(e);
}), Si = /* @__PURE__ */ k({
  name: "orenNayarDiffuse",
  type: "float",
  inputs: [
    { name: "lightDirection", type: "vec3" },
    { name: "viewDirection", type: "vec3" },
    { name: "normal", type: "vec3" }
  ]
})(([n, t, e]) => {
  const s = e.dot(n).toConst(), o = e.dot(t).toConst(), i = n.dot(t).sub(s.mul(o)).toConst(), a = ct(1, ot(s, o).max(0.1), i.smoothstep(0, 0.1)), r = 1 / Math.PI * (1 - 0.5 * (1 / 1.33) + 0.17 * (1 / 1.13)), u = 1 / Math.PI * (0.45 * (1 / 1.09));
  return s.max(0).mul(i.div(a).mul(u).add(r));
});
class yi extends Qt {
  constructor() {
    super("vec4"), this.angularRadius = O(45e-4), this.intensity = O(1), this.displacementScale = O(65535 * 0.5 / 1727400);
  }
  static get type() {
    return "MoonNode";
  }
  setup(t) {
    const e = K(t), { rayDirectionECEF: s } = this;
    if (s == null)
      return;
    const {
      sunDirectionECEF: o,
      moonDirectionECEF: i,
      matrixMoonFixedToECEF: a
    } = e;
    return Y(() => {
      const r = It(this.angularRadius).oneMinus().mul(2), u = s.sub(i), c = u.dot(u), d = Zs(c), l = U().toVar(), h = E().toVar(), m = E().toVar();
      D(c.lessThan(r), () => {
        h.assign(
          xi(
            s,
            i,
            this.angularRadius
          )
        ), m.assign(
          a.transpose().mul(w(h, 0)).xyz
        ), l.assign(On(m.xzy));
      });
      const p = Ns(l).toConst(), y = bs(l).toConst(), g = Ns(m).toConst(), S = bs(m).toConst(), x = w(0).toVar();
      return D(c.lessThan(r), () => {
        if (this.displacementNode != null) {
          const M = this.displacementNode.sample(l.add(p)).x, N = this.displacementNode.sample(l.sub(p)).x, b = this.displacementNode.sample(l.add(y)).x, A = this.displacementNode.sample(l.sub(y)).x, z = M.sub(N).mul(0.5), L = b.sub(A).mul(0.5), R = S.cross(m).toConst(), V = m.cross(g).toConst(), I = g.dot(R).toConst(), F = R.mul(z).add(V.mul(L)).mul(I.sign()), v = m.mul(I.abs()).sub(F.mul(this.displacementScale)).normalize();
          m.assign(
            ct(
              m,
              v,
              // Avoid artifact at the edge:
              h.dot(s.negate()).smoothstep(0, 0.3)
            )
          ), h.assign(a.mul(w(m, 0)).xyz);
        }
        const T = this.colorNode?.sample(l).xyz ?? 1, C = Si(
          o,
          s.negate(),
          h
        ), f = Ae(
          r,
          r.sub(d),
          c
        );
        x.assign(
          w(
            gi(
              e.parametersNode,
              this.angularRadius
            ).mul(this.intensity).mul(T).mul(C),
            f
          )
        );
      }), x;
    })();
  }
}
const { resetRendererState: Ti, restoreRendererState: Ci } = Ot;
function wi() {
  const n = new fo(1, 1, {
    depthBuffer: !1,
    type: Xt,
    format: Bt
  }), t = n.texture;
  return t.minFilter = X, t.magFilter = X, t.generateMipmaps = !1, t.name = "Stars", n;
}
const fi = k({
  name: "log10",
  type: "float",
  inputs: [{ name: "x", type: "float" }]
})(([n]) => Wn(n).mul(1 / Math.log(10))), vi = /* @__PURE__ */ W(
  (n, t) => {
    const s = n.add(fi(t.mul(425e8)).mul(2.5)).toConst();
    return Gn(10, s.mul(-0.4)).mul(108e3);
  }
), Ni = /* @__PURE__ */ new zt();
class bi extends Qt {
  constructor(t = yo) {
    super("vec3"), this.pointSize = O(1), this.intensity = O(1e3), this.magnitudeRange = O(new zt(-2, 8)), this.material = new _s(), this.points = new jn(this.material), this.updateBeforeType = gt.FRAME, this.material.name = "Stars", this.data = t, this.renderTarget = wi(), this.textureNode = ft(this, this.renderTarget.texture);
  }
  static get type() {
    return "StarsNode";
  }
  getTextureNode() {
    return this.textureNode;
  }
  setSize(t, e) {
    return this.renderTarget.setSize(t, e), this;
  }
  updateBefore(t) {
    const { renderer: e } = t, s = this.camera ?? t.camera;
    if (e == null || s == null)
      return;
    const o = e.getDrawingBufferSize(Ni);
    this.setSize(o.x, o.y), this.rendererState = Ti(e, this.rendererState), this.points.position.copy(s.position), e.setRenderTarget(this.renderTarget), e.render(this.points, s), Ci(e, this.rendererState);
  }
  createBuffers(t) {
    const e = t.byteLength / 10, s = new Float32Array(e * 3), o = new Float32Array(e), i = new Float32Array(e * 3), a = new Int16Array(t), r = new Uint8Array(t);
    for (let u = 0, c = 0, d = 0, l = 0; u < e; ++u, c += 3, d += 5, l += 10)
      s[c + 0] = a[d + 0] / 32767, s[c + 1] = a[d + 1] / 32767, s[c + 2] = a[d + 2] / 32767, o[u] = r[l + 6] / 255, i[c + 0] = r[l + 7] / 255, i[c + 1] = r[l + 8] / 255, i[c + 2] = r[l + 9] / 255;
    this.positionBuffer = new ke(s, 3), this.magnitudeBuffer = new ke(o, 1), this.colorBuffer = new ke(i, 3), this.points.count = e;
  }
  setupMaterial(t) {
    const e = K(t), s = e.camera ?? t.camera;
    if (s == null)
      return;
    const { material: o, positionBuffer: i, magnitudeBuffer: a, colorBuffer: r } = this;
    rt(i != null), rt(a != null), rt(r != null);
    const u = We(i, "vec3"), c = We(a, "float"), d = We(r, "vec3"), { matrixECIToECEF: l, matrixECEFToWorld: h, parametersNode: m } = e, { luminanceScale: p } = m, y = l.mul(w(u, 0)).xyz, g = h.mul(w(y, 0)).xyz;
    o.positionNode = g.mul(
      Eo(s).add(js(s)).mul(0.5)
    );
    const S = ct(
      this.magnitudeRange.x,
      this.magnitudeRange.y,
      c.x
    ), x = this.pointSize.mul(2).div($s.y.mul(Js(s)[1][1])).pow2(), T = vi(S, x);
    o.colorNode = T.mul(p).mul(d).mul(this.intensity).toVertexStage(), o.needsUpdate = !0;
  }
  setup(t) {
    typeof this.data == "string" ? this.dataPromise ??= new po().loadAsync(this.data).then((o) => {
      this.createBuffers(o), this.setupMaterial(t);
    }).catch((o) => {
      console.error(o);
    }) : (this.createBuffers(this.data), this.setupMaterial(t));
    const { material: e } = this;
    e.sizeNode = this.pointSize, e.sizeAttenuation = !1, e.depthTest = !1, e.depthWrite = !1, e.transparent = !0, e.blending = Jn, e.needsUpdate = !0, this.points.frustumCulled = !1;
    const s = K(t);
    return this.camera = s.camera, this.textureNode.uvNode = kn, this.textureNode;
  }
  dispose() {
    this.renderTarget.dispose(), this.material.dispose(), super.dispose();
  }
}
class Ei extends Qt {
  constructor() {
    super("vec4"), this.angularRadius = O(4675e-6), this.intensity = O(1);
  }
  static get type() {
    return "SunNode";
  }
  setup(t) {
    const e = K(t), { rayDirectionECEF: s } = this;
    if (s == null)
      return;
    const { sunDirectionECEF: o } = e;
    return Y(() => {
      const i = It(this.angularRadius).oneMinus().mul(2), a = s.sub(o), r = a.dot(a), u = Zs(r), c = w(0).toVar();
      return D(r.lessThan(i), () => {
        const d = Ae(
          i,
          i.sub(u),
          r
        );
        c.assign(
          w(hi().mul(this.intensity), d)
        );
      }), c;
    })();
  }
}
const Mi = (n) => {
  const t = Me(n).mul(
    w(ds, 1)
  ).xyz;
  return re(n).mul(
    w(t, 0)
  ).xyz;
}, as = "CAMERA", wn = "EQUIRECTANGULAR";
class fn extends Qt {
  constructor(t, e) {
    super("vec3"), this.scope = as, this.showSun = !0, this.showMoon = !0, this.showStars = !0, this.moonScattering = !1, this.useContextCamera = !0, this.scope = t, this.shadowLengthNode = e, this.sunNode = new Ei(), this.moonNode = new yi(), this.starsNode = new bi();
  }
  static get type() {
    return "SkyNode";
  }
  customCacheKey() {
    return ps(
      +this.showSun,
      +this.showMoon,
      +this.showStars,
      +this.moonScattering,
      +this.useContextCamera
    );
  }
  setup(t) {
    const e = K(t), {
      matrixWorldToECEF: s,
      sunDirectionECEF: o,
      moonDirectionECEF: i,
      cameraPositionUnit: a,
      altitudeCorrectionUnit: r
    } = e;
    let u;
    switch (this.scope) {
      case as: {
        u = Mi(
          this.useContextCamera ? e.camera : null
        );
        break;
      }
      case wn:
        u = Mo(se());
        break;
    }
    if (u != null)
      return Y(() => {
        const c = s.mul(w(u, 0)).xyz.toVertexStage().normalize().toConst(), d = Os(
          a.add(r),
          c,
          this.shadowLengthNode ?? U(0),
          o
        ).toConst(), l = d.get("transmittance");
        let h = d.get("luminance");
        if (this.moonScattering) {
          const p = Os(
            a.add(r),
            c,
            this.shadowLengthNode ?? U(0),
            i
          );
          h = h.add(
            p.get("luminance").mul(25e-7)
          );
        }
        const m = E(0).toVar();
        if (this.showStars && m.addAssign(this.starsNode), this.showSun) {
          const { sunNode: p } = this;
          p.rayDirectionECEF = c, m.assign(ct(m, p.rgb, p.a));
        }
        if (this.showMoon) {
          const { moonNode: p } = this;
          p.rayDirectionECEF = c, m.assign(ct(m, p.rgb, p.a));
        }
        return m.mul(l).add(h);
      })();
  }
}
const vn = /* @__PURE__ */ Hs(fn, as), ha = /* @__PURE__ */ Hs(fn, wn);
class Ri extends Qt {
  constructor(t, e, s, o) {
    super("vec4"), this.correctGeometricError = !0, this.lighting = !1, this.transmittance = !0, this.inscattering = !0, this.moonScattering = !1, this.colorNode = t, this.depthNode = e, this.normalNode = s, this.shadowLengthNode = o, this.skyNode = vn(o), this.lighting = s != null;
  }
  static get type() {
    return "AerialPerspectiveNode";
  }
  customCacheKey() {
    return ps(
      +this.correctGeometricError,
      +this.lighting,
      +this.transmittance,
      +this.inscattering,
      +this.moonScattering
    );
  }
  setup(t) {
    const e = K(t), s = e.camera ?? t.camera;
    if (s == null)
      return;
    const { worldToUnit: o } = e.parametersNode, {
      ellipsoid: i,
      matrixWorldToECEF: a,
      sunDirectionECEF: r,
      moonDirectionECEF: u,
      cameraPositionUnit: c,
      altitudeCorrectionUnit: d
    } = e, { colorNode: l, depthNode: h, normalNode: m } = this, p = h.r.toConst(), y = () => {
      const x = zo(p, s), T = Lo(
        se(),
        p,
        x,
        Js(s),
        Me(s)
      ), C = re(s).mul(
        w(T, 1)
      ).xyz;
      return a.mul(w(C, 1)).xyz;
    }, g = () => {
      const x = Me(s).mul(
        w(ds, 1)
      ).xyz, T = re(s).mul(
        w(x, 0)
      ).xyz;
      return a.mul(w(T, 0)).xyz.toVertexStage().normalize();
    }, S = Y(() => {
      const x = y().mul(o).toVar(), T = qn(
        x.distance(c),
        // The distance to the horizon from the highest point on the earth,
        o.mul(336e3),
        // The distance to the horizon at the top atmosphere
        o.mul(876e3)
      ), C = E(i.radii).mul(o), f = x.div(C.pow2()).normalize();
      if (this.correctGeometricError) {
        const R = g(), V = Ro(
          c,
          R,
          C
        ).x, I = V.greaterThanEqual(0).select(
          R.mul(V).add(c),
          // Fallback to radial projection:
          f.mul(C)
        );
        x.assign(
          ct(x, I, T)
        );
      }
      const M = Y(() => {
        let R;
        if (m != null) {
          const F = m.xyz, v = re(s).mul(
            w(F, 0)
          ).xyz;
          R = a.mul(w(v, 0)).xyz, this.correctGeometricError && R.assign(
            ct(R, f, T)
          );
        } else
          R = x.normalize();
        const V = ks(
          x.add(d),
          R,
          r
        );
        let I = Ct(
          V.get("direct"),
          V.get("indirect")
        );
        if (this.moonScattering) {
          const F = ks(
            x.add(d),
            R,
            u
          );
          I = Ct(
            I,
            F.get("direct"),
            F.get("indirect")
          );
        }
        return I;
      })(), N = this.lighting ? l.rgb.mul(M).mul(1 / Math.PI) : l.rgb, b = Ws(
        c.add(d),
        x.add(d),
        this.shadowLengthNode ?? U(0),
        r
      ).toConst(), A = b.get("transmittance");
      let z = b.get("luminance");
      if (this.moonScattering) {
        const R = Ws(
          c.add(d),
          x.add(d),
          this.shadowLengthNode ?? U(0),
          u
        ).toConst();
        z = z.add(
          R.get("luminance").mul(25e-7)
        );
      }
      let L = N;
      return this.transmittance && (L = L.mul(A)), this.inscattering && (L = L.add(z)), L;
    })();
    return Y(() => {
      const x = l.toVar();
      return D(
        t.renderer.reversedDepthBuffer ? p.lessThanEqual(0) : p.greaterThanEqual(1),
        () => {
          this.skyNode != null && x.rgb.assign(this.skyNode);
        }
      ).Else(() => {
        x.rgb.assign(S);
      }), x;
    })();
  }
  dispose() {
    this.skyNode?.dispose(), super.dispose();
  }
  /** @deprecated Use inscattering instead. */
  get inscatter() {
    return this.inscattering;
  }
  /** @deprecated Use inscattering instead. */
  set inscatter(t) {
    this.inscattering = t;
  }
}
const pa = (...n) => new Ri(...n);
class ga extends Ks {
  constructor(t = 1, e = "sun") {
    super(), this.type = "AtmosphereLight", this.direct = O(!0), this.indirect = O(!0), this.distance = t, this.body = e;
  }
}
const zi = /* @__PURE__ */ new to();
class xa extends vo {
  constructor(t) {
    super(t), this.intensity = O(1), this.directionECEF = O("vec3"), this.updateBeforeType = gt.FRAME;
  }
  static get type() {
    return "AtmosphereLightNode";
  }
  updateBefore(t) {
    const { light: e, atmosphereContext: s } = this;
    if (e == null || s == null)
      return;
    const { matrixECEFToWorld: o } = s;
    e.position.copy(this.directionECEF.value).applyMatrix3(zi.setFromMatrix4(o.value)).multiplyScalar(e.distance).add(e.target.position);
  }
  update(t) {
    super.update(t);
    const { light: e, atmosphereContext: s } = this;
    if (!(e == null || s == null))
      switch (e.body) {
        case "sun":
          this.intensity.value = e.intensity, this.directionECEF.value.copy(s.sunDirectionECEF.value);
          break;
        case "moon":
          this.intensity.value = e.intensity * 25e-7, this.directionECEF.value.copy(s.moonDirectionECEF.value);
          break;
      }
  }
  setup(t) {
    return this.atmosphereContext = K(t), super.setup(t);
  }
  setupDirect(t) {
    const { light: e, atmosphereContext: s } = this;
    if (e == null || s == null)
      return;
    const { intensity: o, directionECEF: i } = this, { direct: a, indirect: r } = e, {
      worldToUnit: u,
      solarIrradiance: c,
      sunRadianceToLuminance: d,
      luminanceScale: l
    } = s.parametersNode, { matrixWorldToECEF: h, matrixECEFToWorld: m, altitudeCorrectionECEF: p } = s, y = h.mul(w(Zn, 0)).xyz;
    let g = h.mul(w($n, 1)).xyz;
    s.correctAltitude && (g = g.add(p));
    const S = g.mul(u).toConst(), x = pi(
      S,
      y,
      i
    ).mul(r.select(1, 0));
    t.context.irradiance.addAssign(x.mul(o));
    const C = m.mul(w(i, 0)).xyz, f = Hn.mul(w(C, 0)).xyz, M = S.length().toConst(), N = S.dot(i).div(M), b = $t(
      s.lutNode.getTextureNode("transmittance"),
      M,
      N
    ), A = c.mul(b).mul(d.mul(l)).mul(o).mul(a.select(1, 0));
    return {
      lightDirection: f,
      lightColor: A.mul(this.colorNode)
    };
  }
}
const Nn = 3402823466e29, Li = 65504, Vi = /* @__PURE__ */ k({
  name: "uvToScreen",
  type: "vec2",
  inputs: [{ name: "uv", type: "vec2" }]
})(([n]) => n.mul(U(2, -2)).add(U(-1, 1))), Ai = /* @__PURE__ */ k({
  name: "transformScreenToUV",
  type: "vec2",
  inputs: [{ name: "screen", type: "vec2" }]
})(([n]) => n.mul(U(0.5, -0.5)).add(0.5)), Ve = /* @__PURE__ */ k({
  name: "transformUnitToShadowUV",
  type: "vec3",
  inputs: [
    { name: "positionUnit", type: "vec3" },
    { name: "shadowMatrix", type: "mat4" }
  ]
})(([n, t]) => {
  const e = t.mul(w(n, 1)).xyz;
  return E(e.x, e.y.oneMinus(), e.z);
}), rs = /* @__PURE__ */ W(
  (n) => w(-1, -1, 1, 1).add(w(1, 1, -1, -1).div(n.xyxy))
), me = /* @__PURE__ */ W(
  (n, t) => {
    const s = P(0.2).oneMinus().div(t).oneMinus();
    return n.abs().lessThanEqual(s).all();
  }
), bn = /* @__PURE__ */ W(
  (n, t, e) => (s) => {
    const { cameraPositionUnit: o } = K(s), i = Me(e).mul(w(n, 1, 1)).xyz.toConst(), a = i.mul(t.negate().div(i.z)).toConst();
    return re(e).mul(w(a, 0)).xyz.add(o);
  }
), En = /* @__PURE__ */ W(
  (n, t, e) => (s) => {
    const { parametersNode: o } = K(s), { worldToUnit: i } = o, a = e.sample(t).x.toConst(), r = js(n).mul(i);
    return a.lessThan(0).select(a.negate(), r);
  }
), { resetRendererState: Fi, restoreRendererState: Di } = Ot;
class Ui extends ne {
  constructor() {
    super(), this.material = new vt(), this.mesh = new Kt(this.material), this.updateType = gt.FRAME, this.material.name = "Coordinate", this.mesh.name = "Coordinate";
    const t = new Ht(1, 1, {
      depthBuffer: !1,
      type: Xt,
      format: Bt
    }), e = t.texture;
    e.name = "Coordinate", e.minFilter = As, e.magFilter = As, e.generateMipmaps = !1, this.renderTarget = t, this.textureNode = ft(this, t.texture);
  }
  static get type() {
    return "CoordinateNode";
  }
  getTextureNode() {
    return this.textureNode;
  }
  update({ renderer: t }) {
    t != null && (this.renderTarget.setSize(
      this.maxSliceSampleCount.value,
      this.epipolarSliceCount.value
    ), this.rendererState = Fi(t, this.rendererState), t.setRenderTarget(this.renderTarget), this.mesh.render(t), Di(t, this.rendererState));
  }
  setupFragmentNode(t) {
    const { viewZUnitNode: e, sliceEndpointsNode: s, screenSize: o, camera: i } = this, a = P(this.maxSliceSampleCount);
    return Y(() => {
      const r = se().toConst(), u = s.load(ue(at.y, 0)).toConst(), c = E(-2, -2, 0).toVar();
      return D(me(u.xy, o), () => {
        let d = r.x.sub(
          P(0.5).div(a)
        );
        d = d.mul(a.div(a.sub(1))).saturate().toConst();
        const l = ct(
          u.xy,
          u.zw,
          d
        ).toConst();
        D(me(l, o), () => {
          const h = En(
            i,
            Ai(l),
            e
          );
          c.assign(E(l, h));
        });
      }), c;
    })();
  }
  setup(t) {
    const { material: e } = this;
    return e.fragmentNode = this.setupFragmentNode(t), e.needsUpdate = !0, this.textureNode;
  }
  dispose() {
    this.renderTarget.dispose(), this.material.dispose(), this.mesh.geometry.dispose(), super.dispose();
  }
}
const { resetRendererState: Ii, restoreRendererState: Pi } = Ot, Bi = /* @__PURE__ */ W(
  (n, t, e, s) => {
    const o = Vo(
      n,
      t,
      e,
      s
    ).toConst();
    return w(
      o.get("near").x,
      o.get("far").x,
      o.get("near").y,
      o.get("far").y
    );
  }
);
class Oi extends ne {
  constructor() {
    super(), this.material = new vt(), this.mesh = new Kt(this.material), this.updateType = gt.FRAME, this.material.name = "EpipolarShadowLength", this.mesh.name = "EpipolarShadowLength";
    const t = new Ht(1, 1, {
      depthBuffer: !1,
      type: Xt,
      format: ms
    }), e = t.texture;
    e.name = "EpipolarShadowLength", e.minFilter = X, e.magFilter = X, e.generateMipmaps = !1, this.renderTarget = t, this.textureNode = ft(this, t.texture);
  }
  static get type() {
    return "EpipolarShadowLengthNode";
  }
  getTextureNode() {
    return this.textureNode;
  }
  update({ renderer: t }) {
    t != null && (this.renderTarget.setSize(
      this.maxSliceSampleCount.value,
      this.epipolarSliceCount.value
    ), this.rendererState = Ii(t, this.rendererState), t.setRenderTarget(this.renderTarget), this.mesh.render(t), Pi(t, this.rendererState));
  }
  setupFragmentNode(t) {
    const {
      csmShadowNode: e,
      coordinateNode: s,
      sliceUVDirectionNode: o,
      minMaxLevelsNode: i,
      shadowDepthNodes: a,
      camera: r,
      epipolarSliceCount: u,
      firstCascade: c,
      maxShadowStep: d,
      shadowCascadeArray: l,
      shadowMatrixArray: h
    } = this, { cascades: m } = e, { cameraPositionUnit: p, parameters: y } = K(t), { worldToUnit: g } = y, S = O("float").onRenderUpdate(
      () => r.far * g * 0.999999
    ), x = W(
      (C, f, M) => {
        const N = P(0).toVar();
        for (let b = 0; b < m; ++b)
          D(f.equal(b), () => {
            N.assign(
              a[b].sample(C.xy).compare(M)
            );
          });
        return N;
      }
    ), T = W(
      (C, f, M, N, b, A, z) => {
        const L = Q(at.y), R = Es(i.size().x).toConst(), V = Rt(f, N).div(f).toConst(), I = M.div(f).toConst(), F = b.mul(I).toVar(), v = b.mul(V).toVar();
        F.assign(ot(F, z.x)), v.assign(ot(v, z.x));
        const Z = p.add(A.mul(v)).toConst(), B = p.add(A.mul(F)).toConst(), G = v.sub(F).toConst(), $ = P(0).toVar(), dt = P(0).toVar(), tt = P(0).toVar();
        return D(G.lessThanEqual(10 * g).not(), () => {
          const xt = h.element(C), it = Ve(
            B,
            xt
          ), lt = Ve(
            Z,
            xt
          ).sub(it).toVar(), et = ot(
            lt.xy.length(),
            1e-7
          ).toConst();
          lt.divAssign(et);
          const mt = C.sub(c).toConst(), St = o.load(ue(L, mt)).toConst(), yt = St.xy.toConst().length().toConst(), ht = St.zw.toConst(), oe = G.mul(yt.div(et)).toConst(), ie = P(0).toVar(), ae = it.toVar(), Ts = 0, Pe = Q(
            it.xy.sub(ht).length().div(yt).add(0.5)
          ).toVar(), Et = Q(0).toVar(), Be = R.negate().toVar(), Wt = P(1).toVar(), Mn = d, Cs = lt.mul(yt).toConst(), Rn = Q(L).add(Q(C.sub(c)).mul(u)).toConst();
          wt(ie.lessThan(G), () => {
            const zn = ae.z.clamp(1e-7, 1).toConst(), ye = P(0).toVar();
            D(
              Xs(
                Wt.mul(2).lessThan(Mn),
                Pe.bitAnd(Q(2).shiftLeft(Et).sub(1)).equal(0)
              ),
              () => {
                Be.addAssign(
                  R.shiftRight(Et)
                ), Et.addAssign(1), Wt.mulAssign(2);
              }
            ), wt(Et.greaterThan(Ts), () => {
              const An = ae.z.add(
                Cs.z.mul(Wt.sub(1))
              ), Te = U(
                ae.z,
                An
              ).saturate().toConst(), Fn = ue(
                Es(Pe.shiftRight(Et)).add(
                  Be
                ),
                Rn
              ), Ce = i.load(Fn).xy.toConst();
              ye.assign(
                t.renderer.reversedDepthBuffer ? Te.greaterThanEqual(Ce.yy).all() : Te.lessThanEqual(Ce.xx).all()
              );
              const Dn = (t.renderer.reversedDepthBuffer ? Te.lessThan(Ce.xx).all() : Te.greaterThan(Ce.yy).all()).toConst();
              D(ye.or(Dn), () => {
                Ms();
              }), Et.subAssign(1), Be.subAssign(
                R.shiftRight(Et)
              ), Wt.divAssign(2);
            }), D(Et.lessThanEqual(Ts), () => {
              ye.assign(
                x(
                  ae.xy,
                  C,
                  zn
                )
              );
            });
            const Ln = G.sub(ie).max(0).toConst(), Oe = oe.mul(Wt).min(Ln).toConst();
            ae.addAssign(
              Cs.mul(Wt)
            ), Pe.addAssign(Q(1).shiftLeft(Et)), ie.addAssign(oe.mul(Wt));
            const ws = Oe.mul(ye.oneMinus()).toConst(), Vn = F.add(tt).add(Oe.mul(0.5));
            $.addAssign(ws), dt.addAssign(
              ws.mul(Vn)
            ), tt.addAssign(Oe);
          });
        }), U($, dt);
      }
    );
    return Y(() => {
      const { parametersNode: C } = K(t), { topRadius: f, bottomRadius: M } = C, N = s.load(at).toConst(), b = N.xy, A = N.z.toVar(), z = U(0).toVar(), L = P(0).toVar();
      return D(
        b.abs().greaterThan(1 + 1e-3).any().not(),
        () => {
          const V = bn(
            b,
            A,
            r
          ).toConst().sub(p).toConst();
          L.assign(V.length());
          const I = V.div(L).toConst(), F = Bi(
            p,
            I,
            E(0),
            U(f, M)
          ).toConst(), v = F.xy, Z = F.zw;
          D(v.y.greaterThan(0), () => {
            const B = L.toVar();
            D(A.greaterThanEqual(S), () => {
              B.assign(Li);
            }), B.assign(Rt(B, v.y)), D(Z.x.greaterThan(0), () => {
              B.assign(Rt(B, Z.x));
            }), A.mulAssign(B.div(L)), wt(
              {
                start: c,
                end: m,
                condition: "<"
              },
              ({ i: G }) => {
                const $ = l.element(G), dt = $.x, tt = $.y;
                D(A.lessThan(dt), () => {
                  Ms();
                }), z.addAssign(
                  T(
                    G,
                    A,
                    dt,
                    tt,
                    B,
                    I,
                    v
                  )
                );
              }
            );
          });
        }
      ), D(z.x.greaterThan(1e-6), () => {
        const R = z.y.div(z.x).sub(z.x.mul(0.5)).clamp(0, L.sub(z.x).max(0)).toConst();
        z.y.assign(
          R.lessThan(g).select(0, R)
        );
      }).Else(() => {
        z.y.assign(L);
      }), z;
    })();
  }
  setup(t) {
    const { material: e } = this;
    return e.fragmentNode = this.setupFragmentNode(t), e.needsUpdate = !0, this.textureNode;
  }
  dispose() {
    this.renderTarget.dispose(), this.material.dispose(), this.mesh.geometry.dispose(), super.dispose();
  }
}
const { resetRendererState: Wi, restoreRendererState: ki } = Ot, ss = /* @__PURE__ */ new eo(), Gs = /* @__PURE__ */ new zt();
class Gi extends ne {
  constructor() {
    super(), this.gatherMaterial = new vt(), this.mipmapMaterial = new vt(), this.mesh = new Kt(this.gatherMaterial), this.mipmapSourceNode = Xn(), this.mipmapOffsetNode = O("uvec2"), this.updateType = gt.FRAME, this.gatherMaterial.name = "MinMaxLevels_gather", this.mipmapMaterial.name = "MinMaxLevels_mipmap", this.mesh.name = "MinMaxLevels";
    const t = new Ht(1, 1, {
      depthBuffer: !1,
      // TODO: In reversed depth buffer, where FloatType is used for the depth
      // texture, this lose precision and results in incorrect cascade selection
      // in EpipolarShadowLengthNode. But as of r184, TSL doesn't allow
      // outputting integer values. We will use RG16Unorm once it supports it,
      // with flooring and ceiling the min/max depths.
      // The current workaround is to use FloatType here.
      type: Xt,
      format: ms
    }), e = t.texture;
    e.minFilter = X, e.magFilter = X, e.generateMipmaps = !1, this.renderTargetA = t, this.renderTargetA.texture.name = "MinMaxLevelsA", this.renderTargetB = t.clone(), this.renderTargetB.texture.name = "MinMaxLevelsB", this.textureNode = ft(this, this.renderTargetA.texture);
  }
  static get type() {
    return "MinMaxLevelsNode";
  }
  getTextureNode() {
    return this.textureNode;
  }
  render(t, e, s) {
    const {
      renderTargetA: o,
      renderTargetB: i,
      mesh: a,
      mipmapSourceNode: r,
      mipmapOffsetNode: u
    } = this;
    this.rendererState = Wi(t, this.rendererState), t.autoClear = !1;
    let c = 0, d = 0, l = 0;
    const h = e / 4;
    for (let m = 2; m <= h; m *= 2, l = (l + 1) % 2) {
      const p = Math.floor(e / m), [y, g] = l === 0 ? [i, o] : [o, i];
      m === 2 ? a.material = this.gatherMaterial : (a.material = this.mipmapMaterial, r.value = y.texture, u.value.set(d, c)), g.viewport.set(c, 0, p, s), t.setRenderTarget(g), a.render(t), l === 1 && (ss.min.set(c, 0), ss.max.set(c + p, s), Gs.set(c, 0), t.copyTextureToTexture(
        i.texture,
        o.texture,
        ss,
        Gs
      )), d = c, c += p;
    }
    ki(t, this.rendererState);
  }
  update({ renderer: t }) {
    if (t == null)
      return;
    const { csmShadowNode: e } = this, s = e.lights[0]?.shadow?.mapSize;
    if (s == null)
      return;
    const { cascades: o } = e, i = o - this.firstCascade.value, a = Math.max(s.x, s.y), r = i * this.epipolarSliceCount.value;
    this.renderTargetA.setSize(a, r), this.renderTargetB.setSize(a, r), this.render(t, a, r);
  }
  setupGatherNode(t) {
    const {
      csmShadowNode: e,
      sliceUVDirectionNode: s,
      shadowDepthNodes: o,
      epipolarSliceCount: i,
      firstCascade: a
    } = this, { cascades: r } = e;
    return Y(() => {
      const u = de(at.y.div(i)).add(a).toConst(), c = at.y.sub(u.sub(a).mul(i)).toConst(), d = s.load(Mt(c, u)).toConst(), l = d.zw.add(d.xy.mul(de(at.x).mul(2))).toConst(), h = w(1).toVar(), m = w(0).toVar();
      for (let p = 0; p < r; ++p)
        D(u.equal(p), () => {
          for (let y = 0; y <= 1; ++y) {
            const g = l.add(d.xy.mul(y)).toConst();
            D(
              Xs(
                g.greaterThanEqual(0).all(),
                g.lessThanEqual(1).all()
              ),
              () => {
                const S = tn(
                  o[p],
                  g
                ).toConst();
                h.assign(Rt(h, S)), m.assign(ot(m, S));
              }
            );
          }
        });
      return U(
        Rt(h.x, h.y, h.z, h.w),
        ot(m.x, m.y, m.z, m.w)
      );
    })();
  }
  setupMipmapNode(t) {
    const { mipmapSourceNode: e, mipmapOffsetNode: s } = this;
    return Y(() => {
      const o = Mt(at).toConst(), i = s.x.add(o.x.sub(s.y).mul(2)).toConst(), a = i.add(1).toConst(), r = e.load(Mt(i, o.y)).toConst(), u = e.load(Mt(a, o.y)).toConst();
      return U(
        Rt(r.x, u.x),
        ot(r.y, u.y)
      );
    })();
  }
  setup(t) {
    const { gatherMaterial: e, mipmapMaterial: s } = this;
    return e.fragmentNode = this.setupGatherNode(t), e.needsUpdate = !0, s.fragmentNode = this.setupMipmapNode(t), s.needsUpdate = !0, this.textureNode;
  }
  dispose() {
    this.renderTargetA.dispose(), this.renderTargetB.dispose(), this.gatherMaterial.dispose(), this.mipmapMaterial.dispose(), this.mesh.geometry.dispose(), super.dispose();
  }
}
const { resetRendererState: qi, restoreRendererState: Zi } = Ot;
class $i extends ne {
  constructor() {
    super(), this.material = new vt(), this.mesh = new Kt(this.material), this.updateType = gt.FRAME, this.material.name = "SliceEndpointsNode", this.mesh.name = "SliceEndpointsNode";
    const t = new Ht(1, 1, {
      depthBuffer: !1,
      // TODO: Still not sure why half-float texture computes incorrectly on
      // mobile devices.
      type: ls,
      format: Bt
    }), e = t.texture;
    e.name = "SliceEndpoints", e.minFilter = X, e.magFilter = X, e.generateMipmaps = !1, this.renderTarget = t, this.textureNode = ft(this, t.texture);
  }
  static get type() {
    return "SliceEndpointsNode";
  }
  getTextureNode() {
    return this.textureNode;
  }
  update({ renderer: t }) {
    t != null && (this.renderTarget.setSize(this.epipolarSliceCount.value, 1), this.rendererState = qi(t, this.rendererState), t.setRenderTarget(this.renderTarget), this.mesh.render(t), Zi(t, this.rendererState));
  }
  setupFragmentNode(t) {
    const {
      maxSliceSampleCount: e,
      epipolarSliceCount: s,
      screenSize: o,
      lightScreenPosition: i,
      isLightOnScreen: a
    } = this, r = W(
      (u) => {
        const c = i.xy.toVar();
        return D(a.not(), () => {
          const d = u.xy.sub(i.xy).toVar(), l = d.length().toConst();
          d.divAssign(l);
          const h = rs(o).toConst(), m = d.xyxy.abs().greaterThan(1e-5).toVar(), p = h.sub(i.xyxy).div(d.xyxy.add(w(le(m)))).toVar();
          m.assign(
            jt(
              m,
              p.lessThan(l.sub(1e-4))
            )
          ), p.assign(
            w(m).mul(p).add(w(le(m)).mul(-Nn))
          );
          const y = ot(
            p.x,
            p.y,
            p.z,
            p.w
          ).toConst();
          c.assign(
            i.xy.add(
              d.mul(y)
            )
          );
        }), c;
      }
    );
    return Y(() => {
      const c = se().toConst().x.sub(P(0.5).div(s)).saturate().toConst(), d = Q(c.mul(4).floor().clamp(0, 3)).toConst(), l = c.mul(4).fract().toConst(), h = Rs(d).equal(Rs(0, 1, 2, 3)).toConst(), m = rs(o).toConst(), p = i.xyxy.sub(m).mul(w(1, 1, -1, -1)).lessThanEqual(0).toConst(), y = w(-1e3, -1e3, -100, -100).toVar();
      return D(jt(p, h).any().not(), () => {
        const g = w(0, l, 1, l.oneMinus()), S = w(l.oneMinus(), 0, l, 1), x = U(
          g.dot(w(h)),
          S.dot(w(h))
        ).toConst(), T = ct(
          m.xy,
          m.zw,
          x
        ).toVar(), C = r(T).toVar();
        D(me(C, o), () => {
          const f = T.sub(C).mul(o.div(2)).length().toConst();
          T.assign(
            C.add(
              T.sub(C).mul(e.div(f).max(1))
            )
          );
        }), y.assign(w(C, T));
      }), y;
    })();
  }
  setup(t) {
    const { material: e } = this;
    return e.fragmentNode = this.setupFragmentNode(t), e.needsUpdate = !0, this.textureNode;
  }
  dispose() {
    this.renderTarget.dispose(), this.material.dispose(), this.mesh.geometry.dispose(), super.dispose();
  }
}
const { resetRendererState: Hi, restoreRendererState: Xi } = Ot;
class Ki extends ne {
  constructor() {
    super(), this.material = new vt(), this.mesh = new Kt(this.material), this.updateType = gt.FRAME, this.material.name = "SliceUVDirection", this.mesh.name = "SliceUVDirection";
    const t = new Ht(1, 1, {
      depthBuffer: !1,
      // TODO: Still not sure why half-float texture computes incorrectly on
      // mobile devices.
      type: ls,
      format: Bt
    }), e = t.texture;
    e.name = "SliceUVDirection", e.minFilter = X, e.magFilter = X, e.generateMipmaps = !1, this.renderTarget = t, this.textureNode = ft(this, t.texture);
  }
  static get type() {
    return "SliceUVDirectionNode";
  }
  getTextureNode() {
    return this.textureNode;
  }
  update({ renderer: t }) {
    if (t == null)
      return;
    const { cascades: e } = this.csmShadowNode;
    this.renderTarget.setSize(
      this.epipolarSliceCount.value,
      e - this.firstCascade.value
    ), this.rendererState = Hi(t, this.rendererState), t.setRenderTarget(this.renderTarget), this.mesh.render(t), Xi(t, this.rendererState);
  }
  setupFragmentNode(t) {
    const {
      sliceEndpointsNode: e,
      screenSize: s,
      camera: o,
      firstCascade: i,
      shadowMapTexelSize: a,
      shadowCascadeArray: r,
      shadowMatrixArray: u
    } = this, { cameraPositionUnit: c } = K(t);
    return Y(() => {
      const d = Q(at.x), l = e.load(Mt(d, 0)).toConst(), h = w(-1e4, -1e4, 0, 0).toVar();
      return D(me(l.xy, s), () => {
        const m = Q(at.y).add(i), p = u.element(m), y = bn(
          l.zw,
          r.element(m).y,
          o
        ).toConst(), g = Ve(
          y,
          p
        ).xy.toConst(), S = Ve(
          c,
          p
        ).xy.toVar(), x = g.sub(S).toVar();
        x.divAssign(
          ot(x.x.abs(), x.y.abs())
        );
        const T = w(0, 0, 1, 1).add(w(0.5, 0.5, -0.5, -0.5).mul(a.xyxy)).toConst();
        D(
          S.xyxy.sub(T).mul(w(1, 1, -1, -1)).lessThan(0).any(),
          () => {
            const C = x.xyxy.abs().greaterThan(1e-6).toVar(), f = T.sub(S.xyxy).div(x.xyxy.add(w(le(C)))).toVar();
            C.assign(
              jt(C, f.greaterThan(0))
            );
            const M = S.yxyx.add(f.mul(x.yxyx)).toConst();
            C.assign(
              jt(
                C,
                jt(
                  M.greaterThanEqual(T.yxyx),
                  M.lessThanEqual(T.wzwz)
                )
              )
            ), f.assign(
              w(C).mul(f).add(w(le(C)).mul(w(Nn)))
            );
            const N = Rt(
              f.x,
              f.y,
              f.z,
              f.w
            ).toConst();
            S.assign(
              S.add(N.mul(x))
            );
          }
        ), x.mulAssign(a), h.assign(w(x, S));
      }), h;
    })();
  }
  setup(t) {
    const { material: e } = this;
    return e.fragmentNode = this.setupFragmentNode(t), e.needsUpdate = !0, this.textureNode;
  }
  dispose() {
    this.renderTarget.dispose(), this.material.dispose(), this.mesh.geometry.dispose(), super.dispose();
  }
}
const { resetRendererState: Qi, restoreRendererState: Yi } = Ot;
class _i extends ne {
  constructor() {
    super(), this.refinementThreshold = O(0.03), this.material = new vt(), this.mesh = new Kt(this.material), this.updateType = gt.FRAME, this.material.name = "UnwarpEpipolar", this.mesh.name = "UnwarpEpipolar";
    const t = new Ht(1, 1, {
      depthBuffer: !1,
      type: Xt,
      format: ms
    }), e = t.texture;
    e.name = "UnwarpEpipolar", e.minFilter = X, e.magFilter = X, e.generateMipmaps = !1, this.renderTarget = t, this.textureNode = ft(this, t.texture);
  }
  static get type() {
    return "UnwarpEpipolarNode";
  }
  getTextureNode() {
    return this.textureNode;
  }
  update({ renderer: t }) {
    if (t == null)
      return;
    const { width: e, height: s } = this.screenSize.value;
    this.renderTarget.setSize(e, s), this.rendererState = Qi(t, this.rendererState), t.setRenderTarget(this.renderTarget), this.mesh.render(t), Yi(t, this.rendererState);
  }
  setupFragmentNode(t) {
    const {
      sliceEndpointsNode: e,
      coordinateNode: s,
      epipolarShadowLengthNode: o,
      refinementThreshold: i,
      viewZUnitNode: a,
      camera: r,
      maxSliceSampleCount: u,
      epipolarSliceCount: c,
      screenSize: d,
      lightScreenPosition: l
    } = this;
    return Y(() => {
      const h = se().toConst(), m = Vi(h).toConst(), p = En(r, h, a).toConst(), y = m.sub(l.xy).normalize().toConst(), g = rs(d).toConst(), S = m.xxyy.sub(g.xzyw).mul(y.yyxx).toConst(), x = S.xyyx.lessThan(S.zzww).toConst(), T = jt(
        x.wxyz,
        le(x.xyzw)
      ).toConst(), C = g.sub(l.xyxy).div(
        y.xyxy.add(w(y.xyxy.abs().lessThan(1e-6)))
      ).toConst(), f = w(T).dot(C).toConst(), M = l.xy.add(y.mul(f)).toConst(), N = w(0, 0.25, 0.5, 0.75).add(
        M.yxyx.sub(g.wxyz).mul(w(-1, 1, 1, -1)).div(g.wzwz.sub(g.yxyx)).saturate().div(4)
      ).toConst(), b = w(T).dot(N).toConst(), A = Rt(
        b.mul(c).floor(),
        c.sub(1)
      ).toConst(), z = A.div(c).add(P(0.5).div(c)).toConst(), L = z.add(P(1).div(c)).fract().toConst(), R = [z, L], V = b.mul(c).sub(A).toConst(), F = [V.oneMinus().toConst(), V], v = U(0).toVar(), Z = P(0).toVar();
      for (let B = 0; B < 2; ++B) {
        const G = e.sample(U(R[B], 0.5)).toConst(), $ = G.zw.sub(G.xy).toConst(), dt = $.dot($).toConst(), tt = m.sub(G.xy).dot($).div(dt.max(1e-8)).toConst(), xt = tt.mul(u.sub(1)).toConst(), it = xt.floor().toConst(), bt = xt.sub(it).toConst(), lt = it.add(0.5).div(u).toConst(), et = U(lt, R[B]).toConst(), mt = U(
          u,
          c
        ).toConst(), St = tn(
          s,
          et.add(U(0.5).div(mt)),
          2
          // Z component
        ).wz, Se = ot(St, ot(p, 1)).toConst(), yt = i.div(
          p.sub(St).abs().div(Se).max(i)
        ).saturate().toVar();
        yt.assign(yt.pow4());
        const ht = U(bt.oneMinus(), bt).mul(yt).mul(F[B]).toVar();
        ht.mulAssign(
          U(
            tt.sub(0.5).abs().lessThan(u.sub(1).reciprocal().add(0.5))
          )
        );
        const oe = ht.y.div(ht.x.add(ht.y).max(1e-3)).toVar();
        oe.divAssign(mt.x);
        const ie = ht.x.add(ht.y).mul(
          o.sample(
            et.add(U(oe, 0))
          ).xy
        ).toConst();
        v.addAssign(ie), Z.addAssign(ht.dot(U(1)));
      }
      return Z.greaterThan(1e-6).select(v.div(Z), 0);
    })();
  }
  setup(t) {
    const { material: e } = this;
    return e.fragmentNode = this.setupFragmentNode(t), e.needsUpdate = !0, this.textureNode;
  }
  dispose() {
    this.renderTarget.dispose(), this.material.dispose(), this.mesh.geometry.dispose(), super.dispose();
  }
}
const ji = /* @__PURE__ */ new nt(), Ji = /* @__PURE__ */ new so(), ns = /* @__PURE__ */ new Qs(), ta = /* @__PURE__ */ new zt();
class ea extends Qt {
  constructor(t, e) {
    super("vec2"), this.resolutionScale = 1, this.autoSampleResolution = !0, this.epipolarSliceCount = O(512, "float"), this.maxSliceSampleCount = O(256, "float"), this.firstCascade = O(0, "uint"), this.screenSize = O("vec2"), this.lightScreenPosition = O("vec4"), this.isLightOnScreen = O("bool"), this.currentCascades = 0, this.updateType = gt.FRAME, this.csmShadowNode = t, this.viewZUnitNode = e, this.sliceEndpointsNode = new $i(), this.coordinateNode = new Ui(), this.sliceUVDirectionNode = new Ki(), this.minMaxLevelsNode = new Gi(), this.epipolarShadowLengthNode = new Oi(), this.unwarpEpipolarNode = new _i();
  }
  static get type() {
    return "ShadowLengthNode";
  }
  customCacheKey() {
    return ps(this.currentCascades);
  }
  update({ renderer: t, material: e }) {
    if (t == null)
      return;
    const { csmShadowNode: s } = this, { camera: o, light: i } = s;
    if (o == null || i == null)
      return;
    rt(i instanceof Ks);
    const { lights: a } = s;
    a.length !== this.currentCascades && (this.currentCascades = a.length, rt(e instanceof vt), e.fragmentNode.needsUpdate = !0, e.needsUpdate = !0);
    const r = ns.multiplyMatrices(
      o.projectionMatrix,
      o.matrixWorldInverse
    ), u = ji.copy(i.position).sub(i.target.position).normalize(), c = Ji.set(u.x, u.y, u.z, 0).applyMatrix4(r), d = c.w;
    let l = c.x / d, h = c.y / d;
    const m = c.z / d, p = Math.hypot(l, h), y = 100;
    if (p > y) {
      const x = y / p;
      l *= x, h *= x;
    }
    this.lightScreenPosition.value.set(l, h, m, d);
    const { width: g, height: S } = t.getDrawingBufferSize(ta).multiplyScalar(this.resolutionScale);
    if (this.isLightOnScreen.value = Math.abs(l) <= 1 - 1 / g && Math.abs(h) <= 1 - 1 / S, this.screenSize.value.set(g, S), this.autoSampleResolution) {
      const x = t.getPixelRatio(), T = go(Math.max(g, S) / x);
      this.epipolarSliceCount.value = T, this.maxSliceSampleCount.value = T >>> 1;
    }
  }
  setup(t) {
    const {
      csmShadowNode: e,
      viewZUnitNode: s,
      sliceEndpointsNode: o,
      coordinateNode: i,
      sliceUVDirectionNode: a,
      minMaxLevelsNode: r,
      epipolarShadowLengthNode: u,
      unwarpEpipolarNode: c,
      epipolarSliceCount: d,
      maxSliceSampleCount: l,
      firstCascade: h,
      screenSize: m,
      lightScreenPosition: p,
      isLightOnScreen: y
    } = this, { camera: g, lights: S } = e;
    if (g == null || S.length === 0)
      return P();
    rt(g instanceof no);
    const { parameters: x } = K(t), { worldToUnit: T } = x, C = O(1024 / 4, "float"), f = O("vec2");
    Jt(() => {
      const v = e.lights[0]?.shadow;
      v != null && (C.value = v.mapSize.x / 4, f.value.set(1 / v.mapSize.x, 1 / v.mapSize.y));
    });
    const { cascades: M } = e, N = zs(
      Array.from({ length: M }, () => new zt()),
      "vec2"
    );
    Jt(() => {
      const v = N.array, Z = Math.min(g.far, e.maxFar), { _cascades: B } = e;
      for (let G = 0; G < v.length; ++G) {
        const $ = B[G];
        v[G].set($.x, $.y).multiplyScalar(Z * T);
      }
    });
    const b = zs(
      Array.from({ length: M }, () => new Qs()),
      "mat4"
    );
    Jt(() => {
      const v = b.array, Z = e.lights, B = 1 / T;
      ns.makeScale(B, B, B);
      for (let G = 0; G < v.length; ++G) {
        const $ = Z[G].shadow?.matrix;
        $ != null && (v[G].copy($), v[G].multiply(ns));
      }
    });
    const A = S.map((v) => (rt(v.shadow?.map?.depthTexture != null), Gt(v.shadow.map.depthTexture)));
    o.epipolarSliceCount = d, o.maxSliceSampleCount = l, o.screenSize = m, o.lightScreenPosition = p, o.isLightOnScreen = y;
    const z = o.getTextureNode();
    i.viewZUnitNode = s, i.sliceEndpointsNode = z, i.camera = g, i.epipolarSliceCount = d, i.maxSliceSampleCount = l, i.screenSize = m;
    const L = i.getTextureNode();
    a.csmShadowNode = e, a.sliceEndpointsNode = z, a.camera = g, a.epipolarSliceCount = d, a.maxSliceSampleCount = l, a.firstCascade = h, a.screenSize = m, a.shadowMapTexelSize = f, a.shadowCascadeArray = N, a.shadowMatrixArray = b;
    const R = a.getTextureNode();
    r.csmShadowNode = e, r.sliceUVDirectionNode = R, r.epipolarSliceCount = d, r.maxSliceSampleCount = l, r.firstCascade = h, r.shadowDepthNodes = A;
    const V = r.getTextureNode();
    u.csmShadowNode = e, u.coordinateNode = L, u.sliceUVDirectionNode = R, u.minMaxLevelsNode = V, u.camera = g, u.epipolarSliceCount = d, u.maxSliceSampleCount = l, u.firstCascade = h, u.maxShadowStep = C, u.shadowCascadeArray = N, u.shadowMatrixArray = b, u.shadowDepthNodes = A;
    const I = u.getTextureNode();
    return c.sliceEndpointsNode = z, c.coordinateNode = L, c.epipolarShadowLengthNode = I, c.viewZUnitNode = s, c.camera = g, c.epipolarSliceCount = d, c.maxSliceSampleCount = l, c.screenSize = m, c.lightScreenPosition = p, c.getTextureNode();
  }
  getDebugInternalTexturesNode(t = se()) {
    const e = this.sliceEndpointsNode.getTextureNode(), s = this.coordinateNode.getTextureNode(), o = this.sliceUVDirectionNode.getTextureNode(), i = this.minMaxLevelsNode.getTextureNode(), a = this.epipolarShadowLengthNode.getTextureNode(), r = w(t, t.sub(0.5)).mul(2).toConst(), u = E(r.x, r.yy.sub(U(0, 0.5)).mul(2)).toConst();
    return t.y.lessThan(0.5).select(
      t.x.lessThan(0.5).select(
        r.y.lessThan(0.5).select(
          e.sample(u.xy),
          o.sample(u.xz)
        ),
        s.sample(r.zy)
      ),
      t.x.lessThan(0.5).select(
        i.sample(r.xw),
        E(a.sample(r.zw).xy, 0)
      )
    ).rgb;
  }
  dispose() {
    this.sliceEndpointsNode.dispose(), this.coordinateNode.dispose(), this.sliceUVDirectionNode.dispose(), this.minMaxLevelsNode.dispose(), this.epipolarShadowLengthNode.dispose(), this.unwarpEpipolarNode.dispose(), super.dispose();
  }
}
const Sa = (...n) => new ea(...n);
class ya extends oo {
  constructor(t) {
    const e = new io();
    e.setAttribute(
      "position",
      new ao(new Float32Array(3), 3)
    ), e.drawRange.count = 1;
    const s = new _s();
    s.name = "ShadowLengthSampleLocations", s.depthTest = !1, s.depthWrite = !1;
    const { maxSliceSampleCount: o, epipolarSliceCount: i, coordinateNode: a } = t, r = Ls.mod(Q(o)), u = Ls.div(Q(o)), c = a.getTextureNode().load(Mt(r, u)), d = me(c.xy, $s).toUint().toVertexStage();
    s.vertexNode = d.select(
      w(c.xy, 0, 1),
      w(2, 2, 0, 1)
    ), s.colorNode = d.select(E(1, 0, 0), E()), super(e, s), this.count = o.value * i.value, this.frustumCulled = !1;
  }
  dispose() {
    this.geometry.dispose(), this.material.dispose();
  }
}
class sa extends Qt {
  constructor(t = 64) {
    super("vec3"), this.distanceThreshold = 1e3, this.angularThreshold = Ys(0.1), this.material = new vt(), this.mesh = new ro(new xo(), this.material), this.updateBeforeType = gt.FRAME, this.material.name = "SkyEnvironment", this.skyNode = vn(), this.skyNode.showSun = !1, this.skyNode.showMoon = !1, this.skyNode.showStars = !1, this.skyNode.useContextCamera = !1, this.renderTarget = new co(t, {
      depthBuffer: !1,
      type: Xt,
      format: Bt
    }), this.cubeCamera = new uo(0.1, 1e3, this.renderTarget);
  }
  static get type() {
    return "SkyEnvironmentNode";
  }
  updateBefore({ renderer: t }) {
    t == null || this.version === this.currentVersion || (this.currentVersion = this.version, this.cubeCamera.update(t, this.mesh));
  }
  setup(t) {
    const e = K(t), { camera: s } = e;
    if (s != null) {
      const r = new nt(), u = new nt();
      Jt(() => {
        r.copy(s.position).divideScalar(this.distanceThreshold).round(), u.equals(r) || (u.copy(r), this.needsUpdate = !0);
      });
    }
    const o = e.sunDirectionECEF.value.clone();
    Jt(() => {
      const { value: r } = e.sunDirectionECEF;
      o.angleTo(r) > this.angularThreshold && (o.copy(r), this.needsUpdate = !0);
    });
    const i = e.moonDirectionECEF.value.clone();
    Jt(() => {
      const { value: r } = e.moonDirectionECEF;
      i.angleTo(r) > this.angularThreshold && (i.copy(r), this.needsUpdate = !0);
    });
    const a = () => {
      this.needsUpdate = !0;
    };
    return e.lutNode.addEventListener(
      // @ts-expect-error Cannot specify the events map
      "update",
      a
    ), this.removeLUTUpdateListener?.(), this.removeLUTUpdateListener = () => {
      e.lutNode.removeEventListener(
        // @ts-expect-error Cannot specify the events map
        "update",
        a
      );
    }, this.material.vertexNode = w(ds.xy, 0, 1), this.material.fragmentNode = this.skyNode, Kn(this.renderTarget.texture);
  }
  dispose() {
    this.removeLUTUpdateListener?.(), this.renderTarget.dispose(), this.skyNode.dispose(), this.material.dispose(), this.mesh.geometry.dispose(), super.dispose();
  }
}
const Ta = (...n) => new sa(...n);
export {
  Ri as AerialPerspectiveNode,
  Sn as AtmosphereContext,
  da as AtmosphereContextNode,
  ni as AtmosphereLUTNode,
  ga as AtmosphereLight,
  xa as AtmosphereLightNode,
  Ie as AtmosphereParameters,
  ce as DensityProfile,
  Lt as DensityProfileLayer,
  yi as MoonNode,
  ea as ShadowLengthNode,
  ya as ShadowLengthSampleLocations,
  sa as SkyEnvironmentNode,
  fn as SkyNode,
  bi as StarsNode,
  Ei as SunNode,
  pa as aerialPerspective,
  K as getAtmosphereContext,
  pi as getIndirectIlluminance,
  Os as getIndirectLuminance,
  Ws as getIndirectLuminanceToPoint,
  hi as getSolarLuminance,
  ks as getSplitIlluminance,
  ma as getSplitScalarIlluminance,
  Sa as shadowLength,
  vn as sky,
  ha as skyBackground,
  Ta as skyEnvironment,
  la as viewZUnit
};
