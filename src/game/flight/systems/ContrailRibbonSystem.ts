import * as BABYLON from '@babylonjs/core';
import type { FlightSceneSimple } from '../../FlightSceneSimple.js';
import {
    CONTRAIL_RIBBON_SHADER_VERTEX_URL,
    CONTRAIL_RIBBON_SHADER_FRAGMENT_URL,
    CONTRAIL_RIBBON_MAX_POINTS,
    CONTRAIL_RIBBON_MIN_SEGMENT_M,
    CONTRAIL_RIBBON_MAX_PUSH_DT_S,
    CONTRAIL_RIBBON_MAX_AGE_S,
    CONTRAIL_RIBBON_HEAD_WIDTH_M,
    CONTRAIL_RIBBON_TAIL_WIDTH_M,
    CONTRAIL_RIBBON_NOISE_DETAIL_X,
    CONTRAIL_RIBBON_NOISE_DETAIL_Y,
    CONTRAIL_RIBBON_NOISE_SCROLL,
    CONTRAIL_RIBBON_COVER,
    CONTRAIL_RIBBON_ALPHA,
    CONTRAIL_RIBBON_REFLECT,
    CONTRAIL_RIBBON_DIST_FADE_START_M,
    CONTRAIL_RIBBON_DIST_FADE_END_M,
    CONTRAIL_RIBBON_HEAD_FADE_END,
    CONTRAIL_RIBBON_TAIL_FADE_START,
    CONTRAIL_RIBBON_MAX_JUMP_M,
    CONTRAIL_RIBBON_ALPHA_INDEX,
    CONTRAIL_RIBBON_DEFAULT_COLOR_R,
    CONTRAIL_RIBBON_DEFAULT_COLOR_G,
    CONTRAIL_RIBBON_DEFAULT_COLOR_B,
} from '../constants/index.js';

interface TrailPoint {
    x: number;
    y: number;
    z: number;
    age: number;
}

export interface ContrailRibbonHandle {
    parentRoot: BABYLON.TransformNode;
    emitter: BABYLON.TransformNode;
    wingtipOffset: BABYLON.Vector3;
    idTag: string;
    mesh: BABYLON.Mesh | null;
    material: BABYLON.ShaderMaterial | null;
    history: TrailPoint[];
    pushDtAccum: number;
    positions: Float32Array;
    uvs: Float32Array;
    indices: Uint16Array;
    prevPerpX: number;
    prevPerpY: number;
    prevPerpZ: number;
    prevPerpValid: boolean;
    canceled: boolean;
}

export class ContrailRibbonSystem {
    private readonly scene: any;
    private _sceneRef: BABYLON.Scene | null = null;
    private _shadersRegistered = false;
    private _shadersRegistering: Promise<boolean> | null = null;
    private _timeAccum = 0;
    private readonly _pendingHandles: ContrailRibbonHandle[] = [];

    constructor(scene: FlightSceneSimple) {
        this.scene = scene;
    }

    private async registerShaders(): Promise<boolean> {
        if (this._shadersRegistered) return true;
        if (this._shadersRegistering) return this._shadersRegistering;
        this._shadersRegistering = (async () => {
            try {
                const [vsResp, fsResp] = await Promise.all([
                    fetch(CONTRAIL_RIBBON_SHADER_VERTEX_URL),
                    fetch(CONTRAIL_RIBBON_SHADER_FRAGMENT_URL),
                ]);
                if (!vsResp.ok || !fsResp.ok) {
                    throw new Error(`HTTP ${vsResp.status}/${fsResp.status} fetching contrail ribbon shaders`);
                }
                const vsCode = await vsResp.text();
                const fsCode = await fsResp.text();
                (BABYLON.Effect.ShadersStore as any)['contrailRibbonVertexShader'] = vsCode;
                (BABYLON.Effect.ShadersStore as any)['contrailRibbonFragmentShader'] = fsCode;
                this._shadersRegistered = true;
                console.debug('[ContrailRibbon] Shaders registered');
                return true;
            } catch (err) {
                console.warn('[ContrailRibbon] Failed to fetch shaders:', err);
                return false;
            } finally {
                this._shadersRegistering = null;
            }
        })();
        return this._shadersRegistering;
    }

