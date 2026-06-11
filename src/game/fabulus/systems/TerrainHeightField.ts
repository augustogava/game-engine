import {
    MAP_HALF, MAP_SIZE,
    POND_BASIN_COUNT, POND_BASIN_RADIUS_MAX, POND_BASIN_RADIUS_MIN,
    SPAWN_PLATEAU_RADIUS,
    TERRAIN_AMPLITUDE, TERRAIN_GRID_RESOLUTION, TERRAIN_NOISE_SCALE,
    TERRAIN_PATH_COUNT, TERRAIN_PATH_WIDTH,
} from '../constants/index.js';

const PLATEAU_FALLOFF = 8;
const PATH_STEP = 1.0;
const PATH_WIGGLE_FREQ = 0.045;
const PATH_WIGGLE_AMPL = 0.55;
const PATH_FLATTEN_STRENGTH = 0.95;
const PATH_WEAR_DEPTH = 0.35;
const PATH_BLUR_RADIUS_CELLS = 16;
const POND_DEPTH = 2.4;
const POND_WATER_OFFSET = 0.7;
const POND_MIN_DIST_FROM_CENTER = 22;
const POND_MAX_PLACEMENT_TRIES = 60;
const EDGE_RIM_START = 0.78;
const EDGE_RIM_HEIGHT = 4;
const RIDGE_WEIGHT = 0.45;

export interface PondBasin {
    x: number;
    z: number;
    radius: number;
    waterY: number;
}

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

function smooth(t: number): number {
    return t * t * (3 - 2 * t);
}

function valueNoise(x: number, z: number, seed: number): number {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fz = z - iz;
    const v00 = hash2(ix, iz, seed);
    const v10 = hash2(ix + 1, iz, seed);
    const v01 = hash2(ix, iz + 1, seed);
    const v11 = hash2(ix + 1, iz + 1, seed);
    const sx = smooth(fx);
    const sz = smooth(fz);
    return (v00 * (1 - sx) + v10 * sx) * (1 - sz) + (v01 * (1 - sx) + v11 * sx) * sz;
}

function fbm(x: number, z: number, seed: number, octaves: number): number {
    let amp = 0.5;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
        sum += amp * valueNoise(x * freq, z * freq, seed + o * 101);
        norm += amp;
        amp *= 0.5;
        freq *= 2.03;
    }
    return sum / norm;
}

/**
 * Deterministic heightfield for the Fabulus map: dramatic FBM hills with a flat
 * spawn plateau, smoothed path corridors radiating from the center and carved
 * pond basins. All world queries are bilinear over the grid.
 */
export class TerrainHeightField {
    private readonly res = TERRAIN_GRID_RESOLUTION;
    private readonly heights: Float32Array;
    private readonly pathMask: Float32Array;
    private readonly basins: PondBasin[] = [];
    private readonly seed: number;

    constructor(seed: number) {
        this.seed = seed;
        this.heights = new Float32Array(this.res * this.res);
        this.pathMask = new Float32Array(this.res * this.res);
        this._generateBase();
        this._applySpawnPlateau();
        this._carvePaths();
        this._applyEdgeRim();
        this._carvePondBasins();
        console.debug(`[Fabulus] Terrain heightfield ready (${this.res}x${this.res}, ${this.basins.length} basins)`);
    }

    /** Bilinear terrain height at world coordinates. */
    getHeightAt(x: number, z: number): number {
        const gx = this._toGrid(x);
        const gz = this._toGrid(z);
        const ix = Math.floor(gx);
        const iz = Math.floor(gz);
        const fx = gx - ix;
        const fz = gz - iz;
        const h00 = this._cell(ix, iz);
        const h10 = this._cell(ix + 1, iz);
        const h01 = this._cell(ix, iz + 1);
        const h11 = this._cell(ix + 1, iz + 1);
        return (h00 * (1 - fx) + h10 * fx) * (1 - fz) + (h01 * (1 - fx) + h11 * fx) * fz;
    }

    /** Slope magnitude (rise per world unit) at world coordinates. */
    getSlopeAt(x: number, z: number): number {
        const d = MAP_SIZE / (this.res - 1);
        const hx = this.getHeightAt(x + d, z) - this.getHeightAt(x - d, z);
        const hz = this.getHeightAt(x, z + d) - this.getHeightAt(x, z - d);
        return Math.hypot(hx, hz) / (2 * d);
    }

    /** Path corridor weight (0 = off path, 1 = path center) at world coordinates. */
    getPathMask(x: number, z: number): number {
        const gx = Math.round(this._toGrid(x));
        const gz = Math.round(this._toGrid(z));
        return this._maskCell(gx, gz);
    }

