import * as BABYLON from '@babylonjs/core';
import { TilesRenderer } from '3d-tiles-renderer/babylonjs';
import {
    SPAWN_TERRAIN_RAY_HEIGHT_M,
    SPAWN_TERRAIN_RAY_LENGTH_M,
    TERRAIN_PROBE_ERROR_PER_M,
    TERRAIN_PROBE_MIN_DISTANCE_M,
} from '../constants/index.js';

const FRUSTUM_PLANE_COUNT = 6;
const ORTHOGRAPHIC_PROJECTION_M15 = 1;
const PROBE_PARALLEL_EPSILON = 1e-9;

type TerrainProbeSource = () => BABYLON.Vector3 | null | undefined;

interface SegmentRange {
    enter: number;
    exit: number;
}

function createPlanes(): BABYLON.Plane[] {
    const planes: BABYLON.Plane[] = [];
    for (let i = 0; i < FRUSTUM_PLANE_COUNT; i++) planes.push(new BABYLON.Plane(0, 0, 0, 0));
    return planes;
}

function clipSegmentToSlab(start: number, end: number, min: number, max: number, range: SegmentRange): boolean {
    const delta = end - start;
    if (Math.abs(delta) < PROBE_PARALLEL_EPSILON) return start >= min && start <= max;
    const first = (min - start) / delta;
    const second = (max - start) / delta;
    const near = Math.min(first, second);
    const far = Math.max(first, second);
    if (near > range.enter) range.enter = near;
    if (far < range.exit) range.exit = far;
    return range.enter <= range.exit;
}

export class FrameCachedTilesRenderer extends TilesRenderer {
    private readonly _worldPlanes = createPlanes();
    private readonly _tilePlanes = createPlanes();
    private readonly _worldToTiles = BABYLON.Matrix.Identity();
    private readonly _cameraPositionInTiles = new BABYLON.Vector3();
    private readonly _probeWorldPoint = new BABYLON.Vector3();
    private readonly _probeAnchorInTiles = new BABYLON.Vector3();
    private readonly _probeTopInTiles = new BABYLON.Vector3();
    private readonly _probeBottomInTiles = new BABYLON.Vector3();
    private readonly _probeTopInBox = new BABYLON.Vector3();
    private readonly _probeBottomInBox = new BABYLON.Vector3();
    private readonly _probeRange: SegmentRange = { enter: 0, exit: 1 };
    private _terrainProbeSource: TerrainProbeSource | null = null;
    private _frameViewReady = false;
    private _probeReady = false;
    private _isOrthographic = false;
    private _sseDenominator = 1;
    private _pixelSize = 1;
    private _missingCameraWarned = false;
    private _probeSourceWarned = false;

    setTerrainProbeSource(source: TerrainProbeSource | null): void {
        this._terrainProbeSource = typeof source === 'function' ? source : null;
        console.debug(`[3DTiles] Terrain probe ${this._terrainProbeSource ? 'on: tiles below the aircraft stay displayed when they are off screen' : 'off'}`);
    }

    prepareForTraversal(): void {
        this._frameViewReady = this._computeFrameView();
        this._probeReady = this._frameViewReady && this._computeTerrainProbe();
    }

    calculateTileViewError(tile: any, target: any): void {
        if (!this._frameViewReady) this._frameViewReady = this._computeFrameView();
        const boundingVolume = tile?.engineData?.boundingVolume;
        if (!this._frameViewReady || !boundingVolume) {
            (TilesRenderer.prototype as any).calculateTileViewError.call(this, tile, target);
            return;
        }
        const distance = boundingVolume.distanceToPoint(this._cameraPositionInTiles);
        let error: number;
        if (this._isOrthographic) {
            error = tile.geometricError / this._pixelSize;
        } else {
            error = distance === 0 ? Infinity : tile.geometricError / (distance * this._sseDenominator);
        }
        target.inView = boundingVolume.intersectsFrustum(this._tilePlanes);
        target.error = error;
        target.distanceFromCamera = distance;
        if (!this._probeReady || !this._probeCrossesVolume(boundingVolume)) return;
        const probeDistance = Math.max(TERRAIN_PROBE_MIN_DISTANCE_M, boundingVolume.distanceToPoint(this._probeAnchorInTiles));
        const probeError = (tile.geometricError / (probeDistance * TERRAIN_PROBE_ERROR_PER_M)) * this.errorTarget;
        if (target.inView) {
            target.error = Math.max(error, probeError);
            target.distanceFromCamera = Math.min(distance, probeDistance);
            return;
        }
        target.inView = true;
        target.error = probeError;
        target.distanceFromCamera = probeDistance;
    }