    private _allocateBuffers(): { positions: Float32Array; uvs: Float32Array; indices: Uint16Array } {
        const n = CONTRAIL_RIBBON_MAX_POINTS;
        const positions = new Float32Array(n * 2 * 3);
        const uvs = new Float32Array(n * 2 * 2);
        const indices = new Uint16Array((n - 1) * 6);
        return { positions, uvs, indices };
    }

    private _buildMaterial(scene: BABYLON.Scene, idTag: string): BABYLON.ShaderMaterial {
        const mat = new BABYLON.ShaderMaterial(
            `contrailRibbonMat_${idTag}`,
            scene,
            { vertex: 'contrailRibbon', fragment: 'contrailRibbon' },
            {
                attributes: ['position', 'uv'],
                uniforms: [
                    'world', 'worldViewProjection',
                    'time', 'cover', 'alpha', 'reflectAmount',
                    'noiseScroll', 'noiseDetailX', 'noiseDetailY',
                    'headFadeEnd', 'tailFadeStart',
                    'distFadeStart', 'distFadeEnd',
                    'cloudColor', 'sunDir', 'sunColor',
                    'cameraPos', 'horizonColor',
                ],
            },
        );
        mat.backFaceCulling = false;
        mat.alphaMode = BABYLON.Engine.ALPHA_COMBINE;
        mat.needAlphaBlending = () => true;
        mat.needDepthPrePass = false;
        mat.setFloat('cover', CONTRAIL_RIBBON_COVER);
        mat.setFloat('alpha', CONTRAIL_RIBBON_ALPHA);
        mat.setFloat('reflectAmount', CONTRAIL_RIBBON_REFLECT);
        mat.setFloat('noiseScroll', CONTRAIL_RIBBON_NOISE_SCROLL);
        mat.setFloat('noiseDetailX', CONTRAIL_RIBBON_NOISE_DETAIL_X);
        mat.setFloat('noiseDetailY', CONTRAIL_RIBBON_NOISE_DETAIL_Y);
        mat.setFloat('headFadeEnd', CONTRAIL_RIBBON_HEAD_FADE_END);
        mat.setFloat('tailFadeStart', CONTRAIL_RIBBON_TAIL_FADE_START);
        mat.setFloat('distFadeStart', CONTRAIL_RIBBON_DIST_FADE_START_M);
        mat.setFloat('distFadeEnd', CONTRAIL_RIBBON_DIST_FADE_END_M);
        mat.setColor3('cloudColor', new BABYLON.Color3(
            CONTRAIL_RIBBON_DEFAULT_COLOR_R,
            CONTRAIL_RIBBON_DEFAULT_COLOR_G,
            CONTRAIL_RIBBON_DEFAULT_COLOR_B,
        ));
        return mat;
    }

    private _buildMesh(scene: BABYLON.Scene, idTag: string, positions: Float32Array, uvs: Float32Array, indices: Uint16Array): BABYLON.Mesh {
        const mesh = new BABYLON.Mesh(`contrailRibbonMesh_${idTag}`, scene);
        const vd = new BABYLON.VertexData();
        vd.positions = positions;
        vd.uvs = uvs;
        vd.indices = indices;
        vd.applyToMesh(mesh, true);
        mesh.isPickable = false;
        mesh.alphaIndex = CONTRAIL_RIBBON_ALPHA_INDEX;
        mesh.applyFog = false;
        // Vertices are authored in world space, so the world matrix stays identity and the bounding box is
        // refreshed from the history in _rebuildVertices; normal frustum culling then replaces alwaysSelectAsActiveMesh.
        mesh.freezeWorldMatrix();
        return mesh;
    }

