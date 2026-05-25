import type { FlightSceneSimple } from '../../FlightSceneSimple.js';

const GPS_POS_STORAGE_KEY = 'gps-map-pos-v1';
const GPS_DRAG_VIEWPORT_MARGIN_PX = 4;
const MAP_ZOOM_MIN = 9;
const MAP_ZOOM_MAX = 17;
const MAP_REQUEST_SIZE_PX = 256;
const MAP_REQUEST_SCALE = 2;
const MAP_REFETCH_DRIFT_RATIO = 0.25;
const MAP_REFETCH_INTERVAL_MS = 5000;
const MAP_IMG_UPSCALE = 2.0;

export class MiniMapSystem {
    private readonly scene: any;
    private _gpsCoordsEl: HTMLElement | null = null;

    constructor(scene: FlightSceneSimple) {
        this.scene = scene;
    }

    persistGpsState(gps: HTMLElement): void {
        try {
            const rect = gps.getBoundingClientRect();
            localStorage.setItem(GPS_POS_STORAGE_KEY, JSON.stringify({
                left: Math.round(rect.left),
                top: Math.round(rect.top),
                zoom: this.scene._mapZoom,
                headingUp: this.scene._mapHeadingUp,
            }));
        } catch (err) {
            console.warn('[GPS] Failed to save state:', err);
        }
    }

    updateZoomIndicator(): void {
        const valEl = document.getElementById('gps-zoom-val');
        if (valEl) valEl.textContent = String(this.scene._mapZoom);
        const inBtn = document.getElementById('gps-zoom-in') as HTMLButtonElement | null;
        const outBtn = document.getElementById('gps-zoom-out') as HTMLButtonElement | null;
        if (inBtn) inBtn.disabled = this.scene._mapZoom >= MAP_ZOOM_MAX;
        if (outBtn) outBtn.disabled = this.scene._mapZoom <= MAP_ZOOM_MIN;
        if (inBtn) inBtn.style.opacity = inBtn.disabled ? '0.4' : '1';
        if (outBtn) outBtn.style.opacity = outBtn.disabled ? '0.4' : '1';
    }

    updateMapModeIndicator(): void {
        const btn = document.getElementById('gps-mode-toggle') as HTMLButtonElement | null;
        if (!btn) return;
        btn.textContent = this.scene._mapHeadingUp ? 'H' : 'N';
        btn.title = this.scene._mapHeadingUp ? 'Modo: Heading-Up (clique para Norte)' : 'Modo: Norte-Up (clique para Heading)';
    }

    toggleMapHeadingUp(gps: HTMLElement): void {
        this.scene._mapHeadingUp = !this.scene._mapHeadingUp;
        console.log(`[GPS] Heading-up mode ${this.scene._mapHeadingUp ? 'enabled' : 'disabled'}`);
        if (this.scene.mapImg) this.scene.mapImg.style.transform = 'translate(0px, 0px)';
        this.updateMapModeIndicator();
        this.persistGpsState(gps);
    }

    changeMapZoom(delta: number, gps: HTMLElement): void {
        const next = Math.min(MAP_ZOOM_MAX, Math.max(MAP_ZOOM_MIN, this.scene._mapZoom + delta));
        if (next === this.scene._mapZoom) return;
        this.scene._mapZoom = next;
        this.scene._mapImgValid = false;
        this.scene._mapImgPending = false;
        this.scene.mapLastUpdate = 0;
        if (this.scene.mapImg) this.scene.mapImg.style.transform = 'translate(0px, 0px)';
        console.log(`[GPS] Zoom set to ${this.scene._mapZoom}`);
        this.updateZoomIndicator();
        this.persistGpsState(gps);
    }

