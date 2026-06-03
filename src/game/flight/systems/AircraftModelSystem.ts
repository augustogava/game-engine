import * as BABYLON from '@babylonjs/core';
import type { FlightSceneSimple } from '../../FlightSceneSimple.js';
import {
    GROUND_Y,
    GEAR_SPRING_K_MIN_N_PER_M,
    G_ACCEL,
    SPAWN_SNAP_FRAMES,
    AIRBORNE_MISSION_MIN_OFFSET_M,
    ENGINE_TYPE_PISTON,
    ENGINE_TYPE_TURBOPROP,
    GEAR_STATE_UP,
    CAMERA_RADIUS_MIN_M,
    CAMERA_RADIUS_MAX_M,
    CAMERA_RADIUS_LENGTH_FACTOR,
    CAMERA_LOWER_RADIUS_AIRCRAFT_FACTOR,
    CAMERA_LOWER_RADIUS_HEIGHT_FACTOR,
    CAMERA_LOWER_RADIUS_FALLBACK_M,
    AIRCRAFT_PBR_MAX_SIMULTANEOUS_LIGHTS,
} from '../constants/index.js';

const AIRCRAFT_TEXTURE_ANISOTROPY = 8;

export class AircraftModelSystem {
    private readonly scene: any;

    constructor(scene: FlightSceneSimple) {
        this.scene = scene;
    }

    private resolveSpawnHeadingDeg(): number {
        const missionHdg = this.scene._pendingMissionHdg;
        if (this.scene._pendingMissionLat != null && missionHdg != null && Number.isFinite(missionHdg)) {
            return missionHdg;
        }
        return this.scene.initialHeading;
    }

