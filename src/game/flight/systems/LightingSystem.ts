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
} from '../constants/index.js';

export class LightingSystem {
    private readonly scene: any;

    constructor(scene: FlightSceneSimple) {
        this.scene = scene;
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

        this.scene._shadowGen = new BABYLON.CascadedShadowGenerator(4096, this.scene._sunLight);
        this.scene._shadowGen.lambda                 = 0.75;
        this.scene._shadowGen.cascadeBlendPercentage = 0.1;
        this.scene._shadowGen.depthClamp             = true;
        this.scene._shadowGen.autoCalcDepthBounds    = true;
        this.scene._shadowGen.stabilizeCascades      = true;
        this.scene._shadowGen.numCascades            = 4;
        this.scene._shadowGen.penumbraDarkness       = 0.6;
        this.scene._shadowGen.usePercentageCloserFiltering = true;
        (this.scene._shadowGen as any).filteringQuality = BABYLON.ShadowGenerator.QUALITY_HIGH;
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
            this.scene._sunLight.direction = sunDir;
            this.scene._sunLight.position = sunDir.scale(-1200);
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
            this.scene._skyMaterial.luminance = Math.min(SKY_LUMINANCE_MAX, 0.01 + lumT * 1.19);
            const sunsetT = 1.0 - Math.max(0, Math.min(1, Math.abs(elevation) / 10));
            this.scene._skyMaterial.turbidity = 8 + sunsetT * 6;
            this.scene._skyMaterial.rayleigh = 1.5 + lumT * 1.5;
            this.scene._skyMaterial.mieCoefficient = 0.005 + sunsetT * 0.015;
            const elevForG = Math.max(0, Math.min(SKY_MIE_G_TRANSITION_DEG, elevation));
            const gT = elevForG / SKY_MIE_G_TRANSITION_DEG;
            this.scene._skyMaterial.mieDirectionalG = SKY_MIE_G_LOW_HORIZON + (SKY_MIE_G_HIGH_SUN - SKY_MIE_G_LOW_HORIZON) * gT;
        }

        const t = Math.max(0, Math.min(1, (elevation + 6) / 30));

        if (this.scene._sunLight) {
            this.scene._sunLight.intensity = 0.1 + t * 2.9;
            const r = 0.3 + t * 0.7;
            const g = 0.25 + t * 0.67;
            const b = 0.2 + t * 0.55;
            this.scene._sunLight.diffuse.set(r, g, b);
            this.scene._sunLight.specular.set(r, g * 0.98, b * 0.8);
        }

        if (this.scene._hemiLight) {
            this.scene._hemiLight.intensity = 0.03 + t * 0.47;
            this.scene._hemiLight.diffuse.set(0.1 + t * 0.5, 0.12 + t * 0.63, 0.2 + t * 0.8);
            this.scene._hemiLight.groundColor.set(0.02 + t * 0.23, 0.03 + t * 0.32, 0.04 + t * 0.14);
        }

        if (this.scene._fillLight) {
            this.scene._fillLight.intensity = 0.05 + t * 0.55;
        }

        if (this.scene._sunMeshMat) {
            const warmth = Math.max(0, Math.min(1, elevation / 15));
            this.scene._sunMeshMat.emissiveColor.set(1.0, 0.7 + warmth * 0.25, 0.3 + warmth * 0.4);
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
        scene.fogColor.set(fogR, fogG, fogB);
        this.scene._fogColorBase.set(fogR, fogG, fogB);

        const nightGlowT = Math.max(0, Math.min(1, (NIGHT_HORIZON_GLOW_OFFSET_DEG - elevation) / NIGHT_HORIZON_GLOW_FADE_BAND_DEG));
        const clearR = fogR * 0.5 + NIGHT_HORIZON_GLOW_R * nightGlowT;
        const clearG = fogG * 0.5 + NIGHT_HORIZON_GLOW_G * nightGlowT;
        const clearB = fogB * 0.6 + NIGHT_HORIZON_GLOW_B * nightGlowT;
        scene.clearColor.set(clearR, clearG, clearB, 1);

        scene.environmentIntensity = 0.15 + t * 1.15;

        if (this.scene._pipeline) {
            this.scene._pipeline.imageProcessing.exposure = 0.7 + t * 1.1;
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
    }

    buildSkybox(scene: BABYLON.Scene): void {
        const envTex = BABYLON.CubeTexture.CreateFromPrefilteredData(
            'https://assets.babylonjs.com/environments/environmentSpecular.env', scene,
        );
        scene.environmentTexture = envTex;

        this.scene._skyMaterial = new SkyMaterial('skyMat', scene);
        this.scene._skyMaterial.backFaceCulling = false;
        this.scene._skyMaterial.useSunPosition = true;
        this.scene._skyMaterial.sunPosition = new BABYLON.Vector3(0, 100, 0);
        this.scene._skyMaterial.turbidity = 10;
        this.scene._skyMaterial.rayleigh = 2;
        this.scene._skyMaterial.mieCoefficient = 0.005;
        this.scene._skyMaterial.mieDirectionalG = 0.8;
        this.scene._skyMaterial.luminance = 1.0;

        this.scene._skyboxMesh = BABYLON.MeshBuilder.CreateBox('skyBox', { size: 10_000_000 }, scene);
        this.scene._skyboxMesh.material = this.scene._skyMaterial;
        this.scene._skyboxMesh.infiniteDistance = true;
        this.scene._skyboxMesh.isPickable = false;
        this.scene._skyboxMesh.applyFog = false;
        this.scene._skyboxMesh.renderingGroupId = 0;
        this.scene._skyboxMesh.freezeWorldMatrix();
    }
}
