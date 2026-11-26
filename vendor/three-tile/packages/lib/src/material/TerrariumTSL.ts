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
	positionLocal,
	sqrt,
	max,
	cameraViewMatrix,
	renderGroup,
	uv,
	texture,
	mix,
	floor,
	fract,
	select,
	round,
	modelWorldMatrix,
	cameraPosition,
	vec4,
	uniform,
	materialReference,
	If,
} from "three/tsl";
import { EARTH_RADIUS } from "../tile/curvature";
import { MAX_STITCH_LEVELS, parentRow } from "../loader/terrariumShaderLoader/grid";
import {
	ByteType,
	DataTexture,
	FloatType,
	LinearFilter,
	LinearMipmapLinearFilter,
	RedFormat,
	RGBAFormat,
	RGFormat,
	SRGBColorSpace,
	Vector2,
	Vector4,
} from "three";
import type { Mesh, Texture } from "three";

// Use any for MeshStandardNodeMaterial since it's in three/webgpu, not in three types
type NodeMaterial = any;

interface ElevationNodes {
	position: any;
	normal: any;
	/** How far the tile's surface is blended towards its parent's */
	coarseness: any;
	/** Quarter of the parent the tile covers, in the parent's UVs */
	parentOffset: any;
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
	// How far the tile's surface is blended towards its parent's (0: its own,
	// 1: its parent's), set on `object.userData.coarseness` as the tile morphs
	const coarseness: any = (uniform(0) as any).onObjectUpdate(
		({ object }: { object: Mesh }) => (object.userData.coarseness as number) ?? 0,
	);
	// Coarseness of the surfaces drawn along the west, east, south and north
	// edges, in levels above the tile's: d + f blends by f the surfaces drawn
	// d and d + 1 levels coarser (0: the tile's own, 1: its parent's). Set on
	// `object.userData.edgeLevels` by the application from the coarser side
	// of each edge, as the tiles change and morph.
	const noStitch = new Vector4();
	const edgeLevels: any = (uniform(new Vector4()) as any).onObjectUpdate(
		({ object }: { object: Mesh }) => (object.userData.edgeLevels as Vector4) ?? noStitch,
	);


	const position = Fn(() => {
		const pos = positionLocal.toVar();

		// Grid of n x n vertices and a ring of vertices around it (see
		// TerrariumShaderLoader); n depends on the tile zoom level
		const width = heightMap.size(int(0)).x.toInt().toVar();
		const last = width.sub(int(3)).toVar();
		const lastF = last.toFloat();

		// Exact texel of a vertex (i, j in [-1, n]): no filtering, the value is the elevation at the vertex
		const heightAt = (i: any, j: any) => heightMap.load(ivec2(i.add(int(1)), j.add(int(1)))).r;
		// The parent's surface under the vertex, from row parentRow(W) + j + 1
		const parentStart = width.add(int(parentRow(0) + 1));
		const parentAt = (i: any, j: any) => heightMap.load(ivec2(i.add(int(1)), j.add(parentStart))).r;

		// Grid indices of this vertex (skirt vertices share the UVs of the edge)
		const cell = round(uv().mul(lastF)).toVar();
		const i = cell.x.toInt().toVar();
		const j = cell.y.toInt().toVar();
		const own = heightAt(i, j).toVar();
		const elevation = mix(own, parentAt(i, j), coarseness).toVar();

		// Elevation along an edge as the surface d levels coarser draws it (0: the tile's own)
		const profileAt = (edge: number, d: any, k: any) =>
			select(
				d.equal(int(0)),
				own,
				heightMap.load(ivec2(k, width.add(int(edge * MAX_STITCH_LEVELS - 1)).add(d))).r,
			);

		// An edge follows the coarser surface of its two sides: no step between
		// tiles of different levels, nor between tiles morphing apart. A corner
		// follows the coarser of its two edges.
		const drawn = coarseness.toVar();
		const stitch = (onEdge: any, level: any, edge: number, k: any) => {
			If(onEdge.and(level.greaterThan(drawn)), () => {
				const d = floor(level).toInt();
				const next = d.add(int(1)).min(int(MAX_STITCH_LEVELS));
				elevation.assign(mix(profileAt(edge, d, k), profileAt(edge, next, k), fract(level)));
				drawn.assign(level);
			});
		};
		stitch(i.equal(int(0)), edgeLevels.x, 0, j);
		stitch(i.equal(last), edgeLevels.y, 1, j);
		stitch(j.equal(int(0)), edgeLevels.z, 2, i);
		stitch(j.equal(last), edgeLevels.w, 3, i);

		// Displace along Z (tile local elevation axis), less the curvature of
		// the Earth around the camera (see tile/curvature.ts). Local Z is world
		// Y in metres: the map is rotated and scaled horizontally only.
		const world = modelWorldMatrix.mul(vec4(pos.xy, float(0), float(1))).xyz;
		const offset = world.xz.sub(cameraPosition.xz);
		pos.z.addAssign(elevation.sub(offset.dot(offset).div(2 * EARTH_RADIUS)));
		return pos;
	})();

