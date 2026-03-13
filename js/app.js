import * as THREE from 'three';
import { CONFIG, onChange } from './utils/config.js';
import ChunkManager from './terrain/ChunkManager.js';
import GeoTerrainManager from './terrain/GeoTerrainManager.js';
import FPSController from './camera/FPSController.js';
import ControlPanel from './ui/ControlPanel.js';
import HUD from './ui/HUD.js';

// --- Renderer ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.maxPixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x0a0a1a);
document.getElementById('canvas-container').appendChild(renderer.domElement);

// --- Scene ---
const scene = new THREE.Scene();
scene.fog = null;

// --- Lighting ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(1, 0.5, 0.8); // sun low angle for visible relief
scene.add(dirLight);

// --- Camera ---
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 1, 100000);
camera.position.set(0, 640, 0);

// --- Water plane ---
function createWaterPlane() {
  const geo = new THREE.PlaneGeometry(20000, 20000, 80, 80);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x1a3a5c,
    wireframe: CONFIG.wireframe,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = CONFIG.maxHeight * CONFIG.waterLevel;
  return mesh;
}

let waterPlane = createWaterPlane();
scene.add(waterPlane);

// --- Terrain Managers ---
const chunkManager = new ChunkManager(scene);
const geoTerrainManager = new GeoTerrainManager(scene, renderer);

function getActiveManager() {
  return CONFIG.terrainMode === 'realworld' ? geoTerrainManager : chunkManager;
}

// Initialize realworld if that's the default mode
if (CONFIG.terrainMode === 'realworld') {
  geoTerrainManager.init(CONFIG.lat, CONFIG.lon);
  camera.position.set(0, 6000, 0); // Start above terrain (meters)
}

// --- FPS Controller ---
const fpsController = new FPSController(camera, renderer.domElement);

// --- HUD ---
const hudCanvas = document.getElementById('hud');
const hud = new HUD(hudCanvas);

// --- Raycaster for ground elevation (procedural mode) ---
const groundRaycaster = new THREE.Raycaster();
const downDirection = new THREE.Vector3(0, -1, 0);
let groundElevation = 0;

// --- Control Panel ---
function regenerate() {
  if (CONFIG.terrainMode === 'realworld') {
    geoTerrainManager.reinit();
    camera.position.set(0, 6000, 0);
  } else {
    chunkManager.reinit();
  }

  scene.remove(waterPlane);
  waterPlane.geometry.dispose();
  waterPlane.material.dispose();
  waterPlane = createWaterPlane();
  waterPlane.visible = CONFIG.terrainMode === 'procedural';
  scene.add(waterPlane);
}

const controlPanel = new ControlPanel(regenerate);

// Update water level when maxHeight changes
onChange((key, value) => {
  if (key === 'maxHeight') {
    waterPlane.position.y = CONFIG.maxHeight * CONFIG.waterLevel;
  }
  if (key === 'wireframe') {
    waterPlane.material.wireframe = CONFIG.wireframe;
  }
  if (key === 'viewDistance') {
    // no-op: fog removed
  }
  if (key === 'showHud') {
    hudCanvas.style.display = value ? 'block' : 'none';
  }
  if (key === 'terrainMode') {
    waterPlane.visible = CONFIG.terrainMode === 'procedural';
    if (CONFIG.terrainMode === 'realworld') {
      geoTerrainManager.init(CONFIG.lat, CONFIG.lon);
      camera.position.set(0, 6000, 0);
    } else {
      geoTerrainManager.dispose();
      camera.position.set(0, 640, 0);
    }
  }
});


// --- Stats overlay ---
const statsEl = document.getElementById('stats');
let frameCount = 0;
let lastFPSTime = performance.now();

// --- Resize ---
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  hud.resize(window.innerWidth, window.innerHeight);
});

// --- Render loop ---
let prevTime = performance.now();

function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();
  const dt = Math.min((now - prevTime) / 1000, 0.1);
  prevTime = now;

  fpsController.update(dt);

  const activeManager = getActiveManager();
  activeManager.update(camera.position);

  if (CONFIG.terrainMode === 'realworld') {
    // Far plane for geo-three — large value since geo-three handles LOD
    const farNeeded = 1e7;
    if (Math.abs(camera.far - farNeeded) > 100) {
      camera.far = farNeeded;
      camera.near = 1;
      camera.updateProjectionMatrix();
    }

    // AGL from elevation lookup
    groundElevation = geoTerrainManager.getGroundElevation(camera.position.x, camera.position.z);
  } else {
    // Adapt far/near plane to effective view distance so distant tiles stay visible
    const farNeeded = chunkManager._effectiveViewDistance * CONFIG.chunkSize * 1.5;
    if (Math.abs(camera.far - farNeeded) > 100) {
      camera.far = Math.max(5000, farNeeded);
      camera.near = Math.max(1, farNeeded * 0.0001);
      camera.updateProjectionMatrix();
    }

    // Raycast down to measure ground elevation
    groundRaycaster.set(camera.position, downDirection);
    const meshes = chunkManager.getMeshes();
    const hits = groundRaycaster.intersectObjects(meshes, false);
    groundElevation = hits.length > 0 ? hits[0].point.y : 0;
  }

  // Keep water plane centered on camera XZ
  waterPlane.position.x = camera.position.x;
  waterPlane.position.z = camera.position.z;

  renderer.render(scene, camera);

  // Update HUD after render
  hud.update(camera, groundElevation);

  // FPS counter
  frameCount++;
  if (now - lastFPSTime >= 500) {
    const fps = Math.round(frameCount / ((now - lastFPSTime) / 1000));
    const info = renderer.info;
    statsEl.textContent = `${fps} FPS | ${info.render.triangles} tris | ${info.memory.geometries} geos`;
    frameCount = 0;
    lastFPSTime = now;
  }
}

animate();
