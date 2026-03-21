import * as THREE from 'three';
import { NodeMaterial } from 'three';
import { uniform, texture, uv, smoothstep, float, vec2, vec4 } from 'three/tsl';
import { CONFIG, onChange } from '../utils/config.js';
import Logger from '../utils/Logger.js';

// Sprint 4.2: Pre-compute noise texture on CPU instead of 5-octave FBM per pixel
function generateNoiseTexture(size) {
  const data = new Uint8Array(size * size);

  // Simple hash-based noise matching the original shader
  function hash(x, y) {
    return (((Math.sin(x * 127.1 + y * 311.7) * 43758.5453123) % 1) + 1) % 1;
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

  const tex = new THREE.DataTexture(data, size, size, THREE.RedFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export default class CloudLayer {
  constructor(scene) {
    this.scene = scene;
    this.mesh = null;
    this._noiseTexture = generateNoiseTexture(512);

    // TSL uniforms
    this._uTime = uniform(float(0));
    this._uOpacity = uniform(float(CONFIG.cloudOpacity));

    this._buildMesh();

    this._unsub = onChange((key) => {
      if (key === 'showClouds') {
        if (this.mesh) this.mesh.visible = CONFIG.showClouds;
      }
      if (key === 'cloudAltitude') {
        if (this.mesh) this.mesh.position.y = CONFIG.cloudAltitude;
      }
      if (key === 'cloudOpacity') {
        this._uOpacity.value = CONFIG.cloudOpacity;
      }
    });

    Logger.info('CloudLayer', 'Cloud layer initialized (TSL + pre-computed noise texture)');
  }

  _buildMesh() {
    const size = 80000;
    const geo = new THREE.PlaneGeometry(size, size, 1, 1);

    const uvOffset = uv().add(this._uTime.mul(vec2(0.0025, 0.00125)));
    const n = texture(this._noiseTexture, uvOffset).r;
    const cloud = smoothstep(float(0.4), float(0.7), n);

    const mat = new NodeMaterial();
    mat.transparent = true;
    mat.depthWrite = false;
    mat.side = THREE.DoubleSide;
    mat.colorNode = vec4(1, 1, 1, 1);
    mat.opacityNode = cloud.mul(this._uOpacity);

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = CONFIG.cloudAltitude;
    this.mesh.visible = CONFIG.showClouds;
    this.mesh.renderOrder = 100;
    this.scene.add(this.mesh);
  }

  update(dt, cameraPosition, pitch) {
    if (!this.mesh) return;

    // Sprint 3.3: hide cloud layer when camera is above clouds and looking down
    if (CONFIG.showClouds) {
      const aboveClouds = cameraPosition.y > CONFIG.cloudAltitude;
      const lookingDown = pitch < -0.1; // pitch < -6°
      this.mesh.visible = !(aboveClouds && lookingDown);
    }

    if (!this.mesh.visible) return;
    this._uTime.value += dt;
    // Track camera XZ
    this.mesh.position.x = cameraPosition.x;
    this.mesh.position.z = cameraPosition.z;
  }
}