    getPondBasins(): PondBasin[] {
        return this.basins;
    }

    private _toGrid(world: number): number {
        const t = (world + MAP_HALF) / MAP_SIZE;
        return Math.max(0, Math.min(1, t)) * (this.res - 1);
    }

    private _gridToWorld(g: number): number {
        return (g / (this.res - 1)) * MAP_SIZE - MAP_HALF;
    }

    private _cell(ix: number, iz: number): number {
        const cx = Math.max(0, Math.min(this.res - 1, ix));
        const cz = Math.max(0, Math.min(this.res - 1, iz));
        return this.heights[cz * this.res + cx];
    }

    private _maskCell(ix: number, iz: number): number {
        const cx = Math.max(0, Math.min(this.res - 1, ix));
        const cz = Math.max(0, Math.min(this.res - 1, iz));
        return this.pathMask[cz * this.res + cx];
    }

    private _generateBase(): void {
        const res = this.res;
        for (let iz = 0; iz < res; iz++) {
            for (let ix = 0; ix < res; ix++) {
                const wx = this._gridToWorld(ix);
                const wz = this._gridToWorld(iz);
                const nx = wx * TERRAIN_NOISE_SCALE;
                const nz = wz * TERRAIN_NOISE_SCALE;
                const base = fbm(nx, nz, this.seed, 5) * 2 - 1;
                // Ridged component sharpens hill crests for a more dramatic relief.
                const ridge = 1 - Math.abs(fbm(nx * 0.6 + 37.2, nz * 0.6 - 11.8, this.seed + 7, 4) * 2 - 1);
                const h = base * (1 - RIDGE_WEIGHT) + (ridge * 2 - 1) * RIDGE_WEIGHT;
                this.heights[iz * res + ix] = h * TERRAIN_AMPLITUDE;
            }
        }
    }

    private _applySpawnPlateau(): void {
        const res = this.res;
        for (let iz = 0; iz < res; iz++) {
            for (let ix = 0; ix < res; ix++) {
                const wx = this._gridToWorld(ix);
                const wz = this._gridToWorld(iz);
                const dist = Math.hypot(wx, wz);
                if (dist >= SPAWN_PLATEAU_RADIUS + PLATEAU_FALLOFF) continue;
                const t = Math.max(0, (dist - SPAWN_PLATEAU_RADIUS) / PLATEAU_FALLOFF);
                this.heights[iz * res + ix] *= smooth(Math.min(1, t));
            }
        }
    }

    private _carvePaths(): void {
        const rand = mulberry32(this.seed + 53);
        const res = this.res;
        const cellSize = MAP_SIZE / (res - 1);
        const stampRadiusCells = Math.ceil(TERRAIN_PATH_WIDTH / cellSize);

        for (let p = 0; p < TERRAIN_PATH_COUNT; p++) {
            const baseAngle = (p / TERRAIN_PATH_COUNT) * Math.PI * 2 + rand() * 0.6;
            const phase = rand() * Math.PI * 2;
            let x = 0;
            let z = 0;
            let t = 0;
            while (Math.abs(x) < MAP_HALF - 2 && Math.abs(z) < MAP_HALF - 2) {
                const angle = baseAngle + Math.sin(t * PATH_WIGGLE_FREQ * Math.PI * 2 + phase) * PATH_WIGGLE_AMPL;
                x += Math.cos(angle) * PATH_STEP;
                z += Math.sin(angle) * PATH_STEP;
                t += PATH_STEP;
                this._stampPathPoint(x, z, stampRadiusCells, cellSize);
            }
        }

        const blurred = this._boxBlurHeights(PATH_BLUR_RADIUS_CELLS);
        for (let i = 0; i < this.heights.length; i++) {
            const m = this.pathMask[i];
            if (m <= 0) continue;
            // Saturate the corridor core so the full flatten applies across the walkway
            // and only the outer fringe feathers (avoids berms at the path edges).
            const w = smooth(Math.min(1, m * 1.35));
            const flat = blurred[i] - PATH_WEAR_DEPTH * w;
            this.heights[i] += (flat - this.heights[i]) * (w * PATH_FLATTEN_STRENGTH);
        }
    }

