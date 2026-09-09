import * as THREE from 'three';
import type { VehicleSpec } from './safety';
export function assertModelEnvelope(root: THREE.Object3D, spec: VehicleSpec) {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root, true),
    epsilon = 0.00001;
  if (
    bounds.min.x < -spec.halfWidth - epsilon ||
    bounds.max.x > spec.halfWidth + epsilon ||
    bounds.min.z < -spec.halfLength - epsilon ||
    bounds.max.z > spec.halfLength + epsilon ||
    bounds.min.y < spec.bottom - epsilon ||
    bounds.max.y > spec.top + epsilon
  )
    throw new Error(
      `The ${spec.kind} model exceeds its physical clearance envelope.`,
    );
}
