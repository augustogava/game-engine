import * as BABYLON from '@babylonjs/core';
import type { FlightSceneSimple } from '../../FlightSceneSimple.js';
import { I18n } from '../../I18n.js';
import { InputBindings, type ActionId } from '../../InputBindings.js';
import { UiPreferences } from '../../UiPreferences.js';
import * as CONST from '../constants/index.js';
import { getAirDensity } from '../physics/AeroPhysics.js';
import { positiveConfigValue } from '../types/index.js';
import { InputManager } from '../../../engine/input/InputManager.js';

const {
    CAMERA_MODE_CHASE,
    CAMERA_MODE_FREE,
    CAMERA_MODE_COCKPIT,
    CAMERA_MODE_TOWER,
    CAMERA_MODE_AERIAL,
    MAGNETO_OFF, MAGNETO_LEFT, MAGNETO_RIGHT, MAGNETO_BOTH, MAGNETO_START,
    JOYSTICK_MIN_RADIUS_PX, JOYSTICK_MAX_RADIUS_PX, JOYSTICK_MAX_DEADZONE_NORM,
    JOYSTICK_MIN_EXPO, JOYSTICK_MAX_EXPO,
    TOUCH_ROLL_SENSITIVITY_DEFAULT, TOUCH_ROLL_SENSITIVITY_MIN, TOUCH_ROLL_SENSITIVITY_MAX, TOUCH_ROLL_SENSITIVITY_STEP,
    HAPTIC_MIN_INTERVAL_MS,
    MS_TO_KT,
    ENGINE_TYPE_PISTON, ENGINE_TYPE_TURBOFAN, ENGINE_TYPE_TURBOJET,
    GEAR_STATE_DOWN, GEAR_STATE_UP, GEAR_STATE_RETRACTING, GEAR_STATE_EXTENDING,
    BANK_COMP_MIN_SIN, BANK_COMP_MAX_PITCH, BANK_COMP_PITCH_GAIN,
    CONTROL_Q_REFERENCE_PA,
    G_LIMIT_POSITIVE_DEFAULT, G_LIMIT_NEGATIVE_DEFAULT, G_LIMITER_MARGIN_G,
    PINCH_THROTTLE_PX_TO_DELTA,
    PINCH_ZOOM_PX_TO_RADIUS,
    TWO_FINGER_SWIPE_MIN_PX, TWO_FINGER_DISTANCE_TOLERANCE_RATIO,
    GAMEPAD_THROTTLE_TAKEOVER_DELTA,
} = CONST as any;

const CONTROL_SETTINGS_STORAGE_KEY = 'flight_controls_v1';
const LEGACY_YAW_LEFT_CODE = 'KeyA';
const LEGACY_YAW_RIGHT_CODE = 'KeyD';
const TOUCH_RUDDER_INPUT = 1;
const TOUCH_PITCH_GAIN = 0.7;
const TOUCH_ROLL_GAIN_DEFAULT = 0.18;
const KEY_ROLL_MAGNITUDE_DEFAULT = 0.55;
const TOUCH_TRIM_PITCH_STEP = 0.005;
const TOUCH_TRIM_PITCH_LIMIT = 0.15;
const TOUCH_TRIM_YAW_STEP = 0.005;
const TOUCH_TRIM_YAW_LIMIT = 0.1;
const TOUCH_TRIM_CLICK_HZ = 2200;
const SPOILER_LONG_PRESS_MS = 500;
const TOUCH_WIDGET_SELECTOR = [
    '#preflight', '#touch-throttle', '#touch-flap-btns', '#touch-rudder', '#ap-panel',
    '#missions-btn', '#aircraft-btn', '#flight-plans-btn', '#logbook-btn', '#efb-btn',
    '#achievements-btn', '#leaderboard-btn',
    '#missions-panel', '#aircraft-panel', '#flight-plans-panel', '#logbook-panel', '#efb-panel',
    '#achievements-panel', '#leaderboard-panel',
    '#touch-controls-btn', '#touch-controls-panel', '#touch-more-btn', '#touch-more-panel', '#touch-settings-btn', '#gps-zoom-controls',
    '#instrument-dock', '#pfd-btn', '#pfd-panel', '#nav-info', '#debug-ui', '#dbg-panel',
    '#tutorial-overlay .tut-card',
].join(',');

export class InputSystem {
    private readonly scene: any;
    private _touchCanvas: HTMLCanvasElement | null = null;
    private _touchStartHandler: ((e: TouchEvent) => void) | null = null;
    private _touchMoveHandler: ((e: TouchEvent) => void) | null = null;
    private _touchEndHandler: ((e: TouchEvent) => void) | null = null;
    private _touchCancelHandler: ((e: TouchEvent) => void) | null = null;
    private _gamepadThrottleBaseline: number | null = null;
    private _gamepadOwnsThrottle = false;
    private _hardwareInputSeen = false;
    private _touchReverseHeld = false;
    private _smokeKeyLock = false;
    private _hardwareKeyHandler: ((e: KeyboardEvent) => void) | null = null;

    constructor(scene: FlightSceneSimple) {
        this.scene = scene;
    }

    private touchRollSensitivity(): number {
        const value = Number(this.scene._controlSettings?.rollSensitivity);
        if (!Number.isFinite(value)) return TOUCH_ROLL_SENSITIVITY_DEFAULT;
        return Math.max(TOUCH_ROLL_SENSITIVITY_MIN, Math.min(TOUCH_ROLL_SENSITIVITY_MAX, value));
    }

    private installHardwareKeyboardDetection(): void {
        if (this._hardwareKeyHandler) return;
        const handler = (e: KeyboardEvent) => {
            if (this._hardwareInputSeen) return;
            if (InputManager.isEditableTarget(e.target)) return;
            if (!e.code || !InputBindings.boundCodes().includes(e.code)) return;
            this._hardwareInputSeen = true;
            console.debug(`[InputSystem] Hardware keyboard detected on a touch device (code=${e.code}); keyboard input enabled`);
        };
        this._hardwareKeyHandler = handler;
        window.addEventListener('keydown', handler);
    }

    dispose(): void {
        if (this._hardwareKeyHandler) {
            window.removeEventListener('keydown', this._hardwareKeyHandler);
            this._hardwareKeyHandler = null;
        }
        try {
            if (this._touchCanvas) {
                if (this._touchStartHandler) this._touchCanvas.removeEventListener('touchstart', this._touchStartHandler);
                if (this._touchMoveHandler) this._touchCanvas.removeEventListener('touchmove', this._touchMoveHandler);
                if (this._touchEndHandler) this._touchCanvas.removeEventListener('touchend', this._touchEndHandler);
                if (this._touchCancelHandler) this._touchCanvas.removeEventListener('touchcancel', this._touchCancelHandler);
            }
        } catch (err) {
            console.warn('[InputSystem] touch listener removal failed:', err);
        }
        this._touchCanvas = null;
        this._touchStartHandler = null;
        this._touchMoveHandler = null;
        this._touchEndHandler = null;
        this._touchCancelHandler = null;
    }

    cockpitClick(freqHz?: number): void {
        try {
            this.scene._flightAudio.playClick(freqHz);
        } catch (_) { /* ignore */ }
    }

    togglePause(): void {
        this.scene._paused = !this.scene._paused;
        this.scene._showHudWarningOverlay(I18n.t('hud.paused'), this.scene._paused);
        console.log(`[Pause] ${this.scene._paused ? 'paused' : 'resumed'} timeScale=${this.scene._timeScale.toFixed(2)}`);
        this.scene._cockpitClick();
    }

    applyMissionStartThrottle(): void {
        if (this.scene._activeMissionId == null) return;
        if (this.scene._pendingApproachSpawn === true) {
            console.debug('[Mission] Spawn throttle kept at approach power for Flight School lesson');
            return;
        }
        if (this.scene._activeTrainingOrder != null && this.scene._pendingMissionAirborne !== true) {
            this.scene.thrust = 0;
            this.scene.touchThrust = 0;
            this.refreshTouchThrottleVisual();
            console.debug(`[FlightSchool] Lesson ${this.scene._activeTrainingOrder} ground spawn: throttle kept at idle for student takeoff`);
            return;
        }
        const ab = this.scene.aircraftConfig?.afterburner_thrust_mult;
        const abMax = Number.isFinite(ab) && ab > 1 ? ab : 1;
        const missionThrust = 0.9 * abMax;
        this.scene.thrust = missionThrust;
        this.scene.touchThrust = missionThrust;
        this.refreshTouchThrottleVisual();
        console.debug(`[Mission] Spawn throttle set to 90% (thrust=${missionThrust.toFixed(2)}, abMax=${abMax})`);
    }

    refreshTouchThrottleVisual(): void {
        if (!this.scene.isMobile) return;
        try {
            const fill = document.getElementById('touch-thr-fill');
            const knob = document.getElementById('touch-thr-knob');
            const ab = this.scene.aircraftConfig?.afterburner_thrust_mult;
            const abMax = Number.isFinite(ab) && ab > 1 ? ab : 1;
            const pct = Math.min(100, (this.scene.touchThrust / abMax) * 100);
            if (fill) fill.style.height = `${pct}%`;
            if (knob) knob.style.bottom = `${pct}%`;
        } catch (err) {
            console.warn('[InputSystem] refreshTouchThrottleVisual failed:', err);
        }
    }

    adjustTimeScale(direction: number): void {
        const steps = [0.25, 0.5, 1.0, 2.0, 4.0, 8.0];
        let idx = steps.findIndex((s) => Math.abs(s - this.scene._timeScale) < 1e-3);
        if (idx < 0) idx = 2;
        idx = Math.max(0, Math.min(steps.length - 1, idx + (direction > 0 ? 1 : -1)));
        this.scene._timeScale = steps[idx];
        UiPreferences.set({ pauseTimeScale: this.scene._timeScale });
        console.log(`[TimeScale] ${this.scene._timeScale.toFixed(2)}x`);
        this.scene._cockpitClick(2400);
    }

    toggleMouseYoke(): void {
        const next = !this.scene._mouseYokeActive;
        UiPreferences.set({ mouseYoke: next });
        this.scene._setMouseYoke(next);
    }

