// Generic script to move a set of methods from FlightSceneSimple into a target System.
// Usage: node scripts/extract-system.cjs <SystemName>
// Edit `specsByName` below to add new system extractions.

const fs = require('fs');
const path = require('path');

const SCENE_PATH = path.join(__dirname, '..', 'src', 'game', 'FlightSceneSimple.ts');

const specsByName = {
    HudSystem: {
        systemFile: path.join(__dirname, '..', 'src', 'game', 'flight', 'systems', 'HudSystem.ts'),
        className: 'HudSystem',
        imports: `import * as BABYLON from '@babylonjs/core';
import type { FlightSceneSimple } from '../../FlightSceneSimple.js';
import { I18n } from '../../I18n.js';
import { InputBindings } from '../../InputBindings.js';
import { UiPreferences } from '../../UiPreferences.js';
import * as CONST from '../constants/index.js';

const _C: any = CONST;
`,
        methods: [],
        methodNames: [
            '_updateEngineColumnsVisibility',
            '_showHudWarningOverlay',
            '_convertSpeedKts',
            '_convertAltitudeFt',
            '_initUxSettings',
            '_buildKeymapList',
            '_takeScreenshot',
            '_showToast',
            '_buildChecklistOverlay',
            '_buildFpsLatencyOverlay',
            '_applyAccessibility',
            '_refreshKeysHelper',
            '_updateChecklistOverlay',
            '_updateFpsLatencyOverlay',
            '_initAudioSettings',
            '_initGraphicsSettings',
            '_initTapeMarks',
            '_updateTapeMarks',
            '_buildHUD',
            '_setText',
            '_setHtml',
            '_setStyle',
            '_updateNavInfo',
            '_updateHUD',
            '_drawFlightHUD',
        ],
        sceneFieldName: '_hudSystem',
    },
    InputSystem: {
        systemFile: path.join(__dirname, '..', 'src', 'game', 'flight', 'systems', 'InputSystem.ts'),
        className: 'InputSystem',
        imports: `import * as BABYLON from '@babylonjs/core';
import type { FlightSceneSimple } from '../../FlightSceneSimple.js';
import { I18n } from '../../../I18n.js';
import { InputBindings, type ActionId } from '../../InputBindings.js';
import { UiPreferences } from '../../UiPreferences.js';
import * as CONST from '../constants/index.js';

const {
    CAMERA_MODE_CHASE,
    CAMERA_MODE_FREE,
    CAMERA_MODE_COCKPIT,
    CAMERA_MODE_TOWER,
    CAMERA_MODE_AERIAL,
    MAGNETO_OFF, MAGNETO_LEFT, MAGNETO_RIGHT, MAGNETO_BOTH, MAGNETO_START,
    JOYSTICK_MIN_RADIUS_PX, JOYSTICK_MAX_RADIUS_PX, JOYSTICK_MAX_DEADZONE_NORM,
    JOYSTICK_MIN_EXPO, JOYSTICK_MAX_EXPO,
    HAPTIC_MIN_INTERVAL_MS,
    MS_TO_KT,
    ENGINE_TYPE_PISTON,
    GEAR_STATE_DOWN, GEAR_STATE_UP, GEAR_STATE_RETRACTING, GEAR_STATE_EXTENDING,
} = CONST as any;

const CONTROL_SETTINGS_STORAGE_KEY = 'flight_controls_v1';
`,
        methods: [],
        methodNames: [
            '_cockpitClick',
            '_togglePause',
            '_adjustTimeScale',
            '_toggleMouseYoke',
            '_setMouseYoke',
            '_toggleReplay',
            '_initF12Screenshot',
            '_installGamepadListeners',
            '_handleInput',
            '_setupTouchControls',
            '_loadControlSettings',
            '_persistControlSettings',
            '_doHaptic',
            '_installUserGestureListener',
            '_removeUserGestureListener',
            '_safeSetTimeout',
            '_clearAllPendingTimeouts',
        ],
        sceneFieldName: '_inputSystem',
    },
    DebugPanelSystem: {
        systemFile: path.join(__dirname, '..', 'src', 'game', 'flight', 'systems', 'DebugPanelSystem.ts'),
        className: 'DebugPanelSystem',
        imports: `import * as BABYLON from '@babylonjs/core';
import type { FlightSceneSimple } from '../../FlightSceneSimple.js';
import { BUILD_VERSION, ENGINE_TYPE_PISTON, GROUND_Y } from '../constants/index.js';

const PANEL_STATE_STORAGE_KEY = 'flight_panels_v1';
`,
        methods: [],
        methodNames: [
            '_makeDraggable',
            '_closeAllPanels',
            '_persistPanelState',
            '_restorePanelState',
            '_setupPanelControls',
            '_wirePanelDrag',
            '_wirePanelResize',
            '_togglePanelMinimize',
            '_togglePanelPin',
            '_buildDebugPanel',
            '_applyDebugRotation',
            '_updateDebugReadouts',
        ],
        sceneFieldName: '_debugPanelSystem',
        staticReplacements: {
            'PANEL_STATE_STORAGE_KEY': 'PANEL_STATE_STORAGE_KEY',
        },
    },
    MiniMapSystem: {
        systemFile: path.join(__dirname, '..', 'src', 'game', 'flight', 'systems', 'MiniMapSystem.ts'),
        className: 'MiniMapSystem',
        imports: `import { FlightSceneSimple } from '../../FlightSceneSimple.js';

const GPS_POS_STORAGE_KEY = 'flight_gps_pos_v1';
const GPS_DRAG_VIEWPORT_MARGIN_PX = 8;
const MAP_ZOOM_DEFAULT = 12;
const MAP_ZOOM_MIN = 9;
const MAP_ZOOM_MAX = 17;
const MAP_REQUEST_SIZE_PX = 256;
const MAP_REQUEST_SCALE = 2;
const MAP_REFETCH_DRIFT_RATIO = 0.25;
const MAP_REFETCH_INTERVAL_MS = 5000;
const MAP_IMG_UPSCALE = 2.0;
`,
        methods: [
            // name: original method name; publicName: name on system
            // Each method's range is auto-discovered by scanning braces.
        ],
        // Methods will be inferred at runtime from this list, with start lines found by grep
        methodNames: [
            '_persistGpsState',
            '_updateZoomIndicator',
            '_updateMapModeIndicator',
            '_toggleMapHeadingUp',
            '_changeMapZoom',
            '_setupMinimapDrag',
            '_clampGpsX',
            '_clampGpsY',
            '_latLonToMapPx',
            '_ensureMapImgListeners',
            '_removeMapImgListeners',
            '_updateMap',
        ],
        sceneFieldName: '_miniMapSystem',
    },
};

