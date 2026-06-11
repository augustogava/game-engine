import * as BABYLON from '@babylonjs/core';
import { TerrainMaterial } from '@babylonjs/materials/terrain/terrainMaterial.js';
import { terrainVertexShader } from '@babylonjs/materials/terrain/terrain.vertex.js';
import '@babylonjs/materials/terrain/terrain.fragment.js';
import {
    AddClipPlaneUniforms,
} from '@babylonjs/core/Materials/clipPlaneMaterialHelper.js';
import {
    HandleFallbacksForShadows,
    PrepareAttributesForBones,
    PrepareAttributesForInstances,
    PrepareDefinesForAttributes,
    PrepareDefinesForFrameBoundValues,
    PrepareDefinesForLights,
    PrepareDefinesForMisc,
    PrepareUniformsAndSamplersList,
} from '@babylonjs/core/Materials/materialHelper.functions.js';
import {
    FAB_TERRAIN_MACRO_SCALE,
    FAB_TERRAIN_MACRO_STRENGTH,
    FAB_TERRAIN_SPLAT_EDGE_LOW,
    FAB_TERRAIN_SPLAT_EDGE_HIGH,
    FAB_TERRAIN_TRIPLANAR_TILE,
} from '../constants/graphicsConstants.js';

const SHADER_NAME = 'fabTerrain';
const glslFloat = (v: number) => v.toFixed(5);

