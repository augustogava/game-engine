import * as BABYLON from '@babylonjs/core';
import type { FabulusScene } from '../FabulusScene.js';
import {
    MAP_BORDER_MARGIN, MAP_HALF, MAP_MODEL_FILE, MAP_SIZE, MODELS_BASE_PATH,
    OBSTACLE_COUNT, OBSTACLE_SEED,
} from '../constants/index.js';
import { FabulusPrefs } from '../FabulusPrefs.js';

const GROUND_TEXTURE_SIZE = 1024;
const GROUND_TILE_CELLS = 32;
const BORDER_WALL_THICKNESS = 4;
const OBSTACLE_MIN_DIST_FROM_CENTER = 6;
const NORMAL_MAP_SIZE = 512;
const DECOR_COUNT = 40;
const BIOME_PATCH_COUNT = 14;
const BIOME_PROP_COUNT = 26;
const DETAIL_DENSITY: Record<string, number> = { low: 0.4, medium: 1, high: 1.6 };
const BIOME_ZONE_THRESHOLD = 0.2;

function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a += 0x6D2B79F5;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export class MapSystem {
    private scene: FabulusScene;

    constructor(scene: FabulusScene) {
        this.scene = scene;
    }

    init(): void {
        if (MAP_MODEL_FILE) {
            this._loadExternalMap();
        } else {
            this._buildProceduralGround();
            this._scatterObstacles();
        }
        this._buildBorderWalls();
        console.debug(`[Fabulus] Map ready (${this.scene.staticColliders.length} colliders)`);
    }

    private _buildProceduralGround(): void {
        const s = this.scene.bScene;
        const ground = BABYLON.MeshBuilder.CreateGround('fab_ground', { width: MAP_SIZE, height: MAP_SIZE, subdivisions: 4 }, s);
        ground.position.y = 0;
        ground.isPickable = true;
        ground.receiveShadows = true;

        const tex = new BABYLON.DynamicTexture('fab_ground_tex', GROUND_TEXTURE_SIZE, s, true);
        const ctx = tex.getContext() as CanvasRenderingContext2D;
        const cell = GROUND_TEXTURE_SIZE / GROUND_TILE_CELLS;
        const rand = mulberry32(OBSTACLE_SEED + 7);
        for (let y = 0; y < GROUND_TILE_CELLS; y++) {
            for (let x = 0; x < GROUND_TILE_CELLS; x++) {
                const base = 62 + Math.floor(rand() * 24);
                ctx.fillStyle = `rgb(${base + 8},${base},${Math.max(34, base - 14)})`;
                ctx.fillRect(x * cell, y * cell, cell, cell);
                ctx.fillStyle = `rgba(0,0,0,${0.05 + rand() * 0.08})`;
                ctx.fillRect(x * cell, y * cell, cell, 2);
                ctx.fillRect(x * cell, y * cell, 2, cell);
            }
        }
        for (let i = 0; i < BIOME_PATCH_COUNT; i++) {
            const px = rand() * GROUND_TEXTURE_SIZE;
            const py = rand() * GROUND_TEXTURE_SIZE;
            const r = 60 + rand() * 160;
            const grad = ctx.createRadialGradient(px, py, 0, px, py, r);
            const mossy = rand() < 0.5;
            grad.addColorStop(0, mossy ? 'rgba(58,72,40,0.30)' : 'rgba(96,78,54,0.28)');
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(px, py, r, 0, Math.PI * 2);
            ctx.fill();
        }
        for (let i = 0; i < 380; i++) {
            const px = rand() * GROUND_TEXTURE_SIZE;
            const py = rand() * GROUND_TEXTURE_SIZE;
            const r = 1 + rand() * 4;
            ctx.fillStyle = `rgba(${90 + rand() * 36},${76 + rand() * 30},${52 + rand() * 22},0.35)`;
            ctx.beginPath();
            ctx.arc(px, py, r, 0, Math.PI * 2);
            ctx.fill();
        }
        tex.update();

        const mat = new BABYLON.PBRMaterial('fab_ground_mat', s);
        mat.albedoTexture = tex;
        (mat.albedoTexture as BABYLON.Texture).uScale = 6;
        (mat.albedoTexture as BABYLON.Texture).vScale = 6;
        mat.metallic = 0.02;
        mat.roughness = 0.95;
        const bump = this._buildGroundNormalMap(s);
        mat.bumpTexture = bump;
        bump.uScale = 12;
        bump.vScale = 12;
        ground.material = mat;
        ground.receiveShadows = true;

        this.scene.groundMesh = ground;
    }

    private _buildGroundNormalMap(s: BABYLON.Scene): BABYLON.DynamicTexture {
        const size = NORMAL_MAP_SIZE;
        const tex = new BABYLON.DynamicTexture('fab_ground_normal', size, s, true);
        const ctx = tex.getContext() as CanvasRenderingContext2D;
        const rand = mulberry32(OBSTACLE_SEED + 31);

        const height = new Float32Array(size * size);
        for (let i = 0; i < height.length; i++) height[i] = rand();
        const blurred = new Float32Array(size * size);
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                let sum = 0;
                for (let dy = -2; dy <= 2; dy++) {
                    for (let dx = -2; dx <= 2; dx++) {
                        const sx = (x + dx + size) % size;
                        const sy = (y + dy + size) % size;
                        sum += height[sy * size + sx];
                    }
                }
                blurred[y * size + x] = sum / 25;
            }
        }

        const img = ctx.createImageData(size, size);
        const strength = 2.2;
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const hl = blurred[y * size + ((x - 1 + size) % size)];
                const hr = blurred[y * size + ((x + 1) % size)];
                const hu = blurred[((y - 1 + size) % size) * size + x];
                const hd = blurred[((y + 1) % size) * size + x];
                let nx = (hl - hr) * strength;
                let ny = (hu - hd) * strength;
                const nz = 1;
                const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
                nx /= len; ny /= len;
                const idx = (y * size + x) * 4;
                img.data[idx] = Math.round((nx * 0.5 + 0.5) * 255);
                img.data[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
                img.data[idx + 2] = Math.round(((nz / len) * 0.5 + 0.5) * 255);
                img.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(img, 0, 0);
        tex.update();
        return tex;
    }

    private _scatterObstacles(): void {
        const s = this.scene.bScene;
        const rand = mulberry32(OBSTACLE_SEED);

        const stoneMat = new BABYLON.PBRMaterial('fab_stone_mat', s);
        stoneMat.albedoColor = new BABYLON.Color3(0.42, 0.4, 0.36);
        stoneMat.metallic = 0.04;
        stoneMat.roughness = 0.88;
        const woodMat = new BABYLON.PBRMaterial('fab_wood_mat', s);
        woodMat.albedoColor = new BABYLON.Color3(0.48, 0.34, 0.2);
        woodMat.metallic = 0.02;
        woodMat.roughness = 0.82;

        for (let i = 0; i < OBSTACLE_COUNT; i++) {
            const x = (rand() * 2 - 1) * (MAP_HALF - 6);
            const z = (rand() * 2 - 1) * (MAP_HALF - 6);
            if (Math.hypot(x, z) < OBSTACLE_MIN_DIST_FROM_CENTER) continue;

            const kind = rand();
            let mesh: BABYLON.Mesh;
            let halfX: number;
            let halfZ: number;
            if (kind < 0.45) {
                const scale = 0.8 + rand() * 1.6;
                mesh = BABYLON.MeshBuilder.CreateIcoSphere(`fab_rock_${i}`, { radius: scale, subdivisions: 1 }, s);
                mesh.position.set(x, scale * 0.45, z);
                mesh.scaling.y = 0.6 + rand() * 0.3;
                mesh.rotation.y = rand() * Math.PI * 2;
                mesh.material = stoneMat;
                halfX = scale; halfZ = scale;
            } else if (kind < 0.75) {
                const h = 1.6 + rand() * 2.2;
                const r = 0.5 + rand() * 0.5;
                mesh = BABYLON.MeshBuilder.CreateCylinder(`fab_pillar_${i}`, { height: h, diameter: r * 2, tessellation: 8 }, s);
                mesh.position.set(x, h / 2, z);
                mesh.material = stoneMat;
                halfX = r; halfZ = r;
            } else {
                const w = 0.9 + rand() * 1.4;
                mesh = BABYLON.MeshBuilder.CreateBox(`fab_crate_${i}`, { size: w }, s);
                mesh.position.set(x, w / 2, z);
                mesh.rotation.y = rand() * Math.PI * 0.5;
                mesh.material = woodMat;
                halfX = w * 0.75; halfZ = w * 0.75;
            }
            mesh.isPickable = false;
            this.scene.renderSystem.prepareMeshes([mesh]);
            this.scene.staticColliders.push({
                minX: x - halfX, maxX: x + halfX,
                minZ: z - halfZ, maxZ: z + halfZ,
            });
        }
        this._scatterDecor(s, rand, stoneMat);
        this._scatterBiomeProps(s, rand);
    }

    // Biome zones (by map region) get distinct prop sets: dead trees north,
    // glowing crystals west, mushroom clusters east.
    private _scatterBiomeProps(s: BABYLON.Scene, rand: () => number): void {
        const trunkMat = new BABYLON.PBRMaterial('fab_trunk_mat', s);
        trunkMat.albedoColor = new BABYLON.Color3(0.32, 0.24, 0.16);
        trunkMat.metallic = 0.02;
        trunkMat.roughness = 0.92;

        const crystalMat = new BABYLON.PBRMaterial('fab_crystal_mat', s);
        crystalMat.albedoColor = new BABYLON.Color3(0.3, 0.5, 0.85);
        crystalMat.emissiveColor = new BABYLON.Color3(0.1, 0.22, 0.42);
        crystalMat.metallic = 0.1;
        crystalMat.roughness = 0.3;

        const mushroomMat = new BABYLON.PBRMaterial('fab_mushroom_mat', s);
        mushroomMat.albedoColor = new BABYLON.Color3(0.62, 0.3, 0.22);
        mushroomMat.emissiveColor = new BABYLON.Color3(0.12, 0.04, 0.02);
        mushroomMat.metallic = 0;
        mushroomMat.roughness = 0.85;

        const zoneEdge = MAP_HALF * BIOME_ZONE_THRESHOLD;
        const propCount = Math.round(BIOME_PROP_COUNT * (DETAIL_DENSITY[FabulusPrefs.get().gfxDetailLevel] ?? 1));
        for (let i = 0; i < propCount; i++) {
            const x = (rand() * 2 - 1) * (MAP_HALF - 6);
            const z = (rand() * 2 - 1) * (MAP_HALF - 6);
            if (Math.hypot(x, z) < OBSTACLE_MIN_DIST_FROM_CENTER) continue;

            if (z > zoneEdge) {
                this._buildDeadTree(s, rand, trunkMat, x, z, i);
            } else if (x < -zoneEdge) {
                this._buildCrystal(s, rand, crystalMat, x, z, i);
            } else if (x > zoneEdge) {
                this._buildMushroomCluster(s, rand, mushroomMat, trunkMat, x, z, i);
            }
        }
    }

    private _buildDeadTree(s: BABYLON.Scene, rand: () => number, trunkMat: BABYLON.PBRMaterial, x: number, z: number, i: number): void {
        const h = 2.4 + rand() * 1.8;
        const r = 0.18 + rand() * 0.16;
        const trunk = BABYLON.MeshBuilder.CreateCylinder(`fab_tree_${i}`, {
            height: h, diameterBottom: r * 2.4, diameterTop: r * 0.9, tessellation: 7,
        }, s);
        trunk.position.set(x, h / 2, z);
        trunk.rotation.y = rand() * Math.PI * 2;
        trunk.rotation.z = (rand() - 0.5) * 0.16;
        trunk.material = trunkMat;
        trunk.isPickable = false;

        const branch = BABYLON.MeshBuilder.CreateCylinder(`fab_branch_${i}`, {
            height: h * 0.45, diameterBottom: r * 0.9, diameterTop: r * 0.3, tessellation: 5,
        }, s);
        branch.parent = trunk;
        branch.position.y = h * 0.18;
        branch.rotation.z = 0.9 + rand() * 0.5;
        branch.material = trunkMat;
        branch.isPickable = false;

        this.scene.renderSystem.prepareMeshes([trunk, branch]);
        this.scene.staticColliders.push({
            minX: x - r * 1.4, maxX: x + r * 1.4,
            minZ: z - r * 1.4, maxZ: z + r * 1.4,
        });
    }

    private _buildCrystal(s: BABYLON.Scene, rand: () => number, crystalMat: BABYLON.PBRMaterial, x: number, z: number, i: number): void {
        const h = 0.8 + rand() * 1.4;
        const crystal = BABYLON.MeshBuilder.CreatePolyhedron(`fab_crystal_${i}`, { type: 1, size: h * 0.4 }, s);
        crystal.position.set(x, h * 0.35, z);
        crystal.scaling.y = 1.7 + rand() * 0.6;
        crystal.rotation.y = rand() * Math.PI * 2;
        crystal.rotation.z = (rand() - 0.5) * 0.3;
        crystal.material = crystalMat;
        crystal.isPickable = false;
        this.scene.renderSystem.prepareMeshes([crystal]);
        this.scene.staticColliders.push({
            minX: x - h * 0.4, maxX: x + h * 0.4,
            minZ: z - h * 0.4, maxZ: z + h * 0.4,
        });
    }

    private _buildMushroomCluster(s: BABYLON.Scene, rand: () => number, capMat: BABYLON.PBRMaterial, stemMat: BABYLON.PBRMaterial, x: number, z: number, i: number): void {
        const count = 2 + Math.floor(rand() * 3);
        for (let j = 0; j < count; j++) {
            const mx = x + (rand() - 0.5) * 1.2;
            const mz = z + (rand() - 0.5) * 1.2;
            const stemH = 0.18 + rand() * 0.3;
            const stem = BABYLON.MeshBuilder.CreateCylinder(`fab_mush_stem_${i}_${j}`, {
                height: stemH, diameter: stemH * 0.45, tessellation: 6,
            }, s);
            stem.position.set(mx, stemH / 2, mz);
            stem.material = stemMat;
            stem.isPickable = false;

            const cap = BABYLON.MeshBuilder.CreateSphere(`fab_mush_cap_${i}_${j}`, {
                diameter: stemH * 1.5, slice: 0.55, segments: 8,
            }, s);
            cap.position.set(mx, stemH, mz);
            cap.material = capMat;
            cap.isPickable = false;
            this.scene.renderSystem.prepareMeshes([stem, cap]);
        }
    }

    private _scatterDecor(s: BABYLON.Scene, rand: () => number, stoneMat: BABYLON.PBRMaterial): void {
        const grassMat = new BABYLON.PBRMaterial('fab_grass_mat', s);
        grassMat.albedoColor = new BABYLON.Color3(0.24, 0.34, 0.16);
        grassMat.metallic = 0;
        grassMat.roughness = 0.95;
        grassMat.backFaceCulling = false;

        const decorCount = Math.round(DECOR_COUNT * (DETAIL_DENSITY[FabulusPrefs.get().gfxDetailLevel] ?? 1));
        for (let i = 0; i < decorCount; i++) {
            const x = (rand() * 2 - 1) * (MAP_HALF - 4);
            const z = (rand() * 2 - 1) * (MAP_HALF - 4);
            if (Math.hypot(x, z) < OBSTACLE_MIN_DIST_FROM_CENTER * 0.6) continue;

            if (rand() < 0.5) {
                const r = 0.12 + rand() * 0.22;
                const pebble = BABYLON.MeshBuilder.CreateIcoSphere(`fab_pebble_${i}`, { radius: r, subdivisions: 1 }, s);
                pebble.position.set(x, r * 0.4, z);
                pebble.scaling.y = 0.5;
                pebble.rotation.y = rand() * Math.PI * 2;
                pebble.material = stoneMat;
                pebble.isPickable = false;
            } else {
                const h = 0.25 + rand() * 0.3;
                const tuft = BABYLON.MeshBuilder.CreatePlane(`fab_tuft_${i}`, { width: 0.5, height: h }, s);
                tuft.position.set(x, h / 2, z);
                tuft.rotation.y = rand() * Math.PI;
                tuft.material = grassMat;
                tuft.isPickable = false;
            }
        }
    }

    private _buildBorderWalls(): void {
        const half = MAP_HALF - MAP_BORDER_MARGIN;
        const t = BORDER_WALL_THICKNESS;
        const big = MAP_HALF + t;
        this.scene.staticColliders.push(
            { minX: -big, maxX: big, minZ: half, maxZ: half + t },
            { minX: -big, maxX: big, minZ: -half - t, maxZ: -half },
            { minX: half, maxX: half + t, minZ: -big, maxZ: big },
            { minX: -half - t, maxX: -half, minZ: -big, maxZ: big },
        );
    }

    private _loadExternalMap(): void {
        const s = this.scene.bScene;
        BABYLON.SceneLoader.ImportMesh('', MODELS_BASE_PATH + 'map/', MAP_MODEL_FILE, s, (meshes) => {
            for (const mesh of meshes) {
                mesh.receiveShadows = true;
                if (!mesh.getTotalVertices()) continue;
                const bb = mesh.getBoundingInfo().boundingBox;
                this.scene.staticColliders.push({
                    minX: bb.minimumWorld.x, maxX: bb.maximumWorld.x,
                    minZ: bb.minimumWorld.z, maxZ: bb.maximumWorld.z,
                });
            }
            const ground = meshes.find(m => /ground|floor|terrain/i.test(m.name));
            if (ground) this.scene.groundMesh = ground as BABYLON.Mesh;
            console.debug('[Fabulus] External map loaded');
        }, undefined, (_s, message) => {
            console.warn('[Fabulus] External map load failed, falling back to procedural:', message);
            this._buildProceduralGround();
            this._scatterObstacles();
        });
    }
}