    buildPlane(scene: BABYLON.Scene): void {
        const cfg = this.scene.aircraftConfig;
        this.scene.planeRoot = new BABYLON.TransformNode('planeRoot', scene);
        const spawnHdg = this.resolveSpawnHeadingDeg();
        const yawRad = (180 - spawnHdg) * Math.PI / 180;
        this.scene.planeRoot.rotationQuaternion = BABYLON.Quaternion.RotationAxis(BABYLON.Vector3.Up(), yawRad);
        this.scene.angularVelocity.set(0, 0, 0);
        this.scene.gearCompression = new Array(cfg.gear_positions.length).fill(0);
        const gearHeight = cfg.gear_positions.length > 0
            ? Math.abs(Math.min(...cfg.gear_positions.map((g: { y: number }) => g.y)))
            : 0;
        if (this.scene.spawnAirborne) {
            const isAirborneMission = this.scene._pendingMissionAirborne === true;
            const minOffset = isAirborneMission ? AIRBORNE_MISSION_MIN_OFFSET_M : 100;
            const altOffset = Math.max(minOffset, cfg.spawn_alt_offset_m);
            this.scene.planeRoot.position.set(0, GROUND_Y + altOffset, 0);
            this.scene.thrust = cfg.spawn_airborne_thrust || 0.7;
            this.scene.flapIndex = cfg.default_flap_index_air;
            this.scene.currentFlapDeg = this.scene.FLAP_STEPS[this.scene.flapIndex] || 0;
            const rotMatrix = new BABYLON.Matrix();
            BABYLON.Matrix.FromQuaternionToRef(this.scene.planeRoot.rotationQuaternion, rotMatrix);
            const fwd = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0, 0, 1), rotMatrix);
            this.scene.velocity = fwd.scale(cfg.spawn_airborne_speed_ms || 80);
            if (isAirborneMission) {
                this.scene._spawnSnapFramesLeft = 0;
                this.scene._pendingAirborneGearRetract = true;
                const missionAlt = this.scene._pendingMissionAltM ?? 0;
                console.debug(`[FlightSimple] Airborne mission spawn: mission_alt=${missionAlt.toFixed(1)}m refAlt=${this.scene.refAlt.toFixed(1)}m posY=${this.scene.planeRoot.position.y.toFixed(1)}m altOffset=${altOffset.toFixed(1)}m snapDisabled pendingGearRetract terrainY=${this.scene.terrainY.toFixed(1)}m`);
            }
        } else {
            this.scene.planeRoot.position.set(0, GROUND_Y + gearHeight, 0);
            this.scene.thrust = 0;
            this.scene.flapIndex = cfg.default_flap_index_ground;
            this.scene.currentFlapDeg = this.scene.FLAP_STEPS[this.scene.flapIndex] || 15;
            this.scene.velocity = BABYLON.Vector3.Zero();
            this.scene._spawnSnapFramesLeft = SPAWN_SNAP_FRAMES;
            this.scene._pendingAirborneGearRetract = false;
            console.debug(`[FlightSimple] Initial ground spawn: snap window armed for ${SPAWN_SNAP_FRAMES} frames, gearHeight=${gearHeight.toFixed(3)}`);
        }

        this.loadAircraftModel(scene);
    }

    loadAircraftModel(scene: BABYLON.Scene): void {
        const cfg = this.scene.aircraftConfig;
        if (this.scene._skipInitialModelLoad) {
            console.log(`[Aircraft] Skipping initial model load for ${cfg.code} (${cfg.model_file}) — waiting for async config fetch.`);
            return;
        }
        const modelPath = cfg.model_file;
        const lastSlash = modelPath.lastIndexOf('/');
        const folder = lastSlash >= 0 ? modelPath.substring(0, lastSlash + 1) : '';
        const file = lastSlash >= 0 ? modelPath.substring(lastSlash + 1) : modelPath;
        const myVersion = ++this.scene._modelLoadVersion;

        BABYLON.SceneLoader.ImportMesh(
            '', folder, file, scene,
            (meshes: BABYLON.AbstractMesh[], _ps: BABYLON.IParticleSystem[], _sk: BABYLON.Skeleton[], animationGroups: BABYLON.AnimationGroup[]) => {
                if (!meshes.length) return;
                if (this.scene._disposed || !this.scene.scene || !this.scene.planeRoot) {
                    console.log(`[FlightSimple] Discarding model load (${cfg.code}) — scene disposed.`);
                    meshes.forEach((m) => { try { m.dispose(); } catch (_) { /* ignore */ } });
                    if (animationGroups && animationGroups.length) {
                        animationGroups.forEach((g) => { try { g.dispose(); } catch (_) { /* ignore */ } });
                    }
                    return;
                }
                if (myVersion !== this.scene._modelLoadVersion) {
                    console.log(`[FlightSimple] Discarding stale model load (${cfg.code}) — newer load in progress.`);
                    meshes.forEach((m) => m.dispose());
                    if (animationGroups && animationGroups.length) {
                        animationGroups.forEach((g) => g.dispose());
                    }
                    return;
                }
                this.scene._loadedModelMeshes = meshes;
                try {
                    const seenMats = new Set<BABYLON.Material>();
                    let cappedCount = 0;
                    for (const m of meshes) {
                        const mat = m.material;
                        if (!mat || seenMats.has(mat)) continue;
                        seenMats.add(mat);
                        if (mat instanceof BABYLON.PBRBaseMaterial) {
                            (mat as BABYLON.PBRMaterial).maxSimultaneousLights = AIRCRAFT_PBR_MAX_SIMULTANEOUS_LIGHTS;
                            cappedCount++;
                        }
                    }
                    if (cappedCount > 0) {
                        console.debug(`[FlightSimple] Capped maxSimultaneousLights=${AIRCRAFT_PBR_MAX_SIMULTANEOUS_LIGHTS} on ${cappedCount} PBR material(s) of ${cfg.code}`);
                    }
                } catch (err) {
                    console.warn('[FlightSimple] Failed to cap maxSimultaneousLights on aircraft PBR materials:', err);
                }
                this.scene._loadedAnimGroups = animationGroups || [];
                this.scene._propellerAnimGroup = null;
                this.scene._gearUpAnimGroups = [];
                this.scene._gearDownAnimGroups = [];
                if (this.scene._loadedAnimGroups.length) {
                    this.scene._loadedAnimGroups.forEach((g: BABYLON.AnimationGroup) => g.stop());
                    const hasProp = cfg.engine_type === ENGINE_TYPE_PISTON || cfg.engine_type === ENGINE_TYPE_TURBOPROP;
                    if (hasProp) {
                        const propGroup = this.scene._loadedAnimGroups.find((g: BABYLON.AnimationGroup) =>
                            /propell?er|prop\b|engine[_\s\-.]?start|engine[_\s\-.]?run|spin/i.test(g.name)
                        );
                        if (propGroup) {
                            this.scene._propellerAnimGroup = propGroup;
                            propGroup.loopAnimation = true;
                            console.log(`[FlightSimple] Propeller animation found: "${propGroup.name}" (${propGroup.from}-${propGroup.to})`);
                        } else {
                            console.warn(`[FlightSimple] Aircraft ${cfg.code} is a prop engine but no "propeller" animation found in GLB. Available: ${this.scene._loadedAnimGroups.map((g: BABYLON.AnimationGroup) => g.name).join(', ') || '(none)'}`);
                        }
                    }
                    if (cfg.gear_retractable) {
                        this.scene._gearUpAnimGroups = this.scene._loadedAnimGroups.filter((g: BABYLON.AnimationGroup) => /gear[_\s]?up|gear[_\s]?retract/i.test(g.name));
                        this.scene._gearDownAnimGroups = this.scene._loadedAnimGroups.filter((g: BABYLON.AnimationGroup) => /gear[_\s]?down|gear[_\s]?extend/i.test(g.name));
                        for (const g of this.scene._gearUpAnimGroups) g.loopAnimation = false;
                        for (const g of this.scene._gearDownAnimGroups) g.loopAnimation = false;
                        if (this.scene._gearUpAnimGroups.length === 0 && this.scene._gearDownAnimGroups.length === 0) {
                            const allNames = this.scene._loadedAnimGroups.map((g: BABYLON.AnimationGroup) => g.name).join(', ') || '(none)';
                            console.warn(`[FlightSimple] ${cfg.code}: retractable gear without animations — instant transition will be used (G key still works). Available animations: [${allNames}]`);
                        } else {
                            const upNames = this.scene._gearUpAnimGroups.map((g: BABYLON.AnimationGroup) => g.name).join(', ') || 'none';
                            const downNames = this.scene._gearDownAnimGroups.map((g: BABYLON.AnimationGroup) => g.name).join(', ') || 'none';
                            console.log(`[FlightSimple] Gear animations found: up=[${upNames}], down=[${downNames}]`);
                        }
                    }
                }
                if (this.scene._pendingAirborneGearRetract) {
                    if (this.scene._gearUpAnimGroups.length > 0) {
                        this.scene.gearState = GEAR_STATE_UP;
                        for (const g of this.scene._gearUpAnimGroups) g.start(false, 100.0, g.from, g.to);
                        console.debug(`[FlightSimple] Airborne mission: retracting gear (${cfg.code})`);
                    } else {
                        console.debug(`[FlightSimple] Airborne mission: ${cfg.code} has no gear retract animation, gear stays DOWN`);
                    }
                    this.scene._pendingAirborneGearRetract = false;
                }
                const root = meshes[0];

                const bb = root.getHierarchyBoundingVectors(true);
                const center = bb.min.add(bb.max).scale(0.5);
                const size = bb.max.subtract(bb.min).length();

                const modelPivot = new BABYLON.TransformNode('modelPivot', scene);
                modelPivot.parent = this.scene.planeRoot;

                root.parent = modelPivot;
                const scaleFactor = cfg.model_target_size / Math.max(size, 0.1);
                const gearMinY = cfg.gear_positions.length > 0
                    ? Math.min(...cfg.gear_positions.map((g: { y: number }) => g.y))
                    : 0;
                const nGears = Math.max(1, cfg.gear_positions.length);
                const sitMass = cfg.mass_kg + (cfg.fuel_capacity_kg || 0);
                const safeSpringK = Math.max(GEAR_SPRING_K_MIN_N_PER_M, Number.isFinite(cfg.gear_spring_k) ? cfg.gear_spring_k : 0);
                const staticGearComp = (sitMass * G_ACCEL) / (nGears * safeSpringK);
                const offset = center.negate();
                offset.y = -bb.min.y + (gearMinY + staticGearComp) / scaleFactor;
                root.position = offset;
                root.rotationQuaternion = null;
                root.rotation = BABYLON.Vector3.Zero();

                modelPivot.scaling.setAll(scaleFactor);
                modelPivot.rotation = new BABYLON.Vector3(0, cfg.model_rotation_y, 0);

                const shadow = (this.scene as any)._shadow;
                if (shadow) {
                    meshes.forEach((m: BABYLON.AbstractMesh) => {
                        shadow.addShadowCaster(m, true);
                    });
                }

                try {
                    const caps = scene.getEngine().getCaps();
                    const maxAniso = caps && Number.isFinite(caps.maxAnisotropy) ? caps.maxAnisotropy : 1;
                    const targetAniso = Math.max(1, Math.min(AIRCRAFT_TEXTURE_ANISOTROPY, maxAniso));
                    const seenAnisoTex = new Set<BABYLON.BaseTexture>();
                    meshes.forEach((m: BABYLON.AbstractMesh) => {
                        const mat = m.material as any;
                        if (!mat || typeof mat.getActiveTextures !== 'function') return;
                        for (const tex of mat.getActiveTextures()) {
                            if (tex && !seenAnisoTex.has(tex) && typeof tex.anisotropicFilteringLevel === 'number' && tex.anisotropicFilteringLevel < targetAniso) {
                                seenAnisoTex.add(tex);
                                tex.anisotropicFilteringLevel = targetAniso;
                            }
                        }
                    });
                } catch (anisoErr) {
                    console.warn('[FlightSimple] Aircraft anisotropic filtering set failed:', anisoErr);
                }

                const savedPlaneQuat = this.scene.planeRoot.rotationQuaternion?.clone() || null;
                const savedPlaneRot = this.scene.planeRoot.rotation.clone();
                this.scene.planeRoot.rotationQuaternion = BABYLON.Quaternion.Identity();
                this.scene.planeRoot.rotation = BABYLON.Vector3.Zero();
                this.scene.planeRoot.computeWorldMatrix(true);
                modelPivot.computeWorldMatrix(true);
                root.computeWorldMatrix(true);
                meshes.forEach((m) => m.computeWorldMatrix(true));

                const worldBB = root.getHierarchyBoundingVectors(true);
                const planePos = this.scene.planeRoot.position;
                const localMin = new BABYLON.Vector3(
                    worldBB.min.x - planePos.x,
                    worldBB.min.y - planePos.y,
                    worldBB.min.z - planePos.z,
                );
                const localMax = new BABYLON.Vector3(
                    worldBB.max.x - planePos.x,
                    worldBB.max.y - planePos.y,
                    worldBB.max.z - planePos.z,
                );

                if (savedPlaneQuat) {
                    this.scene.planeRoot.rotationQuaternion = savedPlaneQuat;
                } else {
                    this.scene.planeRoot.rotationQuaternion = null;
                    this.scene.planeRoot.rotation = savedPlaneRot;
                }
                this.scene.planeRoot.computeWorldMatrix(true);
                modelPivot.computeWorldMatrix(true);
                root.computeWorldMatrix(true);
                meshes.forEach((m) => m.computeWorldMatrix(true));

                const localCenter = localMin.add(localMax).scale(0.5);
                const bbW = Math.abs(localMax.x - localMin.x);
                const bbH = Math.abs(localMax.y - localMin.y);
                const bbD = Math.abs(localMax.z - localMin.z);
                const wingYs: number[] = [];
                try {
                    for (const m of meshes) {
                        const nm = (m.name || '').toLowerCase();
                        if (!/wing/.test(nm)) continue;
                        if (/wingtip|wing[._-]?(flap|aileron|spoiler|strut|fence)/.test(nm)) continue;
                        try {
                            const childBB = m.getBoundingInfo().boundingBox;
                            const worldYc = childBB.centerWorld.y;
                            wingYs.push(worldYc - planePos.y);
                        } catch (_) { /* ignore */ }
                    }
                } catch (_) { /* ignore */ }
                let detectedWingY: number | undefined = undefined;
                if (wingYs.length > 0) {
                    detectedWingY = wingYs.reduce((a, b) => a + b, 0) / wingYs.length;
                    console.debug(`[NavLights] ${cfg.code}: detected wing Y from ${wingYs.length} mesh(es) = ${detectedWingY.toFixed(2)}m (bbox center.y=${localCenter.y.toFixed(2)})`);
                } else {
                    console.debug(`[NavLights] ${cfg.code}: no wing meshes named — using bbox heuristic for wing Y`);
                }
                console.debug(`[NavLights] ${cfg.code}: planeRoot-local bbox W=${bbW.toFixed(2)}m H=${bbH.toFixed(2)}m D=${bbD.toFixed(2)}m center=(${localCenter.x.toFixed(2)},${localCenter.y.toFixed(2)},${localCenter.z.toFixed(2)}) rotY=${cfg.model_rotation_y.toFixed(3)}`);
                this.scene._buildNavLights(scene, this.scene.planeRoot, {
                    halfSpan: bbW / 2,
                    height: bbH,
                    halfLen: bbD / 2,
                    center: localCenter,
                    wingY: detectedWingY,
                });
                this.detectControlSurfaceNodes(meshes);
                this.scene._buildContrails(scene, bbW / 2);
                this.scene._buildVaporCone(scene);
                this.scene._buildHeatHaze(scene);

                if (this.scene.camera) {
                    const initialRadius = Math.max(
                        CAMERA_RADIUS_MIN_M,
                        Math.min(CAMERA_RADIUS_MAX_M, bbD * CAMERA_RADIUS_LENGTH_FACTOR),
                    );
                    this.scene.camera.radius = initialRadius;

                    const safeW = Number.isFinite(bbW) && bbW > 0 ? bbW : 0;
                    const safeH = Number.isFinite(bbH) && bbH > 0 ? bbH : 0;
                    const safeD = Number.isFinite(bbD) && bbD > 0 ? bbD : 0;
                    const aircraftMinRadius = Math.max(
                        safeW * CAMERA_LOWER_RADIUS_AIRCRAFT_FACTOR,
                        safeD * CAMERA_LOWER_RADIUS_AIRCRAFT_FACTOR,
                        safeH * CAMERA_LOWER_RADIUS_HEIGHT_FACTOR,
                        CAMERA_LOWER_RADIUS_FALLBACK_M,
                    );
                    this.scene._aircraftMinRadius = aircraftMinRadius;
                    this.scene.camera.lowerRadiusLimit = aircraftMinRadius;
                    if (this.scene.camera.radius < aircraftMinRadius) {
                        this.scene.camera.radius = aircraftMinRadius;
                    }
                    console.debug(`[Camera] Initial radius set to ${initialRadius.toFixed(1)}m, lowerRadiusLimit=${aircraftMinRadius.toFixed(1)}m for ${cfg.code} (W=${safeW.toFixed(1)}m, H=${safeH.toFixed(1)}m, L=${safeD.toFixed(1)}m)`);
                }

                this.scene._lightingSystem.registerAircraftMeshes(meshes);
                this.scene.spawned = true;
                this.scene._maybeFireSpawned();
                console.log(`[FlightSimple] Model loaded: ${cfg.code}, scale: ${scaleFactor.toFixed(2)}, dims: ${bbW.toFixed(1)},${bbH.toFixed(1)},${bbD.toFixed(1)}`);
            },
            null,
            (_scene: BABYLON.Scene, _msg: string, ex?: any) => {
                if (this.scene._disposed || !this.scene.planeRoot) {
                    console.log(`[FlightSimple] Discarding fallback build (${cfg.code}) — scene disposed.`);
                    return;
                }
                if (myVersion !== this.scene._modelLoadVersion) {
                    console.log(`[FlightSimple] Discarding stale fallback build (${cfg.code}) — newer load in progress.`);
                    return;
                }
                console.warn('[FlightSimple] GLB load failed, building fallback', ex);
                this.buildFallbackMesh(scene);
            },
        );
    }

    buildFallbackMesh(scene: BABYLON.Scene): void {
        const mat = new BABYLON.PBRMaterial('planePBR', scene);
        mat.albedoColor = new BABYLON.Color3(0.85, 0.88, 0.92);
        mat.metallic = 0.7;
        mat.roughness = 0.25;

        const body = BABYLON.MeshBuilder.CreateBox('body', { width: 2.2, height: 0.65, depth: 7 }, scene);
        const wing = BABYLON.MeshBuilder.CreateBox('wing', { width: 16, height: 0.22, depth: 2.5 }, scene);
        const tail = BABYLON.MeshBuilder.CreateBox('tail', { width: 6, height: 0.18, depth: 1.8 }, scene);
        tail.position.set(0, 0.4, -3.0);
        const finV = BABYLON.MeshBuilder.CreateBox('finV', { width: 0.18, height: 2.8, depth: 2.0 }, scene);
        finV.position.set(0, 1.4, -3.0);
        const nose = BABYLON.MeshBuilder.CreateCylinder('nose', {
            height: 2.5, diameterTop: 0, diameterBottom: 1.5, tessellation: 8,
        }, scene);
        nose.rotation.x = Math.PI / 2;
        nose.position.set(0, 0, 4.5);

        const fallbackMeshes = [body, wing, tail, finV, nose];
        fallbackMeshes.forEach((m) => {
            m.material = mat;
            m.parent = this.scene.planeRoot;
        });
        this.scene._loadedModelMeshes = fallbackMeshes;
        this.scene._lightingSystem.registerAircraftMeshes(fallbackMeshes);
        this.scene._buildNavLights(scene, this.scene.planeRoot, {
            halfSpan: 8,
            height: 2.8,
            halfLen: 5.5,
        });
        this.scene._buildContrails(scene, 8);
        this.scene._buildVaporCone(scene);
        this.scene._buildHeatHaze(scene);
        this.scene.spawned = true;
        this.scene._maybeFireSpawned();
    }

    detectControlSurfaceNodes(meshes: BABYLON.AbstractMesh[]): void {
        this.scene._surfaceAilLeftNodes = [];
        this.scene._surfaceAilRightNodes = [];
        this.scene._surfaceElevatorNodes = [];
        this.scene._surfaceRudderNodes = [];
        this.scene._surfaceFlapNodes = [];
        const visited = new Set<BABYLON.Node>();
        const candidates: BABYLON.Node[] = [];
        for (const m of meshes) {
            const walk = (n: BABYLON.Node) => {
                if (!n || visited.has(n)) return;
                visited.add(n);
                candidates.push(n);
                const children = n.getChildren ? n.getChildren() : [];
                for (const c of children) walk(c);
            };
            walk(m);
        }
        const rxLeft  = /(\b|_)l(eft)?(\b|_)|port|_l\d|\.l\d|_left/i;
        const rxRight = /(\b|_)r(ight)?(\b|_)|stbd|_r\d|\.r\d|_right/i;
        for (const node of candidates) {
            const name = node.name || '';
            if (/flap/i.test(name)) {
                this.scene._surfaceFlapNodes.push(node as BABYLON.TransformNode);
                continue;
            }
            if (/aileron/i.test(name)) {
                if (rxLeft.test(name)) this.scene._surfaceAilLeftNodes.push(node as BABYLON.TransformNode);
                else if (rxRight.test(name)) this.scene._surfaceAilRightNodes.push(node as BABYLON.TransformNode);
                else this.scene._surfaceAilRightNodes.push(node as BABYLON.TransformNode);
                continue;
            }
            if (/elevator|stab[_\s-]?h|h[_\s-]?stab/i.test(name)) {
                this.scene._surfaceElevatorNodes.push(node as BABYLON.TransformNode);
                continue;
            }
            if (/rudder|stab[_\s-]?v|v[_\s-]?stab/i.test(name)) {
                this.scene._surfaceRudderNodes.push(node as BABYLON.TransformNode);
                continue;
            }
        }
        const total = this.scene._surfaceAilLeftNodes.length + this.scene._surfaceAilRightNodes.length
                    + this.scene._surfaceElevatorNodes.length + this.scene._surfaceRudderNodes.length
                    + this.scene._surfaceFlapNodes.length;
        if (total > 0) {
            console.debug(`[Surfaces] detected ail=${this.scene._surfaceAilLeftNodes.length}+${this.scene._surfaceAilRightNodes.length} elev=${this.scene._surfaceElevatorNodes.length} rud=${this.scene._surfaceRudderNodes.length} flap=${this.scene._surfaceFlapNodes.length}`);
        }
    }

    setNodeRotationX(nodes: BABYLON.TransformNode[], rad: number): void {
        for (const n of nodes) {
            if (!n) continue;
            if (n.rotationQuaternion) {
                n.rotationQuaternion = null;
                n.rotation.set(rad, 0, 0);
            } else {
                n.rotation.x = rad;
            }
        }
    }

    setNodeRotationY(nodes: BABYLON.TransformNode[], rad: number): void {
        for (const n of nodes) {
            if (!n) continue;
            if (n.rotationQuaternion) {
                n.rotationQuaternion = null;
                n.rotation.set(0, rad, 0);
            } else {
                n.rotation.y = rad;
            }
        }
    }

    updateControlSurfaceAnim(): void {
        if (!this.scene.surfaces || this.scene.surfaces.length < 4) return;
        const SURF_MAX_DEFLECT_RAD = 0.35;
        const ailL = (this.scene.surfaces[0]?.controlInput ?? 0) * SURF_MAX_DEFLECT_RAD;
        const ailR = (this.scene.surfaces[1]?.controlInput ?? 0) * SURF_MAX_DEFLECT_RAD;
        const elev = (this.scene.surfaces[2]?.controlInput ?? 0) * SURF_MAX_DEFLECT_RAD;
        const rud  = (this.scene.surfaces[3]?.controlInput ?? 0) * SURF_MAX_DEFLECT_RAD;
        if (this.scene._surfaceAilLeftNodes.length)  this.setNodeRotationX(this.scene._surfaceAilLeftNodes,  ailL);
        if (this.scene._surfaceAilRightNodes.length) this.setNodeRotationX(this.scene._surfaceAilRightNodes, ailR);
        if (this.scene._surfaceElevatorNodes.length) this.setNodeRotationX(this.scene._surfaceElevatorNodes, elev);
        if (this.scene._surfaceRudderNodes.length)   this.setNodeRotationY(this.scene._surfaceRudderNodes,   rud);
        if (this.scene._surfaceFlapNodes.length) {
            const flapRad = (this.scene.currentFlapDeg || 0) * Math.PI / 180;
            this.setNodeRotationX(this.scene._surfaceFlapNodes, flapRad);
        }
    }

    updatePropellerAnim(): void {
        const group = this.scene._propellerAnimGroup;
        if (!group) return;
        const throttle = Math.max(0, Math.min(1, this.scene.thrust));
        if (throttle <= 0.001) {
            if (group.isPlaying) group.pause();
            return;
        }
        const PROP_MIN_SPEED = 0.5;
        const PROP_MAX_SPEED = 6.0;
        const speedRatio = PROP_MIN_SPEED + (PROP_MAX_SPEED - PROP_MIN_SPEED) * throttle;
        group.speedRatio = speedRatio;
        if (!group.isPlaying) {
            group.play(true);
        }
    }
}
