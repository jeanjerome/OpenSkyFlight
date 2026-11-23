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
	textureLoad,
	min,
	max,
	round,
} from "three/tsl";
import type { Texture } from "three";

// Use any for MeshStandardNodeMaterial since it's in three/webgpu, not in three types
type NodeMaterial = any;

/**
 * Apply GPU elevation to a NodeMaterial.
 *
 * Tile local space: vertices in [0,1] x [0,1], scaled via quadtree hierarchy.
 * rootTile.scale = (mapWidth, mapHeight, mapDepth=1).
 * Child tiles scale X,Y by 0.5 each level, Z stays 1.0.
 * So elevation in metres maps directly to local Z offset.
 *
 * @param material  The tile material to augment (MeshStandardNodeMaterial)
 * @param heightTex Float texture with one elevation per grid vertex (n x n, row 0 = south)
 */
export function applyTerrariumElevation(material: NodeMaterial, heightTex: Texture): void {
	const n = heightTex.image.width as number;
	const last = n - 1;
	const vNormal = varying(vec3(0.0, 0.0, 1.0)); // Z-up in tile local space

	// Exact texel of a grid vertex: no filtering, the value is the elevation at the vertex
	const heightAt = (i: any, j: any) => textureLoad(heightTex, ivec2(i, j)).r;

	material.positionNode = Fn(() => {
		const pos = positionLocal.toVar();

		// Grid indices of this vertex (skirt vertices share the UVs of the edge)
		const cell = round(uv().mul(last)).toVar();
		const i = cell.x.toInt();
		const j = cell.y.toInt();
		const elevation = heightAt(i, j);

		// Normal from central differences over the neighbouring vertices
		// (one-sided on the tile edges), in tile local space (X=east, Y=north, Z=up)
		const iL = max(i.sub(int(1)), int(0));
		const iR = min(i.add(int(1)), int(last));
		const jD = max(j.sub(int(1)), int(0));
		const jU = min(j.add(int(1)), int(last));
		const step = float(1 / last);
		const tangent = vec3(iR.sub(iL).toFloat().mul(step), float(0.0), heightAt(iR, j).sub(heightAt(iL, j)));
		const bitangent = vec3(float(0.0), jU.sub(jD).toFloat().mul(step), heightAt(i, jU).sub(heightAt(i, jD)));
		vNormal.assign(cross(tangent, bitangent).normalize());

		// Displace along Z (tile local elevation axis)
		pos.z.addAssign(elevation);
		return pos;
	})();

	material.normalNode = transformNormalToView(vNormal);
}
