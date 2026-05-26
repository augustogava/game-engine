import * as BABYLON from '@babylonjs/core';
import { SkyMaterial } from '@babylonjs/materials/sky';
import type { FlightSceneSimple } from '../../FlightSceneSimple.js';
import { getSunPosition } from '../physics/SolarPosition.js';
import {
    SUN_DIAMETER,
    SUN_TEXTURE_PATH,
    SUN_HALO_SIZE,
    SUN_HALO_TEX_SIZE,
    SUN_DISTANCE,
    SUN_FADE_START_ELEV_DEG,
    SUN_FADE_END_ELEV_DEG,
    MOON_DIAMETER,
    MOON_TEXTURE_PATH,
    MOON_HALO_SIZE,
    MOON_HALO_TEX_SIZE,
    MOON_DISTANCE,
    MOON_FADE_ELEV_DEG,
    MOON_HALO_FADE_BAND_DEG,
    MOON_HALO_FADE_OFFSET_DEG,
    BRIGHT_STAR_COUNT,
    BRIGHT_STAR_BASE_SIZE,
    BRIGHT_STAR_SIZE_RANDOM,
    SKY_LUMINANCE_MAX,
    SKY_MIE_G_LOW_HORIZON,
    SKY_MIE_G_HIGH_SUN,
    SKY_MIE_G_TRANSITION_DEG,
    NIGHT_HORIZON_GLOW_R,
    NIGHT_HORIZON_GLOW_G,
    NIGHT_HORIZON_GLOW_B,
    NIGHT_HORIZON_GLOW_FADE_BAND_DEG,
    NIGHT_HORIZON_GLOW_OFFSET_DEG,
    HDR_ENV_NONE,
    HDR_ENV_AUTO,
    HDR_ASSETS_PATH,
    HDR_CUBE_SIZE,
    HDR_DEFAULT_ENV_URL,
    HDR_SKYBOX_LEVEL,
    HDR_SKYBOX_SIZE,
    HDR_AUTO_DAY_FILE,
    HDR_AUTO_NIGHT_FILE,
    HDR_AUTO_NIGHT_ELEVATION_DEG,
    HDR_AUTO_HYSTERESIS_DEG,
} from '../constants/index.js';

const DAYNIGHT_EXPOSURE_EPSILON = 0.005;
const DAYNIGHT_ENV_INTENSITY_EPSILON = 0.005;
const DAYNIGHT_SUN_DIR_EPSILON = 0.002;
const DAYNIGHT_LIGHT_INTENSITY_EPSILON = 0.005;
const DAYNIGHT_COLOR_EPSILON = 0.005;
const DAYNIGHT_SKY_LUMINANCE_EPSILON = 0.005;
const DAYNIGHT_SKY_TURBIDITY_EPSILON = 0.05;
const DAYNIGHT_SKY_RAYLEIGH_EPSILON = 0.01;
const DAYNIGHT_SKY_MIE_COEFF_EPSILON = 0.0005;
const DAYNIGHT_SKY_MIE_G_EPSILON = 0.005;
const DAYNIGHT_FOG_COLOR_EPSILON = 0.005;

export class LightingSystem {
    private readonly scene: any;
    private _originalEnvTexture: BABYLON.BaseTexture | null = null;
    private _hdrTexture: BABYLON.HDRCubeTexture | null = null;
    private _hdrSkyboxTexture: BABYLON.HDRCubeTexture | null = null;
    private _hdrSkyboxMaterial: BABYLON.StandardMaterial | null = null;
    private _hdrSkyboxMesh: BABYLON.Mesh | null = null;
    private _currentHdrEnv: string = HDR_ENV_NONE;
    private _userHdrChoice: string = HDR_ENV_NONE;
    private _lastExposure: number = Number.NaN;
    private _lastEnvIntensity: number = Number.NaN;
    private _lastSunDirX: number = Number.NaN;
    private _lastSunDirY: number = Number.NaN;
    private _lastSunDirZ: number = Number.NaN;
    private _lastSunIntensity: number = Number.NaN;
    private _lastSunDiffR: number = Number.NaN;
    private _lastSunDiffG: number = Number.NaN;
    private _lastSunDiffB: number = Number.NaN;
    private _lastHemiIntensity: number = Number.NaN;
    private _lastHemiDiffR: number = Number.NaN;
    private _lastHemiDiffG: number = Number.NaN;
    private _lastHemiDiffB: number = Number.NaN;
    private _lastHemiGroundR: number = Number.NaN;
    private _lastHemiGroundG: number = Number.NaN;
    private _lastHemiGroundB: number = Number.NaN;
    private _lastFillIntensity: number = Number.NaN;
    private _lastSkyLuminance: number = Number.NaN;
    private _lastSkyTurbidity: number = Number.NaN;
    private _lastSkyRayleigh: number = Number.NaN;
    private _lastSkyMieCoeff: number = Number.NaN;
    private _lastSkyMieG: number = Number.NaN;
    private _lastFogR: number = Number.NaN;
    private _lastFogG: number = Number.NaN;
    private _lastFogB: number = Number.NaN;
    private _lastClearR: number = Number.NaN;
    private _lastClearG: number = Number.NaN;
    private _lastClearB: number = Number.NaN;

    constructor(scene: FlightSceneSimple) {
        this.scene = scene;
    }

    getLastDayNightSunIntensity(): number {
        return Number.isFinite(this._lastSunIntensity) ? this._lastSunIntensity : 3.0;
    }

