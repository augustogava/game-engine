import * as BABYLON from '@babylonjs/core';
import type { FlightSceneSimple } from '../../FlightSceneSimple.js';
import {
    CLOUD_TEXTURE_URL,
    CLOUD_VARIANT_COUNT,
    CLOUD_DAY_COLOR_R,
    CLOUD_DAY_COLOR_G,
    CLOUD_DAY_COLOR_B,
    CLOUD_SUNSET_COLOR_R,
    CLOUD_SUNSET_COLOR_G,
    CLOUD_SUNSET_COLOR_B,
    CLOUD_NIGHT_COLOR_R,
    CLOUD_NIGHT_COLOR_G,
    CLOUD_NIGHT_COLOR_B,
    CLOUD_SUNSET_FADE_BAND_DEG,
    CLOUD_NIGHT_FADE_BAND_DEG,
    CLOUD_NIGHT_FADE_OFFSET_DEG,
    CLOUD_ALPHA_INDEX,
    CLOUD_VOLUMETRIC_PUFFS_PER_CLUSTER,
    CLOUD_VOLUMETRIC_PUFF_JITTER,
    CLOUD_ASPECT_Y_JITTER_MIN,
    CLOUD_ASPECT_Y_JITTER_MAX,
    CLOUD_FLIP_X_PROBABILITY,
    CLOUD_KT_TO_MS,
    CLOUD_NEAR_FADE_NEAR_M,
    CLOUD_NEAR_FADE_FAR_M,
    CLOUD_WRAP_FADE_S,
    OVERCAST_TEXTURE_SIZE,
    OVERCAST_TEXTURE_TILES,
    OVERCAST_NOISE_FREQ,
    OVERCAST_DECK_Y_M,
    OVERCAST_DECK_SIZE_M,
    OVERCAST_DECK_ALPHA,
    OVERCAST_ALPHA_INDEX,
    MILKY_WAY_BAND_TILT_DEG,
    MILKY_WAY_BAND_HALF_WIDTH_DEG,
    MILKY_WAY_BAND_COUNT,
    MILKY_WAY_BAND_DIST,
} from '../constants/index.js';

export class CloudsSystem {
    private readonly scene: any;

    constructor(scene: FlightSceneSimple) {
        this.scene = scene;
    }

