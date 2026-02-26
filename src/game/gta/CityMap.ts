/**
 * CityMap - Generates a procedural city with blocks, roads, and buildings.
 */
import { Vector2 } from '../../engine/math/Vector2.js';
import { TileMap, AStar, NavigationGraph, RigidBody, AABBShape } from '../../engine/index.js';
import { SpriteSheet } from '../../engine/sprites/SpriteSheet.js';

export interface CityConfig {
    blocksX: number;
    blocksY: number;
    blockSize: number;
    roadWidth: number;
    sidewalkWidth: number;
    tileSize: number;
}

export const DEFAULT_CITY_CONFIG: CityConfig = {
    blocksX: 3,
    blocksY: 2,
    blockSize: 320,
    roadWidth: 96,
    sidewalkWidth: 32,
    tileSize: 32
};

export interface CityObject {
    body: RigidBody;
    spriteName: string;
    type: 'building' | 'lamp' | 'hydrant' | 'trash' | 'trafficLight';
    solid: boolean;
    crushable: boolean;
    destroyed: boolean;
}

export class CityMap {
    config: CityConfig;
    tileMap: TileMap;
    navGraph: NavigationGraph;
    astar: AStar;
    
    objects: CityObject[] = [];
    lampPositions: Vector2[] = [];
    
    private tilesX: number;
    private tilesY: number;
    private worldWidth: number;
    private worldHeight: number;

    constructor(config: Partial<CityConfig> = {}) {
        this.config = { ...DEFAULT_CITY_CONFIG, ...config };
        
        const { blocksX, blocksY, blockSize, roadWidth, tileSize } = this.config;
        
        this.worldWidth = blocksX * blockSize + (blocksX + 1) * roadWidth;
        this.worldHeight = blocksY * blockSize + (blocksY + 1) * roadWidth;
        
        this.tilesX = Math.ceil(this.worldWidth / tileSize);
        this.tilesY = Math.ceil(this.worldHeight / tileSize);
        
        this.tileMap = new TileMap(this.tilesX, this.tilesY, tileSize);
        this.navGraph = new NavigationGraph();
        this.astar = new AStar(this.tilesX, this.tilesY, true);
        
        this.generate();
    }

    generate(): void {
        this.tileMap.addLayer('ground');
        
        this.fillWithGrass();
        this.generateRoads();
        this.generateSidewalks();
        this.generateBuildings();
        this.generateNavigationGraph();
        this.generateStreetLamps();
        this.updateWalkableMap();
    }

    private fillWithGrass(): void {
        for (let y = 0; y < this.tilesY; y++) {
            for (let x = 0; x < this.tilesX; x++) {
                this.tileMap.setTile('ground', x, y, 'tiles_grass');
                this.tileMap.setTileData(x, y, {
                    type: 'grass',
                    solid: false,
                    walkable: false
                });
            }
        }
    }

    private generateRoads(): void {
        const { blocksX, blocksY, blockSize, roadWidth, tileSize } = this.config;
        
        for (let col = 0; col <= blocksX; col++) {
            const roadX = col * (blockSize + roadWidth);
            const startTileX = Math.floor(roadX / tileSize);
            const endTileX = Math.ceil((roadX + roadWidth) / tileSize);
            
            for (let tx = startTileX; tx < endTileX && tx < this.tilesX; tx++) {
                for (let ty = 0; ty < this.tilesY; ty++) {
                    this.tileMap.setTile('ground', tx, ty, 'tiles_road');
                    this.tileMap.setTileData(tx, ty, {
                        type: 'road',
                        solid: false,
                        walkable: false
                    });
                }
            }
        }
        
        for (let row = 0; row <= blocksY; row++) {
            const roadY = row * (blockSize + roadWidth);
            const startTileY = Math.floor(roadY / tileSize);
            const endTileY = Math.ceil((roadY + roadWidth) / tileSize);
            
            for (let ty = startTileY; ty < endTileY && ty < this.tilesY; ty++) {
                for (let tx = 0; tx < this.tilesX; tx++) {
                    this.tileMap.setTile('ground', tx, ty, 'tiles_road');
                    this.tileMap.setTileData(tx, ty, {
                        type: 'road',
                        solid: false,
                        walkable: false
                    });
                }
            }
        }
    }

