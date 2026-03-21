import * as THREE from 'three';
import { CONFIG, onChange, update } from './utils/config.js';
import {
  CLOUD_RENDER_ORDER,
  REALWORLD_FAR_PLANE,
  CLIP_PLANE_EPSILON,
} from './constants/rendering.js';
import { REALWORLD_START_ALTITUDE, DEFAULT_NEAR, MAX_ROLL, ROLL_SENSITIVITY, ROLL_DAMP_SPEED } from './constants/camera.js';
import { MAX_DELTA_TIME } from './constants/physics.js';
import { createRenderer, createScene, createCamera, setupResizeHandler } from './scene/SceneSetup.js';
import AdaptiveQualityManager from './rendering/AdaptiveQualityManager.js';
import InputManager from './input/InputManager.js';
import GeoTerrainManager from './terrain/GeoTerrainManager.js';
import FlightController from './camera/FlightController.js';
import ControlPanel from './ui/ControlPanel.js';
import HUD from './ui/HUD.js';
import Minimap from './ui/Minimap.js';
import Logger from './utils/Logger.js';
import { showNotification } from './ui/Notification.js';
import AtmosphericSky from './atmosphere/AtmosphericSky.js';
import CloudLayer from './atmosphere/CloudLayer.js';
import BenchmarkRunner from './benchmark/BenchmarkRunner.js';
import BenchmarkComparator from './benchmark/BenchmarkComparator.js';
import GPUTimer from './benchmark/GPUTimer.js';
import AircraftManager from './aircraft/AircraftManager.js';
import ChaseCameraController from './camera/ChaseCameraController.js';
import FlightPlanRecorder from './flightplan/FlightPlanRecorder.js';
import Stats from 'stats.js';

async function initApp() {
  // --- Core scene ---
  const renderer = await createRenderer();
  const { scene, dirLight, ambientLight } = createScene();
  const camera = createCamera();

  // --- Atmosphere ---
  // Side-effect: registers itself with scene, dirLight, and ambientLight
  new AtmosphericSky(scene, dirLight, ambientLight);
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
  aircraftManager.load('assets/models/rafale/Rafale.gltf').catch((err) => {
    Logger.warn('App', 'Failed to load Rafale model: ' + err.message);
  });

  // --- Systems ---
  const benchmarkRunner = new BenchmarkRunner();
  const gpuTimer = new GPUTimer(renderer);
  const flightPlanRecorder = new FlightPlanRecorder();
  const adaptiveQuality = new AdaptiveQualityManager(renderer);

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

  // --- Control Panel ---
  function regenerate() {
    geoTerrainManager.reinit();
    flightController.position.set(0, REALWORLD_START_ALTITUDE, 0);
  }
  // Side-effect: binds DOM controls to CONFIG
  new ControlPanel(regenerate);

  // --- Logger panel ---
  Logger.bindPanel(document.getElementById('log-panel'));
  document.getElementById('log-panel-clear').addEventListener('click', () => Logger.clear());
  Logger.info('App', 'Application started');

  // --- Resize ---
  setupResizeHandler(camera, renderer, hud);

  // --- Config listeners ---
  onChange((key, value) => {
    if (key === 'showHud') hudCanvas.style.display = value ? 'block' : 'none';
  });

  // --- Input bindings ---
  const input = new InputManager();

  input.on('KeyX', () => {
    const active = geoTerrainManager.toggleDebug();
    Logger.info('App', `Debug tiles ${active ? 'enabled' : 'disabled'}`);
  });

  input.on('KeyH', () => {
    update('showHud', !CONFIG.showHud);
  });

  input.on('KeyR', () => {
    const active = geoTerrainManager.toggleHiRes();
    Logger.info('App', `Hi-res mode (zoom 18) ${active ? 'enabled' : 'disabled'}`);
  });

  input.on('KeyT', () => {
    const modes = ['satellite', 'osm', 'sar', 'elevation'];
    const idx = modes.indexOf(CONFIG.textureMode);
    update('textureMode', modes[(idx + 1) % modes.length]);
    showNotification(`Texture: ${CONFIG.textureMode}`);
  });

  input.on('KeyV', () => {
    const next = CONFIG.cameraMode === 'chase' ? 'cockpit' : 'chase';
    update('cameraMode', next);
    chaseCameraController.reset();
    Logger.info('App', `Camera mode: ${next}`);
  });

  input.on('KeyI', () => {
    const active = hud.toggleStats();
    document.getElementById('help').style.display = active ? 'block' : 'none';
    stats.dom.style.display = active ? 'block' : 'none';
    Logger.info('App', `Info ${active ? 'enabled' : 'disabled'}`);
  });

  input.on('KeyL', async () => {
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
        flightPlanRecorder.loadFromJSON(data);
        hud.closeFlightPlanMenu();
      } catch {
        Logger.warn('App', `Failed to load ${file}`);
      }
    }
  });

  input.on('Escape', () => {
    if (hud.isFlightPlanMenuOpen()) hud.closeFlightPlanMenu();
  });

  input.on('KeyN', (e) => {
    if (e.shiftKey) {
      flightPlanRecorder.clear();
    } else if (flightPlanRecorder.isRecording()) {
      flightPlanRecorder.stopRecording();
    } else {
      flightPlanRecorder.startRecording();
    }
  });

  input.on('KeyP', () => {
    if (flightPlanRecorder.isRecording()) flightPlanRecorder.addWaypoint(camera);
  });

  input.on('KeyG', () => {
    if (flightPlanRecorder.autopilotActive) {
      flightPlanRecorder.autopilotActive = false;
      flightController.enabled = true;
      flightController.position.copy(camera.position);
      flightController.setOrientation(camera.rotation.y, camera.rotation.x);
      Logger.info('App', 'Autopilot disengaged');
    } else {
      if (!flightPlanRecorder.hasValidPlan()) {
        Logger.warn('App', 'Need at least 2 waypoints to engage autopilot');
        return;
      }
      const plan = flightPlanRecorder.buildPlan(camera);
      if (plan) {
        flightPlanRecorder.autopilotActive = true;
        flightController.enabled = false;
        Logger.info('App', 'Autopilot engaged');
      }
    }
  });

  input.on('KeyB', (e) => {
    if (e.shiftKey) {
      if (!benchmarkRunner._lastReport) {
        Logger.warn('App', 'No completed benchmark — run one first before storing baseline');
        return;
      }
      BenchmarkComparator.storeBaseline(benchmarkRunner._lastReport);
      return;
    }
    if (benchmarkRunner.isRunning()) {
      benchmarkRunner.stop(flightController, renderer);
    } else {
      const userPlan = flightPlanRecorder.hasValidPlan() ? flightPlanRecorder.buildPlan(camera) : null;
      benchmarkRunner.start(flightController, camera, gpuTimer, userPlan);
    }
  });

  // --- Render loop ---
  let prevTime = performance.now();
  let _bankRoll = 0;

  function animate() {
    requestAnimationFrame(animate);
    stats.begin();

    const now = performance.now();
    const dt = Math.min((now - prevTime) / 1000, MAX_DELTA_TIME);
    const frameTimeMs = now - prevTime;
    prevTime = now;

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
    cloudLayer.update(dt, camera.position, camera);

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
    renderer.render(scene, camera);
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
    benchmarkRunner.recordMetrics(renderer);
    adaptiveQuality.update(frameTimeMs);
    gpuPanel.update(gpuTimer.getLastGPUTimeMs(), 30);

    stats.end();
  }

  animate();
}

initApp().catch((err) => {
  console.error('Failed to initialize application:', err);
});
