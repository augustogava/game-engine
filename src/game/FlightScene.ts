/**
 * FlightScene — Cinematic Flight Simulator powered by Google Maps Photorealistic 3D Tiles
 *
 * Real-world photogrammetry terrain via:
 *   - 3DTilesRendererJS (NASA-AMMOS) → BabylonJS adapter
 *   - Google Maps Photorealistic 3D Tiles (Cesium Ion asset 2275207 OR Google Maps API key)
 *
 * Requires GOOGLE_MAPS_API_KEY in the page (set via window.__GOOGLE_MAPS_KEY or
 * a data attribute on the canvas).
 *
 * Visual stack (Space-Pirates-level):
 *   ✦ DefaultRenderingPipeline: bloom, chromatic aberration, ACES tone mapping, vignette, MSAA
 *   ✦ Sun directional light + hemispheric sky
 *   ✦ Lens flares
 *   ✦ PBR airplane model
 *   ✦ Orbitron HUD: speed, altitude, throttle, attitude, FPS
 *   ✦ Clouds (billboard instances)
 *
 * Physics: component-based aerodynamics (lift/drag per surface, angle of attack,
 *   ISA atmosphere, rigid-body torques, substep integration).
 *   Ref: Jump Trajectory "Realistic Aircraft Physics for Games",
 *        Khan & Nahon 2015, Jakob Maier C++ flight sim.
 *
 * Controls:
 *   W / S            Throttle up / down
 *   Arrow Up/Down    Pitch
 *   Arrow Left/Right Roll (bank)
 *   Q / E            Yaw
 *   R                Reset
 */
import { Scene3D } from '../engine/3d/Scene3D.js';
import { InputManager } from '../engine/input/InputManager.js';
import { TilesRenderer } from '3d-tiles-renderer/babylonjs';
import { GoogleCloudAuthPlugin } from '3d-tiles-renderer/core/plugins';
import * as BABYLON from '@babylonjs/core';
import '@babylonjs/loaders';

// ── WGS84 constants ──────────────────────────────────────────────────────────
const WGS84_A  = 6378137.0;
const WGS84_F  = 1 / 298.257223563;
const WGS84_E2 = 2 * WGS84_F - WGS84_F * WGS84_F;

let START_LAT = -23.4340;
let START_LON = -46.4731;
let START_ALT = 750;

function latLonAltToEcef(latDeg: number, lonDeg: number, alt: number): [number, number, number] {
    const lat    = (latDeg * Math.PI) / 180;
    const lon    = (lonDeg * Math.PI) / 180;
    const sinLat = Math.sin(lat);
    const cosLat = Math.cos(lat);
    const N      = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
    return [
        (N + alt) * cosLat * Math.cos(lon),
        (N + alt) * cosLat * Math.sin(lon),
        (N * (1 - WGS84_E2) + alt) * sinLat,
    ];
}

function ecefToGeodetic(x: number, y: number, z: number): { lat: number; lon: number; alt: number } {
    const p   = Math.sqrt(x * x + y * y);
    const lon = Math.atan2(y, x);
    let lat   = Math.atan2(z, p * (1 - WGS84_E2));
    for (let i = 0; i < 5; i++) {
        const sinLat = Math.sin(lat);
        const N      = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
        lat = Math.atan2(z + WGS84_E2 * N * sinLat, p);
    }
    const sinLat = Math.sin(lat);
    const cosLat = Math.cos(lat);
    const N      = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
    const alt    = Math.abs(cosLat) > 1e-10
        ? p / cosLat - N
        : Math.abs(z) - N * (1 - WGS84_E2);
    return { lat: (lat * 180) / Math.PI, lon: (lon * 180) / Math.PI, alt };
}

// ── ISA atmosphere (troposphere + lower stratosphere) ─────────────────────────
function getAirDensity(altitudeM: number): number {
    const h = Math.max(0, altitudeM);
    if (h > 11000) {
        const T = 216.65;
        const P = 22632 * Math.exp((-9.81 * (h - 11000)) / (287.058 * T));
        return P / (287.058 * T);
    }
    const T = 288.15 - 0.0065 * h;
    const P = 101325 * Math.pow(T / 288.15, 5.2561);
    return P / (287.058 * T);
}

// ── Aerodynamic surface model ─────────────────────────────────────────────────
interface AeroSurface {
    position:     BABYLON.Vector3;
    normal:       BABYLON.Vector3;
    area:         number;
    chord:        number;
    aspectRatio:  number;
    liftSlope:    number;
    skinFriction: number;
    stallAlpha:   number;
    zeroLiftAoA:  number;
    oswaldE:      number;
    flapFraction: number;
    controlInput: number;
}

function computeCoefficients(
    alpha: number, liftSlope: number, skinFriction: number,
    zeroLiftAoA: number, stallAlpha: number, aspectRatio: number,
    oswaldE: number, flapFraction: number, controlInput: number,
): { cl: number; cd: number } {
    const corrSlope = liftSlope * aspectRatio /
        (aspectRatio + 2 * (aspectRatio + 4) / (aspectRatio + 2));
    const absAlpha = Math.abs(alpha);
    let cl: number, cd: number;

    if (absAlpha <= stallAlpha) {
        cl = corrSlope * (alpha - zeroLiftAoA);
        if (flapFraction > 0 && controlInput !== 0) {
            cl += Math.sqrt(flapFraction) * corrSlope * controlInput * 0.52;
        }
        cd = skinFriction + (cl * cl) / (Math.PI * aspectRatio * oswaldE);
    } else {
        const sign    = alpha >= 0 ? 1 : -1;
        const clFlat  = 2 * sign * Math.sin(absAlpha) * Math.cos(absAlpha);
        const cdFlat  = 2 * Math.sin(absAlpha) * Math.sin(absAlpha);
        const clStall = corrSlope * (stallAlpha * sign - zeroLiftAoA);
        const cdStall = skinFriction + (clStall * clStall) / (Math.PI * aspectRatio * oswaldE);
        const t = Math.min(1, (absAlpha - stallAlpha) / 0.26);
        const s = t * t * (3 - 2 * t);
        cl = clStall * (1 - s) + clFlat * s;
        cd = cdStall * (1 - s) + cdFlat * s;
    }
    return { cl, cd };
}

