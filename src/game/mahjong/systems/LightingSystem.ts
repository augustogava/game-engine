/** Soft key + fill lighting, a teal radial background and a tinted ground plane. */
import * as BABYLON from '@babylonjs/core';
import type { MahjongScene } from '../MahjongScene.js';
import { BG_TEAL_CENTER, BG_TEAL_EDGE, GROUND_COLOR } from '../constants/graphicsConstants.js';

const BG_TEXTURE_SIZE = 512;

export class LightingSystem {
    private game: MahjongScene;
    private key!: BABYLON.DirectionalLight;
    private fill!: BABYLON.HemisphericLight;
    private ground!: BABYLON.Mesh;
    private groundMat!: BABYLON.StandardMaterial;
    private bgLayer!: BABYLON.Layer;
    private bgTexture!: BABYLON.DynamicTexture;

    constructor(game: MahjongScene) {
        this.game = game;
    }

    init(): void {
        const bjs = this.game.bjs;
        const edge = BABYLON.Color3.FromHexString(BG_TEAL_EDGE);
        bjs.clearColor = new BABYLON.Color4(edge.r, edge.g, edge.b, 1);
        bjs.ambientColor = new BABYLON.Color3(0.25, 0.27, 0.27);

        this.buildBackground(bjs);

        this.fill = new BABYLON.HemisphericLight('mahjong-fill', new BABYLON.Vector3(0, 1, 0), bjs);
        this.fill.intensity = 0.5;
        this.fill.diffuse = new BABYLON.Color3(1, 0.99, 0.95);
        this.fill.groundColor = new BABYLON.Color3(0.14, 0.18, 0.16);

        this.key = new BABYLON.DirectionalLight('mahjong-key', new BABYLON.Vector3(-0.4, -1, 0.35), bjs);
        this.key.intensity = 0.7;
        this.key.diffuse = new BABYLON.Color3(1, 0.98, 0.92);
        this.key.specular = new BABYLON.Color3(1, 1, 1);

        this.groundMat = new BABYLON.StandardMaterial('mahjong-ground', bjs);
        this.groundMat.diffuseColor = BABYLON.Color3.FromHexString(GROUND_COLOR);
        this.groundMat.specularColor = new BABYLON.Color3(0.05, 0.08, 0.07);
        this.ground = BABYLON.MeshBuilder.CreateGround('mahjong-ground-mesh', { width: 400, height: 400 }, bjs);
        this.ground.material = this.groundMat;
        this.ground.position.y = -0.6;
        this.ground.isPickable = false;
    }

    /** Full-screen teal radial-gradient drawn behind the 3D scene. */
    private buildBackground(bjs: BABYLON.Scene): void {
        this.bgTexture = new BABYLON.DynamicTexture('mahjong-bg', { width: BG_TEXTURE_SIZE, height: BG_TEXTURE_SIZE }, bjs, false);
        const ctx = this.bgTexture.getContext() as unknown as CanvasRenderingContext2D;
        const c = BG_TEXTURE_SIZE / 2;
        const grad = ctx.createRadialGradient(c, BG_TEXTURE_SIZE * 0.42, BG_TEXTURE_SIZE * 0.04, c, c, BG_TEXTURE_SIZE * 0.72);
        grad.addColorStop(0, BG_TEAL_CENTER);
        grad.addColorStop(1, BG_TEAL_EDGE);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, BG_TEXTURE_SIZE, BG_TEXTURE_SIZE);
        this.bgTexture.update(false);

        this.bgLayer = new BABYLON.Layer('mahjong-bg-layer', null, bjs, true);
        this.bgLayer.texture = this.bgTexture;
    }

    dispose(): void {
        this.key?.dispose();
        this.fill?.dispose();
        this.ground?.dispose();
        this.groundMat?.dispose();
        this.bgLayer?.dispose();
        this.bgTexture?.dispose();
    }
}
