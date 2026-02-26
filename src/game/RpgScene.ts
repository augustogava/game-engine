import { Scene, SceneContext } from '../engine/scene/Scene.js';
import { Renderer } from '../engine/renderer/Renderer.js';
import { SpriteSheet, AnimatedSprite } from '../engine/sprites/SpriteSheet.js';
import { Vector2 } from '../engine/math/Vector2.js';
import { MathUtils } from '../engine/math/MathUtils.js';

enum PlayerDirection { Down, Left, Right, Up }

interface DialogState {
    active: boolean;
    text: string;
    timer: number;
}

interface Item {
    x: number;
    y: number;
    collected: boolean;
    name: string;
}

interface MapProp {
    x: number;
    y: number;
    w: number;
    h: number;
    spriteFrame: string;
    colliderY: number;
    colliderH: number;
}

class NpcEntity {
    pos: Vector2;
    dir: PlayerDirection = PlayerDirection.Down;
    speed = 60;
    isMoving = false;
    currentAnim!: AnimatedSprite;

    // Simple AI
    moveTimer = 0;
    pauseTimer = 0;

    constructor(x: number, y: number) {
        this.pos = new Vector2(x, y);
    }
}

export class RpgScene extends Scene {
    private playerSheet!: SpriteSheet;
    private mapSheet!: SpriteSheet;
    private propSheet!: SpriteSheet;

    // Player State
    private pos = new Vector2(400, 300); // Start middle of map
    private speed = 120;
    private dir = PlayerDirection.Down;
    private isMoving = false;

    // Animations -> MapProps
    private anims!: Record<string, AnimatedSprite>;
    private props: MapProp[] = [];

    // Entity State
    private npcs: NpcEntity[] = [];
    private items: Item[] = [];
    private dialog: DialogState = { active: false, text: "", timer: 0 };

    // Map bounds
    private mapWidth = 2000;
    private mapHeight = 2000;

    constructor() {
        super();
    }

    onEnter(ctx: SceneContext): void {
        super.onEnter(ctx);

        // Asset Setup
        this.playerSheet = new SpriteSheet('src/game/assets/rpg_npcs.jpg');
        // RPG Maker sheet: 12 columns by 8 rows total
        // The first character (top left) occupies cols 0, 1, 2 and rows 0, 1, 2, 3

        // Wait for image load to do accurate division, or we can use fixed numbers if we check the resolution.
        // The image is 384x256 based on the provided UI snippets. (12 cols of 32px, 8 cols of 32px)
        const cellW = 32;
        const cellH = 32;

        for (let i = 0; i < 3; i++) {
            // Player (Top Left character, columns 0-2)
            this.playerSheet.defineFrame(`walk_down_${i}`, i * cellW, 0 * cellH, cellW, cellH);
            this.playerSheet.defineFrame(`walk_left_${i}`, i * cellW, 1 * cellH, cellW, cellH);
            this.playerSheet.defineFrame(`walk_right_${i}`, i * cellW, 2 * cellH, cellW, cellH);
            this.playerSheet.defineFrame(`walk_up_${i}`, i * cellW, 3 * cellH, cellW, cellH);

            // NPC (Red hair girl, second column block, cols 3-5)
            this.playerSheet.defineFrame(`npc_down_${i}`, (3 + i) * cellW, 0 * cellH, cellW, cellH);
            this.playerSheet.defineFrame(`npc_left_${i}`, (3 + i) * cellW, 1 * cellH, cellW, cellH);
            this.playerSheet.defineFrame(`npc_right_${i}`, (3 + i) * cellW, 2 * cellH, cellW, cellH);
            this.playerSheet.defineFrame(`npc_up_${i}`, (3 + i) * cellW, 3 * cellH, cellW, cellH);
        }

        // Standard 4-step walk cycle using 3 frames: [1, 0, 1, 2] (stand, step L, stand, step R)
        this.anims = {
            'down': new AnimatedSprite(this.playerSheet, ['walk_down_1', 'walk_down_0', 'walk_down_1', 'walk_down_2'], 6),
            'left': new AnimatedSprite(this.playerSheet, ['walk_left_1', 'walk_left_0', 'walk_left_1', 'walk_left_2'], 6),
            'right': new AnimatedSprite(this.playerSheet, ['walk_right_1', 'walk_right_0', 'walk_right_1', 'walk_right_2'], 6),
            'up': new AnimatedSprite(this.playerSheet, ['walk_up_1', 'walk_up_0', 'walk_up_1', 'walk_up_2'], 6),

            'npc_down': new AnimatedSprite(this.playerSheet, ['npc_down_1', 'npc_down_0', 'npc_down_1', 'npc_down_2'], 4),
            'npc_left': new AnimatedSprite(this.playerSheet, ['npc_left_1', 'npc_left_0', 'npc_left_1', 'npc_left_2'], 4),
            'npc_right': new AnimatedSprite(this.playerSheet, ['npc_right_1', 'npc_right_0', 'npc_right_1', 'npc_right_2'], 4),
            'npc_up': new AnimatedSprite(this.playerSheet, ['npc_up_1', 'npc_up_0', 'npc_up_1', 'npc_up_2'], 4),
        };

        // We aren't using the old dunkgeon background now. We just draw a green rect.
        // We will repurpose mapSheet for rpg_map props:
        this.propSheet = new SpriteSheet('src/game/assets/rpg_map.jpg');

        // Define some prop frames from rpg_map.jpg
        // Using isolated sprites near edges to prevent artifacts
        // Top-Left Light Green Oak
        this.propSheet.defineFrame('oak_tree', 5, 5, 115, 115);
        // Middle-Top Pine
        this.propSheet.defineFrame('pine_tree', 260, 5, 50, 90);
        // Map "bush" to a pine tree to guarantee 0 artifacts
        this.propSheet.defineFrame('bush', 260, 5, 50, 90);
        // Boulder
        this.propSheet.defineFrame('boulder', 132, 68, 24, 24);

        // Set up map sizes
        this.mapWidth = 2000;
        this.mapHeight = 2000;

        // Reset to 1:1 scale to make map feel larger and props smaller
        this.ctx.camera.zoom = 1.0;

        // Spawn Entities
        this.spawnEntities();
    }

