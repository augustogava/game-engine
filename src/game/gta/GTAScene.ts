/**
 * GTAScene - Main game scene orchestrating all GTA systems.
 * 
 * Manages player car, AI vehicles, pedestrians, city map, physics, and effects.
 */
import { Scene, SceneContext } from '../../engine/scene/Scene.js';
import { Vector2 } from '../../engine/math/Vector2.js';
import { PhysicsWorld2, CollisionManifold, RigidBody, LightingRenderer } from '../../engine/index.js';
import { loadGTASprites, GTASprites, getCarSprites, getPedestrianSprites } from './GTASpriteLoader.js';
import { VehicleController } from './VehicleController.js';
import { AIVehicle } from './AIVehicle.js';
import { Pedestrian } from './Pedestrian.js';
import { CityMap } from './CityMap.js';
import { Effects } from './Effects.js';

export class GTAScene extends Scene {
    private sprites!: GTASprites;
    private cityMap!: CityMap;
    private physics!: PhysicsWorld2;
    private lighting!: LightingRenderer;
    private effects!: Effects;
    
    private playerCar!: VehicleController;
    private aiVehicles: AIVehicle[] = [];
    private pedestrians: Pedestrian[] = [];
    
    private loaded: boolean = false;
    private debugMode: boolean = false;
    
    private readonly AI_VEHICLE_COUNT = 3;
    private readonly PEDESTRIAN_COUNT = 8;

    onEnter(ctx: SceneContext): void {
        super.onEnter(ctx);
        this.init();
    }

    private async init(): Promise<void> {
        this.sprites = loadGTASprites();
        
        this.cityMap = new CityMap({
            blocksX: 4,
            blocksY: 3,
            blockSize: 350,
            roadWidth: 100,
            sidewalkWidth: 40,
            tileSize: 32
        });
        
        this.physics = new PhysicsWorld2();
        this.physics.gravity = new Vector2(0, 0);
        
        this.effects = new Effects();
        
        this.lighting = new LightingRenderer(this.ctx!.renderer);
        this.lighting.ambientColor = { r: 100, g: 100, b: 120 };
        this.lighting.ambientIntensity = 0.3;
        this.lighting.enabled = false;
        
        this.spawnPlayer();
        this.spawnAIVehicles();
        this.spawnPedestrians();
        this.setupStreetLights();
        this.setupCollisionHandlers();
        
        for (const obj of this.cityMap.getSolidObjects()) {
            this.physics.addBody(obj.body);
        }
        
        this.loaded = true;
        
        console.log('GTAScene initialized:', {
            hasInput: !!this.ctx?.input,
            playerPos: this.playerCar.getPosition(),
            aiVehicles: this.aiVehicles.length,
            pedestrians: this.pedestrians.length
        });
        
        if ((window as any).__hideLoading) {
            (window as any).__hideLoading();
        }
    }

    private spawnPlayer(): void {
        const spawnPos = this.cityMap.getSpawnPositionOnRoad();
        this.playerCar = new VehicleController(spawnPos.x, spawnPos.y, {}, 'cars_red');
        this.physics.addBody(this.playerCar.body);
        this.playerCar.body.tag = 'player';
        
        this.effects.createHeadlights(this.playerCar.getHeadlightPositions(), this.playerCar.getAngle());
        for (const light of this.effects.headlights) {
            this.lighting.addLight(light);
        }
        
        if (this.ctx) {
            this.ctx.camera.position.x = spawnPos.x;
            this.ctx.camera.position.y = spawnPos.y;
            this.ctx.camera.zoom = 1.5;
        }
    }

    private spawnAIVehicles(): void {
        const carSprites = getCarSprites().filter(s => s !== 'cars_red');
        
        for (let i = 0; i < this.AI_VEHICLE_COUNT; i++) {
            const startNode = this.cityMap.navGraph.getRandomNode();
            if (!startNode) continue;
            
            const spriteName = carSprites[i % carSprites.length];
            const aiCar = new AIVehicle(this.cityMap.navGraph, startNode, {}, spriteName);
            aiCar.body.tag = 'ai_car';
            
            this.aiVehicles.push(aiCar);
            this.physics.addBody(aiCar.body);
        }
    }

