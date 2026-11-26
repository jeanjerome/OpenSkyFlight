/**
 * @description: Layout of the elevation grids, shared by the loader and the shader.
 */

/**
 * Levels coarser than a tile whose edges it can be stitched to: each tile
 * carries, for each of its edges, the profile a neighbour 1 to
 * MAX_STITCH_LEVELS levels coarser draws along it.
 */
export const MAX_STITCH_LEVELS = 4;

/**
 * Cells across the elevation grid of a tile at zoom z: a power of two, so
 * that the vertices of a coarser tile fall on vertices of its finer neighbours
 */
export function gridCells(z: number): number {
	return z >= 10 ? 64 : z >= 4 ? 32 : 16;
}
