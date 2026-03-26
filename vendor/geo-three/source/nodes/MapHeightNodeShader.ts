import {BufferGeometry, DataTexture, LinearFilter, Material, MeshStandardNodeMaterial, Raycaster, Intersection, REVISION, RGBAFormat, UnsignedByteType, Texture, Vector3} from 'three';
import {texture as tslTexture, uv, positionLocal, Fn, varying, vec2, vec3, float, cross, transformNormalToView} from 'three/tsl';
import {MapHeightNode} from './MapHeightNode';
import {MapNodeGeometry} from '../geometries/MapNodeGeometry';
import {MapPlaneNode} from './MapPlaneNode';
import {UnitsUtils} from '../utils/UnitsUtils';
import {MapNode, QuadTreePosition} from './MapNode';
import {MapView} from '../MapView';
import {TextureUtils} from '../utils/TextureUtils';

/**
 * TSL helper: decode Terrarium elevation from an RGBA8 texture sample.
 * Terrarium: h = R_byte*256 + G_byte + B_byte/256 - 32768
 * GPU textures normalize bytes to 0-1, so R_shader = R_byte/255:
 *   h = R_shader*65280 + G_shader*255 + B_shader*0.99609375 - 32768
 */
const decodeTerrariumTSL = Fn(([sample]: [any]) =>
{
	return sample.r.mul(65280.0)
		.add(sample.g.mul(255.0))
		.add(sample.b.mul(float(255.0).div(256.0)))
		.sub(32768.0);
});

/**
 * Map height node that decodes Terrarium elevation on the GPU via TSL positionNode.
 *
 * Raw Terrarium PNG tiles are uploaded as RGBA8 textures — zero CPU pixel loops.
 * The vertex shader decodes R*65280 + G*255 + B*(255/256) - 32768 and displaces Y.
 * Normals are computed analytically via finite-difference sampling.
 */
export class MapHeightNodeShader extends MapHeightNode
{
	public static defaultHeightTexture = TextureUtils.createFillTexture('#0186C0');

	public static geometrySize: number = 256;

	public static geometry: BufferGeometry = new MapNodeGeometry(1.0, 1.0, MapHeightNodeShader.geometrySize, MapHeightNodeShader.geometrySize, true);

	public static baseGeometry: BufferGeometry = MapPlaneNode.geometry;

	public static baseScale: Vector3 = new Vector3(UnitsUtils.EARTH_PERIMETER, 1, UnitsUtils.EARTH_PERIMETER);

	/**
	 * 1x1 default Terrarium texture encoding sea level (h=0).
	 * Terrarium: h=0 → R=128, G=0, B=0
	 */
	public static defaultTerrariumTexture: DataTexture = (() =>
	{
		const data = new Uint8Array([128, 0, 0, 255]);
		const tex = new DataTexture(data, 1, 1, RGBAFormat, UnsignedByteType);
		tex.magFilter = LinearFilter;
		tex.minFilter = LinearFilter;
		tex.needsUpdate = true;
		return tex;
	})();

	private _heightTextureNode: any;

	private _colorTextureNode: any;

