"use strict";

// src/game/mahjong/constants/levelConstants.ts
var TILES_MIN = 36;
var TILES_PER_LEVEL = 8;
var TILES_MAX = 144;
var LAYERS_MIN = 3;
var LAYERS_MAX = 6;
var BASE_MAX_COLS = 8;
var BASE_MAX_ROWS = 7;
var CLOSE_PROBABILITY_BASE = 0.55;
var CLOSE_PROBABILITY_STEP = 0.015;
var CLOSE_PROBABILITY_MIN = 0.35;
var ISLAND_CHANCE_BASE = 0.15;
var ISLAND_CHANCE_STEP = 0.05;
var ISLAND_CHANCE_MAX = 0.6;
function getLevelShape(level) {
  const extra = Math.max(0, level - 1);
  let tileTarget = Math.min(TILES_MAX, TILES_MIN + extra * TILES_PER_LEVEL);
  if (tileTarget % 2 !== 0) tileTarget--;
  const maxLayers = Math.min(LAYERS_MAX, LAYERS_MIN + Math.floor(extra / 2));
  const islandChance = Math.min(ISLAND_CHANCE_MAX, ISLAND_CHANCE_BASE + level * ISLAND_CHANCE_STEP);
  return { tileTarget, maxLayers, islandChance };
}
function getCloseProbability(level) {
  return Math.max(CLOSE_PROBABILITY_MIN, CLOSE_PROBABILITY_BASE - Math.max(0, level - 1) * CLOSE_PROBABILITY_STEP);
}
var HIDDEN_FRACTION_BASE = 0.08;
var HIDDEN_FRACTION_STEP = 0.02;
var HIDDEN_FRACTION_MAX = 0.3;
function getHiddenFraction(level) {
  return Math.min(HIDDEN_FRACTION_MAX, HIDDEN_FRACTION_BASE + Math.max(0, level - 1) * HIDDEN_FRACTION_STEP);
}
var PYRAMID_BASE_MIN = 5;
var PYRAMID_BASE_MAX = 7;
var LEVELS_PER_SIZE_UP = 3;
function getLevelLayout(level) {
  const extra = Math.max(0, level - 1);
  const size = Math.min(PYRAMID_BASE_MAX, PYRAMID_BASE_MIN + Math.floor(extra / LEVELS_PER_SIZE_UP));
  return { width: size, height: size, layers: size };
}

// src/game/mahjong/types/index.ts
var TILE_GROUP = {
  SUIT_DOTS: 1,
  SUIT_BAMBOO: 2,
  SUIT_CHAR: 3,
  WIND: 4,
  DRAGON: 5,
  FLOWER: 6,
  SEASON: 7
};

