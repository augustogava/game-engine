/**
 * VehicleController - Realistic top-down car physics with drift mechanics.
 * 
 * Uses lateral velocity cancellation to simulate tire behavior.
 * Handbrake reduces lateral friction for drifting.
 */
import { Vector2 } from '../../engine/math/Vector2.js';
import { RigidBody, OBBShape } from '../../engine/index.js';
import { InputManager } from '../../engine/input/InputManager.js';
import { SpriteSheet } from '../../engine/sprites/SpriteSheet.js';

export interface VehicleConfig {
    maxSpeed: number;
    maxReverseSpeed: number;
    engineForce: number;
    brakeForce: number;
    turnSpeed: number;
    lateralFriction: number;
    handbrakeLatFriction: number;
    mass: number;
    width: number;
    height: number;
}

export const DEFAULT_VEHICLE_CONFIG: VehicleConfig = {
    maxSpeed: 300,
    maxReverseSpeed: 100,
    engineForce: 8000,
    brakeForce: 12000,
    turnSpeed: 3.5,
    lateralFriction: 0.92,
    handbrakeLatFriction: 0.15,
    mass: 100,
    width: 24,
    height: 40
};

export class VehicleController {
    body: RigidBody;
    config: VehicleConfig;
    
    isHandbraking: boolean = false;
    currentSpeed: number = 0;
    
    spriteName: string;
    
    headlightsOn: boolean = true;
    
    private forwardDir: Vector2 = new Vector2(0, -1);
    private rightDir: Vector2 = new Vector2(1, 0);

    constructor(x: number, y: number, config: Partial<VehicleConfig> = {}, spriteName: string = 'cars_red') {
        this.config = { ...DEFAULT_VEHICLE_CONFIG, ...config };
        this.spriteName = spriteName;

        this.body = new RigidBody(x, y, this.config.mass, 'dynamic');
        
        const shape = new OBBShape(this.config.width, this.config.height);
        this.body.setShape(shape);
        
        this.body.material.linearDamping = 0.5;
        this.body.material.angularDamping = 3.0;
        this.body.material.restitution = 0.3;
    }

    update(dt: number, input: InputManager): void {
        if (!input) {
            console.warn('VehicleController: input is undefined!');
            return;
        }

        const throttle = input.isKeyDown('KeyW') ? 1 : (input.isKeyDown('KeyS') ? -0.5 : 0);
        const steer = input.isKeyDown('KeyA') ? -1 : (input.isKeyDown('KeyD') ? 1 : 0);
        this.isHandbraking = input.isKeyDown('Space');

        this.updateDirections();

        this.currentSpeed = this.body.velocity.magnitude();

        if (this.currentSpeed > 5) {
            const turnFactor = Math.min(1, this.currentSpeed / 100);
            const effectiveTurn = steer * this.config.turnSpeed * turnFactor * dt;
            
            if (this.isHandbraking) {
                this.body.angle += effectiveTurn * 1.5;
            } else {
                this.body.angle += effectiveTurn;
            }
        }

        if (throttle !== 0) {
            this.body.wakeUp();
            const targetSpeed = throttle > 0 ? this.config.maxSpeed : this.config.maxReverseSpeed;
            
            if ((throttle > 0 && this.currentSpeed < targetSpeed) || 
                (throttle < 0 && this.currentSpeed < this.config.maxReverseSpeed)) {
                const force = this.forwardDir.scale(throttle * this.config.engineForce);
                this.body.applyForce(force);
            }
        }

        this.applyLateralFriction(dt);

        if (this.currentSpeed > this.config.maxSpeed) {
            this.body.velocity = this.body.velocity.normalize().scale(this.config.maxSpeed);
        }

        if (!this.isHandbraking && throttle === 0 && this.currentSpeed > 0) {
            const brakeFactor = Math.min(1, this.config.brakeForce * dt * 0.01);
            this.body.velocity = this.body.velocity.scale(1 - brakeFactor);
        }
    }

    private updateDirections(): void {
        const cos = Math.cos(this.body.angle);
        const sin = Math.sin(this.body.angle);
        
        this.forwardDir.x = -sin;
        this.forwardDir.y = -cos;
        
        this.rightDir.x = cos;
        this.rightDir.y = -sin;
    }

    private applyLateralFriction(dt: number): void {
        const lateralVel = this.getLateralVelocity();
        const lateralSpeed = lateralVel.magnitude();
        
        if (lateralSpeed < 0.1) return;

        const friction = this.isHandbraking ? this.config.handbrakeLatFriction : this.config.lateralFriction;
        
        const correction = lateralVel.scale(friction);
        this.body.velocity = this.body.velocity.sub(correction);
    }

    private getLateralVelocity(): Vector2 {
        const dot = this.body.velocity.dot(this.rightDir);
        return this.rightDir.scale(dot);
    }

    getForwardVelocity(): Vector2 {
        const dot = this.body.velocity.dot(this.forwardDir);
        return this.forwardDir.scale(dot);
    }

    getPosition(): Vector2 {
        return this.body.position;
    }

    getAngle(): number {
        return this.body.angle;
    }

    getSpeed(): number {
        return this.currentSpeed;
    }

    isDrifting(): boolean {
        const lateralSpeed = this.getLateralVelocity().magnitude();
        return lateralSpeed > 30 && this.currentSpeed > 50;
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
            ctx.fillStyle = '#ff3333';
            ctx.fillRect(-this.config.width / 2, -this.config.height / 2, this.config.width, this.config.height);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(-this.config.width / 2 + 2, -this.config.height / 2 + 2, 8, 4);
            ctx.fillRect(this.config.width / 2 - 10, -this.config.height / 2 + 2, 8, 4);
        }
        
        ctx.restore();
        
        ctx.save();
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, 25, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    getHeadlightPositions(): Vector2[] {
        const { x, y } = this.body.position;
        const angle = this.body.angle;
        
        const offsetForward = 20;
        const offsetSide = 10;
        
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        
        const leftLight = new Vector2(
            x + (-sin * offsetForward) + (-cos * offsetSide),
            y + (-cos * offsetForward) + (sin * offsetSide)
        );
        
        const rightLight = new Vector2(
            x + (-sin * offsetForward) + (cos * offsetSide),
            y + (-cos * offsetForward) + (-sin * offsetSide)
        );
        
        return [leftLight, rightLight];
    }

    applyDamage(impactSpeed: number): void {
        if (impactSpeed > 100) {
            this.config.maxSpeed *= 0.95;
        }
    }
}