    setupMinimapDrag(): void {
        const gps = document.getElementById('gps-map') as HTMLDivElement | null;
        const handle = document.getElementById('gps-map-handle') as HTMLDivElement | null;
        if (!gps || !handle) {
            console.warn('[GPS] _setupMinimapDrag: missing #gps-map or #gps-map-handle');
            return;
        }

        try {
            const saved = localStorage.getItem(GPS_POS_STORAGE_KEY);
            if (saved) {
                const pos = JSON.parse(saved) as { left?: number; top?: number; zoom?: number; headingUp?: boolean };
                if (pos && Number.isFinite(pos.left) && Number.isFinite(pos.top)) {
                    gps.style.left = `${this.clampGpsX(pos.left as number, gps)}px`;
                    gps.style.top = `${this.clampGpsY(pos.top as number, gps)}px`;
                }
                if (pos && Number.isFinite(pos.zoom)) {
                    const z = Number(pos.zoom);
                    this.scene._mapZoom = Math.min(MAP_ZOOM_MAX, Math.max(MAP_ZOOM_MIN, z));
                }
            }
        } catch (err) {
            console.warn('[GPS] Failed to read saved state:', err);
        }

        const zoomInBtn = document.getElementById('gps-zoom-in') as HTMLButtonElement | null;
        const zoomOutBtn = document.getElementById('gps-zoom-out') as HTMLButtonElement | null;
        const modeBtn = document.getElementById('gps-mode-toggle') as HTMLButtonElement | null;
        if (zoomInBtn) {
            zoomInBtn.addEventListener('click', (ev) => { ev.stopPropagation(); this.changeMapZoom(+1, gps); });
            zoomInBtn.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); });
        }
        if (zoomOutBtn) {
            zoomOutBtn.addEventListener('click', (ev) => { ev.stopPropagation(); this.changeMapZoom(-1, gps); });
            zoomOutBtn.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); });
        }
        if (modeBtn) {
            modeBtn.addEventListener('click', (ev) => { ev.stopPropagation(); this.toggleMapHeadingUp(gps); });
            modeBtn.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); });
        }
        this.updateZoomIndicator();
        this.updateMapModeIndicator();

        let dragging = false;
        let pointerId = -1;
        let startClientX = 0;
        let startClientY = 0;
        let startLeft = 0;
        let startTop = 0;

        const onPointerDown = (ev: PointerEvent) => {
            if (dragging) return;
            if (ev.button !== undefined && ev.button !== 0) return;
            dragging = true;
            pointerId = ev.pointerId;
            const rect = gps.getBoundingClientRect();
            startClientX = ev.clientX;
            startClientY = ev.clientY;
            startLeft = rect.left;
            startTop = rect.top;
            handle.style.cursor = 'grabbing';
            try { handle.setPointerCapture(pointerId); } catch { /* ignore */ }
            ev.preventDefault();
            ev.stopPropagation();
        };

        const onPointerMove = (ev: PointerEvent) => {
            if (!dragging || ev.pointerId !== pointerId) return;
            const dx = ev.clientX - startClientX;
            const dy = ev.clientY - startClientY;
            const newLeft = this.clampGpsX(startLeft + dx, gps);
            const newTop = this.clampGpsY(startTop + dy, gps);
            gps.style.left = `${newLeft}px`;
            gps.style.top = `${newTop}px`;
            ev.preventDefault();
        };

        const onPointerUp = (ev: PointerEvent) => {
            if (!dragging || ev.pointerId !== pointerId) return;
            dragging = false;
            handle.style.cursor = 'grab';
            try { handle.releasePointerCapture(pointerId); } catch { /* ignore */ }
            this.persistGpsState(gps);
            pointerId = -1;
        };

        handle.addEventListener('pointerdown', onPointerDown);
        handle.addEventListener('pointermove', onPointerMove);
        handle.addEventListener('pointerup', onPointerUp);
        handle.addEventListener('pointercancel', onPointerUp);
    }

    clampGpsX(x: number, gps: HTMLElement): number {
        const m = GPS_DRAG_VIEWPORT_MARGIN_PX;
        const w = gps.offsetWidth || 216;
        const max = Math.max(m, window.innerWidth - w - m);
        return Math.min(max, Math.max(m, x));
    }

    clampGpsY(y: number, gps: HTMLElement): number {
        const m = GPS_DRAG_VIEWPORT_MARGIN_PX;
        const h = gps.offsetHeight || 216;
        const max = Math.max(m, window.innerHeight - h - m);
        return Math.min(max, Math.max(m, y));
    }

    latLonToMapPx(lat: number, lon: number, refLat: number, refLon: number, mapPxSize: number): { x: number; y: number; pxPerDegLon: number; pxPerDegLat: number } {
        const onScreenPxPerDegLon = (256 * Math.pow(2, this.scene._mapZoom) / 360)
            * (mapPxSize / MAP_REQUEST_SIZE_PX)
            * MAP_IMG_UPSCALE;
        const cosLat = Math.max(0.001, Math.cos(refLat * Math.PI / 180));
        const onScreenPxPerDegLat = onScreenPxPerDegLon / cosLat;
        const x = (lon - refLon) * onScreenPxPerDegLon;
        const y = -(lat - refLat) * onScreenPxPerDegLat;
        return { x, y, pxPerDegLon: onScreenPxPerDegLon, pxPerDegLat: onScreenPxPerDegLat };
    }

    ensureMapImgListeners(): void {
        if (this.scene._mapImgListenersAttached || !this.scene.mapImg) return;
        this.scene._mapImgListenersAttached = true;
        try {
            this.scene._mapImgLoadHandler = () => {
                if (this.scene._disposed) return;
                if (!this.scene._mapImgPending) return;
                this.scene._mapImgLat = this.scene._mapImgPendingLat;
                this.scene._mapImgLon = this.scene._mapImgPendingLon;
                this.scene._mapImgValid = true;
                this.scene._mapImgPending = false;
            };
            this.scene._mapImgErrorHandler = (ev: Event) => {
                if (this.scene._disposed) return;
                if (!this.scene._mapImgPending) return;
                this.scene._mapImgPending = false;
                this.scene.mapLastUpdate = 0;
                console.warn('[GPS] Map tile load failed; will retry on next update', ev);
            };
            this.scene.mapImg.addEventListener('load', this.scene._mapImgLoadHandler);
            this.scene.mapImg.addEventListener('error', this.scene._mapImgErrorHandler);
        } catch (err) {
            console.warn('[GPS] Failed to attach map image listeners:', err);
        }
    }

    removeMapImgListeners(): void {
        try {
            if (this.scene.mapImg && this.scene._mapImgLoadHandler) {
                this.scene.mapImg.removeEventListener('load', this.scene._mapImgLoadHandler);
            }
            if (this.scene.mapImg && this.scene._mapImgErrorHandler) {
                this.scene.mapImg.removeEventListener('error', this.scene._mapImgErrorHandler);
            }
        } catch (err) {
            console.warn('[GPS] Failed to remove map image listeners:', err);
        }
        this.scene._mapImgLoadHandler = null;
        this.scene._mapImgErrorHandler = null;
        this.scene._mapImgListenersAttached = false;
    }

    updateMap(): void {
        if (!this.scene.mapImg) return;
        this.ensureMapImgListeners();
        const now = performance.now();
        const { lat, lon, hdg } = this.scene._getCurrentLatLon();

        const cv = this.scene.mapHeadingCanvas;
        const ctx = this.scene._mapHdgCtx || (this.scene._mapHdgCtx = cv.getContext('2d')!);
        if (!ctx) return;
        const cx = cv.width / 2;
        const cy = cv.height / 2;

        const hdgRad = (Number.isFinite(hdg) ? hdg : 0) * Math.PI / 180;
        const headingUp = this.scene._mapHeadingUp;
        const cosH = headingUp ? Math.cos(hdgRad) : 1;
        const sinH = headingUp ? Math.sin(hdgRad) : 0;
        const rotXY = (px: number, py: number): { x: number; y: number } => headingUp
            ? { x: cx + cosH * px + sinH * py, y: cy + -sinH * px + cosH * py }
            : { x: cx + px, y: cy + py };

        let driftPx = 0;
        if (this.scene._mapImgValid) {
            const drift = this.latLonToMapPx(lat, lon, this.scene._mapImgLat, this.scene._mapImgLon, cv.width);
            driftPx = Math.hypot(drift.x, drift.y);
        }
        const driftLimitPx = cv.width * MAP_REFETCH_DRIFT_RATIO;
        const timeSinceFetch = now - this.scene.mapLastUpdate;
        const needFetch = !this.scene._mapImgValid
            || driftPx > driftLimitPx
            || timeSinceFetch > MAP_REFETCH_INTERVAL_MS;

        if (this.scene.mapApiKey && needFetch && !this.scene._mapImgPending) {
            this.scene.mapLastUpdate = now;
            this.scene._mapImgPending = true;
            this.scene._mapImgPendingLat = lat;
            this.scene._mapImgPendingLon = lon;
            this.scene.mapImg.src = `https://maps.googleapis.com/maps/api/staticmap?center=${lat.toFixed(5)},${lon.toFixed(5)}&zoom=${this.scene._mapZoom}&size=${MAP_REQUEST_SIZE_PX}x${MAP_REQUEST_SIZE_PX}&scale=${MAP_REQUEST_SCALE}&maptype=satellite&key=${this.scene.mapApiKey}`;
        }

        if (this.scene._mapImgValid) {
            const drift = this.latLonToMapPx(lat, lon, this.scene._mapImgLat, this.scene._mapImgLon, cv.width);
            if (headingUp) {
                const rDx = cosH * drift.x + sinH * drift.y;
                const rDy = -sinH * drift.x + cosH * drift.y;
                this.scene.mapImg.style.transform = `translate(${(-rDx).toFixed(2)}px, ${(-rDy).toFixed(2)}px) rotate(${(-hdg).toFixed(2)}deg)`;
            } else {
                this.scene.mapImg.style.transform = `translate(${(-drift.x).toFixed(2)}px, ${(-drift.y).toFixed(2)}px)`;
            }
        }

        ctx.clearRect(0, 0, cv.width, cv.height);

        ctx.save();
        ctx.translate(cx, cy);
        if (!headingUp) ctx.rotate(hdg * Math.PI / 180);

        ctx.fillStyle = 'rgba(0,255,128,0.9)';
        ctx.beginPath();
        ctx.moveTo(0, -12);
        ctx.lineTo(-2, -4);
        ctx.lineTo(-9, 2);
        ctx.lineTo(-9, 4);
        ctx.lineTo(-2, 1);
        ctx.lineTo(-2, 7);
        ctx.lineTo(-4, 9);
        ctx.lineTo(-4, 10);
        ctx.lineTo(0, 8.5);
        ctx.lineTo(4, 10);
        ctx.lineTo(4, 9);
        ctx.lineTo(2, 7);
        ctx.lineTo(2, 1);
        ctx.lineTo(9, 4);
        ctx.lineTo(9, 2);
        ctx.lineTo(2, -4);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = 'rgba(0,255,128,0.6)';
        ctx.lineWidth = 0.5;
        ctx.stroke();

        ctx.restore();

        if (this.scene._activeMissionId != null && this.scene._missionWaypoints.length > 0) {
            ctx.save();
            for (let i = 0; i < this.scene._missionWaypoints.length; i++) {
                const wp = this.scene._missionWaypoints[i];
                const wpLat = Number(wp.latitude);
                const wpLon = Number(wp.longitude);
                if (!Number.isFinite(wpLat) || !Number.isFinite(wpLon)) continue;
                const p = this.latLonToMapPx(wpLat, wpLon, lat, lon, cv.width);
                const wpScreen = rotXY(p.x, p.y);
                const wpX = wpScreen.x;
                const wpY = wpScreen.y;

                if (i < this.scene._missionCurrentWpIndex) {
                    ctx.fillStyle = 'rgba(120,120,120,0.5)';
                    ctx.beginPath();
                    ctx.arc(wpX, wpY, 2, 0, Math.PI * 2);
                    ctx.fill();
                } else if (i === this.scene._missionCurrentWpIndex) {
                    ctx.setLineDash([4, 3]);
                    ctx.strokeStyle = 'rgba(0,220,255,0.8)';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(cx, cy);
                    ctx.lineTo(wpX, wpY);
                    ctx.stroke();
                    ctx.setLineDash([]);

                    ctx.fillStyle = 'rgba(0,220,255,0.9)';
                    ctx.beginPath();
                    ctx.arc(wpX, wpY, 5, 0, Math.PI * 2);
                    ctx.fill();

                    const label = wp.name || `WP ${wp.order_index}`;
                    ctx.font = '7px Inter, sans-serif';
                    ctx.fillStyle = 'rgba(0,220,255,0.9)';
                    ctx.fillText(label, wpX + 7, wpY - 3);
                } else {
                    ctx.fillStyle = 'rgba(255,255,255,0.5)';
                    ctx.beginPath();
                    ctx.arc(wpX, wpY, 3, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            ctx.restore();
        } else if (this.scene._activeMission) {
            const m = this.scene._activeMission;
            if (Number.isFinite(m.departure_lat) && Number.isFinite(m.departure_lon) && Number.isFinite(m.arrival_lat) && Number.isFinite(m.arrival_lon)) {
                const pDep = this.latLonToMapPx(m.departure_lat, m.departure_lon, lat, lon, cv.width);
                const pArr = this.latLonToMapPx(m.arrival_lat, m.arrival_lon, lat, lon, cv.width);
                const depScreen = rotXY(pDep.x, pDep.y);
                const arrScreen = rotXY(pArr.x, pArr.y);
                const depX = depScreen.x;
                const depY = depScreen.y;
                const arrX = arrScreen.x;
                const arrY = arrScreen.y;

                ctx.save();
                ctx.setLineDash([4, 3]);
                ctx.strokeStyle = 'rgba(255,200,0,0.7)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(depX, depY);
                ctx.lineTo(arrX, arrY);
                ctx.stroke();
                ctx.setLineDash([]);

                ctx.fillStyle = 'rgba(0,200,255,0.9)';
                ctx.beginPath();
                ctx.arc(depX, depY, 4, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = 'rgba(255,80,80,0.9)';
                ctx.beginPath();
                ctx.arc(arrX, arrY, 4, 0, Math.PI * 2);
                ctx.fill();

                ctx.font = '7px Inter, sans-serif';
                ctx.fillStyle = 'rgba(255,255,255,0.8)';
                ctx.fillText(m.departure_icao, depX + 6, depY - 2);
                ctx.fillText(m.arrival_icao, arrX + 6, arrY - 2);
                ctx.restore();
            }
        }

        if (this.scene._activeFlightPlanNav) {
            const fp = this.scene._activeFlightPlanNav;
            if (Number.isFinite(fp.departure_lat) && Number.isFinite(fp.departure_lon) && Number.isFinite(fp.arrival_lat) && Number.isFinite(fp.arrival_lon)) {
                const pDep = this.latLonToMapPx(fp.departure_lat, fp.departure_lon, lat, lon, cv.width);
                const pArr = this.latLonToMapPx(fp.arrival_lat, fp.arrival_lon, lat, lon, cv.width);
                const fpDepScreen = rotXY(pDep.x, pDep.y);
                const fpArrScreen = rotXY(pArr.x, pArr.y);
                const fpDepX = fpDepScreen.x;
                const fpDepY = fpDepScreen.y;
                const fpArrX = fpArrScreen.x;
                const fpArrY = fpArrScreen.y;

                ctx.save();
                ctx.setLineDash([4, 3]);
                ctx.strokeStyle = 'rgba(80,255,160,0.7)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(fpDepX, fpDepY);
                ctx.lineTo(fpArrX, fpArrY);
                ctx.stroke();
                ctx.setLineDash([]);

                ctx.fillStyle = 'rgba(0,200,255,0.9)';
                ctx.beginPath();
                ctx.arc(fpDepX, fpDepY, 4, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = 'rgba(255,80,80,0.9)';
                ctx.beginPath();
                ctx.arc(fpArrX, fpArrY, 4, 0, Math.PI * 2);
                ctx.fill();

                ctx.font = '7px Inter, sans-serif';
                ctx.fillStyle = 'rgba(255,255,255,0.85)';
                ctx.fillText(fp.departure_icao, fpDepX + 6, fpDepY - 2);
                ctx.fillText(fp.arrival_icao, fpArrX + 6, fpArrY - 2);
                ctx.restore();
            }
        }

        this.scene._updateNavInfo(lat, lon);

        if (!this._gpsCoordsEl) {
            this._gpsCoordsEl = document.getElementById('gps-coords');
        }
        if (this._gpsCoordsEl) this._gpsCoordsEl.textContent = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    }
}
