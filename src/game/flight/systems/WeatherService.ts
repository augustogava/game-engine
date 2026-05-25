import type { FlightSceneSimple } from '../../FlightSceneSimple.js';

export interface WeatherSnapshot {
    windSpeedKt: number;
    windDirDeg: number;
    cloudCoverage: number;
    cloudWindOffsetX: number;
    cloudWindOffsetZ: number;
    precipitationIntensity: number;
    fogDensity: number;
    isaDeltaTempK: number;
    altitudeMslFt: number;
}

const FALLBACK_SNAPSHOT: WeatherSnapshot = {
    windSpeedKt: 0,
    windDirDeg: 0,
    cloudCoverage: 0,
    cloudWindOffsetX: 0,
    cloudWindOffsetZ: 0,
    precipitationIntensity: 0,
    fogDensity: 0,
    isaDeltaTempK: 0,
    altitudeMslFt: 0,
};

export class WeatherService {
    private readonly scene: any;

    constructor(scene: FlightSceneSimple) {
        this.scene = scene;
    }

    getSnapshot(altitudeMslFt: number): WeatherSnapshot {
        try {
            const wind = typeof this.scene._getWindAtAltitude === 'function'
                ? this.scene._getWindAtAltitude(altitudeMslFt)
                : { speedKt: 0, dirDeg: 0 };
            const cloudWind = this.scene._cloudWindOffset ?? { x: 0, z: 0 };
            const cloudCoverage = Number.isFinite(this.scene._currentCloudCoverage)
                ? this.scene._currentCloudCoverage
                : 0;
            const precipitation = Number.isFinite(this.scene._precipitationIntensity)
                ? this.scene._precipitationIntensity
                : 0;
            const fogDensity = Number.isFinite(this.scene?.scene?.fogDensity)
                ? this.scene.scene.fogDensity
                : 0;
            const isaDelta = Number.isFinite(this.scene._isaDeltaTempK)
                ? this.scene._isaDeltaTempK
                : 0;
            return {
                windSpeedKt: Number(wind.speedKt) || 0,
                windDirDeg: Number(wind.dirDeg) || 0,
                cloudCoverage,
                cloudWindOffsetX: Number(cloudWind.x) || 0,
                cloudWindOffsetZ: Number(cloudWind.z) || 0,
                precipitationIntensity: precipitation,
                fogDensity,
                isaDeltaTempK: isaDelta,
                altitudeMslFt,
            };
        } catch (err) {
            console.warn('[WeatherService] getSnapshot failed:', err);
            return { ...FALLBACK_SNAPSHOT, altitudeMslFt };
        }
    }
}
