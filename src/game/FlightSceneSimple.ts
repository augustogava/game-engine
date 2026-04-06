declare const __GOOGLE_MAPS_API_KEY__: string;
import { Scene3D } from '../engine/3d/Scene3D.js';
import { InputManager } from '../engine/input/InputManager.js';
import { TilesRenderer } from '3d-tiles-renderer/babylonjs';
import { GoogleCloudAuthPlugin } from '3d-tiles-renderer/core/plugins';
import * as BABYLON from '@babylonjs/core';
import '@babylonjs/loaders';
import { MultiplayerClient, PlayerState } from './MultiplayerClient.js';

interface RemotePlayer {
    root: BABYLON.TransformNode;
    meshes: BABYLON.Mesh[];
    prevState: PlayerState | null;
    nextState: PlayerState | null;
    lastUpdateTime: number;
}

const STALL_SPEED_HUD  = 25;
const MASS             = 10000;
const MAX_THRUST_N     = 50000;
const G_ACCEL          = 9.81;
const ANGULAR_DAMPING  = 0.5;
const GROUND_Y         = 6;

const Ixx = 211333;
const Iyy = 256608;
const Izz = 48531;

const LIFT_SLOPE      = 5.5;
const SKIN_FRICTION   = 0.02;
const STALL_ALPHA_RAD = 0.26;
const OSWALD_E        = 0.8;

// ── ISA atmosphere ────────────────────────────────────────────────────────────
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

// ── FlightSceneSimple ─────────────────────────────────────────────────────────
export class FlightSceneSimple extends Scene3D {
    private planeRoot!: BABYLON.TransformNode;
    private velocity        = BABYLON.Vector3.Zero();
    private angularVelocity = BABYLON.Vector3.Zero();
    private thrust   = 0.0;
    private spawned  = false;
    private camera!: BABYLON.ArcRotateCamera;
    private surfaces: AeroSurface[] = [];
    private ground!: BABYLON.Mesh;
    private tiles: TilesRenderer | null = null;
    private initialHeading = 0;
    private terrainY = GROUND_Y;
    private readonly FLAP_STEPS = [0, 5, 15, 25, 30, 40];
    private flapIndex = 2;
    private flapKeyLock5 = false;
    private flapKeyLock6 = false;
    private baseZeroLiftAoA = -0.035;
    private currentFlapDeg = 15;
    private originLat = -23.4354;
    private originLon = -46.4745;
    private mapApiKey = '';
    private mapImg!: HTMLImageElement;
    private mapHeadingCanvas!: HTMLCanvasElement;
    private mapLastUpdate = 0;
    private spawnAirborne = false;
    private isMobile = false;
    private touchPitchInput = 0;
    private touchRollInput = 0;
    private touchThrust = 0.7;
    private joystickTouchId: number | null = null;
    private joystickOrigin = { x: 0, y: 0 };
    private throttleTouchId: number | null = null;

    private mpClient: MultiplayerClient | null = null;
    private remotePlayers = new Map<string, RemotePlayer>();
    private hudOnline!: HTMLElement;
    private dbgMpStatus!: HTMLElement;
    private dbgMpCount!: HTMLElement;
    private dbgMpUserId!: HTMLElement;
    public onSpawned: (() => void) | null = null;

    private hudSpeed!:    HTMLElement;
    private hudAlt!:      HTMLElement;
    private hudThrottle!: HTMLElement;
    private hudAttitude!: HTMLElement;
    private hudWarning!:  HTMLElement;
    private hudFps!:      HTMLElement;

    private dbgPlanePos!:  HTMLElement;
    private dbgPlaneRot!:  HTMLElement;
    private dbgPlaneVel!:  HTMLElement;
    private dbgCamPos!:    HTMLElement;
    private dbgCamOrbit!:  HTMLElement;
    private dbgPanel!:     HTMLElement;
    private hudCanvas!:    HTMLCanvasElement;
    private hudCtx!:       CanvasRenderingContext2D;
    private hudFlapVal!:   HTMLElement;
    private hudFlapBar!:   HTMLElement;

    onCreate(scene: any, _input: InputManager): void {
        this.isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        scene.useRightHandedSystem = true;
        scene.clearColor = new BABYLON.Color4(0.04, 0.1, 0.22, 1);
        scene.fogMode    = BABYLON.Scene.FOGMODE_EXP2;
        scene.fogColor   = new BABYLON.Color3(0.55, 0.7, 0.95);
        scene.fogDensity = 0.000008;

        this.velocity        = BABYLON.Vector3.Zero();
        this.angularVelocity = BABYLON.Vector3.Zero();

        this._initSurfaces();
        this._init3DTiles(scene);
        this._setupLighting(scene);
        this._buildSkybox(scene);
        this._buildClouds(scene);
        this._buildGround(scene);
        this._buildPlane(scene);
        this._buildCamera(scene);
        this._setupPostProcessing(scene);
        this._buildHUD();
        if (this.isMobile) this._setupTouchControls();
        if (this.tiles) {
            this.ground.isVisible = false;
            scene.fogColor   = new BABYLON.Color3(0.65, 0.75, 0.90);
            scene.fogDensity = 0.0000025;
        }

    }

    update(dt: number): void {
        if (!this.spawned) return;
        if (this.tiles) this.tiles.update();
        this._handleInput(dt);
        this._applyPhysics(dt);
        this._updateClouds();
        this._updateHUD();
        this._sendOwnState();
        this._updateRemotePlayers();
    }

    onDispose(): void {
        document.getElementById('flight-hud')?.remove();
        document.getElementById('dbg-panel')?.remove();
        document.getElementById('dbg-panel-toggle')?.remove();
        document.getElementById('touch-overlay')?.remove();
        if (this.tiles) { this.tiles.dispose(); this.tiles = null; }
        this.mpClient?.dispose();
    }

    initMultiplayer(userId: string): void {
        this.mpClient = new MultiplayerClient(userId);

        this.mpClient.onPlayersUpdate((players) => {
            const now = performance.now();
            const activeIds = new Set<string>();

            for (const p of players) {
                activeIds.add(p.userId);
                let remote = this.remotePlayers.get(p.userId);
                if (!remote) {
                    remote = this._createRemotePlayer(p.userId);
                    this.remotePlayers.set(p.userId, remote);
                }
                remote.prevState = remote.nextState;
                remote.nextState = p;
                remote.lastUpdateTime = now;
            }

            for (const [id, remote] of this.remotePlayers) {
                if (!activeIds.has(id)) {
                    remote.meshes.forEach(m => m.dispose());
                    remote.root.dispose();
                    this.remotePlayers.delete(id);
                }
            }
        });

        this.mpClient.onPlayerCountChange((count) => {
            if (this.hudOnline) this.hudOnline.textContent = `${count} ONLINE`;
            if (this.dbgMpCount) this.dbgMpCount.textContent = String(count);
        });

        this.mpClient.onConnectionChange((connected) => {
            if (this.dbgMpStatus) {
                this.dbgMpStatus.textContent = connected ? 'CONNECTED' : 'DISCONNECTED';
                this.dbgMpStatus.style.color = connected ? '#40ffaa' : '#ff5555';
            }
        });

        if (this.dbgMpUserId) this.dbgMpUserId.textContent = userId.substring(0, 8) + '…';
        this.mpClient.connect();
    }

    private _createRemotePlayer(id: string): RemotePlayer {
        const scene = this.scene;
        const root = new BABYLON.TransformNode(`remote_${id}`, scene);
        root.rotationQuaternion = BABYLON.Quaternion.Identity();

        const remote: RemotePlayer = { root, meshes: [], prevState: null, nextState: null, lastUpdateTime: 0 };

        BABYLON.SceneLoader.ImportMesh(
            '', 'models/', 'DC8_AFRC_AIR_0824.glb', scene,
            (meshes: BABYLON.AbstractMesh[]) => {
                const glbRoot = meshes[0];
                const bb = glbRoot.getHierarchyBoundingVectors(true);
                const center = bb.min.add(bb.max).scale(0.5);
                const size = bb.max.subtract(bb.min).length();

                const pivot = new BABYLON.TransformNode(`remotePivot_${id}`, scene);
                pivot.parent = root;

                glbRoot.parent = pivot;
                const offset = center.negate();
                offset.y = -bb.min.y;
                glbRoot.position = offset;
                glbRoot.rotationQuaternion = null;
                glbRoot.rotation = BABYLON.Vector3.Zero();

                const targetSize = 40;
                const scaleFactor = targetSize / Math.max(size, 0.1);
                pivot.scaling.setAll(scaleFactor);
                pivot.rotation = new BABYLON.Vector3(0, Math.PI, 0);

                meshes.forEach((m) => {
                    m.isPickable = false;
                    remote.meshes.push(m as BABYLON.Mesh);
                });
            },
            null,
            () => {
                this._buildRemoteFallback(id, root, remote);
            },
        );

        return remote;
    }

