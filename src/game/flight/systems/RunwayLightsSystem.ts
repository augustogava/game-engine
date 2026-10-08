import * as BABYLON from '@babylonjs/core';
import type { FlightSceneSimple } from '../../FlightSceneSimple.js';

const RUNWAY_EDGE_LIGHT_SPACING_M = 60;
const RUNWAY_EDGE_LIGHT_LATERAL_OFFSET_M = 1.5;
const RUNWAY_THRESHOLD_LIGHT_SPACING_M = 3;
const RUNWAY_THRESHOLD_LIGHT_SETBACK_M = 2;
const RUNWAY_LIGHT_HEIGHT_ABOVE_COLLIDER_M = 0.3;
const RUNWAY_LIGHT_DIAMETER_M = 0.9;
const RUNWAY_LIGHT_SEGMENTS = 4;
const RUNWAY_LIGHT_SCALE_REF_DIST_M = 400;
const RUNWAY_LIGHT_MAX_SCALE = 14;
const PAPI_DISTANCE_FROM_THRESHOLD_M = 300;
const PAPI_LATERAL_FROM_EDGE_M = 15;
const PAPI_UNIT_SPACING_M = 9;
const PAPI_UNIT_ANGLES_DEG = [3.5, 3.1667, 2.8333, 2.5];
const PAPI_LIGHT_DIAMETER_M = 1.6;
const PAPI_MAX_RANGE_M = 25000;
const RUNWAY_LIGHTS_ON_SUN_ELEV_DEG = 6;
const RUNWAY_LIGHTS_ON_PRECIP_INTENSITY = 0.5;
const RUNWAY_LIGHTS_UPDATE_INTERVAL_S = 0.1;
const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;
const COLOR_EDGE_WHITE: [number, number, number, number] = [1.0, 0.92, 0.75, 1];
const COLOR_THRESHOLD_GREEN: [number, number, number, number] = [0.2, 1.0, 0.35, 1];
const COLOR_PAPI_RED: [number, number, number, number] = [1.0, 0.08, 0.06, 1];
const COLOR_PAPI_WHITE: [number, number, number, number] = [1.0, 1.0, 0.95, 1];
const COLOR_OFF: [number, number, number, number] = [0, 0, 0, 1];

interface PapiUnit {
    x: number;
    y: number;
    z: number;
    angleDeg: number;
    thresholdX: number;
    thresholdZ: number;
    landingDirX: number;
    landingDirZ: number;
}

export class RunwayLightsSystem {
    private readonly scene: any;
    private _staticMesh: BABYLON.Mesh | null = null;
    private _papiMesh: BABYLON.Mesh | null = null;
    private _material: BABYLON.StandardMaterial | null = null;
    private _staticPositions: Float32Array = new Float32Array(0);
    private _staticMatrices: Float32Array = new Float32Array(0);
    private _papiUnits: PapiUnit[] = [];
    private _papiMatrices: Float32Array = new Float32Array(0);
    private _papiColors: Float32Array = new Float32Array(0);
    private _updateAccumS = 0;
    private _lightsOn = false;

    constructor(scene: FlightSceneSimple) {
        this.scene = scene;
    }

