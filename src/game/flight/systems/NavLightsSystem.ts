import * as BABYLON from '@babylonjs/core';
import type { FlightSceneSimple } from '../../FlightSceneSimple.js';
import {
    NAV_LIGHT_KIND_STATIC,
    NAV_LIGHT_KIND_BEACON,
    NAV_LIGHT_KIND_STROBE,
    NAV_LIGHT_KIND_ANTICOL,
    NAV_LIGHT_KIND_LANDING,
    NAV_LIGHT_MIN_SCALE,
    NAV_LIGHT_MAX_SCALE,
    NAV_LIGHT_REFERENCE_HALF_SPAN_M,
    NAV_LIGHT_CORE_DIAMETER_M,
    NAV_BEACON_PERIOD_S,
    NAV_BEACON_ON_FRAC,
    NAV_STROBE_PERIOD_S,
    NAV_STROBE_PULSE_FRAC,
    NAV_STROBE_DOUBLE_GAP_S,
    NAV_ANTICOL_PERIOD_S,
    NAV_ANTICOL_ON_FRAC,
    GEAR_STATE_DOWN,
    GEAR_STATE_EXTENDING,
} from '../constants/index.js';

export class NavLightsSystem {
    private readonly scene: any;

    constructor(scene: FlightSceneSimple) {
        this.scene = scene;
    }

    buildNavLights(
        scene: BABYLON.Scene,
        parent: BABYLON.TransformNode,
        dims: { halfSpan: number; height: number; halfLen: number; center?: BABYLON.Vector3; wingY?: number },
    ): void {
        if (this.scene.isMobile === true) {
            console.info('[NavLights] Skipped on mobile (lights/glow disabled for performance)');
            return;
        }
        const hs = dims.halfSpan * 0.97;
        const cx = dims.center?.x ?? 0;
        const cy = dims.center?.y ?? 0;
        const cz = dims.center?.z ?? 0;
        const halfH = dims.height * 0.5;
        const wingY = (typeof dims.wingY === 'number' && Number.isFinite(dims.wingY))
            ? dims.wingY
            : (cy - halfH * 0.5);
        const wingZ = cz - dims.halfLen * 0.25;
        const topY  = cy + halfH * 0.85;
        const botY  = cy - halfH * 0.85;
        const tailZ = cz - dims.halfLen * 0.95;
        const noseZ = cz + dims.halfLen * 0.90;

        const RED   = new BABYLON.Color3(1, 0.05, 0.05);
        const GREEN = new BABYLON.Color3(0.05, 1, 0.05);
        const WHITE = new BABYLON.Color3(1.0, 1.0, 0.95);

        const defs: { name: string; color: BABYLON.Color3; pos: BABYLON.Vector3; kind: number; intensity: number; range: number; phase: number; spot?: { dirZ: number; angleRad: number; exponent: number } }[] = [
            { name: 'navPort',     color: RED,   pos: new BABYLON.Vector3(cx - hs, wingY, wingZ), kind: NAV_LIGHT_KIND_STATIC,  intensity: 40, range: 200, phase: 0 },
            { name: 'navStbd',     color: GREEN, pos: new BABYLON.Vector3(cx + hs, wingY, wingZ), kind: NAV_LIGHT_KIND_STATIC,  intensity: 40, range: 200, phase: 0 },
            { name: 'beaconTop',   color: RED,   pos: new BABYLON.Vector3(cx, topY, cz),          kind: NAV_LIGHT_KIND_BEACON,  intensity: 80, range: 300, phase: 0 },
            { name: 'beaconBot',   color: RED,   pos: new BABYLON.Vector3(cx, botY, cz),          kind: NAV_LIGHT_KIND_BEACON,  intensity: 80, range: 300, phase: 0.5 },
            { name: 'strobePort',  color: WHITE, pos: new BABYLON.Vector3(cx - hs, wingY, wingZ - 0.5), kind: NAV_LIGHT_KIND_STROBE, intensity: 200, range: 600, phase: 0 },
            { name: 'strobeStbd',  color: WHITE, pos: new BABYLON.Vector3(cx + hs, wingY, wingZ - 0.5), kind: NAV_LIGHT_KIND_STROBE, intensity: 200, range: 600, phase: 0.5 },
            { name: 'antiColTail', color: RED,   pos: new BABYLON.Vector3(cx, topY, tailZ),       kind: NAV_LIGHT_KIND_ANTICOL, intensity: 120, range: 400, phase: 0 },
            { name: 'landLeft',    color: WHITE, pos: new BABYLON.Vector3(cx - hs * 0.6, wingY * 0.5, noseZ), kind: NAV_LIGHT_KIND_LANDING, intensity: 600, range: 1500, phase: 0, spot: { dirZ: 1, angleRad: Math.PI / 5, exponent: 2 } },
            { name: 'landRight',   color: WHITE, pos: new BABYLON.Vector3(cx + hs * 0.6, wingY * 0.5, noseZ), kind: NAV_LIGHT_KIND_LANDING, intensity: 600, range: 1500, phase: 0, spot: { dirZ: 1, angleRad: Math.PI / 5, exponent: 2 } },
        ];

        this.disposeNavLights();

        const sizeScale = Math.max(
            NAV_LIGHT_MIN_SCALE,
            Math.min(NAV_LIGHT_MAX_SCALE, dims.halfSpan / NAV_LIGHT_REFERENCE_HALF_SPAN_M),
        );
        const coreDiameter = NAV_LIGHT_CORE_DIAMETER_M * sizeScale;
        console.debug(`[NavLights] halfSpan=${dims.halfSpan.toFixed(2)}m sizeScale=${sizeScale.toFixed(2)} coreDiameter=${coreDiameter.toFixed(3)}m`);

        for (const def of defs) {
            let light: BABYLON.PointLight | BABYLON.SpotLight;
            if (def.kind === NAV_LIGHT_KIND_LANDING && def.spot) {
                const dirVec = new BABYLON.Vector3(0, 0, def.spot.dirZ);
                light = new BABYLON.SpotLight(def.name, def.pos.clone(), dirVec, def.spot.angleRad, def.spot.exponent, scene);
            } else {
                light = new BABYLON.PointLight(def.name, def.pos.clone(), scene);
            }
            light.parent = parent;
            light.intensity = 0;
            light.range = def.range;
            light.diffuse = def.color.clone();
            light.specular = def.color.clone();

            const core = BABYLON.MeshBuilder.CreateSphere(def.name + 'Core', { diameter: coreDiameter }, scene);
            core.parent = parent;
            core.position = def.pos.clone();
            core.isPickable = false;
            const coreMat = new BABYLON.StandardMaterial(def.name + 'CoreMat', scene);
            coreMat.emissiveColor = def.color.scale(3);
            coreMat.disableLighting = true;
            core.material = coreMat;
            core.isVisible = false;

            this.scene._navLights.push({ light, core, kind: def.kind, phase: def.phase, maxIntensity: def.intensity });
        }

        const gl = new BABYLON.GlowLayer('navGlow', scene, { blurKernelSize: 128 });
        gl.intensity = 2.0;
        this.scene._navGlowLayer = gl;
        for (const nav of this.scene._navLights) {
            gl.addIncludedOnlyMesh(nav.core);
        }
    }

