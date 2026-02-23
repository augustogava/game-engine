import { Scene, SceneContext } from '../engine/scene/Scene.js';
import { Renderer } from '../engine/renderer/Renderer.js';
import { AudioSynthesizer } from './AudioSynthesizer';
import { SpriteSheet } from '../engine/sprites/SpriteSheet.js';

// --- Constants ---
const GRAVITY = 1200;
const GROUND_Y = 500;
const FLOOR_THICKNESS = 100;

export class ShooterScene extends Scene {
    private sfx = new AudioSynthesizer();
    private sheet = new SpriteSheet('/src/game/assets/2g_side_sheet.jpg');

    // Player State
    private px = 200;
    private py = GROUND_Y;
    private vx = 0;
    private vy = 0;
    private jumpTimer = 0;
    private walkCycle = 0;
    private onGround = false;
    private aimAngle = 0;
    private lives = 5;
    private maxLives = 5;
    private score = 0;
    private coins = 0;
    private lastFired = 0;
    private currentWeapon: 'blaster' | 'shotgun' | 'laser' | 'rocket' = 'blaster';

    // Level System
    private levelLength = 7000;
    private levelComplete = false;

    // Boss State
    private boss = {
        active: false,
        x: 0, y: 0, vx: 0, vy: 0, hp: 100, maxHp: 100,
        state: 'idle' as 'idle' | 'charge' | 'shoot_laser' | 'jump_slam',
        stateTimer: 0,
        walkCycle: 0,
        dashTarget: 0
    };

    // Entities
    private bullets: { x: number, y: number, vx: number, vy: number, age: number, isEnemy: boolean, type: string }[] = [];
    private boxes: { x: number, y: number, w: number, h: number, vx: number, vy: number, angularVel: number, angle: number }[] = [];
    private enemies: { x: number, y: number, vx: number, vy: number, hp: number, walkCycle: number, active: boolean, shootCooldown: number, type: 'normal' | 'drone' | 'brute' }[] = [];
    private particles: { x: number, y: number, vx: number, vy: number, age: number, maxAge: number, type: string }[] = [];
    private platforms: { x: number, y: number, w: number, h: number }[] = [];
    private collectibles: { x: number, y: number, vx: number, vy: number, age: number, maxAge: number, type: 'coin' | 'weapon', weaponType?: 'shotgun' | 'laser' | 'rocket' }[] = [];
    private clouds: { x: number, y: number, speed: number, scale: number }[] = [];
    private decorations: { x: number, y: number, w: number, h: number, row: number, col: number }[] = [];

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
        this.decorations = [];

        // Spawn decorations
        for (let i = 0; i < 40; i++) {
            this.decorations.push({
                x: Math.random() * this.levelLength,
                y: GROUND_Y - 30 - Math.random() * 30, // sit right on the ground
                w: 60 + Math.random() * 80,
                h: 40 + Math.random() * 60,
                row: Math.random() > 0.5 ? 4 : 5, // Rows 5 or 6 (index 4 or 5)
                col: Math.floor(Math.random() * 4) // random horizontal slice
            });
        }

        // Reset Boss
        this.boss.active = false;
        this.boss.hp = this.boss.maxHp;
        this.boss.x = this.levelLength - 200;
        this.boss.y = GROUND_Y;

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

        const spawns: { x: number, y: number, type: 'normal' | 'drone' | 'brute' }[] = [
            { x: 1200, y: GROUND_Y, type: 'normal' }, { x: 1400, y: GROUND_Y - 200, type: 'drone' },
            { x: 2400, y: GROUND_Y, type: 'normal' }, { x: 2700, y: GROUND_Y - 150, type: 'normal' },
            { x: 3200, y: GROUND_Y, type: 'brute' }, { x: 4100, y: GROUND_Y - 120, type: 'drone' },
            { x: 4200, y: GROUND_Y, type: 'normal' }, { x: 5000, y: GROUND_Y, type: 'brute' },
            { x: 5500, y: GROUND_Y, type: 'normal' }, { x: 5900, y: GROUND_Y - 280, type: 'drone' },
            { x: 6500, y: GROUND_Y, type: 'brute' }, { x: 6800, y: GROUND_Y, type: 'normal' }
        ];

        for (const ep of spawns) {
            const hp = ep.type === 'brute' ? 12 : (ep.type === 'drone' ? 1 : 2);
            this.enemies.push({ x: ep.x, y: ep.y, vx: ep.type === 'drone' ? 0 : -50, vy: 0, hp, walkCycle: 0, active: false, shootCooldown: 0, type: ep.type });
        }

