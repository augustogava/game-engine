import * as BABYLON from '@babylonjs/core';
import { CustomMaterial } from '@babylonjs/materials/custom/customMaterial.js';
import type { FabulusScene } from '../FabulusScene.js';
import { FabulusPrefs, type FabulusPrefsData } from '../FabulusPrefs.js';
import { MAP_HALF, OBSTACLE_SEED, SPAWN_PLATEAU_RADIUS } from '../constants/index.js';
import {
    GRASS_BLADE_HEIGHT, GRASS_BLADE_WIDTH, GRASS_COUNT_HIGH, GRASS_COUNT_MEDIUM, GRASS_COUNT_ULTRA,
    GRASS_MAX_SCALE, GRASS_MAX_SLOPE, GRASS_MIN_SCALE, GRASS_PATH_MASK_LIMIT, GRASS_POND_MARGIN,
    GRASS_SINK, GRASS_TEXTURE_SIZE, GRASS_WIND_AMPLITUDE, GRASS_WIND_SPEED,
    TREE_WIND_AMPLITUDE, TREE_WIND_HEIGHT_REF, TREE_WIND_SPEED,
} from '../constants/graphicsConstants.js';

const GRASS_PLACEMENT_TRIES_FACTOR = 3;
const GRASS_BLADES_PER_TEXTURE = 9;
const glslFloat = (v: number) => v.toFixed(5);

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

/**
 * Vertex-shader wind sway for the merged tree template. Bends vertices by
 * local height; per-instance phase comes from the instance world translation.
 */
export class FabTreeWindPlugin extends BABYLON.MaterialPluginBase {
    constructor(material: BABYLON.Material) {
        super(material, 'FabTreeWind', 200, { FABTREEWIND: false });
        this._enable(true);
    }

    override prepareDefines(defines: BABYLON.MaterialDefines): void {
        defines['FABTREEWIND'] = true;
    }

    override getClassName(): string {
        return 'FabTreeWindPlugin';
    }

    override getUniforms(): { ubo: { name: string; size: number; type: string }[]; vertex: string } {
        return {
            ubo: [{ name: 'fabWindTime', size: 1, type: 'float' }],
            vertex: 'uniform float fabWindTime;',
        };
    }

    override bindForSubMesh(uniformBuffer: BABYLON.UniformBuffer): void {
        uniformBuffer.updateFloat('fabWindTime', performance.now() * 0.001 * TREE_WIND_SPEED);
    }

    override getCustomCode(shaderType: string): BABYLON.Nullable<{ [pointName: string]: string }> {
        if (shaderType !== 'vertex') return null;
        return {
            CUSTOM_VERTEX_UPDATE_POSITION: `
#ifdef FABTREEWIND
#ifdef INSTANCES
float fabWindPhase=world3.x*0.37+world3.z*0.43;
#else
float fabWindPhase=0.0;
#endif
float fabWindH=clamp(positionUpdated.y/${glslFloat(TREE_WIND_HEIGHT_REF)},0.0,1.0);
float fabWindSway=sin(fabWindTime+fabWindPhase)+0.45*sin(fabWindTime*2.3+fabWindPhase*1.7);
positionUpdated.x+=fabWindSway*fabWindH*fabWindH*${glslFloat(TREE_WIND_AMPLITUDE)};
positionUpdated.z+=0.6*cos(fabWindTime*0.8+fabWindPhase)*fabWindH*fabWindH*${glslFloat(TREE_WIND_AMPLITUDE)};
#endif
`,
        };
    }
}

/** Attaches wind sway to every material of the tree template (MultiMaterial-aware). */
export function applyTreeWind(material: BABYLON.Nullable<BABYLON.Material>): void {
    if (!material) return;
    const targets = material instanceof BABYLON.MultiMaterial
        ? material.subMaterials.filter((m): m is BABYLON.Material => !!m)
        : [material];
    for (const mat of targets) {
        if (!mat.pluginManager?.getPlugin('FabTreeWind')) new FabTreeWindPlugin(mat);
    }
}

/**
 * GPU grass: crossed-quad blade tufts scattered as thin instances (1 draw call),
 * swaying in the vertex shader. Density follows gfxDetailLevel; gfxGroundUltra
 * bumps the high count further.
 */
