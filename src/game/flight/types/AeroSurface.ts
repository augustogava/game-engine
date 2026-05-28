import * as BABYLON from '@babylonjs/core';

export interface AeroSurface {
    position:     BABYLON.Vector3;
    normal:       BABYLON.Vector3;
    area:         number;
    chord:        number;
    aspectRatio:  number;
    liftSlope:    number;
    skinFriction: number;
    stallAlpha:   number;
    zeroLiftAoA:  number;
    oswaldE:      number;
    flapFraction: number;
    controlInput: number;
    zeroLiftCm:   number;
}
