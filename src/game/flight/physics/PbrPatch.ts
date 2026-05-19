import * as BABYLON from '@babylonjs/core';
import { AIRCRAFT_PBR_MAX_SIMULTANEOUS_LIGHTS } from '../constants/index.js';

let __PBR_MAX_LIGHTS_PROTO_PATCHED = false;

export function patchPbrMaxSimultaneousLightsProto(): void {
    if (__PBR_MAX_LIGHTS_PROTO_PATCHED) return;
    const PATCH_FLAG = '__pbrMaxLightsCapped';
    const candidates: any[] = [];
    const collectProto = (cls: any) => {
        if (!cls || !cls.prototype) return;
        let proto = cls.prototype;
        while (proto) {
            if (Object.getOwnPropertyDescriptor(proto, 'maxSimultaneousLights')) {
                candidates.push(proto);
                return;
            }
            proto = Object.getPrototypeOf(proto);
        }
    };
    collectProto((BABYLON as any).PBRMaterial);
    collectProto((BABYLON as any).OpenPBRMaterial);
    collectProto((BABYLON as any).PBRMetallicRoughnessMaterial);
    collectProto((BABYLON as any).PBRSpecularGlossinessMaterial);
    let patched = 0;
    for (const proto of candidates) {
        if ((proto as any)[PATCH_FLAG]) continue;
        const desc = Object.getOwnPropertyDescriptor(proto, 'maxSimultaneousLights');
        if (!desc || typeof desc.set !== 'function' || typeof desc.get !== 'function') continue;
        const origSet = desc.set;
        const origGet = desc.get;
        Object.defineProperty(proto, 'maxSimultaneousLights', {
            get: origGet,
            set: function (value: number) {
                const safe = typeof value === 'number' && value > 0 ? value : AIRCRAFT_PBR_MAX_SIMULTANEOUS_LIGHTS;
                const capped = Math.min(safe, AIRCRAFT_PBR_MAX_SIMULTANEOUS_LIGHTS);
                origSet.call(this, capped);
            },
            enumerable: desc.enumerable,
            configurable: true,
        });
        (proto as any)[PATCH_FLAG] = true;
        patched++;
    }
    __PBR_MAX_LIGHTS_PROTO_PATCHED = true;
    if (patched > 0) {
        console.debug(`[FlightSimple] Patched maxSimultaneousLights setter on ${patched} PBR prototype(s) (cap=${AIRCRAFT_PBR_MAX_SIMULTANEOUS_LIGHTS})`);
    } else {
        console.warn('[FlightSimple] No PBR prototype found to patch maxSimultaneousLights');
    }
}
