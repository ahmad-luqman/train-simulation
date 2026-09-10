import { MAP } from './map';
import { height } from './terrain';
import type { Section } from './topology';

export const TERRAIN_COLUMNS = 240;
export const TERRAIN_ROWS = 224;
const dx = (MAP.halfWidth * 2) / TERRAIN_COLUMNS;
const dz = (MAP.halfDepth * 2) / TERRAIN_ROWS;
const stride = TERRAIN_COLUMNS + 1;
// Protect the entire triangle under a rail, not just its nearest terrain vertex.
const meshMargin = Math.hypot(dx, dz) + 0.01;
const shoulder = 4;

/** Cut the rendered ground to the existing alignment; railway geometry stays authoritative. */
export function railwayGround(
  sections: Iterable<Pick<Section, 'points' | 'kind'>>,
) {
  const natural = new Float32Array(stride * (TERRAIN_ROWS + 1));
  for (let row = 0; row <= TERRAIN_ROWS; row++)
    for (let col = 0; col <= TERRAIN_COLUMNS; col++)
      natural[row * stride + col] = height(
        col * dx - MAP.halfWidth,
        row * dz - MAP.halfDepth,
      );
  const ground = natural.slice();
  for (const section of sections) {
    const protectedWidth = (section.kind === 'platform' ? 4 : 1.4) + meshMargin;
    const radius = protectedWidth + shoulder;
    for (let i = 1; i < section.points.length; i++) {
      const a = section.points[i - 1],
        b = section.points[i];
      const vx = b.x - a.x,
        vz = b.z - a.z,
        length2 = vx * vx + vz * vz;
      // The lower endpoint conservatively clears sloping rails as well as flat berths.
      const formation = Math.min(a.y, b.y) - 0.36;
      const minCol = Math.max(
        0,
        Math.ceil((Math.min(a.x, b.x) - radius + MAP.halfWidth) / dx),
      );
      const maxCol = Math.min(
        TERRAIN_COLUMNS,
        Math.floor((Math.max(a.x, b.x) + radius + MAP.halfWidth) / dx),
      );
      const minRow = Math.max(
        0,
        Math.ceil((Math.min(a.z, b.z) - radius + MAP.halfDepth) / dz),
      );
      const maxRow = Math.min(
        TERRAIN_ROWS,
        Math.floor((Math.max(a.z, b.z) + radius + MAP.halfDepth) / dz),
      );
      for (let row = minRow; row <= maxRow; row++)
        for (let col = minCol; col <= maxCol; col++) {
          const index = row * stride + col;
          if (natural[index] <= formation) continue;
          const x = col * dx - MAP.halfWidth,
            z = row * dz - MAP.halfDepth;
          const t = length2
            ? Math.max(
                0,
                Math.min(1, ((x - a.x) * vx + (z - a.z) * vz) / length2),
              )
            : 0;
          const distance = Math.hypot(x - a.x - vx * t, z - a.z - vz * t);
          if (distance >= radius) continue;
          const blend = Math.max(
            0,
            Math.min(1, (distance - protectedWidth) / shoulder),
          );
          const smooth = blend * blend * (3 - 2 * blend);
          ground[index] = Math.min(
            ground[index],
            formation + (natural[index] - formation) * smooth,
          );
        }
    }
  }
  return ground;
}

/** Same two triangles per cell as Three.js PlaneGeometry, for scenery and clearance checks. */
export function groundHeight(ground: Float32Array, x: number, z: number) {
  const gx = Math.max(0, Math.min(TERRAIN_COLUMNS, (x + MAP.halfWidth) / dx));
  const gz = Math.max(0, Math.min(TERRAIN_ROWS, (z + MAP.halfDepth) / dz));
  const col = Math.min(TERRAIN_COLUMNS - 1, Math.floor(gx)),
    row = Math.min(TERRAIN_ROWS - 1, Math.floor(gz));
  const u = gx - col,
    v = gz - row,
    index = row * stride + col;
  const a = ground[index],
    b = ground[index + stride],
    c = ground[index + stride + 1],
    d = ground[index + 1];
  return u + v <= 1
    ? a + (d - a) * u + (b - a) * v
    : c + (b - c) * (1 - u) + (d - c) * (1 - v);
}