    setupLighting(scene: BABYLON.Scene): void {
        this.scene._hemiLight = new BABYLON.HemisphericLight('sky', new BABYLON.Vector3(0, 1, 0), scene);
        this.scene._hemiLight.intensity = 0.5;
        this.scene._hemiLight.diffuse = new BABYLON.Color3(0.6, 0.75, 1.0);
        this.scene._hemiLight.groundColor = new BABYLON.Color3(0.25, 0.35, 0.18);

        this.scene._sunLight = new BABYLON.DirectionalLight('sun', new BABYLON.Vector3(-0.4, -0.9, -0.3).normalize(), scene);
        this.scene._sunLight.position = new BABYLON.Vector3(800, 1200, 800);
        this.scene._sunLight.intensity = 3.0;
        this.scene._sunLight.diffuse = new BABYLON.Color3(1.0, 0.92, 0.75);
        this.scene._sunLight.specular = new BABYLON.Color3(1.0, 0.9, 0.6);

        this.scene._fillLight = new BABYLON.DirectionalLight('fill', new BABYLON.Vector3(0.4, -0.3, 0.3).normalize(), scene);
        this.scene._fillLight.intensity = 0.6;
        this.scene._fillLight.diffuse = new BABYLON.Color3(0.6, 0.7, 0.9);
        this.scene._fillLight.specular = BABYLON.Color3.Black();

        const isMobile = this.scene.isMobile === true;
        const shadowMapSize = isMobile ? 1024 : 4096;
        this.scene._shadowGen = new BABYLON.CascadedShadowGenerator(shadowMapSize, this.scene._sunLight);
        this.scene._shadowGen.lambda                 = 0.75;
        this.scene._shadowGen.cascadeBlendPercentage = 0.1;
        this.scene._shadowGen.depthClamp             = true;
        this.scene._shadowGen.autoCalcDepthBounds    = true;
        this.scene._shadowGen.stabilizeCascades      = true;
        this.scene._shadowGen.numCascades            = isMobile ? 2 : 4;
        this.scene._shadowGen.penumbraDarkness       = 0.6;
        this.scene._shadowGen.usePercentageCloserFiltering = true;
        (this.scene._shadowGen as any).filteringQuality = isMobile ? BABYLON.ShadowGenerator.QUALITY_LOW : BABYLON.ShadowGenerator.QUALITY_HIGH;
        this.scene._shadow = this.scene._shadowGen;

        scene.environmentIntensity = 1.3;

        this.buildSunMesh(scene);
        this.buildStars(scene);
        this.buildMoon(scene);
        this.applyDayNightCycle(scene);
    }

    buildSunMesh(scene: BABYLON.Scene): void {
        this.scene._sunMesh = BABYLON.MeshBuilder.CreateSphere('sunMesh', { diameter: SUN_DIAMETER, segments: 32 }, scene);
        this.scene._sunMesh.isPickable = false;
        this.scene._sunMesh.infiniteDistance = true;
        this.scene._sunMesh.applyFog = false;
        this.scene._sunMesh.renderingGroupId = 0;

        this.scene._sunMeshMat = new BABYLON.StandardMaterial('sunMeshMat', scene);
        try {
            const tex = new BABYLON.Texture(SUN_TEXTURE_PATH, scene);
            tex.hasAlpha = false;
            this.scene._sunMeshMat.emissiveTexture = tex;
            this.scene._sunMeshMat.diffuseTexture = tex;
        } catch (err) {
            console.warn('[Sky] Failed to load sun texture, falling back to plain emissive', err);
        }
        this.scene._sunMeshMat.emissiveColor = new BABYLON.Color3(1.0, 0.95, 0.85);
        this.scene._sunMeshMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        this.scene._sunMeshMat.specularColor = new BABYLON.Color3(0, 0, 0);
        this.scene._sunMeshMat.disableLighting = true;
        this.scene._sunMeshMat.backFaceCulling = true;
        this.scene._sunMesh.material = this.scene._sunMeshMat;

        this.buildSunHalo(scene);
    }

    buildSunHalo(scene: BABYLON.Scene): void {
        const halo = BABYLON.MeshBuilder.CreatePlane('sunHalo', { size: SUN_HALO_SIZE }, scene);
        halo.isPickable = false;
        halo.infiniteDistance = true;
        halo.applyFog = false;
        halo.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
        halo.renderingGroupId = 0;

        const haloTex = new BABYLON.DynamicTexture('sunHaloTex', { width: SUN_HALO_TEX_SIZE, height: SUN_HALO_TEX_SIZE }, scene, true);
        const ctx = haloTex.getContext() as CanvasRenderingContext2D;
        const cx = SUN_HALO_TEX_SIZE / 2;
        const cy = SUN_HALO_TEX_SIZE / 2;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cx);
        grad.addColorStop(0.00, 'rgba(255, 240, 200, 1.00)');
        grad.addColorStop(0.18, 'rgba(255, 215, 140, 0.65)');
        grad.addColorStop(0.45, 'rgba(255, 180, 120, 0.22)');
        grad.addColorStop(1.00, 'rgba(255, 160,  90, 0.00)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, SUN_HALO_TEX_SIZE, SUN_HALO_TEX_SIZE);
        haloTex.hasAlpha = true;
        haloTex.update();

        const mat = new BABYLON.StandardMaterial('sunHaloMat', scene);
        mat.emissiveTexture = haloTex;
        mat.opacityTexture = haloTex;
        mat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        mat.emissiveColor = new BABYLON.Color3(1, 1, 1);
        mat.specularColor = new BABYLON.Color3(0, 0, 0);
        mat.disableLighting = true;
        mat.backFaceCulling = false;
        mat.disableDepthWrite = true;
        mat.alphaMode = BABYLON.Engine.ALPHA_ADD;
        mat.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
        halo.material = mat;

        this.scene._sunHaloMesh = halo;
        this.scene._sunHaloMat = mat;
    }

