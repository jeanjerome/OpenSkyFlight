import * as THREE from 'three';
import { EnvironmentNode, MeshStandardNodeMaterial, NodeMaterial } from 'three/webgpu';
import { Fn, If, context, luminance, max, renderGroup, uniform, uv, vec2, vec3, vec4 } from 'three/tsl';
import { Ellipsoid, Geodetic } from '@takram/three-geospatial';
import { rayEllipsoidIntersection } from '@takram/three-geospatial/webgpu';
import {
  AtmosphereContext,
  AtmosphereLight,
  AtmosphereLightNode,
  aerialPerspective,
  getIndirectLuminance,
  getIndirectLuminanceToPoint,
  getSplitIlluminance,
  sky,
  skyEnvironment,
} from '@takram/three-atmosphere/webgpu';
import { CONFIG, onChange, update as updateConfig } from '../utils/config.js';
import Logger from '../utils/Logger.js';
import AerialPerspectiveVolume from './AerialPerspectiveVolume.js';
import { DAYS_PER_YEAR, sunPosition } from './sunPosition.js';
import { eciToEcefMatrix, julianDate, moonDirectionECI, sunDirectionECI } from './ephemeris.js';
import { NIGHT_SKY_ILLUMINANCE, moonIlluminance, moonPhaseFactor, sunIlluminance } from './skyIlluminance.js';
import {
  BLOOM_THRESHOLD_FLOOR,
  DISTANT_GROUND_ALBEDO,
  EMISSIVE_EXPOSURE_SHARE,
  SCENE_UNIT_LUMINANCE,
  NIGHT_EXPOSURE_START_ELEVATION,
  NIGHT_EXPOSURE_VISIBLE_SHARE,
  TONE_MAPPING_EXPOSURE,
} from '../constants/rendering.js';

const DEG2RAD = Math.PI / 180;

/** Angle from the centre of the sun or the moon just outside its disc (0.27° radius) and its limb */
const AUREOLE_ANGLE = 0.5 * DEG2RAD;

/** Illuminance of the full moon relative to the sun, as the atmosphere library scales moonlight */
const MOON_TO_SUN = 2.5e-6;

/**
 * The moon becomes the light of the scene when it lights the ground this many
 * times more than the twilight: the light then changes by a quarter at most
 */
const MOONLIGHT_DOMINANCE = 4;

/**
 * Illuminance of the extraterrestrial sun (lux) and its luminance in the
 * atmosphere library's unit (the luminance-weighted solar irradiance), to
 * express an illuminance in lux in that unit
 */
const SOLAR_ILLUMINANCE_LUX = 128000;
const SOLAR_ILLUMINANCE_UNIT = 1.77;

/** Color of the light of a moonless sky, bluish as night vision sees it (linear) */
const NIGHT_SKY_COLOR = new THREE.Color(0.55, 0.7, 1);

/**
 * Luminance of a moonless night sky (cd/m²): airglow and starlight
 * (2·10⁻⁴), raised by the glow of the towns as NIGHT_SKY_ILLUMINANCE is
 */
const NIGHT_SKY_LUMINANCE = 1e-3;