    private generateSidewalks(): void {
        const { blocksX, blocksY, blockSize, roadWidth, sidewalkWidth, tileSize } = this.config;
        
        for (let bx = 0; bx < blocksX; bx++) {
            for (let by = 0; by < blocksY; by++) {
                const blockLeft = roadWidth + bx * (blockSize + roadWidth);
                const blockTop = roadWidth + by * (blockSize + roadWidth);
                
                const sides = [
                    { x1: blockLeft, y1: blockTop, x2: blockLeft + blockSize, y2: blockTop + sidewalkWidth },
                    { x1: blockLeft, y1: blockTop + blockSize - sidewalkWidth, x2: blockLeft + blockSize, y2: blockTop + blockSize },
                    { x1: blockLeft, y1: blockTop, x2: blockLeft + sidewalkWidth, y2: blockTop + blockSize },
                    { x1: blockLeft + blockSize - sidewalkWidth, y1: blockTop, x2: blockLeft + blockSize, y2: blockTop + blockSize }
                ];
                
                for (const side of sides) {
                    const startTileX = Math.floor(side.x1 / tileSize);
                    const endTileX = Math.ceil(side.x2 / tileSize);
                    const startTileY = Math.floor(side.y1 / tileSize);
                    const endTileY = Math.ceil(side.y2 / tileSize);
                    
                    for (let ty = startTileY; ty < endTileY && ty < this.tilesY; ty++) {
                        for (let tx = startTileX; tx < endTileX && tx < this.tilesX; tx++) {
                            if (this.tileMap.getTileType(tx, ty) !== 'road') {
                                this.tileMap.setTile('ground', tx, ty, 'tiles_sidewalk');
                                this.tileMap.setTileData(tx, ty, {
                                    type: 'sidewalk',
                                    solid: false,
                                    walkable: true
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    private generateBuildings(): void {
        const { blocksX, blocksY, blockSize, roadWidth, sidewalkWidth, tileSize } = this.config;
        const buildingSprites = ['buildings_tallBuilding', 'buildings_brownBuilding', 'buildings_smallHouse'];
        
        for (let bx = 0; bx < blocksX; bx++) {
            for (let by = 0; by < blocksY; by++) {
                const blockLeft = roadWidth + bx * (blockSize + roadWidth) + sidewalkWidth;
                const blockTop = roadWidth + by * (blockSize + roadWidth) + sidewalkWidth;
                const innerW = blockSize - sidewalkWidth * 2;
                const innerH = blockSize - sidewalkWidth * 2;
                
                const centerX = blockLeft + innerW / 2;
                const centerY = blockTop + innerH / 2;
                
                const spriteName = buildingSprites[(bx + by) % buildingSprites.length];
                const buildingW = 60;
                const buildingH = 70;
                
                const body = new RigidBody(centerX, centerY, 0, 'static');
                body.setShape(new AABBShape(buildingW, buildingH));
                body.tag = 'building';
                
                this.objects.push({
                    body,
                    spriteName,
                    type: 'building',
                    solid: true,
                    crushable: false,
                    destroyed: false
                });
                
                const tStartX = Math.floor((centerX - buildingW / 2) / tileSize);
                const tStartY = Math.floor((centerY - buildingH / 2) / tileSize);
                const tEndX = Math.ceil((centerX + buildingW / 2) / tileSize);
                const tEndY = Math.ceil((centerY + buildingH / 2) / tileSize);
                
                for (let ty = tStartY; ty < tEndY; ty++) {
                    for (let tx = tStartX; tx < tEndX; tx++) {
                        if (tx >= 0 && tx < this.tilesX && ty >= 0 && ty < this.tilesY) {
                            this.tileMap.setTileData(tx, ty, {
                                type: 'building',
                                solid: true,
                                walkable: false
                            });
                        }
                    }
                }
            }
        }
    }

    private generateNavigationGraph(): void {
        const { blocksX, blocksY, blockSize, roadWidth } = this.config;
        
        const nodesPerRow = blocksX + 1;
        const nodesPerCol = blocksY + 1;
        
        for (let ny = 0; ny <= blocksY; ny++) {
            for (let nx = 0; nx <= blocksX; nx++) {
                const id = ny * nodesPerRow + nx;
                const x = nx * (blockSize + roadWidth) + roadWidth / 2;
                const y = ny * (blockSize + roadWidth) + roadWidth / 2;
                this.navGraph.addNode(id, x, y);
            }
        }
        
        for (let ny = 0; ny <= blocksY; ny++) {
            for (let nx = 0; nx <= blocksX; nx++) {
                const id = ny * nodesPerRow + nx;
                
                if (nx < blocksX) {
                    this.navGraph.connectNodes(id, id + 1, true);
                }
                
                if (ny < blocksY) {
                    this.navGraph.connectNodes(id, id + nodesPerRow, true);
                }
            }
        }
    }

    private generateStreetLamps(): void {
        const { blocksX, blocksY, blockSize, roadWidth } = this.config;
        
        for (let col = 0; col <= blocksX; col++) {
            for (let row = 0; row <= blocksY; row++) {
                const intersectionX = col * (blockSize + roadWidth) + roadWidth / 2;
                const intersectionY = row * (blockSize + roadWidth) + roadWidth / 2;
                
                const offsets = [
                    { dx: roadWidth * 0.6, dy: roadWidth * 0.6 },
                    { dx: -roadWidth * 0.6, dy: -roadWidth * 0.6 }
                ];
                
                for (const offset of offsets) {
                    const lampX = intersectionX + offset.dx;
                    const lampY = intersectionY + offset.dy;
                    
                    if (lampX > 0 && lampX < this.worldWidth && 
                        lampY > 0 && lampY < this.worldHeight) {
                        this.lampPositions.push(new Vector2(lampX, lampY));
                        
                        const body = new RigidBody(lampX, lampY, 0, 'static');
                        body.setShape(new AABBShape(12, 12));
                        body.tag = 'lamp';
                        
                        this.objects.push({
                            body,
                            spriteName: 'cityObjects_streetLamp',
                            type: 'lamp',
                            solid: true,
                            crushable: false,
                            destroyed: false
                        });
                    }
                }
            }
        }
    }

    private updateWalkableMap(): void {
        for (let y = 0; y < this.tilesY; y++) {
            for (let x = 0; x < this.tilesX; x++) {
                const data = this.tileMap.getTileData(x, y);
                this.astar.setWalkable(x, y, data?.walkable ?? false);
            }
        }
    }

    render(ctx: CanvasRenderingContext2D, sheet: SpriteSheet, cameraX: number, cameraY: number, viewWidth: number, viewHeight: number): void {
        const { tileSize } = this.config;
        
        const startTileX = Math.max(0, Math.floor(cameraX / tileSize) - 1);
        const startTileY = Math.max(0, Math.floor(cameraY / tileSize) - 1);
        const endTileX = Math.min(this.tilesX, Math.ceil((cameraX + viewWidth) / tileSize) + 1);
        const endTileY = Math.min(this.tilesY, Math.ceil((cameraY + viewHeight) / tileSize) + 1);
        
        for (let ty = startTileY; ty < endTileY; ty++) {
            for (let tx = startTileX; tx < endTileX; tx++) {
                const tileData = this.tileMap.getTileData(tx, ty);
                const worldX = tx * tileSize;
                const worldY = ty * tileSize;
                
                switch (tileData?.type) {
                    case 'road':
                        ctx.fillStyle = '#3a3a4a';
                        ctx.fillRect(worldX, worldY, tileSize, tileSize);
                        break;
                    case 'sidewalk':
                        ctx.fillStyle = '#8a8a9a';
                        ctx.fillRect(worldX, worldY, tileSize, tileSize);
                        break;
                    case 'grass':
                    default:
                        ctx.fillStyle = '#2a5a2a';
                        ctx.fillRect(worldX, worldY, tileSize, tileSize);
                        break;
                }
            }
        }
        
        this.drawRoadMarkings(ctx, cameraX, cameraY, viewWidth, viewHeight);
        
        for (const obj of this.objects) {
            if (obj.destroyed) continue;
            
            const { x, y } = obj.body.position;
            
            if (x < cameraX - 100 || x > cameraX + viewWidth + 100 ||
                y < cameraY - 100 || y > cameraY + viewHeight + 100) {
                continue;
            }
            
            const frame = sheet.getFrame(obj.spriteName);
            if (frame && sheet.loaded) {
                sheet.draw(ctx, obj.spriteName, x - frame.w / 2, y - frame.h / 2);
            } else if (!sheet.loaded) {
                ctx.fillStyle = obj.type === 'building' ? '#555555' : '#888888';
                ctx.fillRect(x - 30, y - 35, 60, 70);
            }
        }
    }

    private drawRoadMarkings(ctx: CanvasRenderingContext2D, cameraX: number, cameraY: number, viewWidth: number, viewHeight: number): void {
        const { blocksX, blocksY, blockSize, roadWidth } = this.config;
        
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.setLineDash([20, 20]);
        
        for (let col = 0; col <= blocksX; col++) {
            const roadCenterX = col * (blockSize + roadWidth) + roadWidth / 2;
            
            if (roadCenterX >= cameraX - 50 && roadCenterX <= cameraX + viewWidth + 50) {
                ctx.lineDashOffset = -cameraY;
                ctx.beginPath();
                ctx.moveTo(roadCenterX, Math.max(0, cameraY));
                ctx.lineTo(roadCenterX, Math.min(this.worldHeight, cameraY + viewHeight));
                ctx.stroke();
            }
        }
        
        for (let row = 0; row <= blocksY; row++) {
            const roadCenterY = row * (blockSize + roadWidth) + roadWidth / 2;
            
            if (roadCenterY >= cameraY - 50 && roadCenterY <= cameraY + viewHeight + 50) {
                ctx.lineDashOffset = -cameraX;
                ctx.beginPath();
                ctx.moveTo(Math.max(0, cameraX), roadCenterY);
                ctx.lineTo(Math.min(this.worldWidth, cameraX + viewWidth), roadCenterY);
                ctx.stroke();
            }
        }
        
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;
    }

    getWorldWidth(): number {
        return this.worldWidth;
    }

    getWorldHeight(): number {
        return this.worldHeight;
    }

    getSolidObjects(): CityObject[] {
        return this.objects.filter(o => o.solid && !o.destroyed);
    }

    getCrushableObjects(): CityObject[] {
        return this.objects.filter(o => o.crushable && !o.destroyed);
    }

    getSpawnPositionOnRoad(): Vector2 {
        const { blocksX, blocksY, blockSize, roadWidth } = this.config;
        const midCol = Math.floor(blocksX / 2);
        const midRow = Math.floor(blocksY / 2);
        const x = midCol * (blockSize + roadWidth) + roadWidth / 2;
        const y = midRow * (blockSize + roadWidth) + roadWidth / 2;
        return new Vector2(x, y);
    }

    getSpawnPositionOnSidewalk(): Vector2 | null {
        const walkableTile = this.astar.getRandomWalkableTile();
        if (walkableTile) {
            return this.tileMap.tileToWorld(walkableTile.x, walkableTile.y);
        }
        return null;
    }
}
