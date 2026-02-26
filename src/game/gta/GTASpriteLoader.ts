/**
 * GTASpriteLoader - Loads and defines all sprite frames for the GTA game.
 * 
 * Coordinates are based on analysis of gta_2.png sprite sheet.
 */
import { SpriteSheet } from '../../engine/sprites/SpriteSheet.js';

export interface GTASprites {
    sheet: SpriteSheet;
}

export const SPRITE_FRAMES = {
    cars: {
        blue: { x: 8, y: 8, w: 56, h: 96 },
        black: { x: 72, y: 8, w: 56, h: 96 },
        red: { x: 136, y: 8, w: 56, h: 96 },
        taxi: { x: 200, y: 8, w: 56, h: 96 },
        parked: { x: 18, y: 115, w: 56, h: 80 }
    },
    pedestrians: {
        womanGreen: { x: 285, y: 30, w: 22, h: 45 },
        womanRed: { x: 285, y: 118, w: 22, h: 45 },
        manGreen: { x: 315, y: 188, w: 22, h: 40 },
        manSuit: { x: 350, y: 188, w: 22, h: 40 },
        deadBody: { x: 345, y: 115, w: 45, h: 60 }
    },
    blood: {
        pool: { x: 372, y: 175, w: 90, h: 80 },
        splatter: { x: 332, y: 30, w: 120, h: 140 }
    },
    buildings: {
        buildingWithCar: { x: 8, y: 108, w: 78, h: 92 },
        brickWall: { x: 88, y: 108, w: 75, h: 92 },
        tallBuilding: { x: 8, y: 205, w: 60, h: 95 },
        brownBuilding: { x: 235, y: 205, w: 70, h: 90 },
        smallHouse: { x: 318, y: 265, w: 75, h: 55 },
        houseYellow: { x: 140, y: 345, w: 88, h: 95 }
    },
    cityObjects: {
        streetLamp: { x: 90, y: 215, w: 30, h: 80 },
        trafficLight: { x: 125, y: 200, w: 40, h: 95 },
        signalLamp: { x: 178, y: 215, w: 30, h: 80 },
        fireHydrant: { x: 410, y: 230, w: 22, h: 35 },
        trashCan: { x: 440, y: 220, w: 32, h: 45 }
    },
    tiles: {
        road: { x: 40, y: 375, w: 70, h: 70 },
        sidewalk: { x: 270, y: 318, w: 80, h: 80 },
        grass: { x: 368, y: 318, w: 90, h: 90 }
    }
} as const;

export function loadGTASprites(): GTASprites {
    const sheet = new SpriteSheet('src/game/assets/gta_2.png');

    for (const [category, frames] of Object.entries(SPRITE_FRAMES)) {
        for (const [name, rect] of Object.entries(frames)) {
            const frameName = `${category}_${name}`;
            sheet.defineFrame(frameName, rect.x, rect.y, rect.w, rect.h);
        }
    }

    return { sheet };
}

export function getCarSprites(): string[] {
    return ['cars_blue', 'cars_black', 'cars_red', 'cars_taxi'];
}

export function getPedestrianSprites(): string[] {
    return ['pedestrians_womanGreen', 'pedestrians_womanRed', 'pedestrians_manGreen', 'pedestrians_manSuit'];
}

export function getBuildingSprites(): string[] {
    return ['buildings_tallBuilding', 'buildings_brownBuilding', 'buildings_smallHouse'];
}

export function getTileSize(): number {
    return 64;
}
