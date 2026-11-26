/**
 * @description: Elevations of a tile's grid, read from one function of the
 * position on the globe (see TerrariumShaderLoader). Runs in the elevation worker.
 */

import { gridCells, MAX_STITCH_LEVELS } from "./grid";

/** Pixels across a Terrarium tile */
export const SOURCE_TILE_SIZE = 256;

/** Decoded Terrarium tile: elevations in metres, row 0 = north edge */
export interface HeightGrid {
	size: number;
	data: Float32Array;
}

/** Reads elevations at global pixel positions of a source zoom level */
type Sampler = (zs: number, px: number, py: number) => number;

/** Source tiles of one zoom level a tile's elevations read: an inclusive range */
export interface SourceRange {
	zs: number;
	x0: number;
	y0: number;
	x1: number;
	y1: number;
}

/** Elevations of the tile (x, y, z) and its edge profiles, read through `sample` */
function buildHeights(x: number, y: number, z: number, maxSource: number, sample: Sampler) {
	const cells = gridCells(z);
	const n = cells + 1;
	const width = n + 2;
	const rows = width + 4 * MAX_STITCH_LEVELS;
	const heights = new Float32Array(width * rows);

	// Elevation at the position (X, Y) = (column, row) / cells of zoom level
	// zl, X eastward and Y southward in tiles of that level. Integers over
	// powers of two: exact in floating point, the same in every tile.
	const at = (zl: number, column: number, row: number, cellsAcross: number) => {
		const zs = Math.min(zl, maxSource);
		const scale = (2 ** (zs - zl) * SOURCE_TILE_SIZE) / cellsAcross;
		return sample(zs, column * scale - 0.5, row * scale - 0.5);
	};

	// Grid and ring: vertex (i, j), j northward from the south edge
	for (let j = -1; j <= n; j++) {
		for (let i = -1; i <= n; i++) {
			heights[(j + 1) * width + i + 1] = at(z, x * cells + i, (y + 1) * cells - j, cells);
		}
	}

	// Edge profiles drawn by coarser neighbours: linear between their vertices
	for (let d = 1; d <= MAX_STITCH_LEVELS; d++) {
		const zc = Math.max(z - d, 0);
		const coarse = gridCells(zc);
		const toCoarse = (index: number) => (index * coarse) / (cells * 2 ** (z - zc));
		for (let edge = 0; edge < 4; edge++) {
			const row = width + edge * MAX_STITCH_LEVELS + d - 1;
			const alongX = edge >= 2;
			// West, east: fixed column; south, north: fixed row (in fine cells)
			const fixed = toCoarse([x * cells, (x + 1) * cells, (y + 1) * cells, y * cells][edge]);
			for (let k = 0; k < n; k++) {
				const position = toCoarse(alongX ? x * cells + k : (y + 1) * cells - k);
				const m = Math.floor(position);
				const f = position - m;
				const h0 = alongX ? at(zc, m, fixed, coarse) : at(zc, fixed, m, coarse);
				const h1 = f > 0 ? (alongX ? at(zc, m + 1, fixed, coarse) : at(zc, fixed, m + 1, coarse)) : h0;
				heights[row * width + k] = h0 + f * (h1 - h0);
			}
		}
	}
	return { heights, width, rows };
}

/** Ranges of source tiles, one per zoom level, that the tile's elevations read */
export function sourceRanges(x: number, y: number, z: number, maxSource: number): SourceRange[] {
	const bounds = new Map<number, number[]>();
	buildHeights(x, y, z, maxSource, (zs, px, py) => {
		const b = bounds.get(zs);
		if (b) {
			b[0] = Math.min(b[0], px);
			b[1] = Math.min(b[1], py);
			b[2] = Math.max(b[2], px);
			b[3] = Math.max(b[3], py);
		} else {
			bounds.set(zs, [px, py, px, py]);
		}
		return 0;
	});
	const ranges: SourceRange[] = [];
	for (const [zs, [minX, minY, maxX, maxY]] of bounds) {
		const last = 2 ** zs - 1;
		const tile = (p: number) => Math.min(last, Math.max(0, Math.floor(p / SOURCE_TILE_SIZE)));
		ranges.push({ zs, x0: tile(minX), y0: tile(minY), x1: tile(maxX + 1), y1: tile(maxY + 1) });
	}
	return ranges;
}

/**
 * Elevations of the tile from the decoded source tiles of its ranges
 * (`grids[k]` holds range k, row by row; null where a tile failed to load:
 * its pixels take the mean of the available corners of a sample).
 */
export function tileHeights(
	x: number,
	y: number,
	z: number,
	maxSource: number,
	ranges: SourceRange[],
	grids: (HeightGrid | null)[][],
) {
	const byLevel = new Map<number, { range: SourceRange; grids: (HeightGrid | null)[] }>();
	ranges.forEach((range, k) => byLevel.set(range.zs, { range, grids: grids[k] }));
	const size = SOURCE_TILE_SIZE;

	// Pixel (gx, gy) of level zs, NaN when its tile is missing
	const pixel = (level: { range: SourceRange; grids: (HeightGrid | null)[] }, zs: number, gx: number, gy: number) => {
		const lastPixel = 2 ** zs * size - 1;
		const px = Math.min(lastPixel, Math.max(0, gx));
		const py = Math.min(lastPixel, Math.max(0, gy));
		const { x0, y0, x1, y1 } = level.range;
		const tx = Math.min(x1, Math.max(x0, Math.floor(px / size)));
		const ty = Math.min(y1, Math.max(y0, Math.floor(py / size)));
		const grid = level.grids[(ty - y0) * (x1 - x0 + 1) + (tx - x0)];
		if (!grid) return NaN;
		const ix = Math.min(size - 1, Math.max(0, px - tx * size));
		const iy = Math.min(size - 1, Math.max(0, py - ty * size));
		return grid.data[iy * grid.size + ix];
	};

	return buildHeights(x, y, z, maxSource, (zs, px, py) => {
		const level = byLevel.get(zs)!;
		const x0 = Math.floor(px);
		const y0 = Math.floor(py);
		const fx = px - x0;
		const fy = py - y0;
		let a = pixel(level, zs, x0, y0);
		let b = pixel(level, zs, x0 + 1, y0);
		let c = pixel(level, zs, x0, y0 + 1);
		let d = pixel(level, zs, x0 + 1, y0 + 1);
		if (a !== a || b !== b || c !== c || d !== d) {
			let sum = 0;
			let count = 0;
			for (const v of [a, b, c, d]) {
				if (v === v) {
					sum += v;
					count++;
				}
			}
			const fill = count ? sum / count : 0;
			if (a !== a) a = fill;
			if (b !== b) b = fill;
			if (c !== c) c = fill;
			if (d !== d) d = fill;
		}
		const top = a + fx * (b - a);
		const bottom = c + fx * (d - c);
		return top + fy * (bottom - top);
	});
}

/** Decode a Terrarium image (h = R*256 + G + B/256 - 32768) into metres */
export function decodeTerrarium(image: ImageBitmap): HeightGrid {
	const size = image.width;
	const canvas = new OffscreenCanvas(size, size);
	const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
	ctx.drawImage(image, 0, 0);
	const rgba = ctx.getImageData(0, 0, size, size).data;
	const data = new Float32Array(size * size);
	for (let i = 0; i < data.length; i++) {
		const k = i * 4;
		data[i] = rgba[k] * 256 + rgba[k + 1] + rgba[k + 2] / 256 - 32768;
	}
	return { size, data };
}
