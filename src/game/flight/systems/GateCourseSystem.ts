import * as BABYLON from '@babylonjs/core';
import type { FlightSceneSimple } from '../../FlightSceneSimple.js';
import { FT_TO_M } from '../constants/index.js';

const GATE_RADIUS_DEFAULT_M = 120;
const GATE_RADIUS_MIN_M = 30;
const GATE_RADIUS_MAX_M = 600;
const GATE_TUBE_RATIO = 0.08;
const GATE_TESSELLATION = 48;
const GATE_MIN_COUNT = 2;
const GATE_MAX_FRAME_TRAVEL_M = 600;
const GATE_MISS_REPORT_RADIUS_FACTOR = 4;
const GATE_DIRECTION_EPSILON = 1e-6;
const GATE_ALPHA_NEXT = 0.95;
const GATE_ALPHA_UPCOMING = 0.4;
const GATE_COLOR_NEXT = { r: 1, g: 0.85, b: 0.2 };
const GATE_COLOR_UPCOMING = { r: 0.25, g: 1, b: 0.65 };
const MS_PER_SECOND = 1000;

export const GATE_EVENT_NONE = 0;
export const GATE_EVENT_PASSED = 1;
export const GATE_EVENT_MISSED = 2;
export const GATE_EVENT_FINISHED = 3;
export const GATE_EVENT_RESET = 4;

export interface GateWaypoint {
    latitude: number;
    longitude: number;
    altitude_ft: number | null;
    name?: string | null;
}

interface Gate {
    center: BABYLON.Vector3;
    normal: BABYLON.Vector3;
    mesh: BABYLON.Mesh | null;
}

export class GateCourseSystem {
    private readonly scene: any;
    private _gates: Gate[] = [];
    private _radiusM = GATE_RADIUS_DEFAULT_M;
    private _nextIndex = 0;
    private _elapsedMs = 0;
    private _running = false;
    private _finished = false;
    private _hasPrev = false;
    private readonly _prev = new BABYLON.Vector3();
    private readonly _crossing = new BABYLON.Vector3();
    private _materialNext: BABYLON.StandardMaterial | null = null;
    private _materialUpcoming: BABYLON.StandardMaterial | null = null;

    constructor(scene: FlightSceneSimple) {
        this.scene = scene;
    }

    isActive(): boolean {
        return this._gates.length >= GATE_MIN_COUNT;
    }

    get total(): number {
        return this._gates.length;
    }

    get nextIndex(): number {
        return this._nextIndex;
    }

    get elapsedMs(): number {
        return this._elapsedMs;
    }

    get isRunning(): boolean {
        return this._running;
    }

    get isFinished(): boolean {
        return this._finished;
    }