const target = process.argv[2];
if (!target || !specsByName[target]) {
    console.error('Usage: node scripts/extract-system.cjs <SystemName>');
    console.error('Available:', Object.keys(specsByName).join(', '));
    process.exit(1);
}
const spec = specsByName[target];

const src = fs.readFileSync(SCENE_PATH, 'utf8');
const lines = src.split('\n');

// Build a map from method name to {startLine, endLine} by scanning the source
// startLine: 1-based line of `    private _foo(...)... {`
// endLine: 1-based line of the matching `    }`
function findMethodRanges(names) {
    const ranges = {};
    for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^    (private|public)\s+(async\s+)?(_\w+)\s*\(/);
        if (!m) continue;
        const name = m[3];
        if (!names.includes(name)) continue;
        if (ranges[name]) continue; // already found
        // Find body start by scanning forward from the method header. The body's '{' is at the END of a
        // header line (only whitespace or a comment after it). Return types may contain inline '{...}' or
        // '<...>' but those never end with EOL — they are followed by more text or another type.
        let bodyStart = -1; // 0-indexed line containing body '{'
        let bodyStartCol = -1; // column index of the body '{' on that line
        {
            let parenDepth = 0;
            let braceDepth = 0;
            let paramsClosed = false;
            outer: for (let j = i; j < lines.length; j++) {
                const line = lines[j];
                for (let k = 0; k < line.length; k++) {
                    const ch = line[k];
                    const next = line[k + 1];
                    if (ch === '/' && next === '/') break;
                    if (ch === '(') { parenDepth++; }
                    else if (ch === ')') {
                        parenDepth--;
                        if (parenDepth === 0) paramsClosed = true;
                    }
                    else if (paramsClosed && parenDepth === 0 && ch === '{') {
                        if (braceDepth === 0) {
                            const rest = line.substring(k + 1).replace(/\/\/.*$/, '').trim();
                            if (rest === '') {
                                bodyStart = j;
                                bodyStartCol = k;
                                break outer;
                            }
                        }
                        braceDepth++;
                    }
                    else if (paramsClosed && parenDepth === 0 && ch === '}') {
                        braceDepth--;
                    }
                }
            }
        }
        if (bodyStart < 0) {
            console.error('Could not find body start for', name, 'at line', i + 1);
            process.exit(1);
        }
        // Now from bodyStart, count braces (starting AFTER the body opening brace) to find its match.
        let depth = 1; // we are already inside the body
        let endLine = -1;
        let inString = null; // '\'' or '"' or '`'
        let inLineComment = false;
        let inBlockComment = false;
        for (let j = bodyStart; j < lines.length; j++) {
            const line = lines[j];
            inLineComment = false;
            const startK = (j === bodyStart) ? bodyStartCol + 1 : 0;
            for (let k = startK; k < line.length; k++) {
                const ch = line[k];
                const next = line[k + 1];
                if (inLineComment) continue;
                if (inBlockComment) { if (ch === '*' && next === '/') { inBlockComment = false; k++; } continue; }
                if (inString) {
                    if (ch === '\\') { k++; continue; }
                    if (ch === inString) { inString = null; }
                    continue;
                }
                if (ch === '/' && next === '/') { inLineComment = true; continue; }
                if (ch === '/' && next === '*') { inBlockComment = true; k++; continue; }
                if (ch === '"' || ch === '\'' || ch === '`') { inString = ch; continue; }
                if (ch === '{') depth++;
                else if (ch === '}') {
                    depth--;
                    if (depth === 0) { endLine = j + 1; break; }
                }
            }
            if (endLine > 0) break;
        }
        if (endLine < 0) {
            console.error('Could not find end for method', name, 'at line', i + 1);
            process.exit(1);
        }
        ranges[name] = { start: i + 1, end: endLine };
    }
    return ranges;
}

