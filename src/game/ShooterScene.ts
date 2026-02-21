import { Scene, SceneContext } from '../engine/scene/Scene.js';
import { Renderer } from '../engine/renderer/Renderer.js';

// --- Constants ---
const GRAVITY = 1200;
const GROUND_Y = 500;
const FLOOR_THICKNESS = 100;

export class ShooterScene extends Scene {
    // Player State
    private px = 200;
    private py = GROUND_Y;
    private vx = 0;
    private vy = 0;
    private jumpTimer = 0;
    private walkCycle = 0;
    private onGround = false;
    private aimAngle = 0;
    private lives = 3;
    private maxLives = 3;
    private score = 0;
    private coins = 0;
    private lastFired = 0;

    // Level System
    private levelLength = 7000;
    private levelComplete = false;

    // Entities
    private bullets: { x: number, y: number, vx: number, vy: number, age: number, isEnemy: boolean }[] = [];
    private boxes: { x: number, y: number, w: number, h: number, vx: number, vy: number, angularVel: number, angle: number }[] = [];
    private enemies: { x: number, y: number, vx: number, vy: number, hp: number, walkCycle: number, active: boolean, shootCooldown: number }[] = [];
    private particles: { x: number, y: number, vx: number, vy: number, age: number, maxAge: number, type: string }[] = [];
    private platforms: { x: number, y: number, w: number, h: number }[] = [];
    private collectibles: { x: number, y: number, vx: number, vy: number, age: number, maxAge: number, type: 'coin' }[] = [];
    private clouds: { x: number, y: number, speed: number, scale: number }[] = [];

    // Camera
    private camX = 0;

    // Background Layers
    private bgFar: { w: number, h: number, windows: boolean[] }[] = [];
    private bgMid: { w: number, h: number, type: number }[] = [];
    private stars: { x: number, y: number, r: number }[] = [];

    override onEnter(ctx: SceneContext): void {
        super.onEnter(ctx);

        // Generate Parallax City Background
        for (let i = 0; i < 150; i++) { // More buildings for long level
            const windows = [];
            for (let j = 0; j < 20; j++) windows.push(Math.random() > 0.6);
            this.bgFar.push({ w: Math.random() * 100 + 80, h: Math.random() * 300 + 100, windows });
            this.bgMid.push({ w: Math.random() * 80 + 60, h: Math.random() * 200 + 50, type: Math.floor(Math.random() * 3) });
        }
        for (let i = 0; i < 200; i++) {
            this.stars.push({ x: Math.random() * this.levelLength, y: Math.random() * 400, r: Math.random() * 1.5 });
        }

        // Spawn Clouds
        for (let i = 0; i < 15; i++) {
            this.clouds.push({
                x: Math.random() * this.levelLength,
                y: Math.random() * 200 + 50,
                speed: Math.random() * 20 + 10,
                scale: Math.random() * 0.5 + 0.5
            });
        }

        this.loadLevel();
    }

    private loadLevel() {
        this.boxes = [];
        this.enemies = [];
        this.platforms = [];
        this.collectibles = [];

        // Pre-defined platforms
        this.platforms.push({ x: 1000, y: GROUND_Y - 100, w: 200, h: 20 });
        this.platforms.push({ x: 1300, y: GROUND_Y - 200, w: 200, h: 20 });
        this.platforms.push({ x: 2500, y: GROUND_Y - 150, w: 400, h: 20 });
        this.platforms.push({ x: 4000, y: GROUND_Y - 120, w: 300, h: 20 });
        this.platforms.push({ x: 5500, y: GROUND_Y - 80, w: 150, h: 20 });
        this.platforms.push({ x: 5700, y: GROUND_Y - 180, w: 150, h: 20 });
        this.platforms.push({ x: 5900, y: GROUND_Y - 280, w: 150, h: 20 });

        // Pre-defined enemy checkpoints and ambushes
        const enemySpawns = [
            { x: 1200, y: GROUND_Y }, { x: 1400, y: GROUND_Y - 200 }, // On platform
            { x: 2400, y: GROUND_Y }, { x: 2700, y: GROUND_Y - 150 }, // On platform
            { x: 3200, y: GROUND_Y }, { x: 4100, y: GROUND_Y - 120 }, // On platform
            { x: 4200, y: GROUND_Y }, { x: 5000, y: GROUND_Y },
            { x: 5500, y: GROUND_Y }, { x: 5900, y: GROUND_Y - 280 }, // Top platform
            { x: 6500, y: GROUND_Y }, { x: 6800, y: GROUND_Y }
        ];

        for (const ep of enemySpawns) {
            this.enemies.push({ x: ep.x, y: ep.y, vx: -50, vy: 0, hp: 2, walkCycle: 0, active: false, shootCooldown: 0 });
        }

        // Pre-defined box structures/barricades
        const boxStacks = [
            { x: 800, count: 3 },
            { x: 2000, count: 5 },
            { x: 3500, count: 4 },
            { x: 4800, count: 6 },
            { x: 6000, count: 3 }
        ];

        for (const stack of boxStacks) {
            for (let i = 0; i < stack.count; i++) {
                this.boxes.push({
                    x: stack.x + (Math.random() * 10 - 5), // Slight scatter so they settle naturally
                    y: GROUND_Y - 50 - i * 50,
                    w: 50, h: 50,
                    vx: 0, vy: 0,
                    angularVel: 0, angle: 0
                });
            }
        }
    }