// Fork of @babylonjs/materials terrain pixel shader with three additions:
// - macro variation: low-frequency world-space brightness noise to break tiling
// - splat sharpening: smoothstep on the path/rock mix weights for crisper edges
// - triplanar sampling on the rock channel (FABTRIPLANAR, gated by gfxGroundUltra)
const FAB_TERRAIN_FRAGMENT = `precision highp float;
#define FAB_MACRO_SCALE ${glslFloat(FAB_TERRAIN_MACRO_SCALE)}
#define FAB_MACRO_STRENGTH ${glslFloat(FAB_TERRAIN_MACRO_STRENGTH)}
#define FAB_EDGE_LOW ${glslFloat(FAB_TERRAIN_SPLAT_EDGE_LOW)}
#define FAB_EDGE_HIGH ${glslFloat(FAB_TERRAIN_SPLAT_EDGE_HIGH)}
#define FAB_TP_TILE ${glslFloat(FAB_TERRAIN_TRIPLANAR_TILE)}
uniform vec4 vEyePosition;uniform vec4 vDiffuseColor;
#ifdef SPECULARTERM
uniform vec4 vSpecularColor;
#endif
varying vec3 vPositionW;
#ifdef NORMAL
varying vec3 vNormalW;
#endif
#if defined(VERTEXCOLOR) || defined(INSTANCESCOLOR) && defined(INSTANCES)
varying vec4 vColor;
#endif
#include<helperFunctions>
#include<__decl__lightFragment>[0..maxSimultaneousLights]
#ifdef DIFFUSE
varying vec2 vTextureUV;uniform sampler2D textureSampler;uniform vec2 vTextureInfos;uniform sampler2D diffuse1Sampler;uniform sampler2D diffuse2Sampler;uniform sampler2D diffuse3Sampler;uniform vec2 diffuse1Infos;uniform vec2 diffuse2Infos;uniform vec2 diffuse3Infos;
#endif
#ifdef BUMP
uniform sampler2D bump1Sampler;uniform sampler2D bump2Sampler;uniform sampler2D bump3Sampler;
#endif
#include<lightsFragmentFunctions>
#include<shadowsFragmentFunctions>
#include<clipPlaneFragmentDeclaration>
#ifdef LOGARITHMICDEPTH
#extension GL_EXT_frag_depth : enable
#endif
#include<logDepthDeclaration>
#include<fogFragmentDeclaration>
float fabHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
float fabValueNoise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);vec2 u=f*f*(3.0-2.0*f);return mix(mix(fabHash(i),fabHash(i+vec2(1.0,0.0)),u.x),mix(fabHash(i+vec2(0.0,1.0)),fabHash(i+vec2(1.0,1.0)),u.x),u.y);}
#if defined(FABTRIPLANAR) && defined(NORMAL)
vec3 fabTriplanarWeights(){vec3 w=abs(normalize(vNormalW));w=w*w*w*w;return w/(w.x+w.y+w.z);}
vec4 fabTriplanarSample(sampler2D smp,vec3 w){vec3 p=vPositionW*FAB_TP_TILE;return texture2D(smp,p.zy)*w.x+texture2D(smp,p.xz)*w.y+texture2D(smp,p.xy)*w.z;}
#endif
#ifdef BUMP
#extension GL_OES_standard_derivatives : enable
mat3 cotangent_frame(vec3 normal,vec3 p,vec2 uv)
{vec3 dp1=dFdx(p);vec3 dp2=dFdy(p);vec2 duv1=dFdx(uv);vec2 duv2=dFdy(uv);vec3 dp2perp=cross(dp2,normal);vec3 dp1perp=cross(normal,dp1);vec3 tangent=dp2perp*duv1.x+dp1perp*duv2.x;vec3 binormal=dp2perp*duv1.y+dp1perp*duv2.y;float invmax=inversesqrt(max(dot(tangent,tangent),dot(binormal,binormal)));return mat3(tangent*invmax,binormal*invmax,normal);}
vec3 perturbNormal(vec3 viewDir,vec3 mixColor)
{vec3 bump1Color=texture2D(bump1Sampler,vTextureUV*diffuse1Infos).xyz;vec3 bump2Color=texture2D(bump2Sampler,vTextureUV*diffuse2Infos).xyz;
#if defined(FABTRIPLANAR) && defined(NORMAL)
vec3 bump3Color=fabTriplanarSample(bump3Sampler,fabTriplanarWeights()).xyz;
#else
vec3 bump3Color=texture2D(bump3Sampler,vTextureUV*diffuse3Infos).xyz;
#endif
bump1Color.rgb*=mixColor.r;bump2Color.rgb=mix(bump1Color.rgb,bump2Color.rgb,mixColor.g);vec3 map=mix(bump2Color.rgb,bump3Color.rgb,mixColor.b);map=map*255./127.-128./127.;mat3 TBN=cotangent_frame(vNormalW*vTextureInfos.y,-viewDir,vTextureUV);return normalize(TBN*map);}
#endif
#if defined(CLUSTLIGHT_BATCH) && CLUSTLIGHT_BATCH>0
varying float vViewDepth;
#endif
#define CUSTOM_FRAGMENT_DEFINITIONS
void main(void) {
#define CUSTOM_FRAGMENT_MAIN_BEGIN
#include<clipPlaneFragment>
vec3 viewDirectionW=normalize(vEyePosition.xyz-vPositionW);vec4 baseColor=vec4(1.,1.,1.,1.);vec3 diffuseColor=vDiffuseColor.rgb;
#ifdef SPECULARTERM
float glossiness=vSpecularColor.a;vec3 specularColor=vSpecularColor.rgb;
#else
float glossiness=0.;
#endif
float alpha=vDiffuseColor.a;
#ifdef NORMAL
vec3 normalW=normalize(vNormalW);
#else
vec3 normalW=vec3(1.0,1.0,1.0);
#endif
#ifdef DIFFUSE
baseColor=texture2D(textureSampler,vTextureUV);
baseColor.g=smoothstep(FAB_EDGE_LOW,FAB_EDGE_HIGH,baseColor.g);
baseColor.b=smoothstep(FAB_EDGE_LOW,FAB_EDGE_HIGH,baseColor.b);
#if defined(BUMP) && defined(DIFFUSE)
normalW=perturbNormal(viewDirectionW,baseColor.rgb);
#endif
#ifdef ALPHATEST
if (baseColor.a<0.4)
discard;
#endif
#include<depthPrePass>
baseColor.rgb*=vTextureInfos.y;vec4 diffuse1Color=texture2D(diffuse1Sampler,vTextureUV*diffuse1Infos);vec4 diffuse2Color=texture2D(diffuse2Sampler,vTextureUV*diffuse2Infos);
#if defined(FABTRIPLANAR) && defined(NORMAL)
vec4 diffuse3Color=fabTriplanarSample(diffuse3Sampler,fabTriplanarWeights());
#else
vec4 diffuse3Color=texture2D(diffuse3Sampler,vTextureUV*diffuse3Infos);
#endif
diffuse1Color.rgb*=baseColor.r;diffuse2Color.rgb=mix(diffuse1Color.rgb,diffuse2Color.rgb,baseColor.g);baseColor.rgb=mix(diffuse2Color.rgb,diffuse3Color.rgb,baseColor.b);
float fabMacro=fabValueNoise(vPositionW.xz*FAB_MACRO_SCALE)*0.65+fabValueNoise(vPositionW.xz*FAB_MACRO_SCALE*3.7)*0.35;
baseColor.rgb*=1.0+(fabMacro-0.5)*2.0*FAB_MACRO_STRENGTH;
#endif
#if defined(VERTEXCOLOR) || defined(INSTANCESCOLOR) && defined(INSTANCES)
baseColor.rgb*=vColor.rgb;
#endif
vec3 diffuseBase=vec3(0.,0.,0.);lightingInfo info;float shadow=1.;float aggShadow=0.;float numLights=0.;
#ifdef SPECULARTERM
vec3 specularBase=vec3(0.,0.,0.);
#endif
#include<lightFragment>[0..maxSimultaneousLights]
#if defined(VERTEXALPHA) || defined(INSTANCESCOLOR) && defined(INSTANCES)
alpha*=vColor.a;
#endif
#ifdef SPECULARTERM
vec3 finalSpecular=specularBase*specularColor;
#else
vec3 finalSpecular=vec3(0.0);
#endif
vec3 finalDiffuse=clamp(diffuseBase*diffuseColor*baseColor.rgb,0.0,1.0);vec4 color=vec4(finalDiffuse+finalSpecular,alpha);
#include<logDepthFragment>
#include<fogFragment>
gl_FragColor=color;
#include<imageProcessingCompatibility>
#define CUSTOM_FRAGMENT_MAIN_END
}
`;

