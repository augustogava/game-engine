/**
 * Pedestrian - AI-controlled pedestrian that walks on sidewalks using A* pathfinding.
 * 
 * Can be killed by vehicles, leaving blood decals.
 */
import { Vector2 } from '../../engine/math/Vector2.js';
import { RigidBody, CircleShape, AStar } from '../../engine/index.js';
import { SpriteSheet } from '../../engine/sprites/SpriteSheet.js';

export type PedestrianState = 'alive' | 'dead';

export interface PedestrianConfig {
    walkSpeed: number;
    radius: number;
    mass: number;
    killSpeedThreshold: number;
}

export const DEFAULT_PEDESTRIAN_CONFIG: PedestrianConfig = {
    walkSpeed: 30,
    radius: 8,
    mass: 10,
    killSpeedThreshold: 50
};

export class Pedestrian {
    body: RigidBody;
    config: PedestrianConfig;
    state: PedestrianState = 'alive';
    
    astar: AStar;
    tileSize: number;
    
    currentPath: Vector2[] = [];
    pathIndex: number = 0;
    
    spriteAlive: string;
    spriteDead: string = 'pedestrians_deadBody';
    
    facingAngle: number = 0;
    
    waitTimer: number = 0;
    pathfindCooldown: number = 0;

    constructor(
        astar: AStar,
        tileSize: number,
        startX: number,
        startY: number,
        config: Partial<PedestrianConfig> = {},
        spriteAlive: string = 'pedestrians_manGreen'
    ) {
        this.config = { ...DEFAULT_PEDESTRIAN_CONFIG, ...config };
        this.astar = astar;
        this.tileSize = tileSize;
        this.spriteAlive = spriteAlive;

        this.body = new RigidBody(startX, startY, this.config.mass, 'dynamic');
        
        const shape = new CircleShape(this.config.radius);
        this.body.setShape(shape);
        
        this.body.material.linearDamping = 0.5;
        this.body.material.restitution = 0.1;

        this.chooseRandomDestination();
    }

    private worldToTile(worldPos: Vector2): Vector2 {
        return new Vector2(
            Math.floor(worldPos.x / this.tileSize),
            Math.floor(worldPos.y / this.tileSize)
        );
    }

    private tileToWorld(tilePos: Vector2): Vector2 {
        return new Vector2(
            tilePos.x * this.tileSize + this.tileSize / 2,
            tilePos.y * this.tileSize + this.tileSize / 2
        );
    }

    chooseRandomDestination(): void {
        if (this.state === 'dead') return;

        const destTile = this.astar.getRandomWalkableTile();
        if (!destTile) return;

        const startTile = this.worldToTile(this.body.position);
        
        if (!this.astar.isWalkable(startTile.x, startTile.y)) {
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    if (this.astar.isWalkable(startTile.x + dx, startTile.y + dy)) {
                        startTile.x += dx;
                        startTile.y += dy;
                        break;
                    }
                }
            }
        }

        const path = this.astar.findPath(
            startTile.x, startTile.y,
            destTile.x, destTile.y
        );

        if (path && path.length > 0) {
            this.currentPath = path.map(t => this.tileToWorld(t));
            this.pathIndex = 0;
        } else {
            this.waitTimer = 1.0 + Math.random() * 2;
        }
    }

    update(dt: number): void {
        if (this.state === 'dead') {
            this.body.velocity.x = 0;
            this.body.velocity.y = 0;
            return;
        }

        this.pathfindCooldown -= dt;

        if (this.waitTimer > 0) {
            this.waitTimer -= dt;
            this.body.velocity.x = 0;
            this.body.velocity.y = 0;
            return;
        }

        if (this.currentPath.length === 0 || this.pathIndex >= this.currentPath.length) {
            if (this.pathfindCooldown <= 0) {
                this.chooseRandomDestination();
                this.pathfindCooldown = 0.5;
            }
            return;
        }

        const target = this.currentPath[this.pathIndex];
        const dir = target.sub(this.body.position);
        const dist = dir.magnitude();

        if (dist < 10) {
            this.pathIndex++;
            
            if (this.pathIndex >= this.currentPath.length) {
                this.waitTimer = 1.0 + Math.random() * 3;
            }
            return;
        }

        const normalizedDir = dir.normalize();
        this.body.wakeUp();
        const targetVelocity = normalizedDir.scale(this.config.walkSpeed);
        this.body.velocity.x = targetVelocity.x;
        this.body.velocity.y = targetVelocity.y;
        
        this.facingAngle = Math.atan2(normalizedDir.x, -normalizedDir.y);
    }

    onHit(impactSpeed: number): boolean {
        if (this.state === 'dead') return false;

        if (impactSpeed > this.config.killSpeedThreshold) {
            this.kill();
            return true;
        }
        
        return false;
    }

    kill(): void {
        this.state = 'dead';
        this.body.velocity.x = 0;
        this.body.velocity.y = 0;
        this.body.bodyType = 'static';
        this.currentPath = [];
    }

    render(ctx: CanvasRenderingContext2D, sheet: SpriteSheet): void {
        const { x, y } = this.body.position;

        ctx.save();
        ctx.translate(x, y);

        if (this.state === 'alive') {
            ctx.rotate(this.facingAngle);
            const frame = sheet.getFrame(this.spriteAlive);
            if (frame) {
                sheet.draw(ctx, this.spriteAlive, -frame.w / 2, -frame.h / 2);
            } else {
                ctx.fillStyle = '#00ff00';
                ctx.beginPath();
                ctx.arc(0, 0, this.config.radius, 0, Math.PI * 2);
                ctx.fill();
            }
        } else {
            const frame = sheet.getFrame(this.spriteDead);
            if (frame) {
                sheet.draw(ctx, this.spriteDead, -frame.w / 2, -frame.h / 2);
            } else {
                ctx.fillStyle = '#880000';
                ctx.beginPath();
                ctx.arc(0, 0, this.config.radius, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.restore();
    }

    getPosition(): Vector2 {
        return this.body.position;
    }

    isAlive(): boolean {
        return this.state === 'alive';
    }

    isDead(): boolean {
        return this.state === 'dead';
    }
}
