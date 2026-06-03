export function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R_NM = 3440.065;
    const toRad = Math.PI / 180;
    const dLat = (lat2 - lat1) * toRad;
    const dLon = (lon2 - lon1) * toRad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
    return 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function initialBearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const toRad = Math.PI / 180;
    const phi1 = lat1 * toRad, phi2 = lat2 * toRad;
    const dLon = (lon2 - lon1) * toRad;
    const y = Math.sin(dLon) * Math.cos(phi2);
    const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
    return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

export function destinationPoint(lat: number, lon: number, bearingDeg: number, distNm: number): { lat: number; lon: number } {
    const R_NM = 3440.065;
    const toRad = Math.PI / 180;
    const toDeg = 180 / Math.PI;
    const dr = distNm / R_NM;
    const brg = bearingDeg * toRad;
    const phi1 = lat * toRad;
    const lambda1 = lon * toRad;
    const sinPhi2 = Math.sin(phi1) * Math.cos(dr) + Math.cos(phi1) * Math.sin(dr) * Math.cos(brg);
    const phi2 = Math.asin(Math.max(-1, Math.min(1, sinPhi2)));
    const y = Math.sin(brg) * Math.sin(dr) * Math.cos(phi1);
    const x = Math.cos(dr) - Math.sin(phi1) * sinPhi2;
    const lambda2 = lambda1 + Math.atan2(y, x);
    return { lat: phi2 * toDeg, lon: ((lambda2 * toDeg + 540) % 360) - 180 };
}

export function computeXteNm(prevLat: number, prevLon: number, nextLat: number, nextLon: number, curLat: number, curLon: number): number {
    const R_NM = 3440.065;
    const toRad = Math.PI / 180;
    const d13 = haversineNm(prevLat, prevLon, curLat, curLon) / R_NM;
    if (d13 < 1e-9) return 0;
    const theta13 = initialBearingDeg(prevLat, prevLon, curLat, curLon) * toRad;
    const theta12 = initialBearingDeg(prevLat, prevLon, nextLat, nextLon) * toRad;
    const xte = Math.asin(Math.sin(d13) * Math.sin(theta13 - theta12)) * R_NM;
    return xte;
}

export function formatEteMin(eteMin: number): string {
    if (!Number.isFinite(eteMin) || eteMin <= 0) return '--:--';
    if (eteMin > 999) return '>999';
    const h = Math.floor(eteMin / 60);
    const m = Math.floor(eteMin % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}`;
    const s = Math.floor((eteMin - m) * 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatEtaUtc(simTimeMs: number, eteMin: number): string {
    if (!Number.isFinite(eteMin) || eteMin <= 0) return '--:--';
    const eta = new Date(simTimeMs + eteMin * 60000);
    const hh = String(eta.getUTCHours()).padStart(2, '0');
    const mm = String(eta.getUTCMinutes()).padStart(2, '0');
    return `${hh}:${mm}Z`;
}
