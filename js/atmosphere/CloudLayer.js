import * as THREE from 'three';
import { CONFIG, onChange } from '../utils/config.js';
import Logger from '../utils/Logger.js';

// Sprint 4.2: Pre-compute noise texture on CPU instead of 5-octave FBM per pixel
function generateNoiseTexture(size) {
  const data = new Uint8Array(size * size);

  // Simple hash-based noise matching the original shader
  function hash(x, y) {
    return ((Math.sin(x * 127.1 + y * 311.7) * 43758.5453123) % 1 + 1) % 1;
  }

  function noise(px, py) {
    const ix = Math.floor(px);
    const iy = Math.floor(py);
    const fx = px - ix;
    const fy = py - iy;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = hash(ix, iy);
    const b = hash(ix + 1, iy);
    const c = hash(ix, iy + 1);
    const d = hash(ix + 1, iy + 1);
    return a * (1 - sx) * (1 - sy) + b * sx * (1 - sy) + c * (1 - sx) * sy + d * sx * sy;
  }

  function fbm(px, py) {
    let value = 0;
    let amplitude = 0.5;
    for (let i = 0; i < 5; i++) {
      value += amplitude * noise(px, py);
      px *= 2;
      py *= 2;
      amplitude *= 0.5;
    }
    return value;
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * 8.0;
      const v = (y / size) * 8.0;
      const n = fbm(u, v);
      data[y * size + x] = Math.round(n * 255);
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RedFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

const CLOUD_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// Sprint 4.2: simplified shader — single texture fetch instead of 5-octave FBM
const CLOUD_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
uniform sampler2D uNoiseMap;
varying vec2 vUv;

void main() {
  vec2 uv = vUv + uTime * vec2(0.0025, 0.00125);
  float n = texture2D(uNoiseMap, uv).r;
  float cloud = smoothstep(0.4, 0.7, n);
  if (cloud < 0.01) discard;
  gl_FragColor = vec4(1.0, 1.0, 1.0, cloud * uOpacity);
}
`;

export default class CloudLayer {
  constructor(scene) {
    this.scene = scene;
    this.mesh = null;
    this._noiseTexture = generateNoiseTexture(512);

    this._buildMesh();

    this._unsub = onChange((key) => {
      if (key === 'showClouds') {
        if (this.mesh) this.mesh.visible = CONFIG.showClouds;
      }
      if (key === 'cloudAltitude') {
        if (this.mesh) this.mesh.position.y = CONFIG.cloudAltitude;
      }
      if (key === 'cloudOpacity') {
        if (this.mesh) this.mesh.material.uniforms.uOpacity.value = CONFIG.cloudOpacity;
      }
      if (key === 'terrainMode') {
        this._rebuildGeometry();
      }
    });

    Logger.info('CloudLayer', 'Cloud layer initialized (pre-computed noise texture)');
  }

  _buildMesh() {
    const size = CONFIG.terrainMode === 'realworld' ? 80000 : 8000;
    const geo = new THREE.PlaneGeometry(size, size, 1, 1);
    const mat = new THREE.ShaderMaterial({
      vertexShader: CLOUD_VERTEX,
      fragmentShader: CLOUD_FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: CONFIG.cloudOpacity },
        uNoiseMap: { value: this._noiseTexture },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = CONFIG.cloudAltitude;
    this.mesh.visible = CONFIG.showClouds;
    this.mesh.renderOrder = 100;
    this.scene.add(this.mesh);
  }

  _rebuildGeometry() {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
    }
    this._buildMesh();
    Logger.debug('CloudLayer', 'Geometry rebuilt for mode', CONFIG.terrainMode);
  }

  update(dt, cameraPosition, camera) {
    if (!this.mesh) return;

    // Sprint 3.3: hide cloud layer when camera is above clouds and looking down
    if (CONFIG.showClouds && camera) {
      const aboveClouds = cameraPosition.y > CONFIG.cloudAltitude;
      const lookingDown = camera.rotation.x < -0.1; // pitch < -6°
      this.mesh.visible = !(aboveClouds && lookingDown);
    }

    if (!this.mesh.visible) return;
    this.mesh.material.uniforms.uTime.value += dt;
    // Track camera XZ
    this.mesh.position.x = cameraPosition.x;
    this.mesh.position.z = cameraPosition.z;
  }
}