    buildClouds(scene: BABYLON.Scene): void {
        const layers: { count: number; yMin: number; yRange: number; spread: number; sizeBase: number; aspectY: number; windMult: number }[] = [
            { count: 40, yMin: 600,  yRange: 800,  spread: 15000, sizeBase: 700,  aspectY: 0.60, windMult: 1.0 },
            { count: 50, yMin: 1800, yRange: 1200, spread: 20000, sizeBase: 1000, aspectY: 0.50, windMult: 1.6 },
            { count: 35, yMin: 4000, yRange: 2500, spread: 25000, sizeBase: 1500, aspectY: 0.25, windMult: 3.0 },
        ];

        for (const layer of layers) {
            const variantTemplates: BABYLON.Mesh[] = [];
            for (let v = 0; v < CLOUD_VARIANT_COUNT; v++) {
                const tex = new BABYLON.Texture(CLOUD_TEXTURE_URL, scene);
                tex.hasAlpha = true;
                tex.wAng = (v / CLOUD_VARIANT_COUNT) * Math.PI * 2;

                const mat = new BABYLON.StandardMaterial(`cloudMat_${layer.yMin}_v${v}`, scene);
                mat.diffuseTexture             = tex;
                mat.backFaceCulling            = false;
                mat.useAlphaFromDiffuseTexture = true;
                mat.opacityTexture             = tex;
                mat.transparencyMode           = BABYLON.StandardMaterial.MATERIAL_ALPHABLEND;
                mat.alpha                      = 0.85;
                mat.emissiveColor              = new BABYLON.Color3(CLOUD_DAY_COLOR_R, CLOUD_DAY_COLOR_G, CLOUD_DAY_COLOR_B);
                mat.diffuseColor               = new BABYLON.Color3(0, 0, 0);
                mat.specularColor              = new BABYLON.Color3(0, 0, 0);
                mat.disableLighting            = true;
                mat.disableDepthWrite          = true;
                mat.alphaMode                  = BABYLON.Engine.ALPHA_COMBINE;
                this.scene._cloudMats.push(mat);
                try {
                    const prePass = scene.prePassRenderer;
                    if (prePass) prePass.excludedMaterials.push(mat);
                } catch (_) { /* ignore */ }

                const tpl = BABYLON.MeshBuilder.CreatePlane(`cloudTpl_${layer.yMin}_v${v}`, { size: layer.sizeBase }, scene);
                tpl.isVisible = false;
                tpl.isPickable = false;
                tpl.material = mat;
                tpl.alphaIndex = CLOUD_ALPHA_INDEX;
                this.scene._cloudTemplates.push(tpl);
                variantTemplates.push(tpl);
            }

            const effectiveCount = Math.max(1, Math.round(layer.count * this.scene._cloudDensityMult));
            const puffPerCluster = this.scene._cloudVolumetric ? CLOUD_VOLUMETRIC_PUFFS_PER_CLUSTER : 1;
            for (let i = 0; i < effectiveCount; i++) {
                const ox = (Math.random() - 0.5) * layer.spread;
                const oz = (Math.random() - 0.5) * layer.spread;
                const oy = layer.yMin + Math.random() * layer.yRange;
                const clusterScale = 0.5 + Math.random() * 2.0;
                for (let j = 0; j < puffPerCluster; j++) {
                    const variant = (Math.random() * CLOUD_VARIANT_COUNT) | 0;
                    const tpl = variantTemplates[variant];
                    const ci = tpl.createInstance(`c_${layer.yMin}_${i}_${j}_v${variant}`);
                    const jitter = this.scene._cloudVolumetric ? layer.sizeBase * CLOUD_VOLUMETRIC_PUFF_JITTER : 0;
                    const jx = (Math.random() - 0.5) * jitter * 2;
                    const jy = (Math.random() - 0.5) * jitter * layer.aspectY;
                    const jz = (Math.random() - 0.5) * jitter * 2;
                    ci.position.set(ox + jx, oy + jy, oz + jz);
                    const subScale = this.scene._cloudVolumetric
                        ? clusterScale * (0.6 + Math.random() * 0.7)
                        : clusterScale;
                    const aspectJitter = CLOUD_ASPECT_Y_JITTER_MIN + Math.random() * (CLOUD_ASPECT_Y_JITTER_MAX - CLOUD_ASPECT_Y_JITTER_MIN);
                    const flipX = Math.random() < CLOUD_FLIP_X_PROBABILITY ? -1 : 1;
                    ci.scaling.set(subScale * flipX, subScale * layer.aspectY * aspectJitter, 1);
                    ci.billboardMode = BABYLON.Mesh.BILLBOARDMODE_Y;
                    ci.isPickable = false;
                    this.scene.cloudInstances.push({ mesh: ci, yBase: oy + jy, spread: layer.spread, windMult: layer.windMult, wrapFade: 1 });
                }
            }
        }
    }

    rebuildClouds(scene: BABYLON.Scene): void {
        for (const c of this.scene.cloudInstances) { try { c.mesh.dispose(); } catch (_) { /* ignore */ } }
        this.scene.cloudInstances = [];
        for (const t of this.scene._cloudTemplates) { try { t.dispose(); } catch (_) { /* ignore */ } }
        this.scene._cloudTemplates = [];
        for (const m of this.scene._cloudMats) { try { m.dispose(true, true); } catch (_) { /* ignore */ } }
        this.scene._cloudMats = [];
        this.buildClouds(scene);
    }