    setMouseYoke(active: boolean): void {
        this.scene._mouseYokeActive = active;
        const canvas = this.scene.scene?.getEngine?.()?.getRenderingCanvas?.();
        if (!canvas) return;
        if (active) {
            if (!this.scene._mouseYokeMoveHandler) {
                this.scene._mouseYokeMoveHandler = (ev: MouseEvent) => {
                    if (!this.scene._mouseYokeActive) return;
                    const rect = (canvas as HTMLCanvasElement).getBoundingClientRect();
                    if (document.pointerLockElement === canvas) {
                        this.scene._mouseYokeAileron  = Math.max(-1, Math.min(1, this.scene._mouseYokeAileron  + ev.movementX * 0.005));
                        this.scene._mouseYokeElevator = Math.max(-1, Math.min(1, this.scene._mouseYokeElevator + ev.movementY * 0.005));
                    } else {
                        const cx = ev.clientX - rect.left;
                        const cy = ev.clientY - rect.top;
                        const nx = (cx / rect.width) * 2 - 1;
                        const ny = (cy / rect.height) * 2 - 1;
                        this.scene._mouseYokeAileron = Math.max(-1, Math.min(1, nx));
                        this.scene._mouseYokeElevator = Math.max(-1, Math.min(1, ny));
                    }
                };
                canvas.addEventListener('mousemove', this.scene._mouseYokeMoveHandler);
            }
            console.log('[MouseYoke] Enabled');
            this.scene._cockpitClick();
        } else {
            this.scene._mouseYokeAileron = 0;
            this.scene._mouseYokeElevator = 0;
            if (this.scene._mouseYokeMoveHandler) {
                canvas.removeEventListener('mousemove', this.scene._mouseYokeMoveHandler);
                this.scene._mouseYokeMoveHandler = null;
            }
            try { document.exitPointerLock?.(); } catch (_) { /* ignore */ }
            console.log('[MouseYoke] Disabled');
        }
    }

    toggleReplay(): void {
        if (this.scene._crashed) return;
        if (this.scene._replayActive) {
            this.scene._replayActive = false;
            this.scene._replayBuffer.stopPlayback();
            this.scene._restoreReplaySnapshot();
            console.log('[Replay] Stopped by user');
            return;
        }
        if (!this.scene._replayBuffer.hasReplay()) {
            console.warn('[Replay] No data to play');
            this.scene._showToast(I18n.t('replay.empty'));
            return;
        }
        this.scene._captureReplaySnapshot();
        const ok = this.scene._replayBuffer.startPlayback(1.0);
        if (ok) {
            this.scene._replayActive = true;
            this.scene._showToast(I18n.t('replay.playing'));
            console.log('[Replay] Started');
        } else {
            this.scene._replaySnapshot = null;
        }
    }

    initF12Screenshot(): void {
        if (this.scene._f12KeydownHandler) return;
        const handler = (ev: KeyboardEvent) => {
            const screenshotCode = InputBindings.codeFor('screenshot');
            if (ev.code === screenshotCode) {
                ev.preventDefault();
                if (!this.scene._screenshotKeyLock) {
                    this.scene._screenshotKeyLock = true;
                    this.scene._takeScreenshot();
                    this.safeSetTimeout(() => { this.scene._screenshotKeyLock = false; }, 500);
                }
            }
        };
        this.scene._f12KeydownHandler = handler;
        window.addEventListener('keydown', handler, true);
    }

    installGamepadListeners(): void {
        this.scene._gamepad.onConnect((id: string) => {
            console.log(`[Gamepad] Connected: ${id}`);
            this.scene._showToast(I18n.t('gamepad.connected'));
        });
        this.scene._gamepad.onDisconnect(() => {
            console.log('[Gamepad] Disconnected');
            this.scene._showToast(I18n.t('gamepad.disconnected'));
        });
    }

    isHardwareInputActive(): boolean {
        return !this.scene.isMobile || this._hardwareInputSeen;
    }

    private handlePauseKey(p: (code: string) => boolean, gamepadPressed: boolean): void {
        const pauseCode = InputBindings.codeFor('pauseToggle');
        if ((p(pauseCode) && !this.scene._pauseKeyLock) || gamepadPressed) {
            this.scene._pauseKeyLock = true;
            this.scene._togglePause();
        }
        if (!p(pauseCode)) this.scene._pauseKeyLock = false;
    }

    private handleReplayKey(p: (code: string) => boolean): void {
        const replayCode = InputBindings.codeFor('replayToggle');
        if (p(replayCode) && !this.scene._replayKeyLock) {
            this.scene._replayKeyLock = true;
            this.scene._toggleReplay();
        }
        if (!p(replayCode)) this.scene._replayKeyLock = false;
    }

    private handleCameraKey(p: (code: string) => boolean, gamepadPressed: boolean): void {
        const camCode = InputBindings.codeFor('cameraCycle');
        if ((p(camCode) && !this.scene._cameraModeKeyLock) || gamepadPressed) {
            this.scene._cameraModeKeyLock = true;
            this.scene._cycleCameraMode();
            this.scene._cockpitClick();
        }
        if (!p(camCode)) this.scene._cameraModeKeyLock = false;
    }

    private handleSuspendedInput(): void {
        const gamepadEnabled = UiPreferences.peek().gamepadEnabled === true;
        const gpEdges = gamepadEnabled ? this.scene._gamepad.readEdges() : null;
        const hardwareActive = this.isHardwareInputActive();
        const p = (code: string) => hardwareActive && this.scene.input.isKeyDown(code);
        this.handlePauseKey(p, gpEdges?.pause === true);
        this.handleReplayKey(p);
        this.handleCameraKey(p, gpEdges?.camera === true);
    }

