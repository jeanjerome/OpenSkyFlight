/**
 *@description: Plugin of image loader
 *@author: 郭江峰
 *@date: 2023-04-05
 */

import { ImageLoader, SRGBColorSpace, Texture } from "three";
import { LoaderFactory, TileLoadClipParamsType, TileMaterialLoader, getSubImage } from "..";
import { version } from "../..";

/**
 * Tile image loader
 */
export class TileImageLoader extends TileMaterialLoader {
	public readonly info = {
		version,
		description: "Tile image loader. It can load xyz tile image.",
	};

	public dataType = "image";

	private loader = new ImageLoader(LoaderFactory.manager);

	/**
	 * 加载瓦片图像作为纹理
	 *
	 * @param url 图像资源的URL
	 * @param params 加载参数，包括x, y, z坐标、投影范围，裁剪边界clipBounds
	 * @returns 返回一个Promise对象，解析为HTMLImageElement类型。
	 */
	protected async doLoad(url: string, params: TileLoadClipParamsType): Promise<Texture> {
		const texture = new Texture();
		texture.colorSpace = SRGBColorSpace;
		const mosaic = await this.loadMosaic(params);
		if (mosaic) {
			texture.image = mosaic;
		} else {
			const img = await this.loader.loadAsync(url);
			texture.image = img;
			const clipBounds = params.clipBounds;
			// 从父瓦片中剪裁
			if (clipBounds[2] - clipBounds[0] < 1) {
				texture.image = getSubImage(img, clipBounds);
			}
		}
		// Tiles are mostly seen at grazing angles: without anisotropic filtering
		// the mipmap chain blurs the imagery a short distance ahead of the camera.
		texture.anisotropy = LoaderFactory.textureAnisotropy;
		return texture;
	}

	/**
	 * Image of a tile assembled from the tiles of a finer level, for a source
	 * whose imagery changes from one level to the next: Esri World Imagery
	 * draws its levels up to 11 from Landsat and the finer ones from aerial and
	 * satellite photographs, whose colours, shadows and land cover differ, so
	 * that a tile switching between the two changes its content and stands
	 * out as a square. The source's `mosaicLevel` is the level the tiles from
	 * `mosaicMinLevel` to the level above it are assembled from: each tile then
	 * shows the same picture as the finer tiles that replace it, only less sharp.
	 * Null for the other tiles, or when a finer tile cannot be loaded.
	 */
	private async loadMosaic(params: TileLoadClipParamsType): Promise<OffscreenCanvas | null> {
		const { source, x, y, z } = params;
		const level = source.mosaicLevel as number | undefined;
		const minLevel = (source.mosaicMinLevel as number | undefined) ?? 0;
		if (level === undefined || z >= level || z < minLevel || z > source.maxLevel) return null;
		const n = 2 ** (level - z);
		const urls: string[] = [];
		for (let j = 0; j < n; j++) {
			for (let i = 0; i < n; i++) {
				const url = source.getUrl(x * n + i, y * n + j, level);
				if (!url) return null;
				urls.push(url);
			}
		}
		let images: HTMLImageElement[];
		try {
			images = await Promise.all(urls.map(url => this.loader.loadAsync(url)));
		} catch {
			return null;
		}
		// Twice the source's resolution at most: the mipmaps do the rest
		const size = Math.min(images[0].width * n, 2 * images[0].width);
		const cell = size / n;
		const canvas = new OffscreenCanvas(size, size);
		const context = canvas.getContext("2d")!;
		context.imageSmoothingQuality = "high";
		images.forEach((image, k) => context.drawImage(image, (k % n) * cell, Math.floor(k / n) * cell, cell, cell));
		return canvas;
	}
}
