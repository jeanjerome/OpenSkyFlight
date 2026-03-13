import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { CONFIG, onChange } from '../utils/config.js';
import Logger from '../utils/Logger.js';

const DEG2RAD = Math.PI / 180;

export default class AtmosphericSky {
  constructor(scene, dirLight, ambientLight) {
    this.scene = scene;
    this.dirLight = dirLight;
    this.ambientLight = ambientLight;
    this.sunDirection = new THREE.Vector3();

    // Sky mesh
    this.sky = new Sky();
    this.sky.scale.setScalar(4.5e6);
    scene.add(this.sky);

    // Initial update
    this._updateSky();

    // React to config changes
    this._unsub = onChange((key) => {
      if ([
        'sunElevation', 'sunAzimuth', 'skyTurbidity', 'skyRayleigh',
        'fogEnabled', 'fogDensity',
      ].includes(key)) {
        this._updateSky();
      }
    });

    Logger.info('AtmosphericSky', 'Sky initialized');
  }

  _updateSky() {
    const { sunElevation, sunAzimuth, skyTurbidity, skyRayleigh } = CONFIG;

    // Compute sun direction from elevation & azimuth
    const phi = (90 - sunElevation) * DEG2RAD;
    const theta = sunAzimuth * DEG2RAD;
    this.sunDirection.setFromSphericalCoords(1, phi, theta);

    // Sky uniforms
    const uniforms = this.sky.material.uniforms;
    uniforms.sunPosition.value.copy(this.sunDirection);
    uniforms.turbidity.value = skyTurbidity;
    uniforms.rayleigh.value = skyRayleigh;
    uniforms.mieCoefficient.value = 0.005;
    uniforms.mieDirectionalG.value = 0.75;

    // Sync directional light to sun
    this.dirLight.position.copy(this.sunDirection).multiplyScalar(1e5);

    // Modulate light intensity based on sun elevation
    const elevNorm = Math.max(0, sunElevation) / 90; // 0 at horizon, 1 at zenith
    const sunFactor = Math.sin(elevNorm * Math.PI / 2); // smooth ramp
    this.dirLight.intensity = 0.2 + sunFactor * 1.2;
    this.ambientLight.intensity = 0.1 + sunFactor * 0.3;

    // Fog
    if (CONFIG.fogEnabled) {
      // Interpolate fog color: warm (low sun) to cool blue (high sun)
      const warmColor = new THREE.Color(0.8, 0.5, 0.3);
      const coolColor = new THREE.Color(0.5, 0.7, 1.0);
      const fogColor = warmColor.clone().lerp(coolColor, sunFactor);

      if (this.scene.fog instanceof THREE.FogExp2) {
        this.scene.fog.color.copy(fogColor);
        this.scene.fog.density = CONFIG.fogDensity;
      } else {
        this.scene.fog = new THREE.FogExp2(fogColor, CONFIG.fogDensity);
      }
    } else {
      this.scene.fog = null;
    }

    Logger.debug('AtmosphericSky', 'Sky updated', {
      elevation: sunElevation,
      azimuth: sunAzimuth,
      dirIntensity: this.dirLight.intensity.toFixed(2),
    });
  }
}