    buildStars(scene: BABYLON.Scene): void {
        this.scene._starRoot = new BABYLON.TransformNode('starRoot', scene);
        this.scene._starInstances = [];
        this.scene._starPhases = [];
        this.scene._starBaseScales = [];

        const starColors = [
            new BABYLON.Color3(1.0, 0.85, 0.7),
            new BABYLON.Color3(1.0, 0.95, 0.9),
            new BABYLON.Color3(1.0, 1.0, 1.0),
            new BABYLON.Color3(0.85, 0.9, 1.0),
            new BABYLON.Color3(0.7, 0.8, 1.0),
        ];

        const starMats = starColors.map((c, i) => {
            const mat = new BABYLON.StandardMaterial(`starMat${i}`, scene);
            mat.emissiveColor = c;
            mat.disableLighting = true;
            return mat;
        });

        const baseStar = BABYLON.MeshBuilder.CreatePlane('starBase', { size: 1 }, scene);
        baseStar.material = starMats[2];
        baseStar.isVisible = false;
        baseStar.parent = this.scene._starRoot;

        const starDist = 50000;
        const STAR_COUNT = 800;
        const baseStars: BABYLON.Mesh[] = [baseStar];
        for (let m = 0; m < starMats.length; m++) {
            if (m === 2) continue;
            const bs = BABYLON.MeshBuilder.CreatePlane(`starBase${m}`, { size: 1 }, scene);
            bs.material = starMats[m];
            bs.isVisible = false;
            bs.parent = this.scene._starRoot;
            baseStars[m] = bs;
        }
        baseStars[2] = baseStar;

        for (let i = 0; i < STAR_COUNT; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const cosP = Math.abs(Math.cos(phi));
            if (cosP < 0.03) continue;
            const x = starDist * Math.sin(phi) * Math.cos(theta);
            const y = starDist * cosP;
            const z = starDist * Math.sin(phi) * Math.sin(theta);
            const matIdx = Math.floor(Math.random() * starMats.length);
            const inst = baseStars[matIdx].createInstance('star_' + i);
            inst.position.set(x, y, z);
            const magnitude = Math.random();
            const sz = 8 + magnitude * 50;
            inst.scaling.setAll(sz);
            inst.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
            inst.isPickable = false;

            this.scene._starInstances.push(inst);
            this.scene._starPhases.push(Math.random() * Math.PI * 2);
            this.scene._starBaseScales.push(sz);
        }

        const brightColors = [
            new BABYLON.Color3(1.00, 0.98, 0.95),
            new BABYLON.Color3(1.00, 0.85, 0.55),
            new BABYLON.Color3(0.80, 0.90, 1.00),
            new BABYLON.Color3(1.00, 0.55, 0.40),
            new BABYLON.Color3(1.00, 1.00, 0.75),
        ];
        const brightMats = brightColors.map((c, i) => {
            const m = new BABYLON.StandardMaterial(`brightStarMat${i}`, scene);
            m.emissiveColor = c;
            m.disableLighting = true;
            m.diffuseColor = new BABYLON.Color3(0, 0, 0);
            m.specularColor = new BABYLON.Color3(0, 0, 0);
            return m;
        });
        const brightBases: BABYLON.Mesh[] = brightMats.map((mat, i) => {
            const b = BABYLON.MeshBuilder.CreatePlane(`brightStarBase${i}`, { size: 1 }, scene);
            b.material = mat;
            b.isVisible = false;
            b.parent = this.scene._starRoot;
            return b;
        });

        for (let i = 0; i < BRIGHT_STAR_COUNT; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const cosP = Math.abs(Math.cos(phi));
            if (cosP < 0.05) continue;
            const x = starDist * Math.sin(phi) * Math.cos(theta);
            const y = starDist * cosP;
            const z = starDist * Math.sin(phi) * Math.sin(theta);
            const matIdx = Math.floor(Math.random() * brightBases.length);
            const inst = brightBases[matIdx].createInstance('brightStar_' + i);
            inst.position.set(x, y, z);
            const sz = BRIGHT_STAR_BASE_SIZE + Math.random() * BRIGHT_STAR_SIZE_RANDOM;
            inst.scaling.setAll(sz);
            inst.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
            inst.isPickable = false;
            this.scene._starInstances.push(inst);
            this.scene._starPhases.push(Math.random() * Math.PI * 2);
            this.scene._starBaseScales.push(sz);
        }

        this.scene._starRoot.setEnabled(false);
    }

    buildMoon(scene: BABYLON.Scene): void {
        this.scene._moonMesh = BABYLON.MeshBuilder.CreateSphere('moonMesh', { diameter: MOON_DIAMETER, segments: 32 }, scene);
        this.scene._moonMesh.isPickable = false;
        this.scene._moonMesh.infiniteDistance = true;
        this.scene._moonMesh.applyFog = false;
        this.scene._moonMesh.renderingGroupId = 0;

        this.scene._moonMat = new BABYLON.StandardMaterial('moonMat', scene);
        try {
            const tex = new BABYLON.Texture(MOON_TEXTURE_PATH, scene);
            tex.hasAlpha = false;
            this.scene._moonMat.diffuseTexture = tex;
            this.scene._moonMat.emissiveTexture = tex;
        } catch (err) {
            console.warn('[Sky] Failed to load moon texture, falling back to plain emissive', err);
        }
        this.scene._moonMat.emissiveColor = new BABYLON.Color3(0.75, 0.78, 0.85);
        this.scene._moonMat.diffuseColor = new BABYLON.Color3(0.05, 0.05, 0.08);
        this.scene._moonMat.specularColor = new BABYLON.Color3(0, 0, 0);
        this.scene._moonMat.disableLighting = true;
        this.scene._moonMat.backFaceCulling = true;
        this.scene._moonMesh.material = this.scene._moonMat;
        this.scene._moonMesh.isVisible = false;

        this.buildMoonHalo(scene);
    }