    override update(dt: number): void {
        const simDt = Math.min(dt, 0.05);

        // Input
        const input = this.ctx.input;

        // Player movement
        const speed = 300;
        let moveX = 0;
        if (input.isKeyDown('ArrowLeft') || input.isKeyDown('KeyA')) moveX -= 1;
        if (input.isKeyDown('ArrowRight') || input.isKeyDown('KeyD')) moveX += 1;

        this.vx = moveX * speed;

        // Jumping
        this.jumpTimer -= simDt;
        if ((input.isKeyDown('ArrowUp') || input.isKeyDown('KeyW') || input.isKeyDown('Space')) && this.onGround && this.jumpTimer <= 0) {
            this.vy = -600;
            this.onGround = false;
            this.jumpTimer = 0.2; // Jump cooldown
        }

        // Apply Gravity
        this.vy += GRAVITY * simDt;

        // Integrate Position
        this.px += this.vx * simDt;
        this.py += this.vy * simDt;

        // Ground & Platform collision
        let hitGround = false;
        if (this.py >= GROUND_Y) {
            this.py = GROUND_Y;
            hitGround = true;
        }

        for (const plat of this.platforms) {
            // Simple falling-onto platform check
            if (this.vy > 0 && this.px > plat.x && this.px < plat.x + plat.w &&
                this.py >= plat.y && this.py - this.vy * simDt <= plat.y) {
                this.py = plat.y;
                hitGround = true;
            }
        }

        if (hitGround) {
            this.vy = 0;
            this.onGround = true;
        }

        // Animation
        if (Math.abs(this.vx) > 10 && this.onGround) {
            this.walkCycle += simDt * 12;
        } else {
            this.walkCycle = 0; // Reset to standing
        }

        // Camera follow
        this.camX += (this.px - this.camX - this.ctx.renderer.width / 2 + 100) * 5 * simDt;

        // Aiming
        const screenPx = this.px - this.camX;
        const screenPy = this.py; // Camera Y is fixed
        // Arm pivot matches ctx.translate(0, -55) in renderPlayer
        const pivotX = screenPx;
        const pivotY = screenPy - 55;

        const mousePos = input.getMousePosition();
        const mx = mousePos.x;
        const my = mousePos.y;
        this.aimAngle = Math.atan2(my - pivotY, mx - pivotX);

        // Shooting
        this.lastFired -= simDt;
        if (input.isMouseDown(0) && this.lastFired <= 0) {
            this.fireBullet(pivotX + this.camX, pivotY, this.aimAngle, false);
            this.lastFired = 0.15; // Fire rate
        }

        // Update Bullets
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            b.x += b.vx * simDt;
            b.y += b.vy * simDt;
            b.age += simDt;

            let hit = false;
            // Ground hit
            if (b.y > GROUND_Y) hit = true;

            // Box hit
            for (const box of this.boxes) {
                if (b.x > box.x - box.w / 2 && b.x < box.x + box.w / 2 &&
                    b.y > box.y - box.h / 2 && b.y < box.y + box.h / 2) {
                    hit = true;
                    // Apply impulse to box
                    box.vx += b.vx * 0.1;
                    box.vy += b.vy * 0.1 - 100;
                    box.angularVel += (Math.random() - 0.5) * 10;
                    this.spawnImpactSparks(b.x, b.y);
                    break;
                }
            }

            // Player hit by bullet
            if (b.isEnemy) {
                if (b.x > this.px - 15 && b.x < this.px + 15 && b.y > this.py - 70 && b.y < this.py) {
                    hit = true;
                    if (this.lives > 0 && !this.levelComplete) {
                        this.lives--;
                        this.vy = -300;
                        this.vx = b.vx * 0.5;
                        this.spawnImpactSparks(b.x, b.y);
                    }
                }
            }

            // Enemy hit by bullet
            if (!b.isEnemy) {
                for (let j = this.enemies.length - 1; j >= 0; j--) {
                    const e = this.enemies[j];
                    if (!e.active) continue;
                    // simple rect around stick figure
                    if (b.x > e.x - 20 && b.x < e.x + 20 && b.y > e.y - 70 && b.y < e.y) {
                        hit = true;
                        e.hp--;
                        e.vx += b.vx * 0.15;
                        this.spawnImpactSparks(b.x, b.y);
                        if (e.hp <= 0) {
                            this.score += 100;
                            this.spawnDeathCloud(e.x, e.y - 35);
                            this.spawnCoins(e.x, e.y - 35, 3);
                            this.enemies.splice(j, 1);
                        }
                        break;
                    }
                }
            }

            if (b.age > 2 || hit) {
                this.bullets.splice(i, 1);
            }
        }