    handleInput(_dt: number): void {
        if (this.scene._paused === true || this.scene._replayActive === true) {
            this.handleSuspendedInput();
            return;
        }

        let targetPitch = 0;
        let targetRoll = 0;
        let targetYaw = 0;
        let keyThrottleMoved = false;
        let keyReverseHeld = false;

        const LATERAL_SMOOTHING_RATE = this.scene.isMobile ? 0.9 : 1.2;
        const LATERAL_RETURN_RATE    = this.scene.isMobile ? 0.7 : 0.9;
        const cfgSmoothing = this.scene.aircraftConfig.control_smoothing_rate;
        const cfgReturnRate = positiveConfigValue(this.scene.aircraftConfig.control_return_rate);
        const cfgRollSmoothing = positiveConfigValue(this.scene.aircraftConfig.control_roll_smoothing_rate);
        const cfgRollMagnitude = positiveConfigValue(this.scene.aircraftConfig.control_roll_input_magnitude);
        const PITCH_SMOOTHING_RATE = (cfgSmoothing != null && cfgSmoothing > 0)
            ? cfgSmoothing
            : LATERAL_SMOOTHING_RATE;
        const PITCH_RETURN_RATE    = cfgReturnRate ?? ((cfgSmoothing != null && cfgSmoothing > 0)
            ? cfgSmoothing * 0.35
            : LATERAL_RETURN_RATE);
        const ROLL_SMOOTHING_RATE = cfgRollSmoothing ?? LATERAL_SMOOTHING_RATE;
        const ROLL_RETURN_RATE    = cfgReturnRate ?? LATERAL_RETURN_RATE;
        const cfgInputMag = this.scene.aircraftConfig.control_input_magnitude;
        const KEY_PITCH_MAGNITUDE = (cfgInputMag != null && cfgInputMag > 0) ? cfgInputMag : 0.75;
        const KEY_ROLL_MAGNITUDE  = cfgRollMagnitude ?? KEY_ROLL_MAGNITUDE_DEFAULT;
        const KEY_YAW_MAGNITUDE   = 0.65;
        const TOUCH_ROLL_MAGNITUDE = cfgRollMagnitude ?? TOUCH_ROLL_GAIN_DEFAULT;

        const prefs = UiPreferences.peek();
        const bind = (action: ActionId): string => InputBindings.codeFor(action);
        const gpDeadzone = Math.max(0, Math.min(0.4, prefs.desktopDeadzone));
        const gpExpo = Math.max(1, Math.min(4, prefs.desktopExpo));
        const gpSens = Math.max(0.3, Math.min(3, prefs.desktopSensitivity));
        const gpAxes = prefs.gamepadEnabled ? this.scene._gamepad.read(gpDeadzone, gpExpo, gpSens) : { aileron: 0, elevator: 0, rudder: 0, throttle: 0, connected: false };
        this.scene._gamepadAxes = gpAxes;
        const gpEdges = prefs.gamepadEnabled ? this.scene._gamepad.readEdges() : { gear: false, brake: false, flapDown: false, flapUp: false, camera: false, respawn: false, pause: false };

        if (this.scene.isMobile && gpAxes.connected && !this._hardwareInputSeen) {
            this._hardwareInputSeen = true;
            console.debug('[InputSystem] Gamepad detected on a touch device; keyboard and gamepad input enabled');
        }
        const hardwareInputActive = this.isHardwareInputActive();

        if (hardwareInputActive) {
            const p = (code: string) => this.scene.input.isKeyDown(code);

            const keyThrottleUp = p(bind('throttleUp'));
            const keyThrottleDown = p(bind('throttleDown'));
            keyThrottleMoved = keyThrottleUp || keyThrottleDown;
            if (keyThrottleUp) this.scene.thrust = Math.min(this.scene.aircraftConfig.afterburner_thrust_mult ?? 1.0, this.scene.thrust + _dt * this.scene.aircraftConfig.throttle_up_rate);
            if (keyThrottleDown) this.scene.thrust = Math.max(0, this.scene.thrust - _dt * this.scene.aircraftConfig.throttle_down_rate);
            if ((keyThrottleUp || keyThrottleDown) && this._gamepadOwnsThrottle) {
                this._gamepadOwnsThrottle = false;
                this._gamepadThrottleBaseline = gpAxes.connected ? gpAxes.throttle : null;
                console.debug('[Gamepad] Throttle control returned to keyboard');
            }

            const applyAxisShape = (raw: number): number => {
                const dz = gpDeadzone;
                const a = Math.abs(raw);
                if (a < dz) return 0;
                const sign = raw < 0 ? -1 : 1;
                const norm = (a - dz) / Math.max(0.0001, 1 - dz);
                return sign * Math.pow(Math.max(0, Math.min(1, norm)), gpExpo) * gpSens;
            };
            const keyPitchRaw = (p(bind('pitchDown')) ? -1 : p(bind('pitchUp')) ? 1 : 0);
            const keyRollRaw  = (p(bind('rollRight')) ? -1 : p(bind('rollLeft')) ? 1 : 0);
            const boundCodes = InputBindings.boundCodes();
            const altYawLeft = !boundCodes.includes(LEGACY_YAW_LEFT_CODE) && p(LEGACY_YAW_LEFT_CODE);
            const altYawRight = !boundCodes.includes(LEGACY_YAW_RIGHT_CODE) && p(LEGACY_YAW_RIGHT_CODE);
            const keyYawRaw   = ((p(bind('yawLeft')) || altYawLeft) ? 1 : (p(bind('yawRight')) || altYawRight) ? -1 : 0);
            targetPitch = applyAxisShape(keyPitchRaw) * KEY_PITCH_MAGNITUDE;
            targetRoll  = applyAxisShape(keyRollRaw)  * KEY_ROLL_MAGNITUDE;
            targetYaw   = applyAxisShape(keyYawRaw)   * KEY_YAW_MAGNITUDE;

            if (gpAxes.connected) {
                if (Math.abs(gpAxes.elevator) > 0.001) targetPitch = -gpAxes.elevator * KEY_PITCH_MAGNITUDE;
                if (Math.abs(gpAxes.aileron)  > 0.001) targetRoll  = -gpAxes.aileron  * KEY_ROLL_MAGNITUDE;
                if (Math.abs(gpAxes.rudder)   > 0.001) targetYaw   =  gpAxes.rudder   * KEY_YAW_MAGNITUDE;
                if (this._gamepadThrottleBaseline === null) {
                    this._gamepadThrottleBaseline = gpAxes.throttle;
                } else if (!this._gamepadOwnsThrottle && Math.abs(gpAxes.throttle - this._gamepadThrottleBaseline) > GAMEPAD_THROTTLE_TAKEOVER_DELTA) {
                    this._gamepadOwnsThrottle = true;
                    console.debug(`[Gamepad] Throttle axis moved (${this._gamepadThrottleBaseline.toFixed(2)} -> ${gpAxes.throttle.toFixed(2)}); gamepad now controls throttle`);
                }
                if (this._gamepadOwnsThrottle && !this.scene._autopilotAtHold) {
                    this.scene.thrust = Math.max(0, Math.min(this.scene.aircraftConfig.afterburner_thrust_mult ?? 1.0, gpAxes.throttle * (this.scene.aircraftConfig.afterburner_thrust_mult ?? 1.0)));
                }
            } else if (this._gamepadThrottleBaseline !== null || this._gamepadOwnsThrottle) {
                this._gamepadThrottleBaseline = null;
                this._gamepadOwnsThrottle = false;
            }

            if (this.scene._mouseYokeActive) {
                targetPitch = this.scene._mouseYokeElevator * KEY_PITCH_MAGNITUDE;
                targetRoll  = this.scene._mouseYokeAileron  * KEY_ROLL_MAGNITUDE;
            }

            const flapDnCode = bind('flapDown');
            if (p(flapDnCode) && !this.scene.flapKeyLock5) {
                this.scene.flapKeyLock5 = true;
                this.scene.flapIndex = Math.max(0, this.scene.flapIndex - 1);
                this.scene._cockpitClick();
            }
            if (!p(flapDnCode)) this.scene.flapKeyLock5 = false;

            const flapUpCode = bind('flapUp');
            if (p(flapUpCode) && !this.scene.flapKeyLock6) {
                this.scene.flapKeyLock6 = true;
                this.scene.flapIndex = Math.min(this.scene.FLAP_STEPS.length - 1, this.scene.flapIndex + 1);
                this.scene._cockpitClick();
            }
            if (!p(flapUpCode)) this.scene.flapKeyLock6 = false;
            if (gpEdges.flapDown) this.scene.flapIndex = Math.max(0, this.scene.flapIndex - 1);
            if (gpEdges.flapUp)   this.scene.flapIndex = Math.min(this.scene.FLAP_STEPS.length - 1, this.scene.flapIndex + 1);

            const respawnCode = bind('respawn');
            if ((p(respawnCode) && !this.scene._respawnKeyLock) || gpEdges.respawn) {
                this.scene._respawnKeyLock = true;
                this.scene._spawnPlane();
            }
            if (!p(respawnCode)) this.scene._respawnKeyLock = false;

            const brakeCode = bind('brakeToggle');
            if ((p(brakeCode) && !this.scene.brakeKeyLock) || gpEdges.brake) {
                this.scene.brakeKeyLock = true;
                this.scene.brakesOn = !this.scene.brakesOn;
                if (this.scene._autobrakeActive) {
                    this.scene._autobrakeActive = false;
                    console.debug('[Autobrake] Disarmed: manual brake input');
                }
                this.scene._cockpitClick();
            }
            if (!p(brakeCode)) this.scene.brakeKeyLock = false;

            keyReverseHeld = p(bind('reverseThrust'));
            const autobrakeCode = bind('autobrakeCycle');
            if (p(autobrakeCode) && !this.scene._autobrakeKeyLock) {
                this.scene._autobrakeKeyLock = true;
                this.scene._cycleAutobrake();
                this.scene._cockpitClick();
            }
            if (!p(autobrakeCode)) this.scene._autobrakeKeyLock = false;

            this.handleCameraKey(p, gpEdges.camera === true);

            if (p(bind('landingLights')) && !this.scene._landingKeyLock) {
                this.scene._landingKeyLock = true;
                this.scene._landingLightsOn = !this.scene._landingLightsOn;
                this.scene._cockpitClick();
            }
            if (!p(bind('landingLights'))) this.scene._landingKeyLock = false;

            if (p(bind('autopilotMaster')) && !this.scene._apKeyLockMaster) {
                this.scene._apKeyLockMaster = true;
                this.scene._engageAutopilotMaster();
                this.scene._cockpitClick();
            }
            if (!p(bind('autopilotMaster'))) this.scene._apKeyLockMaster = false;
            if (p(bind('autopilotHeading')) && !this.scene._apKeyLockHdg) {
                this.scene._apKeyLockHdg = true;
                this.scene._engageAutopilotHdgHold();
                this.scene._cockpitClick();
            }
            if (!p(bind('autopilotHeading'))) this.scene._apKeyLockHdg = false;
            if (p(bind('autopilotAltitude')) && !this.scene._apKeyLockAlt) {
                this.scene._apKeyLockAlt = true;
                this.scene._engageAutopilotAltHold();
                this.scene._cockpitClick();
            }
            if (!p(bind('autopilotAltitude'))) this.scene._apKeyLockAlt = false;
            if (p(bind('autopilotVerticalSpeed')) && !this.scene._apKeyLockVs) {
                this.scene._apKeyLockVs = true;
                this.scene._engageAutopilotVsHold();
                this.scene._cockpitClick();
            }
            if (!p(bind('autopilotVerticalSpeed'))) this.scene._apKeyLockVs = false;
            if (p(bind('autopilotNav')) && !this.scene._apKeyLockNav) {
                this.scene._apKeyLockNav = true;
                this.scene._engageAutopilotNavHold();
                this.scene._cockpitClick();
            }
            if (!p(bind('autopilotNav'))) this.scene._apKeyLockNav = false;
            if (p(bind('autopilotApproach')) && !this.scene._apKeyLockApr) {
                this.scene._apKeyLockApr = true;
                this.scene._engageAutopilotAprHold();
                this.scene._cockpitClick();
            }
            if (!p(bind('autopilotApproach'))) this.scene._apKeyLockApr = false;

            if (p(bind('spoilersToggle')) && !this.scene._spoilerKeyLock) {
                this.scene._spoilerKeyLock = true;
                if (p('ShiftLeft') || p('ShiftRight')) this.scene._armGroundSpoilers();
                else this.scene._toggleSpoilers();
                this.scene._cockpitClick();
            }
            if (!p(bind('spoilersToggle'))) this.scene._spoilerKeyLock = false;

            for (let i = 0; i < 4; i++) {
                const code = `Digit${i + 1}`;
                if (boundCodes.includes(code)) continue;
                if (p(code) && !this.scene._killEngineKeyLock[i]) {
                    this.scene._killEngineKeyLock[i] = true;
                    this.scene._killEngine(i);
                    this.scene._cockpitClick();
                }
                if (!p(code)) this.scene._killEngineKeyLock[i] = false;
            }

            if (p('PageUp') && !this.scene._trimKeyLockPgUp) {
                this.scene._trimKeyLockPgUp = true;
                this.scene.trimPitch = Math.min(0.15, this.scene.trimPitch + 0.01);
                this.scene._cockpitClick(2200);
            }
            if (!p('PageUp')) this.scene._trimKeyLockPgUp = false;
            if (p('PageDown') && !this.scene._trimKeyLockPgDn) {
                this.scene._trimKeyLockPgDn = true;
                this.scene.trimPitch = Math.max(-0.15, this.scene.trimPitch - 0.01);
                this.scene._cockpitClick(2200);
            }
            if (!p('PageDown')) this.scene._trimKeyLockPgDn = false;

            const gearRetractable = this.scene.aircraftConfig.gear_retractable === true;
            const gearCode = bind('gearToggle');
            if (gearRetractable && ((p(gearCode) && !this.scene.gearKeyLockG) || gpEdges.gear)) {
                this.scene.gearKeyLockG = true;
                this.scene._toggleGear();
                this.scene._cockpitClick();
            }
            if (!p(gearCode)) this.scene.gearKeyLockG = false;

            const trimPDownCode = bind('trimPitchDown');
            if (p(trimPDownCode) && !this.scene.trimKeyLock7) { this.scene.trimKeyLock7 = true; this.scene.trimPitch = Math.max(-0.15, this.scene.trimPitch - 0.005); this.scene._cockpitClick(2200); }
            if (!p(trimPDownCode)) this.scene.trimKeyLock7 = false;
            const trimPUpCode = bind('trimPitchUp');
            if (p(trimPUpCode) && !this.scene.trimKeyLock8) { this.scene.trimKeyLock8 = true; this.scene.trimPitch = Math.min(0.15, this.scene.trimPitch + 0.005); this.scene._cockpitClick(2200); }
            if (!p(trimPUpCode)) this.scene.trimKeyLock8 = false;
            const trimYLeftCode = bind('trimYawLeft');
            if (p(trimYLeftCode) && !this.scene.trimKeyLock9) { this.scene.trimKeyLock9 = true; this.scene.trimYaw = Math.max(-0.1, this.scene.trimYaw - 0.005); this.scene._cockpitClick(2200); }
            if (!p(trimYLeftCode)) this.scene.trimKeyLock9 = false;
            const trimYRightCode = bind('trimYawRight');
            if (p(trimYRightCode) && !this.scene.trimKeyLock0) { this.scene.trimKeyLock0 = true; this.scene.trimYaw = Math.min(0.1, this.scene.trimYaw + 0.005); this.scene._cockpitClick(2200); }
            if (!p(trimYRightCode)) this.scene.trimKeyLock0 = false;

            if (this.scene.aircraftConfig.engine_type === ENGINE_TYPE_PISTON) {
                const mixUpCode = bind('mixtureUp');
                if (p(mixUpCode) && !this.scene.mixtureKeyLockPlus) { this.scene.mixtureKeyLockPlus = true; this.scene.mixtureLevel = Math.min(1.0, this.scene.mixtureLevel + 0.05); this.scene._cockpitClick(); }
                if (!p(mixUpCode)) this.scene.mixtureKeyLockPlus = false;
                const mixDnCode = bind('mixtureDown');
                if (p(mixDnCode) && !this.scene.mixtureKeyLockMinus) { this.scene.mixtureKeyLockMinus = true; this.scene.mixtureLevel = Math.max(0, this.scene.mixtureLevel - 0.05); this.scene._cockpitClick(); }
                if (!p(mixDnCode)) this.scene.mixtureKeyLockMinus = false;

                const magCode = bind('magnetoCycle');
                if (p(magCode) && !this.scene.magnetoKeyLockN) {
                    this.scene.magnetoKeyLockN = true;
                    this.scene.magnetoSwitch = (this.scene.magnetoSwitch + 1) % 4;
                    this.scene._cockpitClick();
                }
                if (!p(magCode)) this.scene.magnetoKeyLockN = false;
            }

            this.handlePauseKey(p, gpEdges.pause === true);

            const tsUpCode = bind('timeScaleUp');
            if (p(tsUpCode) && !this.scene._timeScaleUpKeyLock) {
                this.scene._timeScaleUpKeyLock = true;
                this.scene._adjustTimeScale(+1);
            }
            if (!p(tsUpCode)) this.scene._timeScaleUpKeyLock = false;
            const tsDnCode = bind('timeScaleDown');
            if (p(tsDnCode) && !this.scene._timeScaleDownKeyLock) {
                this.scene._timeScaleDownKeyLock = true;
                this.scene._adjustTimeScale(-1);
            }
            if (!p(tsDnCode)) this.scene._timeScaleDownKeyLock = false;

            const easyCode = bind('easyModeToggle');
            if (p(easyCode) && !this.scene._easyModeKeyLock) {
                this.scene._easyModeKeyLock = true;
                UiPreferences.set({ easyMode: !UiPreferences.get().easyMode });
            }
            if (!p(easyCode)) this.scene._easyModeKeyLock = false;

            const yokeCode = bind('mouseYokeToggle');
            if (p(yokeCode) && !this.scene._mouseYokeKeyLock) {
                this.scene._mouseYokeKeyLock = true;
                this.scene._toggleMouseYoke();
            }
            if (!p(yokeCode)) this.scene._mouseYokeKeyLock = false;

            const towerCode = bind('towerCamera');
            if (p(towerCode) && !this.scene._towerCamKeyLock) {
                this.scene._towerCamKeyLock = true;
                this.scene._setCameraMode(CAMERA_MODE_TOWER);
                this.scene._captureTowerCameraPosition();
                this.scene._cockpitClick();
            }
            if (!p(towerCode)) this.scene._towerCamKeyLock = false;

            this.handleReplayKey(p);

            const smokeCode = bind('smokeToggle');
            if (p(smokeCode) && !this._smokeKeyLock) {
                this._smokeKeyLock = true;
                const smokeOn = this.scene._toggleSmoke() === true;
                document.getElementById('touch-smk')?.classList.toggle('active', smokeOn);
            }
            if (!p(smokeCode)) this._smokeKeyLock = false;

            const atCode = bind('autothrottleToggle');
            if (p(atCode) && !this.scene._autothrottleKeyLock) {
                this.scene._autothrottleKeyLock = true;
                this.scene._toggleAutothrottle();
            }
            if (!p(atCode)) this.scene._autothrottleKeyLock = false;
        }

        this.scene._reverseThrustRequested = keyReverseHeld || this._touchReverseHeld;

        if (this.scene.isMobile) {
            const touchYaw = Math.max(-1, Math.min(1, Number(this.scene.touchYawInput) || 0)) * KEY_YAW_MAGNITUDE;
            if (!hardwareInputActive || this.scene.joystickTouchId !== null) {
                targetPitch = this.scene.touchPitchInput * TOUCH_PITCH_GAIN;
                targetRoll = this.scene.touchRollInput * TOUCH_ROLL_MAGNITUDE * this.touchRollSensitivity();
            }
            if (!hardwareInputActive || touchYaw !== 0) targetYaw = touchYaw;
            if (hardwareInputActive && (keyThrottleMoved || this._gamepadOwnsThrottle)) {
                this.scene.touchThrust = this.scene.thrust;
                this.refreshTouchThrottleVisual();
            } else {
                this.scene.thrust = this.scene.touchThrust;
            }
        }

        if (this.scene._easyModeAssistEnabled()) {
            const stabilization = this.scene._easyModeStabilization();
            targetPitch += stabilization.pitch;
            targetRoll  += stabilization.roll;
            targetPitch = Math.max(-1, Math.min(1, targetPitch));
            targetRoll  = Math.max(-1, Math.min(1, targetRoll));
            this.scene._easyModeAutoThrottle(_dt);
        }

        const lerpAxis = (current: number, target: number, smoothRate: number, retRate: number): number => {
            const rate = (Math.abs(target) < Math.abs(current)) ? retRate : smoothRate;
            const t = 1 - Math.exp(-rate * _dt);
            return current + (target - current) * t;
        };

        if (this.scene._cinematicActive) {
            targetPitch = 0;
            targetRoll = 0;
            targetYaw = 0;
        }

        if (this.scene.isOnGround) {
            targetRoll = 0;
        }

        this.scene.smoothedPitch = lerpAxis(this.scene.smoothedPitch, targetPitch, PITCH_SMOOTHING_RATE, PITCH_RETURN_RATE);
        this.scene.smoothedRoll  = lerpAxis(this.scene.smoothedRoll, targetRoll, ROLL_SMOOTHING_RATE, ROLL_RETURN_RATE);
        this.scene.smoothedYaw   = lerpAxis(this.scene.smoothedYaw, targetYaw, LATERAL_SMOOTHING_RATE, LATERAL_RETURN_RATE);

        this.scene.surfaces[0].controlInput =  this.scene.smoothedRoll;
        this.scene.surfaces[1].controlInput = -this.scene.smoothedRoll;
        this.scene.surfaces[2].controlInput = -this.scene.smoothedPitch;
        this.scene.surfaces[3].controlInput = -this.scene.smoothedYaw;

        if (!this.scene.isOnGround && this.scene.surfaces[2] && this.scene.planeRoot && this.scene.planeRoot.rotationQuaternion) {
            BABYLON.Matrix.FromQuaternionToRef(this.scene.planeRoot.rotationQuaternion, this.scene._tmpRotMatrix);
            BABYLON.Vector3.TransformNormalToRef(new BABYLON.Vector3(1, 0, 0), this.scene._tmpRotMatrix, this.scene._tmpRight);
            const sinBank = Math.max(-1, Math.min(1, this.scene._tmpRight.y));
            const absSinBank = Math.abs(sinBank);
            if (absSinBank > BANK_COMP_MIN_SIN) {
                const cosBank = Math.sqrt(Math.max(0.001, 1 - sinBank * sinBank));
                const loadComp = (1.0 / cosBank) - 1.0;
                const pitchBias = Math.min(BANK_COMP_MAX_PITCH, loadComp * BANK_COMP_PITCH_GAIN);
                this.scene.surfaces[2].controlInput -= pitchBias;
            }
        }

        if (!this.scene.isOnGround && this.scene.planeRoot) {
            if (this.scene._failures?.hydraulicFailed === true && this.scene.surfaces.length >= 4) {
                const hydraulicLossScale = 0.3;
                this.scene.surfaces[0].controlInput *= hydraulicLossScale;
                this.scene.surfaces[1].controlInput *= hydraulicLossScale;
                this.scene.surfaces[2].controlInput *= hydraulicLossScale;
                this.scene.surfaces[3].controlInput *= hydraulicLossScale;
            }

            if (this.scene._gLimiterEnabled === true && this.scene.surfaces.length >= 3) {
                const cfgGPos = this.scene.aircraftConfig.g_limit_positive;
                const cfgGNeg = this.scene.aircraftConfig.g_limit_negative;
                const gPos = (cfgGPos != null && Number.isFinite(cfgGPos) && cfgGPos > 0)
                    ? cfgGPos
                    : G_LIMIT_POSITIVE_DEFAULT;
                const gNegRaw = (cfgGNeg != null && Number.isFinite(cfgGNeg) && cfgGNeg < 0)
                    ? cfgGNeg
                    : G_LIMIT_NEGATIVE_DEFAULT;
                const gNeg = gNegRaw;
                const margin = Math.max(0.01, G_LIMITER_MARGIN_G);
                const nz = Number.isFinite(this.scene._gForceVertical) ? this.scene._gForceVertical : 1;
                const pitchInput = this.scene.surfaces[2].controlInput;
                if (pitchInput < 0) {
                    const headroom = gPos - nz;
                    if (headroom < margin) {
                        const scale = Math.max(0, headroom / margin);
                        this.scene.surfaces[2].controlInput *= scale;
                    }
                } else if (pitchInput > 0) {
                    const headroomNeg = nz - gNeg;
                    if (headroomNeg < margin) {
                        const scale = Math.max(0, headroomNeg / margin);
                        this.scene.surfaces[2].controlInput *= scale;
                    }
                }
            }
        }

        // Trim tabs: bias the zeroLiftAoA on the relevant surfaces
        if (this.scene.surfaces.length >= 4) {
            this.scene.surfaces[2].zeroLiftAoA = (this.scene.aircraftConfig.surfaces[2]?.zero_lift_aoa ?? 0) + this.scene.trimPitch;
            this.scene.surfaces[3].zeroLiftAoA = (this.scene.aircraftConfig.surfaces[3]?.zero_lift_aoa ?? 0) + this.scene.trimYaw;
        }

        this.scene._maybeDisengageAutopilotByInput();
        this.scene._updateAutopilot(_dt);

        if (!this.scene.isOnGround && this.scene.planeRoot && this.scene.surfaces.length >= 4) {
            const speedSqForQ = this.scene.velocity.lengthSquared();
            if (speedSqForQ > 1) {
                const altitudeForQ = (this.scene.refAlt ?? 0) + this.scene.planeRoot.position.y;
                const airDensityForQ = getAirDensity(altitudeForQ, this.scene._isaDeltaTempK);
                const dynamicPressureForQ = 0.5 * airDensityForQ * speedSqForQ;
                const qRefForQ = (this.scene.aircraftConfig.control_q_reference_pa != null && this.scene.aircraftConfig.control_q_reference_pa > 0)
                    ? this.scene.aircraftConfig.control_q_reference_pa
                    : CONTROL_Q_REFERENCE_PA;
                if (dynamicPressureForQ > qRefForQ) {
                    const qScale = Math.sqrt(qRefForQ / dynamicPressureForQ);
                    this.scene.surfaces[0].controlInput *= qScale;
                    this.scene.surfaces[1].controlInput *= qScale;
                    this.scene.surfaces[2].controlInput *= qScale;
                    this.scene.surfaces[3].controlInput *= qScale;
                }
            }
        }

        this.scene._applyFlaps(_dt);
        this.scene._applySpoilers(_dt, this.scene.isOnGround);
    }