    private spawnPedestrians(): void {
        const pedSprites = getPedestrianSprites();
        
        for (let i = 0; i < this.PEDESTRIAN_COUNT; i++) {
            const spawnPos = this.cityMap.getSpawnPositionOnSidewalk();
            if (!spawnPos) continue;
            
            const spriteName = pedSprites[i % pedSprites.length];
            const ped = new Pedestrian(
                this.cityMap.astar,
                this.cityMap.config.tileSize,
                spawnPos.x,
                spawnPos.y,
                {},
                spriteName
            );
            ped.body.tag = 'pedestrian';
            
            this.pedestrians.push(ped);
            this.physics.addBody(ped.body);
        }
    }

    private setupStreetLights(): void {
        for (const lampPos of this.cityMap.lampPositions) {
            const light = this.effects.createStreetLight(lampPos.x, lampPos.y);
            this.lighting.addLight(light);
        }
    }

    private setupCollisionHandlers(): void {
        this.physics.on('collision', (manifold: CollisionManifold) => {
            this.handleCollision(manifold);
        });
    }

    private handleCollision(manifold: CollisionManifold): void {
        const bodyA = manifold.bodyA;
        const bodyB = manifold.bodyB;
        
        const relVel = bodyA.velocity.sub(bodyB.velocity);
        const impactSpeed = relVel.magnitude();
        
        const isPlayerInvolved = bodyA.tag === 'player' || bodyB.tag === 'player';
        const playerBody = bodyA.tag === 'player' ? bodyA : (bodyB.tag === 'player' ? bodyB : null);
        const otherBody = playerBody === bodyA ? bodyB : bodyA;
        
        if (isPlayerInvolved && otherBody) {
            if (otherBody.tag === 'pedestrian') {
                this.handlePedestrianHit(otherBody, impactSpeed);
            } else if (otherBody.tag === 'building' || otherBody.tag === 'lamp') {
                if (impactSpeed > 30) {
                    const contactPoint = manifold.contacts[0]?.point || playerBody!.position;
                    this.effects.addCollisionEffect(contactPoint.x, contactPoint.y, impactSpeed);
                }
            } else if (otherBody.tag === 'hydrant' || otherBody.tag === 'trash') {
                this.handleCrushableHit(otherBody, impactSpeed);
            } else if (otherBody.tag === 'ai_car') {
                if (impactSpeed > 30) {
                    const contactPoint = manifold.contacts[0]?.point || playerBody!.position;
                    this.effects.addCollisionEffect(contactPoint.x, contactPoint.y, impactSpeed);
                }
            }
        }
        
        const isAICarInvolved = bodyA.tag === 'ai_car' || bodyB.tag === 'ai_car';
        if (isAICarInvolved) {
            const aiBody = bodyA.tag === 'ai_car' ? bodyA : bodyB;
            const otherBodyAI = aiBody === bodyA ? bodyB : bodyA;
            
            if (otherBodyAI.tag === 'pedestrian') {
                this.handlePedestrianHit(otherBodyAI, impactSpeed);
            }
        }
    }

    private handlePedestrianHit(pedBody: RigidBody, impactSpeed: number): void {
        const ped = this.pedestrians.find(p => p.body === pedBody);
        if (ped && ped.isAlive()) {
            const killed = ped.onHit(impactSpeed);
            if (killed) {
                this.effects.addBloodDecal(ped.getPosition().x, ped.getPosition().y);
            }
        }
    }

    private handleCrushableHit(body: RigidBody, impactSpeed: number): void {
        if (impactSpeed < 30) return;
        
        const obj = this.cityMap.objects.find(o => o.body === body);
        if (obj && obj.crushable && !obj.destroyed) {
            obj.destroyed = true;
            this.physics.removeBody(body);
            this.effects.addCollisionEffect(body.position.x, body.position.y, impactSpeed * 0.5);
        }
    }

