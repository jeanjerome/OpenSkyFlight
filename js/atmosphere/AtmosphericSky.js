import * as THREE from 'three';
import { EnvironmentNode, MeshStandardNodeMaterial, NodeMaterial } from 'three/webgpu';
import { Fn, If, context, luminance, max, uniform, vec2, vec3 } from 'three/tsl';
import { Ellipsoid, Geodetic } from '@takram/three-geospatial';
import {
  AtmosphereContext,
  AtmosphereLight,
  AtmosphereLightNode,
  aerialPerspective,
  getIndirectLuminance,
  getSplitIlluminance,
  sky,
  skyEnvironment,
} from '@takram/three-atmosphere/webgpu';
import { CONFIG, onChange, update as updateConfig } from '../utils/config.js';
import Logger from '../utils/Logger.js';
import AerialPerspectiveVolume from './AerialPerspectiveVolume.js';
import { DAYS_PER_YEAR, sunPosition } from './sunPosition.js';
import { TONE_MAPPING_EXPOSURE } from '../constants/rendering.js';

const DEG2RAD = Math.PI / 180;

/** Angle from the sun's centre just outside the solar disc (0.27° radius) and its limb */
const SUN_AUREOLE_ANGLE = 0.5 * DEG2RAD;

/** Contrast threshold of the meteorological visibility (Koschmieder): -ln(0.02) */
const VISIBILITY_CONTRAST = Math.log(50);

/** Distance the camera moves before the sky environment map is rendered again (m) */
const ENVIRONMENT_DISTANCE_THRESHOLD = 5000;

/**
 * Angle the sun moves before the sky environment map is rendered again: the
 * map only feeds reflections, and with accelerated time a smaller angle would
 * render it many times a second
 */
const ENVIRONMENT_ANGULAR_THRESHOLD = 0.5 * DEG2RAD;

AtmosphereLight.registerNode(AtmosphereLightNode);

/**
 * Image-based lighting reduced to its reflections: the diffuse sky light comes
 * from AtmosphereLight, evaluated at each surface point from the irradiance
 * table (it accounts for the altitude of the point, where the environment map
 * is the sky seen from the camera only). The irradiance three's EnvironmentNode
 * computes goes into a variable nothing reads, which the shader compiler drops.
 */
class ReflectionEnvironmentNode extends EnvironmentNode {
  static get type() {
    return 'ReflectionEnvironmentNode';
  }

  setup(builder) {
    const { context } = builder;
    const iblIrradiance = context.iblIrradiance;
    context.iblIrradiance = vec3().toVar();
    super.setup(builder);
    context.iblIrradiance = iblIrradiance;
  }
}

// Every PBR material (the physical material extends the standard one), glTF
// materials converted by the renderer included
MeshStandardNodeMaterial.prototype.setupEnvironment = function (builder) {
  const envNode = NodeMaterial.prototype.setupEnvironment.call(this, builder) ?? builder.environmentNode;
  return envNode ? new ReflectionEnvironmentNode(envNode) : null;
};

/**
 * Physically based atmosphere (Bruneton's precomputed scattering with Hillaire's
 * multiple-scattering LUT, see vendor/takram): the sky behind the scene, the
 * aerial perspective over it, and the sunlight and sky light on its surfaces,
 * all derived from the same scattering tables, in the same luminance scale.
 *
 * The model works in Earth-centred, Earth-fixed coordinates, while the world is
 * a flat map in metres (x east, y up, z south). Every frame the map is laid on
 * the tangent plane of the ellipsoid at the ground point below the camera, so
 * the camera's altitude in the atmosphere is its height above sea level;
 * scenery further away sits slightly above the curved ground (200 m at 50 km),
 * which only thins the air its light crosses.
 *
 * The sun is placed in the sky of the ground point below the camera from the
 * date and the local solar time, which the simulation clock advances at the
 * chosen speed (see update), and converted to ECEF with the same frame.
 */