// src/game/mahjong/data/tileSet.ts
var CN_NUMERALS = ["", "\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D", "\u4E03", "\u516B", "\u4E5D"];
var COLOR_DOTS = "#0d74ff";
var COLOR_BAMBOO = "#12863a";
var COLOR_CHAR = "#e21030";
var COLOR_WIND = "#2433c4";
var COLOR_DRAGON_RED = "#e51b1b";
var COLOR_DRAGON_GREEN = "#129b46";
var COLOR_DRAGON_WHITE = "#2b6cb0";
var COLOR_FLOWER = "#d81b76";
var COLOR_SEASON = "#00a7b5";
function buildFaces() {
  const faces = [];
  let id = 0;
  for (let rank = 1; rank <= 9; rank++) {
    faces.push({ id: id++, group: TILE_GROUP.SUIT_DOTS, glyph: String(rank), rank, color: COLOR_DOTS, pips: rank, bars: 0 });
  }
  for (let rank = 1; rank <= 9; rank++) {
    faces.push({ id: id++, group: TILE_GROUP.SUIT_BAMBOO, glyph: String(rank), rank, color: COLOR_BAMBOO, pips: 0, bars: rank });
  }
  for (let rank = 1; rank <= 9; rank++) {
    faces.push({ id: id++, group: TILE_GROUP.SUIT_CHAR, glyph: CN_NUMERALS[rank], rank, color: COLOR_CHAR, pips: 0, bars: 0 });
  }
  for (const g of ["\u6771", "\u5357", "\u897F", "\u5317"]) {
    faces.push({ id: id++, group: TILE_GROUP.WIND, glyph: g, rank: 0, color: COLOR_WIND, pips: 0, bars: 0 });
  }
  faces.push({ id: id++, group: TILE_GROUP.DRAGON, glyph: "\u4E2D", rank: 0, color: COLOR_DRAGON_RED, pips: 0, bars: 0 });
  faces.push({ id: id++, group: TILE_GROUP.DRAGON, glyph: "\u767C", rank: 0, color: COLOR_DRAGON_GREEN, pips: 0, bars: 0 });
  faces.push({ id: id++, group: TILE_GROUP.DRAGON, glyph: "\u25A1", rank: 0, color: COLOR_DRAGON_WHITE, pips: 0, bars: 0 });
  for (const g of ["\u6885", "\u862D", "\u83CA", "\u7AF9"]) {
    faces.push({ id: id++, group: TILE_GROUP.FLOWER, glyph: g, rank: 0, color: COLOR_FLOWER, pips: 0, bars: 0 });
  }
  for (const g of ["\u6625", "\u590F", "\u79CB", "\u51AC"]) {
    faces.push({ id: id++, group: TILE_GROUP.SEASON, glyph: g, rank: 0, color: COLOR_SEASON, pips: 0, bars: 0 });
  }
  return faces;
}
var TILE_FACES = buildFaces();
function facesMatch(aId, bId) {
  if (aId === bId) return true;
  const a = TILE_FACES[aId];
  const b = TILE_FACES[bId];
  if (!a || !b) return false;
  if (a.group === TILE_GROUP.FLOWER && b.group === TILE_GROUP.FLOWER) return true;
  if (a.group === TILE_GROUP.SEASON && b.group === TILE_GROUP.SEASON) return true;
  return false;
}
function pairsPerFace(face) {
  return face.group === TILE_GROUP.FLOWER || face.group === TILE_GROUP.SEASON ? 1 : 2;
}
function shuffleInPlace(ids, rng) {
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}
function buildPairFaceIds(pairCount, rng) {
  const distinctRound = shuffleInPlace(TILE_FACES.map((f) => f.id), rng);
  const repeatRound = shuffleInPlace(
    TILE_FACES.filter((f) => pairsPerFace(f) >= 2).map((f) => f.id),
    rng
  );
  const ordered = [...distinctRound, ...repeatRound];
  const result = [];
  let i = 0;
  while (result.length < pairCount) {
    if (i >= ordered.length) {
      i = 0;
      shuffleInPlace(ordered, rng);
    }
    result.push(ordered[i++]);
  }
  return result;
}

// src/game/mahjong/constants/gameConstants.ts
var HALF_CELL = 0.55;
var TILE_ASPECT_DEPTH = 1.3;
var TILE_WIDTH = HALF_CELL * 2 * 0.76;
var TILE_DEPTH = TILE_WIDTH * TILE_ASPECT_DEPTH;
var TILE_THICKNESS = TILE_WIDTH * 0.34;
var TILE_CORNER_RADIUS = TILE_WIDTH * 0.18;
var TILE_GAP = 0.02;
var CELL_HALF_X = TILE_WIDTH * (1 + TILE_GAP) / 2;
var CELL_HALF_Z = TILE_DEPTH * (1 + TILE_GAP) / 2;
var SYMBOL_TEXTURE_WIDTH = 256;
var SYMBOL_TEXTURE_HEIGHT = Math.round(SYMBOL_TEXTURE_WIDTH * TILE_ASPECT_DEPTH);
var TRAY_CAPACITY = 4;

