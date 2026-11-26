/**
 * @description: Elevations of a tile's grid, read from one function of the
 * position on the globe (see TerrariumShaderLoader). Runs in the elevation worker.
 */

import { gridCells, MAX_STITCH_LEVELS, NORMAL_MAP_SIZE, parentRow } from "./grid";

/** Pixels across a Terrarium tile */
export const SOURCE_TILE_SIZE = 256;

/** Width of the Web Mercator map in metres: the equator's length */
const MAP_WIDTH = 2 * Math.PI * 6378137;

/**
 * Least distance (true metres) on either side of a texel that its normal's
 * differences span: the source's elevations are whole metres, upsampled
 * beyond the SRTM's 30 m, and differences over closer pixels draw their steps
 * as stripes on gentle slopes
 */
const NORMAL_BASELINE = 25;

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
	const rows = parentRow(width) + width;
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

	// The parent's surface under every vertex of the grid and ring, as the
	// parent draws it: on its triangles, split along the diagonal from the
	// south-east to the north-west vertex of each cell (three-tile's grid
	// indices). The tile morphs from it as it replaces its parent.
	const zp = Math.max(z - 1, 0);
	const parentCells = gridCells(zp);
	const toParent = (index: number) => (index * parentCells) / (cells * 2 ** (z - zp));
	// Position (X, Y) in parent cells, X eastward and Y southward
	const parentAt = (X: number, Y: number) => {
		const m = Math.floor(X);
		const r = Math.floor(Y);
		const fx = X - m;
		const fs = Y - r;
		const v = (column: number, row: number) => at(zp, column, row, parentCells);
		// Only the vertices with a weight are read: the others may lie in source tiles not fetched
		if (fs === 0) return fx === 0 ? v(m, r) : v(m, r) + fx * (v(m + 1, r) - v(m, r));
		if (fx === 0) return v(m, r) + fs * (v(m, r + 1) - v(m, r));
		const fn = 1 - fs;
		if (fx + fn <= 1) {
			const sw = v(m, r + 1);
			return sw + fx * (v(m + 1, r + 1) - sw) + fn * (v(m, r) - sw);
		}
		const ne = v(m + 1, r);
		return ne + (1 - fx) * (v(m, r) - ne) + (1 - fn) * (v(m + 1, r + 1) - ne);
	};
	const base = parentRow(width);
	for (let j = -1; j <= n; j++) {
		for (let i = -1; i <= n; i++) {
			heights[(base + j + 1) * width + i + 1] = parentAt(toParent(x * cells + i), toParent((y + 1) * cells - j));
		}
	}
	return { heights, width, rows };
}

/** Ranges of source tiles, one per zoom level, that the tile's elevations read */
export function sourceRanges(x: number, y: number, z: number, maxSource: number): SourceRange[] {
	const bounds = new Map<number, number[]>();
	const collect: Sampler = (zs, px, py) => {
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
	};
	buildHeights(x, y, z, maxSource, collect);
	normalHeights(x, y, z, maxSource, collect);
	const ranges: SourceRange[] = [];
	for (const [zs, [minX, minY, maxX, maxY]] of bounds) {
		const last = 2 ** zs - 1;
		const tile = (p: number) => Math.min(last, Math.max(0, Math.floor(p / SOURCE_TILE_SIZE)));
		ranges.push({ zs, x0: tile(minX), y0: tile(minY), x1: tile(maxX + 1), y1: tile(maxY + 1) });
	}
	return ranges;
}

/**
 * Elevations and normals of the tile from the decoded source tiles of its
 * ranges (`grids[k]` holds range k, row by row; null where a tile failed to
 * load: its pixels take the mean of the available corners of a sample).
 */
export function tileData(
	x: number,
	y: number,
	z: number,
	maxSource: number,
	ranges: SourceRange[],
	grids: (HeightGrid | null)[][],
) {
	const sample = sampler(ranges, grids);
	return { ...buildHeights(x, y, z, maxSource, sample), normals: buildNormals(x, y, z, maxSource, sample) };
}

/** Bilinear sampler of the source tiles of the ranges, at pixel positions of their zoom levels */
function sampler(ranges: SourceRange[], grids: (HeightGrid | null)[][]): Sampler {
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

	return (zs, px, py) => {
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
	};
}

