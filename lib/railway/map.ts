// One shared extent for terrain, construction, cameras and every plan view.
// Vehicle size and speed stay unchanged as the railway gains room to operate.
export const MAP_SCALE = 2.4;
export const MAP = {
  halfWidth: 420,
  halfDepth: 420,
  minX: -320,
  maxX: 320,
  minZ: -340,
  maxZ: 230,
  overviewHalf: 370,
  maxTrackLength: 180 * MAP_SCALE,
};
export const MAP_VIEWBOX = `${-MAP.halfWidth} ${-MAP.halfDepth} ${MAP.halfWidth * 2} ${MAP.halfDepth * 2}`;

// Plan views show usable construction land, without the decorative terrain rim.
export const BUILD_VIEWBOX = `${MAP.minX - 24} ${MAP.minZ - 24} ${MAP.maxX - MAP.minX + 48} ${MAP.maxZ - MAP.minZ + 48}`;
