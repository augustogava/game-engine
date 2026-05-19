import * as BABYLON from '@babylonjs/core';
import { EngineSound } from '../../EngineSound.js';
import { PlayerState } from '../../MultiplayerClient.js';

export interface RemotePlayer {
    root: BABYLON.TransformNode;
    meshes: BABYLON.Mesh[];
    prevState: PlayerState | null;
    nextState: PlayerState | null;
    lastUpdateTime: number;
    aircraftCode: string | null;
    labelPlane: BABYLON.Mesh | null;
    labelTexture: BABYLON.DynamicTexture | null;
    currentUsername: string | null;
    currentAvatarUrl: string | null;
    engineSound: EngineSound | null;
    engineTypeResolved: boolean;
}
