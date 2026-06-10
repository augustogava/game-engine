import * as BABYLON from '@babylonjs/core';
import type { FabulusScene } from '../FabulusScene.js';
import { AOE_RING_LIFETIME_MS, HIT_FLASH_MS } from '../constants/index.js';

const MARKER_LIFETIME_MS = 500;
const LEVELUP_RING_LIFETIME_MS = 900;
const AURA_LIFETIME_MS = 700;

interface TimedMesh {
    mesh: BABYLON.Mesh;
    bornAt: number;
    lifetimeMs: number;
    growTo: number;
    poolKey: string | null;
    baseAlpha: number;
}

const FLARE_TEX_SIZE = 64;

export class VfxSystem {
    private scene: FabulusScene;
    private timedMeshes: TimedMesh[] = [];
    private flareTexture: BABYLON.DynamicTexture | null = null;
    private ringPools: Map<string, BABYLON.Mesh[]> = new Map();

    constructor(scene: FabulusScene) {
        this.scene = scene;
    }

    init(): void {
        this._buildFlareTexture();
    }

    private _buildFlareTexture(): void {
        const tex = new BABYLON.DynamicTexture('fab_flare_tex', { width: FLARE_TEX_SIZE, height: FLARE_TEX_SIZE }, this.scene.bScene, false);
        const ctx = tex.getContext() as CanvasRenderingContext2D;
        const c = FLARE_TEX_SIZE / 2;
        const gradient = ctx.createRadialGradient(c, c, 0, c, c, c);
        gradient.addColorStop(0, 'rgba(255,255,255,1)');
        gradient.addColorStop(0.4, 'rgba(255,255,255,0.6)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.clearRect(0, 0, FLARE_TEX_SIZE, FLARE_TEX_SIZE);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, FLARE_TEX_SIZE, FLARE_TEX_SIZE);
        tex.update();
        tex.hasAlpha = true;
        this.flareTexture = tex;
    }

    getFlareTexture(): BABYLON.DynamicTexture | null {
        return this.flareTexture;
    }

    private _acquireRing(diameter: number, thickness: number, color: BABYLON.Color3, alpha: number): BABYLON.Mesh {
        const key = `${diameter.toFixed(2)}_${thickness.toFixed(2)}`;
        const pool = this.ringPools.get(key) ?? [];
        let ring = pool.pop();
        if (!ring) {
            ring = BABYLON.MeshBuilder.CreateTorus(`fab_ring_${key}`, { diameter, thickness, tessellation: 32 }, this.scene.bScene);
            ring.isPickable = false;
            const mat = new BABYLON.StandardMaterial(`fab_ring_mat_${key}`, this.scene.bScene);
            mat.disableLighting = true;
            ring.material = mat;
        }
        const mat = ring.material as BABYLON.StandardMaterial;
        mat.emissiveColor = color;
        mat.alpha = alpha;
        ring.scaling.set(1, 1, 1);
        ring.setEnabled(true);
        this.ringPools.set(key, pool);
        return ring;
    }

    private _releaseRing(tm: TimedMesh): void {
        if (!tm.poolKey) {
            tm.mesh.dispose(false, true);
            return;
        }
        tm.mesh.setEnabled(false);
        const pool = this.ringPools.get(tm.poolKey) ?? [];
        pool.push(tm.mesh);
        this.ringPools.set(tm.poolKey, pool);
    }

    private _spawnRing(diameter: number, thickness: number, color: BABYLON.Color3, alpha: number, x: number, y: number, z: number, lifetimeMs: number, growTo: number): void {
        const ring = this._acquireRing(diameter, thickness, color, alpha);
        ring.position.set(x, y, z);
        this.timedMeshes.push({
            mesh: ring, bornAt: this.scene.now(), lifetimeMs, growTo,
            poolKey: `${diameter.toFixed(2)}_${thickness.toFixed(2)}`, baseAlpha: alpha,
        });
    }

    moveMarker(x: number, z: number): void {
        this._spawnRing(0.5, 0.06, new BABYLON.Color3(0.4, 0.9, 0.5), 0.7, x, 0.04, z, MARKER_LIFETIME_MS, 1.6);
    }

    aoeRing(x: number, z: number, radius: number, color: BABYLON.Color3): void {
        this._spawnRing(radius * 0.4, 0.12, color, 0.6, x, 0.06, z, AOE_RING_LIFETIME_MS, radius / (radius * 0.4));
    }

    levelUpBurst(): void {
        const root = this.scene.playerRoot;
        if (!root) return;
        this._spawnRing(0.6, 0.15, new BABYLON.Color3(1.0, 0.85, 0.3), 0.8, root.position.x, 0.08, root.position.z, LEVELUP_RING_LIFETIME_MS, 6);
        this._particleBurst(root.position, new BABYLON.Color4(1, 0.85, 0.3, 1));
    }

    buffAura(color: BABYLON.Color3): void {
        const root = this.scene.playerRoot;
        if (!root) return;
        this._spawnRing(0.8, 0.1, color, 0.5, root.position.x, 0.06, root.position.z, AURA_LIFETIME_MS, 2.2);
    }

    healSparkle(): void {
        const root = this.scene.playerRoot;
        if (!root) return;
        this._particleBurst(root.position, new BABYLON.Color4(0.4, 1.0, 0.5, 1));
    }

    slashArc(x: number, z: number, yaw: number, color: BABYLON.Color3): void {
        const s = this.scene.bScene;
        const disc = BABYLON.MeshBuilder.CreateDisc('fab_slash', { radius: 1.4, arc: 0.4, tessellation: 24, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, s);
        disc.rotation.x = Math.PI / 2;
        disc.rotation.y = yaw - Math.PI * 0.4;
        disc.position.set(x, 1.0, z);
        disc.isPickable = false;
        const mat = new BABYLON.StandardMaterial('fab_slash_mat', s);
        mat.emissiveColor = color;
        mat.alpha = 0.65;
        mat.disableLighting = true;
        mat.backFaceCulling = false;
        disc.material = mat;
        this.timedMeshes.push({ mesh: disc, bornAt: this.scene.now(), lifetimeMs: 180, growTo: 1.5, poolKey: null, baseAlpha: 0.65 });
    }

    deathBurst(position: BABYLON.Vector3): void {
        this._particleBurst(position, new BABYLON.Color4(0.65, 0.12, 0.08, 1));
        this.impactDecal(position.x, position.z, 0.9);
    }

    goldSparkle(position: BABYLON.Vector3): void {
        this._particleBurst(position, new BABYLON.Color4(1.0, 0.85, 0.3, 1));
    }

    impactDecal(x: number, z: number, radius: number): void {
        const s = this.scene.bScene;
        const disc = BABYLON.MeshBuilder.CreateDisc('fab_decal', { radius, tessellation: 20 }, s);
        disc.rotation.x = Math.PI / 2;
        disc.position.set(x, 0.02, z);
        disc.isPickable = false;
        const mat = new BABYLON.StandardMaterial('fab_decal_mat', s);
        mat.diffuseColor = new BABYLON.Color3(0.08, 0.03, 0.02);
        mat.emissiveColor = new BABYLON.Color3(0.12, 0.02, 0.01);
        mat.alpha = 0.55;
        mat.disableLighting = true;
        disc.material = mat;
        this.timedMeshes.push({ mesh: disc, bornAt: this.scene.now(), lifetimeMs: 2600, growTo: 1.15, poolKey: null, baseAlpha: 0.55 });
    }

    attachProjectileTrail(mesh: BABYLON.Mesh, color: BABYLON.Color3): BABYLON.ParticleSystem | null {
        if (!this.flareTexture) return null;
        const s = this.scene.bScene;
        const ps = new BABYLON.ParticleSystem('fab_trail', 80, s);
        ps.particleTexture = this.flareTexture;
        ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
        ps.emitter = mesh;
        ps.color1 = new BABYLON.Color4(color.r, color.g, color.b, 0.9);
        ps.color2 = new BABYLON.Color4(color.r * 0.6, color.g * 0.6, color.b * 0.6, 0.5);
        ps.colorDead = new BABYLON.Color4(color.r * 0.2, color.g * 0.2, color.b * 0.2, 0);
        ps.minSize = 0.12;
        ps.maxSize = 0.3;
        ps.minLifeTime = 0.15;
        ps.maxLifeTime = 0.35;
        ps.emitRate = 120;
        ps.direction1 = new BABYLON.Vector3(-0.2, -0.2, -0.2);
        ps.direction2 = new BABYLON.Vector3(0.2, 0.2, 0.2);
        ps.minEmitPower = 0.05;
        ps.maxEmitPower = 0.25;
        ps.gravity = BABYLON.Vector3.Zero();
        ps.start();
        return ps;
    }

    hitFlash(meshes: BABYLON.AbstractMesh[]): void {
        const flashed: { mesh: BABYLON.AbstractMesh; prev: BABYLON.Color3 | null }[] = [];
        for (const m of meshes) {
            const mat = m.material as BABYLON.StandardMaterial | BABYLON.PBRMaterial | null;
            if (!mat) continue;
            const anyMat = mat as any;
            if (anyMat.emissiveColor === undefined) continue;
            flashed.push({ mesh: m, prev: anyMat.emissiveColor ? anyMat.emissiveColor.clone() : null });
            anyMat.emissiveColor = new BABYLON.Color3(0.7, 0.1, 0.1);
        }
        setTimeout(() => {
            for (const f of flashed) {
                const anyMat = f.mesh.material as any;
                if (anyMat && anyMat.emissiveColor !== undefined) {
                    anyMat.emissiveColor = f.prev ?? new BABYLON.Color3(0, 0, 0);
                }
            }
        }, HIT_FLASH_MS);
    }

    private _particleBurst(position: BABYLON.Vector3, color: BABYLON.Color4): void {
        const s = this.scene.bScene;
        const ps = new BABYLON.ParticleSystem('fab_burst', 60, s);
        ps.particleTexture = this.flareTexture;
        ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
        ps.emitter = position.clone().add(new BABYLON.Vector3(0, 1, 0));
        ps.color1 = color;
        ps.color2 = color;
        ps.minSize = 0.08;
        ps.maxSize = 0.2;
        ps.minLifeTime = 0.3;
        ps.maxLifeTime = 0.7;
        ps.emitRate = 300;
        ps.direction1 = new BABYLON.Vector3(-1, 1, -1);
        ps.direction2 = new BABYLON.Vector3(1, 2, 1);
        ps.minEmitPower = 1.5;
        ps.maxEmitPower = 3.5;
        ps.gravity = new BABYLON.Vector3(0, -6, 0);
        ps.targetStopDuration = 0.25;
        ps.onStoppedObservable.addOnce(() => {
            setTimeout(() => ps.dispose(false), Math.ceil(ps.maxLifeTime * 1000));
        });
        ps.start();
    }

    update(_dt: number): void {
        const now = this.scene.now();
        for (let i = this.timedMeshes.length - 1; i >= 0; i--) {
            const tm = this.timedMeshes[i];
            const t = (now - tm.bornAt) / tm.lifetimeMs;
            if (t >= 1) {
                this._releaseRing(tm);
                this.timedMeshes.splice(i, 1);
                continue;
            }
            const scale = 1 + (tm.growTo - 1) * t;
            tm.mesh.scaling.set(scale, 1, scale);
            const mat = tm.mesh.material as BABYLON.StandardMaterial | null;
            if (mat) mat.alpha = Math.max(0, tm.baseAlpha * (1 - t));
        }
    }
}
