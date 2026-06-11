import * as BABYLON from '@babylonjs/core';
import { TerrainMaterial } from '@babylonjs/materials/terrain/terrainMaterial.js';
import type { FabulusScene } from '../FabulusScene.js';
import {
    FOREST_TREE_COUNT, GROUND_TEXTURE_BASE_URL,
    MAP_BORDER_MARGIN, MAP_HALF, MAP_MODEL_FILE, MAP_SIZE, MODELS_BASE_PATH,
    OBSTACLE_COUNT, OBSTACLE_SEED, SPAWN_PLATEAU_RADIUS,
} from '../constants/index.js';
import { FabulusPrefs } from '../FabulusPrefs.js';
import { TerrainHeightField, type PondBasin } from './TerrainHeightField.js';

const BORDER_WALL_THICKNESS = 4;
const OBSTACLE_MIN_DIST_FROM_CENTER = 6;
const DECOR_COUNT = 70;
const BIOME_PROP_COUNT = 26;
const DETAIL_DENSITY: Record<string, number> = { low: 0.4, medium: 1, high: 1.6 };
const BIOME_ZONE_THRESHOLD = 0.2;

const GROUND_SUBDIVISIONS: Record<string, number> = { low: 96, medium: 160, high: 220 };
const GROUND_SUBDIVISIONS_ULTRA = 240;
const SPLAT_SIZE = 512;
const SPLAT_SIZE_ULTRA = 1024;
const COMPOSITE_BASE_SIZE = 1024;
const GRASS_BLEND_PERIOD = 8;
const GRASS_BLEND_LOW = 0.46;
const GRASS_BLEND_HIGH = 0.62;
const GRASS_BLEND_MAX_ALPHA = 0.85;

const TILE_FOREST_FLOOR = 26;
const TILE_DIRT_PATH = 30;
const TILE_ROCK = 14;
const ROCK_SLOPE_START = 0.38;
const ROCK_SLOPE_RANGE = 0.4;
const ROCK_ALTITUDE_START = 4.5;
const ROCK_ALTITUDE_FACTOR = 0.25;
const SPLAT_NOISE_JITTER = 0.16;

const TREE_MODEL_FILE = 'tree_pin.glb';
const TREE_BASE_HEIGHT = 9;
const TREE_MIN_SCALE = 0.7;
const TREE_MAX_SCALE = 1.35;
const TREE_COLLIDER_RADIUS = 0.55;
const TREE_PATH_MASK_LIMIT = 0.12;
const TREE_MAX_SLOPE = 1.0;
const TREE_MIN_DIST_FROM_CENTER = SPAWN_PLATEAU_RADIUS + 4;
const TREE_POND_MARGIN = 2;
const TREE_PLACEMENT_TRIES_FACTOR = 5;

const SCATTER_PATH_MASK_LIMIT = 0.3;

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

function hash2(ix: number, iz: number, seed: number): number {
    let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 974711)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (((h ^ (h >>> 16)) >>> 0) / 4294967296);
}

// Value noise whose lattice wraps every `period` cells, so the result tiles seamlessly.
function wrappedNoise(x: number, z: number, period: number, seed: number): number {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fz = z - iz;
    const wrap = (v: number) => ((v % period) + period) % period;
    const v00 = hash2(wrap(ix), wrap(iz), seed);
    const v10 = hash2(wrap(ix + 1), wrap(iz), seed);
    const v01 = hash2(wrap(ix), wrap(iz + 1), seed);
    const v11 = hash2(wrap(ix + 1), wrap(iz + 1), seed);
    const sx = fx * fx * (3 - 2 * fx);
    const sz = fz * fz * (3 - 2 * fz);
    return (v00 * (1 - sx) + v10 * sx) * (1 - sz) + (v01 * (1 - sx) + v11 * sx) * sz;
}

function loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Image load failed: ${url}`));
        img.src = url;
    });
}

export class MapSystem {
    private scene: FabulusScene;
    private heightField: TerrainHeightField | null = null;
    private groundMaterial: TerrainMaterial | null = null;

    constructor(scene: FabulusScene) {
        this.scene = scene;
        // Built eagerly so other systems (lighting, props, NPCs) can query terrain
        // height regardless of their init order relative to MapSystem.init().
        if (!MAP_MODEL_FILE) this.heightField = new TerrainHeightField(OBSTACLE_SEED);
    }

    init(): void {
        if (MAP_MODEL_FILE) {
            this._loadExternalMap();
        } else {
            this._buildProceduralGround();
            this._scatterObstacles();
            void this._scatterForest();
        }
        this._buildBorderWalls();
        console.debug(`[Fabulus] Map ready (${this.scene.staticColliders.length} colliders)`);
    }

    /** Terrain height at world XZ (0 when no heightfield, e.g. external maps). */
    getHeightAt(x: number, z: number): number {
        return this.heightField ? this.heightField.getHeightAt(x, z) : 0;
    }

    getSlopeAt(x: number, z: number): number {
        return this.heightField ? this.heightField.getSlopeAt(x, z) : 0;
    }

    getPathMask(x: number, z: number): number {
        return this.heightField ? this.heightField.getPathMask(x, z) : 0;
    }

    getPondBasins(): PondBasin[] {
        return this.heightField ? this.heightField.getPondBasins() : [];
    }

    // ── Ground mesh ──────────────────────────────────────────────────────────

    private _buildProceduralGround(): void {
        const s = this.scene.bScene;
        const prefs = FabulusPrefs.get();
        const subdivisions = prefs.gfxGroundUltra
            ? GROUND_SUBDIVISIONS_ULTRA
            : (GROUND_SUBDIVISIONS[prefs.gfxDetailLevel] ?? GROUND_SUBDIVISIONS.medium);

        const ground = BABYLON.MeshBuilder.CreateGround('fab_ground', {
            width: MAP_SIZE, height: MAP_SIZE, subdivisions, updatable: true,
        }, s);
        ground.isPickable = true;
        ground.receiveShadows = true;

        this._displaceGround(ground);
        ground.material = this._buildGroundMaterial(s, prefs.gfxGroundUltra);

        this.scene.renderSystem.prepareMeshes([ground], { castShadow: false, receiveShadow: true });
        this.scene.groundMesh = ground;
        console.debug(`[Fabulus] Terrain ground built (${subdivisions} subdivisions)`);
    }

    private _displaceGround(ground: BABYLON.Mesh): void {
        const hf = this.heightField;
        if (!hf) return;
        const positions = ground.getVerticesData(BABYLON.VertexBuffer.PositionKind);
        const indices = ground.getIndices();
        if (!positions || !indices) return;

        for (let i = 0; i < positions.length; i += 3) {
            positions[i + 1] = hf.getHeightAt(positions[i], positions[i + 2]);
        }
        const normals: number[] = [];
        BABYLON.VertexData.ComputeNormals(positions, indices, normals);
        ground.updateVerticesData(BABYLON.VertexBuffer.PositionKind, positions);
        ground.updateVerticesData(BABYLON.VertexBuffer.NormalKind, normals);
        ground.refreshBoundingInfo();
    }

    // ── Ground material (real PBR texture sets, splat-blended) ───────────────

    private _buildGroundMaterial(s: BABYLON.Scene, ultra: boolean): TerrainMaterial {
        const mat = new TerrainMaterial('fab_ground_mat', s);
        mat.mixTexture = this._buildSplatTexture(s, ultra ? SPLAT_SIZE_ULTRA : SPLAT_SIZE);

        const diffuse1 = new BABYLON.Texture(GROUND_TEXTURE_BASE_URL + 'forest_floor_color.jpg', s);
        const diffuse2 = new BABYLON.Texture(GROUND_TEXTURE_BASE_URL + 'dirt_path_color.jpg', s);
        const diffuse3 = new BABYLON.Texture(GROUND_TEXTURE_BASE_URL + 'rock_color.jpg', s);
        const bump1 = new BABYLON.Texture(GROUND_TEXTURE_BASE_URL + 'forest_floor_normal.jpg', s);
        const bump2 = new BABYLON.Texture(GROUND_TEXTURE_BASE_URL + 'dirt_path_normal.jpg', s);
        const bump3 = new BABYLON.Texture(GROUND_TEXTURE_BASE_URL + 'rock_normal.jpg', s);

        diffuse1.uScale = diffuse1.vScale = TILE_FOREST_FLOOR;
        bump1.uScale = bump1.vScale = TILE_FOREST_FLOOR;
        diffuse2.uScale = diffuse2.vScale = TILE_DIRT_PATH;
        bump2.uScale = bump2.vScale = TILE_DIRT_PATH;
        diffuse3.uScale = diffuse3.vScale = TILE_ROCK;
        bump3.uScale = bump3.vScale = TILE_ROCK;

        mat.diffuseTexture1 = diffuse1;
        mat.diffuseTexture2 = diffuse2;
        mat.diffuseTexture3 = diffuse3;
        mat.bumpTexture1 = bump1;
        mat.bumpTexture2 = bump2;
        mat.bumpTexture3 = bump3;

        mat.specularColor = new BABYLON.Color3(0.04, 0.04, 0.04);
        mat.specularPower = 48;
        mat.maxSimultaneousLights = 8;
        this.groundMaterial = mat;

        void this._applyCompositeBase(s);
        return mat;
    }

    // Blends the grass set over the forest floor with seamless noise, so the base
    // layer alternates between leafy ground and grass patches when it tiles.
    private async _applyCompositeBase(s: BABYLON.Scene): Promise<void> {
        try {
            const [floorImg, grassImg] = await Promise.all([
                loadImage(GROUND_TEXTURE_BASE_URL + 'forest_floor_color.jpg'),
                loadImage(GROUND_TEXTURE_BASE_URL + 'grass_color.jpg'),
            ]);
            if (s.isDisposed || !this.groundMaterial) return;

            const size = COMPOSITE_BASE_SIZE;
            const overlay = document.createElement('canvas');
            overlay.width = overlay.height = size;
            const octx = overlay.getContext('2d');
            if (!octx) return;
            octx.drawImage(grassImg, 0, 0, size, size);
            const img = octx.getImageData(0, 0, size, size);
            const cellScale = GRASS_BLEND_PERIOD / size;
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const n = wrappedNoise(x * cellScale, y * cellScale, GRASS_BLEND_PERIOD, OBSTACLE_SEED + 401);
                    const t = Math.max(0, Math.min(1, (n - GRASS_BLEND_LOW) / (GRASS_BLEND_HIGH - GRASS_BLEND_LOW)));
                    img.data[(y * size + x) * 4 + 3] = Math.round(t * t * (3 - 2 * t) * GRASS_BLEND_MAX_ALPHA * 255);
                }
            }
            octx.putImageData(img, 0, 0);

            const tex = new BABYLON.DynamicTexture('fab_ground_base', size, s, true);
            const ctx = tex.getContext() as CanvasRenderingContext2D;
            ctx.drawImage(floorImg, 0, 0, size, size);
            ctx.drawImage(overlay, 0, 0);
            tex.update();
            tex.uScale = tex.vScale = TILE_FOREST_FLOOR;

            const old = this.groundMaterial.diffuseTexture1;
            this.groundMaterial.diffuseTexture1 = tex;
            old?.dispose();
            console.debug('[Fabulus] Ground base composite (forest floor + grass) applied');
        } catch (err) {
            console.warn('[Fabulus] Ground composite failed, keeping plain forest floor:', err);
        }
    }

    // Splat weights: R = forest floor base, G = dirt paths, B = rock on steep/high terrain.
    private _buildSplatTexture(s: BABYLON.Scene, size: number): BABYLON.DynamicTexture {
        const hf = this.heightField;
        const tex = new BABYLON.DynamicTexture('fab_ground_splat', size, s, true);
        const ctx = tex.getContext() as CanvasRenderingContext2D;
        const img = ctx.createImageData(size, size);

        for (let py = 0; py < size; py++) {
            // DynamicTexture uses invertY: canvas row 0 is texture v = 1 (world +Z edge).
            const wz = (1 - py / (size - 1)) * MAP_SIZE - MAP_HALF;
            for (let px = 0; px < size; px++) {
                const wx = (px / (size - 1)) * MAP_SIZE - MAP_HALF;
                let path = 0;
                let rock = 0;
                if (hf) {
                    const jitter = (hash2(px, py, OBSTACLE_SEED + 19) - 0.5) * SPLAT_NOISE_JITTER;
                    path = Math.max(0, Math.min(1, hf.getPathMask(wx, wz) * 1.15 + jitter * 0.5));
                    const slope = hf.getSlopeAt(wx, wz);
                    const height = hf.getHeightAt(wx, wz);
                    rock = Math.max(0, Math.min(1,
                        (slope - ROCK_SLOPE_START) / ROCK_SLOPE_RANGE
                        + Math.max(0, height - ROCK_ALTITUDE_START) * ROCK_ALTITUDE_FACTOR
                        + jitter,
                    ));
                    rock *= (1 - path);
                }
                const base = Math.max(0, 1 - path - rock);
                const idx = (py * size + px) * 4;
                img.data[idx] = Math.round(base * 255);
                img.data[idx + 1] = Math.round(path * 255);
                img.data[idx + 2] = Math.round(rock * 255);
                img.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(img, 0, 0);
        tex.update();
        return tex;
    }

    // ── Forest ───────────────────────────────────────────────────────────────

    private async _scatterForest(): Promise<void> {
        const s = this.scene.bScene;
        const hf = this.heightField;
        if (!hf) return;
        let template: BABYLON.Mesh | null = null;
        try {
            template = await this._buildTreeTemplate(s);
        } catch (err) {
            console.warn('[Fabulus] Forest template load failed:', err);
            return;
        }
        if (!template || s.isDisposed) return;

        const rand = mulberry32(OBSTACLE_SEED + 97);
        const density = DETAIL_DENSITY[FabulusPrefs.get().gfxDetailLevel] ?? 1;
        const targetCount = Math.round(FOREST_TREE_COUNT * density);
        const basins = hf.getPondBasins();

        let placed = 0;
        let templateUsed = false;
        for (let attempt = 0; attempt < targetCount * TREE_PLACEMENT_TRIES_FACTOR && placed < targetCount; attempt++) {
            const x = (rand() * 2 - 1) * (MAP_HALF - 4);
            const z = (rand() * 2 - 1) * (MAP_HALF - 4);
            const scale = TREE_MIN_SCALE + rand() * (TREE_MAX_SCALE - TREE_MIN_SCALE);
            const yaw = rand() * Math.PI * 2;
            if (Math.hypot(x, z) < TREE_MIN_DIST_FROM_CENTER) continue;
            if (hf.getPathMask(x, z) > TREE_PATH_MASK_LIMIT) continue;
            if (hf.getSlopeAt(x, z) > TREE_MAX_SLOPE) continue;
            if (basins.some(b => Math.hypot(b.x - x, b.z - z) < b.radius * 1.6 + TREE_POND_MARGIN)) continue;

            const y = hf.getHeightAt(x, z);
            let node: BABYLON.AbstractMesh;
            if (!templateUsed) {
                node = template;
                templateUsed = true;
            } else {
                node = template.createInstance(`fab_forest_${placed}`);
            }
            node.position.set(x, y, z);
            node.rotation.y = yaw;
            node.scaling.setAll(scale);
            node.isPickable = false;

            const r = TREE_COLLIDER_RADIUS * scale;
            this.scene.staticColliders.push({
                minX: x - r, maxX: x + r,
                minZ: z - r, maxZ: z + r,
            });
            placed++;
        }
        if (!templateUsed) template.setEnabled(false);
        console.debug(`[Fabulus] Forest ready (${placed} trees)`);
    }

    private async _buildTreeTemplate(s: BABYLON.Scene): Promise<BABYLON.Mesh | null> {
        const container = await BABYLON.SceneLoader.LoadAssetContainerAsync(MODELS_BASE_PATH, TREE_MODEL_FILE, s);
        const entries = container.instantiateModelsToScene(name => `fab_tree_src_${name}`, false, { doNotInstantiate: true });
        const modelRoot = entries.rootNodes[0] as BABYLON.TransformNode;
        const meshes = this.scene.renderSystem.collectModelMeshes(modelRoot)
            .filter((m): m is BABYLON.Mesh => m instanceof BABYLON.Mesh && m.getTotalVertices() > 0);
        if (!meshes.length) {
            modelRoot.dispose(false, true);
            return null;
        }
        this.scene.renderSystem.normalizeModelHeight(modelRoot, meshes, TREE_BASE_HEIGHT);
        for (const m of meshes) m.computeWorldMatrix(true);

        const merged = BABYLON.Mesh.MergeMeshes(meshes, true, true, undefined, false, true);
        modelRoot.dispose(false, true);
        if (!merged) return null;
        merged.name = 'fab_tree_template';
        merged.isPickable = false;
        this.scene.renderSystem.prepareMeshes([merged]);
        return merged;
    }

    // ── Obstacles, decor and biome props ─────────────────────────────────────

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
            const kind = rand();
            if (Math.hypot(x, z) < OBSTACLE_MIN_DIST_FROM_CENTER) continue;
            if (this.getPathMask(x, z) > SCATTER_PATH_MASK_LIMIT) continue;
            const ground = this.getHeightAt(x, z);

            let mesh: BABYLON.Mesh;
            let halfX: number;
            let halfZ: number;
            if (kind < 0.45) {
                const scale = 0.8 + rand() * 1.6;
                mesh = BABYLON.MeshBuilder.CreateIcoSphere(`fab_rock_${i}`, { radius: scale, subdivisions: 1 }, s);
                mesh.position.set(x, ground + scale * 0.45, z);
                mesh.scaling.y = 0.6 + rand() * 0.3;
                mesh.rotation.y = rand() * Math.PI * 2;
                mesh.material = stoneMat;
                halfX = scale; halfZ = scale;
            } else if (kind < 0.75) {
                const h = 1.6 + rand() * 2.2;
                const r = 0.5 + rand() * 0.5;
                mesh = BABYLON.MeshBuilder.CreateCylinder(`fab_pillar_${i}`, { height: h, diameter: r * 2, tessellation: 8 }, s);
                mesh.position.set(x, ground + h / 2, z);
                mesh.material = stoneMat;
                halfX = r; halfZ = r;
            } else {
                const w = 0.9 + rand() * 1.4;
                mesh = BABYLON.MeshBuilder.CreateBox(`fab_crate_${i}`, { size: w }, s);
                mesh.position.set(x, ground + w / 2, z);
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
            if (this.getPathMask(x, z) > SCATTER_PATH_MASK_LIMIT) continue;

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
        const ground = this.getHeightAt(x, z);
        const h = 2.4 + rand() * 1.8;
        const r = 0.18 + rand() * 0.16;
        const trunk = BABYLON.MeshBuilder.CreateCylinder(`fab_tree_${i}`, {
            height: h, diameterBottom: r * 2.4, diameterTop: r * 0.9, tessellation: 7,
        }, s);
        trunk.position.set(x, ground + h / 2, z);
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
        const ground = this.getHeightAt(x, z);
        const h = 0.8 + rand() * 1.4;
        const crystal = BABYLON.MeshBuilder.CreatePolyhedron(`fab_crystal_${i}`, { type: 1, size: h * 0.4 }, s);
        crystal.position.set(x, ground + h * 0.35, z);
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
            const ground = this.getHeightAt(mx, mz);
            const stemH = 0.18 + rand() * 0.3;
            const stem = BABYLON.MeshBuilder.CreateCylinder(`fab_mush_stem_${i}_${j}`, {
                height: stemH, diameter: stemH * 0.45, tessellation: 6,
            }, s);
            stem.position.set(mx, ground + stemH / 2, mz);
            stem.material = stemMat;
            stem.isPickable = false;

            const cap = BABYLON.MeshBuilder.CreateSphere(`fab_mush_cap_${i}_${j}`, {
                diameter: stemH * 1.5, slice: 0.55, segments: 8,
            }, s);
            cap.position.set(mx, ground + stemH, mz);
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
            if (this.getPathMask(x, z) > SCATTER_PATH_MASK_LIMIT) continue;
            const ground = this.getHeightAt(x, z);

            if (rand() < 0.5) {
                const r = 0.12 + rand() * 0.22;
                const pebble = BABYLON.MeshBuilder.CreateIcoSphere(`fab_pebble_${i}`, { radius: r, subdivisions: 1 }, s);
                pebble.position.set(x, ground + r * 0.4, z);
                pebble.scaling.y = 0.5;
                pebble.rotation.y = rand() * Math.PI * 2;
                pebble.material = stoneMat;
                pebble.isPickable = false;
                this.scene.renderSystem.prepareMeshes([pebble], { castShadow: false, receiveShadow: true });
            } else {
                const h = 0.25 + rand() * 0.3;
                const tuft = BABYLON.MeshBuilder.CreatePlane(`fab_tuft_${i}`, { width: 0.5, height: h }, s);
                tuft.position.set(x, ground + h / 2, z);
                tuft.rotation.y = rand() * Math.PI;
                tuft.material = grassMat;
                tuft.isPickable = false;
                this.scene.renderSystem.prepareMeshes([tuft], { castShadow: false, receiveShadow: true });
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
            this.heightField = new TerrainHeightField(OBSTACLE_SEED);
            this._buildProceduralGround();
            this._scatterObstacles();
            void this._scatterForest();
        });
    }
}
