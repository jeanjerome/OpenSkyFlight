import * as THREE from 'three';
import { CONFIG, DEFAULTS, onChange, update } from './utils/config.js';
import { loadSettings, isDevMode } from './utils/settingsStore.js';
import { bindQualitySettings } from './utils/qualityPresets.js';
import { GLOW_LAYER, HEAT_LAYER, REALWORLD_FAR_PLANE, CLIP_PLANE_EPSILON } from './constants/rendering.js';
import { REALWORLD_START_ALTITUDE, DEFAULT_NEAR, MAX_ROLL, ROLL_SENSITIVITY, ROLL_DAMP_SPEED } from './constants/camera.js';
import { MAX_DELTA_TIME } from './constants/physics.js';
import { SIMULATION_RATE, ENTITY_GRID_CELL } from './constants/simulation.js';
import { GAMEPAD } from './constants/controls.js';
import { createRenderer, createScene, createCamera, setupResizeHandler } from './scene/SceneSetup.js';
import AdaptiveQualityManager from './rendering/AdaptiveQualityManager.js';
import ScenePipeline from './rendering/ScenePipeline.js';
import InputManager from './input/InputManager.js';
import GeoTerrainManager from './terrain/GeoTerrainManager.js';
import ControlInputs from './input/ControlInputs.js';
import AircraftState from './flight/AircraftState.js';
import ExplorationFlight from './flight/ExplorationFlight.js';
import SimulatedFlight from './flight/SimulatedFlight.js';
import SimulationClock from './sim/SimulationClock.js';
import EntityRegistry from './sim/EntityRegistry.js';
import ControlPanel from './ui/ControlPanel.js';
import CrashScreen from './ui/CrashScreen.js';
import HUD from './ui/HUD.js';
import Minimap from './ui/Minimap.js';
import Logger from './utils/Logger.js';
import { showNotification } from './ui/Notification.js';
import AtmosphericSky from './atmosphere/AtmosphericSky.js';
import CityLights from './terrain/CityLights.js';
import { REFERENCE_VIEWS } from './constants/referenceViews.js';
import VolumetricClouds from './clouds/VolumetricClouds.js';
import TerrainShadow from './terrain/TerrainShadow.js';
import AircraftShadow from './aircraft/AircraftShadow.js';
import BenchmarkRunner from './benchmark/BenchmarkRunner.js';
import BenchmarkComparator from './benchmark/BenchmarkComparator.js';
import GPUTimer from './benchmark/GPUTimer.js';
import AircraftManager from './aircraft/AircraftManager.js';
import EngineSound from './audio/EngineSound.js';
import ChaseCameraController from './camera/ChaseCameraController.js';
import OrbitCameraController from './camera/OrbitCameraController.js';
import FlightPlanRecorder from './flightplan/FlightPlanRecorder.js';
import { RunwayCatalog, offsetPosition } from './airports/Airports.js';
import RunwayMarkings from './terrain/RunwayMarkings.js';
import RunwayLights from './airports/RunwayLights.js';
import RunwaysInWorld from './airports/RunwaysInWorld.js';
import { approachGuidance } from './flight/ApproachGuide.js';
import PilotBot from './flight/PilotBot.js';
import Stats from 'stats.js';

