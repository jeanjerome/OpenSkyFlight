/**
 * @description: TSL (Three.js Shading Language) helpers for Terrarium GPU elevation decode.
 * Ported from geo-three's MapHeightNodeShader TSL pipeline.
 *
 * Terrarium encoding: h = R*256 + G + B/256 - 32768  (metres)
 *
 * The positionNode displaces the tile geometry's Z axis in local space
 * (three-tile convention: X=easting, Y=northing, Z=elevation).
 * After TileMap.rotateX(-PI/2), Y becomes world-up.
 */

import {
	Fn,
	float,
	vec2,
	vec3,
	cross,
	transformNormalToView,
	varying,
	positionLocal,
	uv,
	texture as tslTexture,
} from "three/tsl";
import type { Texture } from "three";

// Use any for MeshStandardNodeMaterial since it's in three/webgpu, not in three types
type NodeMaterial = any;

/**
 * Decode a Terrarium RGBA sample into elevation (metres).
 * Formula: h = R * 65280 + G * 255 + B * (255/256) - 32768
 * (65280 = 255 * 256, accounting for 8-bit → float normalisation by Three.js)
 */
export const decodeTerrariumTSL = /* @__PURE__ */ Fn(([sample]: [any]) => {
	return sample.r
		.mul(65280.0)
		.add(sample.g.mul(255.0))
		.add(sample.b.mul(float(255.0).div(256.0)))
		.sub(32768.0);
});

/**
 * Apply Terrarium GPU elevation to a NodeMaterial.
 *
 * Tile local space: vertices in [0,1] x [0,1], scaled via quadtree hierarchy.
 * rootTile.scale = (mapWidth, mapHeight, mapDepth=1).
 * Child tiles scale X,Y by 0.5 each level, Z stays 1.0.
 * So elevation in metres maps directly to local Z offset.
 *
 * @param material  The tile material to augment (MeshStandardNodeMaterial)
 * @param heightTex The raw Terrarium PNG texture (RGBA8, linear)
 * @returns Object with the heightTextureNode for later reference
 */
export function applyTerrariumElevation(
	material: NodeMaterial,
	heightTex: Texture,
) {
	const heightTextureNode = tslTexture(heightTex);
	const vNormal = varying(vec3(0.0, 0.0, 1.0)); // Z-up in tile local space

	material.positionNode = Fn(() => {
		const pos = positionLocal.toVar();
		const currentUv = uv();

		// Sample height texture at current UV
		const heightSample = tslTexture(heightTex, currentUv);
		const elevation = decodeTerrariumTSL(heightSample);

		// Analytical normals via finite differences
		const texelSize = float(1.0).div(128.0);
		const hRight = decodeTerrariumTSL(tslTexture(heightTex, currentUv.add(vec2(texelSize, 0.0))));
		const hUp = decodeTerrariumTSL(tslTexture(heightTex, currentUv.add(vec2(0.0, texelSize))));

		// Normal computation in tile local space (X=east, Y=north, Z=up)
		const worldStep = texelSize;
		const tangent = vec3(worldStep, float(0.0), hRight.sub(elevation));
		const bitangent = vec3(float(0.0), worldStep, hUp.sub(elevation));
		vNormal.assign(cross(tangent, bitangent).normalize());

		// Displace along Z (tile local elevation axis)
		pos.z.addAssign(elevation);
		return pos;
	})();

	material.normalNode = transformNormalToView(vNormal);

	return { heightTextureNode };
}
