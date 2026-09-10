import { height, riverX } from './terrain';
import type { Point } from './network';
/** Tunnels belong only to the alpine running lines, with open station approaches. */
export function tunnelAt(points: Point[], index: number, running = true) {
  const p = points[index],
    first = points[0],
    last = points.at(-1)!;
  return (
    running &&
    p.z < -190 &&
    p.y > 2 &&
    height(p.x, p.z) > p.y + 6 &&
    Math.hypot(p.x - first.x, p.z - first.z) > 25 &&
    Math.hypot(p.x - last.x, p.z - last.z) > 25
  );
}
export function bridgeAt(p: Point) {
  return (
    Math.abs(p.x - riverX(p.z)) < 6.1 || (p.y > 2 && p.y - height(p.x, p.z) > 3)
  );
}