    private _stampPathPoint(x: number, z: number, radiusCells: number, cellSize: number): void {
        const res = this.res;
        const cx = Math.round(this._toGrid(x));
        const cz = Math.round(this._toGrid(z));
        for (let dz = -radiusCells; dz <= radiusCells; dz++) {
            for (let dx = -radiusCells; dx <= radiusCells; dx++) {
                const ix = cx + dx;
                const iz = cz + dz;
                if (ix < 0 || iz < 0 || ix >= res || iz >= res) continue;
                const dist = Math.hypot(dx, dz) * cellSize;
                if (dist > TERRAIN_PATH_WIDTH) continue;
                const w = smooth(1 - dist / TERRAIN_PATH_WIDTH);
                const idx = iz * res + ix;
                if (w > this.pathMask[idx]) this.pathMask[idx] = w;
            }
        }
    }

    private _boxBlurHeights(radius: number): Float32Array {
        const res = this.res;
        const tmp = new Float32Array(res * res);
        const out = new Float32Array(res * res);
        for (let iz = 0; iz < res; iz++) {
            for (let ix = 0; ix < res; ix++) {
                let sum = 0;
                let n = 0;
                for (let d = -radius; d <= radius; d++) {
                    const sx = ix + d;
                    if (sx < 0 || sx >= res) continue;
                    sum += this.heights[iz * res + sx];
                    n++;
                }
                tmp[iz * res + ix] = sum / n;
            }
        }
        for (let iz = 0; iz < res; iz++) {
            for (let ix = 0; ix < res; ix++) {
                let sum = 0;
                let n = 0;
                for (let d = -radius; d <= radius; d++) {
                    const sz = iz + d;
                    if (sz < 0 || sz >= res) continue;
                    sum += tmp[sz * res + ix];
                    n++;
                }
                out[iz * res + ix] = sum / n;
            }
        }
        return out;
    }

    private _applyEdgeRim(): void {
        const res = this.res;
        for (let iz = 0; iz < res; iz++) {
            for (let ix = 0; ix < res; ix++) {
                const wx = this._gridToWorld(ix);
                const wz = this._gridToWorld(iz);
                const edge = Math.max(Math.abs(wx), Math.abs(wz)) / MAP_HALF;
                if (edge <= EDGE_RIM_START) continue;
                const t = smooth(Math.min(1, (edge - EDGE_RIM_START) / (1 - EDGE_RIM_START)));
                const idx = iz * res + ix;
                const m = this.pathMask[idx];
                // Paths keep their exit corridors through the rim.
                this.heights[idx] += EDGE_RIM_HEIGHT * t * (1 - m);
            }
        }
    }

    private _carvePondBasins(): void {
        const rand = mulberry32(this.seed + 211);
        let tries = 0;
        while (this.basins.length < POND_BASIN_COUNT && tries < POND_MAX_PLACEMENT_TRIES) {
            tries++;
            const x = (rand() * 2 - 1) * (MAP_HALF - POND_BASIN_RADIUS_MAX - 6);
            const z = (rand() * 2 - 1) * (MAP_HALF - POND_BASIN_RADIUS_MAX - 6);
            if (Math.hypot(x, z) < POND_MIN_DIST_FROM_CENTER) continue;
            if (this.getPathMask(x, z) > 0.05) continue;
            const radius = POND_BASIN_RADIUS_MIN + rand() * (POND_BASIN_RADIUS_MAX - POND_BASIN_RADIUS_MIN);
            if (this.basins.some(b => Math.hypot(b.x - x, b.z - z) < b.radius + radius + 8)) continue;

            const floorY = this._carveBasin(x, z, radius);
            this.basins.push({ x, z, radius, waterY: floorY + POND_WATER_OFFSET });
        }
    }

    private _carveBasin(x: number, z: number, radius: number): number {
        const res = this.res;
        const cellSize = MAP_SIZE / (res - 1);
        const reach = radius * 1.6;
        const reachCells = Math.ceil(reach / cellSize);
        const cx = Math.round(this._toGrid(x));
        const cz = Math.round(this._toGrid(z));
        const rimY = this.getHeightAt(x, z);
        const floorY = rimY - POND_DEPTH;
        for (let dz = -reachCells; dz <= reachCells; dz++) {
            for (let dx = -reachCells; dx <= reachCells; dx++) {
                const ix = cx + dx;
                const iz = cz + dz;
                if (ix < 0 || iz < 0 || ix >= res || iz >= res) continue;
                const dist = Math.hypot(dx, dz) * cellSize;
                if (dist > reach) continue;
                const t = smooth(Math.max(0, Math.min(1, 1 - dist / reach)));
                const idx = iz * res + ix;
                const target = floorY + (1 - t) * POND_DEPTH;
                if (this.heights[idx] > target) {
                    this.heights[idx] += (target - this.heights[idx]) * t;
                }
            }
        }
        return floorY;
    }
}