    private spawnEntities(): void {
        // Spawn wandering NPC
        const npc = new NpcEntity(500, 300);
        npc.currentAnim = this.anims['npc_down'];
        this.npcs.push(npc);

        // Spawn Items
        this.items.push({ x: 600, y: 400, collected: false, name: "Ancient Relic" });
        this.items.push({ x: 300, y: 700, collected: false, name: "Health Potion" });

        // Procedurally spawn Map Props (Trees, Rocks, etc.)
        const frameTypes = [
            { id: 'oak_tree', width: 115, height: 115, collY: 80, collH: 30 },
            { id: 'pine_tree', width: 50, height: 90, collY: 65, collH: 20 },
            { id: 'bush', width: 50, height: 90, collY: 65, collH: 20 },
            { id: 'boulder', width: 24, height: 24, collY: 10, collH: 14 }
        ];

        // Scatter ~120 objects (more dense since world is zoomed out)
        for (let i = 0; i < 120; i++) {
            const type = frameTypes[Math.floor(Math.random() * frameTypes.length)];
            const x = Math.random() * (this.mapWidth - type.width);
            const y = Math.random() * (this.mapHeight - type.height);

            // Keep center area clear for spawn
            const distToCenter = Math.hypot((x + type.width / 2) - 400, (y + type.height / 2) - 300);
            if (distToCenter < 150) continue;

            this.props.push({
                x: x,
                y: y,
                w: type.width,
                h: type.height,
                spriteFrame: type.id,
                colliderY: type.collY,
                colliderH: type.collH
            });
        }
    }

    private loggedPlayerSize = false;
    private loggedMapSize = false;