function computeSurfaceForces(
    surface: AeroSurface, bodyVelocity: BABYLON.Vector3, airDensity: number,
): { force: BABYLON.Vector3; torque: BABYLON.Vector3 } {
    const speed = bodyVelocity.length();
    const zero  = { force: BABYLON.Vector3.Zero(), torque: BABYLON.Vector3.Zero() };
    if (speed < 1.0) return zero;

    const dragDir = bodyVelocity.normalizeToNew().scaleInPlace(-1);
    const cross1  = BABYLON.Vector3.Cross(dragDir, surface.normal);
    const liftDir = BABYLON.Vector3.Cross(cross1, dragDir);
    if (liftDir.lengthSquared() < 0.0001) return zero;
    liftDir.normalize();

    const dot   = Math.max(-1, Math.min(1, BABYLON.Vector3.Dot(dragDir, surface.normal)));
    const alpha = Math.asin(dot);

    const { cl, cd } = computeCoefficients(
        alpha, surface.liftSlope, surface.skinFriction,
        surface.zeroLiftAoA, surface.stallAlpha, surface.aspectRatio,
        surface.oswaldE, surface.flapFraction, surface.controlInput,
    );

    const q     = 0.5 * airDensity * speed * speed * surface.area;
    const force = liftDir.scale(cl * q).addInPlace(dragDir.scale(cd * q));
    const torque = BABYLON.Vector3.Cross(surface.position, force);
    return { force, torque };
}

// ── Aircraft constants ────────────────────────────────────────────────────────
const MASS           = 10000;
const MAX_THRUST_N   = 50000;
const G_ACCEL        = 9.81;
const ANGULAR_DAMPING = 0.5;

const Ixx = 211333;   // pitch  (about X / right)
const Iyy = 256608;   // yaw    (about Y / up)
const Izz = 48531;    // roll   (about Z / forward)

const LIFT_SLOPE      = 5.5;
const SKIN_FRICTION   = 0.02;
const STALL_ALPHA_RAD = 0.26;
const OSWALD_E        = 0.8;
const STALL_SPEED_HUD = 25;
const GROUND_LEVEL_ALT = 750;

// ── FlightScene ───────────────────────────────────────────────────────────────
export class FlightScene extends Scene3D {
    private planeRoot!: BABYLON.TransformNode;
    private velocity        = BABYLON.Vector3.Zero();
    private angularVelocity = BABYLON.Vector3.Zero();
    private thrust   = 0.0;
    private spawned  = false;

    private tiles!: TilesRenderer;
    private sunDir!: BABYLON.Vector3;

    private surfaces: AeroSurface[] = [];

    private hudSpeed!:    HTMLElement;
    private hudAlt!:      HTMLElement;
    private hudThrottle!: HTMLElement;
    private hudAttitude!: HTMLElement;
    private hudWarning!:  HTMLElement;
    private hudFps!:      HTMLElement;
    private hudTileInfo!: HTMLElement;

    private dbgPlanePos!:  HTMLElement;
    private dbgPlaneRot!:  HTMLElement;
    private dbgPlaneVel!:  HTMLElement;
    private dbgCamPos!:    HTMLElement;
    private dbgCamOrbit!:  HTMLElement;
    private dbgPanel!:     HTMLElement;

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    onCreate(scene: any, _input: InputManager): void {
        scene.useRightHandedSystem = true;
        scene.clearColor = new BABYLON.Color4(0.04, 0.1, 0.22, 1);
        scene.fogMode    = BABYLON.Scene.FOGMODE_EXP2;
        scene.fogColor   = new BABYLON.Color3(0.55, 0.7, 0.95);
        scene.fogDensity = 0.000008;

        this.sunDir          = new BABYLON.Vector3(-0.4, -0.9, -0.3).normalize();
        this.velocity        = BABYLON.Vector3.Zero();
        this.angularVelocity = BABYLON.Vector3.Zero();

        this._initSurfaces();
        this._setupLighting(scene);
        this._buildSkybox(scene);
        this._buildClouds(scene);
        this._init3DTiles(scene);
        this._buildPlane(scene);
        this._buildCamera(scene);
        this._setupPostProcessing(scene);
        this._buildHUD();
    }

    update(dt: number): void {
        if (!this.spawned) return;

        if (this.tiles) {
            this.tiles.update();
            const count = (this.tiles as any).visibleTiles?.size ?? 0;
            if (this.hudTileInfo) this.hudTileInfo.textContent = `TILES: ${count}`;
        }

        this._handleInput(dt);
        this._applyPhysics(dt);
        this._updateCamera();
        this._updateHUD();
    }

    onDispose(): void {
        document.getElementById('flight-hud')?.remove();
        if (this.tiles) this.tiles.dispose();
    }

    // ── Aerodynamic surfaces init ─────────────────────────────────────────────

    private _initSurfaces(): void {
        const mk = (
            pos: [number, number, number], normal: [number, number, number],
            area: number, chord: number, ar: number,
            zeroLiftAoA: number, flapFrac: number,
        ): AeroSurface => ({
            position:     new BABYLON.Vector3(pos[0], pos[1], pos[2]),
            normal:       new BABYLON.Vector3(normal[0], normal[1], normal[2]),
            area, chord, aspectRatio: ar,
            liftSlope: LIFT_SLOPE, skinFriction: SKIN_FRICTION,
            stallAlpha: STALL_ALPHA_RAD, zeroLiftAoA,
            oswaldE: OSWALD_E, flapFraction: flapFrac, controlInput: 0,
        });

        this.surfaces = [
            mk([-3, 0, -0.5], [0, 1, 0], 13.75, 2.5, 4.4, -0.035, 0.15),
            mk([ 3, 0, -0.5], [0, 1, 0], 13.75, 2.5, 4.4, -0.035, 0.15),
            mk([ 0, 0, -7],   [0, 1, 0], 7.2,   1.8, 2.2,  0,     0.35),
            mk([ 0, 1.5, -7], [1, 0, 0], 7.0,   2.0, 1.75, 0,     0.35),
        ];
    }

    // ── Lighting ─────────────────────────────────────────────────────────────

    private _setupLighting(scene: any): void {
        const hemi       = new BABYLON.HemisphericLight('sky', new BABYLON.Vector3(0, 1, 0), scene);
        hemi.intensity   = 0.5;
        hemi.diffuse     = new BABYLON.Color3(0.6, 0.75, 1.0);
        hemi.groundColor = new BABYLON.Color3(0.25, 0.35, 0.18);

        const sun      = new BABYLON.DirectionalLight('sun', this.sunDir, scene);
        sun.position   = new BABYLON.Vector3(800, 1200, 800);
        sun.intensity  = 3.2;
        sun.diffuse    = new BABYLON.Color3(1.0, 0.92, 0.75);
        sun.specular   = new BABYLON.Color3(1.0, 0.9, 0.6);

        const shadow = new BABYLON.CascadedShadowGenerator(2048, sun);
        shadow.lambda                     = 0.75;
        shadow.cascadeBlendPercentage     = 0.1;
        shadow.depthClamp                 = true;
        shadow.autoCalcDepthBounds        = true;
        shadow.useBlurExponentialShadowMap = true;
        shadow.blurKernel                 = 12;
        (this as any)._shadow = shadow;
    }