if (!BABYLON.ShaderStore.ShadersStore[`${SHADER_NAME}VertexShader`]) {
    BABYLON.ShaderStore.ShadersStore[`${SHADER_NAME}VertexShader`] = terrainVertexShader.shader;
}
if (!BABYLON.ShaderStore.ShadersStore[`${SHADER_NAME}PixelShader`]) {
    BABYLON.ShaderStore.ShadersStore[`${SHADER_NAME}PixelShader`] = FAB_TERRAIN_FRAGMENT;
}

class FabTerrainMaterialDefines extends BABYLON.MaterialDefines {
    public DIFFUSE = false;
    public BUMP = false;
    public FABTRIPLANAR = false;
    public CLIPPLANE = false;
    public CLIPPLANE2 = false;
    public CLIPPLANE3 = false;
    public CLIPPLANE4 = false;
    public CLIPPLANE5 = false;
    public CLIPPLANE6 = false;
    public ALPHATEST = false;
    public DEPTHPREPASS = false;
    public POINTSIZE = false;
    public FOG = false;
    public SPECULARTERM = false;
    public NORMAL = false;
    public UV1 = false;
    public UV2 = false;
    public VERTEXCOLOR = false;
    public VERTEXALPHA = false;
    public NUM_BONE_INFLUENCERS = 0;
    public BonesPerMesh = 0;
    public INSTANCES = false;
    public INSTANCESCOLOR = false;
    public IMAGEPROCESSINGPOSTPROCESS = false;
    public SKIPFINALCOLORCLAMP = false;
    public LOGARITHMICDEPTH = false;
    public AREALIGHTSUPPORTED = true;
    public AREALIGHTNOROUGHTNESS = true;

