import { OrthographicCamera, Vector3 } from "three";

import type { PreviewSafeArea } from "./LatticeScene";

export type VectorTuple = [number, number, number];

export interface StandardCameraPose {
  cameraPosition: VectorTuple;
  cameraUp: VectorTuple;
  distance: number;
  outward: VectorTuple;
  target: VectorTuple;
}

export interface OrthographicFrustum {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

export interface CameraFitBounds {
  projectedHeight: number;
  projectedWidth: number;
  span: number;
}

const DEFAULT_CELL_VECTORS: readonly [VectorTuple, VectorTuple, VectorTuple] = [
  [3.2, 0, 0],
  [0, 3.2, 0],
  [0, 0, 3.2],
];

const FALLBACK_OUTWARD = new Vector3(0, 0, 1).normalize();
const FALLBACK_UP = new Vector3(0, 1, 0).normalize();
const SPAN_FIT_PADDING_RATIO = 1.7;
const PROJECTED_FIT_PADDING_RATIO = 1.08;
const MAX_PROJECTED_FIT_BOOST = 1.5;

export function computeStandardCameraPose(
  vectors: VectorTuple[],
  span: number,
): StandardCameraPose {
  const [vectorA, vectorB, vectorC] = withDefaultCellVectors(vectors);
  const a = vectorFromTuple(vectorA, new Vector3(1, 0, 0));
  const b = vectorFromTuple(vectorB, new Vector3(0, 1, 0));
  const c = vectorFromTuple(vectorC, new Vector3(0, 0, 1));
  const outward = normalizedVector(vectorC, FALLBACK_OUTWARD);
  const reciprocalB = computeReciprocalVectorB(a, b, c);
  const up = reciprocalB.sub(outward.clone().multiplyScalar(reciprocalB.dot(outward)));

  if (up.lengthSq() < 1e-12) {
    up.copy(stablePerpendicular(outward));
  } else {
    up.normalize();
  }

  const distance = Math.max(4, span * 4);
  const cameraPosition = outward.clone().multiplyScalar(distance);

  return {
    cameraPosition: vectorTuple(cameraPosition),
    cameraUp: vectorTuple(up),
    distance,
    outward: vectorTuple(outward),
    target: [0, 0, 0],
  };
}

export function computeCameraFitZoom(
  bounds: CameraFitBounds,
  width: number,
  height: number,
  safeArea: PreviewSafeArea,
): number {
  const availableWidth = Math.max(1, width - safeArea.left - safeArea.right);
  const availableHeight = Math.max(1, height - safeArea.top - safeArea.bottom);
  const availableSide = Math.min(availableWidth, availableHeight);
  const spanZoom = Math.max(
    0.01,
    availableSide / (safeDimension(bounds.span) * SPAN_FIT_PADDING_RATIO),
  );
  const projectedZoom = Math.max(
    0.01,
    Math.min(
      availableWidth / (safeDimension(bounds.projectedWidth) * PROJECTED_FIT_PADDING_RATIO),
      availableHeight / (safeDimension(bounds.projectedHeight) * PROJECTED_FIT_PADDING_RATIO),
    ),
  );

  return Math.max(spanZoom, Math.min(projectedZoom, spanZoom * MAX_PROJECTED_FIT_BOOST));
}

export function computeOrthographicFrustum(
  width: number,
  height: number,
  zoom: number,
  safeArea: PreviewSafeArea,
): OrthographicFrustum {
  const safeZoom = Math.max(0.01, zoom);
  const viewportWidth = Math.max(1, width);
  const viewportHeight = Math.max(1, height);
  const centerX = (safeArea.right - safeArea.left) / (2 * safeZoom);
  const centerY = (safeArea.top - safeArea.bottom) / (2 * safeZoom);

  return {
    bottom: -viewportHeight / 2 + centerY,
    left: -viewportWidth / 2 + centerX,
    right: viewportWidth / 2 + centerX,
    top: viewportHeight / 2 + centerY,
  };
}

export function applyOrthographicFrustum(
  camera: OrthographicCamera,
  width: number,
  height: number,
  zoom: number,
  safeArea: PreviewSafeArea,
) {
  const frustum = computeOrthographicFrustum(width, height, zoom, safeArea);

  camera.left = frustum.left;
  camera.right = frustum.right;
  camera.top = frustum.top;
  camera.bottom = frustum.bottom;
  camera.zoom = zoom;
  camera.updateProjectionMatrix();
}

export function withDefaultCellVectors(
  vectors: VectorTuple[],
): [VectorTuple, VectorTuple, VectorTuple] {
  return [
    vectors[0] ?? DEFAULT_CELL_VECTORS[0],
    vectors[1] ?? DEFAULT_CELL_VECTORS[1],
    vectors[2] ?? DEFAULT_CELL_VECTORS[2],
  ];
}

function normalizedVector(vector: VectorTuple, fallback: Vector3): Vector3 {
  const nextVector = new Vector3(...vector);
  if (nextVector.lengthSq() < 1e-12) {
    return fallback.clone();
  }

  return nextVector.normalize();
}

function vectorFromTuple(vector: VectorTuple, fallback: Vector3): Vector3 {
  const nextVector = new Vector3(...vector);
  if (nextVector.lengthSq() < 1e-12) {
    return fallback.clone();
  }

  return nextVector;
}

function computeReciprocalVectorB(a: Vector3, b: Vector3, c: Vector3): Vector3 {
  const volume = a.dot(b.clone().cross(c));
  if (Math.abs(volume) < 1e-12) {
    return FALLBACK_OUTWARD.clone();
  }

  return c.clone().cross(a).divideScalar(volume);
}

function stablePerpendicular(outward: Vector3): Vector3 {
  const projected = FALLBACK_OUTWARD.clone().sub(outward.clone().multiplyScalar(FALLBACK_OUTWARD.dot(outward)));
  if (projected.lengthSq() >= 1e-12) {
    return projected.normalize();
  }

  return new Vector3(1, 0, 0)
    .sub(outward.clone().multiplyScalar(outward.x))
    .normalize();
}

function vectorTuple(vector: Vector3): VectorTuple {
  return [vector.x, vector.y, vector.z];
}

function safeDimension(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}