    update(dt: number): void {
        if (!this.loaded || !this.ctx) return;
        
        if (this.ctx.input.isKeyPressed('F3')) {
            this.debugMode = !this.debugMode;
            console.log('Debug mode:', this.debugMode);
        }
        
        this.playerCar.update(dt, this.ctx.input);
        
        for (const aiCar of this.aiVehicles) {
            aiCar.update(dt);
        }
        
        for (const ped of this.pedestrians) {
            ped.update(dt);
        }
        
        this.physics.step(dt);
        
        this.effects.updateHeadlights(
            this.playerCar.getHeadlightPositions(),
            this.playerCar.getAngle()
        );
        this.effects.update(dt);
        
        this.updateCamera();
    }

    private updateCamera(): void {
        if (!this.ctx) return;
        
        const camera = this.ctx.camera;
        const renderer = this.ctx.renderer;
        const playerPos = this.playerCar.getPosition();
        const speed = this.playerCar.getSpeed();
        
        const baseZoom = 1.5;
        const minZoom = 0.8;
        const maxZoom = 2.0;
        
        const speedFactor = Math.min(1, speed / 200);
        const targetZoom = baseZoom - speedFactor * (baseZoom - minZoom);
        
        const currentZoom = camera.zoom;
        camera.zoom = currentZoom + (targetZoom - currentZoom) * 0.05;
        camera.zoom = Math.max(minZoom, Math.min(maxZoom, camera.zoom));
        
        const shake = this.effects.screenShake;
        let targetX = playerPos.x + shake.x;
        let targetY = playerPos.y + shake.y;
        
        const worldWidth = this.cityMap.getWorldWidth();
        const worldHeight = this.cityMap.getWorldHeight();
        const viewWidth = renderer.width / camera.zoom;
        const viewHeight = renderer.height / camera.zoom;
        
        const minX = viewWidth / 2;
        const maxX = worldWidth - viewWidth / 2;
        const minY = viewHeight / 2;
        const maxY = worldHeight - viewHeight / 2;
        
        if (maxX > minX) {
            targetX = Math.max(minX, Math.min(maxX, targetX));
        } else {
            targetX = worldWidth / 2;
        }
        
        if (maxY > minY) {
            targetY = Math.max(minY, Math.min(maxY, targetY));
        } else {
            targetY = worldHeight / 2;
        }
        
        camera.position.x += (targetX - camera.position.x) * 0.1;
        camera.position.y += (targetY - camera.position.y) * 0.1;
    }

    render(): void {
        if (!this.loaded || !this.ctx) return;
        
        const { renderer, camera } = this.ctx;
        const ctx = renderer.ctx;
        
        renderer.clear('#1a1a2e');
        
        ctx.save();
        
        const canvasWidth = renderer.width;
        const canvasHeight = renderer.height;
        
        ctx.translate(canvasWidth / 2, canvasHeight / 2);
        ctx.scale(camera.zoom, camera.zoom);
        ctx.translate(-camera.position.x, -camera.position.y);
        
        const viewWidth = canvasWidth / camera.zoom;
        const viewHeight = canvasHeight / camera.zoom;
        const cameraX = camera.position.x - viewWidth / 2;
        const cameraY = camera.position.y - viewHeight / 2;
        
        this.cityMap.render(ctx, this.sprites.sheet, cameraX, cameraY, viewWidth, viewHeight);
        
        this.effects.renderDecals(ctx, this.sprites.sheet);
        
        for (const ped of this.pedestrians) {
            if (ped.isDead()) {
                ped.render(ctx, this.sprites.sheet);
            }
        }
        
        for (const ped of this.pedestrians) {
            if (ped.isAlive()) {
                ped.render(ctx, this.sprites.sheet);
            }
        }
        
        for (const aiCar of this.aiVehicles) {
            aiCar.render(ctx, this.sprites.sheet);
        }
        
        this.playerCar.render(ctx, this.sprites.sheet);
        
        this.effects.renderCollisionEffects(ctx);
        this.effects.renderParticles(ctx);
        
        ctx.restore();
        
        this.lighting.render(camera);
        
        this.renderHUD(ctx);
        
        if (this.debugMode) {
            this.renderDebug(ctx);
        }
    }