/**
 * Elevations the normals of the tile are drawn from: at the texel centres
 * and in a ring of k texels around them (row 0 along the north edge, w
 * across), k texels being at least NORMAL_BASELINE; `scale` turns the
 * difference across 2k texels into a slope per Mercator metre
 */
function normalHeights(x: number, y: number, z: number, maxSource: number, sample: Sampler) {
	const n = NORMAL_MAP_SIZE;
	const zs = Math.min(z, maxSource);
	// Source pixels across the tile and per texel, and Mercator metres per source pixel
	const pixels = SOURCE_TILE_SIZE * 2 ** (zs - z);
	const step = pixels / n;
	const metres = MAP_WIDTH / (SOURCE_TILE_SIZE * 2 ** zs);
	// True metres are Mercator metres times the cosine of the latitude
	const latitude = Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 0.5)) / 2 ** z)));
	const k = Math.max(1, Math.round(NORMAL_BASELINE / (step * metres * Math.cos(latitude))));

	const w = n + 2 * k;
	const heights = new Float32Array(w * w);
	for (let r = -k; r < n + k; r++) {
		for (let c = -k; c < n + k; c++) {
			heights[(r + k) * w + c + k] = sample(zs, x * pixels + (c + 0.5) * step - 0.5, y * pixels + (r + 0.5) * step - 0.5);
		}
	}
	return { heights, w, k, scale: 1 / (2 * k * step * metres) };
}

/**
 * Normals of the tile at the resolution of its source, NORMAL_MAP_SIZE
 * texels across (row 0 along the south edge), and their mipmaps: unit
 * vectors with x eastward, y northward and z up, the horizontal axes in
 * Web Mercator metres as the tile's geometry, x and y stored as signed
 * bytes. Central differences over a grid of elevations a few texels larger
 * than the map (at least NORMAL_BASELINE on either side), read from the one
 * function of the position on the globe: the normals of neighbouring tiles
 * meet without a seam.
 */
function buildNormals(x: number, y: number, z: number, maxSource: number, sample: Sampler): Int8Array[] {
	const n = NORMAL_MAP_SIZE;
	const { heights, w, k, scale } = normalHeights(x, y, z, maxSource, sample);

	// Unit normals, row 0 along the south edge
	let size = n;
	let level = new Float32Array(n * n * 3);
	for (let j = 0; j < n; j++) {
		const r = n - 1 - j;
		for (let i = 0; i < n; i++) {
			const t = (r + k) * w + i + k;
			const east = (heights[t + k] - heights[t - k]) * scale;
			const north = (heights[t - k * w] - heights[t + k * w]) * scale;
			const length = Math.hypot(east, north, 1);
			const o = (j * n + i) * 3;
			level[o] = -east / length;
			level[o + 1] = -north / length;
			level[o + 2] = 1 / length;
		}
	}

	// Mipmaps: the mean of each 2 x 2 normals, made unit again
	const levels = [encodeNormals(level, size)];
	while (size > 1) {
		const half = size >> 1;
		const next = new Float32Array(half * half * 3);
		for (let j = 0; j < half; j++) {
			for (let i = 0; i < half; i++) {
				let nx = 0;
				let ny = 0;
				let nz = 0;
				for (const [di, dj] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
					const o = ((2 * j + dj) * size + 2 * i + di) * 3;
					nx += level[o];
					ny += level[o + 1];
					nz += level[o + 2];
				}
				const length = Math.hypot(nx, ny, nz) || 1;
				const o = (j * half + i) * 3;
				next[o] = nx / length;
				next[o + 1] = ny / length;
				next[o + 2] = nz / length;
			}
		}
		level = next;
		size = half;
		levels.push(encodeNormals(level, size));
	}
	return levels;
}

/** x and y of unit normals as signed bytes */
function encodeNormals(normals: Float32Array, size: number): Int8Array {
	const bytes = new Int8Array(size * size * 2);
	for (let k = 0; k < size * size; k++) {
		bytes[2 * k] = Math.round(normals[3 * k] * 127);
		bytes[2 * k + 1] = Math.round(normals[3 * k + 1] * 127);
	}
	return bytes;
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