    private readonly _boundsMin = new BABYLON.Vector3();
    private readonly _boundsMax = new BABYLON.Vector3();

    /**
     * Build a pair of ribbon emitters + meshes attached to a given parent root.
     * Returns handles synchronously; mesh/material are created once shaders finish loading.
     */
    buildPair(scene: BABYLON.Scene, parentRoot: BABYLON.TransformNode, halfSpan: number, idTag: string): {
        emL: BABYLON.TransformNode; emR: BABYLON.TransformNode;
        ribL: ContrailRibbonHandle; ribR: ContrailRibbonHandle;
    } | null {
        if (this.scene.isMobile === true) return null;
        this._sceneRef = scene;
        const safeHalf = Math.max(2, halfSpan);

        const makeEmitter = (name: string, x: number): BABYLON.TransformNode => {
            const em = new BABYLON.TransformNode(name, scene);
            em.parent = parentRoot;
            em.position.set(x, 0, -safeHalf * 0.2);
            return em;
        };

        const emL = makeEmitter(`contrailRibbonEmL_${idTag}`, -safeHalf * 0.92);
        const emR = makeEmitter(`contrailRibbonEmR_${idTag}`,  safeHalf * 0.92);

        const ribL = this._createHandle(parentRoot, emL, new BABYLON.Vector3(-safeHalf * 0.92, 0, -safeHalf * 0.2), `${idTag}_L`);
        const ribR = this._createHandle(parentRoot, emR, new BABYLON.Vector3( safeHalf * 0.92, 0, -safeHalf * 0.2), `${idTag}_R`);

        void this._initMeshAsync(scene, ribL);
        void this._initMeshAsync(scene, ribR);

        return { emL, emR, ribL, ribR };
    }

    private _createHandle(parentRoot: BABYLON.TransformNode, emitter: BABYLON.TransformNode, wingtipOffset: BABYLON.Vector3, idTag: string): ContrailRibbonHandle {
        const buffers = this._allocateBuffers();
        return {
            parentRoot,
            emitter,
            wingtipOffset,
            idTag,
            mesh: null,
            material: null,
            history: [],
            pushDtAccum: 0,
            positions: buffers.positions,
            uvs: buffers.uvs,
            indices: buffers.indices,
            prevPerpX: 0,
            prevPerpY: 0,
            prevPerpZ: 1,
            prevPerpValid: false,
            canceled: false,
        };
    }

    private async _initMeshAsync(scene: BABYLON.Scene, handle: ContrailRibbonHandle): Promise<void> {
        try {
            const ok = await this.registerShaders();
            if (!ok) return;
            if (handle.canceled) {
                console.debug(`[ContrailRibbon] Init aborted: handle canceled (${handle.idTag})`);
                return;
            }
            if (handle.mesh) return;
            if (!handle.parentRoot || (handle.parentRoot as any).isDisposed && (handle.parentRoot as any).isDisposed()) return;
            const mat = this._buildMaterial(scene, handle.idTag);
            const mesh = this._buildMesh(scene, handle.idTag, handle.positions, handle.uvs, handle.indices);
            mesh.material = mat;
            mesh.setEnabled(false);
            handle.material = mat;
            handle.mesh = mesh;
            this._pendingHandles.push(handle);
            console.debug(`[ContrailRibbon] Mesh ready (${handle.idTag})`);
        } catch (err) {
            console.warn(`[ContrailRibbon] _initMeshAsync failed (${handle.idTag}):`, err);
        }
    }

    disposePair(handle: ContrailRibbonHandle | null): void {
        if (!handle) return;
        handle.canceled = true;
        const idx = this._pendingHandles.indexOf(handle);
        if (idx >= 0) this._pendingHandles.splice(idx, 1);
        try { handle.material?.dispose(); } catch (_) { /* ignore */ }
        try { handle.mesh?.dispose(); } catch (_) { /* ignore */ }
        handle.material = null;
        handle.mesh = null;
        handle.history.length = 0;
    }

