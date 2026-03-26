/**
 * @description: Terrarium GPU shader elevation loader.
 * Instead of decoding elevation on CPU, this loader:
 * 1. Downloads the raw Terrarium PNG
 * 2. Creates an RGBA8 texture (no decode)
 * 3. Returns a flat grid geometry with the height texture in userData
 * The actual displacement happens on GPU via TSL positionNode.
 */

import { ImageLoader, LinearFilter, Texture } from "three";
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

		// Extract the sub-region matching clipBounds (for upsampled tiles beyond zoom 15)
		const cropRect = getBoundsCoord(clipBounds, img.width);
		const canvas = new OffscreenCanvas(gridSize, gridSize);
		const ctx = canvas.getContext("2d")!;
		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(img, cropRect.sx, cropRect.sy, cropRect.sw, cropRect.sh, 0, 0, gridSize, gridSize);

		// Create a raw RGBA8 texture — NO decode, NO sRGB
		const texture = new Texture(canvas as unknown as HTMLCanvasElement);
		texture.colorSpace = "";  // linear, not sRGB
		texture.generateMipmaps = false;
		texture.magFilter = LinearFilter;
		texture.minFilter = LinearFilter;
		texture.needsUpdate = true;

		// Create a flat grid geometry at the matching resolution
		const geometry = createFlatGrid(gridSize);

		// Attach the height texture for the TSL positionNode to consume
		geometry.userData.heightTexture = texture;

		return geometry;
	}
}

/**
 * Creates a flat grid TileGeometry with the given resolution.
 * Vertices span [0,1] in X and Y with Z=0 (matching three-tile convention).
 * Skirt vertices share the same UVs as their edge counterparts, so the TSL
 * positionNode samples the same elevation — the skirt drops skirtHeight below
 * that displaced position, hiding gaps between adjacent tiles.
 */
function createFlatGrid(size: number): TileGeometry {
	const dem = new Float32Array(size * size);
	const geometry = new TileGeometry();
	geometry.setData(dem, 1000); // 1000m skirt — GPU displacement applies to skirt too via shared UVs
	return geometry;
}