async function initApp() {
  // --- Settings: stored, then URL, then the technical values of the graphics settings ---
  bindQualitySettings(loadSettings());
  const devMode = isDevMode();

  // --- Core scene ---
  const renderer = await createRenderer();
  const { scene, dirLight, ambientLight } = createScene();
  const camera = createCamera();

  const scenePipeline = new ScenePipeline(renderer, scene, camera);

  // --- Terrain ---
  // The ground is flattened under the runways around: they are loaded before
  // the terrain of a new place, which then draws them flat from the start
  const geoTerrainManager = new GeoTerrainManager(scene, renderer);
  const runwayCatalog = new RunwayCatalog();
  geoTerrainManager.runwayMarkings = new RunwayMarkings();
  /** Longest wait for the runways of a place before loading its terrain anyway (ms) */
  const RUNWAY_WAIT = 3000;
  runwayCatalog.onChange = (runways) => geoTerrainManager.setRunways(runways);
  /** Load the runways around a place, waiting no more than a few seconds for the server */
  const loadRunways = (lat, lon) =>
    Promise.race([runwayCatalog.load(lat, lon), new Promise((resolve) => setTimeout(resolve, RUNWAY_WAIT))]);
  await loadRunways(CONFIG.lat, CONFIG.lon);
  geoTerrainManager.init(CONFIG.lat, CONFIG.lon);

  // --- Atmosphere ---
  // Drives the sky, the aerial perspective, the sunlight and sky light, the
  // tone mapping and the bloom threshold from the configuration
  const atmosphericSky = new AtmosphericSky(
    scene,
    renderer,
    camera,
    { dirLight, ambientLight },
    scenePipeline,
    (x, z) => geoTerrainManager.worldToGeo(x, z),
  );
  scenePipeline.setGlowLayer(scene, camera, GLOW_LAYER);
  // The hot exhaust bends the view through it (see EngineExhaust)
  const applyHeatHaze = () => scenePipeline.setHeatLayer(scene, camera, CONFIG.heatHaze ? HEAT_LAYER : null);
  applyHeatHaze();
  onChange((key) => {
    if (key === 'heatHaze') applyHeatHaze();
  });
  const cityLights = new CityLights(geoTerrainManager, atmosphericSky.preExposure);
  geoTerrainManager.setEmissiveNode(cityLights.node);
  geoTerrainManager.setExposureNode(atmosphericSky.preExposure);
  // Volumetric clouds need compute shaders (their noise textures): none on the WebGL2 backend
  let volumetricClouds = null;
  if (renderer.backend.isWebGPUBackend) {
    volumetricClouds = new VolumetricClouds(atmosphericSky, camera);
    volumetricClouds.init(renderer);
    volumetricClouds.setBase(CONFIG.cloudAltitude);
    volumetricClouds.setCover(CONFIG.cloudCover);
    onChange((key, value) => {
      if (key === 'cloudAltitude') volumetricClouds.setBase(value);
      if (key === 'cloudCover') volumetricClouds.setCover(value);
    });
    atmosphericSky.setClouds(volumetricClouds);
  }

  // --- Simulation ---
  // The aircraft is flown at fixed steps (SimulationClock) and drawn at a pose
  // interpolated between the last two steps
  const simulationClock = new SimulationClock(SIMULATION_RATE, Math.ceil(MAX_DELTA_TIME * SIMULATION_RATE));
  const entities = new EntityRegistry(ENTITY_GRID_CELL);
  const aircraft = new AircraftState();
  aircraft.position.copy(camera.position);
  // Two ways to fly the same aircraft: free flight (Exploration) and the
  // flight model (Simulation); `flight` is the one in use
  const exploration = new ExplorationFlight(aircraft);
  const simulation = new SimulatedFlight(aircraft, (x, z) => geoTerrainManager.groundHeight(x, z));
  let flight = exploration;
  const aircraftPose = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), yaw: 0, pitch: 0 };
  // Heading and pitch the chase view follows in the Simulation mode: the mouse aim
  const aimView = { position: aircraftPose.position, yaw: 0, pitch: 0 };
  let attachedView = false;

  /** Fly the aircraft in a mode from where it is, nose where it points */
  function setFlightMode(mode) {
    const next = mode === 'exploration' ? exploration : simulation;
    if (next === flight) return;
    next.enabled = flight.enabled;
    flight = next;
    next.teleport(aircraft.position.clone(), aircraft.yaw, aircraft.pitch);
    chaseCameraController.reset();
  }
  // After a crash the flight stands still under the crash screen until restarted
  const crashScreen = new CrashScreen({
    inFlight: () => {
      const { x, y, z } = aircraft.position;
      const ground = geoTerrainManager.groundHeight(x, z) ?? y;
      simulation.teleport(new THREE.Vector3(x, ground + 1500, z), aircraft.yaw, 0);
      chaseCameraController.reset();
    },
    onGround: () => {
      const { x, z, yaw } = simulation.groundStart;
      simulation.placeOnGround(x, z, yaw);
      chaseCameraController.reset();
    },
  });
  simulation.onCrash = (crash) => crashScreen.show(crash, simulation.groundStart !== null);

  // --- Controllers ---
  const controls = new ControlInputs(renderer.domElement);
  let lastControlDevice = controls.device;
  controls.onGamepadChange = (pad) => {
    if (!pad) showNotification('Gamepad disconnected');
    else if (pad.mapping === 'standard') showNotification('Gamepad connected');
    else showNotification('Gamepad connected — unknown layout, its sticks and buttons may be swapped');
  };
  const chaseCameraController = new ChaseCameraController();
  const orbitCameraController = new OrbitCameraController((x, z) => geoTerrainManager.groundHeight(x, z));
  setFlightMode(CONFIG.flightMode);
  // Start in level flight
  if (flight === simulation) simulation.teleport(aircraft.position.clone(), aircraft.yaw, 0);
  const _qRoll = new THREE.Quaternion();
  const _axisZ = new THREE.Vector3(0, 0, 1);
  const _toListener = new THREE.Vector3();
  const _nose = new THREE.Vector3();
  const engineSound = new EngineSound();
  const _autopilotEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  const _autopilotQuat = new THREE.Quaternion();
  // Runway lights, at dusk and in low visibility
  const runwayLights = new RunwayLights(scene, {
    emissiveExposure: atmosphericSky.emissiveExposure,
    sceneDepth: scenePipeline.sceneDepth,
  });
  const _bufferSize = new THREE.Vector2();
  const aircraftManager = new AircraftManager(scene, {
    emissiveExposure: atmosphericSky.emissiveExposure,
    sceneDepth: scenePipeline.sceneDepth,
    camera,
    renderer,
  });
  aircraftManager
    .load('assets/models/rafale/Rafale.gltf')
    .catch((err) => {
      Logger.warn('App', 'Failed to load Rafale model: ' + err.message);
    });

  // Shadows of the relief (render targets read with linear filtering: float32-filterable) and of the aircraft
  const terrainShadow = renderer.backend.isWebGPUBackend ? new TerrainShadow(geoTerrainManager, atmosphericSky) : null;
  const aircraftShadow = new AircraftShadow(atmosphericSky, aircraftManager);
  atmosphericSky.setShadows(terrainShadow, aircraftShadow);
  const applyShadows = () => {
    terrainShadow?.setEnabled(CONFIG.shadows);
    aircraftShadow.setEnabled(CONFIG.shadows);
  };
  applyShadows();
  onChange((key) => {
    if (key === 'shadows') applyShadows();
  });

  // --- Systems ---
  const benchmarkRunner = new BenchmarkRunner();
  const gpuTimer = new GPUTimer(renderer);
  const adaptiveQuality = new AdaptiveQualityManager(scenePipeline, gpuTimer);
  const flightPlanRecorder = new FlightPlanRecorder();

  // --- Ground elevation (last known while the tiles below load) ---
  let groundElevation = 0;
  let aircraftGroundElevation = 0;

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
    // The free exterior view shows the aircraft alone: the HUD reads as seen from behind
    hudCanvas.style.display = CONFIG.showHud && CONFIG.cameraMode !== 'orbit' ? 'block' : 'none';
    hiresBadge.style.display = CONFIG.hiResMode ? 'block' : 'none';
  };
  applyDisplay();
  onChange((key) => {
    if (key === 'showHud' || key === 'hiResMode' || key === 'cameraMode') applyDisplay();
    if (key === 'showHud') updateFlyHint();
    if (key === 'cameraMode') {
      chaseCameraController.reset();
      orbitCameraController.reset();
    }
    if (key === 'flightMode') setFlightMode(CONFIG.flightMode);
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

  input.onKey('f', () => {
    update('flightMode', CONFIG.flightMode === 'simulation' ? 'exploration' : 'simulation');
    showNotification(CONFIG.flightMode === 'simulation' ? 'Simulation flight' : 'Exploration flight');
  });

  input.onKey('o', () => {
    update('antiCollisionLights', !CONFIG.antiCollisionLights);
    showNotification(`Anti-collision lights ${CONFIG.antiCollisionLights ? 'on' : 'off'}`);
  });

  input.onKey('t', () => {
    const modes = ['satellite', 'osm', 'sar', 'elevation'];
    const idx = modes.indexOf(CONFIG.textureMode);
    update('textureMode', modes[(idx + 1) % modes.length]);
    showNotification(`Texture: ${CONFIG.textureMode}`);
  });

  const VIEWS = ['chase', 'orbit', 'cockpit'];
  const toggleView = () => {
    const next = VIEWS[(VIEWS.indexOf(CONFIG.cameraMode) + 1) % VIEWS.length];
    update('cameraMode', next);
    // The mouse stops steering there: say how it turns the view instead
    if (next === 'orbit') showNotification('Orbit view — mouse or right stick turns, wheel zooms');
    Logger.info('App', `Camera mode: ${next}`);
  };
  input.onKey('v', toggleView);
  controls.onButton(GAMEPAD.Y, () => {
    if (!paused) toggleView();
  });
  controls.onButton(GAMEPAD.START, () => {
    if (panel.isOpen) panel.resume();
    else panel.open();
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
    if (flightPlanRecorder.isRecording()) flightPlanRecorder.addWaypoint(flight);
  });

  const toggleGear = () => {
    if (flight !== simulation || !simulation.enabled || simulation.crash) return;
    const down = simulation.toggleGear();
    showNotification(
      down === null ? 'Gear locked down: the wheels carry the aircraft' : down ? 'Gear down' : 'Gear up',
    );
  };
  input.onKey('g', toggleGear);

  // Autopilot: hold the heading and altitude of the moment
  input.onKey('c', () => {
    if (flight !== simulation || !simulation.enabled || simulation.crash) return;
    if (!simulation.toggleAutopilot()) {
      showNotification(simulation.model.onGround ? 'Autopilot: not on the ground' : 'Autopilot off');
      return;
    }
    const { heading, altitude } = simulation.autopilot;
    const degrees = Math.round((((-heading * 180) / Math.PI) % 360) + 360) % 360;
    showNotification(`Autopilot: heading ${String(degrees).padStart(3, '0')}°, ${Math.round(altitude)} m`);
  });
  simulation.onAutopilotOff = () => showNotification('Autopilot disconnected');
  controls.onButton(GAMEPAD.X, () => {
    if (!paused) toggleGear();
  });
  controls.onButton(GAMEPAD.A, () => {
    if (!paused) crashScreen.choose('flight');
  });
  controls.onButton(GAMEPAD.B, () => {
    if (!paused) crashScreen.choose('ground');
  });

  input.onKey('u', () => {
    if (flightPlanRecorder.autopilotActive) {
      flightPlanRecorder.autopilotActive = false;
      flight.enabled = true;
      const plan = flightPlanRecorder.getPlan();
      flight.teleport(plan.position, plan.yaw, plan.pitch);
      Logger.info('App', 'Autopilot disengaged');
    } else {
      if (!flightPlanRecorder.hasValidPlan()) {
        Logger.warn('App', 'Need at least 2 waypoints to engage autopilot');
        return;
      }
      const plan = flightPlanRecorder.buildPlan(flight);
      if (plan) {
        flightPlanRecorder.autopilotActive = true;
        flight.enabled = false;
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
      benchmarkRunner.stop(flight, renderer);
    } else {
      const userPlan = flightPlanRecorder.hasValidPlan() ? flightPlanRecorder.buildPlan(flight) : null;
      benchmarkRunner.start(flight, gpuTimer, userPlan);
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
    // Views are set up in free flight, where the aircraft holds still
    update('flightMode', 'exploration');
    flight.enabled = true;
    // Sun fixed for reproducible captures
    update('timeSpeed', 0);
    update('dayOfYear', view.dayOfYear);
    update('timeOfDay', view.timeOfDay);
    update('showClouds', view.showClouds);
    if (view.cloudAltitude !== undefined) update('cloudAltitude', view.cloudAltitude);
    update('cloudCover', view.cloudCover ?? DEFAULTS.cloudCover);
    // Clouds where the wind had not yet carried them
    volumetricClouds?.resetWind();
    update('cameraMode', view.cameraMode);

    flight.teleport(position, -view.heading * DEG2RAD, view.pitch * DEG2RAD);
    flight.yawRate = 0;
    flight.pitchRate = 0;
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

  // --- Airports ---
  // Runways around the aircraft, and the start lined up on a runway: the
  // terrain is loaded around its start, the aircraft holds there until the
  // ground under it has loaded, then stands on its wheels
  let runwayStart = null;
  /** The runway and end of the last runway start, which the scripted pilot flies a circuit from */
  let lastRunwayStart = null;

  // Scripted pilot (see flight/PilotBot.js), for automated flight checks: it
  // replaces the player's inputs while it flies; the simulation may run
  // faster than real time meanwhile
  let pilot = null;
  let timeScale = 1;
  function startCircuit() {
    if (!lastRunwayStart || flight !== simulation || simulation.holding) return false;
    guidedRunways.update(runwayCatalog.runways, geoTerrainManager);
    const placed = guidedRunways.placed.find(({ runway }) => runway.id === lastRunwayStart.runway.id);
    if (!placed) return false;
    pilot = new PilotBot(placed, lastRunwayStart.endIndex);
    return true;
  }
  let catalogCountdown = 0;

  /** Line up this far past the start of the runway (m) */
  const LINE_UP_DISTANCE = 40;
  /** Longest wait for the ground under a runway start (ms) */
  const RUNWAY_LOAD_TIMEOUT = 20000;

  async function startOnRunway(airport, runway, endIndex) {
    const end = runway.ends[endIndex];
    const start = offsetPosition(end.lat, end.lon, end.heading, LINE_UP_DISTANCE);
    const label = `${airport.ident} runway ${end.ident}`;
    showNotification(`${label}: loading the airport…`);
    lastRunwayStart = { runway, endIndex };
    runwayCatalog.add(airport.runways);
    await loadRunways(start.lat, start.lon);
    update('flightMode', 'simulation');
    update('lat', start.lat);
    update('lon', start.lon);
    geoTerrainManager.reinit();
    const yaw = -end.heading * DEG2RAD;
    simulation.hold(new THREE.Vector3(0, end.elevation + 2, 0), yaw);
    simulation.groundStart = null;
    chaseCameraController.reset();
    runwayStart = { yaw, since: performance.now(), settled: 0, label };
  }

  // Approach guidance on the HUD, to the runway end the aircraft heads for,
  // in flight once the gear is commanded down or below APPROACH_HEIGHT above it
  const guidedRunways = new RunwaysInWorld();
  const APPROACH_HEIGHT = 600;
  function approachFor(model) {
    guidedRunways.update(runwayCatalog.runways, geoTerrainManager);
    const { x, z } = model.velocity;
    const speed = Math.hypot(x, z);
    if (speed < 20 || model.onGround) return null;
    const approach = approachGuidance(guidedRunways.placed, model.position, x / speed, z / speed);
    return approach && (model.controls.gear || approach.height < APPROACH_HEIGHT) ? approach : null;
  }

  /** Stand the aircraft on the runway once the ground there has loaded */
  function updateRunwayStart(now) {
    if (!runwayStart) return;
    if (flight !== simulation || !simulation.holding) {
      runwayStart = null;
      return;
    }
    const ground = geoTerrainManager.groundHeight(0, 0);
    const loaded = ground !== null && geoTerrainManager.pendingDownloads === 0;
    runwayStart.settled = loaded ? runwayStart.settled || now : 0;
    const timedOut = now - runwayStart.since > RUNWAY_LOAD_TIMEOUT && ground !== null;
    if ((runwayStart.settled && now - runwayStart.settled > 500) || timedOut) {
      simulation.placeOnGround(0, 0, runwayStart.yaw);
      chaseCameraController.reset();
      showNotification(runwayStart.label);
      runwayStart = null;
    }
  }

  // --- Settings menu ---
  // Opening it pauses the flight; the scene keeps rendering so graphics changes show
  let paused = false;
  let smoothedFrameMs = 16.7;
  const panel = new ControlPanel({
    devMode,
    actions: {
      resume: () => {
        if (!controls.locked) {
          renderer.domElement.requestPointerLock()?.catch?.(() => {
            // Refused right after the mouse was released with Escape: a click on the scene takes it back
          });
        }
      },
      flyTo: async (lat, lon) => {
        await loadRunways(lat, lon);
        update('lat', lat);
        update('lon', lon);
        geoTerrainManager.reinit();
        flight.teleport(new THREE.Vector3(0, REALWORLD_START_ALTITUDE, 0));
        simulation.groundStart = null;
      },
      startOnRunway,
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
    flyHint.hidden = panel.isOpen || controls.locked || controls.device === 'gamepad' || !CONFIG.showHud;
  }
  panel.onToggle((open) => {
    paused = open;
    updateFlyHint();
  });
  document.addEventListener('pointerlockchange', () => {
    // Escape releases the mouse before the page sees the key: open the menu then
    if (controls.locked) panel.close();
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
    // Simulated aircraft and the ground below it: as drawn (null while not loaded) and at zoom 12
    aircraft: () => {
      const { x, y, z } = aircraft.position;
      return {
        position: { x, y, z },
        yaw: aircraft.yaw,
        pitch: aircraft.pitch,
        simulationTime: simulationClock.time,
        groundHeight: geoTerrainManager.groundHeight(x, z),
        groundHeightZoom12: geoTerrainManager.getGroundElevation(x, z, null),
        mode: CONFIG.flightMode,
        ...(flight === simulation && {
          mach: simulation.model.mach,
          indicatedAirspeed: simulation.model.indicatedAirspeed,
          loadFactor: simulation.model.loadFactor,
          alpha: simulation.model.alpha,
          bank: simulation.model.bank,
          lever: simulation.model.controls.lever,
          thrust: simulation.model.engines.thrust,
          fuel: simulation.model.fuel,
          gear: simulation.model.gear.position,
          onGround: simulation.model.onGround,
          wheels: simulation.model.wheels.legs.map((leg) => leg.compression),
        }),
      };
    },
    // Ground as drawn at a world position (null while not loaded)
    groundHeight: (x, z) => geoTerrainManager.groundHeight(x, z),
    // Scripted pilot: a circuit from the last runway start, and how it went
    startCircuit: () => startCircuit(),
    pilot: () => pilot && { phase: pilot.phase, done: pilot.done, time: pilot.time, report: pilot.report },
    stopPilot: () => {
      pilot = null;
    },
    // Simulated seconds per second of real time
    setTimeScale: (scale) => {
      timeScale = Math.max(0.1, Math.min(8, scale));
      simulationClock.maxSteps = Math.ceil(MAX_DELTA_TIME * SIMULATION_RATE * timeScale);
    },
    // Runways loaded around the aircraft, and a start lined up on a runway (airport and runway as searched)
    runways: () => runwayCatalog.runways,
    startOnRunway: (airport, runway, end) => startOnRunway(airport, runway, end),
    runwayStartPending: () => runwayStart !== null,
    // Simulation flight standing on the ground at a world position and heading (degrees, clockwise from north)
    startOnGround: (x = aircraft.position.x, z = aircraft.position.z, heading = 0) => {
      update('flightMode', 'simulation');
      const placed = simulation.placeOnGround(x, z, -heading * DEG2RAD);
      chaseCameraController.reset();
      return placed;
    },
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
    controls.freeLook = CONFIG.cameraMode === 'orbit';
    const commands = controls.sample(dt);
    if (controls.device !== lastControlDevice) {
      lastControlDevice = controls.device;
      updateFlyHint();
    }
    // Leaving the crash by other means (another flight mode, a reference view, the autopilot) closes its screen
    if (crashScreen.isOpen && (flight !== simulation || !simulation.crash)) crashScreen.hide();
    const piloted = pilot && !pilot.done && flight === simulation;
    if (!piloted) flight.applyControls(commands, dt);
    benchmarkRunner.tickPath(dt, flight, renderer);

    // --- Simulation phase ---
    simulationClock.advance(dt * timeScale, (step) => {
      if (piloted) pilot.tick(simulation, step);
      flight.step(step);
      entities.fixedUpdate(step);
    });
    aircraft.interpolate(simulationClock.alpha, aircraftPose);

    // --- Aircraft state ---
    let aircraftState = null;

    if (flightPlanRecorder.autopilotActive && flightPlanRecorder.getPlan()) {
      const plan = flightPlanRecorder.getPlan();
      const ok = plan.update(dt);
      if (!ok) {
        flightPlanRecorder.autopilotActive = false;
        flight.enabled = true;
        flight.teleport(plan.position, plan.yaw, plan.pitch);
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
          thrust: true,
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
        thrust: true,
      };
    } else if (!benchmarkRunner.isRunning()) {
      const simulated = flight === simulation;
      const model = simulation.model;
      aircraftState = {
        position: aircraftPose.position,
        yaw: aircraftPose.yaw,
        pitch: aircraftPose.pitch,
        yawRate: flight.yawRate,
        pitchRate: flight.pitchRate,
        quaternion: aircraftPose.quaternion,
        thrust: flight.thrusting,
        engines: simulated
          ? { core: model.engines.core, reheat: model.engines.reheat, mach: model.mach, running: model.fuel > 0 }
          : null,
        // Flight data for the HUD and the control surfaces, in the Simulation mode
        model: simulated ? model : null,
        aim: simulated && simulation.aiming ? simulation.aim.direction : null,
        approach: simulated ? approachFor(model) : null,
        autopilot: simulated ? simulation.autopilot : null,
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
      } else if (CONFIG.cameraMode === 'orbit') {
        aircraftManager.setVisible(true);
        orbitCameraController.turn(commands.view);
        orbitCameraController.update(aircraftState, camera, dt);
      } else {
        aircraftManager.setVisible(true);
        // Simulation: behind the mouse aim, or attached to the airframe when
        // flown with the keys or the gamepad
        const attached = Boolean(aircraftState.model) && !aircraftState.aim;
        if (attached !== attachedView) {
          attachedView = attached;
          chaseCameraController.reset();
        }
        if (attached) {
          chaseCameraController.updateAttached(aircraftState, camera, dt);
        } else if (aircraftState.aim) {
          aimView.yaw = simulation.aim.yaw;
          aimView.pitch = simulation.aim.pitch;
          chaseCameraController.update(aimView, camera, dt);
        } else {
          chaseCameraController.update(aircraftState, camera, dt);
        }
      }
    }

    // --- Engine sound, heard from the camera ---
    if (aircraftState && aircraftManager.ready && !paused) {
      _toListener.subVectors(camera.position, aircraftState.position);
      const distance = _toListener.length();
      _nose.set(0, 0, -1).applyQuaternion(aircraftState.quaternion);
      engineSound.update(dt, aircraftManager.engines, {
        distance,
        ahead: distance > 0 ? _nose.dot(_toListener) / distance : 0,
        cockpit: CONFIG.cameraMode === 'cockpit',
      });
    } else {
      engineSound.update(dt, null, { distance: 0, ahead: 0, cockpit: false });
    }

    // --- Environment phase ---
    volumetricClouds?.update(dt, camera.position, aircraft.position);

    const timer = benchmarkRunner.getSubsystemTimer();

    // --- Terrain phase ---
    if (timer) timer.begin('terrain');
    // Wall-clock time: the tiles keep morphing as the camera moves in the paused menu
    geoTerrainManager.update(camera, Math.min(frameTimeMs / 1000, MAX_DELTA_TIME));
    updateRunwayStart(now);
    geoTerrainManager.runwayMarkings.update(runwayCatalog.runways, geoTerrainManager, camera.position);
    renderer.getDrawingBufferSize(_bufferSize);
    runwayLights.update(
      runwayCatalog.runways,
      geoTerrainManager,
      camera,
      _bufferSize.y,
      atmosphericSky.sunElevation,
      CONFIG.visibility,
    );
    // Runways around the aircraft, checked about once a second
    if (--catalogCountdown <= 0) {
      catalogCountdown = 60;
      const geo = geoTerrainManager.worldToGeo(aircraft.position.x, aircraft.position.z);
      if (geo) runwayCatalog.update(geo.lat, geo.lon);
    }
    if (timer) timer.end('terrain');

    const farNeeded = REALWORLD_FAR_PLANE;
    if (Math.abs(camera.far - farNeeded) > CLIP_PLANE_EPSILON) {
      camera.far = farNeeded;
      camera.near = DEFAULT_NEAR;
      camera.updateProjectionMatrix();
      Logger.debug('App', 'Realworld clip planes updated', { near: DEFAULT_NEAR, far: farNeeded });
    }
    groundElevation = geoTerrainManager.groundHeight(camera.position.x, camera.position.z) ?? groundElevation;
    if (aircraftState) {
      const { x, z } = aircraftState.position;
      aircraftGroundElevation = geoTerrainManager.groundHeight(x, z) ?? aircraftGroundElevation;
    }

    // --- Render phase ---
    atmosphericSky.groundLightsLuminance = cityLights.viewLuminance;
    atmosphericSky.update(dt);
    cityLights.update(camera, groundElevation, atmosphericSky.sunElevation, dt);
    terrainShadow?.update(renderer, camera, Math.min(frameTimeMs / 1000, MAX_DELTA_TIME));
    aircraftShadow.update();
    if (timer) timer.begin('render');
    gpuTimer.beginFrame();
    renderer.info.reset();
    scenePipeline.render(gpuTimer.rendersPerFrame);
    gpuTimer.endFrame();
    if (timer) timer.end('render');

    // --- Overlay phase ---
    if (timer) timer.begin('hud');
    if (CONFIG.cameraMode !== 'orbit') hud.update(camera, aircraftState ? aircraftGroundElevation : groundElevation, benchmarkRunner, dt, flightPlanRecorder, aircraftState);
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
