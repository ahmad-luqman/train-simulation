import { cities } from './data';
import { MAP_SCALE } from './map';
// Shared by construction rules and scenery; no renderer objects belong in the model.
export const riverX = (z: number) =>
  MAP_SCALE *
  (36 +
    13 * Math.sin((z / MAP_SCALE) * 0.038) +
    4 * Math.cos((z / MAP_SCALE) * 0.07));
export function height(x: number, z: number) {
  const terraces = (value: number) => {
    for (const c of cities.slice(8)) {
      const d = Math.hypot(x - c.x, z - c.z);
      if (d < 38) {
        const t = Math.max(0, Math.min(1, (d - 25) / 13));
        const blend = t * t * (3 - 2 * t);
        return c.elevation! + (value - c.elevation!) * blend;
      }
    }
    return value;
  };
  const mountain = Math.max(0, (-z / MAP_SCALE - 61) / 29);
  const ridge =
    (0.65 +
      0.24 * Math.sin((x / MAP_SCALE) * 0.12) +
      0.17 * Math.cos((x / MAP_SCALE) * 0.27)) *
    mountain ** 1.65 *
    34;
  const edge = Math.max(0, (Math.abs(x) / MAP_SCALE - 80) / 15) * 3;
  const river = Math.abs(x - riverX(z));
  if (z < -170) {
    const blend = Math.min(1, (-z - 170) / 45);
    const peak = (cx: number, cz: number, width: number, amplitude: number) =>
      amplitude * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (width * width));
    let alpine =
      7 +
      peak(-180, -305, 53, 42) +
      peak(-10, -305, 48, 48) +
      peak(160, -280, 48, 38) +
      peak(-330, -230, 55, 32);
    // Glacier basin and eastern gorge create elevated spans below the rail grade.
    alpine -= peak(85, -265, 28, 18) + peak(252, -180, 30, 20);
    return terraces(
      (ridge + edge) * (1 - blend) + Math.max(-1.7, alpine) * blend,
    );
  }
  return terraces(
    river < 4.3
      ? -1.7
      : ridge + edge + (river < 6.5 ? (-1.7 * (6.5 - river)) / 2.2 : 0),
  );
}
