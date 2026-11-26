/**
 * @description: Terrarium elevation loader.
 * Computes the elevation of every grid vertex from the Terrarium PNG tiles,
 * in a worker, into a float texture, and returns a flat grid geometry with
 * that texture in userData. The displacement happens on the GPU (TerrariumTSL).
 */

import {
	Box3,
	BufferGeometry,
	ByteType,
	DataTexture,
	FloatType,
	LinearFilter,
	LinearMipmapLinearFilter,
	NearestFilter,
	RedFormat,
	RGFormat,
	Sphere,
	Texture,
} from "three";
import { LoaderFactory, TileGeometryLoader, TileLoadClipParamsType } from "..";
import { version } from "../..";
import { TileGeometry } from "../../geometry/TileGeometry";
import { gridCells, NORMAL_MAP_SIZE } from "./grid";
import HeightsWorker from "./heights.worker?worker&inline";

/**
 * Terrarium elevation loader
 *
 * Every elevation is read from one function of the position on the globe:
 * the source tiles bilinearly sampled at pixel positions of their zoom level,
 * across tile boundaries. Two tiles thus give a shared edge the same
 * elevations, bit for bit: vertex positions are integers over powers of two,
 * exact in floating point.
 *
 * The height texture of a tile holds, with W = n + 2 for a grid of n x n
 * vertices (row 0 along the south edge):
 * - rows 0 to W - 1: the elevations of the grid and of a ring of vertices one
 *   cell beyond it, for normals that are centred up to the edges;
 * - then 4 x MAX_STITCH_LEVELS rows: the elevation along the west, east,
 *   south and north edges (from the south-west corner) as a neighbour d
 *   levels coarser draws it, linear between its own vertices, for d = 1 to
 *   MAX_STITCH_LEVELS. The vertex shader moves the edge onto the profile of
 *   the coarsest neighbour actually drawn there (see TerrariumTSL);
 * - then W rows: the parent's surface under the grid and ring, as the parent
 *   draws it on its triangles, which the tile morphs from as it replaces its
 *   parent and back to before it gives way to it (see Tile.morph).
 *
 * The normals come from the source itself, NORMAL_MAP_SIZE texels across
 * with their mipmaps (`userData.normalTexture`, see heights.buildNormals):
 * the grid of vertices is several times coarser.
 *
 * The source tiles are downloaded, decoded and kept by a worker, which
 * computes the elevations and normals off the main thread (see heights.worker).
 */
export class TerrariumShaderLoader extends TileGeometryLoader {
	public readonly info = {
		version,
		description: "Terrarium loader — elevations computed in a worker, seamless across tiles.",
	};

	public readonly dataType = "terrarium-shader";

	private worker: Worker | null = null;
	private requests = new Map<number, (result: HeightsResult) => void>();
	private nextId = 0;

	protected async doLoad(_url: string, params: TileLoadClipParamsType): Promise<TileGeometry> {
		const { source, x, y, z } = params;
		const { heights, width, rows, normals } = await this.computeHeights({
			x,
			y,
			z,
			maxSource: Math.min(source.maxLevel, 15),
			template: absoluteTemplate((source as unknown as { url: string }).url),
		});

		const texture = new DataTexture(heights, width, rows, RedFormat, FloatType);
		texture.generateMipmaps = false;
		texture.magFilter = NearestFilter;
		texture.minFilter = NearestFilter;
		texture.needsUpdate = true;

		// Flat grid displaced on the GPU, with bounds that enclose the elevations
		const geometry = createFlatGrid(gridCells(z) + 1, elevationRange(heights));
		geometry.userData.heightTexture = texture;
		geometry.userData.normalTexture = normalTexture(normals);
		return geometry;
	}

	/** Free the textures of a tile geometry as it is disposed */
	public unload(geometry: BufferGeometry): void {
		(geometry.userData.heightTexture as Texture | undefined)?.dispose();
		(geometry.userData.normalTexture as Texture | undefined)?.dispose();
	}