    buildMoonHalo(scene: BABYLON.Scene): void {
        const halo = BABYLON.MeshBuilder.CreatePlane('moonHalo', { size: MOON_HALO_SIZE }, scene);
        halo.isPickable = false;
        halo.infiniteDistance = true;
        halo.applyFog = false;
        halo.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
        halo.renderingGroupId = 0;

        const haloTex = new BABYLON.DynamicTexture('moonHaloTex', { width: MOON_HALO_TEX_SIZE, height: MOON_HALO_TEX_SIZE }, scene, true);
        const ctx = haloTex.getContext() as CanvasRenderingContext2D;
        const cx = MOON_HALO_TEX_SIZE / 2;
        const cy = MOON_HALO_TEX_SIZE / 2;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cx);
        grad.addColorStop(0.00, 'rgba(190, 210, 235, 0.70)');
        grad.addColorStop(0.30, 'rgba(140, 170, 220, 0.25)');
        grad.addColorStop(1.00, 'rgba( 80, 100, 160, 0.00)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, MOON_HALO_TEX_SIZE, MOON_HALO_TEX_SIZE);
        haloTex.hasAlpha = true;
        haloTex.update();

        const mat = new BABYLON.StandardMaterial('moonHaloMat', scene);
        mat.emissiveTexture = haloTex;
        mat.opacityTexture = haloTex;
        mat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        mat.emissiveColor = new BABYLON.Color3(1, 1, 1);
        mat.specularColor = new BABYLON.Color3(0, 0, 0);
        mat.disableLighting = true;
        mat.backFaceCulling = false;
        mat.disableDepthWrite = true;
        mat.alphaMode = BABYLON.Engine.ALPHA_ADD;
        mat.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
        halo.material = mat;
        halo.isVisible = false;

        this.scene._moonHaloMesh = halo;
        this.scene._moonHaloMat = mat;
    }

    updateStarTwinkle(dt: number): void {
        if (!this.scene._starRoot || !this.scene._starRoot.isEnabled()) return;
        this.scene._starTime += dt;
        if (this.scene._starTime > 10000) this.scene._starTime -= 10000;
        for (let i = 0; i < this.scene._starInstances.length; i++) {
            const phase = this.scene._starPhases[i];
            const base = this.scene._starBaseScales[i];
            const flicker = 0.7 + 0.3 * Math.sin(this.scene._starTime * (1.5 + phase) + phase * 6.28);
            this.scene._starInstances[i].scaling.setAll(base * flicker);
        }
    }

    getSimDate(): Date {
        return new Date(Date.now() + this.scene._simTimeOffsetMs);
    }

