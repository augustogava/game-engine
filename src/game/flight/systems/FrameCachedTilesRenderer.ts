import * as BABYLON from '@babylonjs/core';
import { TilesRenderer } from '3d-tiles-renderer/babylonjs';

const FRUSTUM_PLANE_COUNT = 6;
const ORTHOGRAPHIC_PROJECTION_M15 = 1;

function createPlanes(): BABYLON.Plane[] {
    const planes: BABYLON.Plane[] = [];
    for (let i = 0; i < FRUSTUM_PLANE_COUNT; i++) planes.push(new BABYLON.Plane(0, 0, 0, 0));
    return planes;
}

export class FrameCachedTilesRenderer extends TilesRenderer {
    private readonly _worldPlanes = createPlanes();
    private readonly _tilePlanes = createPlanes();
    private readonly _worldToTiles = BABYLON.Matrix.Identity();
    private readonly _cameraPositionInTiles = new BABYLON.Vector3();
    private _frameViewReady = false;
    private _isOrthographic = false;
    private _sseDenominator = 1;
    private _pixelSize = 1;
    private _missingCameraWarned = false;

    prepareForTraversal(): void {
        this._frameViewReady = this._computeFrameView();
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
