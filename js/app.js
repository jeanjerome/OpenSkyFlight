import * as THREE from 'three';
import { CONFIG, onChange, update } from './utils/config.js';
import { loadSettings, isDevMode } from './utils/settingsStore.js';
import { bindQualitySettings } from './utils/qualityPresets.js';
import {
  CLOUD_RENDER_ORDER,
  REALWORLD_FAR_PLANE,
  CLIP_PLANE_EPSILON,
} from './constants/rendering.js';
import { REALWORLD_START_ALTITUDE, DEFAULT_NEAR, MAX_ROLL, ROLL_SENSITIVITY, ROLL_DAMP_SPEED } from './constants/camera.js';
import { MAX_DELTA_TIME } from './constants/physics.js';
import { createRenderer, createScene, createCamera, setupResizeHandler } from './scene/SceneSetup.js';
import AdaptiveQualityManager from './rendering/AdaptiveQualityManager.js';
import ScenePipeline from './rendering/ScenePipeline.js';
import InputManager from './input/InputManager.js';
import GeoTerrainManager from './terrain/GeoTerrainManager.js';
import FlightController from './camera/FlightController.js';
import ControlPanel from './ui/ControlPanel.js';
import HUD from './ui/HUD.js';
import Minimap from './ui/Minimap.js';
import Logger from './utils/Logger.js';
import { showNotification } from './ui/Notification.js';
import AtmosphericSky from './atmosphere/AtmosphericSky.js';
import { REFERENCE_VIEWS } from './constants/referenceViews.js';
import CloudLayer from './atmosphere/CloudLayer.js';
import BenchmarkRunner from './benchmark/BenchmarkRunner.js';
import BenchmarkComparator from './benchmark/BenchmarkComparator.js';
import GPUTimer from './benchmark/GPUTimer.js';
import AircraftManager from './aircraft/AircraftManager.js';
import ChaseCameraController from './camera/ChaseCameraController.js';
import FlightPlanRecorder from './flightplan/FlightPlanRecorder.js';
import Stats from 'stats.js';