	private computeHeights(request: Omit<HeightsRequest, "id">): Promise<HeightsResult> {
		if (!this.worker) {
			this.worker = new HeightsWorker();
			this.worker.onmessage = (event: MessageEvent<HeightsResult & { id: number }>) => {
				const resolve = this.requests.get(event.data.id);
				this.requests.delete(event.data.id);
				resolve?.(event.data);
			};
		}
		const id = this.nextId++;
		return new Promise(resolve => {
			this.requests.set(id, resolve);
			this.worker!.postMessage({ ...request, id });
		});
	}
}

interface HeightsRequest {
	id: number;
	x: number;
	y: number;
	z: number;
	maxSource: number;
	template: string;
}

interface HeightsResult {
	heights: Float32Array;
	width: number;
	rows: number;
	/** Normal map and its mipmaps, finest first */
	normals: Int8Array[];
}

/** Normal map of a tile: x and y of unit normals as signed bytes, with the mipmaps computed by the worker */
function normalTexture(levels: Int8Array[]): DataTexture {
	const texture = new DataTexture(levels[0], NORMAL_MAP_SIZE, NORMAL_MAP_SIZE, RGFormat, ByteType);
	texture.mipmaps = levels.map((data, i) => ({
		data,
		width: NORMAL_MAP_SIZE >> i,
		height: NORMAL_MAP_SIZE >> i,
	})) as unknown as typeof texture.mipmaps;
	texture.generateMipmaps = false;
	texture.magFilter = LinearFilter;
	texture.minFilter = LinearMipmapLinearFilter;
	// Seen at grazing angles, like the imagery
	texture.anisotropy = LoaderFactory.textureAnisotropy;
	texture.needsUpdate = true;
	return texture;
}

/** The source URL template made absolute: the worker has no base URL of its own */
function absoluteTemplate(template: string): string {
	if (/^[a-z][a-z0-9+.-]*:/i.test(template)) return template;
	const { origin, pathname } = globalThis.location;
	return template.startsWith("/") ? origin + template : origin + pathname.replace(/[^/]*$/, "") + template;
}

/** Lowest and highest elevation of the grid, in metres */
function elevationRange(heights: Float32Array): { min: number; max: number } {
	let min = Infinity;
	let max = -Infinity;
	for (let k = 0; k < heights.length; k++) {
		const h = heights[k];
		if (h < min) min = h;
		if (h > max) max = h;
	}
	return { min, max };
}

/**
 * Flat tile grid displaced on the GPU. Its vertices sit at Z = 0 (skirt below),
 * so bounds computed from the positions alone would be flat: three would cull
 * tiles whose raised relief is on screen, and three-tile would measure LOD
 * distances from sea level. The bounds are widened by the elevation range of the
 * tile, which the GPU adds to every vertex.
 */
export class DisplacedTileGeometry extends TileGeometry {
	public elevation = { min: 0, max: 0 };

	public computeBoundingBox() {
		super.computeBoundingBox();
		// TileGeometry computes its bounds while it is constructed, before the
		// elevation range is set
		const box = this.boundingBox as Box3;
		if (this.elevation) {
			box.min.z += this.elevation.min;
			box.max.z += this.elevation.max;
		}
	}

	public computeBoundingSphere() {
		this.computeBoundingBox();
		if (!this.boundingSphere) this.boundingSphere = new Sphere();
		(this.boundingBox as Box3).getBoundingSphere(this.boundingSphere);
	}
}

/**
 * Creates a flat grid TileGeometry with the given resolution.
 * Vertices span [0,1] in X and Y with Z=0 (matching three-tile convention).
 * Skirt vertices share the same UVs as their edge counterparts, so the TSL
 * positionNode samples the same elevation — the skirt drops skirtHeight below
 * that displaced position, hiding gaps between adjacent tiles.
 */
function createFlatGrid(size: number, elevation: { min: number; max: number }): TileGeometry {
	const dem = new Float32Array(size * size);
	const geometry = new DisplacedTileGeometry();
	geometry.elevation = elevation;
	geometry.setData(dem, 1000); // 1000m skirt — GPU displacement applies to skirt too via shared UVs
	return geometry;
}
