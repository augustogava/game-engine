import * as BABYLON from '@babylonjs/core';
import type { FabulusScene } from '../FabulusScene.js';
import { MODELS_BASE_PATH } from '../constants/index.js';

const HAND_BONE_PATTERNS = [/righthand/i, /hand_r/i, /hand\.r/i, /r_hand/i, /hand/i];
const FALLBACK_BLADE_LENGTH = 0.9;
const FALLBACK_BLADE_WIDTH = 0.07;
const SWING_FLASH_MS = 120;

export class WeaponSystem {
    private scene: FabulusScene;
    private weaponMesh: BABYLON.Mesh | null = null;
    private weaponMat: BABYLON.StandardMaterial | null = null;
    private refreshToken = 0;

    constructor(scene: FabulusScene) {
        this.scene = scene;
    }

    init(): void {
        this.refresh();
    }

    refresh(): void {
        this._disposeCurrent();
        const token = ++this.refreshToken;
        const weapon = this.scene.getEquippedWeapon();
        if (!weapon) return;

        if (weapon.model_path) {
            BABYLON.SceneLoader.ImportMesh('', MODELS_BASE_PATH, weapon.model_path, this.scene.bScene, (meshes) => {
                const root = meshes[0] as BABYLON.Mesh;
                if (token !== this.refreshToken) {
                    if (root) root.dispose(false, true);
                    return;
                }
                if (!root) {
                    this._buildFallbackBlade();
                    return;
                }
                for (const m of meshes) m.isPickable = false;
                this._attachToHand(root);
                this.weaponMesh = root;
            }, undefined, (_s, message) => {
                if (token !== this.refreshToken) return;
                console.warn('[Fabulus] Weapon model load failed, using fallback blade:', message);
                this._buildFallbackBlade();
            });
        } else {
            this._buildFallbackBlade();
        }
    }

    private _buildFallbackBlade(): void {
        const s = this.scene.bScene;
        const blade = BABYLON.MeshBuilder.CreateBox('fab_weapon_blade', {
            width: FALLBACK_BLADE_WIDTH, height: FALLBACK_BLADE_LENGTH, depth: FALLBACK_BLADE_WIDTH * 0.4,
        }, s);
        const guard = BABYLON.MeshBuilder.CreateBox('fab_weapon_guard', {
            width: FALLBACK_BLADE_WIDTH * 3.4, height: FALLBACK_BLADE_WIDTH, depth: FALLBACK_BLADE_WIDTH,
        }, s);
        guard.parent = blade;
        guard.position.y = -FALLBACK_BLADE_LENGTH / 2 + FALLBACK_BLADE_WIDTH;

        const mat = new BABYLON.StandardMaterial('fab_weapon_mat', s);
        mat.diffuseColor = new BABYLON.Color3(0.65, 0.66, 0.7);
        mat.specularColor = new BABYLON.Color3(0.9, 0.9, 0.95);
        mat.specularPower = 64;
        blade.material = mat;
        guard.material = mat;
        blade.isPickable = false;
        guard.isPickable = false;
        this.weaponMat = mat;

        this._attachToHand(blade);
        this.weaponMesh = blade;
    }

    private _attachToHand(mesh: BABYLON.Mesh): void {
        const skinned = this.scene.playerMeshes.find(m => (m as BABYLON.Mesh).skeleton) as BABYLON.Mesh | undefined;
        const skeleton = skinned?.skeleton ?? null;
        if (skeleton) {
            for (const pattern of HAND_BONE_PATTERNS) {
                const bone = skeleton.bones.find(b => pattern.test(b.name));
                if (bone) {
                    try {
                        mesh.attachToBone(bone, skinned!);
                        mesh.position.set(0, 0.05, 0.04);
                        mesh.rotation.set(Math.PI / 2, 0, 0);
                        mesh.scaling.scaleInPlace(1 / Math.max(0.0001, skinned!.scaling.y || 1));
                        console.debug(`[Fabulus] Weapon attached to bone: ${bone.name}`);
                        return;
                    } catch (err) {
                        console.warn('[Fabulus] attachToBone failed:', err);
                    }
                }
            }
        }
        if (this.scene.playerRoot) {
            mesh.parent = this.scene.playerRoot;
            mesh.position.set(0.45, 1.0, 0.15);
            mesh.rotation.set(0, 0, -0.35);
            console.debug('[Fabulus] Weapon attached to player root (no hand bone found)');
        }
    }

    swingFlash(): void {
        if (!this.weaponMat) return;
        const mat = this.weaponMat;
        mat.emissiveColor = new BABYLON.Color3(0.5, 0.5, 0.6);
        setTimeout(() => {
            mat.emissiveColor = new BABYLON.Color3(0, 0, 0);
        }, SWING_FLASH_MS);
    }

    private _disposeCurrent(): void {
        if (this.weaponMesh) {
            try { this.weaponMesh.dispose(false, true); } catch (err) { console.warn('[Fabulus] weapon dispose failed:', err); }
            this.weaponMesh = null;
            this.weaponMat = null;
        }
    }
}