    applyDayNightCycle(scene: BABYLON.Scene): void {
        const { elevation, azimuth } = getSunPosition(this.scene.originLat, this.scene.originLon, this.getSimDate());
        this.scene._sunElevation = elevation;
        const rad = Math.PI / 180;
        const elevR = elevation * rad;
        const azR = azimuth * rad;

        const sunDirX = -Math.sin(azR) * Math.cos(elevR);
        const sunDirY = -Math.sin(elevR);
        const sunDirZ = -Math.cos(azR) * Math.cos(elevR);
        const sunDir = new BABYLON.Vector3(sunDirX, sunDirY, sunDirZ).normalize();

        const sunPosX = Math.sin(azR) * Math.cos(elevR);
        const sunPosY = Math.sin(elevR);
        const sunPosZ = Math.cos(azR) * Math.cos(elevR);

        if (this.scene._sunLight) {
            const dx = sunDir.x - this._lastSunDirX;
            const dy = sunDir.y - this._lastSunDirY;
            const dz = sunDir.z - this._lastSunDirZ;
            const dirChanged = !Number.isFinite(this._lastSunDirX)
                || Math.abs(dx) >= DAYNIGHT_SUN_DIR_EPSILON
                || Math.abs(dy) >= DAYNIGHT_SUN_DIR_EPSILON
                || Math.abs(dz) >= DAYNIGHT_SUN_DIR_EPSILON;
            if (dirChanged) {
                this.scene._sunLight.direction = sunDir;
                this.scene._sunLight.position = sunDir.scale(-1200);
                this._lastSunDirX = sunDir.x;
                this._lastSunDirY = sunDir.y;
                this._lastSunDirZ = sunDir.z;
            }
        }

        const sunWorldPos = sunDir.scale(-SUN_DISTANCE);
        if (this.scene._sunMesh) {
            this.scene._sunMesh.position = sunWorldPos;
            const fadeRange = (SUN_FADE_START_ELEV_DEG - SUN_FADE_END_ELEV_DEG) || 1;
            const sunVisFade = Math.max(0, Math.min(1, (elevation - SUN_FADE_END_ELEV_DEG) / fadeRange));
            this.scene._sunMesh.visibility = sunVisFade;
            this.scene._sunMesh.isVisible = sunVisFade > 0.01;
        }

        if (this.scene._sunHaloMesh && this.scene._sunHaloMat) {
            this.scene._sunHaloMesh.position = sunWorldPos.clone();
            const horizonT = 1.0 - Math.max(0, Math.min(1, elevation / 30));
            const baseFade = Math.max(0, Math.min(1, (elevation + 4) / 10));
            const haloAlpha = baseFade * (0.55 + horizonT * 0.40);
            this.scene._sunHaloMat.alpha = haloAlpha;
            const haloR = 1.0;
            const haloG = 0.95 - horizonT * 0.45;
            const haloB = 0.85 - horizonT * 0.65;
            this.scene._sunHaloMat.emissiveColor.set(haloR, Math.max(haloG, 0.2), Math.max(haloB, 0.1));
            this.scene._sunHaloMesh.isVisible = haloAlpha > 0.02;
        }

        if (this.scene._lensFlareSystem) {
            this.scene._lensFlareSystem.isEnabled = elevation > 1 && !this.scene._flareOccluded;
        }
        this.scene._updateColorGrading(elevation);

        if (this.scene._skyMaterial) {
            this.scene._skyMaterial.sunPosition = new BABYLON.Vector3(sunPosX * 1000, sunPosY * 1000, sunPosZ * 1000);
            const lumT = Math.max(0, Math.min(1, (elevation + 5) / 20));
            const newLuminance = Math.min(SKY_LUMINANCE_MAX, 0.01 + lumT * 1.19);
            if (!Number.isFinite(this._lastSkyLuminance) || Math.abs(newLuminance - this._lastSkyLuminance) >= DAYNIGHT_SKY_LUMINANCE_EPSILON) {
                this.scene._skyMaterial.luminance = newLuminance;
                this._lastSkyLuminance = newLuminance;
            }
            const sunsetT = 1.0 - Math.max(0, Math.min(1, Math.abs(elevation) / 10));
            const newTurbidity = 8 + sunsetT * 6;
            if (!Number.isFinite(this._lastSkyTurbidity) || Math.abs(newTurbidity - this._lastSkyTurbidity) >= DAYNIGHT_SKY_TURBIDITY_EPSILON) {
                this.scene._skyMaterial.turbidity = newTurbidity;
                this._lastSkyTurbidity = newTurbidity;
            }
            const newRayleigh = 1.5 + lumT * 1.5;
            if (!Number.isFinite(this._lastSkyRayleigh) || Math.abs(newRayleigh - this._lastSkyRayleigh) >= DAYNIGHT_SKY_RAYLEIGH_EPSILON) {
                this.scene._skyMaterial.rayleigh = newRayleigh;
                this._lastSkyRayleigh = newRayleigh;
            }
            const newMieCoeff = 0.005 + sunsetT * 0.015;
            if (!Number.isFinite(this._lastSkyMieCoeff) || Math.abs(newMieCoeff - this._lastSkyMieCoeff) >= DAYNIGHT_SKY_MIE_COEFF_EPSILON) {
                this.scene._skyMaterial.mieCoefficient = newMieCoeff;
                this._lastSkyMieCoeff = newMieCoeff;
            }
            const elevForG = Math.max(0, Math.min(SKY_MIE_G_TRANSITION_DEG, elevation));
            const gT = elevForG / SKY_MIE_G_TRANSITION_DEG;
            const newMieG = SKY_MIE_G_LOW_HORIZON + (SKY_MIE_G_HIGH_SUN - SKY_MIE_G_LOW_HORIZON) * gT;
            if (!Number.isFinite(this._lastSkyMieG) || Math.abs(newMieG - this._lastSkyMieG) >= DAYNIGHT_SKY_MIE_G_EPSILON) {
                this.scene._skyMaterial.mieDirectionalG = newMieG;
                this._lastSkyMieG = newMieG;
            }
        }

        const t = Math.max(0, Math.min(1, (elevation + 6) / 30));

        if (this.scene._sunLight) {
            const newSunIntensity = 0.02 + t * 2.98;
            if (!Number.isFinite(this._lastSunIntensity) || Math.abs(newSunIntensity - this._lastSunIntensity) >= DAYNIGHT_LIGHT_INTENSITY_EPSILON) {
                this.scene._sunLight.intensity = newSunIntensity;
                this._lastSunIntensity = newSunIntensity;
            }
            const r = 0.3 + t * 0.7;
            const g = 0.25 + t * 0.67;
            const b = 0.2 + t * 0.55;
            if (!Number.isFinite(this._lastSunDiffR)
                || Math.abs(r - this._lastSunDiffR) >= DAYNIGHT_COLOR_EPSILON
                || Math.abs(g - this._lastSunDiffG) >= DAYNIGHT_COLOR_EPSILON
                || Math.abs(b - this._lastSunDiffB) >= DAYNIGHT_COLOR_EPSILON) {
                this.scene._sunLight.diffuse.set(r, g, b);
                this.scene._sunLight.specular.set(r, g * 0.98, b * 0.8);
                this._lastSunDiffR = r;
                this._lastSunDiffG = g;
                this._lastSunDiffB = b;
            }
        }

        if (this.scene._hemiLight) {
            const newHemiIntensity = 0.12 + t * 0.38;
            if (!Number.isFinite(this._lastHemiIntensity) || Math.abs(newHemiIntensity - this._lastHemiIntensity) >= DAYNIGHT_LIGHT_INTENSITY_EPSILON) {
                this.scene._hemiLight.intensity = newHemiIntensity;
                this._lastHemiIntensity = newHemiIntensity;
            }
            const hr = 0.15 + t * 0.45;
            const hg = 0.17 + t * 0.58;
            const hb = 0.25 + t * 0.75;
            if (!Number.isFinite(this._lastHemiDiffR)
                || Math.abs(hr - this._lastHemiDiffR) >= DAYNIGHT_COLOR_EPSILON
                || Math.abs(hg - this._lastHemiDiffG) >= DAYNIGHT_COLOR_EPSILON
                || Math.abs(hb - this._lastHemiDiffB) >= DAYNIGHT_COLOR_EPSILON) {
                this.scene._hemiLight.diffuse.set(hr, hg, hb);
                this._lastHemiDiffR = hr;
                this._lastHemiDiffG = hg;
                this._lastHemiDiffB = hb;
            }
            const gr = 0.06 + t * 0.19;
            const gg = 0.07 + t * 0.28;
            const gb = 0.08 + t * 0.10;
            if (!Number.isFinite(this._lastHemiGroundR)
                || Math.abs(gr - this._lastHemiGroundR) >= DAYNIGHT_COLOR_EPSILON
                || Math.abs(gg - this._lastHemiGroundG) >= DAYNIGHT_COLOR_EPSILON
                || Math.abs(gb - this._lastHemiGroundB) >= DAYNIGHT_COLOR_EPSILON) {
                this.scene._hemiLight.groundColor.set(gr, gg, gb);
                this._lastHemiGroundR = gr;
                this._lastHemiGroundG = gg;
                this._lastHemiGroundB = gb;
            }
        }

        if (this.scene._fillLight) {
            const newFillIntensity = 0.01 + t * 0.59;
            if (!Number.isFinite(this._lastFillIntensity) || Math.abs(newFillIntensity - this._lastFillIntensity) >= DAYNIGHT_LIGHT_INTENSITY_EPSILON) {
                this.scene._fillLight.intensity = newFillIntensity;
                this._lastFillIntensity = newFillIntensity;
            }
        }

        if (this.scene._sunMeshMat) {
            const warmth = Math.max(0, Math.min(1, elevation / 15));
            this.scene._sunMeshMat.emissiveColor.set(1.0, 0.92 + warmth * 0.05, 0.80 + warmth * 0.10);
        }

        let fogR = 0.02 + t * 0.53;
        let fogG = 0.02 + t * 0.68;
        let fogB = 0.06 + t * 0.89;
        if (this.scene._premium.aerialFog) {
            const sunsetT = Math.max(0, Math.min(1, (10 - elevation) / 12));
            if (sunsetT > 0) {
                const warmR = 1.00, warmG = 0.55, warmB = 0.32;
                const mixR = sunsetT * 0.55;
                const mixG = sunsetT * 0.45;
                const mixB = sunsetT * 0.35;
                fogR = fogR * (1 - mixR) + warmR * mixR;
                fogG = fogG * (1 - mixG) + warmG * mixG;
                fogB = fogB * (1 - mixB) + warmB * mixB;
            }
        }
        if (!Number.isFinite(this._lastFogR)
            || Math.abs(fogR - this._lastFogR) >= DAYNIGHT_FOG_COLOR_EPSILON
            || Math.abs(fogG - this._lastFogG) >= DAYNIGHT_FOG_COLOR_EPSILON
            || Math.abs(fogB - this._lastFogB) >= DAYNIGHT_FOG_COLOR_EPSILON) {
            scene.fogColor.set(fogR, fogG, fogB);
            this.scene._fogColorBase.set(fogR, fogG, fogB);
            this._lastFogR = fogR;
            this._lastFogG = fogG;
            this._lastFogB = fogB;
        }

        const nightGlowT = Math.max(0, Math.min(1, (NIGHT_HORIZON_GLOW_OFFSET_DEG - elevation) / NIGHT_HORIZON_GLOW_FADE_BAND_DEG));
        const clearR = fogR * 0.5 + NIGHT_HORIZON_GLOW_R * nightGlowT;
        const clearG = fogG * 0.5 + NIGHT_HORIZON_GLOW_G * nightGlowT;
        const clearB = fogB * 0.6 + NIGHT_HORIZON_GLOW_B * nightGlowT;
        if (!Number.isFinite(this._lastClearR)
            || Math.abs(clearR - this._lastClearR) >= DAYNIGHT_FOG_COLOR_EPSILON
            || Math.abs(clearG - this._lastClearG) >= DAYNIGHT_FOG_COLOR_EPSILON
            || Math.abs(clearB - this._lastClearB) >= DAYNIGHT_FOG_COLOR_EPSILON) {
            scene.clearColor.set(clearR, clearG, clearB, 1);
            this._lastClearR = clearR;
            this._lastClearG = clearG;
            this._lastClearB = clearB;
        }

        const envBase = 0.12 + t * 1.18;
        const newEnvIntensity = this.scene.isMobile ? Math.max(envBase * 1.35, 0.95) : envBase;
        if (!Number.isFinite(this._lastEnvIntensity) || Math.abs(newEnvIntensity - this._lastEnvIntensity) >= DAYNIGHT_ENV_INTENSITY_EPSILON) {
            scene.environmentIntensity = newEnvIntensity;
            this._lastEnvIntensity = newEnvIntensity;
        }

        if (this.scene._pipeline) {
            const expBase = 0.45 + t * 1.35;
            const newExposure = this.scene.isMobile ? Math.max(expBase * 1.15, 1.2) : expBase;
            if (!Number.isFinite(this._lastExposure) || Math.abs(newExposure - this._lastExposure) >= DAYNIGHT_EXPOSURE_EPSILON) {
                this.scene._pipeline.imageProcessing.exposure = newExposure;
                this._lastExposure = newExposure;
            }
        }

        if (this.scene._moonMesh) {
            const moonY = -sunPosY;
            const moonPosX = -sunPosX * MOON_DISTANCE;
            const moonPosY = Math.max(moonY * MOON_DISTANCE, 500);
            const moonPosZ = -sunPosZ * MOON_DISTANCE;
            this.scene._moonMesh.position.set(moonPosX, moonPosY, moonPosZ);
            const moonVisible = elevation < MOON_FADE_ELEV_DEG && moonY > -0.05;
            this.scene._moonMesh.isVisible = moonVisible;
            if (this.scene._moonMat) {
                const moonBright = Math.max(0, Math.min(1, (MOON_FADE_ELEV_DEG - elevation) / 15));
                this.scene._moonMat.emissiveColor.set(0.75 * moonBright, 0.78 * moonBright, 0.85 * moonBright);
            }
            if (this.scene._moonHaloMesh && this.scene._moonHaloMat) {
                this.scene._moonHaloMesh.position.set(moonPosX, moonPosY, moonPosZ);
                const haloAlpha = Math.max(0, Math.min(1, (-elevation - MOON_HALO_FADE_OFFSET_DEG) / MOON_HALO_FADE_BAND_DEG)) * 0.7;
                this.scene._moonHaloMat.alpha = haloAlpha;
                this.scene._moonHaloMesh.isVisible = moonVisible && haloAlpha > 0.02;
            }
        }

        if (this.scene._starRoot) {
            const starFade = Math.max(0, Math.min(1, (-elevation + 5) / 12));
            const starsActive = starFade > 0.05;
            this.scene._starRoot.setEnabled(starsActive);
            if (this.scene._milkyWayRoot) this.scene._milkyWayRoot.setEnabled(starsActive);
        }

        this.scene._applyCloudTint(elevation);

        this._maybeAutoSwapHdr(scene);
    }

