import * as THREE from 'three';

export default class Waypoint {
  constructor(x, y, z, yaw) {
    this.position = new THREE.Vector3(x, y, z);
    this.yaw = yaw; // radians
  }
}
