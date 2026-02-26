/**
 * TileMap - Generic 2D tilemap system for rendering tile-based environments.
 * 
 * Supports multiple layers, collision detection, and walkability maps.
 */
import { SpriteSheet, Frame } from '../sprites/SpriteSheet.js';
import { Vector2 } from '../math/Vector2.js';

export type TileType = 'empty' | 'road' | 'sidewalk' | 'grass' | 'building' | 'object';

export interface TileData {
    type: TileType;
    frameName: string | null;
    solid: boolean;
    walkable: boolean;
}

export interface TileMapLayer {
    name: string;
    tiles: (string | null)[][];
    visible: boolean;
}

export class TileMap {
    private layers: TileMapLayer[] = [];
    private tileData: TileData[][] = [];
    private width: number;
    private height: number;
    private tileSize: number;
    private sheet: SpriteSheet | null = null;

    constructor(width: number, height: number, tileSize: number = 64) {
        this.width = width;
        this.height = height;
        this.tileSize = tileSize;

        for (let y = 0; y < height; y++) {
            this.tileData[y] = [];
            for (let x = 0; x < width; x++) {
                this.tileData[y][x] = {
                    type: 'empty',
                    frameName: null,
                    solid: false,
                    walkable: false
                };
            }
        }
    }

    setSpriteSheet(sheet: SpriteSheet): void {
        this.sheet = sheet;
    }

    addLayer(name: string): TileMapLayer {
        const layer: TileMapLayer = {
            name,
            tiles: [],
            visible: true
        };

        for (let y = 0; y < this.height; y++) {
            layer.tiles[y] = [];
            for (let x = 0; x < this.width; x++) {
                layer.tiles[y][x] = null;
            }
        }

        this.layers.push(layer);
        return layer;
    }

    getLayer(name: string): TileMapLayer | undefined {
        return this.layers.find(l => l.name === name);
    }

    setTile(layerName: string, x: number, y: number, frameName: string | null): void {
        const layer = this.getLayer(layerName);
        if (!layer || !this.isInBounds(x, y)) return;
        layer.tiles[y][x] = frameName;
    }

    setTileData(x: number, y: number, data: Partial<TileData>): void {
        if (!this.isInBounds(x, y)) return;
        Object.assign(this.tileData[y][x], data);
    }

    getTileData(x: number, y: number): TileData | null {
        if (!this.isInBounds(x, y)) return null;
        return this.tileData[y][x];
    }

    isSolid(x: number, y: number): boolean {
        if (!this.isInBounds(x, y)) return true;
        return this.tileData[y][x].solid;
    }

    isWalkable(x: number, y: number): boolean {
        if (!this.isInBounds(x, y)) return false;
        return this.tileData[y][x].walkable;
    }

    getTileType(x: number, y: number): TileType {
        if (!this.isInBounds(x, y)) return 'empty';
        return this.tileData[y][x].type;
    }

    worldToTile(worldX: number, worldY: number): Vector2 {
        return new Vector2(
            Math.floor(worldX / this.tileSize),
            Math.floor(worldY / this.tileSize)
        );
    }

    tileToWorld(tileX: number, tileY: number): Vector2 {
        return new Vector2(
            tileX * this.tileSize + this.tileSize / 2,
            tileY * this.tileSize + this.tileSize / 2
        );
    }

    isInBounds(x: number, y: number): boolean {
        return x >= 0 && x < this.width && y >= 0 && y < this.height;
    }

    isSolidAtWorld(worldX: number, worldY: number): boolean {
        const tile = this.worldToTile(worldX, worldY);
        return this.isSolid(tile.x, tile.y);
    }

    isWalkableAtWorld(worldX: number, worldY: number): boolean {
        const tile = this.worldToTile(worldX, worldY);
        return this.isWalkable(tile.x, tile.y);
    }

    render(ctx: CanvasRenderingContext2D, cameraX: number, cameraY: number, viewWidth: number, viewHeight: number): void {
        if (!this.sheet || !this.sheet.loaded) return;

        const startTileX = Math.max(0, Math.floor(cameraX / this.tileSize));
        const startTileY = Math.max(0, Math.floor(cameraY / this.tileSize));
        const endTileX = Math.min(this.width, Math.ceil((cameraX + viewWidth) / this.tileSize) + 1);
        const endTileY = Math.min(this.height, Math.ceil((cameraY + viewHeight) / this.tileSize) + 1);

        for (const layer of this.layers) {
            if (!layer.visible) continue;

            for (let y = startTileY; y < endTileY; y++) {
                for (let x = startTileX; x < endTileX; x++) {
                    const frameName = layer.tiles[y]?.[x];
                    if (!frameName) continue;

                    const worldX = x * this.tileSize;
                    const worldY = y * this.tileSize;

                    this.sheet.draw(ctx, frameName, worldX, worldY, this.tileSize, this.tileSize);
                }
            }
        }
    }

    getWidth(): number {
        return this.width;
    }

    getHeight(): number {
        return this.height;
    }

    getTileSize(): number {
        return this.tileSize;
    }

    getWorldWidth(): number {
        return this.width * this.tileSize;
    }

    getWorldHeight(): number {
        return this.height * this.tileSize;
    }

    getSolidTilesInRect(x: number, y: number, width: number, height: number): Vector2[] {
        const solidTiles: Vector2[] = [];
        const startTile = this.worldToTile(x, y);
        const endTile = this.worldToTile(x + width, y + height);

        for (let ty = startTile.y; ty <= endTile.y; ty++) {
            for (let tx = startTile.x; tx <= endTile.x; tx++) {
                if (this.isSolid(tx, ty)) {
                    solidTiles.push(new Vector2(tx, ty));
                }
            }
        }

        return solidTiles;
    }

    getWalkableTiles(): Vector2[] {
        const walkable: Vector2[] = [];
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                if (this.tileData[y][x].walkable) {
                    walkable.push(new Vector2(x, y));
                }
            }
        }
        return walkable;
    }

    clear(): void {
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                this.tileData[y][x] = {
                    type: 'empty',
                    frameName: null,
                    solid: false,
                    walkable: false
                };
            }
        }
        for (const layer of this.layers) {
            for (let y = 0; y < this.height; y++) {
                for (let x = 0; x < this.width; x++) {
                    layer.tiles[y][x] = null;
                }
            }
        }
    }
}