    buildSkybox(scene: BABYLON.Scene): void {
        const envTex = BABYLON.CubeTexture.CreateFromPrefilteredData(
            HDR_DEFAULT_ENV_URL, scene,
        );
        scene.environmentTexture = envTex;
        this._originalEnvTexture = envTex;

        this.scene._skyMaterial = new SkyMaterial('skyMat', scene);
        this.scene._skyMaterial.backFaceCulling = false;
        this.scene._skyMaterial.useSunPosition = true;
        this.scene._skyMaterial.sunPosition = new BABYLON.Vector3(0, 100, 0);
        this.scene._skyMaterial.turbidity = 10;
        this.scene._skyMaterial.rayleigh = 2;
        this.scene._skyMaterial.mieCoefficient = 0.005;
        this.scene._skyMaterial.mieDirectionalG = 0.8;
        this.scene._skyMaterial.luminance = 1.0;

        this.scene._skyboxMesh = BABYLON.MeshBuilder.CreateBox('skyBox', { size: HDR_SKYBOX_SIZE }, scene);
        this.scene._skyboxMesh.material = this.scene._skyMaterial;
        this.scene._skyboxMesh.infiniteDistance = true;
        this.scene._skyboxMesh.isPickable = false;
        this.scene._skyboxMesh.applyFog = false;
        this.scene._skyboxMesh.renderingGroupId = 0;
        this.scene._skyboxMesh.freezeWorldMatrix();
    }

