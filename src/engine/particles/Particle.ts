/**
 * Particle - Single particle data, kept minimal for pool-friendly allocation.
 */
import { Vector2 } from '../math/Vector2.js';

export class Particle {
    // Transform
    position: Vector2 = Vector2.zero();
    velocity: Vector2 = Vector2.zero();

    // Angular
    angle: number = 0;
    angularVelocity: number = 0;

    // Life
    life: number = 0;       // remaining life in seconds
    maxLife: number = 1;    // total life at birth

    // Visuals
    size: number = 4;
    sizeEnd: number = 0;    // size at death (interpolated)

    // Color (RGBA 0-255)
    r: number = 255;
    g: number = 255;
    b: number = 255;
    a: number = 1;          // opacity 0-1

    // End color (interpolated over life)
    rEnd: number = 255;
    gEnd: number = 255;
    bEnd: number = 255;
    aEnd: number = 0;

    // Physics
    gravity: number = 0;        // pixels/sec^2 downward
    drag: number = 0;           // velocity multiplier per second (0=no drag)

    // Rendering
    blendMode: GlobalCompositeOperation = 'source-over';
    shape: 'circle' | 'square' | 'line' = 'circle';

    active = false;

    /** Normalized life progress 0=born, 1=dead */
    get progress(): number {
        return 1 - (this.life / this.maxLife);
    }

    reset(): void {
        this.position.set(0, 0);
        this.velocity.set(0, 0);
        this.angle = 0;
        this.angularVelocity = 0;
        this.life = 0;
        this.maxLife = 1;
        this.size = 4;
        this.sizeEnd = 0;
        this.r = 255; this.g = 255; this.b = 255; this.a = 1;
        this.rEnd = 255; this.gEnd = 255; this.bEnd = 255; this.aEnd = 0;
        this.gravity = 0;
        this.drag = 0;
        this.blendMode = 'source-over';
        this.shape = 'circle';
        this.active = false;
    }
}