        // Weapon Spawns
        this.collectibles.push({ x: 800, y: GROUND_Y - 50, vx: 0, vy: 0, age: 0, maxAge: 9999, type: 'weapon', weaponType: 'shotgun' });
        this.collectibles.push({ x: 2500, y: GROUND_Y - 200, vx: 0, vy: 0, age: 0, maxAge: 9999, type: 'weapon', weaponType: 'laser' });
        this.collectibles.push({ x: 4000, y: GROUND_Y - 180, vx: 0, vy: 0, age: 0, maxAge: 9999, type: 'weapon', weaponType: 'rocket' });

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
            this.sfx.playJump();
        }

        // Apply Gravity
        this.vy += GRAVITY * simDt;

        // Integrate Position
        this.px += this.vx * simDt;
        this.py += this.vy * simDt;

        // Ground, Platform, & Pit collision
        let hitGround = false;
        const overPit = this.px > 3500 && this.px < 3800;

        // Death Pit kill
        if (this.py > GROUND_Y + 1500) {
            if (this.lives > 0 && !this.levelComplete) {
                this.lives--;
                this.px = 3400; // respawn before pit
                this.py = GROUND_Y - 50;
                this.vy = 0;
            }
        } else if (this.py >= GROUND_Y && !overPit) {
            this.py = GROUND_Y;
            hitGround = true;
        }

        // Laser Walls in boss fight
        if (this.boss.active) {
            if (this.px < this.levelLength - 1000) this.px = this.levelLength - 1000;
            if (this.px > this.levelLength + 200) this.px = this.levelLength + 200;
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
            if (this.currentWeapon === 'shotgun') this.lastFired = 0.6;
            else if (this.currentWeapon === 'laser') this.lastFired = 0.05;
            else if (this.currentWeapon === 'rocket') this.lastFired = 0.8;
            else this.lastFired = 0.15; // blaster
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

            // Enemy & Boss hit by bullet
            if (!b.isEnemy) {
                // Boss Hit
                if (this.boss.active && b.x > this.boss.x - 50 && b.x < this.boss.x + 50 && b.y > this.boss.y - 120 && b.y < this.boss.y) {
                    hit = true;
                    if (b.type === 'rocket') {
                        this.spawnDeathCloud(b.x, b.y);
                        this.boss.hp -= 5;
                    } else {
                        this.boss.hp -= b.type === 'shotgun' ? 1.5 : (b.type === 'laser' ? 0.4 : 1);
                    }
                    if (b.type !== 'rocket') this.spawnImpactSparks(b.x, b.y);
                    if (b.type === 'laser') hit = false;
                }

                for (let j = this.enemies.length - 1; j >= 0; j--) {
                    const e = this.enemies[j];
                    if (!e.active) continue;

                    const hitW = e.type === 'brute' ? 30 : 20;
                    const hitH = e.type === 'drone' ? 30 : 70;
                    const hitYOffset = e.type === 'drone' ? 15 : 70;

                    if (b.x > e.x - hitW && b.x < e.x + hitW && b.y > e.y - hitYOffset && b.y < e.y + (e.type === 'drone' ? 15 : 0)) {

                        // Brute Shield block logic (if hit from front and not a rocket/laser)
                        const facingRight = e.vx > 0;
                        const hitFromFront = (facingRight && b.vx < 0) || (!facingRight && b.vx > 0);
                        if (e.type === 'brute' && hitFromFront && (b.type === 'normal' || b.type === 'shotgun') && b.y > e.y - 50) {
                            this.spawnImpactSparks(b.x, b.y); // Clank! 
                            hit = true;
                            b.age = 99; // destroy bullet
                            continue;
                        }

                        hit = true;

                        if (b.type === 'rocket') {
                            this.spawnDeathCloud(b.x, b.y);
                            e.hp -= 5;
                            // Splash damage
                            for (const other of this.enemies) {
                                if (Math.abs(other.x - b.x) < 150 && Math.abs(other.y - b.y) < 150) other.hp -= 3;
                            }
                        } else {
                            e.hp -= b.type === 'shotgun' ? 1.5 : (b.type === 'laser' ? 0.4 : 1);
                        }

                        e.vx += b.vx * 0.05;
                        if (b.type !== 'rocket') this.spawnImpactSparks(b.x, b.y);

                        if (e.hp <= 0) {
                            this.score += 100;
                            this.spawnDeathCloud(e.x, e.y - 35);
                            this.spawnCoins(e.x, e.y - 35, 3);
                            this.enemies.splice(j, 1);
                        }
                        if (b.type === 'laser') hit = false; // Laser pierces
                        break;
                    }
                }
            }

            if (b.age > 2 || hit) {
                if (b.type === 'rocket' && hit) this.spawnDeathCloud(b.x, b.y);
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

            if (e.type !== 'drone') {
                e.vy += GRAVITY * simDt;
                let eHitGround = false;

                // Platforms collision
                for (const plat of this.platforms) {
                    if (e.vy > 0 && e.x > plat.x && e.x < plat.x + plat.w &&
                        e.y >= plat.y && e.y - e.vy * simDt <= plat.y) {
                        e.y = plat.y;
                        eHitGround = true;
                    }
                }
                if (e.y > GROUND_Y) {
                    e.y = GROUND_Y;
                    eHitGround = true;
                }
                if (eHitGround) e.vy = 0;

                // Walk animation
                if (Math.abs(e.vx) > 10) e.walkCycle += simDt * (e.type === 'brute' ? 5 : 10);
                else e.walkCycle = 0;
            } else {
                // Drone movement (sine string hover)
                e.walkCycle += simDt * 3; // using walkCycle as time for sine wave
                e.vy = Math.sin(e.walkCycle) * 30;
                // Move towards player x
                if (e.x > this.px + 50) e.vx = -80;
                else if (e.x < this.px - 50) e.vx = 80;
                else e.vx *= 0.9;
            }

            e.x += e.vx * simDt;
            e.y += e.vy * simDt;

            // Simple AI patrol / seek player depending on distance
            const dx = this.px - e.x;
            const dy = this.py - e.y;
            const distToPlayer = Math.sqrt(dx * dx + dy * dy);

            if (distToPlayer < 600) {
                e.shootCooldown -= simDt;

                if (e.type === 'drone') {
                    // Drop bomb if directly above
                    if (Math.abs(dx) < 60 && e.shootCooldown <= 0) {
                        this.fireBullet(e.x, e.y + 15, Math.PI / 2, true);
                        e.shootCooldown = 1.5;
                    }
                } else {
                    // Aim and shoot
                    if (e.type === 'brute') e.vx *= 0.95; // stops very slowly
                    else e.vx *= 0.8; // Slow down to shoot

                    if (e.shootCooldown <= 0) {
                        const spread = (Math.random() - 0.5) * 0.2;
                        const angle = Math.atan2(dy - 35, dx);
                        if (e.type === 'brute') {
                            this.fireBullet(e.x, e.y - 45, angle - 0.15, true);
                            this.fireBullet(e.x, e.y - 45, angle, true);
                            this.fireBullet(e.x, e.y - 45, angle + 0.15, true);
                            e.shootCooldown = 2.0;
                        } else {
                            this.fireBullet(e.x, e.y - 35, angle + spread, true);
                            e.shootCooldown = Math.random() * 1.5 + 0.5;
                        }
                    }
                }
            } else {
                // Patrol for non-drones
                if (e.type !== 'drone') {
                    const speed = e.type === 'brute' ? 40 : 100;
                    if (e.x > this.px + 400) e.vx = -speed;
                    if (e.x < this.px - 400) e.vx = speed;
                }
            }

            // Player hit by touching enemy
            const hitW = e.type === 'brute' ? 40 : 30;
            const hitH = e.type === 'drone' ? 30 : 70;
            const pDY = e.type === 'drone' ? (e.y - this.py) : Math.abs(e.y - this.py);
            if (Math.abs(e.x - this.px) < hitW && Math.abs(pDY) < hitH) {
                if (this.lives > 0 && !this.levelComplete) {
                    this.lives--;
                    this.vy = -300;
                    this.vx = Math.sign(this.px - e.x) * 400;
                    if (e.type !== 'brute') e.vx = Math.sign(e.x - this.px) * 200;
                }
            }
        }

        // Boss Logic
        if (this.px > this.levelLength - 600 && !this.boss.active && this.boss.hp > 0 && !this.levelComplete) {
            this.boss.active = true; // Trigger boss fight!
        }

        if (this.boss.active) {
            this.boss.stateTimer -= simDt;
            this.boss.vy += GRAVITY * simDt;
            this.boss.x += this.boss.vx * simDt;
            this.boss.y += this.boss.vy * simDt;

            if (this.boss.y > GROUND_Y) {
                this.boss.y = GROUND_Y;
                this.boss.vy = 0;
            }

            // Animation
            if (Math.abs(this.boss.vx) > 10) this.boss.walkCycle += simDt * 8;
            else this.boss.walkCycle = 0;

            const bdx = this.px - this.boss.x;
            const bdy = this.py - this.boss.y;

            // Boss State Machine
            if (this.boss.state === 'idle') {
                this.boss.vx *= 0.8;
                if (this.boss.stateTimer <= 0) {
                    const rand = Math.random();
                    if (rand < 0.4) {
                        this.boss.state = 'shoot_laser';
                        this.boss.stateTimer = 2.0;
                    } else if (rand < 0.7) {
                        this.boss.state = 'charge';
                        this.boss.stateTimer = 1.5;
                        this.boss.dashTarget = this.px;
                    } else {
                        this.boss.state = 'jump_slam';
                        this.boss.stateTimer = 2.5;
                        this.boss.vy = -900;
                        this.boss.vx = (this.px - this.boss.x) * 1.5;
                    }
                }
            } else if (this.boss.state === 'shoot_laser') {
                this.boss.vx *= 0.5;
                if (this.boss.stateTimer > 0 && Math.floor(this.boss.stateTimer * 10) % 2 === 0) {
                    const angle = Math.atan2(bdy - 50, bdx);
                    this.fireBullet(this.boss.x, this.boss.y - 70, angle + (Math.random() - 0.5) * 0.15, true);
                }
                if (this.boss.stateTimer <= 0) {
                    this.boss.state = 'idle';
                    this.boss.stateTimer = 1.0;
                }
            } else if (this.boss.state === 'charge') {
                this.boss.vx = Math.sign(bdx) * 500; // Fast run
                if (this.boss.stateTimer <= 0 || Math.abs(this.px - this.boss.x) < 50) {
                    this.boss.state = 'idle';
                    this.boss.stateTimer = 1.5;
                }
            } else if (this.boss.state === 'jump_slam') {
                if (this.boss.y >= GROUND_Y) {
                    this.sfx.playExplosion();
                    this.spawnImpactSparks(this.boss.x, this.boss.y);
                    // Shockwave bullets
                    for (let i = 0; i < 4; i++) {
                        this.fireBullet(this.boss.x, this.boss.y - 10, Math.PI + i * 0.15, true);
                        this.fireBullet(this.boss.x, this.boss.y - 10, 0 - i * 0.15, true);
                    }
                    this.boss.state = 'idle';
                    this.boss.stateTimer = 1.0;
                }
            }

            // Player hit by Boss
            if (Math.abs(this.boss.x - this.px) < 60 && Math.abs(this.boss.y - this.py) < 100) {
                if (this.lives > 0 && !this.levelComplete) {
                    this.lives--;
                    this.vy = -400;
                    this.vx = Math.sign(this.px - this.boss.x) * 800; // Massive knockback
                }
            }

            // Camera lock during boss
            if (this.camX < this.levelLength - this.ctx.renderer.width / 2) {
                this.camX += (this.levelLength - this.ctx.renderer.width / 2 - this.camX) * simDt * 2;
            }
        }

        // Win Condition is Boss Defeat
        if (this.boss.hp <= 0 && this.boss.active) {
            this.boss.active = false;
            this.levelComplete = true;
            this.score += 10000; // Boss kill bonus
            for (let i = 0; i < 15; i++) {
                setTimeout(() => {
                    if (this.ctx) this.spawnDeathCloud(this.boss.x + (Math.random() - 0.5) * 150, this.boss.y - Math.random() * 200);
                }, i * 150);
            }
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
                if (c.type === 'coin') {
                    this.coins++;
                    this.score += 50;
                    this.sfx.playCoin();
                } else if (c.type === 'weapon' && c.weaponType) {
                    this.currentWeapon = c.weaponType;
                    this.score += 200;
                    this.sfx.playPowerup();
                }
                this.collectibles.splice(i, 1);
                continue;
            }

            if (c.age >= c.maxAge) this.collectibles.splice(i, 1);
        }
    }

    private fireBullet(x: number, y: number, angle: number, isEnemy: boolean) {
        const barrelLen = 40;
        const dirX = Math.cos(angle);
        const dirY = Math.sin(angle);
        const bx = x + dirX * barrelLen;
        const by = y + dirY * barrelLen;

        if (isEnemy) {
            this.bullets.push({ x: bx, y: by, vx: dirX * 500, vy: dirY * 500, age: 0, isEnemy, type: 'normal' });
        } else if (this.currentWeapon === 'blaster') {
            this.bullets.push({ x: bx, y: by, vx: dirX * 1500, vy: dirY * 1500, age: 0, isEnemy, type: 'normal' });
            this.sfx.playShoot();
        } else if (this.currentWeapon === 'shotgun') {
            for (let i = -2; i <= 2; i++) {
                const spreadAngle = angle + i * 0.1;
                this.bullets.push({ x: bx, y: by, vx: Math.cos(spreadAngle) * 1800, vy: Math.sin(spreadAngle) * 1800, age: 0, isEnemy, type: 'shotgun' });
            }
            this.sfx.playExplosion();
        } else if (this.currentWeapon === 'laser') {
            this.bullets.push({ x: bx, y: by, vx: dirX * 3000, vy: dirY * 3000, age: 0, isEnemy, type: 'laser' });
            this.sfx.playLaser();
        } else if (this.currentWeapon === 'rocket') {
            this.bullets.push({ x: bx, y: by, vx: dirX * 800, vy: dirY * 800, age: 0, isEnemy, type: 'rocket' });
            this.sfx.playShoot();
        }

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
        this.sfx.playExplosion();
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

        // Clear Sky Backdrop
        ctx.fillStyle = '#bce6e6'; // Light sky color from the sprite sheet theme
        ctx.fillRect(0, 0, W, H);

        ctx.save();
        ctx.translate(-this.camX, 0);

        this.drawParallax(ctx, W, H);

        // Ground with Pit
        if (this.sheet.loaded) {
            const sheetW = this.sheet.image.width;
            const rowH = this.sheet.image.height / 7;

            // Ground is Row 7
            const groundSrcY = Math.floor(6 * rowH);

            // We want to tightly crop the green grass top and the rock bottom
            const srcOffsetX = 60;
            const srcCropW = sheetW - 120;
            // The AI art has empty sky above the floor. We crop the top ~100px.
            const srcOffsetY = 85;
            const srcCropH = rowH - 85;

            // Scale factor to make it fit well on screen
            const scale = 1.3;
            const destW = srcCropW * scale;
            const destH = srcCropH * scale;

            const drawGroundSlice = (startX: number, endX: number) => {
                ctx.save();
                ctx.beginPath();
                // Mask the pit area
                ctx.rect(startX, GROUND_Y, endX - startX, H - GROUND_Y);
                ctx.clip();

                // Align to world grid
                const firstTileX = Math.floor(startX / destW) * destW;
                for (let tx = firstTileX; tx < endX; tx += destW) {
                    ctx.drawImage(this.sheet.image, srcOffsetX, groundSrcY + srcOffsetY, srcCropW, srcCropH, tx, GROUND_Y, destW, destH);
                    // Fill the void below the sprite to the bottom of the screen
                    ctx.fillStyle = '#1e2029';
                    ctx.fillRect(tx, GROUND_Y + destH - 5, destW, H - (GROUND_Y + destH) + 10);
                }
                ctx.restore();
            };

            // Before pit
            drawGroundSlice(this.camX - W, 3500);
            // After pit
            drawGroundSlice(3800, this.camX + W * 2);
        } else {
            // Fallback
            ctx.fillStyle = '#22283a';
            ctx.fillRect(this.camX - W, GROUND_Y, 3500 - (this.camX - W), FLOOR_THICKNESS);
            ctx.fillRect(3800, GROUND_Y, (this.camX + W * 2) - 3800, FLOOR_THICKNESS);
        }

        // Draw decorative elements on the ground behind the action
        this.renderDecorations(ctx);

        // Boss Area Boundaries (laser walls)
        if (this.boss.active) {
            ctx.fillStyle = 'rgba(255, 0, 50, 0.3)';
            ctx.fillRect(this.levelLength - 1000, GROUND_Y - 500, 20, 500); // left wall
            ctx.fillRect(this.levelLength + 200, GROUND_Y - 500, 20, 500); // right wall
        }

        // Entities
        this.renderPlatforms(ctx);
        this.renderBoxes(ctx);
        this.renderEnemies(ctx);
        if (this.boss.active || (this.boss.hp <= 0 && this.levelComplete && this.px > this.levelLength - 1000)) this.renderBoss(ctx);
        this.renderCollectibles(ctx);
        this.renderPlayer(ctx);
        this.renderBullets(ctx);
        this.renderParticles(ctx);


        ctx.restore();

        this.renderHUD(ctx, W, H);
    }

    private drawParallax(ctx: CanvasRenderingContext2D, W: number, H: number) {
        if (!this.sheet.loaded) return;

        const sheetW = this.sheet.image.width;
        const rowH = this.sheet.image.height / 7;

        const srcOffsetX = 60;
        const srcCropW = sheetW - 120;

        const drawTiledRow = (rowIndex: number, srcOffsetY: number, srcCropH: number, yOffset: number, scale: number, scrollFactor: number) => {
            const srcY = Math.floor(rowIndex * rowH) + srcOffsetY;

            const destW = srcCropW * scale;
            const destH = srcCropH * scale;

            // Parallax world offset
            const offset = (this.camX * scrollFactor);
            const viewStart = this.camX - W - offset;

            const firstTileX = Math.floor(viewStart / destW) * destW;
            const renderY = GROUND_Y - destH + yOffset;

            for (let tx = firstTileX; tx < viewStart + W * 3; tx += destW) {
                ctx.drawImage(this.sheet.image, srcOffsetX, srcY, srcCropW, srcCropH, tx + offset, renderY, destW, destH);
            }
        };

        // Far layer (Row 3, Cavern pillars)
        // Crop top and bottom to just get the pillars
        drawTiledRow(2, 20, rowH - 40, -100, 1.8, 0.85);

        // Mid layer (Row 4, Cavern background)
        // Crop top to remove empty sky above moss blocks
        drawTiledRow(3, 40, rowH - 60, -10, 1.4, 0.6);
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

            if (e.type === 'drone') {
                // Drone is symmetrical, just draw it
                ctx.fillStyle = '#22283a';
                ctx.beginPath(); ctx.arc(0, -15, 20, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#111';
                ctx.beginPath(); ctx.arc(0, -15, 12, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#ff0044';
                // Glowing red center eye
                ctx.beginPath(); ctx.arc(0, -15, 6, 0, Math.PI * 2); ctx.fill();
                // Thruster
                ctx.fillStyle = '#0ff';
                ctx.fillRect(-8, 5, 16, 10);
            } else if (e.type === 'brute') {
                if (!facingRight) ctx.scale(-1, 1);
                const armorColor = '#1d2334';
                const accent = '#ffaa00';
                const legA = Math.sin(e.walkCycle) * 0.4;
                const legB = Math.sin(e.walkCycle + Math.PI) * 0.4;

                // Legs
                ctx.save(); ctx.translate(-10, -30); ctx.rotate(legB); ctx.fillStyle = '#111'; ctx.fillRect(-8, 0, 16, 30); ctx.restore();
                ctx.save(); ctx.translate(10, -30); ctx.rotate(legA); ctx.fillStyle = '#111'; ctx.fillRect(-8, 0, 16, 30); ctx.restore();

                // Body (Chunky)
                ctx.fillStyle = armorColor;
                ctx.fillRect(-20, -70, 40, 45);
                ctx.fillStyle = '#333';
                ctx.fillRect(-15, -65, 30, 30); // Center plate

                // Head
                ctx.fillStyle = armorColor;
                ctx.beginPath(); ctx.arc(0, -80, 16, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = accent;
                ctx.fillRect(0, -85, 16, 8); // Visor

                // Gun Arm
                ctx.fillStyle = '#222';
                ctx.fillRect(10, -60, 35, 12);

                // Massive Riot Shield (front)
                ctx.fillStyle = '#445';
                ctx.fillRect(25, -80, 8, 80); // Shield body
                ctx.fillStyle = '#000';
                ctx.fillRect(33, -80, 2, 80); // Inner rim
                ctx.fillStyle = '#ffaa00';
                ctx.fillRect(25, -60, 8, 40); // Hazard stripe
            } else {
                // Normal Enemy
                if (!facingRight) ctx.scale(-1, 1);
                const legA = Math.sin(e.walkCycle) * 0.6;
                const legB = Math.sin(e.walkCycle + Math.PI) * 0.6;
                const armorColor = '#2d3345';
                const accent = '#ff0044';

                // Legs
                ctx.save(); ctx.translate(0, -25); ctx.rotate(legB); ctx.fillStyle = '#111'; ctx.fillRect(-6, 0, 12, 25); ctx.restore();

                // Body
                ctx.fillStyle = armorColor; ctx.fillRect(-12, -60, 24, 35);
                ctx.fillStyle = '#445'; ctx.fillRect(-8, -55, 16, 20);

                // Right leg
                ctx.save(); ctx.translate(0, -25); ctx.rotate(legA); ctx.fillStyle = '#111'; ctx.fillRect(-6, 0, 12, 25); ctx.restore();

                // Head
                ctx.fillStyle = armorColor; ctx.beginPath(); ctx.arc(0, -70, 14, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = accent; ctx.fillRect(-8, -75, 18, 8);

                // Arm/Gun
                ctx.fillStyle = armorColor; ctx.fillRect(-5, -60, 25, 12);
                ctx.fillStyle = '#222'; ctx.fillRect(15, -58, 20, 8);
                ctx.fillStyle = accent; ctx.fillRect(30, -56, 5, 4);
            }

            ctx.restore();
        }
    }

    private renderBoss(ctx: CanvasRenderingContext2D) {
        ctx.save();
        ctx.translate(this.boss.x, this.boss.y);

        // Face player
        if (this.px < this.boss.x) ctx.scale(-1, 1);

        const armorColor = '#1a0a2a'; // Deep purple/black
        const skinColor = '#22cc44'; // Toxic green mutant skin
        const accent = '#ff00ff'; // Neon pink

        // Jump/Slam stretch
        if (this.boss.vy !== 0 && this.boss.state === 'jump_slam') {
            ctx.scale(0.8, 1.2);
            ctx.translate(0, 10);
        }

        // Legs
        const legA = Math.sin(this.boss.walkCycle) * 0.5;
        const legB = Math.sin(this.boss.walkCycle + Math.PI) * 0.5;
        ctx.save(); ctx.translate(-15, -40); ctx.rotate(legB); ctx.fillStyle = armorColor; ctx.fillRect(-10, 0, 20, 40); ctx.restore();
        ctx.save(); ctx.translate(15, -40); ctx.rotate(legA); ctx.fillStyle = armorColor; ctx.fillRect(-10, 0, 20, 40); ctx.restore();

        // Massive Torso
        ctx.fillStyle = skinColor;
        ctx.fillRect(-35, -100, 70, 60);

        // Cybernetics
        ctx.fillStyle = armorColor;
        ctx.fillRect(-40, -110, 80, 40); // Chest plate
        ctx.fillStyle = accent;
        ctx.fillRect(-10, -95, 20, 10); // Glowing core

        // Head (tiny compared to body)
        ctx.fillStyle = skinColor;
        ctx.beginPath(); ctx.arc(0, -120, 15, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = accent;
        // Cyclops visor
        ctx.fillRect(-8, -125, 20, 8);

        // Arms
        if (this.boss.state === 'shoot_laser') {
            // Arm raised
            ctx.save();
            ctx.translate(40, -90);
            ctx.rotate(-Math.PI / 4);
            ctx.fillStyle = armorColor; ctx.fillRect(-10, -10, 50, 20);
            ctx.fillStyle = accent; ctx.fillRect(40, -5, 10, 10); // Laser cannon glowing
            ctx.restore();
        } else {
            // Arms down or angry
            const armAngle = this.boss.state === 'charge' ? -Math.PI / 6 : 0;
            ctx.save(); ctx.translate(-45, -90); ctx.rotate(-armAngle); ctx.fillStyle = skinColor; ctx.fillRect(-10, 0, 20, 50); ctx.restore();
            ctx.save(); ctx.translate(45, -90); ctx.rotate(armAngle); ctx.fillStyle = armorColor; ctx.fillRect(-10, 0, 25, 50); ctx.restore(); // Cyber arm
        }

        ctx.restore();
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
            if (b.type === 'laser') {
                ctx.strokeStyle = '#00ffff';
                ctx.lineWidth = 6;
                ctx.beginPath(); ctx.moveTo(b.x - b.vx * 0.05, b.y - b.vy * 0.05); ctx.lineTo(b.x, b.y); ctx.stroke();
            } else if (b.type === 'rocket') {
                ctx.fillStyle = '#aaa';
                ctx.fillRect(b.x - 8, b.y - 4, 16, 8);
                ctx.fillStyle = '#f00';
                ctx.fillRect(b.x + 4, b.y - 4, 4, 8); // Tip
                // Rocket trail
                this.particles.push({ x: b.x - 10, y: b.y, vx: 0, vy: 0, age: 0, maxAge: 0.2, type: 'smoke' });
            } else {
                ctx.strokeStyle = b.isEnemy ? '#ff3333' : '#ffff00';
                ctx.lineWidth = 4;
                ctx.beginPath(); ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02); ctx.lineTo(b.x, b.y); ctx.stroke();
            }
        }
    }

    private renderPlatforms(ctx: CanvasRenderingContext2D) {
        if (!this.sheet.loaded) return;

        const sheetW = this.sheet.image.width;
        const rowH = this.sheet.image.height / 7;

        const srcOffsetX = 80;
        const srcOffsetY = 60; // Tightly crop to the floating island grass top
        const srcCropW = sheetW - 160;
        const srcCropH = rowH - 80; // Remove the empty space below island
        const platformSrcY = Math.floor(0 * rowH) + srcOffsetY; // Row 1 (index 0)

        const scale = 1.0;
        const destW = srcCropW * scale;
        const destH = srcCropH * scale;

        for (const p of this.platforms) {
            ctx.save();
            ctx.beginPath();
            // Mask width based on physical platform, but let height hang down naturally
            ctx.rect(p.x, p.y, p.w, destH);
            ctx.clip();

            const firstTileX = Math.floor(p.x / destW) * destW;
            for (let tx = firstTileX; tx < p.x + p.w; tx += destW) {
                ctx.drawImage(this.sheet.image, srcOffsetX, platformSrcY, srcCropW, srcCropH, tx, p.y, destW, destH);
            }

            ctx.restore();

            // Draw a dark faint outline to give volume
            ctx.strokeStyle = 'rgba(0,0,0,0.5)';
            ctx.lineWidth = 2;
            ctx.strokeRect(p.x, p.y, p.w, p.h);
        }
    }

    private renderCollectibles(ctx: CanvasRenderingContext2D) {
        ctx.lineWidth = 2;
        for (const c of this.collectibles) {
            if (c.maxAge - c.age < 2 && Math.floor(c.age * 10) % 2 === 0) continue;

            if (c.type === 'coin') {
                const r = 8;
                ctx.fillStyle = '#ffaa00'; // Outer ring
                ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#ffee00'; // Inner core
                ctx.beginPath(); ctx.arc(c.x, c.y, r - 3, 0, Math.PI * 2); ctx.fill();
                // Centered 'C'
                ctx.fillStyle = '#cc8800';
                ctx.fillRect(c.x - 1, c.y - 3, 2, 6);
            } else if (c.type === 'weapon') {
                ctx.fillStyle = '#222';
                ctx.fillRect(c.x - 10, c.y - 10, 20, 20);
                ctx.fillStyle = c.weaponType === 'shotgun' ? '#ffaa00' : (c.weaponType === 'laser' ? '#00ffff' : '#ff4444');
                ctx.font = 'bold 16px Inter';
                ctx.textAlign = 'center';
                ctx.fillText('W', c.x, c.y + 6);
                ctx.strokeStyle = '#fff';
                ctx.strokeRect(c.x - 10, c.y - 10, 20, 20);
            }
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

        // Boss HP Bar
        if (this.boss.active) {
            const barW = 600;
            const barH = 30;
            const bx = W / 2 - barW / 2;
            const by = H - 60;

            ctx.fillStyle = '#111';
            ctx.fillRect(bx, by, barW, barH);

            const fillW = Math.max(0, (this.boss.hp / this.boss.maxHp) * barW);
            ctx.fillStyle = '#ff0055';
            ctx.fillRect(bx, by, fillW, barH);

            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 4;
            ctx.strokeRect(bx, by, barW, barH);

            drawText('CYBER HULK', W / 2, by - 10, '#fff', 'center');
        }

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

    private renderDecorations(ctx: CanvasRenderingContext2D) {
        if (!this.sheet.loaded) return;
        const sheetW = this.sheet.image.width;
        const rowH = this.sheet.image.height / 7;

        const srcOffsetY = 100; // Tightly crop to bottom bushes
        const srcCropH = rowH - 100;
        const srcCropW = sheetW / 4;

        for (const d of this.decorations) {
            // Distance culling
            if (d.x > this.camX + 1500 * 2 || d.x < this.camX - 1500) continue;

            const decColW = srcCropW - 30;
            const srcX = (d.col * srcCropW) + 15;
            const srcY = Math.floor(d.row * rowH) + srcOffsetY;

            // Map aspect ratio 1:1 on height, letting width flow
            const drawH = d.h;
            const scale = drawH / srcCropH;
            const drawW = decColW * scale;

            ctx.drawImage(this.sheet.image, srcX, srcY, decColW, srcCropH, d.x, GROUND_Y - drawH + 10, drawW, drawH);
        }
    }
}
