import * as THREE from 'three';
import { CONFIG } from '../utils/config.js';
import { CLEAR_COLOR, AMBIENT_INTENSITY, DIR_LIGHT_INTENSITY, DIR_LIGHT_POSITION } from '../constants/rendering.js';
import { DEFAULT_FOV, DEFAULT_NEAR, DEFAULT_FAR, REALWORLD_START_ALTITUDE } from '../constants/camera.js';

export async function createRenderer() {
  const renderer = new THREE.WebGPURenderer({
    // Anti-aliasing is temporal (TRAA, see ScenePipeline); MSAA would be wasted on it
    antialias: false,
    powerPreference: 'high-performance',
    trackTimestamp: true,
    // Near = 1 m and far = 10 000 km: a standard depth buffer runs out of
    // precision on distant ridges, reversed depth spreads it evenly.
    reversedDepthBuffer: true,
  });
  await renderer.init();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.maxPixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(CLEAR_COLOR);
  document.getElementById('canvas-container').appendChild(renderer.domElement);
  return renderer;
}

export function createScene() {
  const scene = new THREE.Scene();
  const ambientLight = new THREE.AmbientLight(0xffffff, AMBIENT_INTENSITY);
  scene.add(ambientLight);
  const dirLight = new THREE.DirectionalLight(0xffffff, DIR_LIGHT_INTENSITY);
  dirLight.position.set(...DIR_LIGHT_POSITION);
  scene.add(dirLight);
  // Sky light comes from scene.environment, set by AtmosphericSky
  return { scene, ambientLight, dirLight };
}

export function createCamera() {
  const camera = new THREE.PerspectiveCamera(
    DEFAULT_FOV,
    window.innerWidth / window.innerHeight,
    DEFAULT_NEAR,
    DEFAULT_FAR,
  );
  camera.position.set(0, REALWORLD_START_ALTITUDE, 0);
  return camera;
}

export function setupResizeHandler(camera, renderer, hud) {
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    hud.resize(window.innerWidth, window.innerHeight);
  });
}
