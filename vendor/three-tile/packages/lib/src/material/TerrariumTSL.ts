/**
 * @description: TSL (Three.js Shading Language) helpers for GPU terrain displacement.
 *
 * TerrariumShaderLoader decodes each Terrarium tile on the CPU into a float
 * texture holding one elevation (metres) per grid vertex. The positionNode
 * displaces the tile geometry's Z axis in local space (three-tile convention:
 * X=easting, Y=northing, Z=elevation). After TileMap.rotateX(-PI/2), Y becomes
 * world-up. The terrain is lowered by the curvature of the Earth around the
 * camera (see tile/curvature.ts).
 */

import {
	Fn,
	float,
	vec3,
	int,
	ivec2,
	cross,
	transformNormalToView,
	varying,
	positionLocal,
	uv,
	texture,
	min,
	max,
	round,
	modelWorldMatrix,
	cameraPosition,
	vec4,
	uniform,
	If,
} from "three/tsl";
import { EARTH_RADIUS } from "../tile/curvature";
import { MAX_STITCH_LEVELS } from "../loader/terrariumShaderLoader/grid";
import { DataTexture, FloatType, RedFormat, Vector4 } from "three";
import type { Mesh, Texture } from "three";

// Use any for MeshStandardNodeMaterial since it's in three/webgpu, not in three types
type NodeMaterial = any;

interface ElevationNodes {
	position: any;
	normal: any;
}

let sharedNodes: ElevationNodes | null = null;

/**
 * Builds the elevation nodes once for all tiles.
 *
 * three caches a compiled node graph per material cache key, and a node's key is
 * its id: a graph built for each tile would be compiled again for each tile, on
 * the main thread, as the tile appears. With one shared graph, tile materials
 * that differ only by their textures share a single build, like `material.map`.
 * The height texture is bound per object: the base texture node takes the
 * texture of the mesh being drawn, and its `load()` and `size()` clones read it.
 */
function getElevationNodes(): ElevationNodes {
	if (sharedNodes) return sharedNodes;

	const placeholder = new DataTexture(new Float32Array(4), 2, 2, RedFormat, FloatType);
	placeholder.needsUpdate = true;
	// Typed loosely: the installed three typings predate onObjectUpdate returning a
	// value and TextureNode.load()
	const heightMap: any = (texture(placeholder) as any).onObjectUpdate(
		({ object }: { object: Mesh }) => object.geometry.userData.heightTexture as Texture,
	);
	// Levels by which the neighbours drawn along the west, east, south and
	// north edges are coarser than the tile (0: same level or finer), set on
	// `object.userData.edgeLevels` by the application as the tiles change
	const noStitch = new Vector4();
	const edgeLevels: any = (uniform(new Vector4()) as any).onObjectUpdate(
		({ object }: { object: Mesh }) => (object.userData.edgeLevels as Vector4) ?? noStitch,
	);

	const vNormal = varying(vec3(0.0, 0.0, 1.0)); // Z-up in tile local space

	const position = Fn(() => {
		const pos = positionLocal.toVar();

		// Grid of n x n vertices and a ring of vertices around it (see
		// TerrariumShaderLoader); n depends on the tile zoom level
		const width = heightMap.size(int(0)).x.toInt().toVar();
		const last = width.sub(int(3)).toVar();
		const lastF = last.toFloat();

		// Exact texel of a vertex (i, j in [-1, n]): no filtering, the value is the elevation at the vertex
		const heightAt = (i: any, j: any) => heightMap.load(ivec2(i.add(int(1)), j.add(int(1)))).r;
		// Elevation along an edge as a neighbour d levels coarser draws it
		const profileAt = (edge: number, d: any, k: any) =>
			heightMap.load(ivec2(k, width.add(int(edge * MAX_STITCH_LEVELS - 1)).add(d))).r;

		// Grid indices of this vertex (skirt vertices share the UVs of the edge)
		const cell = round(uv().mul(lastF)).toVar();
		const i = cell.x.toInt().toVar();
		const j = cell.y.toInt().toVar();
		const elevation = heightAt(i, j).toVar();

		// On an edge along a coarser neighbour, the edge follows the neighbour's
		// edge: no step between them. A corner follows the coarsest of its two neighbours.
		const stitched = int(0).toVar();
		const stitch = (onEdge: any, level: any, edge: number, k: any) => {
			const d = level.toInt();
			If(onEdge.and(d.greaterThan(stitched)), () => {
				elevation.assign(profileAt(edge, d, k));
				stitched.assign(d);
			});
		};
		stitch(i.equal(int(0)), edgeLevels.x, 0, j);
		stitch(i.equal(last), edgeLevels.y, 1, j);
		stitch(j.equal(int(0)), edgeLevels.z, 2, i);
		stitch(j.equal(last), edgeLevels.w, 3, i);

		// Normal from central differences over the neighbouring vertices, the
		// ring included, in tile local space (X=east, Y=north, Z=up)
		const step = float(2).div(lastF);
		const tangent = vec3(step, float(0.0), heightAt(i.add(int(1)), j).sub(heightAt(i.sub(int(1)), j)));
		const bitangent = vec3(float(0.0), step, heightAt(i, j.add(int(1))).sub(heightAt(i, j.sub(int(1)))));
		vNormal.assign(cross(tangent, bitangent).normalize());

		// Displace along Z (tile local elevation axis), less the curvature of
		// the Earth around the camera (see tile/curvature.ts). Local Z is world
		// Y in metres: the map is rotated and scaled horizontally only.
		const world = modelWorldMatrix.mul(vec4(pos.xy, float(0), float(1))).xyz;
		const offset = world.xz.sub(cameraPosition.xz);
		pos.z.addAssign(elevation.sub(offset.dot(offset).div(2 * EARTH_RADIUS)));
		return pos;
	})();

	sharedNodes = { position, normal: transformNormalToView(vNormal) };
	return sharedNodes;
}

/**
 * Apply GPU elevation to a NodeMaterial.
 *
 * Tile local space: vertices in [0,1] x [0,1], scaled via quadtree hierarchy.
 * rootTile.scale = (mapWidth, mapHeight, mapDepth=1).
 * Child tiles scale X,Y by 0.5 each level, Z stays 1.0.
 * So elevation in metres maps directly to local Z offset.
 *
 * The elevations come from `geometry.userData.heightTexture` of the mesh being
 * drawn: a float texture with one elevation per grid vertex (row 0 = south),
 * a ring of vertices around the grid and the edge profiles drawn by coarser
 * neighbours (see TerrariumShaderLoader). `object.userData.edgeLevels` (a
 * Vector4: west, east, south, north) says how much coarser the neighbours
 * drawn along each edge are; the edges follow them.
 *
 * @param material  The tile material to augment (MeshStandardNodeMaterial)
 */
export function applyTerrariumElevation(material: NodeMaterial): void {
	const { position, normal } = getElevationNodes();
	material.positionNode = position;
	material.normalNode = normal;
}
