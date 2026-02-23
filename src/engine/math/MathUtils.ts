/**
 * MathUtils - Common math utility functions
 */
export const MathUtils = {
    PI2: Math.PI * 2,

    clamp(value: number, min: number, max: number): number {
        return Math.max(min, Math.min(max, value));
    },

    lerp(a: number, b: number, t: number): number {
        return a + (b - a) * t;
    },

    smoothstep(edge0: number, edge1: number, x: number): number {
        const t = MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
        return t * t * (3 - 2 * t);
    },

    smootherstep(edge0: number, edge1: number, x: number): number {
        const t = MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
        return t * t * t * (t * (t * 6 - 15) + 10);
    },

    map(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
        return outMin + (outMax - outMin) * ((value - inMin) / (inMax - inMin));
    },

    randomRange(min: number, max: number): number {
        return min + Math.random() * (max - min);
    },

    randomInt(min: number, max: number): number {
        return Math.floor(MathUtils.randomRange(min, max + 1));
    },

    randomSign(): number { return Math.random() < 0.5 ? -1 : 1; },

    degToRad(degrees: number): number { return degrees * (Math.PI / 180); },
    radToDeg(radians: number): number { return radians * (180 / Math.PI); },

    normalizeAngle(angle: number): number {
        while (angle > Math.PI) angle -= MathUtils.PI2;
        while (angle < -Math.PI) angle += MathUtils.PI2;
        return angle;
    },

    isPowerOf2(n: number): boolean { return (n & (n - 1)) === 0; },

    sign(n: number): number { return n < 0 ? -1 : n > 0 ? 1 : 0; },

    approximately(a: number, b: number, epsilon: number = 0.0001): boolean {
        return Math.abs(a - b) < epsilon;
    },

    gaussianRandom(mean: number = 0, stddev: number = 1): number {
        // Box-Muller transform
        const u = 1 - Math.random();
        const v = Math.random();
        const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(MathUtils.PI2 * v);
        return mean + z * stddev;
    },

    /**
     * Helper to test Axis-Aligned Bounding Box intersection
     */
    intersectRect(x1: number, y1: number, w1: number, h1: number,
        x2: number, y2: number, w2: number, h2: number): boolean {
        return x1 < x2 + w2 &&
            x1 + w1 > x2 &&
            y1 < y2 + h2 &&
            y1 + h1 > y2;
    },
} as const;