    private _computeTerrainProbe(): boolean {
        const source = this._terrainProbeSource;
        if (!source) return false;
        let anchor: BABYLON.Vector3 | null | undefined;
        try {
            anchor = source();
        } catch (err) {
            if (!this._probeSourceWarned) {
                this._probeSourceWarned = true;
                console.warn('[3DTiles] Terrain probe source failed; tiles below the aircraft load only while on screen:', err);
            }
            return false;
        }
        if (!anchor || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y) || !Number.isFinite(anchor.z)) return false;
        BABYLON.Vector3.TransformCoordinatesToRef(anchor, this._worldToTiles, this._probeAnchorInTiles);
        this._probeWorldPoint.set(anchor.x, anchor.y + SPAWN_TERRAIN_RAY_HEIGHT_M, anchor.z);
        BABYLON.Vector3.TransformCoordinatesToRef(this._probeWorldPoint, this._worldToTiles, this._probeTopInTiles);
        this._probeWorldPoint.y -= SPAWN_TERRAIN_RAY_LENGTH_M;
        BABYLON.Vector3.TransformCoordinatesToRef(this._probeWorldPoint, this._worldToTiles, this._probeBottomInTiles);
        return true;
    }

    private _probeCrossesVolume(boundingVolume: any): boolean {
        const sphere = boundingVolume.sphere;
        const obb = boundingVolume.obb;
        if (!sphere && !obb) return false;
        if (sphere && !this._probeCrossesSphere(sphere)) return false;
        if (obb && !this._probeCrossesBox(obb)) return false;
        return true;
    }

    private _probeCrossesSphere(sphere: any): boolean {
        const center = sphere.centerWorld;
        const radius = Number(sphere.radiusWorld);
        if (!center || !Number.isFinite(radius)) return false;
        const top = this._probeTopInTiles;
        const bottom = this._probeBottomInTiles;
        const dx = bottom.x - top.x;
        const dy = bottom.y - top.y;
        const dz = bottom.z - top.z;
        const lengthSq = dx * dx + dy * dy + dz * dz;
        const along = lengthSq > 0
            ? Math.max(0, Math.min(1, ((center.x - top.x) * dx + (center.y - top.y) * dy + (center.z - top.z) * dz) / lengthSq))
            : 0;
        const offsetX = top.x + dx * along - center.x;
        const offsetY = top.y + dy * along - center.y;
        const offsetZ = top.z + dz * along - center.z;
        return offsetX * offsetX + offsetY * offsetY + offsetZ * offsetZ <= radius * radius;
    }

    private _probeCrossesBox(obb: any): boolean {
        const inverse = obb.inverseTransform;
        const min = obb.min;
        const max = obb.max;
        if (!inverse || !min || !max) return false;
        const top = this._probeTopInBox;
        const bottom = this._probeBottomInBox;
        BABYLON.Vector3.TransformCoordinatesToRef(this._probeTopInTiles, inverse, top);
        BABYLON.Vector3.TransformCoordinatesToRef(this._probeBottomInTiles, inverse, bottom);
        const range = this._probeRange;
        range.enter = 0;
        range.exit = 1;
        return clipSegmentToSlab(top.x, bottom.x, min.x, max.x, range)
            && clipSegmentToSlab(top.y, bottom.y, min.y, max.y, range)
            && clipSegmentToSlab(top.z, bottom.z, min.z, max.z, range);
    }

    private _computeFrameView(): boolean {
        const scene: BABYLON.Scene | undefined = (this as any).scene;
        const camera = scene?.activeCamera;
        if (!scene || !camera) {
            if (!this._missingCameraWarned) {
                this._missingCameraWarned = true;
                console.warn('[3DTiles] Frame view unavailable (no active camera); using per-tile frustum computation');
            }
            return false;
        }
        const engine = scene.getEngine();
        const hardwareScaling = engine.getHardwareScalingLevel();
        const width = engine.getRenderWidth() * hardwareScaling;
        const height = engine.getRenderHeight() * hardwareScaling;
        if (!(width > 0) || !(height > 0)) return false;

        const projection = camera.getProjectionMatrix().m;
        this._isOrthographic = projection[15] === ORTHOGRAPHIC_PROJECTION_M15;
        if (this._isOrthographic) {
            const viewWidth = 2 / projection[0];
            const viewHeight = 2 / projection[5];
            this._pixelSize = Math.max(viewHeight / height, viewWidth / width);
        } else {
            this._sseDenominator = (2 / projection[5]) / height;
        }

        const tilesToWorld = this.group.getWorldMatrix();
        tilesToWorld.invertToRef(this._worldToTiles);
        BABYLON.Vector3.TransformCoordinatesToRef(camera.globalPosition, this._worldToTiles, this._cameraPositionInTiles);

        BABYLON.Frustum.GetPlanesToRef(camera.getTransformationMatrix(), this._worldPlanes);
        const m = tilesToWorld.m;
        for (let i = 0; i < FRUSTUM_PLANE_COUNT; i++) {
            const world = this._worldPlanes[i];
            const local = this._tilePlanes[i];
            const nx = world.normal.x;
            const ny = world.normal.y;
            const nz = world.normal.z;
            const d = world.d;
            local.normal.set(
                nx * m[0] + ny * m[1] + nz * m[2] + d * m[3],
                nx * m[4] + ny * m[5] + nz * m[6] + d * m[7],
                nx * m[8] + ny * m[9] + nz * m[10] + d * m[11],
            );
            local.d = nx * m[12] + ny * m[13] + nz * m[14] + d * m[15];
        }
        return true;
    }
}
