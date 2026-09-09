import * as THREE from 'three';
import { type TrackEdge } from './network';

// The renderer adapts the purchased samples; it never substitutes another curve.
export class TrackCurve extends THREE.Curve<THREE.Vector3> {
  private cumulative: number[] = [0];
  constructor(readonly edge: TrackEdge) {
    super();
    for (let i = 1; i < edge.points.length; i++) {
      const a = edge.points[i - 1],
        b = edge.points[i];
      this.cumulative.push(
        this.cumulative[i - 1] + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z),
      );
    }
  }
  override getLength() {
    return this.edge.length;
  }
  override getPoint(t: number, target = new THREE.Vector3()) {
    const at = THREE.MathUtils.clamp(t, 0, 1) * this.edge.length;
    let low = 1,
      high = this.cumulative.length - 1;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (this.cumulative[mid] < at) low = mid + 1;
      else high = mid;
    }
    const a = this.edge.points[low - 1],
      b = this.edge.points[low];
    const span = this.cumulative[low] - this.cumulative[low - 1],
      u = span ? (at - this.cumulative[low - 1]) / span : 0;
    return target.set(
      a.x + (b.x - a.x) * u,
      a.y + (b.y - a.y) * u,
      a.z + (b.z - a.z) * u,
    );
  }
  override getPointAt(t: number, target?: THREE.Vector3) {
    return this.getPoint(t, target);
  }
  override getTangentAt(t: number, target = new THREE.Vector3()) {
    return target
      .copy(this.getPoint(Math.min(1, t + 0.001)))
      .sub(this.getPoint(Math.max(0, t - 0.001)))
      .normalize();
  }
}
