import * as THREE from 'three';
import { CONFIG } from '../utils/config.js';
import { WATER_PLANE_SIZE, WATER_COLOR, WATER_OPACITY, WATER_RENDER_ORDER } from '../constants/rendering.js';

export default class WaterPlane {
  constructor(scene) {
    this._scene = scene;
    this._mesh = this._create();
    scene.add(this._mesh);
  }

  get mesh() {
    return this._mesh;
  }

  _create() {
    const geo = new THREE.PlaneGeometry(WATER_PLANE_SIZE, WATER_PLANE_SIZE, 1, 1);
    const mat = new THREE.MeshBasicNodeMaterial({
      color: WATER_COLOR,
      wireframe: CONFIG.wireframe,
      transparent: true,
      opacity: WATER_OPACITY,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = CONFIG.maxHeight * CONFIG.waterLevel;
    mesh.renderOrder = WATER_RENDER_ORDER;
    return mesh;
  }

  recreate() {
    this._scene.remove(this._mesh);
    this._mesh.geometry.dispose();
    this._mesh.material.dispose();
    this._mesh = this._create();
    this._mesh.visible = CONFIG.terrainMode === 'procedural';
    this._scene.add(this._mesh);
  }

  followCamera(cameraPosition) {
    this._mesh.position.x = cameraPosition.x;
    this._mesh.position.z = cameraPosition.z;
  }

  updateWaterLevel() {
    this._mesh.position.y = CONFIG.maxHeight * CONFIG.waterLevel;
  }

  set visible(v) {
    this._mesh.visible = v;
  }

  set wireframe(v) {
    this._mesh.material.wireframe = v;
  }
}