export class GrassSystem {
    private scene: FabulusScene;
    private mesh: BABYLON.Mesh | null = null;
    private material: CustomMaterial | null = null;
    private texture: BABYLON.DynamicTexture | null = null;
    private time = 0;
    private prefsListener: ((prefs: FabulusPrefsData, changed: (keyof FabulusPrefsData)[]) => void) | null = null;

    constructor(scene: FabulusScene) {
        this.scene = scene;
    }

    init(): void {
        this._build();
        this.prefsListener = (_prefs, changed) => {
            if (changed.includes('gfxDetailLevel') || changed.includes('gfxGroundUltra')) {
                this._disposeMesh();
                this._build();
            }
        };
        FabulusPrefs.onChange(this.prefsListener);
    }

    update(dt: number): void {
        this.time += dt;
    }

    dispose(): void {
        if (this.prefsListener) {
            FabulusPrefs.offChange(this.prefsListener);
            this.prefsListener = null;
        }
        this._disposeMesh();
    }

    private _targetCount(): number {
        const prefs = FabulusPrefs.get();
        if (prefs.gfxDetailLevel === 'low') return 0;
        if (prefs.gfxDetailLevel === 'medium') return GRASS_COUNT_MEDIUM;
        return prefs.gfxGroundUltra ? GRASS_COUNT_ULTRA : GRASS_COUNT_HIGH;
    }

    private _build(): void {
        const count = this._targetCount();
        if (count <= 0) {
            console.debug('[Fabulus] Grass disabled (low detail)');
            return;
        }
        const matrices = this._scatterMatrices(count);
        if (!matrices.length) return;

        const s = this.scene.bScene;
        const mesh = this._buildTuftMesh(s);
        mesh.material = this._buildMaterial(s);

        const buffer = new Float32Array(matrices.length * 16);
        for (let i = 0; i < matrices.length; i++) matrices[i].copyToArray(buffer, i * 16);
        mesh.thinInstanceSetBuffer('matrix', buffer, 16, true);
        mesh.thinInstanceRefreshBoundingInfo(false);

        this.mesh = mesh;
        console.debug(`[Fabulus] Grass ready (${matrices.length} tufts, 1 draw call)`);
    }

    private _scatterMatrices(count: number): BABYLON.Matrix[] {
        const map = this.scene.mapSystem;
        const rand = mulberry32(OBSTACLE_SEED + 511);
        const basins = map.getPondBasins();
        const matrices: BABYLON.Matrix[] = [];
        const maxAttempts = count * GRASS_PLACEMENT_TRIES_FACTOR;

        for (let attempt = 0; attempt < maxAttempts && matrices.length < count; attempt++) {
            const x = (rand() * 2 - 1) * (MAP_HALF - 2);
            const z = (rand() * 2 - 1) * (MAP_HALF - 2);
            if (Math.hypot(x, z) < SPAWN_PLATEAU_RADIUS * 0.5) continue;
            if (map.getPathMask(x, z) > GRASS_PATH_MASK_LIMIT) continue;
            if (map.getSlopeAt(x, z) > GRASS_MAX_SLOPE) continue;
            if (basins.some(b => Math.hypot(b.x - x, b.z - z) < b.radius * 1.6 + GRASS_POND_MARGIN)) continue;

            const scale = GRASS_MIN_SCALE + rand() * (GRASS_MAX_SCALE - GRASS_MIN_SCALE);
            matrices.push(BABYLON.Matrix.Compose(
                new BABYLON.Vector3(scale, scale, scale),
                BABYLON.Quaternion.RotationYawPitchRoll(rand() * Math.PI * 2, 0, 0),
                new BABYLON.Vector3(x, map.getHeightAt(x, z) - GRASS_SINK, z),
            ));
        }
        return matrices;
    }

    private _buildTuftMesh(s: BABYLON.Scene): BABYLON.Mesh {
        const makeQuad = (rotY: number) => {
            const plane = BABYLON.MeshBuilder.CreatePlane('fab_grass_quad', {
                width: GRASS_BLADE_WIDTH, height: GRASS_BLADE_HEIGHT,
                sideOrientation: BABYLON.Mesh.DOUBLESIDE,
            }, s);
            plane.position.y = GRASS_BLADE_HEIGHT / 2;
            plane.rotation.y = rotY;
            plane.bakeCurrentTransformIntoVertices();
            return plane;
        };
        const merged = BABYLON.Mesh.MergeMeshes([makeQuad(0), makeQuad(Math.PI / 2)], true, true);
        if (!merged) throw new Error('Grass tuft merge failed');
        merged.name = 'fab_grass';
        merged.isPickable = false;
        merged.receiveShadows = true;
        merged.alwaysSelectAsActiveMesh = true;
        return merged;
    }