    // ── Skybox ────────────────────────────────────────────────────────────────

    private _buildSkybox(scene: any): void {
        const skybox = BABYLON.MeshBuilder.CreateBox('skyBox', { size: 10_000_000 }, scene);
        const skyMat = new BABYLON.StandardMaterial('skyMat', scene);
        skyMat.backFaceCulling = false;
        skyMat.disableLighting = true;
        const skyTex = new BABYLON.CubeTexture('https://assets.babylonjs.com/textures/TropicalSunnyDay', scene);
        skyTex.coordinatesMode   = BABYLON.Texture.SKYBOX_MODE;
        skyMat.reflectionTexture = skyTex;
        skyMat.diffuseColor      = BABYLON.Color3.Black();
        skyMat.specularColor     = BABYLON.Color3.Black();
        skybox.material          = skyMat;
        skybox.infiniteDistance   = true;

        const envTex = new BABYLON.CubeTexture('https://assets.babylonjs.com/textures/TropicalSunnyDay', scene);
        scene.environmentTexture   = envTex;
        scene.environmentIntensity = 1.0;
    }

    // ── Clouds ────────────────────────────────────────────────────────────────

    private _buildClouds(scene: any): void {
        const [cx, cy, cz] = latLonAltToEcef(START_LAT, START_LON, START_ALT + 2000);

        const tpl = BABYLON.MeshBuilder.CreatePlane('cloudTpl', { size: 80000 }, scene);
        tpl.isVisible = false;
        const mat = new BABYLON.StandardMaterial('cloudMat', scene);
        const tex = new BABYLON.Texture('https://assets.babylonjs.com/textures/cloud.png', scene);
        tex.hasAlpha = true;
        mat.diffuseTexture              = tex;
        mat.backFaceCulling             = false;
        mat.useAlphaFromDiffuseTexture  = true;
        mat.transparencyMode            = BABYLON.StandardMaterial.MATERIAL_ALPHATEST;
        mat.emissiveColor               = new BABYLON.Color3(0.95, 0.95, 1.0);
        mat.disableLighting             = true;
        tpl.material                    = mat;

        for (let i = 0; i < 80; i++) {
            const ci = tpl.createInstance(`c${i}`);
            ci.position.set(
                cx + (Math.random() - 0.5) * 500_000,
                cy + (Math.random() - 0.5) * 500_000,
                cz + (Math.random() - 0.5) * 500_000 + 200_000,
            );
            const s = 0.5 + Math.random() * 2;
            ci.scaling.set(s, s * 0.3, 1);
            ci.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
        }
    }

    // ── 3D Tiles ──────────────────────────────────────────────────────────────

    private _init3DTiles(scene: any): void {
        const urlParams = new URLSearchParams(window.location.search);

        if (urlParams.has('lat')) START_LAT = parseFloat(urlParams.get('lat')!) || START_LAT;
        if (urlParams.has('lng')) START_LON = parseFloat(urlParams.get('lng')!) || START_LON;

        const apiKey: string = urlParams.get('key') || (window as any).__GOOGLE_MAPS_KEY || '';

        if (!apiKey) {
            console.warn(
                '[FlightScene] No Google Maps API key found. ' +
                'Please open the Map Configuration Debug UI (top right) to enter a key and reload.',
            );
            this._buildFallbackTerrain(scene);
            return;
        }

        const tilesUrl = `https://tile.googleapis.com/v1/3dtiles/root.json?key=${apiKey}`;
        const tiles    = new TilesRenderer(tilesUrl, scene);
        tiles.errorTarget = 12;

        try {
            tiles.registerPlugin(new GoogleCloudAuthPlugin({ apiToken: apiKey, autoRefreshToken: true }));
        } catch { /* Plugin may not be needed if key is in URL */ }

        this.tiles = tiles;
        console.info(`[FlightScene] Google Maps 3D Tiles initialised (Lat: ${START_LAT}, Lng: ${START_LON})`);
    }

    private _buildFallbackTerrain(scene: any): void {
        const ground = BABYLON.MeshBuilder.CreateGroundFromHeightMap(
            'terrain',
            'https://assets.babylonjs.com/textures/heightMap.png',
            { width: 4096, height: 4096, subdivisions: 120, minHeight: 0, maxHeight: 400,
              onReady: (m: any) => { m.receiveShadows = true; } },
            scene,
        );
        ground.position.set(0, -50, 0);

        const mat  = new BABYLON.PBRMaterial('terrainMat', scene);
        const diff = new BABYLON.Texture('https://assets.babylonjs.com/textures/ground.jpg', scene);
        diff.uScale = 80; diff.vScale = 80;
        mat.albedoTexture = diff;
        mat.metallic  = 0;
        mat.roughness = 0.95;
        ground.material = mat;

        const sea    = BABYLON.MeshBuilder.CreateGround('sea', { width: 8192, height: 8192 }, scene);
        sea.position.y = 0;
        const seaMat = new BABYLON.PBRMaterial('seaMat', scene);
        seaMat.albedoColor = new BABYLON.Color3(0.03, 0.18, 0.45);
        seaMat.metallic  = 0;
        seaMat.roughness = 0.08;
        seaMat.alpha     = 0.88;
        sea.material     = seaMat;
    }

    // ── Airplane ──────────────────────────────────────────────────────────────

