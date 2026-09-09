// Shared simulation/render scale. Geometry, envelopes and dynamics use scene units.
export const METRES_PER_UNIT = 50 / 9;
export const metres = (units: number) => units * METRES_PER_UNIT;