    applyHdrEnvironment(scene: BABYLON.Scene, hdrName: string): void {
        const requested = typeof hdrName === 'string' && hdrName.length > 0 ? hdrName : HDR_ENV_NONE;
        this._userHdrChoice = requested;
        const effective = requested === HDR_ENV_AUTO ? this._resolveAutoHdr() : requested;
        console.info(`[HDR] applyHdrEnvironment requested: "${requested}" → effective: "${effective}" (current: "${this._currentHdrEnv}")`);
        this._applyHdrInternal(scene, effective);
    }

    private _resolveAutoHdr(): string {
        const elev: number = typeof this.scene._sunElevation === 'number' ? this.scene._sunElevation : 45;
        const isNightNow = this._currentHdrEnv === HDR_AUTO_NIGHT_FILE;
        const threshold = isNightNow
            ? HDR_AUTO_NIGHT_ELEVATION_DEG + HDR_AUTO_HYSTERESIS_DEG
            : HDR_AUTO_NIGHT_ELEVATION_DEG;
        const isNight = elev < threshold;
        return isNight ? HDR_AUTO_NIGHT_FILE : HDR_AUTO_DAY_FILE;
    }

    private _maybeAutoSwapHdr(scene: BABYLON.Scene): void {
        if (this._userHdrChoice !== HDR_ENV_AUTO) return;
        const desired = this._resolveAutoHdr();
        if (desired === this._currentHdrEnv) return;
        console.info(`[HDR] Auto mode: sun elevation triggered swap → "${desired}"`);
        this._applyHdrInternal(scene, desired);
    }