// src/game/mahjong/systems/LayoutSystem.ts
var MAX_GENERATION_ATTEMPTS = 40;
var MIN_TILES = 12;
var BASE_LAYER_FRACTION = 0.5;
var UPPER_LAYER_FRACTION = 0.62;
var ISLAND_QUOTA_FRACTION = 0.2;
var UPPER_CLUSTER_BIAS = 0.8;
var MAX_BASE_HOLES = 2;
var MAX_OPEN = Math.max(1, TRAY_CAPACITY - 1);
function cellKey(layer, cx, cy) {
  return `${layer}:${cx}:${cy}`;
}
function footprintCells(slot) {
  return [
    cellKey(slot.layer, slot.gx, slot.gy),
    cellKey(slot.layer, slot.gx + 1, slot.gy),
    cellKey(slot.layer, slot.gx, slot.gy + 1),
    cellKey(slot.layer, slot.gx + 1, slot.gy + 1)
  ];
}
function coveredAbove(slot, filled) {
  const L = slot.layer + 1;
  return filled.has(cellKey(L, slot.gx, slot.gy)) || filled.has(cellKey(L, slot.gx + 1, slot.gy)) || filled.has(cellKey(L, slot.gx, slot.gy + 1)) || filled.has(cellKey(L, slot.gx + 1, slot.gy + 1));
}
function leftBlocked(slot, filled) {
  return filled.has(cellKey(slot.layer, slot.gx - 1, slot.gy)) || filled.has(cellKey(slot.layer, slot.gx - 1, slot.gy + 1));
}
function rightBlocked(slot, filled) {
  return filled.has(cellKey(slot.layer, slot.gx + 2, slot.gy)) || filled.has(cellKey(slot.layer, slot.gx + 2, slot.gy + 1));
}
function isSlotFree(slot, filled) {
  if (coveredAbove(slot, filled)) return false;
  return !leftBlocked(slot, filled) || !rightBlocked(slot, filled);
}
function buildFilledCells(slots2) {
  const filled = /* @__PURE__ */ new Set();
  for (const slot of slots2) {
    for (const c of footprintCells(slot)) filled.add(c);
  }
  return filled;
}
function buildPyramidSlots(level) {
  const { width, height, layers } = getLevelLayout(level);
  const slots2 = [];
  for (let layer = 0; layer < layers; layer++) {
    const w = width - layer;
    const h = height - layer;
    if (w < 1 || h < 1) break;
    const offset = layer;
    for (let row = 0; row < h; row++) {
      for (let col = 0; col < w; col++) {
        slots2.push({ gx: offset + col * 2, gy: offset + row * 2, layer });
      }
    }
  }
  if (slots2.length % 2 !== 0) slots2.shift();
  return slots2;
}
function growCluster(cells, seedCol, seedRow, quota, rng, isAllowed) {
  const frontier = [[seedCol, seedRow]];
  let added = 0;
  while (added < quota && frontier.length > 0) {
    const idx = Math.floor(rng() * frontier.length);
    const [col, row] = frontier.splice(idx, 1)[0];
    const key = `${col},${row}`;
    if (cells.has(key) || !isAllowed(col, row)) continue;
    cells.add(key);
    added++;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = col + dc;
      const nr = row + dr;
      if (nc >= 0 && nr >= 0 && nc < BASE_MAX_COLS && nr < BASE_MAX_ROWS && !cells.has(`${nc},${nr}`)) {
        frontier.push([nc, nr]);
      }
    }
  }
  return added;
}
function punchHoles(cells, rng) {
  const holes = Math.floor(rng() * (MAX_BASE_HOLES + 1));
  if (holes === 0) return;
  const interior = [...cells].filter((key) => {
    const [col, row] = key.split(",").map(Number);
    return cells.has(`${col + 1},${row}`) && cells.has(`${col - 1},${row}`) && cells.has(`${col},${row + 1}`) && cells.has(`${col},${row - 1}`);
  });
  for (let i = 0; i < holes && interior.length > 0; i++) {
    const idx = Math.floor(rng() * interior.length);
    cells.delete(interior.splice(idx, 1)[0]);
  }
}
function growBaseLayer(quota, islandChance, rng) {
  const capped = Math.min(quota, BASE_MAX_COLS * BASE_MAX_ROWS - 4);
  const cells = /* @__PURE__ */ new Set();
  const withIsland = rng() < islandChance && capped >= 16;
  const islandQuota = withIsland ? Math.max(4, Math.round(capped * ISLAND_QUOTA_FRACTION)) : 0;
  const mainQuota = capped - islandQuota;
  const seedCol = Math.floor(BASE_MAX_COLS / 2 + (rng() - 0.5) * 2);
  const seedRow = Math.floor(BASE_MAX_ROWS / 2 + (rng() - 0.5) * 2);
  growCluster(cells, seedCol, seedRow, mainQuota, rng, () => true);
  if (withIsland) {
    let sumC = 0;
    let sumR = 0;
    for (const key of cells) {
      const [c, r] = key.split(",").map(Number);
      sumC += c;
      sumR += r;
    }
    const cC = sumC / Math.max(1, cells.size);
    const cR = sumR / Math.max(1, cells.size);
    const cornerCol = cC < BASE_MAX_COLS / 2 ? BASE_MAX_COLS - 1 : 0;
    const cornerRow = cR < BASE_MAX_ROWS / 2 ? BASE_MAX_ROWS - 1 : 0;
    const mainCells = new Set(cells);
    const farFromMain = (col, row) => {
      for (const key of mainCells) {
        const [c, r] = key.split(",").map(Number);
        if (Math.abs(c - col) <= 1 && Math.abs(r - row) <= 1) return false;
      }
      return true;
    };
    growCluster(cells, cornerCol, cornerRow, islandQuota, rng, farFromMain);
  }
  punchHoles(cells, rng);
  const slots2 = [];
  for (const key of cells) {
    const [col, row] = key.split(",").map(Number);
    slots2.push({ gx: col * 2, gy: row * 2, layer: 0 });
  }
  return slots2;
}
function growUpperLayer(below, layer, quota, rng) {
  const support = /* @__PURE__ */ new Set();
  let minGx = Infinity;
  let maxGx = -Infinity;
  let minGy = Infinity;
  let maxGy = -Infinity;
  for (const s of below) {
    for (const dx of [0, 1]) for (const dy of [0, 1]) support.add(`${s.gx + dx},${s.gy + dy}`);
    minGx = Math.min(minGx, s.gx);
    maxGx = Math.max(maxGx, s.gx);
    minGy = Math.min(minGy, s.gy);
    maxGy = Math.max(maxGy, s.gy);
  }
  const supported = (gx, gy) => support.has(`${gx},${gy}`) && support.has(`${gx + 1},${gy}`) && support.has(`${gx},${gy + 1}`) && support.has(`${gx + 1},${gy + 1}`);
  const candidates = [];
  for (let gx = minGx; gx <= maxGx + 1; gx++) {
    for (let gy = minGy; gy <= maxGy + 1; gy++) {
      if (supported(gx, gy)) candidates.push([gx, gy]);
    }
  }
  const placed = [];
  const overlapsPlaced = (gx, gy) => placed.some((p) => Math.abs(p.gx - gx) < 2 && Math.abs(p.gy - gy) < 2);
  const nearPlaced = (gx, gy) => placed.some((p) => Math.abs(p.gx - gx) <= 2 && Math.abs(p.gy - gy) <= 2);
  while (placed.length < quota && candidates.length > 0) {
    let pool = candidates;
    if (placed.length > 0 && rng() < UPPER_CLUSTER_BIAS) {
      const adjacent = candidates.filter(([gx, gy]) => nearPlaced(gx, gy) && !overlapsPlaced(gx, gy));
      if (adjacent.length > 0) pool = adjacent;
    }
    const pick = pool[Math.floor(rng() * pool.length)];
    candidates.splice(candidates.indexOf(pick), 1);
    if (overlapsPlaced(pick[0], pick[1])) continue;
    placed.push({ gx: pick[0], gy: pick[1], layer });
  }
  return placed;
}
function buildDynamicSlots(level, rng) {
  const shape = getLevelShape(level);
  const baseQuota = Math.max(MIN_TILES / 2, Math.round(shape.tileTarget * BASE_LAYER_FRACTION));
  const slots2 = growBaseLayer(baseQuota, shape.islandChance, rng);
  let remaining = shape.tileTarget - slots2.length;
  let below = slots2.slice();
  for (let layer = 1; layer < shape.maxLayers && remaining > 0; layer++) {
    const quota = Math.min(remaining, Math.max(2, Math.round(below.length * UPPER_LAYER_FRACTION)));
    const placed = growUpperLayer(below, layer, quota, rng);
    if (placed.length === 0) break;
    slots2.push(...placed);
    remaining -= placed.length;
    below = placed;
  }
  if (slots2.length % 2 !== 0) {
    const topLayer = Math.max(...slots2.map((s) => s.layer));
    const idx = slots2.findIndex((s) => s.layer === topLayer);
    slots2.splice(idx, 1);
  }
  return slots2;
}
function peelOrder(slots2, rng) {
  const remaining = /* @__PURE__ */ new Set();
  for (let i = 0; i < slots2.length; i++) remaining.add(i);
  const filled = /* @__PURE__ */ new Set();
  for (let i = 0; i < slots2.length; i++) {
    for (const c of footprintCells(slots2[i])) filled.add(c);
  }
  const order = [];
  while (remaining.size > 0) {
    const freeList = [];
    for (const i of remaining) {
      if (isSlotFree(slots2[i], filled)) freeList.push(i);
    }
    if (freeList.length === 0) return null;
    const pick = freeList[Math.floor(rng() * freeList.length)];
    order.push(pick);
    remaining.delete(pick);
    for (const c of footprintCells(slots2[pick])) filled.delete(c);
  }
  return order;
}
function assignFaces(slots2, order, rng, closeProbability, initialOpenFaces = []) {
  const total = slots2.length;
  const pairCount = Math.ceil((total - initialOpenFaces.length) / 2);
  const pairFaces = buildPairFaceIds(Math.max(1, pairCount), rng);
  const faceByIndex = new Array(total).fill(-1);
  const openFaces = [...initialOpenFaces];
  const openSlots = initialOpenFaces.map(() => -1);
  const solution = [];
  let pairPtr = 0;
  for (let step = 0; step < order.length; step++) {
    const idx = order[step];
    const remaining = total - step;
    const open = openFaces.length;
    const canOpen = remaining - open >= 2 && open < MAX_OPEN && pairPtr < pairFaces.length;
    const mustClose = open === remaining;
    let close;
    if (open === 0) {
      close = false;
    } else if (mustClose || !canOpen) {
      close = true;
    } else {
      close = rng() < closeProbability;
    }
    if (close) {
      const pickAt = Math.floor(rng() * openFaces.length);
      const face = openFaces.splice(pickAt, 1)[0];
      const partner = openSlots.splice(pickAt, 1)[0];
      faceByIndex[idx] = face;
      if (partner >= 0) solution.push([partner, idx]);
    } else {
      const face = pairFaces[pairPtr++];
      faceByIndex[idx] = face;
      openFaces.push(face);
      openSlots.push(idx);
    }
  }
  return { slots: slots2, faceByIndex, hiddenByIndex: slots2.map(() => false), solution };
}
function assignHiddenTiles(level, hiddenFraction, rng) {
  const total = level.slots.length;
  const count = Math.floor(total * hiddenFraction);
  if (count <= 0) return;
  const indices = level.slots.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  for (let k = 0; k < count; k++) level.hiddenByIndex[indices[k]] = true;
}
var LayoutSystem = class {
  /** Generates a solvable (tray-clearable) level with a dynamic mound shape. */
  generate(level) {
    const closeProbability = getCloseProbability(level);
    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
      const slots3 = buildDynamicSlots(level, Math.random);
      if (slots3.length < MIN_TILES) continue;
      const order2 = peelOrder(slots3, Math.random);
      if (order2) {
        const generated2 = assignFaces(slots3, order2, Math.random, closeProbability);
        assignHiddenTiles(generated2, getHiddenFraction(level), Math.random);
        return generated2;
      }
    }
    console.warn("[LayoutSystem] Dynamic generation failed, falling back to pyramid.");
    const slots2 = buildPyramidSlots(level);
    let order = null;
    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS && !order; attempt++) {
      order = peelOrder(slots2, Math.random);
    }
    if (!order) order = slots2.map((_, i) => i);
    const generated = assignFaces(slots2, order, Math.random, closeProbability);
    assignHiddenTiles(generated, getHiddenFraction(level), Math.random);
    return generated;
  }
  /**
   * Reassigns faces for the tiles still on the board so the deal stays
   * solvable, honoring faces currently parked in the tray (they get partners
   * on the board). Returns the new face per slot index, or null on failure.
   */
  reshuffleFaces(slots2, trayFaces2, level) {
    if (slots2.length === 0) return null;
    const closeProbability = getCloseProbability(level);
    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
      const order = peelOrder(slots2, Math.random);
      if (!order) continue;
      const generated = assignFaces(slots2, order, Math.random, closeProbability, trayFaces2);
      return generated.faceByIndex;
    }
    return null;
  }
};