        // Update Boxes
        for (const b of this.boxes) {
            b.vy += GRAVITY * simDt;
            b.x += b.vx * simDt;
            b.y += b.vy * simDt;
            b.angle += b.angularVel * simDt;
            b.vx *= 0.98; // Friction
            b.angularVel *= 0.95;

            let hitPlat = false;
            for (const plat of this.platforms) {
                if (b.vy > 0 && b.x > plat.x && b.x < plat.x + plat.w &&
                    b.y >= plat.y - b.h / 2 && b.y - b.vy * simDt <= plat.y) {
                    b.y = plat.y - b.h / 2;
                    hitPlat = true;
                }
            }

            if (b.y > GROUND_Y - b.h / 2) {
                b.y = GROUND_Y - b.h / 2;
                hitPlat = true;
            }

            if (hitPlat) {
                b.vy *= -0.4;
                b.vx *= 0.8;
                b.angularVel *= 0.8;
            }
        }

        // Simple Box-Box collisions (push apart)
        for (let i = 0; i < this.boxes.length; i++) {
            for (let j = i + 1; j < this.boxes.length; j++) {
                const b1 = this.boxes[i];
                const b2 = this.boxes[j];
                const dx = b2.x - b1.x;
                const dy = b2.y - b1.y;
                if (Math.abs(dx) < 50 && Math.abs(dy) < 50) {
                    // Overlap
                    if (Math.abs(dx) > Math.abs(dy)) {
                        const push = Math.sign(dx) * (50 - Math.abs(dx)) * 0.5;
                        b1.x -= push; b2.x += push;
                        b1.vx -= push * 5; b2.vx += push * 5;
                    } else {
                        const push = Math.sign(dy) * (50 - Math.abs(dy)) * 0.5;
                        b1.y -= push; b2.y += push;
                        b1.vy -= push * 5; b2.vy += push * 5;
                    }
                }
            }
        }

        // Update Enemies
        for (const e of this.enemies) {
            // Distance culling: only simulate if within 1500px of player
            const dist = e.x - this.px;
            if (Math.abs(dist) > 1500) {
                e.active = false;
                continue;
            } else {
                e.active = true;
            }

            e.vy += GRAVITY * simDt;
            e.x += e.vx * simDt;
            e.y += e.vy * simDt;

            let eHitGround = false;
            if (e.y > GROUND_Y) {
                e.y = GROUND_Y;
                eHitGround = true;
            }
            for (const plat of this.platforms) {
                if (e.vy > 0 && e.x > plat.x && e.x < plat.x + plat.w &&
                    e.y >= plat.y && e.y - e.vy * simDt <= plat.y) {
                    e.y = plat.y;
                    eHitGround = true;
                }
            }
            if (eHitGround) {
                e.vy = 0;
            }

            // Walk animation
            if (Math.abs(e.vx) > 10) e.walkCycle += simDt * 10;
            else e.walkCycle = 0;

            // Simple AI patrol / seek player depending on distance
            const dx = this.px - e.x;
            const dy = this.py - e.y;
            const distToPlayer = Math.sqrt(dx * dx + dy * dy);

            if (distToPlayer < 600) {
                // Aim and shoot
                e.vx *= 0.8; // Slow down to shoot
                e.shootCooldown -= simDt;
                if (e.shootCooldown <= 0) {
                    const angle = Math.atan2(dy - 35, dx);
                    // Add some spread
                    const spread = (Math.random() - 0.5) * 0.2;
                    this.fireBullet(e.x, e.y - 35, angle + spread, true);
                    e.shootCooldown = Math.random() * 1.5 + 0.5; // Random interval
                }
            } else {
                // Patrol
                if (e.x > this.px + 400) e.vx = -100;
                if (e.x < this.px - 400) e.vx = 100;
            }

            // Player hit by touching enemy
            if (Math.abs(e.x - this.px) < 30 && Math.abs(e.y - this.py) < 70) {
                if (this.lives > 0 && !this.levelComplete) {
                    this.lives--;
                    this.vy = -300;
                    this.vx = Math.sign(this.px - e.x) * 400;
                    e.vx = Math.sign(e.x - this.px) * 200;
                }
            }
        }

