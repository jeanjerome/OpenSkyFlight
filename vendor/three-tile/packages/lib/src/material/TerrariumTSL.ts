/**
 * @description: TSL (Three.js Shading Language) helpers for GPU terrain displacement.
 *
 * TerrariumShaderLoader decodes each Terrarium tile on the CPU into a float
 * texture holding one elevation (metres) per grid vertex. The positionNode
 * displaces the tile geometry's Z axis in local space (three-tile convention:
 * X=easting, Y=northing, Z=elevation). After TileMap.rotateX(-PI/2), Y becomes
 * world-up.
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
} from "three/tsl";
import { DataTexture, FloatType, RedFormat } from "three";
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

	const vNormal = varying(vec3(0.0, 0.0, 1.0)); // Z-up in tile local space

	const position = Fn(() => {
		const pos = positionLocal.toVar();

		// Grid of n x n vertices; n depends on the tile zoom level
		const last = heightMap.size(int(0)).x.toInt().sub(int(1)).toVar();
		const lastF = last.toFloat();

		// Exact texel of a grid vertex: no filtering, the value is the elevation at the vertex
		const heightAt = (i: any, j: any) => heightMap.load(ivec2(i, j)).r;

		// Grid indices of this vertex (skirt vertices share the UVs of the edge)
		const cell = round(uv().mul(lastF)).toVar();
		const i = cell.x.toInt();
		const j = cell.y.toInt();
		const elevation = heightAt(i, j);

		// Normal from central differences over the neighbouring vertices
		// (one-sided on the tile edges), in tile local space (X=east, Y=north, Z=up)
		const iL = max(i.sub(int(1)), int(0));
		const iR = min(i.add(int(1)), last);
		const jD = max(j.sub(int(1)), int(0));
		const jU = min(j.add(int(1)), last);
		const step = float(1).div(lastF);
		const tangent = vec3(iR.sub(iL).toFloat().mul(step), float(0.0), heightAt(iR, j).sub(heightAt(iL, j)));
		const bitangent = vec3(float(0.0), jU.sub(jD).toFloat().mul(step), heightAt(i, jU).sub(heightAt(i, jD)));
		vNormal.assign(cross(tangent, bitangent).normalize());

		// Displace along Z (tile local elevation axis)
		pos.z.addAssign(elevation);
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
 * drawn: a float texture with one elevation per grid vertex (n x n, row 0 = south).
 *
 * @param material  The tile material to augment (MeshStandardNodeMaterial)
 */
export function applyTerrariumElevation(material: NodeMaterial): void {
	const { position, normal } = getElevationNodes();
	material.positionNode = position;
	material.normalNode = normal;
}
