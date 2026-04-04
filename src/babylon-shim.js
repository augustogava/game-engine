/**
 * babylon-shim.js
 *
 * esbuild alias target for `@babylonjs/core`.
 * 3d-tiles-renderer imports named exports from @babylonjs/core.
 * This shim re-exports everything from the window.BABYLON global that the
 * BabylonJS UMD script tag places there.
 */

// Access the global BABYLON object at module evaluation time
// (after the <script src="babylon.js"> tag has run)
const BABYLON = globalThis.BABYLON;

export const {
    AbstractMesh,
    ArcRotateCamera,
    Axis,
    Buffer,
    Camera,
    CascadedShadowGenerator,
    Color3,
    Color4,
    CubeTexture,
    DefaultRenderingPipeline,
    DirectionalLight,
    Engine,
    FollowCamera,
    GeospatialCamera,
    GUID,
    HemisphericLight,
    ImageProcessingConfiguration,
    LensFlare,
    LensFlareSystem,
    Matrix,
    Mesh,
    MeshBuilder,
    MeshoptCompression,
    Nullable,
    PBRMaterial,
    Quaternion,
    Scene,
    SceneLoader,
    ShadowGenerator,
    SSAO2RenderingPipeline,
    StandardMaterial,
    Texture,
    Tools,
    TransformNode,
    Vector2,
    Vector3,
    VertexBuffer,
    VertexData,
} = BABYLON;

// Re-export the full object as default too
export default BABYLON;