    private _buildMaterial(s: BABYLON.Scene): CustomMaterial {
        const mat = new CustomMaterial('fab_grass_mat', s);
        this.texture = this._buildBladeTexture(s);
        mat.diffuseTexture = this.texture;
        mat.useAlphaFromDiffuseTexture = true;
        mat.specularColor = new BABYLON.Color3(0.02, 0.03, 0.02);
        mat.emissiveColor = new BABYLON.Color3(0.04, 0.06, 0.02);
        mat.backFaceCulling = false;
        mat.transparencyMode = BABYLON.Material.MATERIAL_ALPHATEST;
        mat.alphaCutOff = 0.45;

        mat.AddUniform('fabGrassTime', 'float', 0);
        mat.Vertex_Before_PositionUpdated(`
#if defined(THIN_INSTANCES) || defined(INSTANCES)
float fabGrassPhase=world[3].x*0.9+world[3].z*1.1;
#else
float fabGrassPhase=0.0;
#endif
float fabGrassH=clamp(positionUpdated.y/${glslFloat(GRASS_BLADE_HEIGHT)},0.0,1.0);
float fabGrassSway=sin(fabGrassTime+fabGrassPhase)+0.5*sin(fabGrassTime*2.3+fabGrassPhase*1.9);
positionUpdated.x+=fabGrassSway*fabGrassH*fabGrassH*${glslFloat(GRASS_WIND_AMPLITUDE)};
positionUpdated.z+=0.55*cos(fabGrassTime*0.7+fabGrassPhase)*fabGrassH*fabGrassH*${glslFloat(GRASS_WIND_AMPLITUDE)};
`);
        mat.Fragment_Before_FragColor(`
if (color.a < 0.45) discard;
`);
        mat.onBindObservable.add(() => {
            mat.getEffect()?.setFloat('fabGrassTime', this.time * GRASS_WIND_SPEED);
        });
        this.material = mat;
        return mat;
    }

    private _buildBladeTexture(s: BABYLON.Scene): BABYLON.DynamicTexture {
        const size = GRASS_TEXTURE_SIZE;
        const tex = new BABYLON.DynamicTexture('fab_grass_tex', size, s, true);
        const ctx = tex.getContext() as CanvasRenderingContext2D;
        ctx.clearRect(0, 0, size, size);

        const rand = mulberry32(OBSTACLE_SEED + 733);
        for (let i = 0; i < GRASS_BLADES_PER_TEXTURE; i++) {
            const baseX = ((i + 0.5) / GRASS_BLADES_PER_TEXTURE) * size + (rand() - 0.5) * 10;
            const topX = baseX + (rand() - 0.5) * size * 0.22;
            const topY = size * (0.02 + rand() * 0.2);
            const halfW = size * (0.012 + rand() * 0.014);

            const g = ctx.createLinearGradient(0, size, 0, topY);
            g.addColorStop(0, `rgb(${30 + (rand() * 14 | 0)},${52 + (rand() * 18 | 0)},${22 + (rand() * 10 | 0)})`);
            g.addColorStop(1, `rgb(${74 + (rand() * 24 | 0)},${116 + (rand() * 30 | 0)},${44 + (rand() * 16 | 0)})`);
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(baseX - halfW, size);
            ctx.quadraticCurveTo(baseX - halfW * 0.4, (size + topY) / 2, topX, topY);
            ctx.quadraticCurveTo(baseX + halfW * 0.4, (size + topY) / 2, baseX + halfW, size);
            ctx.closePath();
            ctx.fill();
        }
        tex.update();
        tex.hasAlpha = true;
        return tex;
    }

    private _disposeMesh(): void {
        this.mesh?.dispose();
        this.mesh = null;
        this.material?.dispose();
        this.material = null;
        this.texture?.dispose();
        this.texture = null;
    }
}
