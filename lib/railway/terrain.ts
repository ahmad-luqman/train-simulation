// Shared by construction rules and scenery; no renderer objects belong in the model.
export const riverX = (z: number) =>
  36 + 13 * Math.sin(z * 0.038) + 4 * Math.cos(z * 0.07);
export function height(x: number, z: number) {
  const mountain = Math.max(0, (-z - 61) / 29);
  const ridge =
    (0.65 + 0.24 * Math.sin(x * 0.12) + 0.17 * Math.cos(x * 0.27)) *
    mountain ** 1.65 *
    34;
  const edge = Math.max(0, (Math.abs(x) - 80) / 15) * 3;
  const river = Math.abs(x - riverX(z));
  return river < 4.3
    ? -1.7
    : ridge + edge + (river < 6.5 ? (-1.7 * (6.5 - river)) / 2.2 : 0);
}
