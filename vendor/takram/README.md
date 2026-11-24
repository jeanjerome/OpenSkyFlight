# takram three-geospatial (WebGPU builds)

Local copy of the WebGPU/TSL entry points of two packages from
[takram-design-engineering/three-geospatial](https://github.com/takram-design-engineering/three-geospatial)
(MIT, see `LICENSE`), loaded through the import map of `index.html`:

| Package | Version | Files |
|---|---|---|
| `@takram/three-atmosphere` | 0.19.1 | `build/webgpu.js`, `build/shared2.js`, `assets/stars.bin` |
| `@takram/three-geospatial` | 0.9.1 | `build/index.js`, `build/webgpu.js`, `build/shared*.js`, `assets/stbn.bin` |

The files are the published npm builds, with source map comments removed and the
following changes.

## Changes to the published builds

**three r185+ `struct()`** — from r185, `struct()` returns a proxy that forwards
property reads to its `StructTypeNode` instead of exposing it on `.layout`. The
published builds read `.layout.name` at import time and fail to load.
Upstream issue #111, pull request #118 (not merged).

- `three-atmosphere/build/webgpu.js`: `X.layout.name` → `(X.layout?.name ?? X.name)`.
- `three-geospatial/build/webgpu.js` (`FnLayout` type resolution): a struct is
  recognised by reading `isStructTypeNode` through the proxy before the r184 path.

**Import map with `three.webgpu.js` as `three`** — the builds expect `three` to be
the WebGL build (`three.module.js`); the import map serves the WebGPU build under
that name, which lacks the WebGL classes, and does not map `three/src/`.

- `three-geospatial/build/index.js`: the `WebGLRenderer` import is removed;
  `isFloatLinearSupported` tests `renderer.isWebGLRenderer` instead of `instanceof`.
- `three-atmosphere/build/webgpu.js`: `WebGLCubeRenderTarget` → `CubeRenderTarget`.
- Both `webgpu.js`: `hash` and `hashString` come from the `NodeUtils` namespace of
  `three/webgpu` instead of `three/src/nodes/core/NodeUtils.js`.

**Local assets** — the default URLs of the star catalogue and of the
spatio-temporal blue noise pointed to `media.githubusercontent.com`; they resolve
next to the module instead (`new URL('../assets/…', import.meta.url)`), in
`three-atmosphere/build/shared2.js` and `three-geospatial/build/shared2.js`.

## Updating

Download the new versions (`npm pack @takram/three-atmosphere @takram/three-geospatial`),
copy the same files, re-apply the changes above where upstream has not, and check
that `three-atmosphere/build/webgpu.js` imports nothing beyond `three`, `three/tsl`,
`three/webgpu`, `@takram/three-geospatial`, `@takram/three-geospatial/webgpu` and
`./shared2.js`. The star and noise assets come from the npm package
(`assets/stars.bin`) and from the repository (`packages/core/assets/stbn.bin`).