    constructor() {
        super();
        this.rebuild();
    }
}

/**
 * TerrainMaterial fork that compiles against the vendored `fabTerrain` shaders.
 * Binding is unchanged (no new uniforms: the additions are compile-time
 * constants reading existing varyings), so only effect creation is overridden.
 */
export class FabTerrainMaterial extends TerrainMaterial {
    private _useTriplanarRock = false;

    constructor(name: string, scene: BABYLON.Scene, useTriplanarRock = false) {
        super(name, scene, true);
        this._useTriplanarRock = useTriplanarRock;
    }

    get useTriplanarRock(): boolean {
        return this._useTriplanarRock;
    }

    set useTriplanarRock(value: boolean) {
        if (this._useTriplanarRock === value) return;
        this._useTriplanarRock = value;
        (this as unknown as { _markAllSubMeshesAsTexturesDirty(): void })._markAllSubMeshesAsTexturesDirty();
    }

    override getClassName(): string {
        return 'FabTerrainMaterial';
    }

    // Mirrors TerrainMaterial.isReadyForSubMesh, swapping the shader name and
    // injecting the FABTRIPLANAR define. Internal PushMaterial members are not
    // exposed in typings, hence the localized casts.
    override isReadyForSubMesh(mesh: BABYLON.AbstractMesh, subMesh: BABYLON.SubMesh, useInstances?: boolean): boolean {
        const self = this as unknown as {
            isFrozen: boolean;
            _isReadyForSubMesh(subMesh: BABYLON.SubMesh): boolean;
            _useLogarithmicDepth: boolean;
            _isVertexOutputInvariant: boolean;
            _disableLighting: boolean;
            _maxSimultaneousLights: number;
            _shaderLanguage: number;
            _materialContext: unknown;
        };
        const drawWrapper = (subMesh as unknown as { _drawWrapper: { effect: BABYLON.Effect | null; _wasPreviouslyReady: boolean; _wasPreviouslyUsingInstances: boolean | null } })._drawWrapper;
        if (self.isFrozen) {
            if (drawWrapper.effect && drawWrapper._wasPreviouslyReady && drawWrapper._wasPreviouslyUsingInstances === useInstances) {
                return true;
            }
        }
        if (!subMesh.materialDefines || !(subMesh.materialDefines instanceof FabTerrainMaterialDefines)) {
            subMesh.materialDefines = new FabTerrainMaterialDefines();
        }
        const defines = subMesh.materialDefines as FabTerrainMaterialDefines;
        const scene = this.getScene();
        if (self._isReadyForSubMesh(subMesh)) {
            return true;
        }
        const engine = scene.getEngine();

        if (scene.texturesEnabled) {
            if (!this.mixTexture || !this.mixTexture.isReady()) {
                return false;
            }
            defines._needUVs = true;
            if (BABYLON.MaterialFlags.DiffuseTextureEnabled) {
                if (!this.diffuseTexture1 || !this.diffuseTexture1.isReady()) return false;
                if (!this.diffuseTexture2 || !this.diffuseTexture2.isReady()) return false;
                if (!this.diffuseTexture3 || !this.diffuseTexture3.isReady()) return false;
                defines.DIFFUSE = true;
            }
            if (this.bumpTexture1 && this.bumpTexture2 && this.bumpTexture3 && BABYLON.MaterialFlags.BumpTextureEnabled) {
                if (!this.bumpTexture1.isReady()) return false;
                if (!this.bumpTexture2.isReady()) return false;
                if (!this.bumpTexture3.isReady()) return false;
                defines._needNormals = true;
                defines.BUMP = true;
            }
        }
        if (defines.FABTRIPLANAR !== this._useTriplanarRock) {
            defines.FABTRIPLANAR = this._useTriplanarRock;
            defines.markAsUnprocessed();
        }

        PrepareDefinesForMisc(mesh, scene, self._useLogarithmicDepth, this.pointsCloud, this.fogEnabled, this.needAlphaTestingForMesh(mesh), defines, undefined, undefined, undefined, self._isVertexOutputInvariant);
        defines._needNormals = PrepareDefinesForLights(scene, mesh, defines, false, self._maxSimultaneousLights, self._disableLighting);
        PrepareDefinesForFrameBoundValues(scene, engine, this, defines, useInstances ? true : false);
        PrepareDefinesForAttributes(mesh, defines, true, true);

        if (defines.isDirty) {
            defines.markAsProcessed();
            scene.resetCachedMaterial();

            const fallbacks = new BABYLON.EffectFallbacks();
            if (defines.FOG) {
                fallbacks.addFallback(1, 'FOG');
            }
            HandleFallbacksForShadows(defines, fallbacks, this.maxSimultaneousLights);
            if (defines.NUM_BONE_INFLUENCERS > 0) {
                fallbacks.addCPUSkinningFallback(0, mesh);
            }
            defines.IMAGEPROCESSINGPOSTPROCESS = scene.imageProcessingConfiguration.applyByPostProcess;

            const attribs = [BABYLON.VertexBuffer.PositionKind];
            if (defines.NORMAL) attribs.push(BABYLON.VertexBuffer.NormalKind);
            if (defines.UV1) attribs.push(BABYLON.VertexBuffer.UVKind);
            if (defines.UV2) attribs.push(BABYLON.VertexBuffer.UV2Kind);
            if (defines.VERTEXCOLOR) attribs.push(BABYLON.VertexBuffer.ColorKind);
            PrepareAttributesForBones(attribs, mesh, defines, fallbacks);
            PrepareAttributesForInstances(attribs, defines);

            const join = defines.toString();
            const uniforms = [
                'world', 'view', 'viewProjection', 'vEyePosition', 'vLightsType', 'vDiffuseColor', 'vSpecularColor',
                'vFogInfos', 'vFogColor', 'pointSize', 'vTextureInfos', 'mBones', 'textureMatrix',
                'diffuse1Infos', 'diffuse2Infos', 'diffuse3Infos',
            ];
            const samplers = [
                'textureSampler', 'diffuse1Sampler', 'diffuse2Sampler', 'diffuse3Sampler',
                'bump1Sampler', 'bump2Sampler', 'bump3Sampler',
                'logarithmicDepthConstant', 'areaLightsLTC1Sampler', 'areaLightsLTC2Sampler',
            ];
            const uniformBuffers: string[] = [];
            AddClipPlaneUniforms(uniforms);
            PrepareUniformsAndSamplersList({
                uniformsNames: uniforms,
                uniformBuffersNames: uniformBuffers,
                samplers: samplers,
                defines: defines,
                maxSimultaneousLights: this.maxSimultaneousLights,
                shaderLanguage: self._shaderLanguage,
            } as unknown as Parameters<typeof PrepareUniformsAndSamplersList>[0]);

            subMesh.setEffect(scene.getEngine().createEffect(SHADER_NAME, {
                attributes: attribs,
                uniformsNames: uniforms,
                uniformBuffersNames: uniformBuffers,
                samplers: samplers,
                defines: join,
                fallbacks: fallbacks,
                onCompiled: this.onCompiled,
                onError: this.onError,
                indexParameters: { maxSimultaneousLights: this.maxSimultaneousLights },
                shaderLanguage: self._shaderLanguage,
            }, engine), defines, self._materialContext as never);
        }
        if ((defines as unknown as Record<string, unknown>)['AREALIGHTUSED']) {
            for (let index = 0; index < mesh.lightSources.length; index++) {
                if (!(mesh.lightSources[index] as unknown as { _isReady(): boolean })._isReady()) {
                    return false;
                }
            }
        }
        if (!subMesh.effect || !subMesh.effect.isReady()) {
            return false;
        }
        defines._renderId = scene.getRenderId();
        drawWrapper._wasPreviouslyReady = true;
        drawWrapper._wasPreviouslyUsingInstances = !!useInstances;
        return true;
    }
}
