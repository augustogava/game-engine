/** Top-down camera framing constants. */

import { Tools } from '@babylonjs/core';

/** Horizontal angle (radians). */
export const CAMERA_ALPHA = -Math.PI / 2;

/** Vertical angle from the +Y axis. Small value = near top-down with slight tilt. */
export const CAMERA_BETA = Tools.ToRadians(15);

/** Final multiplier on the computed fit distance (1 = honor the fill fractions exactly). */
export const CAMERA_RADIUS_FACTOR = 1.0;

/** Minimum / maximum camera distance (world units). */
export const CAMERA_RADIUS_MIN = 8;
export const CAMERA_RADIUS_MAX = 140;

/** Field of view (radians). Narrow lens = flat, near-orthographic look like the
 *  reference (tiles at the screen edges do not lean). */
export const CAMERA_FOV = 0.42;

/** Smoothing factor for camera radius/target transitions per second. */
export const CAMERA_LERP_SPEED = 6;
