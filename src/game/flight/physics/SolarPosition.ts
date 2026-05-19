export function getSunPosition(lat: number, lon: number, date: Date): { elevation: number; azimuth: number } {
    const rad = Math.PI / 180;
    const jd = Math.floor(365.25 * (date.getUTCFullYear() + 4716))
             + Math.floor(30.6001 * ((date.getUTCMonth() + 1 < 3 ? date.getUTCMonth() + 13 : date.getUTCMonth() + 1 + 1)))
             + date.getUTCDate() + (date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600) / 24
             - 1524.5;
    const n = jd - 2451545.0;
    const L = (280.460 + 0.9856474 * n) % 360;
    const g = ((357.528 + 0.9856003 * n) % 360) * rad;
    const lambda = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * rad;
    const eps = 23.439 * rad - 3.56e-7 * rad * n;
    const sinDec = Math.sin(eps) * Math.sin(lambda);
    const dec = Math.asin(sinDec);
    const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
    const gmst = (280.46061837 + 360.98564736629 * n) % 360;
    const lmst = (gmst + lon) * rad;
    const ha = lmst - ra;
    const latR = lat * rad;
    const sinElev = Math.sin(latR) * Math.sin(dec) + Math.cos(latR) * Math.cos(dec) * Math.cos(ha);
    const elevation = Math.asin(sinElev) / rad;
    const cosAz = (Math.sin(dec) - Math.sin(elevation * rad) * Math.sin(latR))
                / (Math.cos(elevation * rad) * Math.cos(latR));
    let azimuth = Math.acos(Math.max(-1, Math.min(1, cosAz))) / rad;
    if (Math.sin(ha) > 0) azimuth = 360 - azimuth;
    return { elevation, azimuth };
}
