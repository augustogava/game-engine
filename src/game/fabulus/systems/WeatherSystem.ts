import * as BABYLON from '@babylonjs/core';
import type { FabulusScene } from '../FabulusScene.js';
import { FabulusPrefs, type WeatherMode } from '../FabulusPrefs.js';
import {
    WEATHER_RAIN_RATE,
    WEATHER_DUST_RATE,
    WEATHER_EMBER_RATE,
    WEATHER_AREA,
} from '../constants/index.js';

const SPAWN_HEIGHT = 22;
const PARTICLE_CAPACITY = 4000;
const PARTICLE_QUALITY_MULT: Record<string, number> = { low: 0.35, medium: 0.65, high: 1 };

export class WeatherSystem {
    private scene: FabulusScene;
    private enabled = false;
    private mode: WeatherMode = 'ambient';
    private rain: BABYLON.ParticleSystem | null = null;
    private dust: BABYLON.ParticleSystem | null = null;
    private ember: BABYLON.ParticleSystem | null = null;
    private emitter: BABYLON.Vector3 = new BABYLON.Vector3(0, SPAWN_HEIGHT, 0);
    private streakTexture: BABYLON.DynamicTexture | null = null;
    private moteTexture: BABYLON.DynamicTexture | null = null;
    private built = false;
    private initialized = false;

    constructor(scene: FabulusScene) {
        this.scene = scene;
    }

    init(): void {
        this.initialized = true;
        if (FabulusPrefs.get().gfxWeather !== true) return;
        this._build();
        this.enabled = true;
        this.setMode(FabulusPrefs.get().weatherMode);
    }

    private _build(): void {
        if (this.built) return;
        const s = this.scene.bScene;
        if (s.isDisposed) return;

        this.streakTexture = this._buildStreakTexture(s);
        this.moteTexture = this._buildMoteTexture(s);

        this.rain = this._buildRain(s);
        this.dust = this._buildDust(s);
        this.ember = this._buildEmber(s);
        this.built = true;
        console.debug('[Fabulus] Weather built');
    }

