import { OrthographicCamera, Vector3 } from "three";

import type { PreviewSafeArea } from "../model/layout";
import type { VectorTuple } from "../model/vector";

export type { VectorTuple } from "../model/vector";

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
}

const DEFAULT_CELL_VECTORS: readonly [VectorTuple, VectorTuple, VectorTuple] = [
  [3.2, 0, 0],
  [0, 3.2, 0],
  [0, 0, 3.2],
];

const FALLBACK_OUTWARD = new Vector3(0, 0, 1).normalize();
const FALLBACK_BASAL_REFERENCE = new Vector3(1, 0, 0).normalize();
const NAUMANN_HORIZONTAL_RATIO = 1 / 3;
const NAUMANN_VERTICAL_RATIO = 1 / 6;
const PROJECTED_FIT_PADDING_RATIO = 2;

export interface StandardViewVectors {
  outward: Vector3;
  up: Vector3;
  vertical: Vector3;
}

export function computeStandardCameraPose(
  vectors: VectorTuple[],
  span: number,
): StandardCameraPose {
  const { outward, up } = computeStandardViewVectors(vectors);
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

export function computeStandardViewVectors(
  vectors: VectorTuple[],
): StandardViewVectors {
  const [vectorA, vectorB, vectorC] = withDefaultCellVectors(vectors);
  const a = vectorFromTuple(vectorA, FALLBACK_BASAL_REFERENCE);
  const b = vectorFromTuple(vectorB, new Vector3(0, 1, 0));
  const vertical = normalizedVector(vectorC, FALLBACK_OUTWARD);
  const basalReference =
    projectedAxis(a, vertical) ??
    projectedAxis(b, vertical) ??
    stablePerpendicular(vertical);
  const basalRight = vertical.clone().cross(basalReference).normalize();
  const outward = basalReference
    .clone()
    .add(basalRight.multiplyScalar(NAUMANN_HORIZONTAL_RATIO))
    .add(vertical.clone().multiplyScalar(NAUMANN_VERTICAL_RATIO))
    .normalize();
  const up = vertical
    .clone()
    .sub(outward.clone().multiplyScalar(vertical.dot(outward)));

  if (up.lengthSq() < 1e-12) {
    up.copy(stablePerpendicular(outward));
  } else {
    up.normalize();
  }

  return { outward, up, vertical };
}

export function computeCameraFitZoom(
  bounds: CameraFitBounds,
  width: number,
  height: number,
  safeArea: PreviewSafeArea,
): number {
  const availableWidth = Math.max(1, width - safeArea.left - safeArea.right);
  const availableHeight = Math.max(1, height - safeArea.top - safeArea.bottom);
  const availableLength = Math.sqrt(availableWidth * availableHeight);
  const projectedLength = Math.sqrt(
    safeDimension(bounds.projectedWidth) *
      safeDimension(bounds.projectedHeight),
  );

  return Math.max(
    0.01,
    availableLength / (projectedLength * PROJECTED_FIT_PADDING_RATIO),
  );
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

function vectorFromTuple(vector: VectorTuple, fallback: Vector3): Vector3 {
  const nextVector = new Vector3(...vector);
  if (nextVector.lengthSq() < 1e-12) {
    return fallback.clone();
  }

  return nextVector;
}

function normalizedVector(vector: VectorTuple, fallback: Vector3): Vector3 {
  return vectorFromTuple(vector, fallback).normalize();
}

function projectedAxis(vector: Vector3, axis: Vector3): Vector3 | null {
  const projected = vector
    .clone()
    .sub(axis.clone().multiplyScalar(vector.dot(axis)));
  if (projected.lengthSq() < 1e-12) {
    return null;
  }

  return projected.normalize();
}

function stablePerpendicular(outward: Vector3): Vector3 {
  const projected = FALLBACK_OUTWARD.clone().sub(
    outward.clone().multiplyScalar(FALLBACK_OUTWARD.dot(outward)),
  );
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
