import * as THREE from 'three';
import { CONFIG } from '../utils/config.js';
import { RAYCAST_ALTITUDE } from '../constants/terrain.js';

/**
 * Creates a ground elevation function that works in both terrain modes.
 * Eliminates duplication of the getGround callback in app.js.
 */
export function createGroundElevationFn(geoTerrainManager, chunkManager, groundRaycaster, downDirection) {
  return (x, z) => {
    if (CONFIG.terrainMode === 'realworld') {
      return geoTerrainManager.getGroundElevation(x, z);
    }
    groundRaycaster.set(new THREE.Vector3(x, RAYCAST_ALTITUDE, z), downDirection);
    const hits = groundRaycaster.intersectObjects(chunkManager.getMeshes(), false);
    return hits.length > 0 ? hits[0].point.y : 0;
  };
}