    private _buildPlane(scene: any): void {
        this.planeRoot = new BABYLON.TransformNode('planeRoot', scene);
        this.planeRoot.rotationQuaternion = new BABYLON.Quaternion(0, 0, 0, 1);

        if (this.tiles) {
            const [x, y, z] = latLonAltToEcef(START_LAT, START_LON, START_ALT);
            this.planeRoot.position.set(x, y, z);
        } else {
            this.planeRoot.position.set(0, 400, 0);
        }

        this._alignToSurface();

        const hq = BABYLON.Quaternion.RotationAxis(new BABYLON.Vector3(0, 1, 0), (201 * Math.PI) / 180);
        const pq = BABYLON.Quaternion.RotationAxis(new BABYLON.Vector3(1, 0, 0), (11 * Math.PI) / 180);
        const rq = BABYLON.Quaternion.RotationAxis(new BABYLON.Vector3(0, 0, 1), (133 * Math.PI) / 180);
        this.planeRoot.rotationQuaternion = this.planeRoot.rotationQuaternion!
            .multiply(hq).multiply(pq).multiply(rq);

        this._setInitialVelocity(0);

        const shadow = (this as any)._shadow;

        BABYLON.SceneLoader.ImportMesh(
            '', 'models/', 'DC8_AFRC_AIR_0824.glb', scene,
            (meshes: any[]) => {
                const root = meshes[0];
                root.parent   = this.planeRoot;
                root.position = BABYLON.Vector3.Zero();
                root.rotationQuaternion = BABYLON.Quaternion.RotationAxis(
                    new BABYLON.Vector3(0, 1, 0), Math.PI,
                );

                meshes.forEach((m: any) => {
                    if (shadow) shadow.addShadowCaster(m, true);
                    m.receiveShadows = true;
                });

                const bb   = root.getHierarchyBoundingVectors(true);
                const size = bb.max.subtract(bb.min).length();
                root.scaling.scaleInPlace(18 / Math.max(size, 0.1));
                this.spawned = true;
            },
            null,
            () => {
                console.warn('[FlightScene] models/DC8_AFRC_AIR_0824.glb not found, using fallback geometry');
                this._buildFallbackMesh(scene);
            },
        );
    }

    private _buildFallbackMesh(scene: any): void {
        const shadow = (this as any)._shadow;
        const mat = new BABYLON.PBRMaterial('planePBR', scene);
        mat.albedoColor = new BABYLON.Color3(0.85, 0.88, 0.92);
        mat.metallic    = 0.7;
        mat.roughness   = 0.25;

        const parts = [
            BABYLON.MeshBuilder.CreateBox('body',  { width: 2.2,  height: 0.65, depth: 7   }, scene),
            BABYLON.MeshBuilder.CreateBox('wing',  { width: 16,   height: 0.22, depth: 2.5 }, scene),
            BABYLON.MeshBuilder.CreateBox('tail',  { width: 6,    height: 0.18, depth: 1.8 }, scene),
            BABYLON.MeshBuilder.CreateBox('finV',  { width: 0.18, height: 2.8,  depth: 2.0 }, scene),
            BABYLON.MeshBuilder.CreateCylinder('nose', {
                height: 2.5, diameterTop: 0, diameterBottom: 1.5, tessellation: 8,
            }, scene),
        ];
        parts[2].position.set(0, 0.4, -3.0);
        parts[3].position.set(0, 1.4, -3.0);
        parts[4].rotation.x = Math.PI / 2;
        parts[4].position.set(0, 0, 4.5);

        parts.forEach((m: any) => {
            m.material = mat;
            m.parent   = this.planeRoot;
            shadow?.addShadowCaster(m);
        });
        this.spawned = true;
    }

    private _alignToSurface(): void {
        if (this.tiles) {
            const up = this.planeRoot.position.normalizeToNew();
            const northPole = new BABYLON.Vector3(0, 0, 1);
            let east = BABYLON.Vector3.Cross(northPole, up);
            if (east.lengthSquared() < 0.001) east = new BABYLON.Vector3(1, 0, 0);
            east.normalize();
            const north = BABYLON.Vector3.Cross(up, east).normalize();

            const m = new BABYLON.Matrix();
            BABYLON.Matrix.FromXYZAxesToRef(east, up, north, m);
            this.planeRoot.rotationQuaternion!.copyFrom(
                BABYLON.Quaternion.FromRotationMatrix(m),
            );
        } else {
            this.planeRoot.rotationQuaternion!.set(0, 0, 0, 1);
        }
    }