	// Quarter of the parent the tile covers, in the parent's UVs
	const noOffset = new Vector2();
	const parentOffset: any = (uniform(new Vector2()) as any).onObjectUpdate(
		({ object }: { object: Mesh }) => (object.userData.parentOffset as Vector2) ?? noOffset,
	);

	sharedNodes = { position, normal: normalNode(coarseness, parentOffset), coarseness, parentOffset };
	return sharedNodes;
}

/** Web Mercator metres to world metres horizontally (see setTerrainHorizontalScale) */
const horizontalScale: any = (uniform(1) as any).setGroup(renderGroup);

/**
 * Scale of the map horizontally, from Web Mercator metres to world metres,
 * which the normals of the terrain follow
 */
export function setTerrainHorizontalScale(scale: number): void {
	horizontalScale.value = scale;
}

/**
 * Normal of the terrain per pixel, in view space, from the normal map of the
 * tile (and of its parent as it morphs, sampled on the quarter the tile covers):
 * the source's resolution, several times finer than the grid of vertices.
 * The maps hold unit normals with the horizontal axes in Web Mercator metres:
 * they blend across tiles and levels, then go to world space, where the
 * map is scaled horizontally (and rotated: north is -Z, up is Y).
 */
function normalNode(coarseness: any, parentOffset: any): any {
	const placeholder = new DataTexture(new Int8Array([0, 0]), 1, 1, RGFormat, ByteType);
	placeholder.magFilter = LinearFilter;
	placeholder.minFilter = LinearFilter;
	placeholder.needsUpdate = true;
	const own: any = (texture(placeholder, uv()) as any).onObjectUpdate(
		({ object }: { object: Mesh }) => (object.geometry.userData.normalTexture as Texture) ?? placeholder,
	);
	const parent: any = (texture(placeholder, uv().mul(0.5).add(parentOffset)) as any).onObjectUpdate(
		({ object }: { object: Mesh }) =>
			(object.userData.parentNormalMap as Texture) ??
			(object.geometry.userData.normalTexture as Texture) ??
			placeholder,
	);
	return Fn(() => {
		const unit = (xy: any) => vec3(xy, sqrt(max(float(0), float(1).sub(xy.dot(xy)))));
		const n = (mix(unit(own.xy), unit(parent.xy), coarseness) as any).toConst();
		const world = vec3(n.x.div(horizontalScale), n.z, n.y.div(horizontalScale).negate()).normalize();
		return cameraViewMatrix.mul(vec4(world, 0)).xyz.normalize();
	})();
}

let sharedImagery: any = null;

/**
 * Builds the imagery node once for all tiles: the tile's own imagery
 * cross-faded with its parent's as the tile morphs, so that the finer imagery
 * fades in with the relief. The parent's texture is bound per object, like
 * the height map, so that every tile keeps the same compiled graph.
 */
function getImageryNode(): any {
	if (sharedImagery) return sharedImagery;
	const { coarseness, parentOffset } = getElevationNodes();

	// Shaped like the imagery: the colour space conversion and the sampler are built from it
	const placeholder = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, RGBAFormat);
	placeholder.colorSpace = SRGBColorSpace;
	placeholder.magFilter = LinearFilter;
	placeholder.minFilter = LinearMipmapLinearFilter;
	placeholder.generateMipmaps = true;
	placeholder.needsUpdate = true;

	const parentImagery: any = (texture(placeholder, uv().mul(0.5).add(parentOffset)) as any).onObjectUpdate(
		({ object, material }: { object: Mesh; material: { map?: Texture | null } }) =>
			(object.userData.parentMap as Texture) ?? material.map ?? placeholder,
	);
	sharedImagery = mix(materialReference("map", "texture"), parentImagery, coarseness);
	return sharedImagery;
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
 * a ring of vertices around the grid, the edge profiles drawn by coarser
 * neighbours and the parent's surface (see TerrariumShaderLoader).
 * `object.userData.coarseness` blends the tile's surface towards its parent's
 * as it morphs; `object.userData.edgeLevels` (a Vector4: west, east, south,
 * north) gives the coarseness of the surface drawn along each edge, which the
 * edges follow.
 *
 * @param material  The tile material to augment (MeshStandardNodeMaterial)
 */
export function applyTerrariumElevation(material: NodeMaterial): void {
	const { position, normal } = getElevationNodes();
	material.positionNode = position;
	material.normalNode = normal;
}

/**
 * Cross-fades the imagery of a tile material with the parent's as the tile
 * morphs. `object.userData.parentMap` is the parent's imagery (the tile's own
 * is used when unset) and `object.userData.parentOffset` (a Vector2) the
 * offset of the quarter the tile covers in the parent's UVs.
 *
 * @param material  The tile material, with its imagery in `map`
 */
export function applyTerrariumImagery(material: NodeMaterial): void {
	material.colorNode = getImageryNode();
}
