/**
 *@description: Tile material (patched for WebGPU NodeMaterial)
 *@author: 郭江峰
 *@date: 2023-04-05
 */

import { FrontSide, Material, MeshStandardNodeMaterial, Texture } from "three";

/**
 * Tile material interface
 */
export interface ITileMaterial extends Material {
	map?: Texture | null;
}

/**
 * Tile material — WebGPU-compatible via MeshStandardNodeMaterial
 */
export class TileMaterial extends MeshStandardNodeMaterial {
	constructor(params: Record<string, unknown> = {}) {
		super({ ...{ transparent: false, side: FrontSide }, ...params });
	}
}
