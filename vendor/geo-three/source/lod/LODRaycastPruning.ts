import {LODRaycast} from './LODRaycast';
import {Camera, Frustum, Matrix4, Object3D, Vector3, WebGLRenderer} from 'three';
import {MapView} from '../MapView';
import {MapNode} from '../nodes/MapNode';

// Reusable objects to avoid per-frame allocations
const _projScreenMatrix = new Matrix4();
const _frustum = new Frustum();
const _nodeWorldPos = new Vector3();
const _cameraWorldPos = new Vector3();

/**
 * Extension of LODRaycast that adds a pruning pass to reclaim tiles
 * that have drifted outside the camera frustum.
 *
 * Phase 1 (inherited): standard raycast-based subdivision/simplification.
 * Phase 2 (new): traverse the quad-tree and simplify parent groups whose
 * four children are all outside the frustum and beyond a grace distance.
 */
export class LODRaycastPruning extends LODRaycast
{
	/** Hard cap on the total number of leaf tiles. */
	public maxLeafNodes: number = 400;

	/** Grace multiplier: tile must be farther than tileWorldSize * this factor to be pruned. */
	public pruneGraceMultiplier: number = 1.8;

	/** Minimum zoom level eligible for pruning (protects continental-scale tiles). */
	public pruneMinLevel: number = 4;

	/** When true, only tiles outside the frustum are candidates for pruning. */
	public pruneOutsideFrustumOnly: boolean = true;

	public updateLOD(view: MapView, camera: Camera, renderer: WebGLRenderer, scene: Object3D): void
	{
		// Phase 1 — standard raycast LOD
		super.updateLOD(view, camera, renderer, scene);

		// Phase 2 — pruning pass
		this._prunePass(view, camera);
	}

	private _prunePass(view: MapView, camera: Camera): void
	{
		// Build frustum from camera
		_projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
		_frustum.setFromProjectionMatrix(_projScreenMatrix);

		camera.getWorldPosition(_cameraWorldPos);

		// Collect leaf nodes and group by parent
		const parentGroups = new Map<MapNode, {leaves: MapNode[]; allOutside: boolean; maxDist: number}>();

		view.traverse((obj: Object3D) =>
		{
			const node = obj as MapNode;
			if (!node.isMesh || node.subdivided || node.level === undefined || node.level < this.pruneMinLevel)
			{
				return;
			}

			const parent = node.parentNode;
			if (!parent)
			{
				return;
			}

			// Check frustum
			const inFrustum = _frustum.intersectsObject(node);

			// Compute distance from camera to node center
			node.getWorldPosition(_nodeWorldPos);
			const dist = _cameraWorldPos.distanceTo(_nodeWorldPos);

			// Tile world size approximation: scale from the node's world matrix
			const m = node.matrixWorld.elements;
			const tileWorldSize = Math.sqrt(m[0] * m[0] + m[1] * m[1] + m[2] * m[2]);

			if (!parentGroups.has(parent))
			{
				parentGroups.set(parent, {leaves: [], allOutside: true, maxDist: 0});
			}
			const group = parentGroups.get(parent)!;
			group.leaves.push(node);
			if (inFrustum)
			{
				group.allOutside = false;
			}
			group.maxDist = Math.max(group.maxDist, dist);
		});

		// Evaluate each parent group
		const candidates: {parent: MapNode; maxDist: number}[] = [];
		let totalLeaves = 0;

		for (const [parent, group] of parentGroups)
		{
			totalLeaves += group.leaves.length;

			// Only consider complete quad groups (all 4 siblings present)
			if (group.leaves.length !== MapNode.childrens)
			{
				continue;
			}

			if (this.pruneOutsideFrustumOnly && !group.allOutside)
			{
				continue;
			}

			// Tile world size from the first leaf
			const m = group.leaves[0].matrixWorld.elements;
			const tileWorldSize = Math.sqrt(m[0] * m[0] + m[1] * m[1] + m[2] * m[2]);
			const graceDistance = tileWorldSize * this.pruneGraceMultiplier;

			if (group.allOutside && group.maxDist > graceDistance)
			{
				// Far enough — prune immediately
				parent.simplify();
			}
			else if (group.allOutside)
			{
				// Within grace zone — candidate for hard cap
				candidates.push({parent, maxDist: group.maxDist});
			}
		}

		// Hard cap: if still over budget, prune grace-zone candidates farthest-first
		if (totalLeaves > this.maxLeafNodes && candidates.length > 0)
		{
			candidates.sort((a, b) => b.maxDist - a.maxDist);

			for (const candidate of candidates)
			{
				if (totalLeaves <= this.maxLeafNodes)
				{
					break;
				}
				candidate.parent.simplify();
				// Each simplify removes 4 leaves and restores the parent as 1 leaf
				totalLeaves -= (MapNode.childrens - 1);
			}
		}
	}
}
