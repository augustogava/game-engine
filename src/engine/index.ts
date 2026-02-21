/**
 * Engine barrel — re-exports all public engine APIs.
 * Import from here to use the engine:
 *   import { GameCore, RigidBody, CircleShape, PhysicsWorld2 } from '../engine/index.js';
 */

// ── Math ─────────────────────────────────────────────────────────────────
export { Vector2 } from './math/Vector2.js';
export { MathUtils } from './math/MathUtils.js';

// ── Commons ───────────────────────────────────────────────────────────────
export { EventEmitter } from './commons/EventEmitter.js';
export { ObjectPool } from './commons/ObjectPool.js';

// ── Input ─────────────────────────────────────────────────────────────────
export { InputManager } from './input/InputManager.js';

// ── Camera ────────────────────────────────────────────────────────────────
export { Camera2D } from './camera/Camera2D.js';

// ── Renderer ──────────────────────────────────────────────────────────────
export { Renderer } from './renderer/Renderer.js';

// ── Scene ─────────────────────────────────────────────────────────────────
export { Scene } from './scene/Scene.js';
export type { SceneContext } from './scene/Scene.js';
export { SceneManager } from './scene/SceneManager.js';

// ── Physics — Simple (for particle systems, galaxy, etc.) ─────────────────
export { PhysicsBody } from './physics/PhysicsBody.js';
export { PhysicsWorld } from './physics/PhysicsWorld.js';
export type { GravityAttractor } from './physics/PhysicsWorld.js';

// ── Physics — Robust (shapes, rotation, collision response) ───────────────
export { Shape } from './physics/Shape.js';
export type { ShapeType, AABB } from './physics/Shape.js';
export { CircleShape, AABBShape, OBBShape, PolygonShape, CapsuleShape } from './physics/Shape.js';
export { RigidBody } from './physics/RigidBody.js';
export type { BodyType, RigidBodyMaterial } from './physics/RigidBody.js';
export { DefaultMaterial } from './physics/RigidBody.js';
export { CollisionDetector } from './physics/CollisionDetector.js';
export type { CollisionManifold, ContactPoint } from './physics/CollisionManifold.js';
export { CollisionResolver } from './physics/CollisionResolver.js';
export type { ResolverConfig } from './physics/CollisionResolver.js';
export { SpatialGrid } from './physics/SpatialGrid.js';
export { PhysicsWorld2 } from './physics/PhysicsWorld2.js';
export type { GravityAttractor2 } from './physics/PhysicsWorld2.js';

// ── GameCore ──────────────────────────────────────────────────────────────
export { GameCore } from './GameCore.js';
export type { GameConfig } from './GameCore.js';

// ── Lighting ──────────────────────────────────────────────────────────────
export { PointLight, DirectionalLight, SpotLight, LightColors, rgbToString, lerpColor } from './lighting/Light.js';
export type { Light, LightBase, LightType, LightColor } from './lighting/Light.js';
export { LightingRenderer } from './lighting/LightingRenderer.js';

// ── Particles ─────────────────────────────────────────────────────────────
export { Particle } from './particles/Particle.js';
export { ParticleEmitter } from './particles/ParticleEmitter.js';
export type { ParticleConfig, EmissionShape } from './particles/ParticleEmitter.js';
export { ParticleEffects } from './particles/ParticleEffects.js';
export type { ParticleEffectName } from './particles/ParticleEffects.js';

// ── Spatial (QuadTree, Barnes-Hut) ────────────────────────────────────────
export { QuadTree } from './spatial/QuadTree.js';
export type { QTBounds, QTPoint } from './spatial/QuadTree.js';