    private _buildStreakTexture(s: BABYLON.Scene): BABYLON.DynamicTexture {
        const tex = new BABYLON.DynamicTexture('fab_rain_tex', { width: 8, height: 64 }, s, false);
        tex.hasAlpha = true;
        const ctx = tex.getContext() as CanvasRenderingContext2D;
        const grad = ctx.createLinearGradient(0, 0, 0, 64);
        grad.addColorStop(0, 'rgba(180,200,230,0)');
        grad.addColorStop(0.5, 'rgba(190,210,240,0.7)');
        grad.addColorStop(1, 'rgba(180,200,230,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(2, 0, 4, 64);
        tex.update();
        return tex;
    }

    private _buildMoteTexture(s: BABYLON.Scene): BABYLON.DynamicTexture {
        const size = 64;
        const tex = new BABYLON.DynamicTexture('fab_mote_tex', size, s, false);
        tex.hasAlpha = true;
        const ctx = tex.getContext() as CanvasRenderingContext2D;
        const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.5, 'rgba(255,255,255,0.5)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
        tex.update();
        return tex;
    }

    private _buildRain(s: BABYLON.Scene): BABYLON.ParticleSystem {
        const ps = new BABYLON.ParticleSystem('fab_rain', PARTICLE_CAPACITY, s);
        ps.particleTexture = this.streakTexture;
        ps.emitter = this.emitter;
        ps.minEmitBox = new BABYLON.Vector3(-WEATHER_AREA / 2, 0, -WEATHER_AREA / 2);
        ps.maxEmitBox = new BABYLON.Vector3(WEATHER_AREA / 2, 0, WEATHER_AREA / 2);
        ps.color1 = new BABYLON.Color4(0.7, 0.8, 0.95, 0.5);
        ps.color2 = new BABYLON.Color4(0.6, 0.7, 0.9, 0.4);
        ps.colorDead = new BABYLON.Color4(0.5, 0.6, 0.8, 0);
        ps.minSize = 0.06;
        ps.maxSize = 0.12;
        ps.minScaleY = 8;
        ps.maxScaleY = 14;
        ps.minLifeTime = 0.9;
        ps.maxLifeTime = 1.3;
        ps.emitRate = WEATHER_RAIN_RATE * (PARTICLE_QUALITY_MULT[FabulusPrefs.get().gfxParticleQuality] ?? 1);
        ps.gravity = new BABYLON.Vector3(0, -90, 0);
        ps.direction1 = new BABYLON.Vector3(-1.5, -22, -1.5);
        ps.direction2 = new BABYLON.Vector3(1.5, -28, 1.5);
        ps.minEmitPower = 1;
        ps.maxEmitPower = 1;
        ps.updateSpeed = 0.02;
        return ps;
    }

    private _buildDust(s: BABYLON.Scene): BABYLON.ParticleSystem {
        const ps = new BABYLON.ParticleSystem('fab_dust', 600, s);
        ps.particleTexture = this.moteTexture;
        ps.emitter = this.emitter;
        ps.minEmitBox = new BABYLON.Vector3(-WEATHER_AREA / 2, -SPAWN_HEIGHT + 1, -WEATHER_AREA / 2);
        ps.maxEmitBox = new BABYLON.Vector3(WEATHER_AREA / 2, -SPAWN_HEIGHT + 6, WEATHER_AREA / 2);
        ps.color1 = new BABYLON.Color4(0.7, 0.66, 0.55, 0.22);
        ps.color2 = new BABYLON.Color4(0.6, 0.56, 0.46, 0.16);
        ps.colorDead = new BABYLON.Color4(0.5, 0.46, 0.4, 0);
        ps.minSize = 0.05;
        ps.maxSize = 0.18;
        ps.minLifeTime = 4;
        ps.maxLifeTime = 8;
        ps.emitRate = WEATHER_DUST_RATE;
        ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
        ps.gravity = new BABYLON.Vector3(0, 0.2, 0);
        ps.direction1 = new BABYLON.Vector3(-0.6, 0.1, -0.6);
        ps.direction2 = new BABYLON.Vector3(0.6, 0.4, 0.6);
        ps.minEmitPower = 0.2;
        ps.maxEmitPower = 0.6;
        ps.updateSpeed = 0.02;
        return ps;
    }

    private _buildEmber(s: BABYLON.Scene): BABYLON.ParticleSystem {
        const ps = new BABYLON.ParticleSystem('fab_ember', 500, s);
        ps.particleTexture = this.moteTexture;
        ps.emitter = this.emitter;
        ps.minEmitBox = new BABYLON.Vector3(-WEATHER_AREA / 2, -SPAWN_HEIGHT + 1, -WEATHER_AREA / 2);
        ps.maxEmitBox = new BABYLON.Vector3(WEATHER_AREA / 2, -SPAWN_HEIGHT + 8, WEATHER_AREA / 2);
        ps.color1 = new BABYLON.Color4(1.0, 0.6, 0.2, 0.9);
        ps.color2 = new BABYLON.Color4(1.0, 0.35, 0.1, 0.7);
        ps.colorDead = new BABYLON.Color4(0.3, 0.08, 0.02, 0);
        ps.minSize = 0.04;
        ps.maxSize = 0.14;
        ps.minLifeTime = 2.5;
        ps.maxLifeTime = 5;
        ps.emitRate = WEATHER_EMBER_RATE;
        ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_ONEONE;
        ps.gravity = new BABYLON.Vector3(0, 0.8, 0);
        ps.direction1 = new BABYLON.Vector3(-0.7, 0.6, -0.7);
        ps.direction2 = new BABYLON.Vector3(0.7, 1.4, 0.7);
        ps.minEmitPower = 0.3;
        ps.maxEmitPower = 0.9;
        ps.updateSpeed = 0.02;
        return ps;
    }

    setMode(mode: WeatherMode): void {
        this.mode = mode;
        if (!this.enabled) return;
        if (!this.built) this._build();
        const rainOn = mode === 'rain';
        const dustOn = mode === 'dust' || mode === 'ambient';
        const emberOn = mode === 'ember' || mode === 'ambient';
        this._toggle(this.rain, rainOn);
        this._toggle(this.dust, dustOn);
        this._toggle(this.ember, emberOn);

        const weatherSys = this.scene.atmosphereSystem;
        if (weatherSys && typeof weatherSys.setFogBoost === 'function') {
            weatherSys.setFogBoost(mode === 'fog' || mode === 'rain');
        }
    }

    private _toggle(ps: BABYLON.ParticleSystem | null, on: boolean): void {
        if (!ps) return;
        if (on && !ps.isStarted()) ps.start();
        else if (!on && ps.isStarted()) ps.stop();
    }

    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        if (!this.initialized) return;
        if (enabled) {
            this._build();
            this.setMode(FabulusPrefs.get().weatherMode);
        } else {
            this._toggle(this.rain, false);
            this._toggle(this.dust, false);
            this._toggle(this.ember, false);
            const atmo = this.scene.atmosphereSystem;
            if (atmo && typeof atmo.setFogBoost === 'function') atmo.setFogBoost(false);
        }
    }

    update(_dt: number): void {
        if (!this.enabled) return;
        const root = this.scene.playerRoot;
        if (root) {
            this.emitter.x = root.position.x;
            this.emitter.z = root.position.z;
            this.emitter.y = root.position.y + SPAWN_HEIGHT;
        }
    }

    dispose(): void {
        for (const ps of [this.rain, this.dust, this.ember]) {
            try { if (ps) ps.dispose(); } catch { /* disposed */ }
        }
        try { if (this.streakTexture) this.streakTexture.dispose(); } catch { /* disposed */ }
        try { if (this.moteTexture) this.moteTexture.dispose(); } catch { /* disposed */ }
        this.rain = this.dust = this.ember = null;
    }
}