    /**
     * Per-frame update: push a new history point if conditions met, age existing points,
     * rebuild the ribbon vertices, and refresh per-frame uniforms.
     */
    updatePair(handle: ContrailRibbonHandle | null, dt: number, intensity: number): void {
        if (!handle) return;
        if (!Number.isFinite(dt) || dt <= 0) return;
        const dtClamp = Math.max(0, Math.min(0.25, dt));
        this._timeAccum += dtClamp;

        const safeIntensity = Number.isFinite(intensity) ? Math.max(0, Math.min(1, intensity)) : 0;

        for (let i = 0; i < handle.history.length; i++) {
            handle.history[i].age += dtClamp;
        }
        while (handle.history.length > 0 && handle.history[handle.history.length - 1].age > CONTRAIL_RIBBON_MAX_AGE_S) {
            handle.history.pop();
        }

        handle.pushDtAccum += dtClamp;
        try { handle.emitter.computeWorldMatrix(true); } catch (_) { /* ignore */ }
        const emPos = handle.emitter.getAbsolutePosition();
        const head = handle.history[0];
        let shouldPush = false;
        if (safeIntensity > 0) {
            if (!head) {
                shouldPush = true;
            } else {
                const dx = emPos.x - head.x;
                const dy = emPos.y - head.y;
                const dz = emPos.z - head.z;
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (dist > CONTRAIL_RIBBON_MAX_JUMP_M) {
                    handle.history.length = 0;
                    handle.prevPerpValid = false;
                    shouldPush = true;
                } else if (dist > CONTRAIL_RIBBON_MIN_SEGMENT_M || handle.pushDtAccum > CONTRAIL_RIBBON_MAX_PUSH_DT_S) {
                    shouldPush = true;
                }
            }
        }
        if (shouldPush) {
            handle.history.unshift({ x: emPos.x, y: emPos.y, z: emPos.z, age: 0 });
            handle.pushDtAccum = 0;
            if (handle.history.length > CONTRAIL_RIBBON_MAX_POINTS) {
                handle.history.length = CONTRAIL_RIBBON_MAX_POINTS;
            }
        }

        if (!handle.mesh || !handle.material) return;

        const n = handle.history.length;
        if (n < 2) {
            handle.mesh.setEnabled(false);
            return;
        }

        this._rebuildVertices(handle);
        this._updateUniforms(handle);
        handle.mesh.setEnabled(true);
    }