    private renderHUD(ctx: CanvasRenderingContext2D): void {
        const speed = Math.round(this.playerCar.getSpeed());
        const pos = this.playerCar.getPosition();
        const input = this.ctx?.input;
        
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(10, 10, 220, 140);
        
        ctx.fillStyle = '#fff';
        ctx.font = '14px monospace';
        ctx.fillText(`Speed: ${speed} px/s`, 20, 30);
        ctx.fillText(`Pos: ${Math.round(pos.x)}, ${Math.round(pos.y)}`, 20, 50);
        ctx.fillText(`AI Cars: ${this.aiVehicles.length}`, 20, 70);
        ctx.fillText(`Pedestrians: ${this.pedestrians.length}`, 20, 90);
        
        const w = input?.isKeyDown('KeyW') ? 'W' : '-';
        const a = input?.isKeyDown('KeyA') ? 'A' : '-';
        const s = input?.isKeyDown('KeyS') ? 'S' : '-';
        const d = input?.isKeyDown('KeyD') ? 'D' : '-';
        const space = input?.isKeyDown('Space') ? 'BRAKE' : '-';
        ctx.fillText(`Input: ${w}${a}${s}${d} ${space}`, 20, 110);
        
        const vel = this.playerCar.body.velocity;
        ctx.fillText(`Vel: ${vel.x.toFixed(1)}, ${vel.y.toFixed(1)}`, 20, 130);
        
        if (this.playerCar.isDrifting()) {
            ctx.fillStyle = '#ff6600';
            ctx.fillText('DRIFTING!', 150, 30);
        }
        
        if (this.playerCar.isHandbraking) {
            ctx.fillStyle = '#ff0000';
            ctx.fillText('HANDBRAKE', 150, 30);
        }
        
        ctx.restore();
    }

    private renderDebug(ctx: CanvasRenderingContext2D): void {
        if (!this.ctx) return;
        
        const { camera, renderer } = this.ctx;
        
        ctx.save();
        ctx.translate(renderer.width / 2, renderer.height / 2);
        ctx.scale(camera.zoom, camera.zoom);
        ctx.translate(-camera.position.x, -camera.position.y);
        
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 1;
        for (const body of this.physics.bodies) {
            const { x, y } = body.position;
            if (body.shape) {
                const aabb = body.shape.getAABB(body.position, body.angle);
                ctx.strokeRect(
                    aabb.minX, aabb.minY,
                    aabb.maxX - aabb.minX, aabb.maxY - aabb.minY
                );
            }
            ctx.fillStyle = body.isSleeping ? '#888888' : '#00ff00';
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.strokeStyle = '#ff00ff';
        ctx.lineWidth = 2;
        for (const node of this.cityMap.navGraph.nodes.values()) {
            ctx.beginPath();
            ctx.arc(node.position.x, node.position.y, 8, 0, Math.PI * 2);
            ctx.stroke();
            
            for (const edge of node.connections) {
                const target = this.cityMap.navGraph.nodes.get(edge.targetId);
                if (target) {
                    ctx.beginPath();
                    ctx.moveTo(node.position.x, node.position.y);
                    ctx.lineTo(target.position.x, target.position.y);
                    ctx.stroke();
                }
            }
        }
        
        ctx.restore();
        
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(10, 160, 200, 100);
        ctx.fillStyle = '#00ff00';
        ctx.font = '12px monospace';
        ctx.fillText('DEBUG MODE (F3 to toggle)', 20, 180);
        ctx.fillText(`Physics bodies: ${this.physics.bodies.length}`, 20, 200);
        ctx.fillText(`Nav nodes: ${this.cityMap.navGraph.getNodeCount()}`, 20, 220);
        ctx.fillText(`Sprite loaded: ${this.sprites.sheet.loaded}`, 20, 240);
        ctx.restore();
    }

    onExit(): void {
        this.effects.reset();
    }

    onResize(width: number, height: number): void {
    }
}
