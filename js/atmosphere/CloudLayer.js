import * as THREE from 'three';
import { CONFIG, onChange } from '../utils/config.js';
import Logger from '../utils/Logger.js';

const CLOUD_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const CLOUD_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
varying vec2 vUv;

// Simple hash-based noise (no texture needed)
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec2 uv = vUv * 8.0 + uTime * vec2(0.02, 0.01);
  float n = fbm(uv);
  float cloud = smoothstep(0.4, 0.7, n);
  if (cloud < 0.01) discard;
  gl_FragColor = vec4(1.0, 1.0, 1.0, cloud * uOpacity);
}
`;

export default class CloudLayer {
  constructor(scene) {
    this.scene = scene;
    this.mesh = null;

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

    Logger.info('CloudLayer', 'Cloud layer initialized');
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
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = CONFIG.cloudAltitude;
    this.mesh.visible = CONFIG.showClouds;
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

  update(dt, cameraPosition) {
    if (!this.mesh || !this.mesh.visible) return;
    this.mesh.material.uniforms.uTime.value += dt;
    // Track camera XZ
    this.mesh.position.x = cameraPosition.x;
    this.mesh.position.z = cameraPosition.z;
  }
}
