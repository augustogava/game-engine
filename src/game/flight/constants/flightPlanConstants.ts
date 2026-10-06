export const FLIGHT_PLAN_STATUS_PLANNED = 0;
export const FLIGHT_PLAN_STATUS_IN_PROGRESS = 1;
export const FLIGHT_PLAN_STATUS_COMPLETED = 2;
export const FLIGHT_PLAN_STATUS_CANCELLED = 3;

export type FlightPlanStatusCode =
    | typeof FLIGHT_PLAN_STATUS_PLANNED
    | typeof FLIGHT_PLAN_STATUS_IN_PROGRESS
    | typeof FLIGHT_PLAN_STATUS_COMPLETED
    | typeof FLIGHT_PLAN_STATUS_CANCELLED;

export function isFlightPlanStatusCode(value: unknown): value is FlightPlanStatusCode {
    return value === FLIGHT_PLAN_STATUS_PLANNED
        || value === FLIGHT_PLAN_STATUS_IN_PROGRESS
        || value === FLIGHT_PLAN_STATUS_COMPLETED
        || value === FLIGHT_PLAN_STATUS_CANCELLED;
}