        // Win Condition
        if (this.px >= this.levelLength && !this.levelComplete) {
            this.levelComplete = true;
            this.score += 5000; // Win bonus
        }

        // Update Particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx * simDt;
            p.y += p.vy * simDt;
            p.age += simDt;
            if (p.type === 'spark') p.vy += GRAVITY * 0.5 * simDt; // Sparks fall
            if (p.age >= p.maxAge) this.particles.splice(i, 1);
        }

        // Update Clouds
        for (const c of this.clouds) {
            c.x += c.speed * simDt;
            if (c.x > this.levelLength + 2000) c.x = -1000;
        }

        // Update Collectibles
        for (let i = this.collectibles.length - 1; i >= 0; i--) {
            const c = this.collectibles[i];
            c.vy += GRAVITY * simDt;
            c.x += c.vx * simDt;
            c.y += c.vy * simDt;
            c.age += simDt;

            let cHitGround = false;
            if (c.y > GROUND_Y - 5) {
                c.y = GROUND_Y - 5;
                cHitGround = true;
            }
            for (const plat of this.platforms) {
                if (c.vy > 0 && c.x > plat.x && c.x < plat.x + plat.w &&
                    c.y >= plat.y - 5 && c.y - c.vy * simDt <= plat.y) {
                    c.y = plat.y - 5;
                    cHitGround = true;
                }
            }

            if (cHitGround) {
                c.vy *= -0.6;
                c.vx *= 0.8;
            }

            // Check collect
            if (Math.abs(this.px - c.x) < 30 && Math.abs(this.py - 35 - c.y) < 40) {
                this.coins++;
                this.score += 50;
                this.collectibles.splice(i, 1);
                continue;
            }

            if (c.age >= c.maxAge) this.collectibles.splice(i, 1);
        }
    }

    private fireBullet(x: number, y: number, angle: number, isEnemy: boolean) {
        const speed = 1500;
        const dirX = Math.cos(angle);
        const dirY = Math.sin(angle);
        // Start bullet at end of gun barrel
        const barrelLen = 40;
        const bx = x + dirX * barrelLen;
        const by = y + dirY * barrelLen;

        this.bullets.push({
            x: bx, y: by,
            vx: dirX * speed, vy: dirY * speed,
            age: 0,
            isEnemy
        });

        // Muzzle flash
        for (let i = 0; i < 8; i++) {
            this.particles.push({
                x: bx, y: by,
                vx: dirX * 300 + (Math.random() - 0.5) * 200,
                vy: dirY * 300 + (Math.random() - 0.5) * 200,
                age: 0, maxAge: 0.1 + Math.random() * 0.1, type: 'flash'
            });
        }
    }

    private spawnImpactSparks(x: number, y: number) {
        for (let i = 0; i < 12; i++) {
            this.particles.push({
                x, y,
                vx: (Math.random() - 0.5) * 400,
                vy: (Math.random() - 0.5) * 400 - 100,
                age: 0, maxAge: 0.2 + Math.random() * 0.3, type: 'spark'
            });
        }
    }

    private spawnDeathCloud(x: number, y: number) {
        // Massive fiery explosion
        for (let i = 0; i < 25; i++) {
            this.particles.push({
                x: x + (Math.random() - 0.5) * 40,
                y: y + (Math.random() - 0.5) * 40,
                vx: (Math.random() - 0.5) * 150,
                vy: (Math.random() - 0.5) * 150 - 50,
                age: 0, maxAge: 0.6 + Math.random() * 0.4, type: 'explosion'
            });
        }
        // Debris chunks
        for (let i = 0; i < 15; i++) {
            this.particles.push({
                x, y: y - 20,
                vx: (Math.random() - 0.5) * 400,
                vy: -Math.random() * 400 - 100,
                age: 0, maxAge: 0.8 + Math.random() * 0.5, type: 'debris'
            });
        }
    }

    private spawnCoins(x: number, y: number, count: number) {
        for (let i = 0; i < count; i++) {
            this.collectibles.push({
                x, y,
                vx: (Math.random() - 0.5) * 300,
                vy: -Math.random() * 400 - 200,
                age: 0,
                maxAge: 10,
                type: 'coin'
            });
        }
    }

    override render(renderer: Renderer): void {
        const ctx = renderer.ctx;
        const W = renderer.width;
        const H = renderer.height;

        // Clear Sky
        ctx.fillStyle = '#111522';
        ctx.fillRect(0, 0, W, H);

        ctx.save();
        // Camera Translate (only X, Y is fixed for side view)
        ctx.translate(-this.camX, 0);

        this.drawParallax(ctx, W, H);

        // Ground
        ctx.fillStyle = '#22283a';
        ctx.fillRect(this.camX - W, GROUND_Y, W * 3, FLOOR_THICKNESS);
        // Ground top highlight
        ctx.fillStyle = '#3a4466';
        ctx.fillRect(this.camX - W, GROUND_Y, W * 3, 4);

        // Finish Line
        ctx.fillStyle = 'rgba(100, 255, 100, 0.2)';
        ctx.fillRect(this.levelLength, GROUND_Y - 500, 150, 500);
        ctx.fillStyle = '#6f6';
        ctx.font = 'bold 32px Inter';
        ctx.textAlign = 'center';
        ctx.fillText('FINISH', this.levelLength + 75, GROUND_Y - 450);

        // Entities
        this.renderPlatforms(ctx);
        this.renderBoxes(ctx);
        this.renderEnemies(ctx);
        this.renderCollectibles(ctx);
        this.renderPlayer(ctx);
        this.renderBullets(ctx);
        this.renderParticles(ctx);

        ctx.restore();

        this.renderHUD(ctx, W, H);
    }

    private drawParallax(ctx: CanvasRenderingContext2D, W: number, H: number) {
        // Sky Gradient
        const skyGrad = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
        skyGrad.addColorStop(0, '#0a0a1a'); // Dark deep blue space
        skyGrad.addColorStop(1, '#2a1a3a'); // Twilight purple horizon
        ctx.fillStyle = skyGrad;
        ctx.fillRect(this.camX - W, 0, W * 3, GROUND_Y);

        // Stars
        ctx.fillStyle = '#ffffff';
        const sOffset = this.camX * 0.05;
        for (const s of this.stars) {
            const sx = s.x - sOffset;
            // Only draw if roughly on screen to save perf
            if (sx > this.camX - W && sx < this.camX + W * 2) {
                ctx.globalAlpha = Math.random() * 0.5 + 0.5;
                ctx.beginPath(); ctx.arc(sx, s.y, s.r, 0, Math.PI * 2); ctx.fill();
            }
        }
        ctx.globalAlpha = 1;

        // Clouds (cyberpunk smog)
        ctx.fillStyle = 'rgba(255, 100, 150, 0.05)';
        const cOffset = this.camX * 0.1;
        for (const c of this.clouds) {
            ctx.beginPath();
            const cx = c.x - cOffset;
            ctx.ellipse(cx, c.y, 180 * c.scale, 40 * c.scale, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // Far City (speed 0.1 -> relative offset camX * 0.9)
        const fOffset = this.camX * 0.9;
        let currX = this.camX - W - (fOffset % 200);
        for (let i = 0; i < this.bgFar.length; i++) {
            const b = this.bgFar[i];
            if (currX > this.camX + W) break; // skip rest
            if (currX + b.w > this.camX - W) {
                // Building silhouette
                ctx.fillStyle = '#0f111a'; // Very dark
                ctx.fillRect(currX, GROUND_Y - b.h, b.w, b.h);
                // Windows
                ctx.fillStyle = '#ffaa33'; // Warm neon yellow
                for (let wy = 10; wy < b.h - 10; wy += 15) {
                    for (let wx = 10; wx < b.w - 10; wx += 15) {
                        if (b.windows[(wx + wy) % 20]) {
                            ctx.globalAlpha = 0.6;
                            ctx.fillRect(currX + wx, GROUND_Y - b.h + wy, 6, 8);
                        }
                    }
                }
                ctx.globalAlpha = 1;
            }
            currX += b.w + 10;
        }

        // Mid City (speed 0.3 -> relative offset camX * 0.7)
        const mOffset = this.camX * 0.7;
        currX = this.camX - W - (mOffset % 200);
        for (let i = 0; i < this.bgMid.length; i++) {
            const b = this.bgMid[i];
            if (currX > this.camX + W) break;
            if (currX + b.w > this.camX - W) {
                // Base structure
                ctx.fillStyle = '#1a1f2e';
                ctx.fillRect(currX, GROUND_Y - b.h, b.w, b.h);
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 2;
                ctx.strokeRect(currX, GROUND_Y - b.h, b.w, b.h);

                // Details based on type
                if (b.type === 0) {
                    // Antenna
                    ctx.beginPath(); ctx.moveTo(currX + b.w / 2, GROUND_Y - b.h); ctx.lineTo(currX + b.w / 2, GROUND_Y - b.h - 40); ctx.stroke();
                    ctx.fillStyle = '#ff0055'; ctx.beginPath(); ctx.arc(currX + b.w / 2, GROUND_Y - b.h - 40, 3, 0, Math.PI * 2); ctx.fill(); // blinking red light
                } else if (b.type === 1) {
                    // Neon strip
                    ctx.fillStyle = '#00ffff'; // Cyan
                    ctx.fillRect(currX + 10, GROUND_Y - b.h + 20, 4, b.h - 40);
                    ctx.fillRect(currX + b.w - 14, GROUND_Y - b.h + 20, 4, b.h - 40);
                } else {
                    // Blocky top
                    ctx.fillStyle = '#141824';
                    ctx.fillRect(currX + 10, GROUND_Y - b.h - 20, b.w - 20, 20);
                }
            }
            currX += b.w + 20;
        }
    }

    private renderPlayer(ctx: CanvasRenderingContext2D) {
        const x = this.px;
        const y = this.py;

        ctx.save();
        ctx.translate(x, y);

        const screenPx = this.px - this.camX;
        const mousePos = this.ctx.input.getMousePosition();
        const mx = mousePos.x;
        const facingRight = mx > screenPx;
        if (!facingRight) ctx.scale(-1, 1);

        const legA = Math.sin(this.walkCycle) * 0.6;
        const legB = Math.sin(this.walkCycle + Math.PI) * 0.6;

        const coatColor = '#3a2d45';
        const pantColor = '#1d1a29';
        const skinColor = '#ffccaa';

        // Left Arm (back)
        ctx.fillStyle = coatColor;
        ctx.fillRect(-5, -60, 10, 25);

        // Left Leg (back)
        ctx.save();
        ctx.translate(0, -25);
        ctx.rotate(legB);
        ctx.fillStyle = pantColor;
        ctx.fillRect(-6, 0, 12, 25);
        ctx.fillStyle = '#111'; // boot
        ctx.fillRect(-8, 20, 16, 8);
        ctx.restore();

        // Body (Trench coat)
        ctx.fillStyle = coatColor;
        ctx.beginPath();
        ctx.moveTo(-15, -60);
        ctx.lineTo(15, -60);
        ctx.lineTo(20, -15);
        ctx.lineTo(-20, -15);
        ctx.fill();

        // Right Leg (front)
        ctx.save();
        ctx.translate(0, -25);
        ctx.rotate(legA);
        ctx.fillStyle = pantColor;
        ctx.fillRect(-6, 0, 12, 25);
        ctx.fillStyle = '#111'; // boot
        ctx.fillRect(-8, 20, 16, 8);
        ctx.restore();

        // Head
        ctx.fillStyle = skinColor;
        ctx.beginPath(); ctx.arc(0, -70, 12, 0, Math.PI * 2); ctx.fill();
        // Hair/Bandana
        ctx.fillStyle = '#aa2233';
        ctx.beginPath(); ctx.arc(0, -75, 13, Math.PI, 0); ctx.fill();
        ctx.fillRect(-15, -75, 30, 8);

        // Right Arm (front) holding gun
        ctx.save();
        ctx.translate(0, -55);
        let localAim = this.aimAngle;
        if (!facingRight) localAim = Math.PI - localAim;
        ctx.rotate(localAim);

        // Arm
        ctx.fillStyle = coatColor;
        ctx.fillRect(-5, -6, 25, 12);
        // Hand
        ctx.fillStyle = skinColor;
        ctx.beginPath(); ctx.arc(20, 0, 6, 0, Math.PI * 2); ctx.fill();

        // Chunky Gun
        ctx.fillStyle = '#222';
        ctx.fillRect(15, -5, 25, 10);
        ctx.fillStyle = '#444';
        ctx.fillRect(20, -8, 15, 3);
        ctx.fillStyle = '#111';
        ctx.fillRect(15, 5, 8, 10); // Grip
        ctx.fillStyle = '#0a0';
        ctx.fillRect(25, 0, 4, 4); // glow sight

        ctx.restore();
        ctx.restore();
    }

    private renderEnemies(ctx: CanvasRenderingContext2D) {
        for (const e of this.enemies) {
            if (!e.active) continue;

            ctx.save();
            ctx.translate(e.x, e.y);
            const facingRight = e.vx > 0;
            if (!facingRight) ctx.scale(-1, 1);

            const legA = Math.sin(e.walkCycle) * 0.6;
            const legB = Math.sin(e.walkCycle + Math.PI) * 0.6;

            const armorColor = '#2d3345';
            const accent = '#ff0044';

            // Left leg
            ctx.save(); ctx.translate(0, -25); ctx.rotate(legB);
            ctx.fillStyle = '#111'; ctx.fillRect(-6, 0, 12, 25);
            ctx.restore();

            // Body
            ctx.fillStyle = armorColor;
            ctx.fillRect(-12, -60, 24, 35);
            // Armor plate
            ctx.fillStyle = '#445';
            ctx.fillRect(-8, -55, 16, 20);

            // Right leg
            ctx.save(); ctx.translate(0, -25); ctx.rotate(legA);
            ctx.fillStyle = '#111'; ctx.fillRect(-6, 0, 12, 25);
            ctx.restore();

            // Head / Helmet
            ctx.fillStyle = armorColor;
            ctx.beginPath(); ctx.arc(0, -70, 14, 0, Math.PI * 2); ctx.fill();
            // Visor
            ctx.fillStyle = accent;
            ctx.fillRect(-8, -75, 18, 8);

            // Arm/Gun merged (zombie pose but holding a blaster)
            ctx.fillStyle = armorColor;
            ctx.fillRect(-5, -60, 25, 12);
            ctx.fillStyle = '#222';
            ctx.fillRect(15, -58, 20, 8); // Gun barrel
            ctx.fillStyle = accent;
            ctx.fillRect(30, -56, 5, 4); // Red glow tip

            ctx.restore();
        }
    }

    private renderBoxes(ctx: CanvasRenderingContext2D) {
        for (const b of this.boxes) {
            ctx.save();
            ctx.translate(b.x, b.y);
            ctx.rotate(b.angle);
            ctx.fillStyle = '#c18a58'; // Wood color
            ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
            ctx.strokeStyle = '#8b5b32'; // Darker wood border
            ctx.lineWidth = 4;
            ctx.strokeRect(-b.w / 2 + 2, -b.h / 2 + 2, b.w - 4, b.h - 4);
            ctx.restore();
        }
    }

    private renderBullets(ctx: CanvasRenderingContext2D) {
        ctx.lineWidth = 4;
        for (const b of this.bullets) {
            if (!b.isEnemy) {
                ctx.strokeStyle = '#ffff00';
                ctx.beginPath();
                ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02); // Draw bullet line based on velocity tail
                ctx.lineTo(b.x, b.y);
            } else {
                ctx.strokeStyle = '#ff3333';
                ctx.beginPath();
                ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
                ctx.lineTo(b.x, b.y);
            }
            ctx.stroke();
        }
    }

    private renderPlatforms(ctx: CanvasRenderingContext2D) {
        for (const p of this.platforms) {
            // Main Girder
            ctx.fillStyle = '#242a3a';
            ctx.fillRect(p.x, p.y, p.w, p.h);

            // Girder cross-patterns
            ctx.strokeStyle = '#181e2b';
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let i = 0; i < p.w - 20; i += 30) {
                ctx.moveTo(p.x + i, p.y);
                ctx.lineTo(p.x + i + 20, p.y + p.h);
                ctx.moveTo(p.x + i + 20, p.y);
                ctx.lineTo(p.x + i, p.y + p.h);
            }
            ctx.stroke();

            // Top edge walkway
            ctx.fillStyle = '#454e66';
            ctx.fillRect(p.x, p.y, p.w, 4);

            // Hazard striping at the bottom edge
            ctx.fillStyle = '#111';
            ctx.fillRect(p.x, p.y + p.h - 4, p.w, 4);
            ctx.fillStyle = '#ffaa00';
            ctx.beginPath();
            for (let i = 0; i < p.w; i += 16) {
                ctx.moveTo(p.x + i, p.y + p.h - 4);
                ctx.lineTo(p.x + i + 8, p.y + p.h - 4);
                ctx.lineTo(p.x + i + 4, p.y + p.h);
                ctx.lineTo(p.x + i - 4, p.y + p.h);
            }
            ctx.fill();
        }
    }

    private renderCollectibles(ctx: CanvasRenderingContext2D) {
        ctx.lineWidth = 2;
        for (const c of this.collectibles) {
            if (c.maxAge - c.age < 2 && Math.floor(c.age * 10) % 2 === 0) continue;

            const r = 8;
            ctx.fillStyle = '#ffaa00'; // Outer ring
            ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#ffee00'; // Inner core
            ctx.beginPath(); ctx.arc(c.x, c.y, r - 3, 0, Math.PI * 2); ctx.fill();
            // Centered 'C' or Slot
            ctx.fillStyle = '#cc8800';
            ctx.fillRect(c.x - 1, c.y - 3, 2, 6);
        }
    }

    private renderParticles(ctx: CanvasRenderingContext2D) {
        for (const p of this.particles) {
            const life = 1 - (p.age / p.maxAge);
            ctx.globalAlpha = life;
            if (p.type === 'flash') {
                ctx.fillStyle = '#ffffaa';
                ctx.beginPath(); ctx.arc(p.x, p.y, 4 + life * 4, 0, Math.PI * 2); ctx.fill();
            } else if (p.type === 'spark') {
                ctx.fillStyle = '#ffa500';
                ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
            } else if (p.type === 'smoke') {
                ctx.fillStyle = '#444';
                ctx.beginPath(); ctx.arc(p.x, p.y, 8 + (1 - life) * 15, 0, Math.PI * 2); ctx.fill();
            } else if (p.type === 'explosion') {
                // Expanding fireball
                const r = 20 + (1 - life) * 80;
                const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
                grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
                grad.addColorStop(0.2, 'rgba(255, 200, 50, 1)');
                grad.addColorStop(0.5, 'rgba(255, 50, 0, 0.8)');
                grad.addColorStop(1, 'rgba(50, 10, 10, 0)');
                ctx.fillStyle = grad;
                ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
            } else if (p.type === 'debris') {
                ctx.fillStyle = '#222';
                ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
            }
        }
        ctx.globalAlpha = 1;
    }

    private renderHUD(ctx: CanvasRenderingContext2D, W: number, H: number) {
        ctx.font = 'bold 28px Inter, sans-serif';

        const drawText = (text: string, x: number, y: number, color: string, align: CanvasTextAlign) => {
            ctx.textAlign = align;
            ctx.fillStyle = '#000';
            ctx.fillText(text, x + 2, y + 2);
            ctx.fillStyle = color;
            ctx.fillText(text, x, y);
        };

        drawText(`SCORE: ${this.score}`, W / 2, 40, '#fff', 'center');
        drawText(`COINS: ${this.coins}`, W - 30, 40, '#ffcc00', 'right');

        // Lives map
        let hearts = '';
        for (let i = 0; i < this.maxLives; i++) {
            hearts += i < this.lives ? '♥ ' : '♡ ';
        }
        drawText(hearts, 30, 40, '#ff4444', 'left');

        if (this.lives <= 0 && !this.levelComplete) {
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = '#ff4444';
            ctx.font = 'bold 64px Inter';
            ctx.textAlign = 'center';
            ctx.fillText('GAME OVER', W / 2, H / 2);
            ctx.font = '24px Inter';
            ctx.fillStyle = '#fff';
            ctx.fillText('Refresh page to restart', W / 2, H / 2 + 50);
        } else if (this.levelComplete) {
            ctx.fillStyle = 'rgba(0,0,0,0.85)';
            ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = '#66ff66';
            ctx.font = 'bold 64px Inter';
            ctx.textAlign = 'center';
            ctx.fillText('LEVEL COMPLETE!', W / 2, H / 2 - 20);
            ctx.font = '24px Inter';
            ctx.fillStyle = '#fff';
            ctx.fillText(`Final Score: ${this.score}`, W / 2, H / 2 + 30);
            ctx.fillText('Refresh page to replay', W / 2, H / 2 + 80);
        }
    }
}