    buildOvercastTexture(scene: BABYLON.Scene): BABYLON.DynamicTexture {
        const SIZE = OVERCAST_TEXTURE_SIZE;
        const tex = new BABYLON.DynamicTexture(
            'overcastTex',
            SIZE,
            scene,
            true,
            BABYLON.Texture.TRILINEAR_SAMPLINGMODE,
        );
        const ctx = tex.getContext() as CanvasRenderingContext2D;
        const img = ctx.createImageData(SIZE, SIZE);

        const FREQ = OVERCAST_NOISE_FREQ;
        const FEATURE_COUNT = FREQ * FREQ;
        const features: { x: number; y: number }[] = [];
        for (let i = 0; i < FEATURE_COUNT; i++) {
            features.push({ x: Math.random(), y: Math.random() });
        }

        const detailFeatures: { x: number; y: number }[] = [];
        const DETAIL_COUNT = FREQ * FREQ * 4;
        for (let i = 0; i < DETAIL_COUNT; i++) {
            detailFeatures.push({ x: Math.random(), y: Math.random() });
        }

        const wrapDistSq = (ax: number, ay: number, bx: number, by: number) => {
            let dx = ax - bx;
            let dy = ay - by;
            if (dx >  0.5) dx -= 1;
            if (dx < -0.5) dx += 1;
            if (dy >  0.5) dy -= 1;
            if (dy < -0.5) dy += 1;
            return dx * dx + dy * dy;
        };

        for (let y = 0; y < SIZE; y++) {
            for (let x = 0; x < SIZE; x++) {
                const fx = x / SIZE;
                const fy = y / SIZE;
                let minBase = 10;
                for (const f of features) {
                    const d = wrapDistSq(fx, fy, f.x, f.y);
                    if (d < minBase) minBase = d;
                }
                let minDetail = 10;
                for (const f of detailFeatures) {
                    const d = wrapDistSq(fx, fy, f.x, f.y);
                    if (d < minDetail) minDetail = d;
                }
                const baseDist = Math.sqrt(minBase) * FREQ;
                const detailDist = Math.sqrt(minDetail) * (FREQ * 2);
                const baseLayer   = Math.max(0, 1 - baseDist * 1.0);
                const detailLayer = Math.max(0, 1 - detailDist * 1.2);
                const cloud = Math.max(0, Math.min(1, baseLayer * 0.75 + detailLayer * 0.35));
                const alpha = Math.pow(cloud, 0.8);
                const i4 = (y * SIZE + x) * 4;
                img.data[i4]     = 255;
                img.data[i4 + 1] = 255;
                img.data[i4 + 2] = 255;
                img.data[i4 + 3] = Math.round(alpha * 255);
            }
        }

        ctx.putImageData(img, 0, 0);
        tex.update(true);
        tex.hasAlpha = true;
        tex.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
        tex.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
        return tex;
    }

