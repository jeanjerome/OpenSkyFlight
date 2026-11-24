/**
 * Curvature of the Earth on a flat tile map.
 *
 * The map is laid flat, while the horizon, the atmosphere and the distant
 * relief belong to a round Earth. Around the camera, a point at horizontal
 * distance d lies d² / 2R below the tangent plane (0.8 km at 100 km, 3.1 km at
 * 200 km): the terrain is lowered by that much on the GPU, so that distant
 * peaks sit at their true height in the view and the terrain meets the
 * horizon of the sphere. Horizontal positions are left as they are (the arc
 * and its chord differ by d³ / 6R², 4 m at 200 km).
 */

/** Mean radius of the Earth (m) */
export const EARTH_RADIUS = 6371008.8;

/** Drop of the ground below the camera's tangent plane at a horizontal distance (m) */
export function curvatureDrop(distance: number): number {
	return (distance * distance) / (2 * EARTH_RADIUS);
}
