/** Top-down camera framing constants. */

import { Tools } from '@babylonjs/core';

/** Horizontal angle (radians). */
export const CAMERA_ALPHA = -Math.PI / 2;

/** Vertical angle from the +Y axis. Small value = near top-down with slight tilt. */
export const CAMERA_BETA = Tools.ToRadians(18);

/** Distance multiplier applied to the board's largest dimension to fit it in view. */
export const CAMERA_RADIUS_FACTOR = 0.92;

/** Minimum / maximum camera distance (world units). */
export const CAMERA_RADIUS_MIN = 8;
export const CAMERA_RADIUS_MAX = 80;

/** Field of view (radians). */
export const CAMERA_FOV = 0.7;

/** Smoothing factor for camera radius/target transitions per second. */
export const CAMERA_LERP_SPEED = 6;