    rebuild(): void {
        this.dispose();
        const babylonScene: BABYLON.Scene | null = this.scene.scene ?? null;
        const colliders: BABYLON.Mesh[] = Array.isArray(this.scene._runwayColliders) ? this.scene._runwayColliders : [];
        if (!babylonScene || colliders.length === 0) return;

        const staticPositions: number[] = [];
        const staticColors: number[] = [];
        const pushStatic = (x: number, y: number, z: number, color: [number, number, number, number]) => {
            staticPositions.push(x, y, z);
            staticColors.push(color[0], color[1], color[2], color[3]);
        };

        for (const collider of colliders) {
            const meta = collider?.metadata;
            const lengthM = Number(meta?.lengthM);
            const widthM = Number(meta?.widthM);
            const headingDeg = Number(meta?.headingDeg);
            if (!Number.isFinite(lengthM) || lengthM <= 0 || !Number.isFinite(widthM) || widthM <= 0 || !Number.isFinite(headingDeg)) continue;

            const cx = collider.position.x;
            const cz = collider.position.z;
            const y = collider.position.y + RUNWAY_LIGHT_HEIGHT_ABOVE_COLLIDER_M;
            const elevationDiffM = Number(meta?.elevationDiffM);
            const gradient = Number.isFinite(elevationDiffM) ? elevationDiffM / lengthM : 0;
            const yAt = (along: number): number => y + along * gradient;
            const headingRad = headingDeg * DEG_TO_RAD;
            const dirX = Math.sin(headingRad);
            const dirZ = -Math.cos(headingRad);
            const rightX = Math.cos(headingRad);
            const rightZ = Math.sin(headingRad);
            const halfLength = lengthM / 2;
            const halfWidth = widthM / 2;
            const edgeOffset = halfWidth + RUNWAY_EDGE_LIGHT_LATERAL_OFFSET_M;

            const edgeCount = Math.max(2, Math.floor(lengthM / RUNWAY_EDGE_LIGHT_SPACING_M) + 1);
            for (let i = 0; i < edgeCount; i++) {
                const along = -halfLength + (lengthM * i) / (edgeCount - 1);
                const ax = cx + dirX * along;
                const az = cz + dirZ * along;
                const edgeY = yAt(along);
                pushStatic(ax + rightX * edgeOffset, edgeY, az + rightZ * edgeOffset, COLOR_EDGE_WHITE);
                pushStatic(ax - rightX * edgeOffset, edgeY, az - rightZ * edgeOffset, COLOR_EDGE_WHITE);
            }

            const thresholdCount = Math.max(2, Math.floor(widthM / RUNWAY_THRESHOLD_LIGHT_SPACING_M) + 1);
            for (const endSign of [-1, 1]) {
                const along = endSign * (halfLength + RUNWAY_THRESHOLD_LIGHT_SETBACK_M);
                const tx = cx + dirX * along;
                const tz = cz + dirZ * along;
                const thresholdY = yAt(along);
                for (let i = 0; i < thresholdCount; i++) {
                    const lateral = -halfWidth + (widthM * i) / (thresholdCount - 1);
                    pushStatic(tx + rightX * lateral, thresholdY, tz + rightZ * lateral, COLOR_THRESHOLD_GREEN);
                }

                const thresholdX = cx + dirX * endSign * halfLength;
                const thresholdZ = cz + dirZ * endSign * halfLength;
                const landingDirX = -endSign * dirX;
                const landingDirZ = -endSign * dirZ;
                const leftX = endSign < 0 ? -rightX : rightX;
                const leftZ = endSign < 0 ? -rightZ : rightZ;
                const baseX = thresholdX + landingDirX * PAPI_DISTANCE_FROM_THRESHOLD_M + leftX * (halfWidth + PAPI_LATERAL_FROM_EDGE_M);
                const baseZ = thresholdZ + landingDirZ * PAPI_DISTANCE_FROM_THRESHOLD_M + leftZ * (halfWidth + PAPI_LATERAL_FROM_EDGE_M);
                const papiY = yAt(endSign * (halfLength - PAPI_DISTANCE_FROM_THRESHOLD_M));
                for (let u = 0; u < PAPI_UNIT_ANGLES_DEG.length; u++) {
                    this._papiUnits.push({
                        x: baseX + leftX * u * PAPI_UNIT_SPACING_M,
                        y: papiY,
                        z: baseZ + leftZ * u * PAPI_UNIT_SPACING_M,
                        angleDeg: PAPI_UNIT_ANGLES_DEG[u],
                        thresholdX,
                        thresholdZ,
                        landingDirX,
                        landingDirZ,
                    });
                }
            }
        }

        const staticCount = staticPositions.length / 3;
        if (staticCount === 0) return;

        try {
            const mat = new BABYLON.StandardMaterial('runwayLightsMat', babylonScene);
            mat.disableLighting = true;
            mat.emissiveColor = new BABYLON.Color3(1, 1, 1);
            mat.diffuseColor = new BABYLON.Color3(0, 0, 0);
            mat.specularColor = new BABYLON.Color3(0, 0, 0);
            this._material = mat;

            const staticMesh = BABYLON.MeshBuilder.CreateSphere('runwayLightsStatic', { diameter: RUNWAY_LIGHT_DIAMETER_M, segments: RUNWAY_LIGHT_SEGMENTS }, babylonScene);
            staticMesh.material = mat;
            staticMesh.isPickable = false;
            staticMesh.receiveShadows = false;
            this._staticPositions = new Float32Array(staticPositions);
            this._staticMatrices = new Float32Array(staticCount * 16);
            this.writeMatrices(this._staticPositions, this._staticMatrices, null);
            staticMesh.thinInstanceSetBuffer('matrix', this._staticMatrices, 16, false);
            staticMesh.thinInstanceSetBuffer('color', new Float32Array(staticColors), 4, true);
            staticMesh.thinInstanceRefreshBoundingInfo(false);
            staticMesh.setEnabled(false);
            this._staticMesh = staticMesh;

            const papiCount = this._papiUnits.length;
            if (papiCount > 0) {
                const papiMesh = BABYLON.MeshBuilder.CreateSphere('runwayLightsPapi', { diameter: PAPI_LIGHT_DIAMETER_M, segments: RUNWAY_LIGHT_SEGMENTS }, babylonScene);
                papiMesh.material = mat;
                papiMesh.isPickable = false;
                papiMesh.receiveShadows = false;
                const papiPositions = new Float32Array(papiCount * 3);
                for (let i = 0; i < papiCount; i++) {
                    papiPositions[i * 3] = this._papiUnits[i].x;
                    papiPositions[i * 3 + 1] = this._papiUnits[i].y;
                    papiPositions[i * 3 + 2] = this._papiUnits[i].z;
                }
                this._papiMatrices = new Float32Array(papiCount * 16);
                this.writeMatrices(papiPositions, this._papiMatrices, null);
                this._papiColors = new Float32Array(papiCount * 4);
                for (let i = 0; i < papiCount; i++) this._papiColors.set(COLOR_OFF, i * 4);
                papiMesh.thinInstanceSetBuffer('matrix', this._papiMatrices, 16, false);
                papiMesh.thinInstanceSetBuffer('color', this._papiColors, 4, false);
                papiMesh.thinInstanceRefreshBoundingInfo(false);
                papiMesh.setEnabled(false);
                this._papiMesh = papiMesh;
            }
            this._lightsOn = false;
            this._updateAccumS = RUNWAY_LIGHTS_UPDATE_INTERVAL_S;
            console.debug(`[RunwayLights] Built ${staticCount} edge/threshold lights and ${papiCount} PAPI units for ${colliders.length} runway(s)`);
        } catch (err) {
            console.warn('[RunwayLights] Failed to build runway lights:', err);
            this.dispose();
        }
    }

