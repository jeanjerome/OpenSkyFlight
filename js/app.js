import * as THREE from 'three';
import { CONFIG, onChange } from './utils/config.js';
import ChunkManager from './terrain/ChunkManager.js';
import GeoTerrainManager from './terrain/GeoTerrainManager.js';
import FPSController from './camera/FPSController.js';
import ControlPanel from './ui/ControlPanel.js';
import HUD from './ui/HUD.js';
import Minimap from './ui/Minimap.js';
import Logger from './utils/Logger.js';
import AtmosphericSky from './atmosphere/AtmosphericSky.js';
import CloudLayer from './atmosphere/CloudLayer.js';
import BenchmarkRunner from './benchmark/BenchmarkRunner.js';
import BenchmarkComparator from './benchmark/BenchmarkComparator.js';
import GPUTimer from './benchmark/GPUTimer.js';

async function initApp() {
  // --- Renderer: WebGPURenderer with automatic WebGL2 fallback ---
  const renderer = new THREE.WebGPURenderer({
    antialias: true,
    powerPreference: 'high-performance',
    trackTimestamp: true,
  });
  await renderer.init();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.maxPixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x0a0a1a);
  document.getElementById('canvas-container').appendChild(renderer.domElement);

  // --- Scene ---
  const scene = new THREE.Scene();

  // --- Lighting ---
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
  scene.add(ambientLight);
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
  dirLight.position.set(1, 0.5, 0.8);
  scene.add(dirLight);

  // --- Atmospheric sky & clouds ---
  const atmosphericSky = new AtmosphericSky(scene, dirLight, ambientLight);
  const cloudLayer = new CloudLayer(scene);

  // --- Camera ---
  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 1, 100000);
  camera.position.set(0, 640, 0);

  // --- Water plane (Sprint 2.1: reduced from 80x80 to 1x1 segments) ---
  function createWaterPlane() {
    const geo = new THREE.PlaneGeometry(20000, 20000, 1, 1);
    const mat = new THREE.MeshBasicNodeMaterial({
      color: 0x1a3a5c,
      wireframe: CONFIG.wireframe,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = CONFIG.maxHeight * CONFIG.waterLevel;
    mesh.renderOrder = 99;
    return mesh;
  }

  let waterPlane = createWaterPlane();
  scene.add(waterPlane);

  // --- Set render order on cloud layer ---
  cloudLayer.mesh.renderOrder = 100;

  // --- Terrain Managers ---
  const chunkManager = new ChunkManager(scene);
  chunkManager.textureProvider.setRenderer(renderer);
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

  // --- Benchmark ---
  const benchmarkRunner = new BenchmarkRunner();

  // --- GPU Timer (Sprint 4.3) ---
  const gpuTimer = new GPUTimer(renderer);

  // --- HUD ---
  const hudCanvas = document.getElementById('hud');
  const hud = new HUD(hudCanvas);

  // --- Minimap ---
  const minimapCanvas = document.getElementById('minimap');
  const minimap = new Minimap(minimapCanvas, geoTerrainManager);

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

  // --- Logger panel init ---
  Logger.bindPanel(document.getElementById('log-panel'));
  document.getElementById('log-panel-clear').addEventListener('click', () => Logger.clear());
  Logger.info('App', 'Application started');

  // Update water level when maxHeight changes
  onChange((key, value) => {
    if (key === 'maxHeight') {
      waterPlane.position.y = CONFIG.maxHeight * CONFIG.waterLevel;
    }
    if (key === 'wireframe') {
      waterPlane.material.wireframe = CONFIG.wireframe;
    }
    if (key === 'viewDistance') {
      // handled by terrain managers
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


  // --- Debug tile toggle (X key) ---
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyX' && CONFIG.terrainMode === 'realworld') {
      const active = geoTerrainManager.toggleDebug();
      Logger.info('App', `Debug tiles ${active ? 'enabled' : 'disabled'}`);
    }
    if (e.code === 'KeyH' && CONFIG.terrainMode === 'realworld') {
      const active = geoTerrainManager.toggleHiRes();
      Logger.info('App', `Hi-res mode (zoom 18) ${active ? 'enabled' : 'disabled'}`);
    }
    if (e.code === 'KeyI') {
      const active = hud.toggleStats();
      document.getElementById('help').style.display = active ? 'block' : 'none';
      Logger.info('App', `Info ${active ? 'enabled' : 'disabled'}`);
    }
    if (e.code === 'KeyB') {
      if (e.shiftKey) {
        // Shift+B: store last completed benchmark as baseline
        if (!benchmarkRunner._lastReport) {
          Logger.warn('App', 'No completed benchmark — run one first before storing baseline');
          return;
        }
        BenchmarkComparator.storeBaseline(benchmarkRunner._lastReport);
        return;
      }
      if (benchmarkRunner.isRunning()) {
        benchmarkRunner.stop(fpsController, renderer);
      } else {
        const getGround = (x, z) => {
          if (CONFIG.terrainMode === 'realworld') {
            return geoTerrainManager.getGroundElevation(x, z);
          }
          groundRaycaster.set(new THREE.Vector3(x, 10000, z), downDirection);
          const hits = groundRaycaster.intersectObjects(chunkManager.getMeshes(), false);
          return hits.length > 0 ? hits[0].point.y : 0;
        };
        benchmarkRunner.start(fpsController, camera, getGround, gpuTimer);
      }
    }
  });

  // --- Stats ---
  let frameCount = 0;
  let lastFPSTime = performance.now();

  // --- Resize ---
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    hud.resize(window.innerWidth, window.innerHeight);
  });

  // --- Dynamic Resolution Scaling (Sprint 4.1) ---
  const basePixelRatio = Math.min(window.devicePixelRatio, CONFIG.maxPixelRatio);
  let currentPixelRatio = basePixelRatio;
  const ftRingBuffer = new Float32Array(30);
  let ftRingIndex = 0;
  let ftRingFilled = false;

  function updateAdaptiveQuality(frameTimeMs) {
    ftRingBuffer[ftRingIndex] = frameTimeMs;
    ftRingIndex = (ftRingIndex + 1) % 30;
    if (ftRingIndex === 0) ftRingFilled = true;

    const count = ftRingFilled ? 30 : ftRingIndex;
    if (count < 10) return; // wait for enough samples

    let sum = 0;
    for (let i = 0; i < count; i++) sum += ftRingBuffer[i];
    const avgFt = sum / count;

    let targetRatio = currentPixelRatio;
    if (avgFt > 20) {
      // Scale down gradually
      targetRatio = Math.max(0.5, currentPixelRatio - 0.05);
    } else if (avgFt < 12) {
      // Scale up gradually
      targetRatio = Math.min(basePixelRatio, currentPixelRatio + 0.02);
    }

    if (Math.abs(targetRatio - currentPixelRatio) > 0.01) {
      currentPixelRatio = targetRatio;
      renderer.setPixelRatio(currentPixelRatio);
    }
  }

  // --- Render loop ---
  let prevTime = performance.now();

  function animate() {
    requestAnimationFrame(animate);

    const now = performance.now();
    const dt = Math.min((now - prevTime) / 1000, 0.1);
    const frameTimeMs = now - prevTime;
    prevTime = now;

    fpsController.update(dt);
    // Advance camera path BEFORE render (so camera is positioned for this frame)
    benchmarkRunner.tickPath(dt, camera, fpsController, renderer);
    cloudLayer.update(dt, camera.position, camera);

    // Get subsystem timer (only active during benchmark recording)
    const timer = benchmarkRunner.getSubsystemTimer();

    if (timer) timer.begin('terrain');
    const activeManager = getActiveManager();
    activeManager.update(camera.position);
    if (timer) timer.end('terrain');

    if (CONFIG.terrainMode === 'realworld') {
      // Far plane for geo-three — large value since geo-three handles LOD
      const farNeeded = 1e7;
      if (Math.abs(camera.far - farNeeded) > 100) {
        camera.far = farNeeded;
        camera.near = 1;
        camera.updateProjectionMatrix();
        Logger.debug('App', 'Realworld clip planes updated', { near: 1, far: farNeeded });
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
        Logger.debug('App', 'Clip planes updated', { near: camera.near, far: camera.far });
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

    if (timer) timer.begin('render');
    gpuTimer.beginFrame();
    renderer.info.reset();
    renderer.render(scene, camera);
    gpuTimer.endFrame();
    if (timer) timer.end('render');

    // Update HUD after render
    if (timer) timer.begin('hud');
    hud.update(camera, groundElevation, benchmarkRunner, dt);
    if (timer) timer.end('hud');

    // Update minimap
    if (timer) timer.begin('minimap');
    minimap.update(camera);
    if (timer) timer.end('minimap');

    // Record metrics AFTER render so renderer.info reflects this frame
    benchmarkRunner.recordMetrics(renderer);

    // Dynamic resolution scaling (Sprint 4.1)
    updateAdaptiveQuality(frameTimeMs);

    // FPS counter
    frameCount++;
    if (now - lastFPSTime >= 500) {
      const fps = Math.round(frameCount / ((now - lastFPSTime) / 1000));
      const tris = renderer.info.render.triangles;
      const formattedTris = tris >= 1e9 ? (tris / 1e9).toFixed(1) + 'B'
        : tris >= 1e6 ? (tris / 1e6).toFixed(1) + 'M'
        : tris >= 1e3 ? (tris / 1e3).toFixed(1) + 'K'
        : tris;
      hud.setStats(`${fps} FPS | ${formattedTris} triangles`);
      frameCount = 0;
      lastFPSTime = now;
    }
  }

  animate();
}

initApp().catch((err) => {
  console.error('Failed to initialize application:', err);
});
