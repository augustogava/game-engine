// One-shot script to mechanically move FlightPhysics methods from FlightSceneSimple
// into FlightPhysicsSystem, replacing original bodies with delegators.
const fs = require('fs');
const path = require('path');

const SCENE_PATH = path.join(__dirname, '..', 'src', 'game', 'FlightSceneSimple.ts');
const SYSTEM_PATH = path.join(__dirname, '..', 'src', 'game', 'flight', 'systems', 'FlightPhysicsSystem.ts');

const src = fs.readFileSync(SCENE_PATH, 'utf8');
const lines = src.split('\n');

// Method spec: name -> public name in system
// startLine, endLine are 1-based inclusive lines (matching grep numbers).
// We will extract the FULL declaration (header + body) and convert it into a method
// in the FlightPhysicsSystem class with `this.scene.` references.
const methods = [
    { name: '_triggerCrash', publicName: 'triggerCrash', start: 3214, end: 3237 },
    { name: '_applySpoilers', publicName: 'applySpoilers', start: 3356, end: 3367 },
    { name: '_toggleSpoilers', publicName: 'toggleSpoilers', start: 3369, end: 3376 },
    { name: '_armGroundSpoilers', publicName: 'armGroundSpoilers', start: 3378, end: 3380 },
    { name: '_killEngine', publicName: 'killEngine', start: 3382, end: 3387 },
    { name: '_resetEngines', publicName: 'resetEngines', start: 3389, end: 3392 },
    { name: '_applyFlaps', publicName: 'applyFlaps', start: 3394, end: 3447 },
    { name: '_applyPhysics', publicName: 'applyPhysics', start: 3457, end: 4042 },
    { name: '_easyModeAssistEnabled', publicName: 'easyModeAssistEnabled', start: 1096, end: 1098 },
    { name: '_easyModeStabilization', publicName: 'easyModeStabilization', start: 1100, end: 1115 },
    { name: '_easyModeAutoThrottle', publicName: 'easyModeAutoThrottle', start: 1117, end: 1125 },
    { name: '_toggleGear', publicName: 'toggleGear', start: 1222, end: 1243 },
    { name: '_updateGearState', publicName: 'updateGearState', start: 1245, end: 1267 },
    { name: '_getWindAtAltitude', publicName: 'getWindAtAltitude', start: 5254, end: 5258 },
    { name: '_getWindVectorWorldRef', publicName: 'getWindVectorWorldRef', start: 5261, end: 5273 },
    { name: '_updateTurbulence', publicName: 'updateTurbulence', start: 5275, end: 5295 },
];

// Convert "this.X" to "this.scene.X" for any X that is an identifier
// (but NOT for "this.scene" because that's our wrapper).
// Also handle "FlightSceneSimple.STATIC" by converting to "FlightSceneSimple.STATIC" unchanged
// (we still need to import FlightSceneSimple? No, just use scene reference)
function convertThisToScene(body) {
    // Replace this.foo with this.scene.foo (but skip this. before keyword "scene")
    // Use a regex that matches this. followed by identifier chars, but capture group is preserved
    return body.replace(/\bthis\.(?!scene\b)([a-zA-Z_$][\w$]*)/g, 'this.scene.$1');
}

function extractMethod(spec) {
    const slice = lines.slice(spec.start - 1, spec.end).join('\n');
    // The first line is the method header e.g. "    private _foo(args): ReturnType {"
    // Convert it to "    publicFoo(args): ReturnType {"
    // Find first newline to separate header from body
    const idx = slice.indexOf('\n');
    const headerLine = slice.substring(0, idx);
    const bodyOnly = slice.substring(idx); // includes leading \n
    // Replace the private name with the public name, drop the "private " modifier
    const newHeader = headerLine
        .replace(/^(\s*)(private|public)\s+(async\s+)?(_\w+)/, (m, indent, mod, asy, name) => {
            const asyStr = asy || '';
            return `${indent}${asyStr}${spec.publicName}`;
        });
    // For internal recursive calls within the method body that call `this._someExtractedMethod`,
    // we DO need to convert them too. Since they'll route through this.scene._someExtractedMethod
    // which still delegates back to the system, that's correct.
    const convertedBody = convertThisToScene(bodyOnly);
    return newHeader + convertedBody;
}