    private writeMatrices(positions: Float32Array, out: Float32Array, camPos: BABYLON.Vector3 | null): void {
        const count = positions.length / 3;
        for (let i = 0; i < count; i++) {
            const x = positions[i * 3];
            const y = positions[i * 3 + 1];
            const z = positions[i * 3 + 2];
            let scale = 1;
            if (camPos) {
                const dist = Math.hypot(x - camPos.x, y - camPos.y, z - camPos.z);
                scale = Math.max(1, Math.min(RUNWAY_LIGHT_MAX_SCALE, dist / RUNWAY_LIGHT_SCALE_REF_DIST_M));
            }
            const o = i * 16;
            out[o] = scale; out[o + 1] = 0; out[o + 2] = 0; out[o + 3] = 0;
            out[o + 4] = 0; out[o + 5] = scale; out[o + 6] = 0; out[o + 7] = 0;
            out[o + 8] = 0; out[o + 9] = 0; out[o + 10] = scale; out[o + 11] = 0;
            out[o + 12] = x; out[o + 13] = y; out[o + 14] = z; out[o + 15] = 1;
        }
    }

    private shouldLightsBeOn(): boolean {
        const sunElev = Number(this.scene._sunElevation);
        const precip = Number(this.scene._precipitationIntensity) || 0;
        return (Number.isFinite(sunElev) && sunElev < RUNWAY_LIGHTS_ON_SUN_ELEV_DEG) || precip >= RUNWAY_LIGHTS_ON_PRECIP_INTENSITY;
    }