    setOvercast(scene: BABYLON.Scene, enabled: boolean): void {
        if (enabled) {
            if (this.scene._overcastMesh) {
                this.scene._overcastMesh.isVisible = true;
                return;
            }
            const deck = BABYLON.MeshBuilder.CreateGround('overcastDeck', { width: OVERCAST_DECK_SIZE_M, height: OVERCAST_DECK_SIZE_M, subdivisions: 1 }, scene);
            deck.position.y = OVERCAST_DECK_Y_M;
            deck.isPickable = false;
            deck.applyFog = true;
            deck.renderingGroupId = 0;
            deck.alphaIndex = OVERCAST_ALPHA_INDEX;

            const mat = new BABYLON.StandardMaterial('overcastMat', scene);
            const tex = this.buildOvercastTexture(scene);
            tex.uScale = OVERCAST_TEXTURE_TILES;
            tex.vScale = OVERCAST_TEXTURE_TILES;
            mat.diffuseTexture = tex;
            mat.opacityTexture = tex;
            mat.useAlphaFromDiffuseTexture = true;
            mat.emissiveColor = new BABYLON.Color3(0.85, 0.85, 0.9);
            mat.diffuseColor = new BABYLON.Color3(0, 0, 0);
            mat.specularColor = new BABYLON.Color3(0, 0, 0);
            mat.disableLighting = true;
            mat.backFaceCulling = false;
            mat.alpha = OVERCAST_DECK_ALPHA;
            mat.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
            mat.disableDepthWrite = true;
            mat.alphaMode = BABYLON.Engine.ALPHA_COMBINE;
            deck.material = mat;

            this.scene._overcastMesh = deck;
            this.scene._overcastMat = mat;
            console.debug(`[Overcast] Deck created with seamless Worley overcast texture (${OVERCAST_TEXTURE_SIZE}px, ${OVERCAST_TEXTURE_TILES}x tiling)`);
        } else {
            if (this.scene._overcastMesh) { try { this.scene._overcastMesh.dispose(); } catch (_) { /* ignore */ } this.scene._overcastMesh = null; }
            if (this.scene._overcastMat) { try { this.scene._overcastMat.dispose(true, true); } catch (_) { /* ignore */ } this.scene._overcastMat = null; }
        }
    }

    setMilkyWay(scene: BABYLON.Scene, enabled: boolean): void {
        if (enabled) {
            if (this.scene._milkyWayRoot) {
                this.scene._milkyWayRoot.setEnabled(true);
                return;
            }
            const root = new BABYLON.TransformNode('milkyWayRoot', scene);

            const mat = new BABYLON.StandardMaterial('milkyWayMat', scene);
            mat.emissiveColor = new BABYLON.Color3(0.55, 0.55, 0.75);
            mat.diffuseColor = new BABYLON.Color3(0, 0, 0);
            mat.specularColor = new BABYLON.Color3(0, 0, 0);
            mat.disableLighting = true;
            mat.backFaceCulling = false;
            mat.alpha = 0.18;
            mat.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
            mat.disableDepthWrite = true;

            const tilt = (MILKY_WAY_BAND_TILT_DEG * Math.PI) / 180;
            const halfWidthRad = (MILKY_WAY_BAND_HALF_WIDTH_DEG * Math.PI) / 180;
            for (let i = 0; i < MILKY_WAY_BAND_COUNT; i++) {
                const theta = (i / MILKY_WAY_BAND_COUNT) * Math.PI * 2;
                const lat = (Math.random() - 0.5) * 2 * halfWidthRad;
                const cosLat = Math.cos(lat);
                const x0 = Math.cos(theta) * cosLat;
                const y0 = Math.sin(lat);
                const z0 = Math.sin(theta) * cosLat;
                const ct = Math.cos(tilt);
                const st = Math.sin(tilt);
                const yT = y0 * ct - z0 * st;
                const zT = y0 * st + z0 * ct;
                if (yT < 0) continue;
                const quad = BABYLON.MeshBuilder.CreatePlane(`mw_${i}`, { size: 1500 + Math.random() * 1200 }, scene);
                quad.position.set(x0 * MILKY_WAY_BAND_DIST, yT * MILKY_WAY_BAND_DIST, zT * MILKY_WAY_BAND_DIST);
                quad.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
                quad.isPickable = false;
                quad.infiniteDistance = true;
                quad.applyFog = false;
                quad.material = mat;
                quad.parent = root;
            }
            this.scene._milkyWayRoot = root;
        } else {
            if (this.scene._milkyWayRoot) {
                this.scene._milkyWayRoot.setEnabled(false);
            }
        }
    }

