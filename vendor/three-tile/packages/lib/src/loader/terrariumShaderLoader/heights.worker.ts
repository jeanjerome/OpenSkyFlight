/**
 * @description: Elevation worker: downloads and decodes the Terrarium source
 * tiles, keeps the most recently used ones, and computes the elevations of
 * the tiles asked for, off the main thread.
 */

import { decodeTerrarium, HeightGrid, sourceRanges, tileHeights } from "./heights";

/** Decoded source tiles kept for the edges of the tiles loaded next */
const CACHE_SIZE = 400;

interface Request {
	id: number;
	x: number;
	y: number;
	z: number;
	maxSource: number;
	/** Absolute URL of the source tiles, with {z}, {x} and {y} */
	template: string;
}

/** Decoded source tiles by "z/x/y", most recently used last; null when unavailable */
const cache = new Map<string, Promise<HeightGrid | null>>();

function source(template: string, z: number, x: number, y: number): Promise<HeightGrid | null> {
	const key = `${z}/${x}/${y}`;
	let grid = cache.get(key);
	if (grid) {
		cache.delete(key);
	} else {
		const url = template.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
		grid = fetch(url)
			.then(response => (response.ok ? response.blob() : Promise.reject(new Error(String(response.status)))))
			.then(blob => createImageBitmap(blob))
			.then(image => {
				const decoded = decodeTerrarium(image);
				image.close();
				return decoded;
			})
			.catch(() => null);
	}
	cache.set(key, grid);
	if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value as string);
	return grid;
}

self.onmessage = async (message: MessageEvent<Request>) => {
	const { id, x, y, z, maxSource, template } = message.data;
	const ranges = sourceRanges(x, y, z, maxSource);
	const grids = await Promise.all(
		ranges.map(({ zs, x0, y0, x1, y1 }) => {
			const tiles: Promise<HeightGrid | null>[] = [];
			for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) tiles.push(source(template, zs, tx, ty));
			return Promise.all(tiles);
		}),
	);
	const { heights, width, rows } = tileHeights(x, y, z, maxSource, ranges, grids);
	self.postMessage({ id, heights, width, rows }, { transfer: [heights.buffer] });
};
