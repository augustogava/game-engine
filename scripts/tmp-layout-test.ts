/** Temporary harness: validates dynamic level generation incl. hidden flags. */
import { LayoutSystem, buildFilledCells, isSlotFree } from '../src/game/mahjong/systems/LayoutSystem.js';
import { getHiddenFraction } from '../src/game/mahjong/constants/levelConstants.js';
import { facesMatch } from '../src/game/mahjong/data/tileSet.js';

const layout = new LayoutSystem();
let failures = 0;

function fail(msg: string): void {
    failures++;
    console.error('FAIL:', msg);
}

for (let level = 1; level <= 20; level++) {
    for (let run = 0; run < 5; run++) {
        const gen = layout.generate(level);
        const n = gen.slots.length;

        if (n % 2 !== 0) fail(`L${level} tiles odd: ${n}`);
        if (gen.faceByIndex.length !== n) fail(`L${level} faces length`);
        if (gen.hiddenByIndex.length !== n) fail(`L${level} hidden length`);

        const seen = new Set<string>();
        for (const s of gen.slots) {
            const key = `${s.gx},${s.gy},${s.layer}`;
            if (seen.has(key)) fail(`L${level} duplicate slot ${key}`);
            seen.add(key);
        }

        // Physical solvability: the whole board must peel (some tile always free).
        // Tiles go to the tray one by one, so board removal follows the peel
        // order, not the solution pair order.
        const remaining = new Set<number>(gen.slots.map((_, i) => i));
        while (remaining.size > 0) {
            const live = [...remaining].map((i) => gen.slots[i]);
            const filled = buildFilledCells(live);
            const free = [...remaining].filter((i) => isSlotFree(gen.slots[i], filled));
            if (free.length === 0) {
                fail(`L${level} board deadlocks with ${remaining.size} tiles left`);
                break;
            }
            for (const i of free) remaining.delete(i);
        }

        // Solution must cover every tile exactly once with matching faces.
        const covered = new Set<number>();
        for (const [a, b] of gen.solution) {
            if (covered.has(a) || covered.has(b)) fail(`L${level} solution reuses a tile`);
            covered.add(a);
            covered.add(b);
            if (!facesMatch(gen.faceByIndex[a], gen.faceByIndex[b])) fail(`L${level} solution pair mismatch`);
        }
        if (covered.size !== n) fail(`L${level} solution incomplete: ${covered.size}/${n}`);

        // Hidden flags: count within expected bound.
        const hiddenCount = gen.hiddenByIndex.filter(Boolean).length;
        const expected = Math.floor(n * getHiddenFraction(level));
        if (hiddenCount !== expected) fail(`L${level} hidden ${hiddenCount} != expected ${expected}`);
    }
}

// Reshuffle keeps solvability-relevant invariants: even faces, tray partners present.
const gen = layout.generate(5);
const keepCount = Math.floor(gen.slots.length / 2) * 2;
const slots = gen.slots.slice(0, keepCount);
const trayFaces = [gen.faceByIndex[0]];
const reshuffled = layout.reshuffleFaces(slots, trayFaces, 5);
if (!reshuffled) {
    fail('reshuffleFaces returned null');
} else {
    if (reshuffled.length !== slots.length) fail('reshuffle length mismatch');
    const trayPartner = reshuffled.some((f) => facesMatch(f, trayFaces[0]));
    if (!trayPartner) fail('reshuffle lost tray partner');
}

console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
