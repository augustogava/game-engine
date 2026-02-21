/**
 * Vector2 - 2D vector math class
 */
export class Vector2 {
    constructor(public x: number = 0, public y: number = 0) { }

    static zero(): Vector2 { return new Vector2(0, 0); }
    static one(): Vector2 { return new Vector2(1, 1); }
    static fromAngle(angle: number, length: number = 1): Vector2 {
        return new Vector2(Math.cos(angle) * length, Math.sin(angle) * length);
    }

    set(x: number, y: number): this { this.x = x; this.y = y; return this; }
    clone(): Vector2 { return new Vector2(this.x, this.y); }

    add(v: Vector2): Vector2 { return new Vector2(this.x + v.x, this.y + v.y); }
    addSelf(v: Vector2): this { this.x += v.x; this.y += v.y; return this; }
    sub(v: Vector2): Vector2 { return new Vector2(this.x - v.x, this.y - v.y); }
    subSelf(v: Vector2): this { this.x -= v.x; this.y -= v.y; return this; }
    scale(s: number): Vector2 { return new Vector2(this.x * s, this.y * s); }
    scaleSelf(s: number): this { this.x *= s; this.y *= s; return this; }
    negate(): Vector2 { return new Vector2(-this.x, -this.y); }
    negateSelf(): this { this.x = -this.x; this.y = -this.y; return this; }

    dot(v: Vector2): number { return this.x * v.x + this.y * v.y; }
    cross(v: Vector2): number { return this.x * v.y - this.y * v.x; }

    magnitudeSq(): number { return this.x * this.x + this.y * this.y; }
    magnitude(): number { return Math.sqrt(this.magnitudeSq()); }

    normalize(): Vector2 {
        const m = this.magnitude();
        return m > 0 ? this.scale(1 / m) : Vector2.zero();
    }
    normalizeSelf(): this {
        const m = this.magnitude();
        if (m > 0) { this.x /= m; this.y /= m; }
        return this;
    }

    distance(v: Vector2): number { return this.sub(v).magnitude(); }
    distanceSq(v: Vector2): number { return this.sub(v).magnitudeSq(); }

    angle(): number { return Math.atan2(this.y, this.x); }
    angleTo(v: Vector2): number { return Math.atan2(v.y - this.y, v.x - this.x); }

    lerp(v: Vector2, t: number): Vector2 {
        return new Vector2(this.x + (v.x - this.x) * t, this.y + (v.y - this.y) * t);
    }

    perpendicular(): Vector2 { return new Vector2(-this.y, this.x); }

    rotate(angle: number): Vector2 {
        const c = Math.cos(angle), s = Math.sin(angle);
        return new Vector2(this.x * c - this.y * s, this.x * s + this.y * c);
    }

    equals(v: Vector2, epsilon: number = 0.0001): boolean {
        return Math.abs(this.x - v.x) < epsilon && Math.abs(this.y - v.y) < epsilon;
    }

    toString(): string { return `Vector2(${this.x.toFixed(3)}, ${this.y.toFixed(3)})`; }
}
