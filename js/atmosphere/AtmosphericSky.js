import * as THREE from 'three';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { CONFIG, onChange } from '../utils/config.js';
import Logger from '../utils/Logger.js';
import { TONE_MAPPING_EXPOSURE, SUN_ILLUMINANCE_SCALE, GROUND_ALBEDO } from '../constants/rendering.js';
import SkyEnvironment from './SkyEnvironment.js';
import {
  preethamHorizonRadiance,
  preethamSkyIrradiance,
  preethamSkyRadiance,
  preethamSunTransmittance,
} from './preethamSky.js';

const DEG2RAD = Math.PI / 180;

/** Angle from the sun's centre just outside SkyMesh's solar disc (0.27° radius) */
const SUN_AUREOLE_ANGLE = 0.5 * DEG2RAD;

const luminance = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * Spherical theta (as used by Vector3.setFromSphericalCoords) of a compass bearing.
 * Theta = 0 points toward +Z, which is south since north is -Z in world space,
 * and theta = 90 points toward +X (east).
 */
function compassToTheta(compassDeg) {
  return (180 - compassDeg) * DEG2RAD;
}

export default class AtmosphericSky {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.WebGPURenderer} renderer
   * @param {{dirLight: THREE.DirectionalLight, ambientLight: THREE.AmbientLight}} lights
   * @param {import('../rendering/ScenePipeline.js').default} pipeline - receives the bloom threshold
   */
  constructor(scene, renderer, { dirLight, ambientLight }, pipeline) {
    this.scene = scene;
    this.renderer = renderer;
    this.pipeline = pipeline;
    this.dirLight = dirLight;
    this.ambientLight = ambientLight;
    this.sunDirection = new THREE.Vector3();
    this._aureoleDirection = new THREE.Vector3();

    this._fogColor = new THREE.Color();
    this._groundIrradiance = new THREE.Color();

    // SkyMesh: TSL/NodeMaterial-based sky (WebGPU compatible)
    this.sky = new SkyMesh();
    this.sky.scale.setScalar(4.5e6);
    // NodeMaterial applies scene fog by default; at the dome's distance the fog
    // would replace the whole sky with its flat color.
    this.sky.material.fog = false;
    // SkyMesh draws its own procedural cloud noise; clouds come from CloudLayer.
    this.sky.cloudCoverage.value = 0;
    // SkyMesh pins its depth to 1, which is the near plane with a reversed depth
    // buffer: draw it first, without depth testing, so the scene covers it.
    this.sky.renderOrder = -1;
    this.sky.material.depthTest = false;
    scene.add(this.sky);

    this.environment = new SkyEnvironment(renderer);

    // Initial update
    this._updateSky();

    // React to config changes
    this._unsub = onChange((key) => {
      if (['sunElevation', 'sunAzimuth', 'skyTurbidity', 'skyRayleigh', 'fogEnabled', 'fogDensity', 'textureMode', 'bloomEnabled'].includes(key)) {
        this._updateSky();
      }
    });

    Logger.info('AtmosphericSky', 'Sky initialized (SkyMesh/WebGPU)');
  }

  _isSarMode() {
    return CONFIG.textureMode === 'sar';
  }

  _updateSky() {
    // SAR radar mode: black sky, side-looking light, no fog
    if (this._isSarMode()) {
      this.sky.visible = false;
      this.scene.background = new THREE.Color(0x000000);
      this.scene.fog = null;
      // Radar imagery is display-referred: no tone mapping
      this.renderer.toneMapping = THREE.NoToneMapping;
      this.renderer.toneMappingExposure = 1;

      // Side-looking radar: low elevation, lateral azimuth
      const phi = (90 - 15) * DEG2RAD;
      const theta = 270 * DEG2RAD;
      this.sunDirection.setFromSphericalCoords(1, phi, theta);
      this.dirLight.position.copy(this.sunDirection).multiplyScalar(1e5);
      this.dirLight.intensity = 1.8;
      this.dirLight.color.set(0xffffff);
      this.ambientLight.intensity = 0.05;
      this.ambientLight.color.set(0xffffff);
      this.scene.environment = null;
      this.pipeline.setBloom(false);

      Logger.debug('AtmosphericSky', 'SAR mode — black sky, side-looking light');
      return;
    }

    // Restore sky when leaving SAR mode
    this.sky.visible = true;
    this.scene.background = null;
    this.renderer.toneMapping = THREE.AgXToneMapping;
    this.renderer.toneMappingExposure = TONE_MAPPING_EXPOSURE;

    const { sunElevation, sunAzimuth, skyTurbidity, skyRayleigh } = CONFIG;

    // Compute sun direction from elevation & azimuth
    const phi = (90 - sunElevation) * DEG2RAD;
    const theta = compassToTheta(sunAzimuth);
    this.sunDirection.setFromSphericalCoords(1, phi, theta);

    // SkyMesh uniforms (direct property access)
    this.sky.sunPosition.value.copy(this.sunDirection);
    this.sky.turbidity.value = skyTurbidity;
    this.sky.rayleigh.value = skyRayleigh;
    this.sky.mieCoefficient.value = 0.005;
    this.sky.mieDirectionalG.value = 0.75;
    const skyParams = {
      turbidity: skyTurbidity,
      rayleigh: skyRayleigh,
      mieCoefficient: this.sky.mieCoefficient.value,
      mieDirectionalG: this.sky.mieDirectionalG.value,
    };

    // Sun: direction, and color and intensity after extinction through the atmosphere
    this.dirLight.position.copy(this.sunDirection).multiplyScalar(1e5);
    const [sr, sg, sb] = preethamSunTransmittance(this.sunDirection, skyParams);
    this.dirLight.color.setRGB(sr, sg, sb);
    this.dirLight.intensity = SUN_ILLUMINANCE_SCALE;

    // Sky light: prefiltered environment map of the sky dome, with the light
    // bounced by the ground below the horizon
    const [kr, kg, kb] = preethamSkyIrradiance(this.sunDirection, skyParams);
    const cosSun = Math.max(0, this.sunDirection.y);
    this._groundIrradiance.setRGB(
      GROUND_ALBEDO * (sr * SUN_ILLUMINANCE_SCALE * cosSun + kr),
      GROUND_ALBEDO * (sg * SUN_ILLUMINANCE_SCALE * cosSun + kg),
      GROUND_ALBEDO * (sb * SUN_ILLUMINANCE_SCALE * cosSun + kb),
    );
    this.ambientLight.intensity = 0;
    // The PMREM render target is reused, so the texture keeps its identity and
    // materials are not rebuilt when the sun moves
    this.scene.environment = this.environment.update(this.sunDirection, skyParams, this._groundIrradiance);

    this._updateBloomThreshold(skyParams, kr, kg, kb);

    // Fog: tinted with the sky radiance at the horizon so distant terrain fades into the sky
    if (CONFIG.fogEnabled) {
      const [r, g, b] = preethamHorizonRadiance(this.sunDirection, skyParams);
      this._fogColor.setRGB(r, g, b);

      if (this.scene.fog instanceof THREE.FogExp2) {
        this.scene.fog.color.copy(this._fogColor);
        this.scene.fog.density = CONFIG.fogDensity;
      } else {
        this.scene.fog = new THREE.FogExp2(this._fogColor, CONFIG.fogDensity);
      }
    } else {
      this.scene.fog = null;
    }

    Logger.debug('AtmosphericSky', 'Sky updated', {
      bloomThreshold: this.bloomThreshold,
      elevation: sunElevation,
      azimuth: sunAzimuth,
      sun: this.dirLight.color.getHexString(),
    });
  }

  /**
   * Bloom threshold: the luminance of the brightest radiance that is not the sun
   * itself, so that only the solar disc and mirror-like reflections of the sun
   * bloom. That is the larger of a white diffuse surface facing the sun (sun and
   * sky irradiance over pi) and the sky just outside the solar disc, whose
   * aureole outshines every diffuse surface when the sun is low.
   */
  _updateBloomThreshold(skyParams, skyR, skyG, skyB) {
    const sun = this.dirLight.color;
    const sunIlluminance = luminance(sun.r, sun.g, sun.b) * this.dirLight.intensity;
    const peakDiffuse = (sunIlluminance + luminance(skyR, skyG, skyB)) / Math.PI;

    const elevation = Math.asin(THREE.MathUtils.clamp(this.sunDirection.y, -1, 1));
    const horizontal = Math.hypot(this.sunDirection.x, this.sunDirection.z) || 1;
    const aureoleElevation = elevation + SUN_AUREOLE_ANGLE;
    this._aureoleDirection.set(
      (this.sunDirection.x / horizontal) * Math.cos(aureoleElevation),
      Math.sin(aureoleElevation),
      (this.sunDirection.z / horizontal) * Math.cos(aureoleElevation),
    );
    const [ar, ag, ab] = preethamSkyRadiance(this._aureoleDirection, this.sunDirection, skyParams);

    this.bloomThreshold = Math.max(peakDiffuse, luminance(ar, ag, ab));
    this.pipeline.setBloom(CONFIG.bloomEnabled, this.bloomThreshold);
  }
}
