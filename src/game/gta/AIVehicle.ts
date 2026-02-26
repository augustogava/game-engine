/**
 * AIVehicle - AI-controlled traffic vehicle that follows navigation graph.
 * 
 * Uses NavigationGraph pathfinding to drive around the city.
 */
import { Vector2 } from '../../engine/math/Vector2.js';
import { RigidBody, OBBShape, NavigationGraph, NavNode } from '../../engine/index.js';
import { SpriteSheet } from '../../engine/sprites/SpriteSheet.js';

export interface AIVehicleConfig {
    speed: number;
    turnSpeed: number;
    width: number;
    height: number;
    mass: number;
}

export const DEFAULT_AI_CONFIG: AIVehicleConfig = {
    speed: 80,
    turnSpeed: 2.5,
    width: 24,
    height: 40,
    mass: 80
};

export class AIVehicle {
    body: RigidBody;
    config: AIVehicleConfig;
    navGraph: NavigationGraph;
    
    currentPath: NavNode[] = [];
    pathIndex: number = 0;
    
    spriteName: string;
    
    isActive: boolean = true;
    waitTimer: number = 0;

    constructor(
        navGraph: NavigationGraph,
        startNode: NavNode,
        config: Partial<AIVehicleConfig> = {},
        spriteName: string = 'cars_blue'
    ) {
        this.config = { ...DEFAULT_AI_CONFIG, ...config };
        this.navGraph = navGraph;
        this.spriteName = spriteName;

        this.body = new RigidBody(startNode.position.x, startNode.position.y, this.config.mass, 'dynamic');
        
        const shape = new OBBShape(this.config.width, this.config.height);
        this.body.setShape(shape);
        
        this.body.material.linearDamping = 0.3;
        this.body.material.angularDamping = 2.0;
        this.body.material.restitution = 0.2;

        this.chooseRandomDestination();
    }

    chooseRandomDestination(): void {
        const destNode = this.navGraph.getRandomNode();
        if (!destNode) return;

        const nearestNode = this.navGraph.getNearestNode(this.body.position);
        if (!nearestNode) return;

        if (nearestNode.id === destNode.id) {
            const connections = nearestNode.connections;
            if (connections.length > 0) {
                const randomEdge = connections[Math.floor(Math.random() * connections.length)];
                const nextNode = this.navGraph.nodes.get(randomEdge.targetId);
                if (nextNode) {
                    this.currentPath = [nextNode];
                    this.pathIndex = 0;
                    return;
                }
            }
        }

        const path = this.navGraph.findPath(nearestNode.id, destNode.id);
        if (path && path.length > 0) {
            this.currentPath = path;
            this.pathIndex = 0;
        }
    }

    update(dt: number): void {
        if (!this.isActive) return;

        if (this.waitTimer > 0) {
            this.waitTimer -= dt;
            this.body.velocity.x = 0;
            this.body.velocity.y = 0;
            return;
        }

        if (this.currentPath.length === 0 || this.pathIndex >= this.currentPath.length) {
            this.chooseRandomDestination();
            return;
        }

        const target = this.currentPath[this.pathIndex].position;
        const dir = target.sub(this.body.position);
        const distToTarget = dir.magnitude();

        if (distToTarget < 30) {
            this.pathIndex++;
            
            if (this.pathIndex >= this.currentPath.length) {
                this.waitTimer = Math.random() * 2;
                this.chooseRandomDestination();
            }
            return;
        }

        const targetAngle = Math.atan2(dir.x, -dir.y);
        const angleDiff = this.normalizeAngle(targetAngle - this.body.angle);
        
        const maxTurn = this.config.turnSpeed * dt;
        if (Math.abs(angleDiff) > maxTurn) {
            this.body.angle += Math.sign(angleDiff) * maxTurn;
        } else {
            this.body.angle = targetAngle;
        }

        const forward = new Vector2(-Math.sin(this.body.angle), -Math.cos(this.body.angle));
        
        let speed = this.config.speed;
        if (Math.abs(angleDiff) > 0.5) {
            speed *= 0.5;
        }
        
        this.body.wakeUp();
        const targetVelocity = forward.scale(speed);
        this.body.velocity.x = targetVelocity.x;
        this.body.velocity.y = targetVelocity.y;
    }

    private normalizeAngle(angle: number): number {
        while (angle > Math.PI) angle -= Math.PI * 2;
        while (angle < -Math.PI) angle += Math.PI * 2;
        return angle;
    }

    render(ctx: CanvasRenderingContext2D, sheet: SpriteSheet): void {
        const { x, y } = this.body.position;
        const angle = this.body.angle;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        
        const frame = sheet.getFrame(this.spriteName);
        if (frame && sheet.loaded) {
            sheet.draw(ctx, this.spriteName, -frame.w / 2, -frame.h / 2);
        } else {
            ctx.fillStyle = '#0066ff';
            ctx.fillRect(-this.config.width / 2, -this.config.height / 2, this.config.width, this.config.height);
        }
        
        ctx.restore();
    }

    getPosition(): Vector2 {
        return this.body.position;
    }

    getAngle(): number {
        return this.body.angle;
    }

    stop(): void {
        this.isActive = false;
        this.body.velocity.x = 0;
        this.body.velocity.y = 0;
    }

    resume(): void {
        this.isActive = true;
    }

    onCollision(impactSpeed: number): void {
        if (impactSpeed > 50) {
            this.waitTimer = 1.0;
            this.chooseRandomDestination();
        }
    }
}
