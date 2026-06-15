/** Soft key + fill lighting and a textured ground plane. */
import * as BABYLON from '@babylonjs/core';
import type { MahjongScene } from '../MahjongScene.js';
import { GROUND_COLOR } from '../constants/graphicsConstants.js';

export class LightingSystem {
    private game: MahjongScene;
    private key!: BABYLON.DirectionalLight;
    private fill!: BABYLON.HemisphericLight;
    private ground!: BABYLON.Mesh;
    private groundMat!: BABYLON.StandardMaterial;

    constructor(game: MahjongScene) {
        this.game = game;
    }

    init(): void {
        const bjs = this.game.bjs;
        bjs.clearColor = new BABYLON.Color4(0.04, 0.06, 0.05, 1);
        bjs.ambientColor = new BABYLON.Color3(0.3, 0.3, 0.3);

        this.fill = new BABYLON.HemisphericLight('mahjong-fill', new BABYLON.Vector3(0, 1, 0), bjs);
        this.fill.intensity = 0.62;
        this.fill.diffuse = new BABYLON.Color3(1, 0.97, 0.9);
        this.fill.groundColor = new BABYLON.Color3(0.18, 0.2, 0.18);

        this.key = new BABYLON.DirectionalLight('mahjong-key', new BABYLON.Vector3(-0.4, -1, 0.35), bjs);
        this.key.intensity = 0.85;
        this.key.diffuse = new BABYLON.Color3(1, 0.96, 0.86);

        this.groundMat = new BABYLON.StandardMaterial('mahjong-ground', bjs);
        this.groundMat.diffuseColor = BABYLON.Color3.FromHexString(GROUND_COLOR);
        this.groundMat.specularColor = new BABYLON.Color3(0.04, 0.06, 0.05);
        this.ground = BABYLON.MeshBuilder.CreateGround('mahjong-ground-mesh', { width: 400, height: 400 }, bjs);
        this.ground.material = this.groundMat;
        this.ground.position.y = -0.6;
        this.ground.isPickable = false;
    }

    dispose(): void {
        this.key?.dispose();
        this.fill?.dispose();
        this.ground?.dispose();
        this.groundMat?.dispose();
    }
}
