import * as THREE from 'three';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { preethamSkyRadiance } from './preethamSky.js';

/** Average albedo of the ground seen from the air (forest, meadows, rock) */
const GROUND_ALBEDO = 0.15;

/** Edge length of each cube face of the prefiltered environment map */
const ENV_MAP_SIZE = 256;

/** Angular radius of the patch hiding the solar disc (the disc itself spans 0.53°) */
const SUN_MASK_RADIUS_DEG = 1;

/**
 * Prefiltered environment map (PMREM) of the sky, used as scene.environment
 * so that surfaces receive sky light that depends on their orientation, and
 * reflections of it.
 *
 * Below the horizon SkyMesh repeats the horizon radiance, which would light
 * surfaces from underneath as brightly as from the horizon: a ground
 * hemisphere replaces it with the light bounced by the ground.
 *
 * The solar disc is masked with the surrounding sky radiance: direct sunlight
 * already comes from the directional light.
 */
export default class SkyEnvironment {
  constructor(renderer) {
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.target = null;

    this.scene = new THREE.Scene();

    this.sky = new SkyMesh();
    this.sky.scale.setScalar(10);
    this.sky.cloudCoverage.value = 0;
    this.sky.material.fog = false;
    this.sky.material.depthTest = false;
    this.sky.renderOrder = 0;
    this.scene.add(this.sky);

    const groundGeometry = new THREE.SphereGeometry(5, 32, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    this.groundMaterial = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, fog: false, depthTest: false });
    this.ground = new THREE.Mesh(groundGeometry, this.groundMaterial);
    this.ground.renderOrder = 1;
    this.scene.add(this.ground);

    const maskDistance = 4;
    const maskRadius = maskDistance * Math.tan((SUN_MASK_RADIUS_DEG * Math.PI) / 180);
    this.sunMaskMaterial = new THREE.MeshBasicNodeMaterial({ fog: false, depthTest: false });
    this.sunMask = new THREE.Mesh(new THREE.CircleGeometry(maskRadius, 24), this.sunMaskMaterial);
    this.sunMask.renderOrder = 2;
    this._maskDistance = maskDistance;
    this.scene.add(this.sunMask);
    this._offsetDir = new THREE.Vector3();
    this._radiance = [0, 0, 0];
  }

  /**
   * Re-render the environment map.
   * @param {THREE.Vector3} sunDirection - unit vector toward the sun
   * @param {{turbidity:number, rayleigh:number, mieCoefficient:number, mieDirectionalG:number}} skyParams
   * @param {THREE.Color} sunIlluminance - sun color times intensity, at normal incidence
   * @param {number[]} skyIrradiance - sky dome irradiance on flat ground [r, g, b]
   * @returns {THREE.Texture} the environment texture
   */
  update(sunDirection, skyParams, sunIlluminance, skyIrradiance) {
    this.sky.sunPosition.value.copy(sunDirection);
    this.sky.turbidity.value = skyParams.turbidity;
    this.sky.rayleigh.value = skyParams.rayleigh;
    this.sky.mieCoefficient.value = skyParams.mieCoefficient;
    this.sky.mieDirectionalG.value = skyParams.mieDirectionalG;

    // Mask the solar disc with the sky radiance just outside the mask
    this.sunMask.position.copy(sunDirection).multiplyScalar(this._maskDistance);
    this.sunMask.lookAt(0, 0, 0);
    this._offsetDir.copy(sunDirection).applyAxisAngle(this._perpendicular(sunDirection), (SUN_MASK_RADIUS_DEG * Math.PI) / 180);
    const [mr, mg, mb] = preethamSkyRadiance(this._offsetDir, sunDirection, skyParams, this._radiance);
    this.sunMaskMaterial.color.setRGB(mr, mg, mb);
    this.sunMask.visible = sunDirection.y > -0.02;

    // Lambertian ground lit by the sun and the sky: L = albedo * E / pi
    const cosSun = Math.max(0, sunDirection.y);
    const k = GROUND_ALBEDO / Math.PI;
    this.groundMaterial.color.setRGB(
      k * (sunIlluminance.r * cosSun + skyIrradiance[0]),
      k * (sunIlluminance.g * cosSun + skyIrradiance[1]),
      k * (sunIlluminance.b * cosSun + skyIrradiance[2]),
    );

    this.target = this.pmrem.fromScene(this.scene, 0, 0.1, 100, {
      size: ENV_MAP_SIZE,
      renderTarget: this.target,
    });
    return this.target.texture;
  }

  _perpendicular(v) {
    const axis = Math.abs(v.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    return axis.cross(v).normalize();
  }

  dispose() {
    this.target?.dispose();
    this.pmrem.dispose();
    this.sky.geometry.dispose();
    this.sky.material.dispose();
    this.ground.geometry.dispose();
    this.groundMaterial.dispose();
    this.sunMask.geometry.dispose();
    this.sunMaskMaterial.dispose();
  }
}