function buildDelegator(spec) {
    const slice = lines.slice(spec.start - 1, spec.end).join('\n');
    const idx = slice.indexOf('\n');
    const headerLine = slice.substring(0, idx);
    // Parse method signature: "    private [async] _foo(arg1: T, arg2: T): R {"
    const m = headerLine.match(/^(\s*)(private|public)\s+(async\s+)?(_\w+)\s*\(([\s\S]*)\)\s*:\s*([^{]+)\{/);
    if (!m) {
        console.error('Failed to parse header:', headerLine);
        process.exit(1);
    }
    const indent = m[1];
    const accessor = m[2];
    const asy = m[3] || '';
    const name = m[4];
    const paramsRaw = m[5];
    const returnType = m[6].trim();

    // Extract param names (no defaults, no types)
    const params = [];
    if (paramsRaw.trim().length > 0) {
        // Naive split by comma at depth 0 - but for these simple signatures it works
        let depth = 0;
        let cur = '';
        for (const ch of paramsRaw) {
            if (ch === '(' || ch === '<' || ch === '{' || ch === '[') depth++;
            if (ch === ')' || ch === '>' || ch === '}' || ch === ']') depth--;
            if (ch === ',' && depth === 0) { params.push(cur); cur = ''; }
            else cur += ch;
        }
        if (cur.trim()) params.push(cur);
    }
    const paramNames = params.map(p => p.replace(/=.*$/, '').replace(/:.*$/, '').trim());

    const callArgs = paramNames.join(', ');
    const ret = returnType === 'void' ? '' : 'return ';
    return `${indent}${accessor} ${asy}${name}(${paramsRaw}): ${returnType} {\n${indent}    ${ret}this._flightPhysicsSystem.${spec.publicName}(${callArgs});\n${indent}}`;
}

// Build the system file content
let systemContent = `import * as BABYLON from '@babylonjs/core';
import type { FlightSceneSimple } from '../../FlightSceneSimple.js';
import {
    getAirDensity,
    computeCoefficients,
    computeSurfaceForces,
} from '../physics/AeroPhysics.js';
import {
    CAMERA_MODE_CHASE,
    CRASH_METERS_TO_FEET,
    CRASH_MPS_TO_FPM,
    SPOILER_DEPLOY_RATE_PER_S,
    SPOILER_RETRACT_RATE_PER_S,
    FLAP_TYPE_FOWLER,
    FLAP_TYPE_SLOTTED,
    FLAP_TYPE_SPLIT,
    SPAWN_TERRAIN_RAY_HEIGHT_M,
    SPAWN_TERRAIN_RAY_LENGTH_M,
    TERRAIN_RAY_HEIGHT_M,
    TERRAIN_RAY_LENGTH_M,
    TERRAIN_UNKNOWN_Y,
    TERRAIN_HIT_ABOVE_LIMIT_M,
    GROUND_TERRAIN_SMOOTH_SNAP_DELTA_M,
    GROUND_TERRAIN_SMOOTH_TAU_S,
    GEAR_STATE_DOWN,
    GEAR_STATE_EXTENDING,
    GEAR_STATE_RETRACTING,
    GEAR_STATE_UP,
    GEAR_INSTANT_TRANSITION_MS,
    GEAR_MAX_TRAVEL_M,
    GEAR_SPRING_K_MIN_N_PER_M,
    GROUND_Y,
    G_ACCEL,
    WIND_ALTITUDE_GAIN_KT_PER_1000FT,
    WIND_MAX_SPEED_KT,
    WIND_DEFAULT_SPEED_KT,
    WIND_DEFAULT_DIRECTION_DEG,
    KT_TO_MS,
    TURB_FADE_AGL_M,
    TURB_FULL_AGL_M,
    TURB_MAX_GUST_MS,
    TURB_TAU_S,
    MAGNETO_BOTH,
} from '../constants/index.js';

export class FlightPhysicsSystem {
    private readonly scene: any;

    constructor(scene: FlightSceneSimple) {
        this.scene = scene;
    }

`;

const delegators = [];

for (const spec of methods) {
    const extracted = extractMethod(spec);
    systemContent += extracted + '\n\n';
    delegators.push({ spec, code: buildDelegator(spec) });
}

systemContent += '}\n';

fs.writeFileSync(SYSTEM_PATH, systemContent);

// Now patch FlightSceneSimple: replace each method's full source range with a delegator
// We need to do this from end to start so line numbers don't shift
const sortedByEndDesc = [...methods].sort((a, b) => b.end - a.end);
let outLines = [...lines];
for (const spec of sortedByEndDesc) {
    const delegator = delegators.find(d => d.spec.name === spec.name).code;
    const before = outLines.slice(0, spec.start - 1);
    const after = outLines.slice(spec.end);
    const middle = delegator.split('\n');
    outLines = before.concat(middle, after);
}

fs.writeFileSync(SCENE_PATH, outLines.join('\n'));
console.log('Done. System has', methods.length, 'methods. Final scene lines:', outLines.length);
