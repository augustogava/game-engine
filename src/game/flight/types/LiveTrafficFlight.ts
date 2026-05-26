export interface LiveTrafficFlight {
    fr24_id: string;
    hex?: string;
    callsign: string;
    lat: number;
    lon: number;
    track: number;
    alt: number;
    gspeed: number;
    vspeed: number;
    squawk?: number;
    timestamp?: string;
    source?: string;
}