const ranges = findMethodRanges(spec.methodNames);
const missing = spec.methodNames.filter((n) => !ranges[n]);
if (missing.length) {
    console.error('Missing methods:', missing);
    process.exit(1);
}

console.log('Found ranges:', ranges);

// Convert "this.X" to "this.scene.X" (including `this.scene` itself, which becomes `this.scene.scene`).
function convertThisToScene(body) {
    return body.replace(/\bthis\.([a-zA-Z_$][\w$]*)/g, 'this.scene.$1');
}

// Replace `FlightSceneSimple.STATIC_CONST` with the local constant (we re-declared them in imports)
function rewriteStaticRefs(body) {
    return body.replace(/\bFlightSceneSimple\.([A-Z_][A-Z0-9_]*)\b/g, '$1');
}

function extractMethod(name, range) {
    const slice = lines.slice(range.start - 1, range.end).join('\n');
    const idx = slice.indexOf('\n');
    const headerLine = slice.substring(0, idx);
    const bodyPart = slice.substring(idx); // includes leading \n
    const publicName = name.replace(/^_/, '');
    const newHeader = headerLine
        .replace(/^(\s*)(private|public)\s+(async\s+)?(_\w+)/, (m, indent, mod, asy, mname) => {
            const asyStr = asy || '';
            return `${indent}${asyStr}${publicName}`;
        });
    const converted = rewriteStaticRefs(convertThisToScene(bodyPart));
    return newHeader + converted;
}

