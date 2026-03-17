import {BufferGeometry, DataTexture, FloatType, LinearFilter, Material, MeshStandardMaterial, Raycaster, Intersection, RedFormat, Vector3} from 'three';
import {MapHeightNode} from './MapHeightNode';
import {MapNodeGeometry} from '../geometries/MapNodeGeometry';
import {MapPlaneNode} from './MapPlaneNode';
import {UnitsUtils} from '../utils/UnitsUtils';
import {MapNode, QuadTreePosition} from './MapNode';
import {MapView} from '../MapView';
import {TextureUtils} from '../utils/TextureUtils';

/**
 * Map height node that uses displacementMap for WebGPU-compatible vertex displacement.
 *
 * Height data is decoded from Mapbox terrain-RGB on the CPU into a Float32
 * displacement texture (meters). The shared geometry is displaced on the GPU
 * via the built-in displacementMap pipeline (WebGPU and WebGL2).
 */
export class MapHeightNodeShader extends MapHeightNode
{
	public static defaultHeightTexture = TextureUtils.createFillTexture('#0186C0');

	public static geometrySize: number = 256;

	public static geometry: BufferGeometry = new MapNodeGeometry(1.0, 1.0, MapHeightNodeShader.geometrySize, MapHeightNodeShader.geometrySize, true);

	public static baseGeometry: BufferGeometry = MapPlaneNode.geometry;

	public static baseScale: Vector3 = new Vector3(UnitsUtils.EARTH_PERIMETER, 1, UnitsUtils.EARTH_PERIMETER);

	/**
	 * 1x1 default displacement texture encoding sea level (0 meters).
	 */
	public static defaultDisplacementMap: DataTexture = (() =>
	{
		const tex = new DataTexture(new Float32Array([0.0]), 1, 1, RedFormat, FloatType);
		tex.magFilter = LinearFilter;
		tex.minFilter = LinearFilter;
		tex.needsUpdate = true;
		return tex;
	})();

	public constructor(parentNode: MapHeightNode = null, mapView: MapView = null, location: number = QuadTreePosition.root, level: number = 0, x: number = 0, y: number = 0)
	{
		const material = new MeshStandardMaterial({
			map: MapNode.defaultTexture,
			color: 0xFFFFFF,
			roughness: 1.0,
			metalness: 0.0,
			displacementMap: MapHeightNodeShader.defaultDisplacementMap,
			displacementScale: 1.0,
			displacementBias: 0.0,
		});

		super(parentNode, mapView, location, level, x, y, MapHeightNodeShader.geometry, material);

		this.frustumCulled = false;
	}

	public async loadData(): Promise<void>
	{
		await super.loadData();
		this.textureLoaded = true;
	}

	/**
	 * Decode Mapbox terrain-RGB heightmap into a Float32 displacement texture.
	 *
	 * Height formula: h = (R*65536 + G*256 + B) * 0.1 - 10000
	 * Stored directly in meters as Float32 in the Red channel.
	 */
	public static decodeToDisplacementMap(image: any): DataTexture
	{
		const w: number = image.width || 256;
		const h: number = image.height || 256;

		const canvas = document.createElement('canvas');
		canvas.width = w;
		canvas.height = h;
		const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
		ctx.drawImage(image, 0, 0);
		const imageData = ctx.getImageData(0, 0, w, h);
		const src = imageData.data;

		const out = new Float32Array(w * h);
		for (let i = 0; i < w * h; i++)
		{
			const r = src[i * 4];
			const g = src[i * 4 + 1];
			const b = src[i * 4 + 2];
			out[i] = (r * 65536 + g * 256 + b) * 0.1 - 10000.0;
		}

		const tex = new DataTexture(out, w, h, RedFormat, FloatType);
		tex.flipY = true;
		tex.magFilter = LinearFilter;
		tex.minFilter = LinearFilter;
		tex.generateMipmaps = false;
		tex.needsUpdate = true;
		return tex;
	}

	public async loadHeightGeometry(): Promise<void>
	{
		if (this.mapView.heightProvider === null)
		{
			throw new Error('GeoThree: MapView.heightProvider provider is null.');
		}

		if (this.level < this.mapView.heightProvider.minZoom || this.level > this.mapView.heightProvider.maxZoom)
		{
			console.warn('Geo-Three: Loading tile outside of provider range.', this);
			// @ts-ignore
			this.material.map = MapHeightNodeShader.defaultTexture;
			// @ts-ignore
			this.material.needsUpdate = true;
			return;
		}

		try
		{
			const image = await this.mapView.heightProvider.fetchTile(this.level, this.x, this.y);

			if (this.disposed)
			{
				return;
			}

			const displacementTex = MapHeightNodeShader.decodeToDisplacementMap(image);

			// @ts-ignore
			this.material.displacementMap = displacementTex;
			// @ts-ignore
			this.material.needsUpdate = true;
		}
		catch (e)
		{
			if (this.disposed)
			{
				return;
			}

			console.error('Geo-Three: Failed to load node tile height data.', this);

			// @ts-ignore
			this.material.displacementMap = MapHeightNodeShader.defaultDisplacementMap;
			// @ts-ignore
			this.material.needsUpdate = true;
		}

		this.heightLoaded = true;
	}

	/**
	 * Raycasting uses flat geometry for performance (displacement is GPU-only).
	 */
	public raycast(raycaster: Raycaster, intersects: Intersection[]): void
	{
		if (this.isMesh === true)
		{
			this.geometry = MapPlaneNode.geometry;
			super.raycast(raycaster, intersects);
			this.geometry = MapHeightNodeShader.geometry;
		}
	}

	public dispose(): void
	{
		super.dispose();

		// @ts-ignore
		const dMap = this.material.displacementMap;
		if (dMap && dMap !== MapHeightNodeShader.defaultDisplacementMap)
		{
			dMap.dispose();
		}
	}
}