export default class AtmosphericSky {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.WebGPURenderer} renderer
   * @param {THREE.Camera} camera
   * @param {{dirLight: THREE.DirectionalLight, ambientLight: THREE.AmbientLight}} lights - side-looking
   *   lighting of the SAR mode, off otherwise
   * @param {import('../rendering/ScenePipeline.js').default} pipeline
   * @param {(x: number, z: number) => ({lat: number, lon: number}|null)} worldToGeo
   */
  constructor(scene, renderer, camera, { dirLight, ambientLight }, pipeline, worldToGeo) {
    this.scene = scene;
    this.renderer = renderer;
    this.camera = camera;
    this.pipeline = pipeline;
    this.dirLight = dirLight;
    this.ambientLight = ambientLight;
    this.worldToGeo = worldToGeo;

    this.sunDirection = new THREE.Vector3();
    // Simulation clock: local solar time (hours) and day of the year. CONFIG
    // follows it minute by minute, for the settings menu (see _advanceClock).
    this._timeOfDay = CONFIG.timeOfDay;
    this._dayOfYear = CONFIG.dayOfYear;
    this._aureoleWorld = new THREE.Vector3();
    this._frame = new THREE.Matrix4();
    this._mapToNUE = new THREE.Matrix4().set(0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1);
    this._rebase = new THREE.Matrix4();
    this._geodetic = new Geodetic();
    this._groundECEF = new THREE.Vector3();

    this.atmosphere = new AtmosphereContext();
    this.atmosphere.camera = camera;
    const { mieScattering, mieExtinction } = this.atmosphere.parameters;
    this._aerosolAlbedo = mieScattering.x / mieExtinction.x;
    this._visibility = null;
    this._updateAerosols();
    // The moon is not drawn yet, but its direction must be a unit vector: the
    // environment map is rendered again whenever the angle between the
    // current and the previous direction exceeds a threshold, and the angle
    // to a null vector is 90°, every frame
    this.atmosphere.moonDirectionECEF.value.set(0, 0, -1);
    renderer.contextNode = context({
      ...renderer.contextNode.value,
      getAtmosphere: () => this.atmosphere,
    });

    // Sky, evaluated after the scene pass on the pixels it left empty (see _overScene)
    this.skyNode = sky();
    this.skyNode.showMoon = false;
    this.skyNode.showStars = false;

    // Reflections: prefiltered environment map of the sky seen from the camera,
    // with the ground below the horizon (see ReflectionEnvironmentNode)
    this.environmentNode = skyEnvironment();
    this.environmentNode.distanceThreshold = ENVIRONMENT_DISTANCE_THRESHOLD;
    this.environmentNode.angularThreshold = ENVIRONMENT_ANGULAR_THRESHOLD;

    // Direct sun and diffuse sky light, both evaluated at each surface point
    this.sunLight = new AtmosphereLight();
    scene.add(this.sunLight, this.sunLight.target);

    this._aureoleECEF = uniform(new THREE.Vector3());
    pipeline.setBloomThreshold(this._bloomThresholdNode());

    this._applyMode();
    this._unsub = onChange((key, value) => {
      // Set from the menu or a reference view, not by the clock
      if (key === 'timeOfDay' && value !== this._publishedTime) this._timeOfDay = value;
      if (key === 'dayOfYear' && value !== this._publishedDay) this._dayOfYear = value;
      if (['fogEnabled', 'aerialPerspectiveVolume', 'textureMode', 'bloomEnabled', 'autoExposure'].includes(key)) {
        this._applyMode();
      }
    });

    Logger.info('AtmosphericSky', 'Atmosphere initialized (precomputed scattering)');
  }

  /**
   * Aerosol density from the visibility setting: the extinction at sea level
   * that brings the contrast of a dark object down to 2 % at that distance
   * (green light), less what the air molecules already extinguish. The
   * scattering tables are computed again over the next frames; a change made
   * while they are being computed waits for them.
   */
  _updateAerosols() {
    const { parameters, lutNode } = this.atmosphere;
    const computing =
      lutNode.updating || (lutNode.currentVersion !== undefined && lutNode.version !== lutNode.currentVersion);
    if (CONFIG.visibility === this._visibility || computing) return;
    this._visibility = CONFIG.visibility;
    const extinction = Math.max(0, VISIBILITY_CONTRAST / (CONFIG.visibility * 1000) - parameters.rayleighScattering.y);
    parameters.mieExtinction.setScalar(extinction);
    parameters.mieScattering.setScalar(extinction * this._aerosolAlbedo);
    lutNode.needsUpdate = true;
  }

  _isSarMode() {
    return CONFIG.textureMode === 'sar';
  }

  /**
   * Bloom threshold, evaluated on the GPU from the scattering tables: the
   * luminance of the brightest radiance that is not the sun itself, so that
   * only the solar disc and mirror-like reflections of the sun bloom. That is
   * the larger of a white diffuse surface facing the sun (sun and sky
   * illuminance over pi) and the sky just outside the solar disc, whose aureole
   * outshines every diffuse surface when the sun is low.
   */
  _bloomThresholdNode() {
    const { cameraPositionUnit, altitudeCorrectionUnit, sunDirectionECEF } = this.atmosphere;
    const position = cameraPositionUnit.add(altitudeCorrectionUnit);
    const illuminance = getSplitIlluminance(position, sunDirectionECEF, sunDirectionECEF);
    const peakDiffuse = luminance(illuminance.get('direct').add(illuminance.get('indirect'))).div(Math.PI);
    const aureole = getIndirectLuminance(position, this._aureoleECEF, vec2(0), sunDirectionECEF).get('luminance');
    return max(peakDiffuse, luminance(aureole));
  }

  _applyMode() {
    // SAR radar mode: black sky, side-looking light, no atmosphere
    if (this._isSarMode()) {
      this.scene.background = new THREE.Color(0x000000);
      this.scene.environmentNode = null;
      this.sunLight.visible = false;
      this.pipeline.setAtmosphere(null);
      // Radar imagery is display-referred: no tone mapping
      this.renderer.toneMapping = THREE.NoToneMapping;
      this.renderer.toneMappingExposure = 1;

      // Side-looking radar: low elevation, lateral azimuth
      const phi = (90 - 15) * DEG2RAD;
      const theta = 270 * DEG2RAD;
      this.dirLight.position.setFromSphericalCoords(1, phi, theta).multiplyScalar(1e5);
      this.dirLight.intensity = 1.8;
      this.dirLight.color.set(0xffffff);
      this.dirLight.visible = true;
      this.ambientLight.intensity = 0.05;
      this.ambientLight.color.set(0xffffff);
      this.ambientLight.visible = true;
      this.pipeline.setBloom(false);
      this.pipeline.setAutoExposure(false);

      Logger.debug('AtmosphericSky', 'SAR mode — black sky, side-looking light');
      return;
    }

    // Pixels without geometry stay transparent black, for the sky to fill in
    this.scene.background = null;
    this.renderer.setClearColor(0x000000, 0);
    this.scene.environmentNode = this.environmentNode;
    this.sunLight.visible = true;
    this.dirLight.visible = false;
    this.ambientLight.visible = false;
    this.renderer.toneMapping = THREE.AgXToneMapping;
    this.renderer.toneMappingExposure = TONE_MAPPING_EXPOSURE;

    this.pipeline.setAtmosphere((color, depth) => this._overScene(color, depth));
    this.pipeline.setBloom(CONFIG.bloomEnabled);
    this.pipeline.setAutoExposure(CONFIG.autoExposure);
  }

  /**
   * The atmosphere over the scene pass: aerial perspective on the geometry
   * (transmittance and in-scattered light between the camera and the surface,
   * the "Distance haze" setting; read from a volume computed once per frame on
   * WebGPU, see AerialPerspectiveVolume), and the sky behind it.
   *
   * The sky is only evaluated where the scene pass left no depth, and is seen
   * through the coverage left by the transparent geometry drawn there (the
   * cloud layer, which writes no depth): the scene is cleared to transparent
   * black, so its color is the cloud premultiplied by its alpha, and the sky
   * adds behind it in proportion to 1 - alpha. Compared with a scene
   * background, the sky shader then runs only on the sky pixels instead of
   * under all the terrain.
   */
  _overScene(color, depth) {
    let surface = color;
    if (CONFIG.fogEnabled && CONFIG.aerialPerspectiveVolume && this.renderer.backend.isWebGPUBackend) {
      surface = new AerialPerspectiveVolume(color, depth, this.atmosphere, this.camera);
    } else if (CONFIG.fogEnabled) {
      surface = aerialPerspective(color, depth);
      surface.skyNode = null;
    }
    const empty = this.renderer.reversedDepthBuffer ? depth.r.lessThanEqual(0) : depth.r.greaterThanEqual(1);
    return Fn(() => {
      const result = vec3(surface.rgb).toVar();
      If(empty, () => {
        result.addAssign(this.skyNode.mul(color.a.oneMinus()));
      });
      return result;
    })();
  }

  /**
   * Advance the simulation clock by dt seconds at the chosen time speed. The
   * time and the day are published to CONFIG when the minute changes, for
   * the settings menu and for the next session.
   */
  _advanceClock(dt) {
    this._timeOfDay += (dt * CONFIG.timeSpeed) / 3600;
    while (this._timeOfDay >= 24) {
      this._timeOfDay -= 24;
      this._dayOfYear = (this._dayOfYear % DAYS_PER_YEAR) + 1;
    }
    // (the margin keeps a time set on a whole minute from rounding down to the previous one)
    const minutes = Math.floor(this._timeOfDay * 60 + 1e-6);
    if (minutes / 60 !== CONFIG.timeOfDay) {
      this._publishedTime = minutes / 60;
      updateConfig('timeOfDay', this._publishedTime);
    }
    if (this._dayOfYear !== CONFIG.dayOfYear) {
      this._publishedDay = this._dayOfYear;
      updateConfig('dayOfYear', this._dayOfYear);
    }
  }

  /**
   * Sun direction in the world frame
   * @param {number} elevationDeg - degrees above the horizon
   * @param {number} azimuthDeg - compass bearing, clockwise from north
   */
  _setSunDirection(elevationDeg, azimuthDeg) {
    const phi = (90 - elevationDeg) * DEG2RAD;
    // Spherical theta = 0 points toward +Z (south), 90° toward +X (east)
    const theta = (180 - azimuthDeg) * DEG2RAD;
    this.sunDirection.setFromSphericalCoords(1, phi, theta);

    // Just outside the solar disc, toward the zenith (for the bloom threshold)
    const elevation = Math.asin(THREE.MathUtils.clamp(this.sunDirection.y, -1, 1));
    const horizontal = Math.hypot(this.sunDirection.x, this.sunDirection.z) || 1;
    const aureoleElevation = elevation + SUN_AUREOLE_ANGLE;
    this._aureoleWorld.set(
      (this.sunDirection.x / horizontal) * Math.cos(aureoleElevation),
      Math.sin(aureoleElevation),
      (this.sunDirection.z / horizontal) * Math.cos(aureoleElevation),
    );
  }

  /**
   * Advance the clock, lay the map on the tangent plane below the camera and
   * place the sun in its sky. Call once per frame, before rendering.
   * @param {number} [dt=0] - simulated time since the previous frame (s)
   */
  update(dt = 0) {
    this._advanceClock(dt);
    if (this._isSarMode()) return;
    this._updateAerosols();
    const { x, z } = this.camera.position;
    const geo = this.worldToGeo(x, z) ?? { lat: CONFIG.lat, lon: CONFIG.lon };

    const sun = sunPosition(geo.lat, this._dayOfYear, this._timeOfDay);
    this._setSunDirection(sun.elevation, sun.azimuth);

    this._geodetic.set(geo.lon * DEG2RAD, geo.lat * DEG2RAD, 0).toECEF(this._groundECEF);
    Ellipsoid.WGS84.getNorthUpEastFrame(this._groundECEF, this._frame);
    this._rebase.makeTranslation(-x, 0, -z);
    this.atmosphere.matrixWorldToECEF.value.copy(this._frame).multiply(this._mapToNUE).multiply(this._rebase);

    const toECEF = this.atmosphere.matrixWorldToECEF.value;
    this.atmosphere.sunDirectionECEF.value.copy(this.sunDirection).transformDirection(toECEF);
    this._aureoleECEF.value.copy(this._aureoleWorld).transformDirection(toECEF);
  }
}