function buildDelegator(name, range) {
    const slice = lines.slice(range.start - 1, range.end).join('\n');
    const publicName = name.replace(/^_/, '');
    // Match header even with object return types like "{ ... }".
    // The header may span multiple lines.
    // Find the position of the opening "{" that starts the body.
    // Approach: scan forward from end of param list.
    const headerEnd = (() => {
        let depth = 0;
        let inParams = false;
        let paramEnd = -1;
        for (let i = 0; i < slice.length; i++) {
            const ch = slice[i];
            if (ch === '(') { depth++; inParams = true; }
            else if (ch === ')') { depth--; if (inParams && depth === 0) { paramEnd = i; break; } }
        }
        return paramEnd;
    })();
    if (headerEnd < 0) {
        console.error('Could not find param end for', name);
        process.exit(1);
    }
    const beforeParen = slice.substring(0, headerEnd + 1);
    const afterParen = slice.substring(headerEnd + 1);
    // afterParen starts with " : returnType {" or " {". Find the LAST "{" before body
    // Body starts at the FIRST "{" at brace depth 0 from afterParen
    let bodyStartIdx = -1;
    {
        let depth = 0;
        for (let i = 0; i < afterParen.length; i++) {
            const ch = afterParen[i];
            if (ch === '{') { if (depth === 0) { bodyStartIdx = i; break; } depth++; }
            else if (ch === '}') { depth--; }
            else if (ch === '<') depth++;
            else if (ch === '>') depth--;
        }
    }
    if (bodyStartIdx < 0) {
        console.error('Could not find body start for', name);
        process.exit(1);
    }
    const headerPart = beforeParen + afterParen.substring(0, bodyStartIdx);
    // headerPart now is "    private _foo(args): returnType "
    const indentMatch = headerPart.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1] : '    ';

    // Extract param names
    const paramsMatch = beforeParen.match(/\(([\s\S]*)\)$/);
    const paramsRaw = paramsMatch ? paramsMatch[1] : '';
    const params = [];
    let depth = 0; let cur = '';
    let prevChar = '';
    for (const ch of paramsRaw) {
        if (ch === '(' || ch === '{' || ch === '[') depth++;
        else if (ch === ')' || ch === '}' || ch === ']') depth--;
        else if (ch === '<') depth++;
        else if (ch === '>') {
            // Only decrement if this isn't part of `=>` and we have open angle depth.
            if (prevChar !== '=' && depth > 0) depth--;
        }
        if (ch === ',' && depth === 0) { params.push(cur); cur = ''; }
        else cur += ch;
        prevChar = ch;
    }
    if (cur.trim()) params.push(cur);
    const paramNames = params.map(p => p.replace(/=.*$/, '').replace(/:.*$/, '').replace(/\?/g, '').trim());
    const callArgs = paramNames.join(', ');

    // Determine return type - look at headerPart after the ")"
    const retMatch = headerPart.match(/\)\s*:\s*([\s\S]+?)\s*$/);
    const isVoid = retMatch && retMatch[1].trim() === 'void';
    const isPromiseVoid = retMatch && /^Promise<void>$/.test(retMatch[1].trim());
    const ret = (isVoid || isPromiseVoid) ? '' : 'return ';

    return `${headerPart}{\n${indent}    ${ret}this.${spec.sceneFieldName}.${publicName}(${callArgs});\n${indent}}`;
}

// Build the system file content
let systemContent = spec.imports + `\nexport class ${spec.className} {\n    private readonly scene: any;\n\n    constructor(scene: FlightSceneSimple) {\n        this.scene = scene;\n    }\n\n`;

const delegators = [];
for (const name of spec.methodNames) {
    const range = ranges[name];
    systemContent += extractMethod(name, range) + '\n\n';
    delegators.push({ name, range, code: buildDelegator(name, range) });
}
systemContent += '}\n';

fs.writeFileSync(spec.systemFile, systemContent);

// Now patch FlightSceneSimple, deleting each method's source range and inserting the delegator.
// Work from end to start so line numbers don't shift.
const sortedByEndDesc = [...spec.methodNames].sort((a, b) => ranges[b].end - ranges[a].end);
let outLines = [...lines];
for (const name of sortedByEndDesc) {
    const range = ranges[name];
    const delegator = delegators.find(d => d.name === name).code;
    const before = outLines.slice(0, range.start - 1);
    const after = outLines.slice(range.end);
    const middle = delegator.split('\n');
    outLines = before.concat(middle, after);
}
fs.writeFileSync(SCENE_PATH, outLines.join('\n'));

console.log('Done. Wrote', spec.systemFile);
console.log('Final scene lines:', outLines.length);