    start(waypoints: GateWaypoint[] | null | undefined, radiusM: number | null | undefined): boolean {
        this.stop();
        const babylonScene: BABYLON.Scene | null = this.scene.scene ?? null;
        const planeRoot: BABYLON.TransformNode | null = this.scene.planeRoot ?? null;
        if (!babylonScene || !planeRoot) {
            console.warn('[Gates] Course not built: scene or aircraft not ready');
            return false;
        }
        const requestedRadius = Number(radiusM);
        this._radiusM = Number.isFinite(requestedRadius) && requestedRadius > 0
            ? Math.max(GATE_RADIUS_MIN_M, Math.min(GATE_RADIUS_MAX_M, requestedRadius))
            : GATE_RADIUS_DEFAULT_M;
        const fallbackAltM = (Number.isFinite(this.scene.refAlt) ? this.scene.refAlt : 0) + planeRoot.position.y;
        const centers: BABYLON.Vector3[] = [];
        for (const wp of Array.isArray(waypoints) ? waypoints : []) {
            const lat = Number(wp?.latitude);
            const lon = Number(wp?.longitude);
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
                console.warn('[Gates] Waypoint skipped: invalid coordinates');
                continue;
            }
            const altFt = wp?.altitude_ft == null ? Number.NaN : Number(wp.altitude_ft);
            const altM = Number.isFinite(altFt) ? altFt * FT_TO_M : fallbackAltM;
            centers.push(this.scene._latLonToLocal(lat, lon, altM));
        }
        if (centers.length < GATE_MIN_COUNT) {
            console.warn(`[Gates] Course not built: ${centers.length} valid gate(s), at least ${GATE_MIN_COUNT} are needed`);
            return false;
        }
        this._materialNext = this.buildMaterial(babylonScene, 'gateRingNextMat', GATE_COLOR_NEXT, GATE_ALPHA_NEXT);
        this._materialUpcoming = this.buildMaterial(babylonScene, 'gateRingUpcomingMat', GATE_COLOR_UPCOMING, GATE_ALPHA_UPCOMING);
        for (let i = 0; i < centers.length; i++) {
            const normal = this.gateNormal(centers, i, planeRoot.position);
            const mesh = BABYLON.MeshBuilder.CreateTorus(`gateRing_${i}`, {
                diameter: this._radiusM * 2,
                thickness: this._radiusM * GATE_TUBE_RATIO,
                tessellation: GATE_TESSELLATION,
            }, babylonScene);
            mesh.position.copyFrom(centers[i]);
            mesh.rotationQuaternion = BABYLON.Quaternion.Identity();
            BABYLON.Quaternion.FromUnitVectorsToRef(BABYLON.Vector3.UpReadOnly, normal, mesh.rotationQuaternion);
            mesh.isPickable = false;
            mesh.applyFog = false;
            mesh.receiveShadows = false;
            this._gates.push({ center: centers[i], normal, mesh });
        }
        this.resetProgress();
        console.log(`[Gates] Course built: gates=${this._gates.length} radiusM=${this._radiusM}`);
        return true;
    }

    update(dt: number): number {
        if (!this.isActive() || this._finished) return GATE_EVENT_NONE;
        const pos: BABYLON.Vector3 | null = this.scene.planeRoot?.position ?? null;
        if (!pos) return GATE_EVENT_NONE;
        if (!this._hasPrev) {
            this._prev.copyFrom(pos);
            this._hasPrev = true;
            return GATE_EVENT_NONE;
        }
        if (BABYLON.Vector3.Distance(this._prev, pos) > GATE_MAX_FRAME_TRAVEL_M) {
            const hadProgress = this._nextIndex > 0;
            this.resetProgress();
            console.debug('[Gates] Aircraft repositioned; course progress reset');
            return hadProgress ? GATE_EVENT_RESET : GATE_EVENT_NONE;
        }
        const dtMs = (Number.isFinite(dt) ? Math.max(0, dt) : 0) * MS_PER_SECOND;
        const gate = this._gates[this._nextIndex];
        let event = GATE_EVENT_NONE;
        let crossingFraction = -1;
        const before = BABYLON.Vector3.Dot(this._prev.subtractToRef(gate.center, this._crossing), gate.normal);
        const after = BABYLON.Vector3.Dot(pos.subtractToRef(gate.center, this._crossing), gate.normal);
        if (before < 0 && after >= 0) {
            const fraction = before / (before - after);
            BABYLON.Vector3.LerpToRef(this._prev, pos, fraction, this._crossing);
            const offsetM = BABYLON.Vector3.Distance(this._crossing, gate.center);
            if (offsetM <= this._radiusM) crossingFraction = fraction;
            else if (offsetM <= this._radiusM * GATE_MISS_REPORT_RADIUS_FACTOR) event = GATE_EVENT_MISSED;
        }
        if (crossingFraction >= 0) {
            const isFirst = this._nextIndex === 0;
            const isLast = this._nextIndex === this._gates.length - 1;
            if (isFirst) {
                this._running = true;
                this._elapsedMs = (1 - crossingFraction) * dtMs;
            } else if (isLast) {
                this._elapsedMs += crossingFraction * dtMs;
                this._running = false;
                this._finished = true;
            } else {
                this._elapsedMs += dtMs;
            }
            if (gate.mesh) gate.mesh.setEnabled(false);
            this._nextIndex++;
            this.applyHighlight();
            event = this._finished ? GATE_EVENT_FINISHED : GATE_EVENT_PASSED;
            console.log(`[Gates] Gate ${this._nextIndex}/${this._gates.length} passed at ${this._elapsedMs.toFixed(0)}ms${this._finished ? ' (finish)' : ''}`);
        } else if (this._running) {
            this._elapsedMs += dtMs;
        }
        this._prev.copyFrom(pos);
        return event;
    }

    resetProgress(): void {
        this._nextIndex = 0;
        this._elapsedMs = 0;
        this._running = false;
        this._finished = false;
        this._hasPrev = false;
        for (const gate of this._gates) gate.mesh?.setEnabled(true);
        this.applyHighlight();
    }

    stop(): void {
        for (const gate of this._gates) {
            try { gate.mesh?.dispose(); } catch (err) { console.warn('[Gates] Ring dispose failed:', err); }
        }
        this._gates = [];
        try { this._materialNext?.dispose(); } catch (err) { console.warn('[Gates] Material dispose failed:', err); }
        try { this._materialUpcoming?.dispose(); } catch (err) { console.warn('[Gates] Material dispose failed:', err); }
        this._materialNext = null;
        this._materialUpcoming = null;
        this._nextIndex = 0;
        this._elapsedMs = 0;
        this._running = false;
        this._finished = false;
        this._hasPrev = false;
    }

    dispose(): void {
        this.stop();
    }

    private gateNormal(centers: BABYLON.Vector3[], index: number, approachFrom: BABYLON.Vector3): BABYLON.Vector3 {
        const incomingFrom = index > 0 ? centers[index - 1] : approachFrom;
        const incoming = this.horizontalDirection(incomingFrom, centers[index]);
        const outgoing = index < centers.length - 1 ? this.horizontalDirection(centers[index], centers[index + 1]) : null;
        if (!incoming && !outgoing) return new BABYLON.Vector3(0, 0, -1);
        if (!incoming) return outgoing as BABYLON.Vector3;
        if (!outgoing) return incoming;
        const bisector = incoming.add(outgoing);
        if (bisector.lengthSquared() < GATE_DIRECTION_EPSILON) return incoming;
        return bisector.normalize();
    }

    private horizontalDirection(from: BABYLON.Vector3, to: BABYLON.Vector3): BABYLON.Vector3 | null {
        const direction = new BABYLON.Vector3(to.x - from.x, 0, to.z - from.z);
        if (direction.lengthSquared() < GATE_DIRECTION_EPSILON) return null;
        return direction.normalize();
    }

    private buildMaterial(scene: BABYLON.Scene, name: string, color: { r: number; g: number; b: number }, alpha: number): BABYLON.StandardMaterial {
        const material = new BABYLON.StandardMaterial(name, scene);
        material.emissiveColor = new BABYLON.Color3(color.r, color.g, color.b);
        material.diffuseColor = BABYLON.Color3.Black();
        material.specularColor = BABYLON.Color3.Black();
        material.disableLighting = true;
        material.alpha = alpha;
        material.freeze();
        return material;
    }

    private applyHighlight(): void {
        for (let i = 0; i < this._gates.length; i++) {
            const mesh = this._gates[i].mesh;
            if (!mesh) continue;
            mesh.material = i === this._nextIndex ? this._materialNext : this._materialUpcoming;
        }
    }
}