    private _buildRemoteFallback(id: string, root: BABYLON.TransformNode, remote: RemotePlayer): void {
        const scene = this.scene;
        const mat = new BABYLON.PBRMaterial(`remoteMat_${id}`, scene);
        mat.albedoColor = new BABYLON.Color3(1.0, 0.45, 0.15);
        mat.metallic = 0.6;
        mat.roughness = 0.3;

        const body = BABYLON.MeshBuilder.CreateBox(`rb_${id}`, { width: 2.2, height: 0.65, depth: 7 }, scene);
        const wing = BABYLON.MeshBuilder.CreateBox(`rw_${id}`, { width: 16, height: 0.22, depth: 2.5 }, scene);
        const tail = BABYLON.MeshBuilder.CreateBox(`rt_${id}`, { width: 6, height: 0.18, depth: 1.8 }, scene);
        tail.position.set(0, 0.4, -3.0);
        const finV = BABYLON.MeshBuilder.CreateBox(`rf_${id}`, { width: 0.18, height: 2.8, depth: 2.0 }, scene);
        finV.position.set(0, 1.4, -3.0);
        const nose = BABYLON.MeshBuilder.CreateCylinder(`rn_${id}`, {
            height: 2.5, diameterTop: 0, diameterBottom: 1.5, tessellation: 8,
        }, scene);
        nose.rotation.x = Math.PI / 2;
        nose.position.set(0, 0, 4.5);

        [body, wing, tail, finV, nose].forEach((m) => {
            m.material = mat;
            m.parent = root;
            m.isPickable = false;
            remote.meshes.push(m);
        });
    }

    private _latLonToLocal(lat: number, lon: number, alt: number): BABYLON.Vector3 {
        const metersPerDegLat = 111320;
        const metersPerDegLon = 111320 * Math.cos(this.originLat * Math.PI / 180);
        const x = (lon - this.originLon) * metersPerDegLon;
        const z = -(lat - this.originLat) * metersPerDegLat;
        return new BABYLON.Vector3(x, alt, z);
    }

    private _updateRemotePlayers(): void {
        const now = performance.now();

        for (const [, remote] of this.remotePlayers) {
            if (!remote.nextState) continue;

            const ns = remote.nextState;
            const targetPos = this._latLonToLocal(ns.lat, ns.lon, ns.alt);

            if (remote.prevState) {
                const elapsed = now - remote.lastUpdateTime;
                const t = Math.min(1, elapsed / 60);
                const ps = remote.prevState;
                const prevPos = this._latLonToLocal(ps.lat, ps.lon, ps.alt);
                remote.root.position = BABYLON.Vector3.Lerp(prevPos, targetPos, t);
            } else {
                remote.root.position.copyFrom(targetPos);
            }

            const yawRad = (180 - ns.heading) * Math.PI / 180;
            const pitchRad = ns.pitch * Math.PI / 180;
            const rollRad = ns.roll * Math.PI / 180;

            const yawQ = BABYLON.Quaternion.RotationAxis(BABYLON.Vector3.Up(), yawRad);
            const pitchQ = BABYLON.Quaternion.RotationAxis(BABYLON.Vector3.Right(), pitchRad);
            const rollQ = BABYLON.Quaternion.RotationAxis(BABYLON.Vector3.Forward(), rollRad);
            const targetQ = yawQ.multiply(pitchQ).multiply(rollQ);

            BABYLON.Quaternion.SlerpToRef(
                remote.root.rotationQuaternion!,
                targetQ,
                0.15,
                remote.root.rotationQuaternion!,
            );
        }
    }