	public constructor(parentNode: MapHeightNode = null, mapView: MapView = null, location: number = QuadTreePosition.root, level: number = 0, x: number = 0, y: number = 0)
	{
		const heightTextureNode = tslTexture(MapHeightNodeShader.defaultTerrariumTexture);

		// TSL uniform for color texture — update .value to swap textures without pipeline recompilation
		const colorTextureNode = tslTexture(MapNode.defaultTexture);

		const material = new MeshStandardNodeMaterial({
			color: 0xFFFFFF,
			roughness: 1.0,
			metalness: 0.0,
		});

		// Assign color via TSL uniform (not material.map) to avoid shader recompilation on texture swap
		material.colorNode = colorTextureNode;

		// Varying to pass analytical normal from vertex to fragment shader
		const vNormal = varying(vec3(0.0, 1.0, 0.0));

		// positionNode: decode Terrarium elevation + displace Y
		// @ts-ignore - TSL types
		material.positionNode = Fn(() =>
		{
			const pos = positionLocal.toVar();
			const currentUv = uv();

			// Sample heightmap at vertex UVs
			const heightSample = tslTexture(heightTextureNode, currentUv);

			// Decode Terrarium elevation
			const elevation = decodeTerrariumTSL(heightSample);

			// Analytical normals via finite-difference
			const texelSize = float(1.0).div(256.0);
			const hRight = decodeTerrariumTSL(tslTexture(heightTextureNode,
				currentUv.add(vec2(texelSize, 0.0))));
			const hUp = decodeTerrariumTSL(tslTexture(heightTextureNode,
				currentUv.add(vec2(0.0, texelSize))));

			// Tangent/bitangent in local space (1x1 plane, 256 segments → step = 1/256)
			const step = texelSize;
			const tangent = vec3(step, hRight.sub(elevation), 0.0);
			const bitangent = vec3(0.0, hUp.sub(elevation), step.negate());
			vNormal.assign(cross(tangent, bitangent).normalize());

			// Displace Y
			pos.y.addAssign(elevation);
			return pos;
		})();

		// @ts-ignore - TSL types
		material.normalNode = transformNormalToView(vNormal);

		super(parentNode, mapView, location, level, x, y, MapHeightNodeShader.geometry, material);
		this._heightTextureNode = heightTextureNode;
		this._colorTextureNode = colorTextureNode;
		this.frustumCulled = false;
	}

	/**
	 * Override: update TSL color uniform instead of material.map — no pipeline recompilation.
	 */
	public async applyTexture(image: HTMLImageElement): Promise<void>
	{
		if (this.disposed)
		{
			return;
		}

		const texture = new Texture(image);
		if (parseInt(REVISION) >= 152)
		{
			texture.colorSpace = 'srgb';
		}
		texture.generateMipmaps = false;
		texture.format = RGBAFormat;
		texture.magFilter = LinearFilter;
		texture.minFilter = LinearFilter;
		texture.needsUpdate = true;

		// Update TSL uniform — NO pipeline recompilation
		this._colorTextureNode.value = texture;
	}

	/**
	 * Override: load color texture without triggering material.needsUpdate.
	 */
	public async loadData(): Promise<void>
	{
		if (this.level < this.mapView.provider.minZoom || this.level > this.mapView.provider.maxZoom)
		{
			console.warn('Geo-Three: Loading tile outside of provider range.', this);
			this._colorTextureNode.value = MapNode.defaultTexture;
			return;
		}

		try
		{
			const image = await this.mapView.provider.fetchTile(this.level, this.x, this.y);
			await this.applyTexture(image);
		}
		catch (e)
		{
			if (this.disposed)
			{
				return;
			}

			console.warn('Geo-Three: Failed to load node tile data.', this);
			this._colorTextureNode.value = MapNode.defaultTexture;
		}

		this.textureLoaded = true;
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
			return;
		}

		try
		{
			const image = await this.mapView.heightProvider.fetchTile(this.level, this.x, this.y);

			if (this.disposed)
			{
				return;
			}

			// Create RGBA8 texture from raw Terrarium image
			const heightTex = new Texture(image);
			heightTex.colorSpace = '';
			heightTex.generateMipmaps = false;
			heightTex.magFilter = LinearFilter;
			heightTex.minFilter = LinearFilter;
			heightTex.needsUpdate = true;

			// Update TSL uniform (no material recompilation needed)
			this._heightTextureNode.value = heightTex;
		}
		catch (e)
		{
			if (this.disposed)
			{
				return;
			}

			console.error('Geo-Three: Failed to load node tile height data.', this);
			this._heightTextureNode.value = MapHeightNodeShader.defaultTerrariumTexture;
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
		// Dispose color texture before super.dispose() (which disposes material.map)
		const cTex = this._colorTextureNode?.value;
		if (cTex && cTex !== MapNode.defaultTexture)
		{
			setTimeout(() => { cTex.dispose(); }, 0);
		}

		super.dispose();

		const hTex = this._heightTextureNode.value;
		if (hTex && hTex !== MapHeightNodeShader.defaultTerrariumTexture)
		{
			// Defer to let WebGPU command buffer finish
			setTimeout(() => { hTex.dispose(); }, 0);
		}
	}
}