// scripts/tmp-layout-test.ts
var layout = new LayoutSystem();
var failures = 0;
function fail(msg) {
  failures++;
  console.error("FAIL:", msg);
}
for (let level = 1; level <= 20; level++) {
  for (let run = 0; run < 5; run++) {
    const gen2 = layout.generate(level);
    const n = gen2.slots.length;
    if (n % 2 !== 0) fail(`L${level} tiles odd: ${n}`);
    if (gen2.faceByIndex.length !== n) fail(`L${level} faces length`);
    if (gen2.hiddenByIndex.length !== n) fail(`L${level} hidden length`);
    const seen = /* @__PURE__ */ new Set();
    for (const s of gen2.slots) {
      const key = `${s.gx},${s.gy},${s.layer}`;
      if (seen.has(key)) fail(`L${level} duplicate slot ${key}`);
      seen.add(key);
    }
    const remaining = new Set(gen2.slots.map((_, i) => i));
    while (remaining.size > 0) {
      const live = [...remaining].map((i) => gen2.slots[i]);
      const filled = buildFilledCells(live);
      const free = [...remaining].filter((i) => isSlotFree(gen2.slots[i], filled));
      if (free.length === 0) {
        fail(`L${level} board deadlocks with ${remaining.size} tiles left`);
        break;
      }
      for (const i of free) remaining.delete(i);
    }
    const covered = /* @__PURE__ */ new Set();
    for (const [a, b] of gen2.solution) {
      if (covered.has(a) || covered.has(b)) fail(`L${level} solution reuses a tile`);
      covered.add(a);
      covered.add(b);
      if (!facesMatch(gen2.faceByIndex[a], gen2.faceByIndex[b])) fail(`L${level} solution pair mismatch`);
    }
    if (covered.size !== n) fail(`L${level} solution incomplete: ${covered.size}/${n}`);
    const hiddenCount = gen2.hiddenByIndex.filter(Boolean).length;
    const expected = Math.floor(n * getHiddenFraction(level));
    if (hiddenCount !== expected) fail(`L${level} hidden ${hiddenCount} != expected ${expected}`);
  }
}
var gen = layout.generate(5);
var keepCount = Math.floor(gen.slots.length / 2) * 2;
var slots = gen.slots.slice(0, keepCount);
var trayFaces = [gen.faceByIndex[0]];
var reshuffled = layout.reshuffleFaces(slots, trayFaces, 5);
if (!reshuffled) {
  fail("reshuffleFaces returned null");
} else {
  if (reshuffled.length !== slots.length) fail("reshuffle length mismatch");
  const trayPartner = reshuffled.some((f) => facesMatch(f, trayFaces[0]));
  if (!trayPartner) fail("reshuffle lost tray partner");
}
console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