    update(dt: number): void {
        if (!this._staticMesh) return;
        this._updateAccumS += Number.isFinite(dt) ? Math.max(0, dt) : 0;
        if (this._updateAccumS < RUNWAY_LIGHTS_UPDATE_INTERVAL_S) return;
        this._updateAccumS = 0;

        const lightsOn = this.shouldLightsBeOn();
        if (lightsOn !== this._lightsOn) {
            this._lightsOn = lightsOn;
            this._staticMesh.setEnabled(lightsOn);
            this._papiMesh?.setEnabled(lightsOn);
            console.debug(`[RunwayLights] ${lightsOn ? 'On' : 'Off'} (sunElev=${Number(this.scene._sunElevation).toFixed(1)}°)`);
        }
        if (!lightsOn) return;

        const cam: BABYLON.Camera | null = this.scene.scene?.activeCamera ?? null;
        if (!cam) return;
        const camPos = cam.globalPosition;
        this.writeMatrices(this._staticPositions, this._staticMatrices, camPos);
        this._staticMesh.thinInstanceBufferUpdated('matrix');
        this.updatePapi(camPos);
    }

    private updatePapi(camPos: BABYLON.Vector3): void {
        if (!this._papiMesh || this._papiUnits.length === 0) return;
        const plane = this.scene.planeRoot?.position as BABYLON.Vector3 | undefined;
        if (!plane) return;
        const count = this._papiUnits.length;
        for (let i = 0; i < count; i++) {
            const u = this._papiUnits[i];
            const dx = plane.x - u.x;
            const dz = plane.z - u.z;
            const horizontal = Math.hypot(dx, dz);
            const alongFromThreshold = (plane.x - u.thresholdX) * u.landingDirX + (plane.z - u.thresholdZ) * u.landingDirZ;
            let color = COLOR_OFF;
            if (alongFromThreshold < 0 && horizontal <= PAPI_MAX_RANGE_M) {
                const glideAngleDeg = Math.atan2(plane.y - u.y, Math.max(1, horizontal)) * RAD_TO_DEG;
                color = glideAngleDeg >= u.angleDeg ? COLOR_PAPI_WHITE : COLOR_PAPI_RED;
            }
            this._papiColors.set(color, i * 4);
            const o = i * 16;
            const dist = Math.hypot(u.x - camPos.x, u.y - camPos.y, u.z - camPos.z);
            const scale = color === COLOR_OFF ? 0 : Math.max(1, Math.min(RUNWAY_LIGHT_MAX_SCALE, dist / RUNWAY_LIGHT_SCALE_REF_DIST_M));
            this._papiMatrices[o] = scale;
            this._papiMatrices[o + 5] = scale;
            this._papiMatrices[o + 10] = scale;
        }
        this._papiMesh.thinInstanceBufferUpdated('color');
        this._papiMesh.thinInstanceBufferUpdated('matrix');
    }

    dispose(): void {
        try { this._staticMesh?.dispose(); } catch (err) { console.warn('[RunwayLights] static mesh dispose failed:', err); }
        try { this._papiMesh?.dispose(); } catch (err) { console.warn('[RunwayLights] PAPI mesh dispose failed:', err); }
        try { this._material?.dispose(); } catch (err) { console.warn('[RunwayLights] material dispose failed:', err); }
        this._staticMesh = null;
        this._papiMesh = null;
        this._material = null;
        this._papiUnits = [];
        this._staticPositions = new Float32Array(0);
        this._staticMatrices = new Float32Array(0);
        this._papiMatrices = new Float32Array(0);
        this._papiColors = new Float32Array(0);
        this._lightsOn = false;
    }
}
