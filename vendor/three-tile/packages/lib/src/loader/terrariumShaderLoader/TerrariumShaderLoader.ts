/**
 * @description: Terrarium GPU shader elevation loader.
 * Instead of decoding elevation on CPU, this loader:
 * 1. Downloads the raw Terrarium PNG
 * 2. Creates an RGBA8 texture (no decode)
 * 3. Returns a flat grid geometry with the height texture in userData
 * The actual displacement happens on GPU via TSL positionNode.
 */

import { Box3, DataTexture, FloatType, ImageLoader, NearestFilter, RedFormat, Sphere } from "three";
import { getBoundsCoord, LoaderFactory, TileGeometryLoader, TileLoadClipParamsType } from "..";
import { version } from "../..";
import { TileGeometry } from "../../geometry/TileGeometry";

/**
 * Terrarium GPU-shader elevation loader
 */
export class TerrariumShaderLoader extends TileGeometryLoader {
	public readonly info = {
		version,
		description: "Terrarium shader loader — uploads raw PNG for GPU decode via TSL positionNode.",
	};

	public readonly dataType = "terrarium-shader";

	private imageLoader = new ImageLoader(LoaderFactory.manager);

	protected async doLoad(url: string, params: TileLoadClipParamsType): Promise<TileGeometry> {
		const img = await this.imageLoader.loadAsync(url);

		const { clipBounds, z } = params;

		// Determine grid resolution based on zoom level (higher zoom = more detail)
		const gridSize = Math.min(Math.max((z + 2) * 4, 16), 128);

		// Elevations are decoded on the CPU into a float texture. Sampling the
		// RGBA8 encoding on the GPU is not exact: the red channel weighs 256 m,
		// and GPUs that filter 8-bit textures at half precision shift it by up
		// to ±16 m, a shift that jumps every 256 m of altitude and carves
		// terraces along the contour lines.
		const source = decodeTerrarium(img);
		const cropRect = getBoundsCoord(clipBounds, source.size);
		const heights = resampleHeights(source, cropRect, gridSize);

		const texture = new DataTexture(heights, gridSize, gridSize, RedFormat, FloatType);
		texture.generateMipmaps = false;
		texture.magFilter = NearestFilter;
		texture.minFilter = NearestFilter;
		texture.needsUpdate = true;

		// Create a flat grid geometry at the matching resolution, with bounds that
		// enclose the elevations the positionNode will apply
		const geometry = createFlatGrid(gridSize, elevationRange(heights));

		// Attach the height texture for the TSL positionNode to consume
		geometry.userData.heightTexture = texture;

		return geometry;
	}
}

/** Decoded Terrarium tile: elevations in metres, row 0 = north edge */
interface HeightGrid {
	size: number;
	data: Float32Array;
}

/** Decode a Terrarium PNG (h = R*256 + G + B/256 - 32768) into metres. */
function decodeTerrarium(img: HTMLImageElement | ImageBitmap): HeightGrid {
	const size = img.width;
	const canvas = new OffscreenCanvas(size, size);
	const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
	ctx.drawImage(img, 0, 0);
	const rgba = ctx.getImageData(0, 0, size, size).data;
	const data = new Float32Array(size * size);
	for (let i = 0; i < data.length; i++) {
		const k = i * 4;
		data[i] = rgba[k] * 256 + rgba[k + 1] + rgba[k + 2] / 256 - 32768;
	}
	return { size, data };
}

/**
 * Bilinearly sample the source elevations at the grid vertices.
 * Vertex (i, j) sits at u = i / (n - 1), v = j / (n - 1) of the cropped area, v
 * measured from the south edge (three-tile UV convention). Output row j is the
 * vertex row j, matching the DataTexture layout (row 0 at v = 0).
 */
function resampleHeights(
	source: HeightGrid,
	crop: { sx: number; sy: number; sw: number; sh: number },
	n: number,
): Float32Array {
	const { size, data } = source;
	const out = new Float32Array(n * n);
	const max = size - 1;
	for (let j = 0; j < n; j++) {
		// Source pixel centres are at integer + 0.5; row 0 of the source is north
		const py = Math.min(max, Math.max(0, crop.sy + (1 - j / (n - 1)) * crop.sh - 0.5));
		const y0 = Math.floor(py);
		const y1 = Math.min(max, y0 + 1);
		const fy = py - y0;
		for (let i = 0; i < n; i++) {
			const px = Math.min(max, Math.max(0, crop.sx + (i / (n - 1)) * crop.sw - 0.5));
			const x0 = Math.floor(px);
			const x1 = Math.min(max, x0 + 1);
			const fx = px - x0;
			const top = data[y0 * size + x0] * (1 - fx) + data[y0 * size + x1] * fx;
			const bottom = data[y1 * size + x0] * (1 - fx) + data[y1 * size + x1] * fx;
			out[j * n + i] = top * (1 - fy) + bottom * fy;
		}
	}
	return out;
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