/** Factor by which the night exposure changes before the sky environment map is rendered again */
const ENVIRONMENT_EXPOSURE_THRESHOLD = 1.25;

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
    /** Sun elevation (degrees) below the camera, updated every frame */
    this.sunElevation = 90;
    this._sunECI = new THREE.Vector3();
    this._moonECI = new THREE.Vector3();
    this._up = new THREE.Vector3();
    // Simulation clock: local solar time (hours) and day of the year. CONFIG
    // follows it minute by minute, for the settings menu (see _advanceClock).
    this._timeOfDay = CONFIG.timeOfDay;
    this._dayOfYear = CONFIG.dayOfYear;
    this._frame = new THREE.Matrix4();
    this._mapToNUE = new THREE.Matrix4().set(0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1);
    this._rebase = new THREE.Matrix4();
    this._geodetic = new Geodetic();
    this._groundECEF = new THREE.Vector3();

    this.atmosphere = new AtmosphereContext();
    this.atmosphere.camera = camera;
    // The context's uniforms (frames, sun and camera positions) are the same
    // for every object of a render. three puts uniforms in the per-object group
    // by default, whose buffer is compared and uploaded at each draw call.
    for (const value of Object.values(this.atmosphere)) {
      if (value?.isUniformNode) value.setGroup(renderGroup);
    }
    const { mieScattering, mieExtinction, luminanceScale } = this.atmosphere.parameters;
    this._baseLuminanceScale = luminanceScale;
    this._aerosolAlbedo = mieScattering.x / mieExtinction.x;
    this._visibility = null;
    this._updateAerosols();
    // The moon's direction must be a unit vector from the start: the
    // environment map is rendered again whenever the angle between the
    // current and the previous direction exceeds a threshold, and the angle
    // to a null vector is 90°, every frame
    this.atmosphere.moonDirectionECEF.value.set(0, 0, -1);

    /**
     * Exposure applied to all the light of the scene before it is written to
     * the HDR targets: 1 by day, up to 2^14 at night (see _updateNightLight).
     * Moonlit ground is a millionth as bright as sunlit ground, below the
     * precision of half floats. The atmosphere's luminance scale carries it;
     * emissive materials (lights) multiply their luminance by this node.
     */
    this.preExposure = uniform(1).setGroup(renderGroup);
    /**
     * Exposure of light sources (lamps, flames): a share of preExposure only,
     * so that at night they stay bright points without flooding the image
     * with glare, as the eye adapted to the dark scene still sees them
     */
    this.emissiveExposure = uniform(1).setGroup(renderGroup);
    this._environmentExposure = 1;

    // The light of the scene: the sun, or the moon on a moonlit night. Its
    // direction and its brightness relative to the sun, for the light
    // scattered by the air (aerial perspective) and the bloom threshold.
    this.lightDirectionECEF = uniform(new THREE.Vector3(0, 0, 1)).setGroup(renderGroup);
    this.lightScale = uniform(1).setGroup(renderGroup);
    // Glow of the night sky behind the atmosphere's (see _overScene)
    this._nightSkyGlow = uniform(new THREE.Color()).setGroup(renderGroup);
    // Camera matrices for the view rays of the distant ground (see _distantGround)
    this._projectionInverse = uniform(new THREE.Matrix4()).setGroup(renderGroup);
    this._projectionInverse.onRenderUpdate(() => camera.projectionMatrixInverse);
    this._cameraWorld = uniform(new THREE.Matrix4()).setGroup(renderGroup);
    this._cameraWorld.onRenderUpdate(() => camera.matrixWorld);
    renderer.contextNode = context({
      ...renderer.contextNode.value,
      getAtmosphere: () => this.atmosphere,
    });

    // Sky, evaluated after the scene pass on the pixels it left empty (see _overScene)
    this.skyNode = sky();
    this.skyNode.moonScattering = true;

    // Reflections: prefiltered environment map of the sky seen from the camera,
    // with the ground below the horizon (see ReflectionEnvironmentNode)
    this.environmentNode = skyEnvironment();
    this.environmentNode.distanceThreshold = ENVIRONMENT_DISTANCE_THRESHOLD;
    this.environmentNode.angularThreshold = ENVIRONMENT_ANGULAR_THRESHOLD;

    // Direct light and diffuse sky light, both evaluated at each surface point,
    // from the sun or from the moon (see _updateNightLight)
    this.sunLight = new AtmosphereLight();
    scene.add(this.sunLight, this.sunLight.target);

    this._aureoleECEF = uniform(new THREE.Vector3()).setGroup(renderGroup);
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
   * luminance of the brightest radiance that is not the sun (or the moon)
   * itself, so that only its disc, mirror-like reflections of it and lights
   * bloom. That is the larger of a white diffuse surface facing it (its light
   * and the sky's over pi) and the sky just outside its disc, whose aureole
   * outshines every diffuse surface when it is low. At night both fade out:
   * a floor keeps the moonlit scene and the stars from blooming.
   */
  _bloomThresholdNode() {
    const { cameraPositionUnit, altitudeCorrectionUnit } = this.atmosphere;
    const direction = this.lightDirectionECEF;
    const position = cameraPositionUnit.add(altitudeCorrectionUnit);
    const illuminance = getSplitIlluminance(position, direction, direction);
    const peakDiffuse = luminance(illuminance.get('direct').add(illuminance.get('indirect'))).div(Math.PI);
    const aureole = luminance(getIndirectLuminance(position, this._aureoleECEF, vec2(0), direction).get('luminance'));
    return max(max(peakDiffuse, aureole).mul(this.lightScale), BLOOM_THRESHOLD_FLOOR);
  }

  _applyMode() {
    // SAR radar mode: black sky, side-looking light, no atmosphere
    if (this._isSarMode()) {
      this.scene.background = new THREE.Color(0x000000);
      this.scene.environmentNode = null;
      this.sunLight.visible = false;
      this.pipeline.setAtmosphere(null);
      this.pipeline.setNightVision(null);
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
    // Starlight and airglow, set with the night exposure (see _updateNightLight)
    this.ambientLight.color.copy(NIGHT_SKY_COLOR);
    this.ambientLight.intensity = 0;
    this.ambientLight.visible = true;
    this.renderer.toneMapping = THREE.AgXToneMapping;
    this.renderer.toneMappingExposure = TONE_MAPPING_EXPOSURE;

    this.pipeline.setAtmosphere((color, depth) => this._overScene(color, depth));
    this.pipeline.setNightVision(this.preExposure);
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
      surface = new AerialPerspectiveVolume(color, depth, this.atmosphere, this.camera, {
        directionECEF: this.lightDirectionECEF,
        scale: this.lightScale,
      });
    } else if (CONFIG.fogEnabled) {
      surface = aerialPerspective(color, depth);
      surface.skyNode = null;
      surface.moonScattering = true;
    }
    const empty = this.renderer.reversedDepthBuffer ? depth.r.lessThanEqual(0) : depth.r.greaterThanEqual(1);
    return Fn(() => {
      const result = vec3(surface.rgb).toVar();
      If(empty, () => {
        const behind = this.skyNode.add(this._nightSkyGlow).toVar();
        this._distantGround(behind);
        result.addAssign(behind.mul(color.a.oneMinus()));
      });
      return result;
    })();
  }

  /**
   * The ground beyond the terrain tiles, where the view ray meets the
   * ellipsoid: replaces, in `luminance`, the sky the atmosphere library draws
   * below the horizon, which is only the light scattered by the air along the
   * ray, jumps at the horizon (its scattering table switches there between
   * rays that reach the ground and rays that leave the atmosphere) and leaves
   * a bright band between the edge of the terrain and the horizon. The ground
   * is a diffuse surface of DISTANT_GROUND_ALBEDO lit by the sun (or the moon)
   * and the sky, seen through the air between it and the camera. The terrain,
   * lowered by the curvature of the Earth, meets it at the horizon.
   * @param {Node} luminance - vec3 variable, the sky behind the pixel
   */
  _distantGround(luminance) {
    const { atmosphere } = this;
    const { worldToUnit } = atmosphere.parameters;
    const { matrixWorldToECEF, cameraPositionUnit, altitudeCorrectionUnit } = atmosphere;
    const radii = vec3(atmosphere.ellipsoid.radii).mul(worldToUnit);

    const screen = uv();
    const ndc = vec2(screen.x, screen.y.oneMinus()).mul(2).sub(1);
    const target = this._projectionInverse.mul(vec4(ndc, 0.5, 1));
    const directionWorld = this._cameraWorld.mul(vec4(target.xyz.div(target.w).normalize(), 0)).xyz;
    const direction = matrixWorldToECEF.mul(vec4(directionWorld, 0)).xyz.normalize().toConst();
    const hit = rayEllipsoidIntersection(cameraPositionUnit, direction, radii).x.toConst();
    If(hit.greaterThanEqual(0), () => {
      const point = cameraPositionUnit.add(direction.mul(hit)).toConst();
      const normal = point.div(radii.pow2()).normalize();
      const origin = cameraPositionUnit.add(altitudeCorrectionUnit);
      const ground = point.add(altitudeCorrectionUnit);
      const light = this.lightDirectionECEF;
      const illuminance = getSplitIlluminance(ground, normal, light);
      const reflected = illuminance
        .get('direct')
        .add(illuminance.get('indirect'))
        .mul(this.lightScale)
        .div(Math.PI)
        .add(this._nightSkyGlow)
        .mul(vec3(...DISTANT_GROUND_ALBEDO));
      const scattering = getIndirectLuminanceToPoint(origin, ground, vec2(0), light).toConst();
      luminance.assign(reflected.mul(scattering.get('transmittance')).add(scattering.get('luminance').mul(this.lightScale)));
    });
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
  }

  /**
   * The moon, the stars and the light level at night. The moon's place and the
   * Earth's rotation (for the stars) come from the date at the camera's
   * longitude. The illuminance of the ground by the sun, the twilight sky and
   * the moon sets the exposure before the scene (preExposure): once the sun
   * is lower than NIGHT_EXPOSURE_START_ELEVATION, it makes up for the falling
   * light, so that only NIGHT_EXPOSURE_VISIBLE_SHARE of the drop (in stops)
   * remains visible. When the moon outshines the twilight, it becomes the
   * light of the scene, with its phase.
   */
  _updateNightLight(geo, sunElevation) {
    const { atmosphere } = this;
    const jd = julianDate(this._dayOfYear, this._timeOfDay, geo.lon);
    const eciToEcef = eciToEcefMatrix(jd, atmosphere.matrixECIToECEF.value);
    sunDirectionECI(jd, this._sunECI);
    moonDirectionECI(jd, this._moonECI);
    const phaseAngle = 180 - this._sunECI.angleTo(this._moonECI) / DEG2RAD;
    const moonECEF = atmosphere.moonDirectionECEF.value.copy(this._moonECI).applyMatrix4(eciToEcef);

    this._up.setFromMatrixColumn(this._frame, 1);
    const moonElevation = Math.asin(THREE.MathUtils.clamp(moonECEF.dot(this._up), -1, 1)) / DEG2RAD;
    const twilight = sunIlluminance(sunElevation);
    const moonlight = moonIlluminance(moonElevation, phaseAngle);
    const total = twilight + moonlight + NIGHT_SKY_ILLUMINANCE;
    const drop = Math.max(0, Math.log2(sunIlluminance(NIGHT_EXPOSURE_START_ELEVATION) / total));
    const preExposure = 2 ** ((1 - NIGHT_EXPOSURE_VISIBLE_SHARE) * drop);
    this.preExposure.value = preExposure;
    this.emissiveExposure.value = preExposure ** EMISSIVE_EXPOSURE_SHARE;
    atmosphere.parameters.luminanceScale = this._baseLuminanceScale * preExposure;
    const change = preExposure / this._environmentExposure;
    if (change > ENVIRONMENT_EXPOSURE_THRESHOLD || change < 1 / ENVIRONMENT_EXPOSURE_THRESHOLD) {
      this._environmentExposure = preExposure;
      this.environmentNode.needsUpdate = true;
    }

    // The light of the night sky, which the atmosphere does not model, as an
    // ambient light: on a moonless night it is all that shows the ground
    this.ambientLight.intensity =
      ((NIGHT_SKY_ILLUMINANCE * SOLAR_ILLUMINANCE_UNIT) / SOLAR_ILLUMINANCE_LUX) * preExposure;
    this._nightSkyGlow.value
      .copy(NIGHT_SKY_COLOR)
      .multiplyScalar((NIGHT_SKY_LUMINANCE / SCENE_UNIT_LUMINANCE) * preExposure);

    const moonLit = moonlight > MOONLIGHT_DOMINANCE * twilight;
    const phase = moonPhaseFactor(phaseAngle);
    this.sunLight.body = moonLit ? 'moon' : 'sun';
    this.sunLight.intensity = moonLit ? phase : 1;
    this.lightScale.value = moonLit ? MOON_TO_SUN * phase : 1;
    const direction = this.lightDirectionECEF.value.copy(moonLit ? moonECEF : atmosphere.sunDirectionECEF.value);

    // Just outside the disc, toward the zenith (for the bloom threshold)
    const toZenith = this._aureoleECEF.value.copy(this._up).addScaledVector(direction, -direction.dot(this._up));
    if (toZenith.lengthSq() < 1e-12) toZenith.set(1, 0, 0);
    toZenith.normalize().multiplyScalar(Math.sin(AUREOLE_ANGLE)).addScaledVector(direction, Math.cos(AUREOLE_ANGLE));
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
    this.sunElevation = sun.elevation;
    this._setSunDirection(sun.elevation, sun.azimuth);

    this._geodetic.set(geo.lon * DEG2RAD, geo.lat * DEG2RAD, 0).toECEF(this._groundECEF);
    Ellipsoid.WGS84.getNorthUpEastFrame(this._groundECEF, this._frame);
    this._rebase.makeTranslation(-x, 0, -z);
    this.atmosphere.matrixWorldToECEF.value.copy(this._frame).multiply(this._mapToNUE).multiply(this._rebase);

    const toECEF = this.atmosphere.matrixWorldToECEF.value;
    this.atmosphere.sunDirectionECEF.value.copy(this.sunDirection).transformDirection(toECEF);
    this._updateNightLight(geo, sun.elevation);
  }
}
