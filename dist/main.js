"use strict";
(() => {
  // src/engine/renderer/Renderer.ts
  var Renderer = class {
    constructor(canvas2) {
      this.canvas = canvas2;
      const ctx = canvas2.getContext("2d");
      if (!ctx)
        throw new Error("Failed to get 2D context");
      this.ctx = ctx;
      this.pixelRatio = window.devicePixelRatio || 1;
      this.resize(window.innerWidth, window.innerHeight);
      window.addEventListener("resize", () => {
        this.resize(window.innerWidth, window.innerHeight);
      });
    }
    resize(width, height) {
      const pr = this.pixelRatio;
      this.canvas.width = width * pr;
      this.canvas.height = height * pr;
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
      this.ctx.scale(pr, pr);
    }
    get width() {
      return this.canvas.width / this.pixelRatio;
    }
    get height() {
      return this.canvas.height / this.pixelRatio;
    }
    clear(color = "#000000") {
      this.ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
      this.ctx.fillStyle = color;
      this.ctx.fillRect(0, 0, this.width, this.height);
    }
    applyCamera(camera) {
      const pr = this.pixelRatio;
      this.ctx.setTransform(
        camera.zoom * pr,
        0,
        0,
        camera.zoom * pr,
        (this.width * 0.5 - camera.position.x * camera.zoom) * pr,
        (this.height * 0.5 - camera.position.y * camera.zoom) * pr
      );
    }
    resetTransform() {
      this.ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    }
    // ─── Drawing primitives ────────────────────────────────────────────────
    fillCircle(x, y, radius, color) {
      this.ctx.beginPath();
      this.ctx.arc(x, y, radius, 0, Math.PI * 2);
      this.ctx.fillStyle = color;
      this.ctx.fill();
    }
    strokeCircle(x, y, radius, color, lineWidth = 1) {
      this.ctx.beginPath();
      this.ctx.arc(x, y, radius, 0, Math.PI * 2);
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = lineWidth;
      this.ctx.stroke();
    }
    fillRect(x, y, w, h, color) {
      this.ctx.fillStyle = color;
      this.ctx.fillRect(x, y, w, h);
    }
    line(x1, y1, x2, y2, color, lineWidth = 1) {
      this.ctx.beginPath();
      this.ctx.moveTo(x1, y1);
      this.ctx.lineTo(x2, y2);
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = lineWidth;
      this.ctx.stroke();
    }
    text(text, x, y, color = "#fff", size = 14, align = "left") {
      this.ctx.fillStyle = color;
      this.ctx.font = `${size}px Inter, system-ui, sans-serif`;
      this.ctx.textAlign = align;
      this.ctx.fillText(text, x, y);
    }
    createRadialGradient(x, y, r0, r1) {
      return this.ctx.createRadialGradient(x, y, r0, x, y, r1);
    }
    setGlobalAlpha(alpha) {
      this.ctx.globalAlpha = alpha;
    }
    setCompositeOperation(op) {
      this.ctx.globalCompositeOperation = op;
    }
    setShadow(blur, color) {
      this.ctx.shadowBlur = blur;
      this.ctx.shadowColor = color;
    }
    clearShadow() {
      this.ctx.shadowBlur = 0;
      this.ctx.shadowColor = "transparent";
    }
    save() {
      this.ctx.save();
    }
    restore() {
      this.ctx.restore();
    }
  };

  // src/engine/math/Vector2.ts
  var Vector2 = class _Vector2 {
    constructor(x = 0, y = 0) {
      this.x = x;
      this.y = y;
    }
    static zero() {
      return new _Vector2(0, 0);
    }
    static one() {
      return new _Vector2(1, 1);
    }
    static fromAngle(angle, length = 1) {
      return new _Vector2(Math.cos(angle) * length, Math.sin(angle) * length);
    }
    set(x, y) {
      this.x = x;
      this.y = y;
      return this;
    }
    clone() {
      return new _Vector2(this.x, this.y);
    }
    add(v) {
      return new _Vector2(this.x + v.x, this.y + v.y);
    }
    addSelf(v) {
      this.x += v.x;
      this.y += v.y;
      return this;
    }
    sub(v) {
      return new _Vector2(this.x - v.x, this.y - v.y);
    }
    subSelf(v) {
      this.x -= v.x;
      this.y -= v.y;
      return this;
    }
    scale(s) {
      return new _Vector2(this.x * s, this.y * s);
    }
    scaleSelf(s) {
      this.x *= s;
      this.y *= s;
      return this;
    }
    negate() {
      return new _Vector2(-this.x, -this.y);
    }
    negateSelf() {
      this.x = -this.x;
      this.y = -this.y;
      return this;
    }
    dot(v) {
      return this.x * v.x + this.y * v.y;
    }
    cross(v) {
      return this.x * v.y - this.y * v.x;
    }
    magnitudeSq() {
      return this.x * this.x + this.y * this.y;
    }
    magnitude() {
      return Math.sqrt(this.magnitudeSq());
    }
    normalize() {
      const m = this.magnitude();
      return m > 0 ? this.scale(1 / m) : _Vector2.zero();
    }
    normalizeSelf() {
      const m = this.magnitude();
      if (m > 0) {
        this.x /= m;
        this.y /= m;
      }
      return this;
    }
    distance(v) {
      return this.sub(v).magnitude();
    }
    distanceSq(v) {
      return this.sub(v).magnitudeSq();
    }
    angle() {
      return Math.atan2(this.y, this.x);
    }
    angleTo(v) {
      return Math.atan2(v.y - this.y, v.x - this.x);
    }
    lerp(v, t) {
      return new _Vector2(this.x + (v.x - this.x) * t, this.y + (v.y - this.y) * t);
    }
    perpendicular() {
      return new _Vector2(-this.y, this.x);
    }
    rotate(angle) {
      const c = Math.cos(angle), s = Math.sin(angle);
      return new _Vector2(this.x * c - this.y * s, this.x * s + this.y * c);
    }
    equals(v, epsilon = 1e-4) {
      return Math.abs(this.x - v.x) < epsilon && Math.abs(this.y - v.y) < epsilon;
    }
    toString() {
      return `Vector2(${this.x.toFixed(3)}, ${this.y.toFixed(3)})`;
    }
  };

  // src/engine/commons/EventEmitter.ts
  var EventEmitter = class {
    constructor() {
      this.listeners = /* @__PURE__ */ new Map();
      this.onceListeners = /* @__PURE__ */ new Map();
    }
    on(event, listener) {
      if (!this.listeners.has(event))
        this.listeners.set(event, /* @__PURE__ */ new Set());
      this.listeners.get(event).add(listener);
      return this;
    }
    off(event, listener) {
      this.listeners.get(event)?.delete(listener);
      this.onceListeners.get(event)?.delete(listener);
      return this;
    }
    once(event, listener) {
      if (!this.onceListeners.has(event))
        this.onceListeners.set(event, /* @__PURE__ */ new Set());
      this.onceListeners.get(event).add(listener);
      return this;
    }
    emit(event, data) {
      this.listeners.get(event)?.forEach((l) => l(data));
      const onceSet = this.onceListeners.get(event);
      if (onceSet) {
        onceSet.forEach((l) => l(data));
        onceSet.clear();
      }
      return this;
    }
    removeAllListeners(event) {
      if (event) {
        this.listeners.delete(event);
        this.onceListeners.delete(event);
      } else {
        this.listeners.clear();
        this.onceListeners.clear();
      }
      return this;
    }
  };

  // src/engine/input/InputManager.ts
  var InputManager = class extends EventEmitter {
    constructor(canvas2) {
      super();
      this.keysDown = /* @__PURE__ */ new Set();
      this.keysPressed = /* @__PURE__ */ new Set();
      // pressed this frame
      this.keysReleased = /* @__PURE__ */ new Set();
      // released this frame
      this.mouseButtons = /* @__PURE__ */ new Set();
      this.mousePos = new Vector2();
      this.mouseDelta = new Vector2();
      this.wheelDelta = 0;
      this.canvas = canvas2;
      this.bindEvents();
    }
    bindEvents() {
      window.addEventListener("keydown", (e) => {
        if (!this.keysDown.has(e.code)) {
          this.keysPressed.add(e.code);
        }
        this.keysDown.add(e.code);
        this.emit("keydown", { key: e.key, code: e.code });
      });
      window.addEventListener("keyup", (e) => {
        this.keysDown.delete(e.code);
        this.keysReleased.add(e.code);
        this.emit("keyup", { key: e.key, code: e.code });
      });
      this.canvas.addEventListener("mousedown", (e) => {
        this.mouseButtons.add(e.button);
        this.emit("mousedown", { button: e.button, x: e.clientX, y: e.clientY });
        e.preventDefault();
      });
      window.addEventListener("mouseup", (e) => {
        this.mouseButtons.delete(e.button);
        this.emit("mouseup", { button: e.button, x: e.clientX, y: e.clientY });
      });
      window.addEventListener("mousemove", (e) => {
        this.mouseDelta.set(e.movementX, e.movementY);
        this.mousePos.set(e.clientX, e.clientY);
        this.emit("mousemove", { x: e.clientX, y: e.clientY, dx: e.movementX, dy: e.movementY });
      });
      this.canvas.addEventListener("wheel", (e) => {
        this.wheelDelta += e.deltaY;
        this.emit("wheel", { delta: e.deltaY, x: e.clientX, y: e.clientY });
        e.preventDefault();
      }, { passive: false });
    }
    /** Call at end of each frame to reset single-frame state */
    endFrame() {
      this.keysPressed.clear();
      this.keysReleased.clear();
      this.mouseDelta.set(0, 0);
      this.wheelDelta = 0;
    }
    isKeyDown(code) {
      return this.keysDown.has(code);
    }
    isKeyPressed(code) {
      return this.keysPressed.has(code);
    }
    isKeyReleased(code) {
      return this.keysReleased.has(code);
    }
    isMouseDown(button = 0) {
      return this.mouseButtons.has(button);
    }
    getMousePosition() {
      return this.mousePos.clone();
    }
    getMouseDelta() {
      return this.mouseDelta.clone();
    }
    getWheelDelta() {
      return this.wheelDelta;
    }
    destroy() {
      this.removeAllListeners();
    }
  };

  // src/engine/scene/SceneManager.ts
  var SceneManager = class {
    constructor() {
      this.stack = [];
    }
    initialize(ctx) {
      this.ctx = ctx;
    }
    push(scene) {
      scene.onEnter(this.ctx);
      this.stack.push(scene);
    }
    pop() {
      const scene = this.stack.pop();
      scene?.onExit();
      if (this.stack.length > 0) {
        this.stack[this.stack.length - 1].onEnter(this.ctx);
      }
      return scene;
    }
    replace(scene) {
      if (this.stack.length > 0) {
        this.stack[this.stack.length - 1].onExit();
        this.stack.pop();
      }
      scene.onEnter(this.ctx);
      this.stack.push(scene);
    }
    get current() {
      return this.stack[this.stack.length - 1];
    }
    update(dt) {
      this.current?.update(dt);
    }
    render(renderer) {
      for (const scene of this.stack) {
        scene.render(renderer);
      }
    }
    onResize(width, height) {
      for (const scene of this.stack) {
        scene.onResize(width, height);
      }
    }
  };

  // src/engine/physics/PhysicsWorld.ts
  var PhysicsWorld = class {
    constructor() {
      this.bodies = [];
      this.attractors = [];
      this.gravitationalConstant = 6674e-6;
      // Scaled G for simulation
      this.maxForce = 5e3;
    }
    addBody(body) {
      this.bodies.push(body);
    }
    removeBody(body) {
      const idx = this.bodies.indexOf(body);
      if (idx !== -1)
        this.bodies.splice(idx, 1);
    }
    addAttractor(position, mass, softening = 50) {
      const attractor = { position: position.clone(), mass, softening };
      this.attractors.push(attractor);
      return attractor;
    }
    removeAttractor(attractor) {
      const idx = this.attractors.indexOf(attractor);
      if (idx !== -1)
        this.attractors.splice(idx, 1);
    }
    update(dt) {
      const G = this.gravitationalConstant;
      const maxF = this.maxForce;
      for (let i = 0; i < this.bodies.length; i++) {
        const body = this.bodies[i];
        if (body.isStatic)
          continue;
        for (let j = 0; j < this.attractors.length; j++) {
          const attractor = this.attractors[j];
          const dx = attractor.position.x - body.position.x;
          const dy = attractor.position.y - body.position.y;
          const softSq = attractor.softening * attractor.softening;
          const distSq = dx * dx + dy * dy + softSq;
          const dist = Math.sqrt(distSq);
          let forceMag = G * attractor.mass * body.mass / distSq;
          if (forceMag > maxF)
            forceMag = maxF;
          body.acceleration.x += dx / dist * forceMag * body.inverseMass;
          body.acceleration.y += dy / dist * forceMag * body.inverseMass;
        }
        body.integrate(dt);
      }
    }
    clear() {
      this.bodies.length = 0;
      this.attractors.length = 0;
    }
  };

  // src/engine/math/MathUtils.ts
  var MathUtils = {
    PI2: Math.PI * 2,
    clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    },
    lerp(a, b, t) {
      return a + (b - a) * t;
    },
    smoothstep(edge0, edge1, x) {
      const t = MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
      return t * t * (3 - 2 * t);
    },
    smootherstep(edge0, edge1, x) {
      const t = MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
      return t * t * t * (t * (t * 6 - 15) + 10);
    },
    map(value, inMin, inMax, outMin, outMax) {
      return outMin + (outMax - outMin) * ((value - inMin) / (inMax - inMin));
    },
    randomRange(min, max) {
      return min + Math.random() * (max - min);
    },
    randomInt(min, max) {
      return Math.floor(MathUtils.randomRange(min, max + 1));
    },
    randomSign() {
      return Math.random() < 0.5 ? -1 : 1;
    },
    degToRad(degrees) {
      return degrees * (Math.PI / 180);
    },
    radToDeg(radians) {
      return radians * (180 / Math.PI);
    },
    normalizeAngle(angle) {
      while (angle > Math.PI)
        angle -= MathUtils.PI2;
      while (angle < -Math.PI)
        angle += MathUtils.PI2;
      return angle;
    },
    isPowerOf2(n) {
      return (n & n - 1) === 0;
    },
    sign(n) {
      return n < 0 ? -1 : n > 0 ? 1 : 0;
    },
    approximately(a, b, epsilon = 1e-4) {
      return Math.abs(a - b) < epsilon;
    },
    gaussianRandom(mean = 0, stddev = 1) {
      const u = 1 - Math.random();
      const v = Math.random();
      const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(MathUtils.PI2 * v);
      return mean + z * stddev;
    }
  };

  // src/engine/camera/Camera2D.ts
  var Camera2D = class {
    constructor(screenWidth, screenHeight) {
      this.position = Vector2.zero();
      this.zoom = 1;
      this.minZoom = 0.01;
      this.maxZoom = 50;
      this._screenWidth = screenWidth;
      this._screenHeight = screenHeight;
    }
    get screenWidth() {
      return this._screenWidth;
    }
    get screenHeight() {
      return this._screenHeight;
    }
    resize(w, h) {
      this._screenWidth = w;
      this._screenHeight = h;
    }
    /** Converts a world-space point to screen-space */
    worldToScreen(worldPos) {
      return new Vector2(
        (worldPos.x - this.position.x) * this.zoom + this._screenWidth * 0.5,
        (worldPos.y - this.position.y) * this.zoom + this._screenHeight * 0.5
      );
    }
    /** Converts a screen-space point to world-space */
    screenToWorld(screenPos) {
      return new Vector2(
        (screenPos.x - this._screenWidth * 0.5) / this.zoom + this.position.x,
        (screenPos.y - this._screenHeight * 0.5) / this.zoom + this.position.y
      );
    }
    /** Pan camera by a screen-space delta */
    pan(screenDelta) {
      this.position.x -= screenDelta.x / this.zoom;
      this.position.y -= screenDelta.y / this.zoom;
    }
    /** Zoom centered on a screen-space point */
    zoomAt(screenPoint, factor) {
      const worldBefore = this.screenToWorld(screenPoint);
      this.zoom = MathUtils.clamp(this.zoom * factor, this.minZoom, this.maxZoom);
      const worldAfter = this.screenToWorld(screenPoint);
      this.position.x += worldBefore.x - worldAfter.x;
      this.position.y += worldBefore.y - worldAfter.y;
    }
    /** Apply camera transform to a Canvas 2D context */
    applyToContext(ctx) {
      ctx.setTransform(
        this.zoom,
        0,
        0,
        this.zoom,
        this._screenWidth * 0.5 - this.position.x * this.zoom,
        this._screenHeight * 0.5 - this.position.y * this.zoom
      );
    }
    /** Get the visible world bounds */
    getWorldBounds() {
      const hw = this._screenWidth * 0.5 / this.zoom;
      const hh = this._screenHeight * 0.5 / this.zoom;
      return {
        left: this.position.x - hw,
        right: this.position.x + hw,
        top: this.position.y - hh,
        bottom: this.position.y + hh
      };
    }
    isPointVisible(worldPos, margin = 0) {
      const bounds = this.getWorldBounds();
      return worldPos.x >= bounds.left - margin && worldPos.x <= bounds.right + margin && worldPos.y >= bounds.top - margin && worldPos.y <= bounds.bottom + margin;
    }
  };

  // src/engine/GameCore.ts
  var GameCore = class extends EventEmitter {
    constructor(config) {
      super();
      this.running = false;
      this.rafId = 0;
      this.lastTime = 0;
      this.accumulator = 0;
      // Stats
      this.fps = 0;
      this.frameTime = 0;
      this.fpsAccumulator = 0;
      this.fpsFrames = 0;
      this.loop = (timestamp) => {
        if (!this.running)
          return;
        this.rafId = requestAnimationFrame(this.loop);
        let rawDt = (timestamp - this.lastTime) / 1e3;
        this.lastTime = timestamp;
        if (rawDt > this.maxDeltaTime)
          rawDt = this.maxDeltaTime;
        this.frameTime = rawDt;
        this.fpsAccumulator += rawDt;
        this.fpsFrames++;
        if (this.fpsAccumulator >= 0.5) {
          this.fps = Math.round(this.fpsFrames / this.fpsAccumulator);
          this.fpsFrames = 0;
          this.fpsAccumulator = 0;
        }
        this.accumulator += rawDt;
        while (this.accumulator >= this.fixedDt) {
          this.scenes.update(this.fixedDt);
          this.accumulator -= this.fixedDt;
        }
        this.emit("update", { dt: rawDt, fixedDt: this.fixedDt });
        this.scenes.render(this.renderer);
        this.emit("render", { renderer: this.renderer });
        this.input.endFrame();
      };
      this.fixedDt = config.fixedDt ?? 1 / 60;
      this.maxDeltaTime = config.maxDeltaTime ?? 0.1;
      this.renderer = new Renderer(config.canvas);
      this.input = new InputManager(config.canvas);
      this.camera = new Camera2D(this.renderer.width, this.renderer.height);
      this.physics = new PhysicsWorld();
      this.scenes = new SceneManager();
      this.scenes.initialize({
        renderer: this.renderer,
        input: this.input,
        camera: this.camera,
        physics: this.physics
      });
      window.addEventListener("resize", () => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        this.camera.resize(w, h);
        this.scenes.onResize(w, h);
        this.emit("resize", { width: w, height: h });
      });
    }
    start(initialScene) {
      if (this.running)
        return;
      this.running = true;
      if (initialScene) {
        this.scenes.push(initialScene);
      }
      this.lastTime = performance.now();
      this.emit("start", void 0);
      this.loop(performance.now());
    }
    stop() {
      this.running = false;
      cancelAnimationFrame(this.rafId);
      this.emit("stop", void 0);
    }
  };

  // src/engine/scene/Scene.ts
  var Scene = class {
    /** Called when the scene is entered */
    onEnter(_ctx) {
      this.ctx = _ctx;
    }
    /** Called when the scene is exited */
    onExit() {
    }
    /** Optional: handle resize events */
    onResize(_width, _height) {
    }
  };

  // src/engine/commons/ObjectPool.ts
  var ObjectPool = class {
    constructor(factory, reset, initialSize = 0, maxSize = 1e4) {
      this.pool = [];
      this.factory = factory;
      this.reset = reset;
      this.maxSize = maxSize;
      for (let i = 0; i < initialSize; i++) {
        this.pool.push(factory());
      }
    }
    acquire() {
      if (this.pool.length > 0) {
        return this.pool.pop();
      }
      return this.factory();
    }
    release(obj) {
      if (this.pool.length < this.maxSize) {
        this.reset(obj);
        this.pool.push(obj);
      }
    }
    get available() {
      return this.pool.length;
    }
    prewarm(count) {
      for (let i = 0; i < count; i++) {
        this.pool.push(this.factory());
      }
    }
    clear() {
      this.pool.length = 0;
    }
  };

  // src/engine/spatial/QuadTree.ts
  var QTNode = class _QTNode {
    // center of mass Y
    constructor(bounds) {
      this.bounds = bounds;
      this.points = [];
      this.children = null;
      // Barnes-Hut aggregates
      this.totalMass = 0;
      this.cx = 0;
      // center of mass X
      this.cy = 0;
    }
    get isLeaf() {
      return this.children === null;
    }
    get isEmpty() {
      return this.points.length === 0 && this.isLeaf;
    }
    contains(px, py) {
      const { x, y, hw, hh } = this.bounds;
      return px >= x - hw && px <= x + hw && py >= y - hh && py <= y + hh;
    }
    intersectsRect(rx, ry, rw, rh) {
      const { x, y, hw, hh } = this.bounds;
      return !(rx > x + hw || rx + rw < x - hw || ry > y + hh || ry + rh < y - hh);
    }
    intersectsCircle(cx, cy, r) {
      const { x, y, hw, hh } = this.bounds;
      const nearX = Math.max(x - hw, Math.min(x + hw, cx));
      const nearY = Math.max(y - hh, Math.min(y + hh, cy));
      const dx = cx - nearX, dy = cy - nearY;
      return dx * dx + dy * dy <= r * r;
    }
    split() {
      const { x, y, hw, hh } = this.bounds;
      const qw = hw * 0.5, qh = hh * 0.5;
      this.children = [
        new _QTNode({ x: x - qw, y: y - qh, hw: qw, hh: qh }),
        // NW
        new _QTNode({ x: x + qw, y: y - qh, hw: qw, hh: qh }),
        // NE
        new _QTNode({ x: x - qw, y: y + qh, hw: qw, hh: qh }),
        // SW
        new _QTNode({ x: x + qw, y: y + qh, hw: qw, hh: qh })
        // SE
      ];
    }
    getChildFor(px, py) {
      if (!this.children)
        return null;
      for (const child of this.children) {
        if (child.contains(px, py))
          return child;
      }
      return null;
    }
  };
  var QuadTree = class {
    /**
     * @param bounds World-space bounds for the tree (center + half-extents)
     * @param capacity Max points per node before splitting (4–8 is typical)
     * @param maxDepth  Max tree depth (12–16 is typically safe)
     */
    constructor(bounds, capacity = 6, maxDepth = 12) {
      this._size = 0;
      this.root = new QTNode(bounds);
      this.capacity = capacity;
      this.maxDepth = maxDepth;
    }
    get size() {
      return this._size;
    }
    /** Remove all points and reset the tree */
    clear() {
      this.root = new QTNode(this.root.bounds);
      this._size = 0;
    }
    /** Resize the tree bounds (rebuilds root) */
    resize(bounds) {
      this.root = new QTNode(bounds);
      this._size = 0;
    }
    // ─── Insert ─────────────────────────────────────────────────────────────
    insert(point) {
      if (!this.root.contains(point.x, point.y))
        return false;
      this.insertInto(this.root, point, 0);
      this._size++;
      return true;
    }
    insertInto(node, point, depth) {
      const m = point.mass ?? 1;
      const total = node.totalMass + m;
      node.cx = (node.cx * node.totalMass + point.x * m) / total;
      node.cy = (node.cy * node.totalMass + point.y * m) / total;
      node.totalMass = total;
      if (node.isLeaf && node.points.length < this.capacity) {
        node.points.push(point);
        return;
      }
      if (node.isLeaf && depth < this.maxDepth) {
        node.split();
        for (const p of node.points) {
          const child = node.getChildFor(p.x, p.y);
          if (child)
            this.insertInto(child, p, depth + 1);
        }
        node.points.length = 0;
      }
      if (node.children) {
        const child = node.getChildFor(point.x, point.y);
        if (child) {
          this.insertInto(child, point, depth + 1);
        } else {
          node.points.push(point);
        }
      } else {
        node.points.push(point);
      }
    }
    // ─── Query: rectangle ───────────────────────────────────────────────────
    queryRect(x, y, w, h, results = []) {
      this.queryRectNode(this.root, x, y, w, h, results);
      return results;
    }
    queryRectNode(node, rx, ry, rw, rh, results) {
      if (!node.intersectsRect(rx, ry, rw, rh))
        return;
      for (const p of node.points) {
        if (p.x >= rx && p.x <= rx + rw && p.y >= ry && p.y <= ry + rh) {
          results.push(p);
        }
      }
      if (node.children) {
        for (const child of node.children) {
          this.queryRectNode(child, rx, ry, rw, rh, results);
        }
      }
    }
    // ─── Query: circle ──────────────────────────────────────────────────────
    queryCircle(cx, cy, radius, results = []) {
      this.queryCircleNode(this.root, cx, cy, radius, radius * radius, results);
      return results;
    }
    queryCircleNode(node, cx, cy, r, rSq, results) {
      if (!node.intersectsCircle(cx, cy, r))
        return;
      for (const p of node.points) {
        const dx = p.x - cx, dy = p.y - cy;
        if (dx * dx + dy * dy <= rSq)
          results.push(p);
      }
      if (node.children) {
        for (const child of node.children) {
          this.queryCircleNode(child, cx, cy, r, rSq, results);
        }
      }
    }
    // ─── Query: nearest neighbor (approximate) ──────────────────────────────
    nearest(px, py) {
      let best = null;
      let bestDSq = Infinity;
      this.nearestNode(this.root, px, py, { best, bestDSq });
      return best;
    }
    nearestNode(node, px, py, state) {
      for (const p of node.points) {
        const dx = p.x - px, dy = p.y - py;
        const dSq = dx * dx + dy * dy;
        if (dSq < state.bestDSq) {
          state.bestDSq = dSq;
          state.best = p;
        }
      }
      if (node.children) {
        const sorted = [...node.children].sort((a, b) => {
          const dA = (a.bounds.x - px) ** 2 + (a.bounds.y - py) ** 2;
          const dB = (b.bounds.x - px) ** 2 + (b.bounds.y - py) ** 2;
          return dA - dB;
        });
        for (const child of sorted) {
          const { x, y, hw, hh } = child.bounds;
          const nearX = Math.max(x - hw, Math.min(x + hw, px));
          const nearY = Math.max(y - hh, Math.min(y + hh, py));
          const minDSq = (nearX - px) ** 2 + (nearY - py) ** 2;
          if (minDSq > state.bestDSq)
            continue;
          this.nearestNode(child, px, py, state);
        }
      }
    }
    // ─── Barnes-Hut traversal ────────────────────────────────────────────────
    /**
     * Compute gravitational acceleration at (px, py) using Barnes-Hut approximation.
     * @param px     Query point X
     * @param py     Query point Y  
     * @param G      Gravitational constant
     * @param theta  Accuracy parameter (0.5-0.9, lower=more accurate)
     * @param softening  Softening length to avoid singularity
     */
    barnesHutForce(px, py, G = 1, theta = 0.7, softening = 10) {
      let ax = 0, ay = 0;
      this.bhForceNode(this.root, px, py, G, theta, softening * softening, ax, ay, (fx, fy) => {
        ax += fx;
        ay += fy;
      });
      return [ax, ay];
    }
    bhForceNode(node, px, py, G, theta, softSq, _ax, _ay, accumulate) {
      if (node.totalMass === 0)
        return;
      const dx = node.cx - px;
      const dy = node.cy - py;
      const distSq = dx * dx + dy * dy + softSq;
      if (distSq < 0.01)
        return;
      const nodeSize = node.bounds.hw * 2;
      const dist = Math.sqrt(distSq);
      if (node.isLeaf || nodeSize / dist < theta) {
        const forceMag = G * node.totalMass / distSq;
        accumulate(dx / dist * forceMag, dy / dist * forceMag);
        return;
      }
      if (node.children) {
        for (const child of node.children) {
          this.bhForceNode(child, px, py, G, theta, softSq, _ax, _ay, accumulate);
        }
      }
      for (const p of node.points) {
        const pdx = p.x - px, pdy = p.y - py;
        const pdistSq = pdx * pdx + pdy * pdy + softSq;
        const pdist = Math.sqrt(pdistSq);
        const forceMag = G * (p.mass ?? 1) / pdistSq;
        accumulate(pdx / pdist * forceMag, pdy / pdist * forceMag);
      }
    }
    // ─── Diagnostics ─────────────────────────────────────────────────────────
    getDepth() {
      return this.nodeDepth(this.root);
    }
    nodeDepth(node) {
      if (!node.children)
        return 1;
      return 1 + Math.max(...node.children.map((c) => this.nodeDepth(c)));
    }
    getNodeCount() {
      return this.countNodes(this.root);
    }
    countNodes(node) {
      if (!node.children)
        return 1;
      return 1 + node.children.reduce((s, c) => s + this.countNodes(c), 0);
    }
  };

  // src/engine/physics/PhysicsBody.ts
  var PhysicsBody = class {
    constructor(x = 0, y = 0, mass = 1) {
      this.position = new Vector2(x, y);
      this.velocity = Vector2.zero();
      this.acceleration = Vector2.zero();
      this.mass = mass;
      this.inverseMass = mass > 0 ? 1 / mass : 0;
      this.damping = 0.9999;
      this.isStatic = mass <= 0;
    }
    applyForce(force) {
      if (this.isStatic)
        return;
      this.acceleration.x += force.x * this.inverseMass;
      this.acceleration.y += force.y * this.inverseMass;
    }
    applyImpulse(impulse) {
      if (this.isStatic)
        return;
      this.velocity.x += impulse.x * this.inverseMass;
      this.velocity.y += impulse.y * this.inverseMass;
    }
    integrate(dt) {
      if (this.isStatic)
        return;
      this.velocity.x += this.acceleration.x * dt;
      this.velocity.y += this.acceleration.y * dt;
      this.velocity.x *= Math.pow(this.damping, dt);
      this.velocity.y *= Math.pow(this.damping, dt);
      this.position.x += this.velocity.x * dt;
      this.position.y += this.velocity.y * dt;
      this.acceleration.x = 0;
      this.acceleration.y = 0;
    }
    get speed() {
      return this.velocity.magnitude();
    }
    reset() {
      this.position.set(0, 0);
      this.velocity.set(0, 0);
      this.acceleration.set(0, 0);
      this.mass = 1;
      this.inverseMass = 1;
      this.damping = 0.9999;
      this.isStatic = false;
    }
  };

  // src/game/GalaxyParticle.ts
  var GalaxyParticle = class extends PhysicsBody {
    // Z velocity for 3D formation animation
    constructor() {
      super(0, 0, 1);
      this.r = 0;
      this.g = 0;
      this.b = 0;
      this.alpha = 1;
      this.size = 1;
      this.type = "star";
      this.armIndex = 0;
      this.age = 0;
      this.orbitRadius = 0;
      this.active = false;
      this.colorPhase = 0;
      /** 3D height in galactic disc plane (world units) */
      this.z = 0;
      this.vz = 0;
    }
    get cssColor() {
      return `rgba(${this.r | 0},${this.g | 0},${this.b | 0},${this.alpha.toFixed(3)})`;
    }
    reset() {
      super.reset();
      this.r = 255;
      this.g = 255;
      this.b = 255;
      this.alpha = 1;
      this.size = 1;
      this.type = "star";
      this.armIndex = 0;
      this.age = 0;
      this.orbitRadius = 0;
      this.active = false;
      this.colorPhase = 0;
    }
  };

  // src/game/GalaxyScene.ts
  var DEF = {
    starCount: 12e3,
    dustCount: 2e3,
    galaxyRadius: 2400,
    coreRadius: 200,
    blackHoleMass: 22e5,
    G: 6674e-6,
    simSpeed: 1,
    formationDuration: 18
  };
  var ARMS = [
    { base: 0, pitch: 0.22 },
    { base: Math.PI / 2, pitch: 0.2 },
    { base: Math.PI, pitch: 0.21 },
    { base: 3 * Math.PI / 2, pitch: 0.19 }
  ];
  var TEMPS = [
    [155, 176, 255],
    [170, 191, 255],
    [202, 215, 255],
    [248, 247, 255],
    [255, 244, 232],
    [255, 222, 162],
    [255, 185, 95],
    [255, 140, 60]
  ];
  var NEBULA_COL = [
    [80, 30, 140],
    [20, 60, 180],
    [180, 30, 60],
    [30, 100, 150],
    [140, 50, 180]
  ];
  var GalaxyScene = class extends Scene {
    constructor(config) {
      super();
      this.particles = [];
      // 3D view
      this.pitch = Math.PI / 9;
      // ~20° initial tilt so disc depth is visible
      this.yaw = 0;
      this.panX = 0;
      this.panY = 0;
      this.zoom = 0.12;
      // start showing the full formed galaxy
      // Input
      this.panning = false;
      this.orbiting = false;
      this.mx = 0;
      this.my = 0;
      // Formation – visual only (chaos positions separate from physics positions)
      this.formT = 0;
      this.formed = false;
      this.time = 0;
      this.bgStars = [];
      this.fpsRef = { fps: 0 };
      this.cfg = Object.assign({}, DEF, config);
      this.pool = new ObjectPool(() => new GalaxyParticle(), (p) => p.reset(), 16e3);
    }
    onEnter(ctx) {
      super.onEnter(ctx);
      this.initQt();
      this.spawn();
      this.buildUI();
      this.bindInput();
    }
    onExit() {
      this.freeAll();
      document.getElementById("galaxy-ui")?.remove();
      this.ctx.input.removeAllListeners();
    }
    // ---- 3D projection (inline-friendly helper) ------------------------------
    proj(wx, wy, wz, W, H) {
      const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
      const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      const rx = wx * cy + wy * sy;
      const ry = -wx * sy + wy * cy;
      const projY = ry * cp - wz * sp;
      return {
        sx: (rx - this.panX) * this.zoom + W * 0.5,
        sy: (projY - this.panY) * this.zoom + H * 0.5
      };
    }
    // ---- Init ----------------------------------------------------------------
    initQt() {
      const R = this.cfg.galaxyRadius * 2;
      this.qt = new QuadTree({ x: 0, y: 0, hw: R, hh: R }, 8, 14);
    }
    freeAll() {
      for (const p of this.particles)
        this.pool.release(p);
      this.particles.length = 0;
    }
    // ---- Spawn ---------------------------------------------------------------
    // Physics positions = correct orbital positions from the start.
    // Chaos positions   = random 3D sphere = visual-only for formation animation.
    spawn() {
      this.freeAll();
      this.formT = 0;
      this.formed = false;
      const cfg = this.cfg;
      const total = cfg.starCount + cfg.dustCount;
      this.chaosX = new Float32Array(total);
      this.chaosY = new Float32Array(total);
      this.chaosZ = new Float32Array(total);
      let idx = 0;
      const coreN = Math.floor(cfg.starCount * 0.18);
      for (let i = 0; i < coreN; i++, idx++) {
        const r = Math.abs(MathUtils.gaussianRandom(0, cfg.coreRadius * 0.5));
        const a = Math.random() * MathUtils.PI2;
        this.makeParticle(
          idx,
          r * Math.cos(a),
          r * Math.sin(a),
          MathUtils.gaussianRandom(0, cfg.coreRadius * 0.45),
          a,
          r,
          "core",
          0
        );
      }
      const barN = Math.floor(cfg.starCount * 0.07);
      const bAng = 0.25;
      for (let i = 0; i < barN; i++, idx++) {
        const along = MathUtils.gaussianRandom(0, cfg.coreRadius * 1.5);
        const perp = MathUtils.gaussianRandom(0, cfg.coreRadius * 0.14);
        const tx = Math.cos(bAng) * along - Math.sin(bAng) * perp;
        const ty = Math.sin(bAng) * along + Math.cos(bAng) * perp;
        const r = Math.sqrt(tx * tx + ty * ty);
        const a = Math.atan2(ty, tx);
        this.makeParticle(idx, tx, ty, MathUtils.gaussianRandom(0, cfg.coreRadius * 0.3), a, r, "core", 0);
      }
      const armN = cfg.starCount - coreN - barN;
      const perArm = Math.floor(armN / ARMS.length);
      for (let ai = 0; ai < ARMS.length; ai++) {
        for (let i = 0; i < perArm; i++, idx++) {
          const { tx, ty, ang, r } = this.sampleArm(ARMS[ai]);
          const dzScale = cfg.galaxyRadius * 0.1 * (0.8 - 0.65 * (r / cfg.galaxyRadius));
          const dz = MathUtils.gaussianRandom(0, Math.max(dzScale, cfg.coreRadius * 0.05));
          this.makeParticle(idx, tx, ty, dz, ang, r, "star", ai);
        }
      }
      for (let i = 0; i < cfg.dustCount; i++, idx++) {
        const arm = ARMS[i % ARMS.length];
        const { tx, ty, ang, r } = this.sampleArm(arm, 1.6);
        const type = i % 5 === 0 ? "nebula" : "dust";
        const dzScale = cfg.galaxyRadius * 0.09 * (0.8 - 0.6 * (r / cfg.galaxyRadius));
        this.makeParticle(
          idx,
          tx,
          ty,
          MathUtils.gaussianRandom(0, Math.max(dzScale, cfg.coreRadius * 0.04)),
          ang,
          r,
          type,
          i % ARMS.length
        );
      }
    }
    makeParticle(idx, tx, ty, tz, ang, r, type, ai) {
      const p = this.pool.acquire();
      const cfg = this.cfg;
      p.position.x = tx;
      p.position.y = ty;
      p.z = tz;
      const orbV = Math.sqrt(cfg.G * cfg.blackHoleMass / Math.max(r, 5));
      p.velocity.x = -Math.sin(ang) * orbV;
      p.velocity.y = Math.cos(ang) * orbV;
      p.vz = 0;
      const chaosR = MathUtils.randomRange(200, 6e3);
      const chaosAz = Math.random() * MathUtils.PI2;
      const chaosEl = (Math.random() - 0.5) * Math.PI;
      this.chaosX[idx] = Math.cos(chaosEl) * Math.cos(chaosAz) * chaosR;
      this.chaosY[idx] = Math.cos(chaosEl) * Math.sin(chaosAz) * chaosR;
      this.chaosZ[idx] = Math.sin(chaosEl) * chaosR;
      p.type = type;
      p.armIndex = ai;
      p.orbitRadius = r;
      p.active = true;
      p.age = Math.random() * 50;
      p.colorPhase = Math.random() * MathUtils.PI2;
      p.mass = 1;
      p.inverseMass = 1;
      this.colorP(p, r, type, ai);
      this.sizeP(p, type);
      this.particles.push(p);
    }
    sampleArm(arm, spreadMult = 1) {
      const cfg = this.cfg;
      const t = Math.pow(Math.random(), 0.55);
      const r = MathUtils.lerp(cfg.coreRadius * 0.5, cfg.galaxyRadius, t);
      const theta = arm.base + 1 / arm.pitch * Math.log(r / (cfg.coreRadius * 0.35) + 1);
      const spread = MathUtils.gaussianRandom(0, 0.32 * spreadMult * (0.25 + t * 0.75));
      const ang = theta + spread;
      const rScatter = r + MathUtils.gaussianRandom(0, r * 0.06);
      return { tx: Math.cos(ang) * rScatter, ty: Math.sin(ang) * rScatter, ang, r: rScatter };
    }
    colorP(p, r, type, ai) {
      const nr = MathUtils.clamp(r / this.cfg.galaxyRadius, 0, 1);
      if (type === "nebula") {
        const c = NEBULA_COL[Math.floor(Math.random() * NEBULA_COL.length)];
        p.r = c[0];
        p.g = c[1];
        p.b = c[2];
        return;
      }
      if (type === "dust") {
        p.r = MathUtils.randomRange(150, 195);
        p.g = MathUtils.randomRange(80, 125);
        p.b = MathUtils.randomRange(35, 75);
        return;
      }
      if (type === "core") {
        const c = TEMPS[Math.floor(Math.random() * 3)];
        p.r = c[0];
        p.g = c[1];
        p.b = c[2];
        return;
      }
      const ci = MathUtils.clamp(nr * 1.2 + MathUtils.gaussianRandom(0, 0.16), 0, 1) * (TEMPS.length - 1);
      const lo = Math.floor(ci), hi = Math.min(lo + 1, TEMPS.length - 1);
      const frac = ci - lo;
      const ca = TEMPS[lo], cb = TEMPS[hi];
      p.r = MathUtils.lerp(ca[0], cb[0], frac);
      p.g = MathUtils.lerp(ca[1], cb[1], frac);
      p.b = MathUtils.lerp(ca[2], cb[2], frac);
    }
    sizeP(p, type) {
      if (type === "core") {
        p.size = MathUtils.randomRange(1, 2.5);
        p.alpha = MathUtils.randomRange(0.6, 0.9);
      } else if (type === "star") {
        p.size = MathUtils.randomRange(0.7, 2);
        p.alpha = MathUtils.randomRange(0.45, 0.85);
      } else if (type === "dust") {
        p.size = MathUtils.randomRange(0.8, 2.2);
        p.alpha = MathUtils.randomRange(0.03, 0.1);
      } else {
        p.size = MathUtils.randomRange(50, 200);
        p.alpha = MathUtils.randomRange(8e-3, 0.03);
      }
    }
    // ---- Input ---------------------------------------------------------------
    bindInput() {
      const canvas2 = this.ctx.renderer.canvas;
      canvas2.addEventListener("mousedown", (e) => {
        if (e.button === 0)
          this.orbiting = true;
        if (e.button === 2)
          this.panning = true;
        this.mx = e.clientX;
        this.my = e.clientY;
      });
      window.addEventListener("mouseup", () => {
        this.panning = false;
        this.orbiting = false;
      });
      window.addEventListener("mousemove", (e) => {
        const dx = e.clientX - this.mx, dy = e.clientY - this.my;
        this.mx = e.clientX;
        this.my = e.clientY;
        if (this.orbiting) {
          this.yaw += dx * 6e-3;
          this.pitch = MathUtils.clamp(this.pitch + dy * 4e-3, -Math.PI * 0.499, Math.PI * 0.499);
        }
        if (this.panning) {
          this.panX -= dx / this.zoom;
          this.panY -= dy / this.zoom;
        }
      });
      canvas2.addEventListener("contextmenu", (e) => e.preventDefault());
      canvas2.addEventListener("wheel", (e) => {
        e.preventDefault();
        const f = e.deltaY > 0 ? 0.88 : 1 / 0.88;
        this.zoom = MathUtils.clamp(this.zoom * f, 4e-3, 5);
      }, { passive: false });
    }
    // ---- Update --------------------------------------------------------------
    update(dt) {
      const cfg = this.cfg;
      const sdt = Math.min(dt, 0.033) * cfg.simSpeed;
      this.time += sdt;
      if (!this.formed) {
        this.formT += dt;
        if (this.formT >= cfg.formationDuration)
          this.formed = true;
      }
      this.qt.clear();
      for (const p of this.particles) {
        if (p.active)
          this.qt.insert({ x: p.position.x, y: p.position.y, mass: p.mass, data: p });
      }
      const G = cfg.G, M = cfg.blackHoleMass;
      const softSq = (cfg.coreRadius * 0.25) ** 2;
      const maxAcc = 4e3;
      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        if (!p.active)
          continue;
        const dx = -p.position.x, dy = -p.position.y;
        const ds = dx * dx + dy * dy + softSq;
        const d = Math.sqrt(ds);
        let acc = G * M / ds;
        if (acc > maxAcc)
          acc = maxAcc;
        p.velocity.x += dx / d * acc * sdt;
        p.velocity.y += dy / d * acc * sdt;
        p.vz += (-p.z * 8e-3 - p.vz * 0.18) * sdt;
        p.z += p.vz * sdt;
        p.position.x += p.velocity.x * sdt;
        p.position.y += p.velocity.y * sdt;
        p.age += sdt;
        if (p.type === "star" || p.type === "core") {
          p.colorPhase += sdt * 0.35;
          const tw = 0.88 + 0.12 * Math.sin(p.colorPhase);
          p.alpha = MathUtils.clamp((p.type === "core" ? 0.62 : 0.56) * tw, 0.06, 0.88);
        }
      }
    }
    // ---- Render --------------------------------------------------------------
    render(renderer) {
      const ctx = renderer.ctx;
      const W = renderer.width;
      const H = renderer.height;
      const pr = window.devicePixelRatio || 1;
      renderer.clear("#000004");
      renderer.resetTransform();
      this.drawBgStars(ctx, W, H);
      const formEase = this.formed ? 1 : MathUtils.smootherstep(0, 1, Math.min(this.formT / this.cfg.formationDuration, 1));
      const cy_ = Math.cos(this.yaw), sy_ = Math.sin(this.yaw);
      const cp_ = Math.cos(this.pitch), sp_ = Math.sin(this.pitch);
      const z_ = this.zoom;
      const oX = W * 0.5;
      const oY = H * 0.5;
      const PW = W * pr | 0;
      const PH = H * pr | 0;
      const img = ctx.createImageData(PW, PH);
      const buf = img.data;
      const LARGE = [];
      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        if (!p.active || p.type === "nebula")
          continue;
        const wx = MathUtils.lerp(this.chaosX[i], p.position.x, formEase);
        const wy = MathUtils.lerp(this.chaosY[i], p.position.y, formEase);
        const wz = MathUtils.lerp(this.chaosZ[i], p.z, formEase);
        const rx = wx * cy_ + wy * sy_;
        const ry = -wx * sy_ + wy * cy_;
        const projY = ry * cp_ - wz * sp_;
        const sx = (rx - this.panX) * z_ + oX;
        const sy3 = (projY - this.panY) * z_ + oY;
        const sr = p.size * z_;
        if (sx < -sr * 2 || sx > W + sr * 2 || sy3 < -sr * 2 || sy3 > H + sr * 2)
          continue;
        const screenPhysPx = sr * pr;
        if (screenPhysPx > 4 && p.type !== "dust") {
          p._sx = sx;
          p._sy = sy3;
          p._sr = sr;
          LARGE.push(p);
        } else {
          const px2 = sx * pr | 0;
          const py2 = sy3 * pr | 0;
          const drawA = Math.min(p.alpha, 0.72);
          const aInt = drawA * 255 | 0;
          const rr = p.r | 0, gg = p.g | 0, bb = p.b | 0;
          const half = screenPhysPx > 1.8 ? 1 : 0;
          for (let dy2 = -half; dy2 <= half; dy2++) {
            for (let dx2 = -half; dx2 <= half; dx2++) {
              const ppx = px2 + dx2, ppy = py2 + dy2;
              if (ppx < 0 || ppx >= PW || ppy < 0 || ppy >= PH)
                continue;
              const off = (ppy * PW + ppx) * 4;
              if (aInt > buf[off + 3]) {
                buf[off] = rr;
                buf[off + 1] = gg;
                buf[off + 2] = bb;
                buf[off + 3] = aInt;
              }
            }
          }
        }
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.putImageData(img, 0, 0);
      ctx.setTransform(pr, 0, 0, pr, 0, 0);
      ctx.globalCompositeOperation = "screen";
      for (const p of LARGE) {
        const sx = p._sx;
        const sy3 = p._sy;
        const glowR = Math.min(p._sr * 2.4, 10);
        ctx.globalAlpha = 1;
        const grd = ctx.createRadialGradient(sx, sy3, 0, sx, sy3, glowR);
        const alpha = (p.alpha * 0.85).toFixed(3);
        const alpha2 = (p.alpha * 0.15).toFixed(3);
        grd.addColorStop(0, `rgba(${p.r | 0},${p.g | 0},${p.b | 0},${alpha})`);
        grd.addColorStop(0.45, `rgba(${p.r | 0},${p.g | 0},${p.b | 0},${alpha2})`);
        grd.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(sx, sy3, glowR, 0, MathUtils.PI2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "screen";
      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        if (p.type !== "nebula")
          continue;
        const wx = MathUtils.lerp(this.chaosX[i], p.position.x, formEase);
        const wy = MathUtils.lerp(this.chaosY[i], p.position.y, formEase);
        const wz = MathUtils.lerp(this.chaosZ[i], p.z, formEase);
        const { sx, sy } = this.proj(wx, wy, wz, W, H);
        const nr = p.size * this.zoom;
        if (sx + nr < 0 || sx - nr > W || sy + nr < 0 || sy - nr > H)
          continue;
        ctx.globalAlpha = p.alpha;
        const grd = ctx.createRadialGradient(sx, sy, 0, sx, sy, nr);
        grd.addColorStop(0, `rgba(${p.r | 0},${p.g | 0},${p.b | 0},0.7)`);
        grd.addColorStop(0.55, `rgba(${p.r | 0},${p.g | 0},${p.b | 0},0.15)`);
        grd.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(sx, sy, nr, 0, MathUtils.PI2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      this.drawBH(ctx, W, H);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      this.drawHUD(ctx, W, H);
      this.drawFormBar(ctx, W, H);
    }
    // ---- Helpers -------------------------------------------------------------
    drawBgStars(ctx, W, H) {
      if (this.bgStars.length === 0) {
        for (let i = 0; i < 500; i++) {
          this.bgStars.push({
            x: Math.random(),
            y: Math.random(),
            r: MathUtils.randomRange(0.1, 0.45),
            a: MathUtils.randomRange(0.04, 0.22)
          });
        }
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#ffffff";
      for (const s of this.bgStars) {
        ctx.globalAlpha = s.a + 0.04 * Math.sin(this.time * 0.3 + s.x * 80);
        ctx.beginPath();
        ctx.arc(s.x * W, s.y * H, s.r, 0, MathUtils.PI2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    drawBH(ctx, W, H) {
      ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
      const { sx, sy } = this.proj(0, 0, 0, W, H);
      const cr = this.cfg.coreRadius;
      const ringR = cr * 0.36 * this.zoom;
      if (ringR < 1)
        return;
      ctx.globalCompositeOperation = "screen";
      const ring = ctx.createRadialGradient(sx, sy, ringR * 0.12, sx, sy, ringR);
      ring.addColorStop(0, "rgba(255,255,255,0)");
      ring.addColorStop(0.28, "rgba(255,240,200,0.6)");
      ring.addColorStop(0.62, "rgba(255,120,35,0.3)");
      ring.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = ring;
      ctx.beginPath();
      ctx.arc(sx, sy, ringR, 0, MathUtils.PI2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      const bhR = Math.max(ringR * 0.13, 2);
      const bh = ctx.createRadialGradient(sx, sy, 0, sx, sy, bhR * 2.2);
      bh.addColorStop(0, "#000000");
      bh.addColorStop(0.65, "#000000");
      bh.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = bh;
      ctx.beginPath();
      ctx.arc(sx, sy, bhR * 2.2, 0, MathUtils.PI2);
      ctx.fill();
    }
    drawHUD(ctx, W, H) {
      const d = (r) => Math.round(r * 180 / Math.PI);
      ctx.globalAlpha = 0.32;
      ctx.fillStyle = "#b8bcff";
      ctx.font = "11px Inter, system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(
        `AntiGravity Engine  |  ${this.particles.length.toLocaleString()} particles  |  ${this.fpsRef.fps} FPS  |  ${this.zoom.toFixed(3)}x  |  pitch ${d(this.pitch)}  yaw ${d(this.yaw % MathUtils.PI2)}`,
        14,
        H - 16
      );
      ctx.globalAlpha = 1;
    }
    drawFormBar(ctx, W, H) {
      if (this.formed)
        return;
      const t = Math.min(this.formT / this.cfg.formationDuration, 1);
      const bw = 220, bh_ = 4, bx = (W - bw) / 2, by = H - 50;
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = "rgba(255,255,255,0.07)";
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh_, 2);
      ctx.fill();
      ctx.fillStyle = "#8b7ff5";
      ctx.beginPath();
      ctx.roundRect(bx, by, bw * t, bh_, 2);
      ctx.fill();
      ctx.globalAlpha = 0.42;
      ctx.fillStyle = "rgba(180,180,255,0.7)";
      ctx.font = "11px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Galaxy forming...", W / 2, H - 58);
      ctx.globalAlpha = 1;
    }
    // ---- UI ------------------------------------------------------------------
    buildUI() {
      const cfg = this.cfg;
      const el = document.createElement("div");
      el.id = "galaxy-ui";
      el.innerHTML = `
<div class="ui-title">Milky Way Controls</div>
<div class="ui-section"><label>Stars <span id="vl-s">${cfg.starCount.toLocaleString()}</span></label>
  <input type="range" id="sl-s" min="2000" max="20000" step="1000" value="${cfg.starCount}"></div>
<div class="ui-section"><label>Dust <span id="vl-d">${cfg.dustCount.toLocaleString()}</span></label>
  <input type="range" id="sl-d" min="0" max="6000" step="500" value="${cfg.dustCount}"></div>
<div class="ui-section"><label>Galaxy Radius <span id="vl-r">${cfg.galaxyRadius}</span></label>
  <input type="range" id="sl-r" min="500" max="6000" step="100" value="${cfg.galaxyRadius}"></div>
<div class="ui-section"><label>Black Hole Mass <span id="vl-m">${(cfg.blackHoleMass / 1e6).toFixed(1)}M</span></label>
  <input type="range" id="sl-m" min="200000" max="12000000" step="200000" value="${cfg.blackHoleMass}"></div>
<div class="ui-section"><label>Sim Speed <span id="vl-v">${cfg.simSpeed.toFixed(1)}x</span></label>
  <input type="range" id="sl-v" min="0" max="5" step="0.1" value="${cfg.simSpeed}"></div>
<div class="ui-section"><label>Formation Time <span id="vl-f">${cfg.formationDuration}s</span></label>
  <input type="range" id="sl-f" min="3" max="60" step="1" value="${cfg.formationDuration}"></div>
<button id="btn-respawn">Regenerate</button>
<div class="ui-hints">Left drag: orbit 3D  |  Right drag: pan  |  Scroll: zoom</div>`;
      const wire = (id, vid, fn) => {
        const sl = el.querySelector(`#${id}`);
        const vl = el.querySelector(`#${vid}`);
        sl?.addEventListener("input", () => {
          if (vl)
            vl.textContent = fn(parseFloat(sl.value));
        });
      };
      wire("sl-s", "vl-s", (v) => {
        cfg.starCount = v;
        return v.toLocaleString();
      });
      wire("sl-d", "vl-d", (v) => {
        cfg.dustCount = v;
        return v.toLocaleString();
      });
      wire("sl-r", "vl-r", (v) => {
        cfg.galaxyRadius = v;
        return `${v}`;
      });
      wire("sl-m", "vl-m", (v) => {
        cfg.blackHoleMass = v;
        return `${(v / 1e6).toFixed(1)}M`;
      });
      wire("sl-v", "vl-v", (v) => {
        cfg.simSpeed = v;
        return `${v.toFixed(1)}x`;
      });
      wire("sl-f", "vl-f", (v) => {
        cfg.formationDuration = v;
        return `${v}s`;
      });
      el.querySelector("#btn-respawn")?.addEventListener("click", () => {
        this.initQt();
        this.spawn();
      });
      document.body.appendChild(el);
    }
  };

  // src/main.ts
  var canvas = document.getElementById("game-canvas");
  if (!canvas)
    throw new Error("Canvas element not found!");
  var game = new GameCore({
    canvas,
    fixedDt: 1 / 60,
    maxDeltaTime: 0.05
  });
  var galaxyScene = new GalaxyScene();
  game.on("update", () => {
    galaxyScene.fpsRef.fps = game.fps;
  });
  game.start(galaxyScene);
})();
//# sourceMappingURL=main.js.map