    private _sendOwnState(): void {
        if (!this.mpClient || !this.spawned) return;
        const { lat, lon, hdg } = this._getCurrentLatLon();
        const pos = this.planeRoot.position;

        const wm = this.planeRoot.getWorldMatrix();
        const fwd = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0, 0, 1), wm).normalize();
        const right = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(1, 0, 0), wm).normalize();
        const surfaceUp = new BABYLON.Vector3(0, 1, 0);
        const pitchDeg = Math.asin(Math.max(-1, Math.min(1, BABYLON.Vector3.Dot(fwd, surfaceUp)))) * 180 / Math.PI;
        const rollDeg = Math.asin(Math.max(-1, Math.min(1, BABYLON.Vector3.Dot(right, surfaceUp)))) * 180 / Math.PI;

        this.mpClient.sendUpdate({
            lat, lon,
            alt: pos.y,
            airspeed: this.velocity.length() * 3.6,
            throttle: this.thrust,
            heading: hdg,
            pitch: pitchDeg,
            roll: rollDeg,
        });
    }

    // ── 3D Tiles (Step 1: just load, no coord changes) ────────────────────────

    private _init3DTiles(scene: BABYLON.Scene): void {
        const params = new URLSearchParams(window.location.search);
        const apiKey: string = __GOOGLE_MAPS_API_KEY__ || '';
        if (!apiKey) {
            console.warn('[3DTiles] No GOOGLE_MAPS_API_KEY in .env — skipping.');
            return;
        }

        const lat = parseFloat(params.get('lat') || '-23.4354');
        const lon = parseFloat(params.get('lng') || '-46.4745');
        const alt = parseFloat(params.get('alt') || '750');
        this.initialHeading = parseFloat(params.get('hdg') || '75');
        this.spawnAirborne = params.has('lat');
        this.originLat = lat;
        this.originLon = lon;
        this.mapApiKey = apiKey;

        const url = `https://tile.googleapis.com/v1/3dtiles/root.json?key=${apiKey}`;
        this.tiles = new TilesRenderer(url, scene);
        this.tiles.errorTarget = 6;
        (this.tiles as any).maxDepth = 100;
        (this.tiles as any).errorThreshold = 60;
        try {
            this.tiles.registerPlugin(new GoogleCloudAuthPlugin({ apiToken: apiKey, autoRefreshToken: true }));
        } catch (e) { console.warn('[3DTiles] Auth plugin failed:', e); }

        const latRad = lat * Math.PI / 180;
        const lonRad = lon * Math.PI / 180;
        const sinLat = Math.sin(latRad);
        const cosLat = Math.cos(latRad);
        const sinLon = Math.sin(lonRad);
        const cosLon = Math.cos(lonRad);

        const WGS84_A  = 6378137.0;
        const WGS84_E2 = 0.00669437999014;
        const refAlt = alt - GROUND_Y;
        const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
        const px = (N + refAlt) * cosLat * cosLon;
        const py = (N + refAlt) * cosLat * sinLon;
        const pz = (N * (1 - WGS84_E2) + refAlt) * sinLat;

        const east  = new BABYLON.Vector3(-sinLon, cosLon, 0);
        const up    = new BABYLON.Vector3(cosLat * cosLon, cosLat * sinLon, sinLat);
        const south = new BABYLON.Vector3(sinLat * cosLon, sinLat * sinLon, -cosLat);

        const T = BABYLON.Matrix.Translation(-px, -py, -pz);
        const R = new BABYLON.Matrix();
        BABYLON.Matrix.FromXYZAxesToRef(east, up, south, R);
        R.transposeToRef(R);
        const M = T.multiply(R);

        this.tiles.group.rotationQuaternion = BABYLON.Quaternion.Identity();
        M.decompose(
            this.tiles.group.scaling,
            this.tiles.group.rotationQuaternion,
            this.tiles.group.position,
        );

        console.info(`[3DTiles] ENU transform at (${lat}, ${lon}, alt=${alt}). Group pos: ${this.tiles.group.position}`);
    }

    // ── Lighting ─────────────────────────────────────────────────────────────

    private _setupLighting(scene: BABYLON.Scene): void {
        const hemi = new BABYLON.HemisphericLight('sky', new BABYLON.Vector3(0, 1, 0), scene);
        hemi.intensity = 0.5;
        hemi.diffuse = new BABYLON.Color3(0.6, 0.75, 1.0);
        hemi.groundColor = new BABYLON.Color3(0.25, 0.35, 0.18);

        const sun = new BABYLON.DirectionalLight('sun', new BABYLON.Vector3(-0.4, -0.9, -0.3).normalize(), scene);
        sun.position = new BABYLON.Vector3(800, 1200, 800);
        sun.intensity = 3.0;
        sun.diffuse = new BABYLON.Color3(1.0, 0.92, 0.75);
        sun.specular = new BABYLON.Color3(1.0, 0.9, 0.6);

        const fill = new BABYLON.DirectionalLight('fill', new BABYLON.Vector3(0.4, -0.3, 0.3).normalize(), scene);
        fill.intensity = 0.6;
        fill.diffuse = new BABYLON.Color3(0.6, 0.7, 0.9);
        fill.specular = BABYLON.Color3.Black();

        const shadow = new BABYLON.CascadedShadowGenerator(4096, sun);
        shadow.lambda                 = 0.75;
        shadow.cascadeBlendPercentage = 0.1;
        shadow.depthClamp             = true;
        shadow.autoCalcDepthBounds    = true;
        shadow.stabilizeCascades      = true;
        shadow.numCascades            = 4;
        shadow.penumbraDarkness       = 0.6;
        shadow.usePercentageCloserFiltering = true;
        (shadow as any).filteringQuality = BABYLON.ShadowGenerator.QUALITY_HIGH;
        (this as any)._shadow = shadow;

        scene.environmentIntensity = 1.3;
    }

    // ── Skybox ────────────────────────────────────────────────────────────────

    private _buildSkybox(scene: BABYLON.Scene): void {
        const envTex = BABYLON.CubeTexture.CreateFromPrefilteredData(
            'https://assets.babylonjs.com/environments/environmentSpecular.env', scene,
        );
        scene.environmentTexture = envTex;

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
    }

    // ── Clouds ─────────────────────────────────────────────────────────────────

    private cloudInstances: { mesh: BABYLON.InstancedMesh; yBase: number; spread: number }[] = [];

    private _buildClouds(scene: BABYLON.Scene): void {
        const mat = new BABYLON.StandardMaterial('cloudMat', scene);
        const tex = new BABYLON.Texture('https://assets.babylonjs.com/textures/cloud.png', scene);
        tex.hasAlpha = true;
        mat.diffuseTexture             = tex;
        mat.backFaceCulling            = false;
        mat.useAlphaFromDiffuseTexture = true;
        mat.opacityTexture             = tex;
        mat.transparencyMode           = BABYLON.StandardMaterial.MATERIAL_ALPHABLEND;
        mat.alpha                      = 0.85;
        mat.emissiveColor              = new BABYLON.Color3(1.0, 1.0, 1.0);
        mat.disableLighting            = true;

        const layers = [
            { count: 40, yMin: 600,  yRange: 800,  spread: 15000, sizeBase: 700 },
            { count: 50, yMin: 1800, yRange: 1200, spread: 20000, sizeBase: 1000 },
            { count: 35, yMin: 4000, yRange: 2500, spread: 25000, sizeBase: 1500 },
        ];

        for (const layer of layers) {
            const tpl = BABYLON.MeshBuilder.CreatePlane(`cloudTpl_${layer.yMin}`, { size: layer.sizeBase }, scene);
            tpl.isVisible = false;
            tpl.isPickable = false;
            tpl.material = mat;

            for (let i = 0; i < layer.count; i++) {
                const ci = tpl.createInstance(`c_${layer.yMin}_${i}`);
                const ox = (Math.random() - 0.5) * layer.spread;
                const oz = (Math.random() - 0.5) * layer.spread;
                const oy = layer.yMin + Math.random() * layer.yRange;
                ci.position.set(ox, oy, oz);
                const s = 0.5 + Math.random() * 2.0;
                ci.scaling.set(s, s * 0.25, 1);
                ci.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
                ci.isPickable = false;
                this.cloudInstances.push({ mesh: ci, yBase: oy, spread: layer.spread });
            }
        }
    }

    private _updateClouds(): void {
        if (!this.spawned || this.cloudInstances.length === 0) return;
        const px = this.planeRoot.position.x;
        const pz = this.planeRoot.position.z;

        for (const c of this.cloudInstances) {
            const half = c.spread * 0.5;
            let dx = c.mesh.position.x - px;
            let dz = c.mesh.position.z - pz;
            if (dx >  half) c.mesh.position.x -= c.spread;
            if (dx < -half) c.mesh.position.x += c.spread;
            if (dz >  half) c.mesh.position.z -= c.spread;
            if (dz < -half) c.mesh.position.z += c.spread;
        }
    }

    // ── Ground ────────────────────────────────────────────────────────────────

    private _buildGround(scene: BABYLON.Scene): void {
        this.ground = BABYLON.MeshBuilder.CreateGround('ground', { width: 20000, height: 20000 }, scene);
        this.ground.position.y = GROUND_Y - 2;
        const mat = new BABYLON.PBRMaterial('groundMat', scene);
        mat.albedoColor = new BABYLON.Color3(0.15, 0.35, 0.12);
        mat.metallic = 0;
        mat.roughness = 0.95;
        this.ground.material = mat;
        this.ground.receiveShadows = true;
    }

    // ── Airplane ──────────────────────────────────────────────────────────────

    private _buildPlane(scene: BABYLON.Scene): void {
        this.planeRoot = new BABYLON.TransformNode('planeRoot', scene);
        const yawRad = (180 - this.initialHeading) * Math.PI / 180;
        this.planeRoot.rotationQuaternion = BABYLON.Quaternion.RotationAxis(BABYLON.Vector3.Up(), yawRad);
        if (this.spawnAirborne) {
            this.planeRoot.position.set(0, GROUND_Y + 600, 0);
            this.thrust = 0.7;
            this.flapIndex = 0;
            this.currentFlapDeg = 0;
            const fwd = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0, 0, 1), BABYLON.Matrix.FromQuaternionToRef(this.planeRoot.rotationQuaternion, new BABYLON.Matrix()));
            this.velocity = fwd.scale(100);
        } else {
            this.planeRoot.position.set(0, GROUND_Y, 0);
            this.thrust = 0;
            this.flapIndex = 2;
            this.currentFlapDeg = 15;
            this.velocity = BABYLON.Vector3.Zero();
        }

        BABYLON.SceneLoader.ImportMesh(
            '', 'models/', 'DC8_AFRC_AIR_0824.glb', scene,
            (meshes: BABYLON.AbstractMesh[]) => {
                const root = meshes[0];

                const bb = root.getHierarchyBoundingVectors(true);
                const center = bb.min.add(bb.max).scale(0.5);
                const size = bb.max.subtract(bb.min).length();

                console.log('[FlightSimple] BB min:', bb.min.toString());
                console.log('[FlightSimple] BB max:', bb.max.toString());
                console.log('[FlightSimple] BB center:', center.toString());
                console.log('[FlightSimple] BB size:', size);

                const modelPivot = new BABYLON.TransformNode('modelPivot', scene);
                modelPivot.parent = this.planeRoot;

                root.parent = modelPivot;
                const offset = center.negate();
                offset.y = -bb.min.y;
                root.position = offset;
                root.rotationQuaternion = null;
                root.rotation = BABYLON.Vector3.Zero();

                const targetSize = 40;
                const scaleFactor = targetSize / Math.max(size, 0.1);
                modelPivot.scaling.setAll(scaleFactor);

                modelPivot.rotation = new BABYLON.Vector3(0, Math.PI, 0);

                const shadow = (this as any)._shadow;
                meshes.forEach((m: BABYLON.AbstractMesh) => {
                    if (shadow) shadow.addShadowCaster(m, true);
                });

                this.spawned = true;
                this.onSpawned?.();
                console.log('[FlightSimple] Model loaded and centered. Scale factor:', scaleFactor);
            },
            null,
            (_scene: BABYLON.Scene, _msg: string, ex?: any) => {
                console.warn('[FlightSimple] GLB load failed, building fallback', ex);
                this._buildFallbackMesh(scene);
            },
        );
    }

    private _buildFallbackMesh(scene: BABYLON.Scene): void {
        const mat = new BABYLON.PBRMaterial('planePBR', scene);
        mat.albedoColor = new BABYLON.Color3(0.85, 0.88, 0.92);
        mat.metallic = 0.7;
        mat.roughness = 0.25;

        const body = BABYLON.MeshBuilder.CreateBox('body', { width: 2.2, height: 0.65, depth: 7 }, scene);
        const wing = BABYLON.MeshBuilder.CreateBox('wing', { width: 16, height: 0.22, depth: 2.5 }, scene);
        const tail = BABYLON.MeshBuilder.CreateBox('tail', { width: 6, height: 0.18, depth: 1.8 }, scene);
        tail.position.set(0, 0.4, -3.0);
        const finV = BABYLON.MeshBuilder.CreateBox('finV', { width: 0.18, height: 2.8, depth: 2.0 }, scene);
        finV.position.set(0, 1.4, -3.0);
        const nose = BABYLON.MeshBuilder.CreateCylinder('nose', {
            height: 2.5, diameterTop: 0, diameterBottom: 1.5, tessellation: 8,
        }, scene);
        nose.rotation.x = Math.PI / 2;
        nose.position.set(0, 0, 4.5);

        [body, wing, tail, finV, nose].forEach((m) => {
            m.material = mat;
            m.parent = this.planeRoot;
        });
        this.spawned = true;
        this.onSpawned?.();
    }

    // ── Camera ────────────────────────────────────────────────────────────────

    private _buildCamera(scene: BABYLON.Scene): void {
        const canvas = scene.getEngine().getRenderingCanvas();

        this.camera = new BABYLON.ArcRotateCamera(
            'flightCam',
            -Math.PI / 2,
            1.50,
            65,
            this.planeRoot.position.clone(),
            scene,
        );

        this.camera.minZ = 0.5;
        this.camera.maxZ = this.tiles ? 100000 : 5000;
        this.camera.lowerRadiusLimit = 10;
        this.camera.upperRadiusLimit = 500;
        this.camera.inertia = 0.8;
        this.camera.panningSensibility = 0;
        this.camera.wheelPrecision = 10;

        this.camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');

        if (canvas) this.camera.attachControl(canvas, true);

        if (this.isMobile) {
            this.camera.inputs.removeByType('ArcRotateCameraPointersInput');
        }

        scene.activeCamera = this.camera;
    }

    // ── Post-Processing ───────────────────────────────────────────────────────

    private _setupPostProcessing(scene: BABYLON.Scene): void {
        const cam      = scene.activeCamera;
        const pipeline = new BABYLON.DefaultRenderingPipeline('pp', true, scene, cam ? [cam] : []);
        pipeline.samples        = 8;
        pipeline.bloomEnabled   = true;
        pipeline.bloomWeight    = 0.4;
        pipeline.bloomKernel    = 128;
        pipeline.bloomScale     = 0.5;
        pipeline.bloomThreshold = 0.8;
        pipeline.chromaticAberrationEnabled            = true;
        pipeline.chromaticAberration.aberrationAmount   = 0.8;
        pipeline.chromaticAberration.radialIntensity    = 1.0;
        pipeline.sharpenEnabled        = true;
        pipeline.sharpen.edgeAmount    = 0.2;
        pipeline.imageProcessingEnabled                 = true;
        pipeline.imageProcessing.toneMappingEnabled     = true;
        pipeline.imageProcessing.toneMappingType        = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
        pipeline.imageProcessing.exposure               = 1.0;
        pipeline.imageProcessing.contrast               = 1.08;
        pipeline.imageProcessing.vignetteEnabled        = true;
        pipeline.imageProcessing.vignetteWeight         = 2.2;
        pipeline.imageProcessing.vignetteColor          = new BABYLON.Color4(0, 0, 0, 0);
        pipeline.imageProcessing.vignetteBlendMode      = BABYLON.ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;

        const ssao = new BABYLON.SSAO2RenderingPipeline('ssao', scene, {
            ssaoRatio: 0.5,
            blurRatio: 0.5,
        });
        ssao.radius = 3.0;
        ssao.totalStrength = 1.2;
        ssao.base = 0.1;
        ssao.samples = 16;
        ssao.maxZ = 250;
        ssao.minZAspect = 0.5;
        if (cam) scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline('ssao', cam);

        const sun = scene.getLightByName('sun');
        if (sun) {
            const lfs = new BABYLON.LensFlareSystem('sunFlare', sun, scene);
            lfs.borderLimit = 600;
            ([[0.6, 0], [0.2, 0.4], [0.12, 0.7], [0.3, -0.2]] as [number, number][]).forEach(([size, pos]) => {
                new BABYLON.LensFlare(size, pos, new BABYLON.Color3(1, 0.95, 0.6),
                    'https://assets.babylonjs.com/textures/flare.png', lfs);
            });
        }
    }

    // ── Input ─────────────────────────────────────────────────────────────────

    private _handleInput(_dt: number): void {
        let pitchInput: number;
        let rollInput: number;
        let yawInput: number;

        if (this.isMobile) {
            pitchInput = this.touchPitchInput;
            rollInput = this.touchRollInput * 0.25;
            yawInput = 0;
            this.thrust = this.touchThrust;
        } else {
            const p = (code: string) => this.input.isKeyDown(code);

            if (p('KeyW')) this.thrust = Math.min(1, this.thrust + _dt * 0.55);
            if (p('KeyS')) this.thrust = Math.max(0, this.thrust - _dt * 0.4);

            pitchInput = p('ArrowUp') ? -1 : p('ArrowDown') ? 1 : 0;
            rollInput  = (p('ArrowRight') ? -1 : p('ArrowLeft') ? 1 : 0) * 0.25;
            yawInput   = p('KeyE') ? 1 : p('KeyQ') ? -1 : 0;

            if (p('Digit5') && !this.flapKeyLock5) {
                this.flapKeyLock5 = true;
                this.flapIndex = Math.max(0, this.flapIndex - 1);
            }
            if (!p('Digit5')) this.flapKeyLock5 = false;

            if (p('Digit6') && !this.flapKeyLock6) {
                this.flapKeyLock6 = true;
                this.flapIndex = Math.min(this.FLAP_STEPS.length - 1, this.flapIndex + 1);
            }
            if (!p('Digit6')) this.flapKeyLock6 = false;

            if (p('KeyR')) this._spawnPlane();
        }

        this.surfaces[0].controlInput =  rollInput;
        this.surfaces[1].controlInput = -rollInput;
        this.surfaces[2].controlInput = -pitchInput;
        this.surfaces[3].controlInput = -yawInput;

        this._applyFlaps();
    }

    private _setupTouchControls(): void {
        const overlay = document.createElement('div');
        overlay.id = 'touch-overlay';
        overlay.innerHTML = `
<style>
#touch-overlay{position:fixed;inset:0;pointer-events:none;z-index:150}
#touch-joy{position:absolute;width:120px;height:120px;border-radius:50%;border:none;background:none;display:none;pointer-events:none}
#touch-joy-knob{position:absolute;top:50%;left:50%;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;background:rgba(0,255,128,.2);border:none}
#touch-throttle{position:absolute;bottom:24px;left:16px;width:40px;height:160px;border-radius:20px;border:2px solid rgba(80,255,160,.35);background:rgba(0,20,15,.3);pointer-events:auto;touch-action:none}
#touch-thr-fill{position:absolute;bottom:0;left:0;right:0;height:70%;background:linear-gradient(0deg,rgba(0,255,128,.35),rgba(0,255,128,.1));border-radius:0 0 18px 18px}
#touch-thr-knob{position:absolute;left:50%;transform:translateX(-50%);width:32px;height:10px;border-radius:5px;background:rgba(0,255,128,.5);border:1px solid rgba(0,255,128,.7)}
#touch-flap-btns{position:absolute;bottom:200px;left:12px;display:flex;flex-direction:column;gap:6px;pointer-events:auto}
#touch-flap-btns button{width:48px;height:32px;border-radius:6px;border:1px solid rgba(80,255,160,.4);background:rgba(0,20,15,.5);color:#7df9c8;font-family:'Orbitron',monospace;font-size:10px;cursor:pointer;touch-action:manipulation}
</style>
<div id="touch-joy"><div id="touch-joy-knob"></div></div>
<div id="touch-throttle"><div id="touch-thr-fill"></div><div id="touch-thr-knob"></div></div>
<div id="touch-flap-btns"><button id="touch-flap-up">F+</button><button id="touch-flap-dn">F\u2212</button></div>`;
        document.body.appendChild(overlay);

        const joyEl = document.getElementById('touch-joy')!;
        const knob = document.getElementById('touch-joy-knob')!;
        const throttleEl = document.getElementById('touch-throttle')!;
        const thrFill = document.getElementById('touch-thr-fill')!;
        const thrKnob = document.getElementById('touch-thr-knob')!;
        const maxDrag = 80;

        const updateThrVisual = () => {
            const pct = this.touchThrust * 100;
            thrFill.style.height = `${pct}%`;
            thrKnob.style.bottom = `${pct}%`;
        };
        updateThrVisual();

        const isOnWidget = (t: Touch): boolean => {
            const el = document.elementFromPoint(t.clientX, t.clientY);
            if (!el) return false;
            return !!el.closest('#touch-throttle,#touch-flap-btns');
        };

        const canvas = this.scene!.getEngine().getRenderingCanvas()!;
        canvas.style.touchAction = 'none';

        canvas.addEventListener('touchstart', (e: TouchEvent) => {
            for (let i = 0; i < e.changedTouches.length; i++) {
                const t = e.changedTouches[i];
                if (isOnWidget(t)) continue;
                if (this.joystickTouchId !== null) continue;
                this.joystickTouchId = t.identifier;
                this.joystickOrigin = { x: t.clientX, y: t.clientY };
                joyEl.style.display = 'block';
                joyEl.style.left = `${t.clientX - 60}px`;
                joyEl.style.top = `${t.clientY - 60}px`;
                knob.style.left = '50%';
                knob.style.top = '50%';
                e.preventDefault();
            }
        }, { passive: false });

        canvas.addEventListener('touchmove', (e: TouchEvent) => {
            for (let i = 0; i < e.changedTouches.length; i++) {
                const t = e.changedTouches[i];
                if (t.identifier !== this.joystickTouchId) continue;
                const dx = t.clientX - this.joystickOrigin.x;
                const dy = t.clientY - this.joystickOrigin.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const clamped = Math.min(dist, maxDrag);
                const angle = Math.atan2(dy, dx);
                const nx = (clamped * Math.cos(angle)) / maxDrag;
                const ny = (clamped * Math.sin(angle)) / maxDrag;
                this.touchRollInput = -nx;
                this.touchPitchInput = -ny;
                knob.style.left = `${50 + nx * 35}%`;
                knob.style.top = `${50 + ny * 35}%`;
            }
            e.preventDefault();
        }, { passive: false });

        const resetJoy = (e: TouchEvent) => {
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === this.joystickTouchId) {
                    this.joystickTouchId = null;
                    this.touchPitchInput = 0;
                    this.touchRollInput = 0;
                    joyEl.style.display = 'none';
                    knob.style.left = '50%';
                    knob.style.top = '50%';
                }
            }
        };
        canvas.addEventListener('touchend', resetJoy);
        canvas.addEventListener('touchcancel', resetJoy);

        throttleEl.addEventListener('touchstart', (e: TouchEvent) => {
            if (this.throttleTouchId !== null) return;
            this.throttleTouchId = e.changedTouches[0].identifier;
            e.preventDefault();
        }, { passive: false });

        throttleEl.addEventListener('touchmove', (e: TouchEvent) => {
            for (let i = 0; i < e.changedTouches.length; i++) {
                const t = e.changedTouches[i];
                if (t.identifier !== this.throttleTouchId) continue;
                const rect = throttleEl.getBoundingClientRect();
                const pct = 1 - Math.max(0, Math.min(1, (t.clientY - rect.top) / rect.height));
                this.touchThrust = pct;
                updateThrVisual();
            }
            e.preventDefault();
        }, { passive: false });

        const resetThr = (e: TouchEvent) => {
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === this.throttleTouchId) {
                    this.throttleTouchId = null;
                }
            }
        };
        throttleEl.addEventListener('touchend', resetThr);
        throttleEl.addEventListener('touchcancel', resetThr);

        document.getElementById('touch-flap-up')!.addEventListener('touchstart', () => {
            this.flapIndex = Math.min(this.FLAP_STEPS.length - 1, this.flapIndex + 1);
        });
        document.getElementById('touch-flap-dn')!.addEventListener('touchstart', () => {
            this.flapIndex = Math.max(0, this.flapIndex - 1);
        });
    }

    private _spawnPlane(): void {
        if (!this.planeRoot) return;
        const yawRad = (180 - this.initialHeading) * Math.PI / 180;
        BABYLON.Quaternion.RotationAxisToRef(BABYLON.Vector3.Up(), yawRad, this.planeRoot.rotationQuaternion!);
        this.angularVelocity.set(0, 0, 0);
        if (this.spawnAirborne) {
            this.planeRoot.position.set(0, GROUND_Y + 600, 0);
            this.thrust = 0.7;
            this.flapIndex = 0;
            this.currentFlapDeg = 0;
            const rotMat = new BABYLON.Matrix();
            BABYLON.Matrix.FromQuaternionToRef(this.planeRoot.rotationQuaternion!, rotMat);
            const fwd = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0, 0, 1), rotMat);
            this.velocity = fwd.scale(100);
        } else {
            this.planeRoot.position.set(0, GROUND_Y, 0);
            this.velocity.set(0, 0, 0);
            this.thrust = 0;
            this.flapIndex = 2;
            this.currentFlapDeg = 15;
        }
    }

    private _initFlapBar(): void {}
    private _updateFlapDisplay(): void {}

    private _applyFlaps(): void {
        const targetDeg = this.FLAP_STEPS[this.flapIndex];
        const rate = 5;
        if (this.currentFlapDeg < targetDeg) this.currentFlapDeg = Math.min(targetDeg, this.currentFlapDeg + rate * 0.016);
        if (this.currentFlapDeg > targetDeg) this.currentFlapDeg = Math.max(targetDeg, this.currentFlapDeg - rate * 0.016);

        const flapRad = this.currentFlapDeg * Math.PI / 180;
        const zeroLiftShift = -flapRad * 0.04;
        const extraFriction = this.currentFlapDeg * 0.0008;
        const stallBoost = this.currentFlapDeg * 0.0008;

        for (let i = 0; i < 2; i++) {
            this.surfaces[i].zeroLiftAoA  = this.baseZeroLiftAoA + zeroLiftShift;
            this.surfaces[i].skinFriction = SKIN_FRICTION + extraFriction;
            this.surfaces[i].stallAlpha   = STALL_ALPHA_RAD + stallBoost;
        }
    }

    // ── Aerodynamic surfaces ────────────────────────────────────────────────────

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
            mk([-3, 0, -0.5], [0, 1, 0], 38, 2.5, 7.5, -0.035, 0.15),
            mk([ 3, 0, -0.5], [0, 1, 0], 38, 2.5, 7.5, -0.035, 0.15),
            mk([ 0, 0, -7],   [0, 1, 0], 7.2,   1.8, 2.2,  0,     0.35),
            mk([ 0, 1.5, -7], [1, 0, 0], 7.0,   2.0, 1.75, 0,     0.35),
        ];
    }

    // ── Physics (component-based aero with substep) ───────────────────────────

    private _applyPhysics(dt: number): void {
        const orientation = this.planeRoot.rotationQuaternion!;
        const pos         = this.planeRoot.position;

        const altitude = pos.y;
        const airDensity = getAirDensity(altitude);

        const rotMatrix = new BABYLON.Matrix();
        BABYLON.Matrix.FromQuaternionToRef(orientation, rotMatrix);
        const invRotMatrix = new BABYLON.Matrix();
        rotMatrix.invertToRef(invRotMatrix);

        const toWorld = (v: BABYLON.Vector3) => BABYLON.Vector3.TransformNormal(v, rotMatrix);
        const toBody  = (v: BABYLON.Vector3) => BABYLON.Vector3.TransformNormal(v, invRotMatrix);

        const computeForces = (vel: BABYLON.Vector3, angVel: BABYLON.Vector3) => {
            const totalForce  = BABYLON.Vector3.Zero();
            const totalTorque = BABYLON.Vector3.Zero();

            const gravDir = new BABYLON.Vector3(0, -1, 0);
            totalForce.addInPlace(gravDir.scale(MASS * G_ACCEL));

            totalForce.addInPlace(
                toWorld(new BABYLON.Vector3(0, 0, this.thrust * MAX_THRUST_N)),
            );

            const bodyVel = toBody(vel);
            for (const surface of this.surfaces) {
                const pointVel = bodyVel.add(BABYLON.Vector3.Cross(angVel, surface.position));
                const { force, torque } = computeSurfaceForces(surface, pointVel, airDensity);
                totalForce.addInPlace(toWorld(force));
                totalTorque.addInPlace(torque);
            }

            return { force: totalForce, torque: totalTorque };
        };

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

        this.velocity.addInPlace(avgForce.scale(dt / MASS));
        pos.addInPlace(this.velocity.scale(dt));

        const Iw2   = new BABYLON.Vector3(Ixx * this.angularVelocity.x, Iyy * this.angularVelocity.y, Izz * this.angularVelocity.z);
        const gyro2 = BABYLON.Vector3.Cross(this.angularVelocity, Iw2);
        const angAcc = new BABYLON.Vector3(
            (avgTorque.x - gyro2.x) / Ixx,
            (avgTorque.y - gyro2.y) / Iyy,
            (avgTorque.z - gyro2.z) / Izz,
        );
        this.angularVelocity.addInPlace(angAcc.scale(dt));
        this.angularVelocity.scaleInPlace(Math.max(0, 1 - ANGULAR_DAMPING * dt));

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

        if (this.tiles) {
            const ray = new BABYLON.Ray(
                new BABYLON.Vector3(pos.x, pos.y + 200, pos.z),
                new BABYLON.Vector3(0, -1, 0),
                1000,
            );
            const hit = this.scene.pickWithRay(ray, (mesh: BABYLON.AbstractMesh) =>
                mesh.isPickable && !mesh.isDescendantOf(this.planeRoot) && mesh.name !== 'ground',
            );
            if (hit?.hit && hit.pickedPoint) {
                this.terrainY = hit.pickedPoint.y + 3;
            }
        }

        const groundLevel = this.tiles ? this.terrainY : GROUND_Y;
        if (pos.y <= groundLevel) {
            pos.y = groundLevel;
            const downSpeed = this.velocity.y;
            if (downSpeed < 0) {
                this.velocity.y = 0;
                if (downSpeed < -5) {
                    this.velocity.scaleInPlace(0.97);
                    this.angularVelocity.scaleInPlace(0.5);
                }
            }
        }

        this.camera.target.copyFrom(pos);

        const wm = this.planeRoot.getWorldMatrix();
        const fwd = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0, 0, 1), wm);
        const targetAlpha = Math.atan2(-fwd.z, -fwd.x);
        let da = targetAlpha - this.camera.alpha;
        da = ((da + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
        this.camera.alpha += da * Math.min(1, 3 * dt);

        if (this.ground) {
            this.ground.position.x = pos.x;
            this.ground.position.z = pos.z;
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
.hp{position:absolute}
#hl,#hr{display:none}
#hfps{font-size:10px;color:rgba(100,240,180,.4);font-family:'Inter',sans-serif}
#hw{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(255,30,0,.12);border:1px solid rgba(255,60,0,.7);border-radius:10px;color:#ff5500;font-size:20px;letter-spacing:.2em;text-align:center;padding:16px 36px;display:none;animation:blink .7s steps(2) infinite}
@keyframes blink{to{opacity:0}}
#bottom-bar{
display:flex;position:absolute;bottom:0;left:0;right:0;z-index:101;
padding:10px 24px 12px;
background:linear-gradient(0deg,rgba(0,10,8,.85) 0%,rgba(0,10,8,0) 100%);
justify-content:space-between;align-items:flex-end;pointer-events:none;
font-family:'Orbitron',monospace;color:#7df9c8;
}
#bottom-bar .bb-col{display:flex;flex-direction:column;align-items:center;gap:2px}
#bottom-bar .bb-val{font-size:26px;font-weight:700;text-shadow:0 0 10px rgba(0,255,128,.7),0 1px 3px rgba(0,0,0,.9);letter-spacing:.04em}
#bottom-bar .bb-lbl{font-size:8px;letter-spacing:.2em;color:rgba(100,240,180,.6);font-family:'Inter',sans-serif;text-transform:uppercase}
#bottom-bar .bb-unit{font-size:11px;font-weight:400;opacity:.55}
#bottom-bar .bb-att{font-size:13px;letter-spacing:.1em;text-shadow:0 0 8px rgba(0,255,128,.5),0 1px 3px rgba(0,0,0,.9)}
#bottom-bar .bb-thr{width:70px;height:5px;background:rgba(0,80,40,.6);border-radius:3px;overflow:hidden;margin-top:3px}
#bottom-bar .bb-thr-f{height:100%;background:linear-gradient(90deg,#00cc66,#00ffaa);border-radius:3px;transition:width .08s linear}
@media(max-width:768px){
#hfps{display:none}
#dbg-panel-toggle{display:none!important}
#flight-pfd{top:28%!important;transform:translate(-50%,-50%)!important;width:260px;height:220px}
#gps-map{width:100px!important;height:100px!important;top:6px!important;left:4px!important}
#bottom-bar .bb-val{font-size:20px}
#bottom-bar .bb-lbl{font-size:7px}
#bottom-bar .bb-att{font-size:11px}
#bottom-bar{padding:8px 12px 10px}
}

</style>
<div class="hp" id="hl"></div>
<div class="hp" id="hr"></div>
<div style="position:absolute;top:20px;right:20px;display:flex;flex-direction:column;align-items:flex-end;gap:2px;font-size:10px;font-family:'Inter',sans-serif;padding:5px 10px">
  <div id="hfps" style="color:rgba(100,240,180,.4)"></div>
  <div id="h-online" style="color:rgba(100,240,180,.4)">0 ONLINE</div>
</div>
<div class="hp" id="hw">&#9888; STALL &#9888;</div>
<div id="bottom-bar">
  <div class="bb-col">
    <div class="bb-lbl">SPEED</div>
    <div class="bb-val" id="bb-spd">0 <span class="bb-unit">km/h</span></div>
    <div class="bb-thr"><div class="bb-thr-f" id="bb-thr" style="width:0%"></div></div>
  </div>
  <div class="bb-col">
    <div class="bb-lbl">FLAPS <span style="font-size:6px;opacity:.4">5↓ 6↑</span></div>
    <div class="bb-val" style="font-size:18px" id="bb-flp">0&deg;</div>
  </div>
  <div class="bb-col">
    <div class="bb-att" id="bb-att">&#9654; LEVEL</div>
  </div>
  <div class="bb-col">
    <div class="bb-lbl">ALT</div>
    <div class="bb-val" id="bb-alt">0 <span class="bb-unit">m</span></div>
  </div>
</div>
<canvas id="flight-pfd" width="350" height="300" style="position:absolute;top:50px;left:50%;transform:translateX(-50%);pointer-events:none"></canvas>
<div id="gps-map" style="position:absolute;top:20px;left:8px;width:160px;height:160px;border-radius:10px;overflow:hidden;border:2px solid rgba(80,255,160,.35);box-shadow:0 0 20px rgba(0,255,128,.12);background:rgba(0,20,15,.6)">
  <img id="gps-map-img" style="width:100%;height:100%;object-fit:cover;opacity:0.9">
  <canvas id="gps-map-hdg" width="160" height="160" style="position:absolute;inset:0;pointer-events:none"></canvas>
  <div style="position:absolute;top:6px;left:50%;transform:translateX(-50%);font-size:8px;letter-spacing:.15em;color:rgba(100,240,180,.6);font-family:'Inter',sans-serif;text-shadow:0 0 4px rgba(0,0,0,.8)">GPS</div>
  <div id="gps-coords" style="position:absolute;bottom:4px;left:50%;transform:translateX(-50%);font-size:8px;color:rgba(100,240,180,.6);font-family:'Inter',sans-serif;text-shadow:0 0 4px rgba(0,0,0,.8);white-space:nowrap"></div>
</div>`;
        document.body.appendChild(hud);
        this.hudCanvas = document.getElementById('flight-pfd') as HTMLCanvasElement;
        this.hudCtx    = this.hudCanvas.getContext('2d')!;
        this.hudSpeed    = document.getElementById('bb-spd')!;
        this.hudAlt      = document.getElementById('bb-alt')!;
        this.hudThrottle = document.getElementById('bb-thr')!;
        this.hudAttitude = document.getElementById('bb-att')!;
        this.hudWarning  = document.getElementById('hw')!;
        this.hudFps      = document.getElementById('hfps')!;
        this.hudOnline   = document.getElementById('h-online')!;
        this.hudFlapVal  = document.getElementById('bb-flp')!;
        this.hudFlapBar  = document.getElementById('bb-flp')!;
        this.mapImg      = document.getElementById('gps-map-img') as HTMLImageElement;
        this.mapHeadingCanvas = document.getElementById('gps-map-hdg') as HTMLCanvasElement;

        this._initFlapBar();
        this._buildDebugPanel();
    }

    // ── Debug Panel ───────────────────────────────────────────────────────────

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
  <div class="dbg-row"><span class="dbg-lbl">POS (x,y,z)</span><span class="dbg-val" id="dbg-ppos">\u2014</span></div>
  <div class="dbg-row"><span class="dbg-lbl">ROT (H,P,R)</span><span class="dbg-val" id="dbg-prot">\u2014</span></div>
  <div class="dbg-row"><span class="dbg-lbl">VEL (km/h)</span><span class="dbg-val" id="dbg-pvel">\u2014</span></div>
</div>
<div class="dbg-section">
  <div class="dbg-title">CAMERA</div>
  <div class="dbg-row"><span class="dbg-lbl">POS (x,y,z)</span><span class="dbg-val" id="dbg-cpos">\u2014</span></div>
  <div class="dbg-row"><span class="dbg-lbl">\u03B1 / \u03B2 / R</span><span class="dbg-val" id="dbg-corbit">\u2014</span></div>
</div>
<div class="dbg-ctrl">
  <div class="dbg-title">CAMERA CTRL</div>
  <div class="dbg-slider-row"><label>Radius</label><input type="range" id="dbg-cr" min="10" max="500" value="65"><span class="dbg-sv" id="dbg-crv">65</span></div>
  <div class="dbg-slider-row"><label>Height \u03B2</label><input type="range" id="dbg-cb" min="0" max="314" value="150"><span class="dbg-sv" id="dbg-cbv">1.50</span></div>
</div>
<div class="dbg-ctrl">
  <div class="dbg-title">AIRPLANE CTRL</div>
  <div class="dbg-slider-row"><label>Heading</label><input type="range" id="dbg-ph" min="0" max="360" value="0"><span class="dbg-sv" id="dbg-phv">0\u00B0</span></div>
  <div class="dbg-slider-row"><label>Pitch</label><input type="range" id="dbg-pp" min="-180" max="180" value="0"><span class="dbg-sv" id="dbg-ppv">0\u00B0</span></div>
  <div class="dbg-slider-row"><label>Roll</label><input type="range" id="dbg-pr" min="-180" max="180" value="0"><span class="dbg-sv" id="dbg-prv">0\u00B0</span></div>
</div>
<div class="dbg-section">
  <div class="dbg-title">MULTIPLAYER</div>
  <div class="dbg-row"><span class="dbg-lbl">Status</span><span class="dbg-val" id="dbg-mp-status">DISCONNECTED</span></div>
  <div class="dbg-row"><span class="dbg-lbl">Online</span><span class="dbg-val" id="dbg-mp-count">0</span></div>
  <div class="dbg-row"><span class="dbg-lbl">User ID</span><span class="dbg-val" id="dbg-mp-uid">\u2014</span></div>
</div>`;
        document.body.appendChild(panel);
        this.dbgPanel    = panel;
        this.dbgPlanePos = document.getElementById('dbg-ppos')!;
        this.dbgPlaneRot = document.getElementById('dbg-prot')!;
        this.dbgPlaneVel = document.getElementById('dbg-pvel')!;
        this.dbgCamPos   = document.getElementById('dbg-cpos')!;
        this.dbgCamOrbit = document.getElementById('dbg-corbit')!;
        this.dbgMpStatus = document.getElementById('dbg-mp-status')!;
        this.dbgMpCount  = document.getElementById('dbg-mp-count')!;
        this.dbgMpUserId = document.getElementById('dbg-mp-uid')!;

        panel.classList.add('hidden');

        const toggleBtn = document.createElement('div');
        toggleBtn.id = 'dbg-panel-toggle';
        toggleBtn.textContent = 'SHOW DEBUG';
        toggleBtn.style.display = 'block';
        document.body.appendChild(toggleBtn);

        toggleBtn.addEventListener('click', () => {
            panel.classList.toggle('hidden');
            toggleBtn.textContent = panel.classList.contains('hidden') ? 'SHOW DEBUG' : 'HIDE DEBUG';
        });

        document.getElementById('dbg-cr')!.addEventListener('input', (e: any) => {
            const v = parseFloat(e.target.value);
            if (this.camera) this.camera.radius = v;
            document.getElementById('dbg-crv')!.textContent = String(v);
        });

        document.getElementById('dbg-cb')!.addEventListener('input', (e: any) => {
            const v = parseFloat(e.target.value) / 100;
            if (this.camera) this.camera.beta = v;
            document.getElementById('dbg-cbv')!.textContent = v.toFixed(2);
        });

        const rotHandler = () => this._applyDebugRotation();

        document.getElementById('dbg-ph')!.addEventListener('input', (e: any) => {
            document.getElementById('dbg-phv')!.textContent = `${e.target.value}\u00B0`;
            rotHandler();
        });
        document.getElementById('dbg-pp')!.addEventListener('input', (e: any) => {
            document.getElementById('dbg-ppv')!.textContent = `${e.target.value}\u00B0`;
            rotHandler();
        });
        document.getElementById('dbg-pr')!.addEventListener('input', (e: any) => {
            document.getElementById('dbg-prv')!.textContent = `${e.target.value}\u00B0`;
            rotHandler();
        });
    }

    private _applyDebugRotation(): void {
        const hDeg = parseFloat((document.getElementById('dbg-ph') as HTMLInputElement).value);
        const pDeg = parseFloat((document.getElementById('dbg-pp') as HTMLInputElement).value);
        const rDeg = parseFloat((document.getElementById('dbg-pr') as HTMLInputElement).value);

        this.planeRoot.rotationQuaternion!.set(0, 0, 0, 1);

        const hq = BABYLON.Quaternion.RotationAxis(new BABYLON.Vector3(0, 1, 0), (hDeg * Math.PI) / 180);
        const pq = BABYLON.Quaternion.RotationAxis(new BABYLON.Vector3(1, 0, 0), (pDeg * Math.PI) / 180);
        const rq = BABYLON.Quaternion.RotationAxis(new BABYLON.Vector3(0, 0, 1), (rDeg * Math.PI) / 180);

        this.planeRoot.rotationQuaternion = this.planeRoot.rotationQuaternion!
            .multiply(hq)
            .multiply(pq)
            .multiply(rq);

        this.angularVelocity.set(0, 0, 0);
        this.velocity.set(0, 0, 0);
    }

    // ── GPS Minimap ─────────────────────────────────────────────────────────────

    private _getCurrentLatLon(): { lat: number; lon: number; hdg: number } {
        const pos = this.planeRoot.position;
        const metersPerDegLat = 111320;
        const metersPerDegLon = 111320 * Math.cos(this.originLat * Math.PI / 180);
        const lat = this.originLat - pos.z / metersPerDegLat;
        const lon = this.originLon + pos.x / metersPerDegLon;

        const wm = this.planeRoot.getWorldMatrix();
        const fwd = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0, 0, 1), wm);
        const hdg = ((Math.atan2(fwd.x, -fwd.z) * 180 / Math.PI) + 360) % 360;
        return { lat, lon, hdg };
    }

    private _updateMap(): void {
        if (!this.mapImg) return;
        const now = performance.now();
        const { lat, lon, hdg } = this._getCurrentLatLon();

        if (this.mapApiKey && now - this.mapLastUpdate > 1000) {
            this.mapLastUpdate = now;
            this.mapImg.src = `https://maps.googleapis.com/maps/api/staticmap?center=${lat.toFixed(6)},${lon.toFixed(6)}&zoom=13&size=300x300&scale=2&maptype=satellite&key=${this.mapApiKey}`;
        }

        const cv = this.mapHeadingCanvas;
        const ctx = cv.getContext('2d')!;
        const cx = cv.width / 2;
        const cy = cv.height / 2;
        ctx.clearRect(0, 0, cv.width, cv.height);

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(hdg * Math.PI / 180);

        ctx.fillStyle = 'rgba(0,255,128,0.9)';
        ctx.beginPath();
        ctx.moveTo(0, -14);
        ctx.lineTo(-7, 10);
        ctx.lineTo(0, 5);
        ctx.lineTo(7, 10);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = 'rgba(0,255,128,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-10, 2);
        ctx.lineTo(-5, 2);
        ctx.moveTo(5, 2);
        ctx.lineTo(10, 2);
        ctx.stroke();

        ctx.restore();

        const coordsEl = document.getElementById('gps-coords');
        if (coordsEl) coordsEl.textContent = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    }

    // ── HUD Update ────────────────────────────────────────────────────────────

    private _updateHUD(): void {
        const speed = Math.round(this.velocity.length() * 3.6);
        const pos = this.planeRoot.position;
        const altitude = Math.round(Math.max(0, pos.y));
        const pct = Math.round(this.thrust * 100);

        this.hudSpeed.innerHTML    = `${speed} <span class="bb-unit">km/h</span>`;
        this.hudAlt.innerHTML      = `${altitude} <span class="bb-unit">m</span>`;
        this.hudThrottle.style.width = `${pct}%`;
        this.hudFlapVal.innerHTML  = `${this.FLAP_STEPS[this.flapIndex]}&deg;`;

        const wm      = this.planeRoot.getWorldMatrix();
        const forward = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0, 0, 1), wm).normalize();
        const surfaceUp = new BABYLON.Vector3(0, 1, 0);
        const pitchAngle = Math.asin(Math.max(-1, Math.min(1, BABYLON.Vector3.Dot(forward, surfaceUp))));

        const isOnGround = altitude < 5;

        this.hudAttitude.textContent =
            isOnGround         ? '\u25B6 GROUND'   :
            pitchAngle > 0.08  ? '\u25B2 CLIMBING' :
            pitchAngle < -0.08 ? '\u25BC DIVING'   : '\u25B6 LEVEL';
        this.hudWarning.style.display =
            (speed < STALL_SPEED_HUD && altitude > 20) ? 'block' : 'none';

        this.hudFps.textContent =
            `${this.scene?.getEngine?.()?.getFps?.()?.toFixed(0) ?? '--'} FPS`;

        this._drawFlightHUD();
        this._updateMap();
        this._updateDebugReadouts();
    }

    private _drawFlightHUD(): void {
        const ctx = this.hudCtx;
        if (!ctx) return;
        const W = this.hudCanvas.width;
        const H = this.hudCanvas.height;
        const cx = W / 2;
        const cy = H / 2;
        ctx.clearRect(0, 0, W, H);

        const wm = this.planeRoot.getWorldMatrix();
        const fwd   = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0, 0, 1), wm).normalize();
        const right = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(1, 0, 0), wm).normalize();
        const up    = new BABYLON.Vector3(0, 1, 0);

        const pitchRad = Math.asin(Math.max(-1, Math.min(1, BABYLON.Vector3.Dot(fwd, up))));
        const rollRad  = Math.asin(Math.max(-1, Math.min(1, BABYLON.Vector3.Dot(right, up))));
        const pitchDeg = pitchRad * 180 / Math.PI;
        const rollDeg  = rollRad * 180 / Math.PI;

        const fwdFlat = fwd.subtract(up.scale(BABYLON.Vector3.Dot(fwd, up)));
        if (fwdFlat.lengthSquared() > 0.0001) fwdFlat.normalize();
        const hdgRad = Math.atan2(
            BABYLON.Vector3.Dot(fwdFlat, new BABYLON.Vector3(1, 0, 0)),
            BABYLON.Vector3.Dot(fwdFlat, new BABYLON.Vector3(0, 0, 1)),
        );
        const hdgDeg = ((hdgRad * 180 / Math.PI) + 360) % 360;

        const speed    = Math.round(this.velocity.length() * 3.6);
        const pPos = this.planeRoot.position;
        const altitude = Math.round(Math.max(0, pPos.y));
        const ppd = 4;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rollRad);

        const horizonY = pitchDeg * ppd;
        const attR = 100;
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, attR, 0, Math.PI * 2);
        ctx.clip();
        ctx.fillStyle = 'rgba(30,120,220,0.12)';
        ctx.fillRect(-attR, -attR, attR * 2, horizonY + attR);
        ctx.fillStyle = 'rgba(120,80,30,0.10)';
        ctx.fillRect(-attR, horizonY, attR * 2, attR * 2);
        ctx.restore();

        ctx.strokeStyle = 'rgba(0,255,100,0.9)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-160, horizonY);
        ctx.lineTo(-30, horizonY);
        ctx.moveTo(30, horizonY);
        ctx.lineTo(160, horizonY);
        ctx.stroke();

        ctx.restore();

        ctx.save();
        ctx.translate(cx, cy);
        ctx.strokeStyle = 'rgba(0,255,100,0.6)';
        ctx.lineWidth = 1;
        ctx.font = '10px monospace';
        ctx.fillStyle = 'rgba(0,255,100,0.7)';
        ctx.textAlign = 'center';

        for (let deg = -90; deg <= 90; deg += 5) {
            if (deg === 0) continue;
            const yOff = (pitchDeg - deg) * ppd;
            if (Math.abs(yOff) > cy - 20) continue;

            const halfW = deg % 10 === 0 ? 55 : 30;
            const isDashed = deg < 0;

            ctx.beginPath();
            if (isDashed) {
                for (let x = -halfW; x < halfW; x += 12) {
                    ctx.moveTo(x, yOff);
                    ctx.lineTo(Math.min(x + 7, halfW), yOff);
                }
            } else {
                ctx.moveTo(-halfW, yOff);
                ctx.lineTo(halfW, yOff);
            }

            if (deg % 10 === 0) {
                const tickH = deg < 0 ? -5 : 5;
                ctx.moveTo(-halfW, yOff);
                ctx.lineTo(-halfW, yOff + tickH);
                ctx.moveTo(halfW, yOff);
                ctx.lineTo(halfW, yOff + tickH);
            }
            ctx.stroke();

            if (deg % 10 === 0) {
                ctx.fillText(`${deg}`, -halfW - 16, yOff + 3);
                ctx.fillText(`${deg}`, halfW + 16, yOff + 3);
            }
        }

        ctx.restore();

        ctx.strokeStyle = 'rgba(0,255,100,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - 120, cy);
        ctx.lineTo(cx - 20, cy);
        ctx.lineTo(cx - 20, cy + 8);
        ctx.moveTo(cx + 20, cy);
        ctx.lineTo(cx + 120, cy);
        ctx.moveTo(cx + 20, cy);
        ctx.lineTo(cx + 20, cy + 8);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.moveTo(cx, cy - 6);
        ctx.lineTo(cx, cy - 2);
        ctx.stroke();

        const bankR = 80;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.strokeStyle = 'rgba(0,255,100,0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, bankR, Math.PI + 0.35, -0.35);
        ctx.stroke();
        for (const a of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
            const rad = (-90 + a) * Math.PI / 180;
            const inner = a % 30 === 0 ? bankR - 10 : bankR - 6;
            ctx.beginPath();
            ctx.moveTo(Math.cos(rad) * inner, Math.sin(rad) * inner);
            ctx.lineTo(Math.cos(rad) * bankR, Math.sin(rad) * bankR);
            ctx.stroke();
        }
        const bankPtr = (-90 - rollDeg) * Math.PI / 180;
        ctx.fillStyle = 'rgba(0,255,100,0.8)';
        ctx.beginPath();
        ctx.moveTo(Math.cos(bankPtr) * (bankR + 2), Math.sin(bankPtr) * (bankR + 2));
        ctx.lineTo(Math.cos(bankPtr - 0.06) * (bankR + 10), Math.sin(bankPtr - 0.06) * (bankR + 10));
        ctx.lineTo(Math.cos(bankPtr + 0.06) * (bankR + 10), Math.sin(bankPtr + 0.06) * (bankR + 10));
        ctx.fill();
        ctx.restore();

        ctx.fillStyle = 'rgba(0,255,100,0.85)';
        ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'center';

        const hdgY = 18;
        ctx.strokeStyle = 'rgba(0,255,100,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - 100, hdgY + 6);
        ctx.lineTo(cx + 100, hdgY + 6);
        ctx.stroke();

        const hdgLabels = ['N', '30', '60', 'E', '120', '150', 'S', '210', '240', 'W', '300', '330'];
        for (let d = -60; d <= 60; d += 10) {
            const showDeg = (Math.round(hdgDeg / 10) * 10 + d + 360) % 360;
            const xOff = cx + (d - (hdgDeg % 10 - (hdgDeg % 10 > 5 ? 10 : 0))) * 2.5;
            if (xOff < cx - 100 || xOff > cx + 100) continue;

            ctx.beginPath();
            ctx.moveTo(xOff, hdgY);
            ctx.lineTo(xOff, hdgY + 6);
            ctx.stroke();

            if (showDeg % 30 === 0) {
                const idx = showDeg / 30;
                ctx.fillText(hdgLabels[idx] || `${showDeg}`, xOff, hdgY - 2);
            }
        }

        ctx.fillStyle = 'rgba(0,255,100,0.9)';
        ctx.beginPath();
        ctx.moveTo(cx, hdgY + 8);
        ctx.lineTo(cx - 4, hdgY + 14);
        ctx.lineTo(cx + 4, hdgY + 14);
        ctx.fill();
        ctx.font = 'bold 12px monospace';
        ctx.fillText(`${Math.round(hdgDeg)}\u00B0`, cx, hdgY + 26);

        ctx.fillStyle = 'rgba(0,10,5,0.5)';
        ctx.fillRect(8, cy - 30, 52, 26);
        ctx.fillRect(W - 60, cy - 30, 52, 26);
        ctx.strokeStyle = 'rgba(0,255,100,0.5)';
        ctx.strokeRect(8, cy - 30, 52, 26);
        ctx.strokeRect(W - 60, cy - 30, 52, 26);

        ctx.fillStyle = 'rgba(0,255,100,0.95)';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`${speed}`, 54, cy - 12);
        ctx.textAlign = 'left';
        ctx.fillText(`${altitude}`, W - 54, cy - 12);

        ctx.fillStyle = 'rgba(0,255,100,0.4)';
        ctx.font = '9px monospace';
        ctx.textAlign = 'right';
        ctx.fillText('km/h', 54, cy - 2);
        ctx.textAlign = 'left';
        ctx.fillText('m', W - 54, cy - 2);

        ctx.strokeStyle = 'rgba(0,255,100,0.3)';
        ctx.lineWidth = 1;
        for (let i = -5; i <= 5; i++) {
            const spdMark = Math.round(speed / 10) * 10 + i * 10;
            if (spdMark < 0) continue;
            const yOff = cy - 17 + (speed - spdMark) * 1.5;
            if (yOff < cy - 80 || yOff > cy + 50) continue;
            ctx.beginPath();
            ctx.moveTo(60, yOff);
            ctx.lineTo(66, yOff);
            ctx.stroke();
            if (spdMark % 20 === 0) {
                ctx.fillStyle = 'rgba(0,255,100,0.5)';
                ctx.textAlign = 'right';
                ctx.fillText(`${spdMark}`, 58, yOff + 3);
            }
        }

        for (let i = -5; i <= 5; i++) {
            const altMark = Math.round(altitude / 50) * 50 + i * 50;
            if (altMark < 0) continue;
            const yOff = cy - 17 + (altitude - altMark) * 0.6;
            if (yOff < cy - 80 || yOff > cy + 50) continue;
            ctx.beginPath();
            ctx.moveTo(W - 66, yOff);
            ctx.lineTo(W - 60, yOff);
            ctx.stroke();
            if (altMark % 100 === 0) {
                ctx.fillStyle = 'rgba(0,255,100,0.5)';
                ctx.textAlign = 'left';
                ctx.fillText(`${altMark}`, W - 58, yOff + 3);
            }
        }
    }

    private _updateDebugReadouts(): void {
        if (!this.dbgPlanePos) return;

        const pos = this.planeRoot.position;
        this.dbgPlanePos.textContent = `${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}`;

        const q = this.planeRoot.rotationQuaternion;
        if (q) {
            const surfaceUp = new BABYLON.Vector3(0, 1, 0);
            const wm = this.planeRoot.getWorldMatrix();
            const fwd = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0, 0, 1), wm).normalize();
            const right = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(1, 0, 0), wm).normalize();

            const pitch = Math.asin(Math.max(-1, Math.min(1, BABYLON.Vector3.Dot(fwd, surfaceUp))));
            const roll  = Math.asin(Math.max(-1, Math.min(1, BABYLON.Vector3.Dot(right, surfaceUp))));

            const fwdFlat = fwd.subtract(surfaceUp.scale(BABYLON.Vector3.Dot(fwd, surfaceUp)));
            if (fwdFlat.lengthSquared() > 0.0001) fwdFlat.normalize();
            const north = new BABYLON.Vector3(0, 0, 1);
            const east  = new BABYLON.Vector3(1, 0, 0);
            const headingRad = Math.atan2(BABYLON.Vector3.Dot(fwdFlat, east), BABYLON.Vector3.Dot(fwdFlat, north));
            const hDeg = ((headingRad * 180 / Math.PI) + 360) % 360;

            const pDeg = (pitch * 180 / Math.PI);
            const rDeg = (roll * 180 / Math.PI);
            this.dbgPlaneRot.textContent = `H:${hDeg.toFixed(1)}\u00B0 P:${pDeg.toFixed(1)}\u00B0 R:${rDeg.toFixed(1)}\u00B0`;
        }

        const vel = this.velocity;
        this.dbgPlaneVel.textContent = `${(vel.length() * 3.6).toFixed(1)} (${(vel.x * 3.6).toFixed(1)}, ${(vel.y * 3.6).toFixed(1)}, ${(vel.z * 3.6).toFixed(1)})`;

        if (this.camera) {
            const cp = this.camera.position;
            this.dbgCamPos.textContent = `${cp.x.toFixed(0)}, ${cp.y.toFixed(0)}, ${cp.z.toFixed(0)}`;
            this.dbgCamOrbit.textContent = `${(this.camera.alpha * 180 / Math.PI).toFixed(1)}\u00B0 / ${(this.camera.beta * 180 / Math.PI).toFixed(1)}\u00B0 / ${this.camera.radius.toFixed(1)}`;
        }
    }
}