    private _rebuildVertices(handle: ContrailRibbonHandle): void {
        const n = handle.history.length;
        const positions = handle.positions;
        const uvs = handle.uvs;
        const indices = handle.indices;
        let segDirX = 0, segDirY = 0, segDirZ = 0;
        let perpX = handle.prevPerpValid ? handle.prevPerpX : 0;
        let perpY = handle.prevPerpValid ? handle.prevPerpY : 0;
        let perpZ = handle.prevPerpValid ? handle.prevPerpZ : 1;
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

        for (let i = 0; i < n; i++) {
            const a = handle.history[i];
            if (a.x < minX) minX = a.x; if (a.x > maxX) maxX = a.x;
            if (a.y < minY) minY = a.y; if (a.y > maxY) maxY = a.y;
            if (a.z < minZ) minZ = a.z; if (a.z > maxZ) maxZ = a.z;
            if (i < n - 1) {
                const b = handle.history[i + 1];
                segDirX = a.x - b.x;
                segDirY = a.y - b.y;
                segDirZ = a.z - b.z;
                const segLen = Math.sqrt(segDirX * segDirX + segDirY * segDirY + segDirZ * segDirZ);
                if (segLen > 1e-4) {
                    segDirX /= segLen;
                    segDirY /= segLen;
                    segDirZ /= segLen;
                    const cx = segDirY * 0 - segDirZ * 1;
                    const cy = segDirZ * 0 - segDirX * 0;
                    const cz = segDirX * 1 - segDirY * 0;
                    const pLen = Math.sqrt(cx * cx + cy * cy + cz * cz);
                    if (pLen > 1e-4) {
                        perpX = cx / pLen;
                        perpY = cy / pLen;
                        perpZ = cz / pLen;
                    }
                }
            }

            const ageNorm = Math.max(0, Math.min(1, a.age / CONTRAIL_RIBBON_MAX_AGE_S));
            const halfWidth = CONTRAIL_RIBBON_HEAD_WIDTH_M + (CONTRAIL_RIBBON_TAIL_WIDTH_M - CONTRAIL_RIBBON_HEAD_WIDTH_M) * ageNorm;
            const vOff = i * 6;
            positions[vOff + 0] = a.x - perpX * halfWidth;
            positions[vOff + 1] = a.y - perpY * halfWidth;
            positions[vOff + 2] = a.z - perpZ * halfWidth;
            positions[vOff + 3] = a.x + perpX * halfWidth;
            positions[vOff + 4] = a.y + perpY * halfWidth;
            positions[vOff + 5] = a.z + perpZ * halfWidth;

            const uOff = i * 4;
            uvs[uOff + 0] = ageNorm;
            uvs[uOff + 1] = 0;
            uvs[uOff + 2] = ageNorm;
            uvs[uOff + 3] = 1;
        }

        handle.prevPerpX = perpX;
        handle.prevPerpY = perpY;
        handle.prevPerpZ = perpZ;
        handle.prevPerpValid = true;

        let idxWrite = 0;
        for (let i = 0; i < n - 1; i++) {
            const leftA = i * 2;
            const rightA = i * 2 + 1;
            const leftB = (i + 1) * 2;
            const rightB = (i + 1) * 2 + 1;
            indices[idxWrite++] = leftA;
            indices[idxWrite++] = leftB;
            indices[idxWrite++] = rightA;
            indices[idxWrite++] = leftB;
            indices[idxWrite++] = rightB;
            indices[idxWrite++] = rightA;
        }
        for (let i = idxWrite; i < indices.length; i++) {
            indices[i] = 0;
        }

        const mesh = handle.mesh!;
        mesh.updateVerticesData(BABYLON.VertexBuffer.PositionKind, positions);
        mesh.updateVerticesData(BABYLON.VertexBuffer.UVKind, uvs);
        mesh.setIndices(indices, undefined, true);
        if (n > 0 && Number.isFinite(minX) && Number.isFinite(maxX)) {
            const pad = Math.max(CONTRAIL_RIBBON_HEAD_WIDTH_M, CONTRAIL_RIBBON_TAIL_WIDTH_M);
            this._boundsMin.set(minX - pad, minY - pad, minZ - pad);
            this._boundsMax.set(maxX + pad, maxY + pad, maxZ + pad);
            try {
                mesh.getBoundingInfo().reConstruct(this._boundsMin, this._boundsMax);
            } catch (err) {
                console.warn('[ContrailRibbon] Bounding info refresh failed:', err);
            }
        }
    }

    private _updateUniforms(handle: ContrailRibbonHandle): void {
        const mat = handle.material!;
        const scene = this._sceneRef ?? this.scene.scene;
        const cam: BABYLON.Camera | null = scene?.activeCamera ?? null;
        const camPos = cam ? cam.globalPosition : (this.scene.planeRoot?.position ?? BABYLON.Vector3.Zero());
        const sun = this.scene._sunLight;
        const sunDir = sun ? sun.direction : new BABYLON.Vector3(0, -1, 0.5).normalize();
        const sunColor = sun ? sun.diffuse : new BABYLON.Color3(1.0, 0.95, 0.8);
        const horizonColor = scene?.fogColor ?? new BABYLON.Color3(0.6, 0.7, 0.85);

        mat.setFloat('time', this._timeAccum);
        mat.setVector3('sunDir', sunDir);
        mat.setColor3('sunColor', sunColor);
        mat.setVector3('cameraPos', camPos);
        mat.setColor3('horizonColor', horizonColor);
    }
}