    private _applyHdrInternal(scene: BABYLON.Scene, name: string): void {
        if (name === this._currentHdrEnv) {
            console.info('[HDR] Same as current, skipping');
            return;
        }

        const skyboxMesh = this.scene._skyboxMesh as BABYLON.Mesh | null;
        if (!skyboxMesh) {
            console.warn('[HDR] Skybox mesh not built yet, deferring HDR change');
            return;
        }

        if (name === HDR_ENV_NONE) {
            try {
                if (this._originalEnvTexture) {
                    scene.environmentTexture = this._originalEnvTexture;
                }
                skyboxMesh.setEnabled(true);
                skyboxMesh.isVisible = true;
                this._disposeHdrResources();
                this._currentHdrEnv = HDR_ENV_NONE;
                console.info('[HDR] Restored procedural skybox + default IBL');
            } catch (err) {
                console.error('[HDR] Failed to restore procedural environment:', err);
            }
            return;
        }

        const url = HDR_ASSETS_PATH + name;
        console.info(`[HDR] Loading HDR from URL: ${url}`);
        let envHdr: BABYLON.HDRCubeTexture | null = null;
        let skyboxHdr: BABYLON.HDRCubeTexture | null = null;
        try {
            envHdr = new BABYLON.HDRCubeTexture(
                url, scene, HDR_CUBE_SIZE, false, true, false, true,
                () => console.info(`[HDR] IBL texture loaded: ${name}`),
                (msg, ex) => console.error(`[HDR] IBL texture FAILED to load: ${name} - ${msg}`, ex),
            );
            skyboxHdr = new BABYLON.HDRCubeTexture(
                url, scene, HDR_CUBE_SIZE, false, true, true, false,
                () => console.info(`[HDR] Skybox texture loaded: ${name}`),
                (msg, ex) => console.error(`[HDR] Skybox texture FAILED to load: ${name} - ${msg}`, ex),
            );
            skyboxHdr.coordinatesMode = BABYLON.Texture.SKYBOX_MODE;
            skyboxHdr.level = HDR_SKYBOX_LEVEL;
        } catch (err) {
            console.error(`[HDR] Failed to construct HDRCubeTexture for "${name}":`, err);
            try { envHdr?.dispose(); } catch (_) { /* ignore */ }
            try { skyboxHdr?.dispose(); } catch (_) { /* ignore */ }
            return;
        }

        let skyboxMat: BABYLON.StandardMaterial | null = null;
        let hdrMesh: BABYLON.Mesh | null = null;
        try {
            skyboxMat = new BABYLON.StandardMaterial(`hdrSkyMat_${name}`, scene);
            skyboxMat.backFaceCulling = false;
            skyboxMat.disableLighting = true;
            skyboxMat.maxSimultaneousLights = 0;
            skyboxMat.reflectionTexture = skyboxHdr;
            skyboxMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
            skyboxMat.specularColor = new BABYLON.Color3(0, 0, 0);

            const prePass = scene.prePassRenderer;
            if (prePass) {
                try { prePass.excludedMaterials.push(skyboxMat); } catch (_) { /* ignore */ }
            }

            hdrMesh = BABYLON.MeshBuilder.CreateBox(`hdrSkyBox_${name}`, { size: HDR_SKYBOX_SIZE }, scene);
            hdrMesh.material = skyboxMat;
            hdrMesh.infiniteDistance = true;
            hdrMesh.isPickable = false;
            hdrMesh.applyFog = false;
            hdrMesh.renderingGroupId = 0;
            hdrMesh.ignoreCameraMaxZ = true;

            this._disposeHdrResources();

            scene.environmentTexture = envHdr;
            skyboxMesh.setEnabled(false);
            skyboxMesh.isVisible = false;

            const water = this.scene._waterMaterial as BABYLON.Nullable<any>;
            if (water && typeof water.addToRenderList === 'function') {
                try { water.addToRenderList(hdrMesh); } catch (_) { /* ignore */ }
            }

            this._hdrTexture = envHdr;
            this._hdrSkyboxTexture = skyboxHdr;
            this._hdrSkyboxMaterial = skyboxMat;
            this._hdrSkyboxMesh = hdrMesh;
            this._currentHdrEnv = name;
            console.info(`[HDR] Applied HDR environment "${name}" (texture loading async) - hidden procedural, new mesh: ${hdrMesh.name}`);
        } catch (err) {
            console.error(`[HDR] Failed to apply HDR environment "${name}":`, err);
            try { envHdr.dispose(); } catch (_) { /* ignore */ }
            try { skyboxHdr.dispose(); } catch (_) { /* ignore */ }
            try { skyboxMat?.dispose(); } catch (_) { /* ignore */ }
            try { hdrMesh?.dispose(); } catch (_) { /* ignore */ }
        }
    }

    private _disposeHdrResources(): void {
        if (this._hdrSkyboxMesh) {
            try {
                const water = this.scene._waterMaterial as BABYLON.Nullable<any>;
                if (water && Array.isArray(water.renderTargetTexture?.renderList)) {
                    const list = water.renderTargetTexture.renderList as BABYLON.AbstractMesh[];
                    const idx = list.indexOf(this._hdrSkyboxMesh);
                    if (idx >= 0) list.splice(idx, 1);
                }
            } catch (_) { /* ignore */ }
            try { this._hdrSkyboxMesh.dispose(); } catch (_) { /* ignore */ }
            this._hdrSkyboxMesh = null;
        }
        if (this._hdrSkyboxMaterial) {
            try {
                const prePass = this._hdrSkyboxMaterial.getScene().prePassRenderer;
                if (prePass) {
                    const idx = prePass.excludedMaterials.indexOf(this._hdrSkyboxMaterial);
                    if (idx >= 0) prePass.excludedMaterials.splice(idx, 1);
                }
            } catch (_) { /* ignore */ }
            try { this._hdrSkyboxMaterial.dispose(); } catch (_) { /* ignore */ }
            this._hdrSkyboxMaterial = null;
        }
        if (this._hdrSkyboxTexture) {
            try { this._hdrSkyboxTexture.dispose(); } catch (_) { /* ignore */ }
            this._hdrSkyboxTexture = null;
        }
        if (this._hdrTexture) {
            try { this._hdrTexture.dispose(); } catch (_) { /* ignore */ }
            this._hdrTexture = null;
        }
    }
}
