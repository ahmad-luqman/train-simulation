// One shared extent for terrain, construction, cameras and every plan view.
// Vehicle size and speed stay unchanged as the railway gains room to operate.
export const MAP_SCALE = 2.4;
export const MAP = {
  halfWidth: 320,
  halfDepth: 300,
  minX: -86 * MAP_SCALE,
  maxX: 86 * MAP_SCALE,
  minZ: -67 * MAP_SCALE,
  maxZ: 78 * MAP_SCALE,
  overviewHalf: 260,
  maxTrackLength: 180 * MAP_SCALE,
};
export const MAP_VIEWBOX = `${-MAP.halfWidth} ${-MAP.halfDepth} ${MAP.halfWidth * 2} ${MAP.halfDepth * 2}`;