    update(dt: number): void {
        if (this.playerSheet.loaded && !this.loggedPlayerSize) {
            console.log("Player sprite width:", (this.playerSheet.image as HTMLImageElement).naturalWidth, "height:", (this.playerSheet.image as HTMLImageElement).naturalHeight);
            this.loggedPlayerSize = true;
        }


        const input = this.ctx.input;

        // 1. Process Dialog Timer
        if (this.dialog.active) {
            this.dialog.timer -= dt;
            if (this.dialog.timer <= 0) {
                this.dialog.active = false;
            }
        }

        // 2. Player Input & Movement
        let dx = 0;
        let dy = 0;

        // Only allow movement if dialog isn't open (or allow if you want!)
        if (!this.dialog.active) {
            if (input.isKeyDown('KeyW') || input.isKeyDown('ArrowUp')) { dy -= 1; this.dir = PlayerDirection.Up; }
            if (input.isKeyDown('KeyS') || input.isKeyDown('ArrowDown')) { dy += 1; this.dir = PlayerDirection.Down; }
            if (input.isKeyDown('KeyA') || input.isKeyDown('ArrowLeft')) { dx -= 1; this.dir = PlayerDirection.Left; }
            if (input.isKeyDown('KeyD') || input.isKeyDown('ArrowRight')) { dx += 1; this.dir = PlayerDirection.Right; }
        }

        if (dx !== 0 && dy !== 0) {
            const len = Math.sqrt(dx * dx + dy * dy);
            dx /= len; dy /= len;
        }

        this.isMoving = (dx !== 0 || dy !== 0);

        if (this.isMoving) {
            const nextX = this.pos.x + dx * this.speed * dt;
            const nextY = this.pos.y + dy * this.speed * dt;

            // Assume player's bottom feet is a 32x16 bounding box
            const playerCol = { x: nextX - 16, y: nextY + 16, w: 32, h: 16 };

            let collision = false;
            for (const prop of this.props) {
                const propCol = {
                    x: prop.x,
                    y: prop.y + prop.colliderY,
                    w: prop.w,
                    h: prop.colliderH
                };

                if (MathUtils.intersectRect(
                    playerCol.x, playerCol.y, playerCol.w, playerCol.h,
                    propCol.x, propCol.y, propCol.w, propCol.h
                )) {
                    collision = true;
                    break;
                }
            }

            if (!collision) {
                this.pos.x = nextX;
                this.pos.y = nextY;
            }

            // Map boundaries for player
            this.pos.x = MathUtils.clamp(this.pos.x, 16, this.mapWidth - 16);
            this.pos.y = MathUtils.clamp(this.pos.y, 16, this.mapHeight - 16);
        }

        let currentAnim = this.anims['down'];
        if (this.dir === PlayerDirection.Left) currentAnim = this.anims['left'];
        else if (this.dir === PlayerDirection.Right) currentAnim = this.anims['right'];
        else if (this.dir === PlayerDirection.Up) currentAnim = this.anims['up'];

        if (this.isMoving) {
            currentAnim.update(dt);
        } else {
            currentAnim.reset(); // idle on first frame
        }

        // 3. Update NPCs (Simple AI)
        for (const npc of this.npcs) {
            if (npc.pauseTimer > 0) {
                npc.pauseTimer -= dt;
                npc.isMoving = false;
                if (npc.pauseTimer <= 0) {
                    // Start moving in random dir
                    npc.moveTimer = 1 + Math.random() * 2;
                    npc.dir = Math.floor(Math.random() * 4) as PlayerDirection;
                }
            } else if (npc.moveTimer > 0) {
                npc.moveTimer -= dt;
                npc.isMoving = true;

                let ndx = 0, ndy = 0;
                if (npc.dir === PlayerDirection.Up) ndy = -1;
                else if (npc.dir === PlayerDirection.Down) ndy = 1;
                else if (npc.dir === PlayerDirection.Left) ndx = -1;
                else if (npc.dir === PlayerDirection.Right) ndx = 1;

                const nextNpcX = npc.pos.x + ndx * npc.speed * dt;
                const nextNpcY = npc.pos.y + ndy * npc.speed * dt;

                const npcCol = { x: nextNpcX - 16, y: nextNpcY + 16, w: 32, h: 16 };
                let npcCollision = false;

                for (const prop of this.props) {
                    const propCol = {
                        x: prop.x,
                        y: prop.y + prop.colliderY,
                        w: prop.w,
                        h: prop.colliderH
                    };
                    if (MathUtils.intersectRect(
                        npcCol.x, npcCol.y, npcCol.w, npcCol.h,
                        propCol.x, propCol.y, propCol.w, propCol.h
                    )) {
                        npcCollision = true;
                        break;
                    }
                }

                if (!npcCollision) {
                    npc.pos.x = nextNpcX;
                    npc.pos.y = nextNpcY;
                } else {
                    // Hit a tree, pause early
                    npc.moveTimer = 0;
                }

                // Map clamp
                npc.pos.x = MathUtils.clamp(npc.pos.x, 16, this.mapWidth - 16);
                npc.pos.y = MathUtils.clamp(npc.pos.y, 16, this.mapHeight - 16);

                if (npc.moveTimer <= 0) {
                    npc.pauseTimer = 1 + Math.random() * 3;
                }
            }

            // Update NPC Anim
            let nAnim = this.anims['npc_down'];
            if (npc.dir === PlayerDirection.Left) nAnim = this.anims['npc_left'];
            else if (npc.dir === PlayerDirection.Right) nAnim = this.anims['npc_right'];
            else if (npc.dir === PlayerDirection.Up) nAnim = this.anims['npc_up'];

            npc.currentAnim = nAnim;
            if (npc.isMoving) npc.currentAnim.update(dt);
            else npc.currentAnim.reset();

            // Check collision with player
            const dist = Math.hypot(this.pos.x - npc.pos.x, this.pos.y - npc.pos.y);
            if (dist < 40 && !this.dialog.active) {
                this.dialog.active = true;
                this.dialog.text = "Hello traveler! Be careful down here.";
                this.dialog.timer = 3.0;
            }
        }

        // 4. Update Items (Collection check)
        for (const item of this.items) {
            if (!item.collected) {
                const dist = Math.hypot(this.pos.x - item.x, this.pos.y - item.y);
                if (dist < 32) {
                    item.collected = true;
                    // Trigger dialog
                    this.dialog.active = true;
                    this.dialog.text = `Found: ${item.name}!`;
                    this.dialog.timer = 2.0;
                }
            }
        }

        // 5. Camera Update
        // the camera should follow the player, but clamp to map edges.
        const halfW = (this.ctx.camera.screenWidth * 0.5) / this.ctx.camera.zoom;
        const halfH = (this.ctx.camera.screenHeight * 0.5) / this.ctx.camera.zoom;

        const camX = MathUtils.clamp(this.pos.x, halfW, this.mapWidth - halfW);
        const camY = MathUtils.clamp(this.pos.y, halfH, this.mapHeight - halfH);

        this.ctx.camera.position.set(camX, camY);
    }