    disposeNavLights(): void {
        for (const nav of this.scene._navLights) {
            nav.light.dispose();
            nav.core.dispose();
        }
        this.scene._navLights = [];
        if (this.scene._navGlowLayer) { this.scene._navGlowLayer.dispose(); this.scene._navGlowLayer = null; }
    }

    updateNavLights(dt: number): void {
        if (this.scene._navLights.length === 0) return;
        this.scene._navStrobeTimer += dt;
        const t = this.scene._navStrobeTimer;
        const gearDown = this.scene.gearState === GEAR_STATE_DOWN || this.scene.gearState === GEAR_STATE_EXTENDING;
        const landingOn = this.scene._landingLightsOn || gearDown;
        for (const nav of this.scene._navLights) {
            let on = true;
            switch (nav.kind) {
                case NAV_LIGHT_KIND_BEACON: {
                    const phaseT = ((t + nav.phase * NAV_BEACON_PERIOD_S) % NAV_BEACON_PERIOD_S) / NAV_BEACON_PERIOD_S;
                    on = phaseT < NAV_BEACON_ON_FRAC;
                    break;
                }
                case NAV_LIGHT_KIND_STROBE: {
                    const phaseT = (t + nav.phase * NAV_STROBE_PERIOD_S) % NAV_STROBE_PERIOD_S;
                    on = (phaseT < NAV_STROBE_PERIOD_S * NAV_STROBE_PULSE_FRAC)
                        || (phaseT > NAV_STROBE_DOUBLE_GAP_S && phaseT < NAV_STROBE_DOUBLE_GAP_S + NAV_STROBE_PERIOD_S * NAV_STROBE_PULSE_FRAC);
                    break;
                }
                case NAV_LIGHT_KIND_ANTICOL: {
                    const phaseT = ((t + nav.phase * NAV_ANTICOL_PERIOD_S) % NAV_ANTICOL_PERIOD_S) / NAV_ANTICOL_PERIOD_S;
                    on = phaseT < NAV_ANTICOL_ON_FRAC;
                    break;
                }
                case NAV_LIGHT_KIND_LANDING:
                    on = landingOn;
                    break;
                default:
                    on = true;
            }
            nav.light.intensity = on ? nav.maxIntensity : 0;
            nav.core.isVisible = on;
        }
    }
}
