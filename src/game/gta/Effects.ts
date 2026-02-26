/**
 * Effects - Visual effects for the GTA game.
 * 
 * Includes headlights, street lamps, blood decals, collision particles, and screen shake.
 */
import { Vector2 } from '../../engine/math/Vector2.js';
import { PointLight, SpotLight, LightColors, ParticleEmitter } from '../../engine/index.js';
import { SpriteSheet } from '../../engine/sprites/SpriteSheet.js';

export interface BloodDecal {
    position: Vector2;
    spriteName: string;
    alpha: number;
    rotation: number;
}

export interface CollisionEffect {
    position: Vector2;
    timer: number;
    intensity: number;
}

export class Effects {
    bloodDecals: BloodDecal[] = [];
    collisionEffects: CollisionEffect[] = [];
    
    streetLights: PointLight[] = [];
    headlights: SpotLight[] = [];
    
    screenShake: Vector2 = new Vector2(0, 0);
    private shakeIntensity: number = 0;
    private shakeDuration: number = 0;
    
    sparkEmitter: ParticleEmitter;
    bloodEmitter: ParticleEmitter;

    private maxDecals: number = 100;

    constructor() {
        this.sparkEmitter = new ParticleEmitter(0, 0, {
            lifeMin: 0.2,
            lifeMax: 0.4,
            speedMin: 100,
            speedMax: 300,
            emitAngle: 0,
            emitSpread: Math.PI,
            sizeMin: 2,
            sizeMax: 4,
            sizeEndFactor: 0,
            colorStart: [255, 200, 100, 1],
            colorEnd: [255, 100, 0, 0],
            gravity: 0,
            emitRate: 0,
            maxParticles: 100,
            shape: 'circle'
        });
        this.sparkEmitter.active = false;

        this.bloodEmitter = new ParticleEmitter(0, 0, {
            lifeMin: 0.3,
            lifeMax: 0.6,
            speedMin: 30,
            speedMax: 80,
            emitAngle: 0,
            emitSpread: Math.PI,
            sizeMin: 3,
            sizeMax: 5,
            sizeEndFactor: 0.5,
            colorStart: [150, 0, 0, 1],
            colorEnd: [100, 0, 0, 0.5],
            gravity: 50,
            emitRate: 0,
            maxParticles: 50,
            shape: 'circle'
        });
        this.bloodEmitter.active = false;
    }

    createStreetLight(x: number, y: number): PointLight {
        const light = new PointLight(
            new Vector2(x, y),
            150,
            { r: 255, g: 200, b: 100 },
            0.6
        );
        this.streetLights.push(light);
        return light;
    }

    createHeadlights(positions: Vector2[], angle: number): void {
        this.headlights = [];
        
        for (const pos of positions) {
            const light = new SpotLight(
                pos.clone(),
                angle - Math.PI / 2,
                Math.PI / 6,
                Math.PI / 12,
                200,
                { r: 255, g: 255, b: 230 },
                0.8
            );
            this.headlights.push(light);
        }
    }

    updateHeadlights(positions: Vector2[], angle: number): void {
        for (let i = 0; i < this.headlights.length && i < positions.length; i++) {
            this.headlights[i].position.x = positions[i].x;
            this.headlights[i].position.y = positions[i].y;
            this.headlights[i].direction = angle - Math.PI / 2;
        }
    }

    addBloodDecal(x: number, y: number): void {
        if (this.bloodDecals.length >= this.maxDecals) {
            this.bloodDecals.shift();
        }

        const decal: BloodDecal = {
            position: new Vector2(x, y),
            spriteName: Math.random() > 0.5 ? 'blood_pool' : 'blood_splatter',
            alpha: 1.0,
            rotation: Math.random() * Math.PI * 2
        };
        
        this.bloodDecals.push(decal);
        
        this.bloodEmitter.position.x = x;
        this.bloodEmitter.position.y = y;
        this.bloodEmitter.burst(20);
    }

    addCollisionEffect(x: number, y: number, intensity: number): void {
        this.collisionEffects.push({
            position: new Vector2(x, y),
            timer: 0.1,
            intensity
        });
        
        this.sparkEmitter.position.x = x;
        this.sparkEmitter.position.y = y;
        this.sparkEmitter.burst(Math.floor(intensity / 10));
        
        this.triggerScreenShake(intensity * 0.01, 0.1);
    }

    triggerScreenShake(intensity: number, duration: number): void {
        this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
        this.shakeDuration = Math.max(this.shakeDuration, duration);
    }

    update(dt: number): void {
        this.sparkEmitter.update(dt);
        this.bloodEmitter.update(dt);
        
        for (let i = this.collisionEffects.length - 1; i >= 0; i--) {
            this.collisionEffects[i].timer -= dt;
            if (this.collisionEffects[i].timer <= 0) {
                this.collisionEffects.splice(i, 1);
            }
        }
        
        if (this.shakeDuration > 0) {
            this.shakeDuration -= dt;
            this.screenShake.x = (Math.random() - 0.5) * 2 * this.shakeIntensity;
            this.screenShake.y = (Math.random() - 0.5) * 2 * this.shakeIntensity;
            
            if (this.shakeDuration <= 0) {
                this.shakeIntensity = 0;
                this.screenShake.set(0, 0);
            }
        }
    }

    renderDecals(ctx: CanvasRenderingContext2D, sheet: SpriteSheet): void {
        for (const decal of this.bloodDecals) {
            const frame = sheet.getFrame(decal.spriteName);
            if (!frame) continue;
            
            ctx.save();
            ctx.globalAlpha = decal.alpha;
            ctx.translate(decal.position.x, decal.position.y);
            ctx.rotate(decal.rotation);
            sheet.draw(ctx, decal.spriteName, -frame.w / 2, -frame.h / 2);
            ctx.restore();
        }
    }

    renderCollisionEffects(ctx: CanvasRenderingContext2D): void {
        for (const effect of this.collisionEffects) {
            const alpha = effect.timer / 0.1;
            const size = effect.intensity * 0.5;
            
            ctx.save();
            ctx.globalAlpha = alpha * 0.5;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(effect.position.x, effect.position.y, size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    renderParticles(ctx: CanvasRenderingContext2D): void {
        this.sparkEmitter.render(ctx);
        this.bloodEmitter.render(ctx);
    }

    getAllLights(): (PointLight | SpotLight)[] {
        return [...this.streetLights, ...this.headlights];
    }

    clearDecals(): void {
        this.bloodDecals = [];
    }

    reset(): void {
        this.bloodDecals = [];
        this.collisionEffects = [];
        this.screenShake.set(0, 0);
        this.shakeIntensity = 0;
        this.shakeDuration = 0;
    }
}