    updateClouds(dt: number): void {
        if (!this.scene.spawned || this.scene.cloudInstances.length === 0) return;
        const px = this.scene.planeRoot.position.x;
        const pz = this.scene.planeRoot.position.z;

        const windRefFt = 5000;
        const windRef = this.scene._getWindAtAltitude(windRefFt);
        const dirRad = (windRef.dirDeg * Math.PI) / 180;
        const baseVx = -Math.sin(dirRad) * windRef.speedKt * CLOUD_KT_TO_MS;
        const baseVz = -Math.cos(dirRad) * windRef.speedKt * CLOUD_KT_TO_MS;
        const dtClamp = Math.max(0, Math.min(0.1, dt));
        this.scene._cloudWindOffset.x += baseVx * dtClamp;
        this.scene._cloudWindOffset.z += baseVz * dtClamp;

        const cameraFadeOn = this.scene._premium.cloudCameraFade;
        const cam = cameraFadeOn ? this.scene.scene?.activeCamera : null;
        const camX = cam ? cam.globalPosition.x : px;
        const camY = cam ? cam.globalPosition.y : 0;
        const camZ = cam ? cam.globalPosition.z : pz;
        const fadeNear = CLOUD_NEAR_FADE_NEAR_M;
        const fadeFar  = CLOUD_NEAR_FADE_FAR_M;
        const wrapStep = dt / CLOUD_WRAP_FADE_S;

        for (const c of this.scene.cloudInstances) {
            c.mesh.position.x += baseVx * c.windMult * dtClamp;
            c.mesh.position.z += baseVz * c.windMult * dtClamp;

            const half = c.spread * 0.5;
            const dx = c.mesh.position.x - px;
            const dz = c.mesh.position.z - pz;
            let wrapped = false;
            if (dx >  half) { c.mesh.position.x -= c.spread; wrapped = true; }
            if (dx < -half) { c.mesh.position.x += c.spread; wrapped = true; }
            if (dz >  half) { c.mesh.position.z -= c.spread; wrapped = true; }
            if (dz < -half) { c.mesh.position.z += c.spread; wrapped = true; }

            if (cameraFadeOn) {
                if (wrapped) c.wrapFade = 0;
                else if (c.wrapFade < 1) c.wrapFade = Math.min(1, c.wrapFade + wrapStep);

                const ddx = c.mesh.position.x - camX;
                const ddy = c.mesh.position.y - camY;
                const ddz = c.mesh.position.z - camZ;
                const dist = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
                const nearFade = Math.max(0, Math.min(1, (dist - fadeNear) / (fadeFar - fadeNear)));
                const v = Math.min(nearFade, c.wrapFade);
                const wantVisible = v > 0.01;
                if (c.mesh.isVisible !== wantVisible) c.mesh.isVisible = wantVisible;
            } else if (!c.mesh.isVisible) {
                c.mesh.isVisible = true;
                c.wrapFade = 1;
            }
        }
    }

    applyCloudTint(elevation: number): void {
        if (this.scene._cloudMats.length === 0) return;
        const sunsetT = 1.0 - Math.max(0, Math.min(1, elevation / CLOUD_SUNSET_FADE_BAND_DEG));
        const nightT = Math.max(0, Math.min(1, (CLOUD_NIGHT_FADE_OFFSET_DEG - elevation) / CLOUD_NIGHT_FADE_BAND_DEG));

        const dayR = CLOUD_DAY_COLOR_R + (CLOUD_SUNSET_COLOR_R - CLOUD_DAY_COLOR_R) * sunsetT;
        const dayG = CLOUD_DAY_COLOR_G + (CLOUD_SUNSET_COLOR_G - CLOUD_DAY_COLOR_G) * sunsetT;
        const dayB = CLOUD_DAY_COLOR_B + (CLOUD_SUNSET_COLOR_B - CLOUD_DAY_COLOR_B) * sunsetT;

        const r = dayR + (CLOUD_NIGHT_COLOR_R - dayR) * nightT;
        const g = dayG + (CLOUD_NIGHT_COLOR_G - dayG) * nightT;
        const b = dayB + (CLOUD_NIGHT_COLOR_B - dayB) * nightT;

        for (const mat of this.scene._cloudMats) {
            mat.emissiveColor.set(r, g, b);
        }
    }
}