async function initApp() {
  // --- Settings: stored, then URL, then the technical values of the graphics settings ---
  bindQualitySettings(loadSettings());
  const devMode = isDevMode();

  // --- Core scene ---
  const renderer = await createRenderer();
  const { scene, dirLight, ambientLight } = createScene();
  const camera = createCamera();

  // --- Atmosphere ---
  // Drives the sky dome, fog, tone mapping and the scene lights
  // Drives the sky, the sun and the sky light from the configuration
  const scenePipeline = new ScenePipeline(renderer, scene, camera);
  new AtmosphericSky(scene, renderer, { dirLight, ambientLight }, scenePipeline);
  const cloudLayer = new CloudLayer(scene);
  cloudLayer.mesh.renderOrder = CLOUD_RENDER_ORDER;

  // --- Terrain ---
  const geoTerrainManager = new GeoTerrainManager(scene, renderer);
  geoTerrainManager.init(CONFIG.lat, CONFIG.lon);

  // --- Controllers ---
  const flightController = new FlightController(camera, renderer.domElement);
  const chaseCameraController = new ChaseCameraController();
  const _qRoll = new THREE.Quaternion();
  const _axisZ = new THREE.Vector3(0, 0, 1);
  const _autopilotEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  const _autopilotQuat = new THREE.Quaternion();
  const aircraftManager = new AircraftManager(scene);
  aircraftManager
    .load('assets/models/rafale/Rafale.gltf')
    .catch((err) => {
      Logger.warn('App', 'Failed to load Rafale model: ' + err.message);
    });

  // --- Systems ---
  const benchmarkRunner = new BenchmarkRunner();
  const gpuTimer = new GPUTimer(renderer);
  const adaptiveQuality = new AdaptiveQualityManager(scenePipeline, gpuTimer);
  const flightPlanRecorder = new FlightPlanRecorder();

  // --- Ground elevation ---
  let groundElevation = 0;

  // --- Stats.js ---
  const stats = new Stats();
  const gpuPanel = new Stats.Panel('GPU', '#ff9933', '#331100');
  stats.addPanel(gpuPanel);
  stats.showPanel(0);
  stats.dom.style.position = 'fixed';
  stats.dom.style.top = '0px';
  stats.dom.style.left = '0px';
  stats.dom.style.zIndex = '30';
  stats.dom.style.display = 'none';
  document.body.appendChild(stats.dom);

  // --- UI ---
  const hud = new HUD(document.getElementById('hud'));
  const minimap = new Minimap(document.getElementById('minimap'), geoTerrainManager);
  minimap.setFlightPlanRecorder(flightPlanRecorder);
  const hudCanvas = document.getElementById('hud');

  // --- Logger panel ---
  Logger.bindPanel(document.getElementById('log-panel'));
  if (CONFIG.showLogs) Logger.show();
  document.getElementById('log-panel-clear').addEventListener('click', () => Logger.clear());
  Logger.info('App', 'Application started');

  // --- Resize ---
  setupResizeHandler(camera, renderer, hud);

  // --- Config listeners ---
  const hiresBadge = document.getElementById('hires-badge');
  const applyDisplay = () => {
    hudCanvas.style.display = CONFIG.showHud ? 'block' : 'none';
    hiresBadge.style.display = CONFIG.hiResMode ? 'block' : 'none';
  };
  applyDisplay();
  onChange((key) => {
    if (key === 'showHud' || key === 'hiResMode') applyDisplay();
    if (key === 'showHud') updateFlyHint();
    if (key === 'cameraMode') chaseCameraController.reset();
  });

  // --- Input bindings ---
  const input = new InputManager();

  input.onKey('x', () => {
    if (!devMode) return;
    const active = geoTerrainManager.toggleDebug();
    Logger.info('App', `Debug tiles ${active ? 'enabled' : 'disabled'}`);
  });

  input.onKey('h', () => {
    update('showHud', !CONFIG.showHud);
  });

  input.onKey('m', () => {
    update('showMinimap', !CONFIG.showMinimap);
  });

  input.onKey('r', () => {
    const active = geoTerrainManager.toggleHiRes();
    Logger.info('App', `Hi-res mode (zoom 18) ${active ? 'enabled' : 'disabled'}`);
  });

  input.onKey('t', () => {
    const modes = ['satellite', 'osm', 'sar', 'elevation'];
    const idx = modes.indexOf(CONFIG.textureMode);
    update('textureMode', modes[(idx + 1) % modes.length]);
    showNotification(`Texture: ${CONFIG.textureMode}`);
  });

  input.onKey('v', () => {
    const next = CONFIG.cameraMode === 'chase' ? 'cockpit' : 'chase';
    update('cameraMode', next);
    Logger.info('App', `Camera mode: ${next}`);
  });

  input.onKey('i', () => {
    const active = hud.toggleStats();
    stats.dom.style.display = active ? 'block' : 'none';
    Logger.info('App', `Info ${active ? 'enabled' : 'disabled'}`);
  });

  input.onKey('l', async () => {
    if (hud.isFlightPlanMenuOpen()) {
      hud.closeFlightPlanMenu();
    } else {
      try {
        const r = await fetch('/api/flightplans');
        const files = await r.json();
        hud.openFlightPlanMenu(files);
      } catch {
        Logger.warn('App', 'No flight plans available');
      }
    }
  });

  input.onPrefix('Digit', async (e) => {
    if (!hud.isFlightPlanMenuOpen()) return;
    const idx = parseInt(e.code.charAt(5)) - 1;
    const file = hud.selectFlightPlan(idx);
    if (file) {
      try {
        const r = await fetch(`/assets/flightplans/${file}`);
        const data = await r.json();
        flightPlanRecorder.loadFromJSON(data, geoTerrainManager.horizontalScale);
        hud.closeFlightPlanMenu();
      } catch {
        Logger.warn('App', `Failed to load ${file}`);
      }
    }
  });

  // While the menu is open it handles Escape itself (resume)
  input.on('Escape', () => {
    if (hud.isFlightPlanMenuOpen()) hud.closeFlightPlanMenu();
    else panel.open();
  });

  input.onKey('n', (e) => {
    if (e.shiftKey) {
      flightPlanRecorder.clear();
    } else if (flightPlanRecorder.isRecording()) {
      flightPlanRecorder.stopRecording();
    } else {
      flightPlanRecorder.startRecording();
    }
  });

  input.onKey('p', () => {
    if (flightPlanRecorder.isRecording()) flightPlanRecorder.addWaypoint(flightController);
  });

  input.onKey('g', () => {
    if (flightPlanRecorder.autopilotActive) {
      flightPlanRecorder.autopilotActive = false;
      flightController.enabled = true;
      const plan = flightPlanRecorder.getPlan();
      flightController.position.copy(plan.position);
      flightController.setOrientation(plan.yaw, plan.pitch);
      Logger.info('App', 'Autopilot disengaged');
    } else {
      if (!flightPlanRecorder.hasValidPlan()) {
        Logger.warn('App', 'Need at least 2 waypoints to engage autopilot');
        return;
      }
      const plan = flightPlanRecorder.buildPlan(flightController);
      if (plan) {
        flightPlanRecorder.autopilotActive = true;
        flightController.enabled = false;
        Logger.info('App', 'Autopilot engaged');
      }
    }
  });

  function storeBaseline() {
    if (!benchmarkRunner._lastReport) {
      Logger.warn('App', 'No completed benchmark — run one first before storing baseline');
      return;
    }
    BenchmarkComparator.storeBaseline(benchmarkRunner._lastReport);
  }

  function toggleBenchmark() {
    if (benchmarkRunner.isRunning()) {
      benchmarkRunner.stop(flightController, renderer);
    } else {
      const userPlan = flightPlanRecorder.hasValidPlan() ? flightPlanRecorder.buildPlan(flightController) : null;
      benchmarkRunner.start(flightController, gpuTimer, userPlan);
    }
  }

  input.onKey('b', (e) => {
    if (!devMode) return;
    if (e.shiftKey) storeBaseline();
    else toggleBenchmark();
  });

  // --- Reference views (reproducible viewpoints for rendering comparisons) ---
  const DEG2RAD = Math.PI / 180;
  let referenceViewIndex = -1;

  function applyReferenceView(index) {
    const view = REFERENCE_VIEWS[index];
    const position = view && geoTerrainManager.geoToWorld(view.lat, view.lon, view.altitude);
    if (!position) return false;

    if (flightPlanRecorder.autopilotActive) flightPlanRecorder.autopilotActive = false;
    flightController.enabled = true;
    update('sunElevation', view.sunElevation);
    update('sunAzimuth', view.sunCompassAzimuth);
    update('showClouds', view.showClouds);
    if (view.cloudAltitude !== undefined) update('cloudAltitude', view.cloudAltitude);
    update('cameraMode', view.cameraMode);

    flightController.position.copy(position);
    flightController.setOrientation(-view.heading * DEG2RAD, view.pitch * DEG2RAD);
    flightController.yawRate = 0;
    flightController.pitchRate = 0;
    chaseCameraController.reset();
    _bankRoll = 0;
    referenceViewIndex = index;
    showNotification(`View ${index + 1}/${REFERENCE_VIEWS.length}: ${view.name}`);
    return true;
  }

  input.onKey('k', () => {
    if (!devMode) return;
    applyReferenceView((referenceViewIndex + 1) % REFERENCE_VIEWS.length);
  });

  // --- Settings menu ---
  // Opening it pauses the flight; the scene keeps rendering so graphics changes show
  let paused = false;
  let smoothedFrameMs = 16.7;
  const panel = new ControlPanel({
    devMode,
    actions: {
      resume: () => {
        if (!flightController.locked) {
          renderer.domElement.requestPointerLock()?.catch?.(() => {
            // Refused right after the mouse was released with Escape: a click on the scene takes it back
          });
        }
      },
      flyTo: (lat, lon) => {
        update('lat', lat);
        update('lon', lon);
        geoTerrainManager.reinit();
        flightController.position.set(0, REALWORLD_START_ALTITUDE, 0);
      },
      reloadTerrain: () => geoTerrainManager.reinit(),
      referenceViews: REFERENCE_VIEWS.map((v) => v.name),
      setReferenceView: (index) => applyReferenceView(index),
      toggleDebugTiles: () => geoTerrainManager.toggleDebug(),
      toggleBenchmark,
      storeBaseline,
      metrics: () => {
        const info = renderer.info.render;
        return {
          'Frame rate': `${(1000 / smoothedFrameMs).toFixed(0)} FPS`,
          'GPU time': `${gpuTimer.getLastGPUTimeMs().toFixed(2)} ms`,
          'Render scale': `${Math.round(scenePipeline.renderScale * 100)} %`,
          'Pixel ratio': renderer.getPixelRatio().toFixed(2),
          Quality: CONFIG.quality,
          'Draw calls': String(info.drawCalls),
          Triangles: info.triangles.toLocaleString('en-US'),
          'Tile downloads': String(geoTerrainManager.pendingDownloads),
          'Tiles in view': formatTileLevels(geoTerrainManager.tileLevels()),
        };
      },
    },
  });

  /** "212 — z15 48 · z14 61 · z13 52 · z12 30": the finest levels first */
  function formatTileLevels({ total, byLevel }) {
    const levels = Object.keys(byLevel)
      .map(Number)
      .sort((a, b) => b - a)
      .slice(0, 4)
      .map((z) => `z${z} ${byLevel[z]}`);
    return `${total} — ${levels.join(' · ')}`;
  }

  const flyHint = document.getElementById('fly-hint');
  document.getElementById('menu-button').addEventListener('click', () => panel.open());
  function updateFlyHint() {
    flyHint.hidden = panel.isOpen || flightController.locked || !CONFIG.showHud;
  }
  panel.onToggle((open) => {
    paused = open;
    updateFlyHint();
  });
  document.addEventListener('pointerlockchange', () => {
    // Escape releases the mouse before the page sees the key: open the menu then
    if (flightController.locked) panel.close();
    else panel.open();
    updateFlyHint();
  });
  updateFlyHint();

  // Read-only state and view selection for automated captures and measurements
  window.osf = {
    referenceViews: REFERENCE_VIEWS.map((v) => v.name),
    setReferenceView: (n) => applyReferenceView(n - 1),
    setConfig: (key, value) => update(key, value),
    // Resolution of the scene pass relative to the output (dynamic resolution)
    renderScale: () => scenePipeline.renderScale,
    memory: () => ({ ...renderer.info.memory }),
    // Scene luminance the automatic exposure has adapted to (null when off)
    adaptedLuminance: () => scenePipeline.readAdaptedLuminance(),
    setRenderScale: (scale) => scenePipeline.setRenderScale(scale),
    pendingTileDownloads: () => geoTerrainManager.pendingDownloads,
    // Displayed terrain tiles in the view, by zoom level
    tileLevels: () => geoTerrainManager.tileLevels(),
    lastGpuTimeMs: () => gpuTimer.getLastGPUTimeMs(),
    // Draw calls and triangles of the last frame
    renderInfo: () => ({ drawCalls: renderer.info.render.drawCalls, triangles: renderer.info.render.triangles }),
    // Render each frame n times so the GPU keeps a steady clock while its time is measured
    setRendersPerFrame: (n) => {
      gpuTimer.rendersPerFrame = Math.max(1, Math.round(n));
    },
  };

  // --- Render loop ---
  let prevTime = performance.now();
  let _bankRoll = 0;

  const viewParam = parseInt(new URLSearchParams(window.location.search).get('view'), 10);
  if (viewParam >= 1) applyReferenceView(viewParam - 1);

  function animate() {
    requestAnimationFrame(animate);
    stats.begin();

    const now = performance.now();
    // The simulation stands still while the settings menu is open
    const dt = paused ? 0 : Math.min((now - prevTime) / 1000, MAX_DELTA_TIME);
    const frameTimeMs = now - prevTime;
    prevTime = now;
    smoothedFrameMs += (frameTimeMs - smoothedFrameMs) * 0.05;

    // --- Input phase ---
    flightController.update(dt);
    benchmarkRunner.tickPath(dt, flightController, renderer);

    // --- Aircraft state ---
    let aircraftState = null;

    if (flightPlanRecorder.autopilotActive && flightPlanRecorder.getPlan()) {
      const plan = flightPlanRecorder.getPlan();
      const ok = plan.update(dt);
      if (!ok) {
        flightPlanRecorder.autopilotActive = false;
        flightController.enabled = true;
        flightController.position.copy(plan.position);
        flightController.setOrientation(plan.yaw, plan.pitch);
        Logger.info('App', 'Autopilot: flight plan completed');
      } else {
        _autopilotEuler.set(plan.pitch, plan.yaw, 0, 'YXZ');
        _autopilotQuat.setFromEuler(_autopilotEuler);
        aircraftState = {
          position: plan.position,
          yaw: plan.yaw,
          pitch: plan.pitch,
          yawRate: plan.yawRate,
          pitchRate: plan.pitchRate,
          quaternion: _autopilotQuat,
        };
      }
    } else if (benchmarkRunner.isRunning() && !benchmarkRunner.isWarmup() && benchmarkRunner.cameraPath) {
      const path = benchmarkRunner.cameraPath;
      _autopilotEuler.set(path.pitch, path.yaw, 0, 'YXZ');
      _autopilotQuat.setFromEuler(_autopilotEuler);
      aircraftState = {
        position: path.position,
        yaw: path.yaw,
        pitch: path.pitch,
        yawRate: path.yawRate,
        pitchRate: path.pitchRate,
        quaternion: _autopilotQuat,
      };
    } else if (!benchmarkRunner.isRunning()) {
      aircraftState = {
        position: flightController.position,
        yaw: flightController.yaw,
        pitch: flightController.pitch,
        yawRate: flightController.yawRate,
        pitchRate: flightController.pitchRate,
        quaternion: flightController.quaternion,
      };
    }

    // --- Bank roll (derived from yawRate, single source of truth) ---
    if (aircraftState) {
      const targetRoll = Math.max(-MAX_ROLL, Math.min(MAX_ROLL,
        aircraftState.yawRate * ROLL_SENSITIVITY));
      _bankRoll += (targetRoll - _bankRoll) * ROLL_DAMP_SPEED * dt;
      aircraftState.roll = _bankRoll;
    }

    // --- Camera phase ---
    if (aircraftState) {
      aircraftManager.update(aircraftState, dt);
      if (CONFIG.cameraMode === 'cockpit') {
        aircraftManager.setVisible(false);
        camera.position.copy(aircraftState.position);
        camera.quaternion.copy(aircraftState.quaternion);
        _qRoll.setFromAxisAngle(_axisZ, aircraftState.roll);
        camera.quaternion.multiply(_qRoll);
        chaseCameraController.reset();
      } else {
        aircraftManager.setVisible(true);
        chaseCameraController.update(aircraftState, camera, dt);
      }
    }

    // --- Environment phase ---
    cloudLayer.update(dt, camera.position, aircraftState ? aircraftState.pitch : 0);

    const timer = benchmarkRunner.getSubsystemTimer();

    // --- Terrain phase ---
    if (timer) timer.begin('terrain');
    geoTerrainManager.update(camera.position);
    if (timer) timer.end('terrain');

    const farNeeded = REALWORLD_FAR_PLANE;
    if (Math.abs(camera.far - farNeeded) > CLIP_PLANE_EPSILON) {
      camera.far = farNeeded;
      camera.near = DEFAULT_NEAR;
      camera.updateProjectionMatrix();
      Logger.debug('App', 'Realworld clip planes updated', { near: DEFAULT_NEAR, far: farNeeded });
    }
    groundElevation = geoTerrainManager.getGroundElevation(camera.position.x, camera.position.z);

    // --- Render phase ---
    if (timer) timer.begin('render');
    gpuTimer.beginFrame();
    renderer.info.reset();
    scenePipeline.render(gpuTimer.rendersPerFrame);
    gpuTimer.endFrame();
    if (timer) timer.end('render');

    // --- Overlay phase ---
    if (timer) timer.begin('hud');
    hud.update(camera, groundElevation, benchmarkRunner, dt, flightPlanRecorder, aircraftState);
    if (timer) timer.end('hud');

    if (timer) timer.begin('minimap');
    minimap.update(camera, aircraftState);
    if (timer) timer.end('minimap');

    // --- Post-render phase ---
    benchmarkRunner.recordMetrics(renderer, scenePipeline.renderScale);
    adaptiveQuality.update(frameTimeMs);
    gpuPanel.update(gpuTimer.getLastGPUTimeMs(), 30);

    stats.end();
  }

  animate();
}

initApp().catch((err) => {
  console.error('Failed to initialize application:', err);
});
