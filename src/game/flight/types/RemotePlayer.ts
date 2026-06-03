import * as BABYLON from '@babylonjs/core';
import { EngineSound } from '../../EngineSound.js';
import { PlayerState } from '../../MultiplayerClient.js';
import type { AircraftConfig } from './AircraftConfig.js';
import type { ContrailRibbonHandle } from '../systems/ContrailRibbonSystem.js';

export interface RemotePlayer {
    root: BABYLON.TransformNode;
    meshes: BABYLON.Mesh[];
    animationGroups: BABYLON.AnimationGroup[];
    skeletons: BABYLON.Skeleton[];
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
    contrailEmitterLeft: BABYLON.TransformNode | null;
    contrailEmitterRight: BABYLON.TransformNode | null;
    contrailPSLeft: BABYLON.ParticleSystem | null;
    contrailPSRight: BABYLON.ParticleSystem | null;
    contrailRibbonLeft: ContrailRibbonHandle | null;
    contrailRibbonRight: ContrailRibbonHandle | null;
    contrailHalfSpan: number;
    modelPivot: BABYLON.TransformNode | null;
    modelOriginalSize: number;
    modelOriginalHalfWidth: number;
    aircraftConfigCached: AircraftConfig | null;
    pendingConfigApply: boolean;
}
