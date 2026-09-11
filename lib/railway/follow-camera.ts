import { OrthographicCamera, Vector3, type PerspectiveCamera } from 'three';
import type { Simulation } from './simulation';

/** A depot placeholder is not a visible locomotive and must never be a camera target. */
export function trainCameraTarget(sim: Simulation, id: number) {
  const train = sim.trains[id];
  if (!train || !sim.visible(train)) return null;
  const { p } = sim.vehiclePosition(train, 0);
  return new Vector3(p.x, p.y, p.z);
}

export class FollowCamera {
  private waiting = true;
  private transitioning = true;
  private transitionTime = 0;

  request() {
    this.waiting = true;
    this.transitioning = true;
  }

  /** Projection switches preserve the user's apparent scale and viewing distance. */
  preserveView() {
    this.transitioning = false;
  }

  update(
    camera: OrthographicCamera | PerspectiveCamera,
    focus: Vector3,
    subject: Vector3 | null,
    delta: number,
    reducedMotion = false,
  ) {
    if (!subject) {
      this.waiting = true;
      return;
    }
    if (this.waiting) {
      this.waiting = false;
      this.transitioning = true;
      this.transitionTime = 0;
    }
    const alpha = reducedMotion ? 1 : 1 - Math.exp(-Math.max(0, delta) * 5);
    const movement = subject.clone().sub(focus).multiplyScalar(alpha);
    focus.add(movement);
    if (this.transitioning) {
      this.transitionTime += Math.max(0, delta);
      const offset =
        camera instanceof OrthographicCamera
          ? new Vector3(100, 110, 125)
          : new Vector3(15, 10, 19);
      const goal = subject.clone().add(offset);
      camera.position.lerp(goal, alpha);
      let zoomReady = true;
      if (camera instanceof OrthographicCamera) {
        const zoom = Math.min(48, camera.top / 17.2);
        camera.zoom += (zoom - camera.zoom) * alpha;
        camera.updateProjectionMatrix();
        zoomReady = Math.abs(camera.zoom - zoom) < 0.001;
      }
      if (
        this.transitionTime >= 2 ||
        (camera.position.distanceTo(goal) < 0.25 &&
          focus.distanceTo(subject) < 0.1 &&
          zoomReady)
      )
        this.transitioning = false;
    } else camera.position.add(movement);
  }
}