    render(renderer: Renderer): void {
        const ctx = renderer.ctx;

        ctx.save();
        this.ctx.camera.applyToContext(ctx);

        // 1. Draw Map (Solid Green)
        ctx.fillStyle = '#78C078';
        ctx.fillRect(0, 0, this.mapWidth, this.mapHeight);

        // 2. Draw Items
        for (const item of this.items) {
            if (!item.collected) {
                // Draw a simple glowing orb for an item
                ctx.fillStyle = '#ffd700';
                ctx.beginPath();
                ctx.arc(item.x, item.y, 8, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                ctx.stroke();

                // Pulsating glow
                const time = performance.now() / 200;
                ctx.fillStyle = `rgba(255, 215, 0, ${0.3 + Math.sin(time) * 0.2})`;
                ctx.beginPath();
                ctx.arc(item.x, item.y, 16, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // We sort everything by Y position to achieve simple depth sorting (draw top-to-bottom)
        const renderQueue: { y: number, draw: () => void }[] = [];

        // Player
        renderQueue.push({
            y: this.pos.y,
            draw: () => {
                let currentAnim = this.anims['down'];
                if (this.dir === PlayerDirection.Left) currentAnim = this.anims['left'];
                else if (this.dir === PlayerDirection.Right) currentAnim = this.anims['right'];
                else if (this.dir === PlayerDirection.Up) currentAnim = this.anims['up'];

                currentAnim.draw(ctx, this.pos.x - 32, this.pos.y - 32, 64, 64);
            }
        });

        // NPCs
        for (const npc of this.npcs) {
            if (npc.currentAnim) {
                renderQueue.push({
                    y: npc.pos.y,
                    draw: () => {
                        npc.currentAnim.draw(ctx, npc.pos.x - 32, npc.pos.y - 32, 64, 64);
                    }
                });
            }
        }

        // Props
        if (this.propSheet.loaded) {
            for (const prop of this.props) {
                renderQueue.push({
                    y: prop.y + prop.h, // Sort by bottom edge
                    draw: () => {
                        this.propSheet.draw(ctx, prop.spriteFrame, prop.x, prop.y, prop.w, prop.h);
                    }
                });
            }
        }

        // Execute depth sort
        renderQueue.sort((a, b) => a.y - b.y);
        for (const item of renderQueue) {
            item.draw();
        }

        ctx.restore();

        // 5. Draw UI (Screen Space)
        if (this.dialog.active) {
            const pad = 20;
            const h = 120;
            const w = this.ctx.camera.screenWidth - pad * 2;
            const x = pad;
            const y = this.ctx.camera.screenHeight - h - pad;

            ctx.fillStyle = 'rgba(10, 10, 20, 0.85)';
            ctx.fillRect(x, y, w, h);

            ctx.strokeStyle = '#aab2ff';
            ctx.lineWidth = 4;
            ctx.strokeRect(x, y, w, h);

            ctx.fillStyle = '#fff';
            ctx.font = '24px Inter, sans-serif';
            ctx.textBaseline = 'top';

            // Simple text wrapping or just draw single line
            ctx.fillText(this.dialog.text, x + 20, y + 20);

            // Continue prompt
            ctx.font = '14px Inter, sans-serif';
            ctx.fillStyle = '#8f96cc';
            ctx.fillText("Press WASD to move...", x + 20, y + h - 30);
        }
    }
}