    private _setInitialVelocity(speed: number): void {
        const rotMatrix = new BABYLON.Matrix();
        BABYLON.Matrix.FromQuaternionToRef(this.planeRoot.rotationQuaternion!, rotMatrix);
        const forward = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0, 0, 1), rotMatrix);
        this.velocity = forward.scale(speed);
        this.angularVelocity.set(0, 0, 0);
        this.thrust = speed > 0 ? 0.3 : 0;
    }

    // ── Camera ────────────────────────────────────────────────────────────────

    private _buildCamera(scene: BABYLON.Scene): void {
        const canvas = scene.getEngine().getRenderingCanvas();

        const cam = new BABYLON.ArcRotateCamera(
            'flightCam',
            0, 0, 50,
            this.planeRoot.position.clone(),
            scene,
        );

        cam.minZ = 5;
        cam.maxZ = 2_000_000;

        if (canvas) cam.attachControl(canvas, true);

        cam.lowerRadiusLimit  = 15;
        cam.upperRadiusLimit  = 300;
        cam.inertia           = 0.8;
        cam.panningSensibility = 0;

        cam.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');

        const surfaceUp = this.tiles
            ? this.planeRoot.position.normalizeToNew()
            : new BABYLON.Vector3(0, 1, 0);
        cam.upVector = surfaceUp;

        const rotMatrix = new BABYLON.Matrix();
        BABYLON.Matrix.FromQuaternionToRef(this.planeRoot.rotationQuaternion!, rotMatrix);
        const forward = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0, 0, 1), rotMatrix);

        const behind = forward.scale(-50);
        const above  = surfaceUp.scale(20);
        cam.setPosition(this.planeRoot.position.add(behind).add(above));

        scene.activeCamera = cam;
        (this as any)._camera = cam;
    }

    private _updateCamera(): void {
        const cam = (this as any)._camera as BABYLON.ArcRotateCamera;
        if (!cam) return;

        cam.target.copyFrom(this.planeRoot.position);

        const surfaceUp = this.tiles
            ? this.planeRoot.position.normalizeToNew()
            : new BABYLON.Vector3(0, 1, 0);

        cam.upVector = surfaceUp;

        const hemi = cam.getScene().getLightByName('sky') as BABYLON.HemisphericLight;
        if (hemi) hemi.direction.copyFrom(surfaceUp);
    }

    // ── Post-Processing ───────────────────────────────────────────────────────

    private _setupPostProcessing(scene: any): void {
        const cam      = scene.activeCamera;
        const pipeline = new BABYLON.DefaultRenderingPipeline('pp', true, scene, [cam]);
        pipeline.samples        = 4;
        pipeline.bloomEnabled   = true;
        pipeline.bloomWeight    = 0.4;
        pipeline.bloomKernel    = 128;
        pipeline.bloomScale     = 0.5;
        pipeline.bloomThreshold = 0.8;
        pipeline.chromaticAberrationEnabled            = true;
        pipeline.chromaticAberration.aberrationAmount   = 2.0;
        pipeline.chromaticAberration.radialIntensity    = 1.0;
        pipeline.sharpenEnabled        = true;
        pipeline.sharpen.edgeAmount    = 0.2;
        pipeline.imageProcessingEnabled                 = true;
        pipeline.imageProcessing.toneMappingEnabled     = true;
        pipeline.imageProcessing.toneMappingType        = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
        pipeline.imageProcessing.exposure               = 1.1;
        pipeline.imageProcessing.contrast               = 1.08;
        pipeline.imageProcessing.vignetteEnabled        = true;
        pipeline.imageProcessing.vignetteWeight         = 2.2;
        pipeline.imageProcessing.vignetteColor          = new BABYLON.Color4(0, 0, 0, 0);
        pipeline.imageProcessing.vignetteBlendMode      = BABYLON.ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;

        const sun = scene.getLightByName('sun');
        if (sun) {
            const lfs = new BABYLON.LensFlareSystem('sunFlare', sun, scene);
            lfs.borderLimit = 600;
            ([[0.6, 0], [0.2, 0.4], [0.12, 0.7], [0.3, -0.2]] as [number, number][]).forEach(([size, pos]) => {
                new BABYLON.LensFlare(size, pos, new BABYLON.Color3(1, 0.95, 0.6),
                    'https://assets.babylonjs.com/textures/flare.png', lfs);
            });
        }

        try {
            const ssao = new BABYLON.SSAO2RenderingPipeline('ssao', scene, { ssaoRatio: 0.5, blurRatio: 1 }, [cam]);
            ssao.radius = 2.0; ssao.totalStrength = 0.7; ssao.samples = 8; ssao.maxZ = 600;
        } catch { /* SSAO not available on this GPU */ }
    }

    // ── Input ─────────────────────────────────────────────────────────────────

    private _handleInput(dt: number): void {
        const p = (code: string) => this.input.isKeyDown(code);

        if (p('KeyW')) this.thrust = Math.min(1, this.thrust + dt * 0.55);
        if (p('KeyS')) this.thrust = Math.max(0, this.thrust - dt * 0.4);

        const pitchInput = p('ArrowUp')    ?  1 : p('ArrowDown')  ? -1 : 0;
        const rollInput  = p('ArrowRight') ?  1 : p('ArrowLeft')  ? -1 : 0;
        const yawInput   = p('KeyE')       ?  1 : p('KeyQ')       ? -1 : 0;

        this.surfaces[0].controlInput =  rollInput;   // left wing
        this.surfaces[1].controlInput = -rollInput;    // right wing
        this.surfaces[2].controlInput = -pitchInput;   // elevator
        this.surfaces[3].controlInput = -yawInput;     // rudder

        if (p('KeyR')) this._spawnPlane();
    }

    private _spawnPlane(): void {
        if (!this.planeRoot) return;

        if (this.tiles) {
            const [x, y, z] = latLonAltToEcef(START_LAT, START_LON, START_ALT);
            this.planeRoot.position.set(x, y, z);
        } else {
            this.planeRoot.position.set(0, 400, 0);
        }

        this._alignToSurface();
        this._setInitialVelocity(0);
    }

    // ── Physics (component-based aero with substep) ───────────────────────────

    private _applyPhysics(dt: number): void {
        const orientation = this.planeRoot.rotationQuaternion!;
        const pos         = this.planeRoot.position;

        const altitude   = this.tiles
            ? ecefToGeodetic(pos.x, pos.y, pos.z).alt
            : pos.y;
        const airDensity = getAirDensity(altitude);

        const rotMatrix    = new BABYLON.Matrix();
        BABYLON.Matrix.FromQuaternionToRef(orientation, rotMatrix);
        const invRotMatrix = new BABYLON.Matrix();
        rotMatrix.invertToRef(invRotMatrix);

        const toWorld = (v: BABYLON.Vector3) => BABYLON.Vector3.TransformNormal(v, rotMatrix);
        const toBody  = (v: BABYLON.Vector3) => BABYLON.Vector3.TransformNormal(v, invRotMatrix);

        const computeForces = (vel: BABYLON.Vector3, angVel: BABYLON.Vector3) => {
            const totalForce  = BABYLON.Vector3.Zero();
            const totalTorque = BABYLON.Vector3.Zero();

            const gravDir = this.tiles
                ? pos.normalizeToNew().scaleInPlace(-1)
                : new BABYLON.Vector3(0, -1, 0);
            totalForce.addInPlace(gravDir.scale(MASS * G_ACCEL));

            totalForce.addInPlace(
                toWorld(new BABYLON.Vector3(0, 0, this.thrust * MAX_THRUST_N)),
            );

            const bodyVel = toBody(vel);
            for (const surface of this.surfaces) {
                const pointVel       = bodyVel.add(BABYLON.Vector3.Cross(angVel, surface.position));
                const { force, torque } = computeSurfaceForces(surface, pointVel, airDensity);
                totalForce.addInPlace(toWorld(force));
                totalTorque.addInPlace(torque);
            }

            return { force: totalForce, torque: totalTorque };
        };

        // --- Substep (midpoint method from Jump Trajectory video) ---
        const f1 = computeForces(this.velocity, this.angularVelocity);

        const halfDt  = dt * 0.5;
        const predVel = this.velocity.add(f1.force.scale(halfDt / MASS));

        const Iw1   = new BABYLON.Vector3(Ixx * this.angularVelocity.x, Iyy * this.angularVelocity.y, Izz * this.angularVelocity.z);
        const gyro1 = BABYLON.Vector3.Cross(this.angularVelocity, Iw1);
        const angAcc1 = new BABYLON.Vector3(
            (f1.torque.x - gyro1.x) / Ixx,
            (f1.torque.y - gyro1.y) / Iyy,
            (f1.torque.z - gyro1.z) / Izz,
        );
        const predAngVel = this.angularVelocity.add(angAcc1.scale(halfDt));

        const f2 = computeForces(predVel, predAngVel);

        const avgForce  = f1.force.add(f2.force).scaleInPlace(0.5);
        const avgTorque = f1.torque.add(f2.torque).scaleInPlace(0.5);

        // --- Integrate linear motion ---
        this.velocity.addInPlace(avgForce.scale(dt / MASS));
        pos.addInPlace(this.velocity.scale(dt));

        // --- Integrate angular motion ---
        const Iw2   = new BABYLON.Vector3(Ixx * this.angularVelocity.x, Iyy * this.angularVelocity.y, Izz * this.angularVelocity.z);
        const gyro2 = BABYLON.Vector3.Cross(this.angularVelocity, Iw2);
        const angAcc = new BABYLON.Vector3(
            (avgTorque.x - gyro2.x) / Ixx,
            (avgTorque.y - gyro2.y) / Iyy,
            (avgTorque.z - gyro2.z) / Izz,
        );
        this.angularVelocity.addInPlace(angAcc.scale(dt));
        this.angularVelocity.scaleInPlace(Math.max(0, 1 - ANGULAR_DAMPING * dt));

        // --- Quaternion integration: dq/dt = 0.5 * q * omega_quat ---
        const omegaQuat = new BABYLON.Quaternion(
            this.angularVelocity.x,
            this.angularVelocity.y,
            this.angularVelocity.z,
            0,
        );
        const qDot = orientation.multiply(omegaQuat);
        orientation.x += qDot.x * 0.5 * dt;
        orientation.y += qDot.y * 0.5 * dt;
        orientation.z += qDot.z * 0.5 * dt;
        orientation.w += qDot.w * 0.5 * dt;
        orientation.normalize();

        // --- Ground collision ---
        if (this.tiles) {
            const geo = ecefToGeodetic(pos.x, pos.y, pos.z);
            const groundAlt = GROUND_LEVEL_ALT + 3;
            if (geo.alt < groundAlt) {
                const [sx, sy, sz] = latLonAltToEcef(geo.lat, geo.lon, groundAlt);
                pos.set(sx, sy, sz);
                const up     = pos.normalizeToNew();
                const vDotUp = BABYLON.Vector3.Dot(this.velocity, up);
                if (vDotUp < 0) {
                    this.velocity.subtractInPlace(up.scale(vDotUp));
                }
                this.velocity.scaleInPlace(0.97);
                this.angularVelocity.scaleInPlace(0.5);
            }
        } else {
            if (pos.y < 6) {
                pos.y = 6;
                if (this.velocity.y < 0) this.velocity.y = 0;
                this.velocity.scaleInPlace(0.97);
                this.angularVelocity.scaleInPlace(0.5);
            }
        }
    }

    // ── HUD ───────────────────────────────────────────────────────────────────

    private _buildHUD(): void {
        const hud = document.createElement('div');
        hud.id = 'flight-hud';
        hud.innerHTML = `
<style>
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Inter:wght@300;400&display=swap');
#flight-hud { position:fixed;inset:0;pointer-events:none;z-index:100;font-family:'Orbitron',monospace;color:#7df9c8; }
.hp {
    position:absolute;
    background:linear-gradient(135deg,rgba(0,20,15,.72),rgba(0,30,20,.55));
    border:1px solid rgba(80,255,160,.25);
    border-radius:10px;padding:14px 20px;
    backdrop-filter:blur(12px);
    box-shadow:0 0 24px rgba(0,255,128,.08),inset 0 0 12px rgba(0,255,128,.04);
}
#hl{bottom:32px;left:32px;min-width:170px}
#hr{bottom:32px;right:32px;min-width:170px}
#hc{top:20px;left:50%;transform:translateX(-50%);font-size:10px;letter-spacing:.18em;color:rgba(100,240,180,.5);font-family:'Inter',sans-serif;text-align:center}
#hfps{top:20px;right:20px;font-size:10px;color:rgba(100,240,180,.4);font-family:'Inter',sans-serif;padding:5px 10px}
#htile{bottom:32px;left:50%;transform:translateX(-50%);font-size:10px;color:rgba(100,240,180,.35);font-family:'Inter',sans-serif;padding:5px 10px;}
#hw{top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(255,30,0,.12);border-color:rgba(255,60,0,.7);color:#ff5500;font-size:20px;letter-spacing:.2em;text-align:center;padding:16px 36px;display:none;animation:blink .7s steps(2) infinite}
@keyframes blink{to{opacity:0}}
.lbl{font-size:9px;letter-spacing:.2em;color:rgba(100,240,180,.55);margin-bottom:2px;font-family:'Inter',sans-serif;font-weight:300}
.val{font-size:24px;font-weight:700;line-height:1;text-shadow:0 0 12px rgba(100,255,160,.6);letter-spacing:.05em}
.unit{font-size:11px;font-weight:400;opacity:.6}
.sep{height:1px;background:rgba(80,255,160,.15);margin:10px 0}
.tr{width:100%;height:5px;background:rgba(0,80,40,.5);border-radius:3px;margin-top:6px;overflow:hidden}
.tf{height:100%;width:0%;background:linear-gradient(90deg,#00cc66,#00ffaa,#80ffdd);border-radius:3px;transition:width .08s linear;box-shadow:0 0 8px #00ffaa88}
</style>
<div class="hp" id="hl">
  <div class="lbl">AIRSPEED</div>
  <div class="val" id="hs">0 <span class="unit">m/s</span></div>
  <div class="sep"></div>
  <div class="lbl">THROTTLE</div>
  <div class="tr"><div class="tf" id="ht"></div></div>
</div>
<div class="hp" id="hr">
  <div class="lbl">ALTITUDE</div>
  <div class="val" id="ha">0 <span class="unit">m</span></div>
  <div class="sep"></div>
  <div class="lbl">ATTITUDE</div>
  <div style="font-size:12px;letter-spacing:.08em" id="hatt">&#9654; LEVEL</div>
</div>
<div class="hp" id="hc">W/S &middot; THROTTLE &nbsp;|&nbsp; ARROWS &middot; PITCH &amp; ROLL &nbsp;|&nbsp; Q/E &middot; YAW &nbsp;|&nbsp; R &middot; RESET</div>
<div class="hp" id="hfps"></div>
<div class="hp" id="htile">TILES: &mdash;</div>
<div class="hp" id="hw">&#9888; STALL &#9888;</div>`;
        document.body.appendChild(hud);
        this.hudSpeed    = document.getElementById('hs')!;
        this.hudAlt      = document.getElementById('ha')!;
        this.hudThrottle = document.getElementById('ht')!;
        this.hudAttitude = document.getElementById('hatt')!;
        this.hudWarning  = document.getElementById('hw')!;
        this.hudFps      = document.getElementById('hfps')!;
        this.hudTileInfo = document.getElementById('htile')!;

        this._buildDebugPanel();
    }

    private _buildDebugPanel(): void {
        const panel = document.createElement('div');
        panel.id = 'dbg-panel';
        panel.innerHTML = `
<style>
#dbg-panel{position:fixed;bottom:10px;left:50%;transform:translateX(-50%);z-index:200;
  font-family:'Inter',monospace;color:#7df9c8;pointer-events:auto;
  background:linear-gradient(135deg,rgba(0,20,15,.82),rgba(0,30,20,.65));
  border:1px solid rgba(80,255,160,.25);border-radius:10px;padding:10px 16px;
  backdrop-filter:blur(12px);box-shadow:0 0 24px rgba(0,255,128,.08);
  display:flex;gap:20px;font-size:10px;max-width:95vw;overflow-x:auto;}
#dbg-panel.hidden{display:none}
#dbg-panel-toggle{position:fixed;bottom:10px;left:50%;transform:translateX(-50%);z-index:201;
  background:rgba(0,20,15,.6);border:1px solid rgba(80,255,160,.3);color:#7df9c8;
  padding:4px 12px;border-radius:6px;cursor:pointer;font-family:'Inter',monospace;font-size:10px;pointer-events:auto;display:none}
.dbg-section{display:flex;flex-direction:column;gap:3px;min-width:200px}
.dbg-title{font-family:'Orbitron',monospace;font-size:9px;letter-spacing:.15em;color:rgba(100,240,180,.6);border-bottom:1px solid rgba(80,255,160,.15);padding-bottom:3px;margin-bottom:2px}
.dbg-row{display:flex;justify-content:space-between;gap:8px}
.dbg-lbl{color:rgba(200,255,230,.5);white-space:nowrap}
.dbg-val{color:#40ffaa;font-family:monospace;text-align:right;white-space:nowrap}
.dbg-ctrl{display:flex;flex-direction:column;gap:4px;min-width:180px}
.dbg-slider-row{display:flex;align-items:center;gap:6px}
.dbg-slider-row label{color:rgba(200,255,230,.5);font-size:9px;min-width:55px}
.dbg-slider-row input[type=range]{flex:1;height:4px;accent-color:#40ffaa;cursor:pointer}
.dbg-slider-row .dbg-sv{color:#40ffaa;font-family:monospace;font-size:9px;min-width:40px;text-align:right}
</style>
<div class="dbg-section">
  <div class="dbg-title">AIRPLANE</div>
  <div class="dbg-row"><span class="dbg-lbl">POS (lat,lon,alt)</span><span class="dbg-val" id="dbg-ppos">—</span></div>
  <div class="dbg-row"><span class="dbg-lbl">ROT (H,P,R)</span><span class="dbg-val" id="dbg-prot">—</span></div>
  <div class="dbg-row"><span class="dbg-lbl">VEL (m/s)</span><span class="dbg-val" id="dbg-pvel">—</span></div>
</div>
<div class="dbg-section">
  <div class="dbg-title">CAMERA</div>
  <div class="dbg-row"><span class="dbg-lbl">POS (x,y,z)</span><span class="dbg-val" id="dbg-cpos">—</span></div>
  <div class="dbg-row"><span class="dbg-lbl">α / β / R</span><span class="dbg-val" id="dbg-corbit">—</span></div>
</div>
<div class="dbg-ctrl">
  <div class="dbg-title">CAMERA CTRL</div>
  <div class="dbg-slider-row"><label>Radius</label><input type="range" id="dbg-cr" min="15" max="300" value="50"><span class="dbg-sv" id="dbg-crv">50</span></div>
  <div class="dbg-slider-row"><label>Height β</label><input type="range" id="dbg-cb" min="0" max="314" value="120"><span class="dbg-sv" id="dbg-cbv">1.20</span></div>
</div>
<div class="dbg-ctrl">
  <div class="dbg-title">AIRPLANE CTRL</div>
  <div class="dbg-slider-row"><label>Heading</label><input type="range" id="dbg-ph" min="0" max="360" value="201"><span class="dbg-sv" id="dbg-phv">201°</span></div>
  <div class="dbg-slider-row"><label>Pitch</label><input type="range" id="dbg-pp" min="-180" max="180" value="11"><span class="dbg-sv" id="dbg-ppv">11°</span></div>
  <div class="dbg-slider-row"><label>Roll</label><input type="range" id="dbg-pr" min="-180" max="180" value="133"><span class="dbg-sv" id="dbg-prv">133°</span></div>
  <div class="dbg-slider-row"><label>Lat offset</label><input type="range" id="dbg-plat" min="-50" max="50" value="0"><span class="dbg-sv" id="dbg-platv">0</span></div>
  <div class="dbg-slider-row"><label>Lon offset</label><input type="range" id="dbg-plon" min="-50" max="50" value="0"><span class="dbg-sv" id="dbg-plonv">0</span></div>
</div>`;
        document.body.appendChild(panel);
        this.dbgPanel    = panel;
        this.dbgPlanePos = document.getElementById('dbg-ppos')!;
        this.dbgPlaneRot = document.getElementById('dbg-prot')!;
        this.dbgPlaneVel = document.getElementById('dbg-pvel')!;
        this.dbgCamPos   = document.getElementById('dbg-cpos')!;
        this.dbgCamOrbit = document.getElementById('dbg-corbit')!;

        const toggleBtn = document.createElement('div');
        toggleBtn.id = 'dbg-panel-toggle';
        toggleBtn.textContent = 'SHOW DEBUG';
        document.body.appendChild(toggleBtn);

        toggleBtn.addEventListener('click', () => {
            panel.classList.toggle('hidden');
            toggleBtn.style.display = panel.classList.contains('hidden') ? 'block' : 'none';
        });

        const cam = (this as any)._camera as BABYLON.ArcRotateCamera;

        document.getElementById('dbg-cr')!.addEventListener('input', (e: any) => {
            const v = parseFloat(e.target.value);
            if (cam) cam.radius = v;
            document.getElementById('dbg-crv')!.textContent = String(v);
        });

        document.getElementById('dbg-cb')!.addEventListener('input', (e: any) => {
            const v = parseFloat(e.target.value) / 100;
            if (cam) cam.beta = v;
            document.getElementById('dbg-cbv')!.textContent = v.toFixed(2);
        });

        const rotHandler = () => this._applyDebugRotation();

        document.getElementById('dbg-ph')!.addEventListener('input', (e: any) => {
            document.getElementById('dbg-phv')!.textContent = `${e.target.value}°`;
            rotHandler();
        });
        document.getElementById('dbg-pp')!.addEventListener('input', (e: any) => {
            document.getElementById('dbg-ppv')!.textContent = `${e.target.value}°`;
            rotHandler();
        });
        document.getElementById('dbg-pr')!.addEventListener('input', (e: any) => {
            document.getElementById('dbg-prv')!.textContent = `${e.target.value}°`;
            rotHandler();
        });

        document.getElementById('dbg-plat')!.addEventListener('input', (e: any) => {
            const offset = parseFloat(e.target.value) / 100000;
            document.getElementById('dbg-platv')!.textContent = (offset * 100000).toFixed(0);
            this._repositionPlane(offset, 0);
        });

        document.getElementById('dbg-plon')!.addEventListener('input', (e: any) => {
            const offset = parseFloat(e.target.value) / 100000;
            document.getElementById('dbg-plonv')!.textContent = (offset * 100000).toFixed(0);
            this._repositionPlane(0, offset);
        });
    }

    private _applyDebugRotation(): void {
        const hDeg = parseFloat((document.getElementById('dbg-ph') as HTMLInputElement).value);
        const pDeg = parseFloat((document.getElementById('dbg-pp') as HTMLInputElement).value);
        const rDeg = parseFloat((document.getElementById('dbg-pr') as HTMLInputElement).value);

        this._alignToSurface();

        const hq = BABYLON.Quaternion.RotationAxis(new BABYLON.Vector3(0, 1, 0), (hDeg * Math.PI) / 180);
        const pq = BABYLON.Quaternion.RotationAxis(new BABYLON.Vector3(1, 0, 0), (pDeg * Math.PI) / 180);
        const rq = BABYLON.Quaternion.RotationAxis(new BABYLON.Vector3(0, 0, 1), (rDeg * Math.PI) / 180);

        this.planeRoot.rotationQuaternion = this.planeRoot.rotationQuaternion!
            .multiply(hq)
            .multiply(pq)
            .multiply(rq);

        this._setInitialVelocity(0);
    }

    private _repositionPlane(_latOff: number, _lonOff: number): void {
        const latSlider = document.getElementById('dbg-plat') as HTMLInputElement;
        const lonSlider = document.getElementById('dbg-plon') as HTMLInputElement;
        const latO = parseFloat(latSlider.value) / 100000;
        const lonO = parseFloat(lonSlider.value) / 100000;
        const lat = START_LAT + latO;
        const lon = START_LON + lonO;
        if (this.tiles) {
            const [x, y, z] = latLonAltToEcef(lat, lon, START_ALT);
            this.planeRoot.position.set(x, y, z);
        }
        this._applyDebugRotation();
    }

    private _updateHUD(): void {
        const speed = Math.round(this.velocity.length());

        const pos = this.planeRoot.position;
        const altitude = this.tiles
            ? Math.round(Math.max(0, ecefToGeodetic(pos.x, pos.y, pos.z).alt))
            : Math.round(Math.max(0, pos.y));
        const pct = Math.round(this.thrust * 100);

        this.hudSpeed.innerHTML        = `${speed} <span class="unit">m/s</span>`;
        this.hudAlt.innerHTML          = `${altitude} <span class="unit">m</span>`;
        this.hudThrottle.style.width   = `${pct}%`;

        const wm      = this.planeRoot.getWorldMatrix();
        const forward = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0, 0, 1), wm).normalize();
        const surfaceUp = this.tiles
            ? pos.normalizeToNew()
            : new BABYLON.Vector3(0, 1, 0);
        const pitchAngle = Math.asin(Math.max(-1, Math.min(1, BABYLON.Vector3.Dot(forward, surfaceUp))));

        const altAboveGround = this.tiles ? altitude - GROUND_LEVEL_ALT : altitude;
        const isOnGround = altAboveGround < 5;

        this.hudAttitude.textContent =
            isOnGround         ? '\u25B6 GROUND'   :
            pitchAngle > 0.08  ? '\u25B2 CLIMBING' :
            pitchAngle < -0.08 ? '\u25BC DIVING'   : '\u25B6 LEVEL';
        this.hudWarning.style.display =
            (speed < STALL_SPEED_HUD && altAboveGround > 20) ? 'block' : 'none';

        this.hudFps.textContent =
            `${this.scene?.getEngine?.()?.getFps?.()?.toFixed(0) ?? '--'} FPS`;

        this._updateDebugReadouts();
    }

    private _updateDebugReadouts(): void {
        if (!this.dbgPlanePos) return;

        const pos = this.planeRoot.position;
        if (this.tiles) {
            const geo = ecefToGeodetic(pos.x, pos.y, pos.z);
            this.dbgPlanePos.textContent = `${geo.lat.toFixed(5)}, ${geo.lon.toFixed(5)}, ${geo.alt.toFixed(1)}`;
        } else {
            this.dbgPlanePos.textContent = `${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}`;
        }

        const q = this.planeRoot.rotationQuaternion;
        if (q) {
            const surfaceUp = this.tiles ? pos.normalizeToNew() : new BABYLON.Vector3(0, 1, 0);
            const wm = this.planeRoot.getWorldMatrix();
            const fwd = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0, 0, 1), wm).normalize();
            const right = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(1, 0, 0), wm).normalize();

            const pitch = Math.asin(Math.max(-1, Math.min(1, BABYLON.Vector3.Dot(fwd, surfaceUp))));
            const roll  = Math.asin(Math.max(-1, Math.min(1, BABYLON.Vector3.Dot(right, surfaceUp))));

            const fwdFlat = fwd.subtract(surfaceUp.scale(BABYLON.Vector3.Dot(fwd, surfaceUp)));
            fwdFlat.normalize();
            const northPole = new BABYLON.Vector3(0, 0, 1);
            let east = BABYLON.Vector3.Cross(northPole, surfaceUp);
            if (east.lengthSquared() < 0.001) east = new BABYLON.Vector3(1, 0, 0);
            east.normalize();
            const north = BABYLON.Vector3.Cross(surfaceUp, east).normalize();
            const headingRad = Math.atan2(BABYLON.Vector3.Dot(fwdFlat, east), BABYLON.Vector3.Dot(fwdFlat, north));
            const hDeg = ((headingRad * 180 / Math.PI) + 360) % 360;

            const pDeg = (pitch * 180 / Math.PI);
            const rDeg = (roll * 180 / Math.PI);
            this.dbgPlaneRot.textContent = `H:${hDeg.toFixed(1)}° P:${pDeg.toFixed(1)}° R:${rDeg.toFixed(1)}°`;
        }

        const vel = this.velocity;
        this.dbgPlaneVel.textContent = `${vel.length().toFixed(1)} (${vel.x.toFixed(1)}, ${vel.y.toFixed(1)}, ${vel.z.toFixed(1)})`;

        const cam = (this as any)._camera as BABYLON.ArcRotateCamera;
        if (cam) {
            const cp = cam.position;
            this.dbgCamPos.textContent = `${cp.x.toFixed(0)}, ${cp.y.toFixed(0)}, ${cp.z.toFixed(0)}`;
            this.dbgCamOrbit.textContent = `${(cam.alpha * 180 / Math.PI).toFixed(1)}° / ${(cam.beta * 180 / Math.PI).toFixed(1)}° / ${cam.radius.toFixed(1)}`;
        }
    }
}