    setupTouchControls(): void {
        this.scene._loadControlSettings();
        this.installHardwareKeyboardDetection();

        const overlay = document.createElement('div');
        overlay.id = 'touch-overlay';
        overlay.innerHTML = `
<style>
#touch-overlay{position:fixed;inset:0;pointer-events:none;z-index:150;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
#touch-joy{position:absolute;width:120px;height:120px;border-radius:50%;border:none;background:none;display:none;pointer-events:none}
#touch-joy-deadzone{position:absolute;top:50%;left:50%;border-radius:50%;border:2px dashed rgba(80,255,160,.0);pointer-events:none;transition:border-color .12s}
#touch-joy-knob{position:absolute;top:50%;left:50%;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:rgba(0,255,128,.25);border:1px solid rgba(0,255,128,.15)}
#touch-throttle{position:absolute;bottom:calc(160px + var(--safe-bottom));left:calc(10px + var(--safe-left));width:40px;height:150px;border-radius:20px;border:2px solid rgba(80,255,160,.35);background:rgba(0,20,15,.3);pointer-events:auto;touch-action:none}
#touch-thr-fill{position:absolute;bottom:0;left:0;right:0;height:70%;background:linear-gradient(0deg,rgba(0,255,128,.35),rgba(0,255,128,.1));border-radius:0 0 20px 20px}
#touch-thr-knob{position:absolute;left:50%;transform:translateX(-50%);width:36px;height:12px;border-radius:6px;background:rgba(0,255,128,.5);border:1px solid rgba(0,255,128,.7)}
#touch-flap-btns{position:absolute;bottom:calc(318px + var(--safe-bottom));left:calc(6px + var(--safe-left));display:grid;grid-template-columns:repeat(3,44px);grid-auto-rows:33px;gap:4px;pointer-events:auto}
#touch-flap-btns button{width:44px;height:33px;padding:0;border-radius:5px;border:1px solid rgba(80,255,160,.22);background:rgba(0,20,15,.32);color:rgba(125,249,200,.78);font-family:'Orbitron',monospace;font-size:9px;letter-spacing:.04em;cursor:pointer;touch-action:manipulation;transition:transform .1s,background .1s,border-color .1s;backdrop-filter:blur(2px)}
#touch-flap-btns button:active{transform:scale(.92);background:rgba(0,40,25,.55);border-color:rgba(80,255,160,.45)}
#touch-brk.active{background:rgba(255,40,40,.32);border-color:rgba(255,80,80,.5);color:#ff6060}
#touch-spl.active{background:rgba(80,255,160,.32);border-color:rgba(80,255,160,.6);color:#80ffa0}
#touch-spl.armed{background:rgba(255,204,0,.28);border-color:rgba(255,204,0,.6);color:#ffcc55}
#touch-lgt.active{background:rgba(255,240,160,.32);border-color:rgba(255,240,160,.6);color:#fff080}
#touch-gear.up{color:#bbbbbb;border-color:rgba(180,180,180,.32)}
#touch-gear.down{color:rgba(125,249,200,.85);border-color:rgba(80,255,160,.32)}
#touch-gear.transit{color:#ffcc00;border-color:rgba(255,204,0,.45)}
#touch-rudder{position:absolute;bottom:calc(150px + var(--safe-bottom));right:calc(12px + var(--safe-right));display:flex;gap:6px;pointer-events:auto}
#touch-rudder button{width:56px;height:44px;padding:0;border-radius:8px;border:1px solid rgba(80,255,160,.22);background:rgba(0,20,15,.32);color:rgba(125,249,200,.78);font-family:'Orbitron',monospace;font-size:11px;letter-spacing:.04em;cursor:pointer;touch-action:none;backdrop-filter:blur(2px);transition:transform .1s,background .1s,border-color .1s}
#touch-rudder button.active{transform:scale(.94);background:rgba(0,60,35,.6);border-color:rgba(80,255,160,.55);color:#80ffa0}
#touch-controls-btn,#touch-more-btn,#touch-settings-btn{position:absolute;right:calc(14px + var(--safe-right));width:32px;height:32px;padding:0;border-radius:6px;border:1px solid rgba(80,255,160,.32);background:rgba(0,20,15,.45);color:rgba(125,249,200,.85);font-family:'Orbitron',monospace;font-size:11px;cursor:pointer;pointer-events:auto;touch-action:manipulation}
#touch-controls-panel,#touch-more-panel{display:none;position:absolute;right:calc(56px + var(--safe-right));width:240px;overflow-y:auto;padding:10px 12px;border-radius:8px;border:1px solid rgba(80,255,160,.32);background:rgba(2,10,20,.92);color:#fff;font-family:'Inter',sans-serif;font-size:11px;pointer-events:auto;backdrop-filter:blur(8px);box-shadow:0 8px 32px rgba(0,0,0,.6)}
#touch-controls-panel label{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
#touch-controls-panel input[type=range]{width:120px}
@media(max-width:768px){
#touch-controls-btn{top:calc(326px + var(--safe-top))!important;right:calc(10px + var(--safe-right))!important}
#touch-more-btn{top:calc(364px + var(--safe-top))!important;right:calc(10px + var(--safe-right))!important}
#touch-settings-btn{display:block!important;top:calc(402px + var(--safe-top))!important;right:calc(10px + var(--safe-right))!important}
#touch-controls-panel{top:calc(324px + var(--safe-top))!important;right:calc(50px + var(--safe-right))!important;max-height:calc(100dvh - 336px - var(--safe-top))!important}
#touch-more-panel{top:calc(362px + var(--safe-top))!important;right:calc(50px + var(--safe-right))!important;max-height:calc(100dvh - 374px - var(--safe-top))!important}
}
@media(max-width:480px){
#touch-controls-btn{top:calc(278px + var(--safe-top))!important;right:calc(6px + var(--safe-right))!important;width:28px!important;height:28px!important}
#touch-more-btn{top:calc(312px + var(--safe-top))!important;right:calc(6px + var(--safe-right))!important;width:28px!important;height:28px!important}
#touch-settings-btn{top:calc(346px + var(--safe-top))!important;right:calc(6px + var(--safe-right))!important;width:28px!important;height:28px!important}
#touch-controls-panel{top:calc(276px + var(--safe-top))!important;right:calc(40px + var(--safe-right))!important;width:200px!important;max-height:calc(100dvh - 288px - var(--safe-top))!important}
#touch-more-panel{top:calc(310px + var(--safe-top))!important;right:calc(40px + var(--safe-right))!important;width:210px!important;max-height:calc(100dvh - 322px - var(--safe-top))!important}
#touch-rudder{bottom:calc(140px + var(--safe-bottom))!important;right:calc(8px + var(--safe-right))!important}
#touch-rudder button{width:48px!important;height:44px!important}
}
#touch-controls-btn{top:calc(372px + var(--safe-top));font-size:9px}
#touch-more-btn{top:calc(408px + var(--safe-top));font-size:16px}
#touch-settings-btn{display:none;top:calc(444px + var(--safe-top));font-size:14px}
#touch-controls-panel{top:calc(370px + var(--safe-top));max-height:calc(100dvh - 382px - var(--safe-top))}
#touch-more-panel{top:calc(406px + var(--safe-top));max-height:calc(100dvh - 418px - var(--safe-top))}
#touch-more-panel .touch-more-row{display:flex;gap:6px;margin-bottom:6px}
#touch-more-panel .touch-more-row button{flex:1;min-height:44px;padding:0 6px;border-radius:6px;border:1px solid rgba(80,255,160,.3);background:rgba(0,20,15,.5);color:#7df9c8;font-family:'Orbitron',monospace;font-size:10px;letter-spacing:.06em;cursor:pointer;touch-action:manipulation}
#touch-more-panel .touch-more-row button.active{background:rgba(0,60,35,.7);border-color:rgba(80,255,160,.6);color:#80ffa0}
#touch-more-panel .touch-more-row span{flex:1.4;align-self:center;font-size:10px;color:rgba(255,255,255,.75)}
#touch-smk.active{background:rgba(255,255,255,.28);border-color:rgba(255,255,255,.6);color:#fff}
@media(min-height:720px){
#touch-flap-btns{bottom:calc(340px + var(--safe-bottom));grid-auto-rows:44px}
#touch-flap-btns button{height:44px;font-size:10px}
}
</style>
<div id="touch-joy"><div id="touch-joy-deadzone"></div><div id="touch-joy-knob"></div></div>
<div id="touch-throttle"><div id="touch-thr-fill"></div><div id="touch-thr-knob"></div></div>
<div id="touch-flap-btns"><button id="touch-flap-up">F+</button><button id="touch-flap-dn">F\u2212</button><button id="touch-gear" class="down" title="Trem de pouso">GR\u25BC</button><button id="touch-brk">BRK</button><button id="touch-spl" title="Spoilers (toque longo: arma)">SPL</button><button id="touch-lgt" title="Luzes de pouso">LGT</button><button id="touch-smk" title="${I18n.t('touch.smoke')}">SMK</button><button id="touch-cam" title="Trocar c\u00E2mera">CAM</button><button id="touch-pause" title="${I18n.t('touch.pause')}">\u275A\u275A</button></div>
<div id="touch-rudder"><button id="touch-rud-l" title="Leme esquerda">\u25C0 RUD</button><button id="touch-rud-r" title="Leme direita">RUD \u25B6</button></div>
<button id="touch-controls-btn" title="Controles">CTL</button>
<button id="touch-more-btn" title="${I18n.t('touch.more')}">+</button>
<button id="touch-settings-btn" title="${I18n.t('touch.settings')}">\u2699</button>
<div id="touch-controls-panel">
  <div style="font-family:'Orbitron',monospace;font-size:10px;color:#40ffaa;letter-spacing:.12em;margin-bottom:8px;border-bottom:1px solid rgba(80,255,160,.15);padding-bottom:4px">CONTROLES</div>
  <label>Raio<input id="ctl-radius" type="range" min="${JOYSTICK_MIN_RADIUS_PX}" max="${JOYSTICK_MAX_RADIUS_PX}" step="5"><span id="ctl-radius-v">\u2014</span></label>
  <label>Zona morta<input id="ctl-deadzone" type="range" min="0" max="${JOYSTICK_MAX_DEADZONE_NORM}" step="0.01"><span id="ctl-deadzone-v">\u2014</span></label>
  <label>Curva (expo)<input id="ctl-expo" type="range" min="${JOYSTICK_MIN_EXPO}" max="${JOYSTICK_MAX_EXPO}" step="0.1"><span id="ctl-expo-v">\u2014</span></label>
  <label>Inverter pitch<input id="ctl-invert" type="checkbox"></label>
  <label>${I18n.t('touch.rollSensitivity')}<input id="ctl-roll-sens" type="range" min="${TOUCH_ROLL_SENSITIVITY_MIN}" max="${TOUCH_ROLL_SENSITIVITY_MAX}" step="${TOUCH_ROLL_SENSITIVITY_STEP}"><span id="ctl-roll-sens-v">\u2014</span></label>
  <button id="ctl-open-settings" style="margin-top:8px;width:100%;background:rgba(64,255,170,.16);border:1px solid rgba(80,255,160,.4);color:#7df9c8;padding:8px;border-radius:6px;font-family:'Orbitron',monospace;font-size:10px;letter-spacing:.08em;cursor:pointer;touch-action:manipulation">CONFIGURA\u00C7\u00D5ES \u2699</button>
  <button id="ctl-open-tutorial" style="margin-top:6px;width:100%;background:rgba(0,20,15,.5);border:1px solid rgba(80,255,160,.3);color:#7df9c8;padding:8px;border-radius:6px;font-family:'Orbitron',monospace;font-size:10px;letter-spacing:.08em;cursor:pointer;touch-action:manipulation">${I18n.t('settings.tutorial').toUpperCase()}</button>
</div>
<div id="touch-more-panel">
  <div style="font-family:'Orbitron',monospace;font-size:10px;color:#40ffaa;letter-spacing:.12em;margin-bottom:8px;border-bottom:1px solid rgba(80,255,160,.15);padding-bottom:4px">${I18n.t('touch.more.title')}</div>
  <div class="touch-more-row"><span>${I18n.t('touch.more.trimPitch')}</span><button id="more-trim-pitch-dn">\u25BC</button><button id="more-trim-pitch-up">\u25B2</button></div>
  <div class="touch-more-row"><span>${I18n.t('touch.more.trimYaw')}</span><button id="more-trim-yaw-l">\u25C0</button><button id="more-trim-yaw-r">\u25B6</button></div>
  <div class="touch-more-row"><span>${I18n.t('touch.more.timeScale')}</span><button id="more-time-dn">\u2212</button><button id="more-time-up">+</button></div>
  <div class="touch-more-row"><button id="more-reverse">${I18n.t('touch.more.reverse')}</button><button id="more-autobrake">AUTOBRAKE</button></div>
  <div class="touch-more-row"><button id="more-replay">REPLAY</button><button id="more-chat">CHAT</button></div>
  <div class="touch-more-row"><button id="more-respawn">${I18n.t('touch.more.respawn')}</button></div>
</div>`;
        document.body.appendChild(overlay);

        const joyEl = document.getElementById('touch-joy')!;
        const knob = document.getElementById('touch-joy-knob')!;
        const dzEl = document.getElementById('touch-joy-deadzone')!;
        const throttleEl = document.getElementById('touch-throttle')!;
        const thrFill = document.getElementById('touch-thr-fill')!;
        const thrKnob = document.getElementById('touch-thr-knob')!;
        const ctlBtn = document.getElementById('touch-controls-btn');
        const ctlPanel = document.getElementById('touch-controls-panel');
        const ctlRadius = document.getElementById('ctl-radius') as HTMLInputElement | null;
        const ctlDz = document.getElementById('ctl-deadzone') as HTMLInputElement | null;
        const ctlExpo = document.getElementById('ctl-expo') as HTMLInputElement | null;
        const ctlInvert = document.getElementById('ctl-invert') as HTMLInputElement | null;
        const ctlRadiusV = document.getElementById('ctl-radius-v');
        const ctlDzV = document.getElementById('ctl-deadzone-v');
        const ctlExpoV = document.getElementById('ctl-expo-v');
        const ctlRollSens = document.getElementById('ctl-roll-sens') as HTMLInputElement | null;
        const ctlRollSensV = document.getElementById('ctl-roll-sens-v');
        const moreBtn = document.getElementById('touch-more-btn');
        const morePanel = document.getElementById('touch-more-panel');
        const settingsBtn = document.getElementById('touch-settings-btn');
        const closeTouchPanels = () => {
            if (ctlPanel) ctlPanel.style.display = 'none';
            if (morePanel) morePanel.style.display = 'none';
        };
        const toggleTouchPanel = (panel: HTMLElement) => {
            const opening = panel.style.display === 'none' || !panel.style.display;
            closeTouchPanels();
            if (opening) panel.style.display = 'block';
        };

        const updateDeadzoneVisual = () => {
            const radius = this.scene._controlSettings.radius;
            const dz = this.scene._controlSettings.deadzone;
            const dzPx = 2 * dz * radius;
            joyEl.style.width = `${radius * 1.5}px`;
            joyEl.style.height = `${radius * 1.5}px`;
            dzEl.style.width = `${dzPx}px`;
            dzEl.style.height = `${dzPx}px`;
            dzEl.style.marginLeft = `-${dzPx / 2}px`;
            dzEl.style.marginTop = `-${dzPx / 2}px`;
        };

        const refreshCtlInputs = () => {
            if (ctlRadius) ctlRadius.value = String(this.scene._controlSettings.radius);
            if (ctlDz) ctlDz.value = String(this.scene._controlSettings.deadzone);
            if (ctlExpo) ctlExpo.value = String(this.scene._controlSettings.expo);
            if (ctlInvert) ctlInvert.checked = this.scene._controlSettings.pitchInvert;
            if (ctlRadiusV) ctlRadiusV.textContent = `${this.scene._controlSettings.radius}px`;
            if (ctlDzV) ctlDzV.textContent = `${(this.scene._controlSettings.deadzone * 100).toFixed(0)}%`;
            if (ctlExpoV) ctlExpoV.textContent = this.scene._controlSettings.expo.toFixed(1);
            if (ctlRollSens) ctlRollSens.value = String(this.touchRollSensitivity());
            if (ctlRollSensV) ctlRollSensV.textContent = `${this.touchRollSensitivity().toFixed(1)}x`;
        };
        refreshCtlInputs();
        updateDeadzoneVisual();

        if (ctlBtn && ctlPanel) {
            ctlBtn.addEventListener('click', () => toggleTouchPanel(ctlPanel));
        }
        if (moreBtn && morePanel) {
            moreBtn.addEventListener('click', () => toggleTouchPanel(morePanel));
        } else {
            console.warn('[Touch] More-controls button or panel not found');
        }
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
                const dbgUi = document.getElementById('debug-ui');
                if (!dbgUi) {
                    console.warn('[InputSystem] Settings panel not found');
                    return;
                }
                closeTouchPanels();
                dbgUi.classList.remove('minimized');
            });
        } else {
            console.warn('[Touch] #touch-settings-btn element not found');
        }
        const ctlOpenSettings = document.getElementById('ctl-open-settings');
        if (ctlOpenSettings) {
            ctlOpenSettings.addEventListener('click', () => {
                const dbgUi = document.getElementById('debug-ui');
                if (!dbgUi) {
                    console.warn('[InputSystem] Settings panel not found');
                    return;
                }
                dbgUi.classList.remove('minimized');
                if (ctlPanel) ctlPanel.style.display = 'none';
            });
        }
        const ctlOpenTutorial = document.getElementById('ctl-open-tutorial');
        if (ctlOpenTutorial) {
            ctlOpenTutorial.addEventListener('click', () => {
                if (ctlPanel) ctlPanel.style.display = 'none';
                if (typeof this.scene._startTutorial === 'function') this.scene._startTutorial();
                else console.warn('[InputSystem] Tutorial system unavailable');
            });
        }
        const onCtlChange = () => {
            if (ctlRadius) this.scene._controlSettings.radius = Math.max(JOYSTICK_MIN_RADIUS_PX, Math.min(JOYSTICK_MAX_RADIUS_PX, Number(ctlRadius.value)));
            if (ctlDz) this.scene._controlSettings.deadzone = Math.max(0, Math.min(JOYSTICK_MAX_DEADZONE_NORM, Number(ctlDz.value)));
            if (ctlExpo) this.scene._controlSettings.expo = Math.max(JOYSTICK_MIN_EXPO, Math.min(JOYSTICK_MAX_EXPO, Number(ctlExpo.value)));
            if (ctlInvert) this.scene._controlSettings.pitchInvert = ctlInvert.checked;
            if (ctlRollSens) {
                const rollSensitivity = Number(ctlRollSens.value);
                this.scene._controlSettings.rollSensitivity = Number.isFinite(rollSensitivity)
                    ? Math.max(TOUCH_ROLL_SENSITIVITY_MIN, Math.min(TOUCH_ROLL_SENSITIVITY_MAX, rollSensitivity))
                    : TOUCH_ROLL_SENSITIVITY_DEFAULT;
            }
            this.scene._persistControlSettings();
            refreshCtlInputs();
            updateDeadzoneVisual();
        };
        ctlRollSens?.addEventListener('input', onCtlChange);
        ctlRadius?.addEventListener('input', onCtlChange);
        ctlDz?.addEventListener('input', onCtlChange);
        ctlExpo?.addEventListener('input', onCtlChange);
        ctlInvert?.addEventListener('change', onCtlChange);

        const getAbMax = (): number => {
            const ab = this.scene.aircraftConfig?.afterburner_thrust_mult;
            return Number.isFinite(ab) && ab > 1 ? ab : 1;
        };
        const updateThrVisual = () => {
            const abMax = getAbMax();
            const pct = (this.scene.touchThrust / abMax) * 100;
            thrFill.style.height = `${Math.min(100, pct)}%`;
            thrKnob.style.bottom = `${Math.min(100, pct)}%`;
        };
        updateThrVisual();

        const isOnWidget = (t: Touch): boolean => {
            const el = document.elementFromPoint(t.clientX, t.clientY);
            if (!el) return false;
            return !!el.closest(TOUCH_WIDGET_SELECTOR);
        };

        const canvas = this.scene.scene?.getEngine()?.getRenderingCanvas();
        if (!canvas) return;
        canvas.style.touchAction = 'none';

        const isInDeadZone = (x: number, y: number): boolean => {
            const gps = document.getElementById('gps-map');
            if (gps) {
                const r = gps.getBoundingClientRect();
                if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
            }
            const pfd = document.getElementById('flight-pfd');
            if (pfd) {
                const r = pfd.getBoundingClientRect();
                if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
            }
            return false;
        };

        const applyExpoCurve = (input: number, expoFactor: number): number => {
            if (!Number.isFinite(input)) return 0;
            const sign = Math.sign(input);
            const abs = Math.min(1, Math.abs(input));
            return sign * Math.pow(abs, expoFactor);
        };

        const collectFreeTouches = (touchList: TouchList): Touch[] => {
            const arr: Touch[] = [];
            for (let i = 0; i < touchList.length; i++) {
                const t = touchList[i];
                if (isOnWidget(t)) continue;
                if (isInDeadZone(t.clientX, t.clientY)) continue;
                arr.push(t);
            }
            return arr;
        };

        const startTwoFinger = (touches: Touch[]): void => {
            const a = touches[0], b = touches[1];
            const dx = b.clientX - a.clientX;
            const dy = b.clientY - a.clientY;
            const dist = Math.hypot(dx, dy);
            this.scene._twoFingerActive = true;
            this.scene._twoFingerInitialDist = dist;
            this.scene._twoFingerLastDist = dist;
            this.scene._twoFingerStartMidX = (a.clientX + b.clientX) * 0.5;
            this.scene._twoFingerStartMidY = (a.clientY + b.clientY) * 0.5;
            this.scene._twoFingerStartMs = performance.now();
            this.scene._twoFingerFiredCamera = false;
            if (this.scene.joystickTouchId !== null) {
                this.scene.joystickTouchId = null;
                this.scene.touchPitchInput = 0;
                this.scene.touchRollInput = 0;
                joyEl.style.display = 'none';
            }
        };

        const endTwoFinger = (): void => {
            this.scene._twoFingerActive = false;
            this.scene._twoFingerInitialDist = 0;
            this.scene._twoFingerLastDist = 0;
            this.scene._twoFingerFiredCamera = false;
        };

        const canvasTouchStart = (e: TouchEvent) => {
            const free = collectFreeTouches(e.touches);
            if (free.length >= 2 && !this.scene._twoFingerActive) {
                startTwoFinger(free);
                e.preventDefault();
                return;
            }
            for (let i = 0; i < e.changedTouches.length; i++) {
                const t = e.changedTouches[i];
                if (isOnWidget(t)) continue;
                if (isInDeadZone(t.clientX, t.clientY)) continue;
                if (this.scene._twoFingerActive) continue;
                if (this.scene.joystickTouchId !== null) continue;
                this.scene.joystickTouchId = t.identifier;
                this.scene.joystickOrigin = { x: t.clientX, y: t.clientY };
                joyEl.style.display = 'block';
                joyEl.style.left = `${t.clientX - this.scene._controlSettings.radius * 0.75}px`;
                joyEl.style.top = `${t.clientY - this.scene._controlSettings.radius * 0.75}px`;
                knob.style.left = '50%';
                knob.style.top = '50%';
                dzEl.style.borderColor = 'rgba(80,255,160,.4)';
                e.preventDefault();
            }
        };
        canvas.addEventListener('touchstart', canvasTouchStart, { passive: false });
        this._touchCanvas = canvas;
        this._touchStartHandler = canvasTouchStart;

        const canvasTouchMove = (e: TouchEvent) => {
            if (this.scene._twoFingerActive && e.touches.length >= 2) {
                const free = collectFreeTouches(e.touches);
                if (free.length >= 2) {
                    const a = free[0], b = free[1];
                    const dx = b.clientX - a.clientX;
                    const dy = b.clientY - a.clientY;
                    const dist = Math.hypot(dx, dy);
                    const distDelta = dist - this.scene._twoFingerLastDist;
                    const cam = this.scene.camera;
                    if (cam) {
                        const lowerLimit = Number.isFinite(cam.lowerRadiusLimit) ? cam.lowerRadiusLimit : 1;
                        const upperLimit = Number.isFinite(cam.upperRadiusLimit) ? cam.upperRadiusLimit : 1000;
                        const currentRadius = Number.isFinite(cam.radius) ? cam.radius : lowerLimit;
                        const nextRadius = currentRadius - distDelta * PINCH_ZOOM_PX_TO_RADIUS;
                        cam.radius = Math.max(lowerLimit, Math.min(upperLimit, nextRadius));
                    }
                    this.scene._twoFingerLastDist = dist;
                    e.preventDefault();
                    return;
                }
            }
            for (let i = 0; i < e.changedTouches.length; i++) {
                const t = e.changedTouches[i];
                if (t.identifier !== this.scene.joystickTouchId) continue;
                const radius = this.scene._controlSettings.radius;
                const dx = t.clientX - this.scene.joystickOrigin.x;
                const dy = t.clientY - this.scene.joystickOrigin.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const clamped = Math.min(dist, radius);
                const angle = Math.atan2(dy, dx);
                let nx = (clamped * Math.cos(angle)) / radius;
                let ny = (clamped * Math.sin(angle)) / radius;
                const magnitude = Math.hypot(nx, ny);
                const dz = this.scene._controlSettings.deadzone;
                if (magnitude < dz) {
                    nx = 0;
                    ny = 0;
                    dzEl.style.borderColor = 'rgba(255,204,85,.7)';
                } else {
                    const remap = (magnitude - dz) / (1 - dz);
                    const k = remap / magnitude;
                    nx *= k;
                    ny *= k;
                    dzEl.style.borderColor = 'rgba(80,255,160,.4)';
                }
                const expoNx = applyExpoCurve(nx, this.scene._controlSettings.expo);
                const expoNy = applyExpoCurve(ny, this.scene._controlSettings.expo);
                this.scene.touchRollInput = -expoNx;
                const pitchSign = this.scene._controlSettings.pitchInvert ? -1 : 1;
                this.scene.touchPitchInput = pitchSign * expoNy;
                knob.style.left = `${50 + nx * 35}%`;
                knob.style.top = `${50 + ny * 35}%`;
            }
            e.preventDefault();
        };
        canvas.addEventListener('touchmove', canvasTouchMove, { passive: false });
        this._touchMoveHandler = canvasTouchMove;

        const resetJoy = (e: TouchEvent) => {
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === this.scene.joystickTouchId) {
                    this.scene.joystickTouchId = null;
                    this.scene.touchPitchInput = 0;
                    this.scene.touchRollInput = 0;
                    joyEl.style.display = 'none';
                    knob.style.left = '50%';
                    knob.style.top = '50%';
                }
            }
            if (this.scene._twoFingerActive && e.touches.length < 2) {
                endTwoFinger();
            }
        };
        canvas.addEventListener('touchend', resetJoy);
        canvas.addEventListener('touchcancel', resetJoy);
        this._touchEndHandler = resetJoy;
        this._touchCancelHandler = resetJoy;

        throttleEl.addEventListener('touchstart', (e: TouchEvent) => {
            if (this.scene.throttleTouchId !== null) return;
            this.scene.throttleTouchId = e.changedTouches[0].identifier;
            e.preventDefault();
        }, { passive: false });

        throttleEl.addEventListener('touchmove', (e: TouchEvent) => {
            for (let i = 0; i < e.changedTouches.length; i++) {
                const t = e.changedTouches[i];
                if (t.identifier !== this.scene.throttleTouchId) continue;
                const rect = throttleEl.getBoundingClientRect();
                const abMax = getAbMax();
                const pct = 1 - Math.max(0, Math.min(1, (t.clientY - rect.top) / rect.height));
                this.scene.touchThrust = pct * abMax;
                updateThrVisual();
            }
            e.preventDefault();
        }, { passive: false });

        const resetThr = (e: TouchEvent) => {
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === this.scene.throttleTouchId) {
                    this.scene.throttleTouchId = null;
                }
            }
        };
        throttleEl.addEventListener('touchend', resetThr);
        throttleEl.addEventListener('touchcancel', resetThr);

        const press = (id: string, handler: (el: HTMLElement) => void): void => {
            const el = document.getElementById(id);
            if (!el) {
                console.warn(`[Touch] #${id} element not found`);
                return;
            }
            el.addEventListener('pointerdown', (ev: PointerEvent) => {
                ev.preventDefault();
                handler(el);
            });
        };
        const hold = (id: string, onPress: (el: HTMLElement) => void, onRelease: (el: HTMLElement) => void): void => {
            const el = document.getElementById(id);
            if (!el) {
                console.warn(`[Touch] #${id} element not found`);
                return;
            }
            let activePointerId: number | null = null;
            el.addEventListener('pointerdown', (ev: PointerEvent) => {
                ev.preventDefault();
                if (activePointerId !== null) return;
                activePointerId = ev.pointerId;
                try { el.setPointerCapture(ev.pointerId); } catch (_) { /* ignore */ }
                onPress(el);
            });
            const release = (ev: PointerEvent) => {
                if (ev.pointerId !== activePointerId) return;
                activePointerId = null;
                onRelease(el);
            };
            el.addEventListener('pointerup', release);
            el.addEventListener('pointercancel', release);
            el.addEventListener('lostpointercapture', release);
        };

        press('touch-flap-up', () => {
            this.scene.flapIndex = Math.min(this.scene.FLAP_STEPS.length - 1, this.scene.flapIndex + 1);
        });
        press('touch-flap-dn', () => {
            this.scene.flapIndex = Math.max(0, this.scene.flapIndex - 1);
        });
        press('touch-brk', (el) => {
            this.scene.brakesOn = !this.scene.brakesOn;
            el.classList.toggle('active', this.scene.brakesOn);
        });
        press('touch-gear', () => {
            if (this.scene.aircraftConfig?.gear_retractable !== true) {
                console.debug('[Touch] gear ignored: aircraft has fixed gear');
                return;
            }
            this.scene._toggleGear();
        });
        let splPressStart = 0;
        let splLongPressFired = false;
        let splTimer: ReturnType<typeof setTimeout> | null = null;
        hold('touch-spl', () => {
            splPressStart = Date.now();
            splLongPressFired = false;
            if (splTimer) clearTimeout(splTimer);
            splTimer = setTimeout(() => {
                splLongPressFired = true;
                this.scene._armGroundSpoilers();
            }, SPOILER_LONG_PRESS_MS);
        }, () => {
            if (splTimer) { clearTimeout(splTimer); splTimer = null; }
            if (!splLongPressFired && Date.now() - splPressStart < SPOILER_LONG_PRESS_MS) {
                this.scene._toggleSpoilers();
            }
        });
        press('touch-lgt', (el) => {
            this.scene._landingLightsOn = !this.scene._landingLightsOn;
            el.classList.toggle('active', this.scene._landingLightsOn);
        });
        press('touch-smk', (el) => {
            const smokeOn = this.scene._toggleSmoke() === true;
            el.classList.toggle('active', smokeOn);
        });
        press('touch-cam', () => {
            this.scene._cycleCameraMode();
        });
        press('touch-pause', () => {
            closeTouchPanels();
            this.scene._togglePause();
        });
        const bindRudder = (id: string, value: number) => {
            hold(id, (el) => {
                this.scene.touchYawInput = value;
                el.classList.add('active');
            }, (el) => {
                if (this.scene.touchYawInput === value) this.scene.touchYawInput = 0;
                el.classList.remove('active');
            });
        };
        bindRudder('touch-rud-l', TOUCH_RUDDER_INPUT);
        bindRudder('touch-rud-r', -TOUCH_RUDDER_INPUT);

        press('more-trim-pitch-dn', () => this.adjustTouchTrim('pitch', -1));
        press('more-trim-pitch-up', () => this.adjustTouchTrim('pitch', 1));
        press('more-trim-yaw-l', () => this.adjustTouchTrim('yaw', -1));
        press('more-trim-yaw-r', () => this.adjustTouchTrim('yaw', 1));
        press('more-time-dn', () => this.scene._adjustTimeScale(-1));
        press('more-time-up', () => this.scene._adjustTimeScale(1));
        hold('more-reverse', (el) => {
            this._touchReverseHeld = true;
            el.classList.add('active');
        }, (el) => {
            this._touchReverseHeld = false;
            el.classList.remove('active');
        });
        press('more-autobrake', () => {
            this.scene._cycleAutobrake();
            this.scene._cockpitClick();
        });
        press('more-replay', () => {
            closeTouchPanels();
            this.scene._toggleReplay();
        });
        press('more-respawn', () => {
            closeTouchPanels();
            this.scene._spawnPlane();
        });
        const chatBtn = document.getElementById('more-chat');
        if (chatBtn) {
            chatBtn.addEventListener('click', () => {
                closeTouchPanels();
                try {
                    this.scene._chatSystem.open();
                } catch (err) {
                    console.warn('[Touch] Chat open failed:', err);
                }
            });
        } else {
            console.warn('[Touch] #more-chat element not found');
        }
    }

    private adjustTouchTrim(axis: 'pitch' | 'yaw', direction: 1 | -1): void {
        if (axis === 'pitch') {
            const next = (Number(this.scene.trimPitch) || 0) + direction * TOUCH_TRIM_PITCH_STEP;
            this.scene.trimPitch = Math.max(-TOUCH_TRIM_PITCH_LIMIT, Math.min(TOUCH_TRIM_PITCH_LIMIT, next));
        } else {
            const next = (Number(this.scene.trimYaw) || 0) + direction * TOUCH_TRIM_YAW_STEP;
            this.scene.trimYaw = Math.max(-TOUCH_TRIM_YAW_LIMIT, Math.min(TOUCH_TRIM_YAW_LIMIT, next));
        }
        this.scene._cockpitClick(TOUCH_TRIM_CLICK_HZ);
    }

    loadControlSettings(): void {
        try {
            const raw = localStorage.getItem(CONTROL_SETTINGS_STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return;
            if (Number.isFinite(parsed.radius)) {
                this.scene._controlSettings.radius = Math.max(JOYSTICK_MIN_RADIUS_PX, Math.min(JOYSTICK_MAX_RADIUS_PX, Number(parsed.radius)));
            }
            if (Number.isFinite(parsed.deadzone)) {
                this.scene._controlSettings.deadzone = Math.max(0, Math.min(JOYSTICK_MAX_DEADZONE_NORM, Number(parsed.deadzone)));
            }
            if (Number.isFinite(parsed.expo)) {
                this.scene._controlSettings.expo = Math.max(JOYSTICK_MIN_EXPO, Math.min(JOYSTICK_MAX_EXPO, Number(parsed.expo)));
            }
            if (typeof parsed.pitchInvert === 'boolean') {
                this.scene._controlSettings.pitchInvert = parsed.pitchInvert;
            }
            if (Number.isFinite(parsed.rollSensitivity)) {
                this.scene._controlSettings.rollSensitivity = Math.max(TOUCH_ROLL_SENSITIVITY_MIN, Math.min(TOUCH_ROLL_SENSITIVITY_MAX, Number(parsed.rollSensitivity)));
            }
            console.log('[Controls] Loaded settings:', this.scene._controlSettings);
        } catch (err) {
            console.warn('[Controls] Failed to load settings:', err);
        }
    }

    persistControlSettings(): void {
        try {
            localStorage.setItem(CONTROL_SETTINGS_STORAGE_KEY, JSON.stringify(this.scene._controlSettings));
        } catch (err) {
            console.warn('[Controls] Failed to persist settings:', err);
        }
    }

    doHaptic(pattern: number | number[]): void {
        if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
        if (!this.scene._userGestureSeen) {
            this.scene._installUserGestureListener();
            return;
        }
        const now = performance.now();
        if (now - this.scene._lastHapticMs < HAPTIC_MIN_INTERVAL_MS) return;
        this.scene._lastHapticMs = now;
        try {
            (navigator as Navigator).vibrate(pattern);
        } catch (err) {
            console.warn('[Haptic] vibrate failed:', err);
        }
    }

    installUserGestureListener(): void {
        if (this.scene._userGestureSeen || this.scene._userGestureListener) return;
        const events: Array<keyof DocumentEventMap> = ['pointerdown', 'keydown', 'touchstart', 'mousedown'];
        const listener = () => {
            this.scene._userGestureSeen = true;
            this.scene._removeUserGestureListener();
            console.debug('[Haptic] User gesture detected; haptics enabled');
        };
        this.scene._userGestureListener = listener;
        for (const ev of events) {
            try {
                document.addEventListener(ev, listener, { once: false, capture: true, passive: true });
            } catch (err) {
                console.warn('[Haptic] addEventListener failed for', ev, err);
            }
        }
    }

    removeUserGestureListener(): void {
        const listener = this.scene._userGestureListener;
        if (!listener) return;
        const events: Array<keyof DocumentEventMap> = ['pointerdown', 'keydown', 'touchstart', 'mousedown'];
        for (const ev of events) {
            try { document.removeEventListener(ev, listener, true); } catch (_) { /* ignore */ }
        }
        this.scene._userGestureListener = null;
    }

    safeSetTimeout(cb: () => void, ms: number): number {
        if (this.scene._disposed) return 0;
        const id = window.setTimeout(() => {
            this.scene._pendingTimeouts.delete(id);
            if (this.scene._disposed) return;
            try {
                cb();
            } catch (err) {
                console.warn('[Timer] Scheduled callback failed:', err);
            }
        }, ms);
        this.scene._pendingTimeouts.add(id);
        return id;
    }

    clearAllPendingTimeouts(): void {
        for (const id of this.scene._pendingTimeouts) {
            try { window.clearTimeout(id); } catch (_) { /* ignore */ }
        }
        this.scene._pendingTimeouts.clear();
    }

}
