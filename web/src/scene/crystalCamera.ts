import { Matrix4, Quaternion, Vector3 } from "three";

import { withDefaultCellVectors, type StandardCameraPose, type VectorTuple } from "./viewMath";

export type CrystalCameraPrimaryDirection = "upward" | "outward";
export type CrystalAxisLabel = "a" | "b" | "c";

export interface CrystalBasisVectors {
  direct: [Vector3, Vector3, Vector3];
  reciprocal: [Vector3, Vector3, Vector3];
}

export interface CrystalCameraState {
  direct: VectorTuple;
  primary: CrystalCameraPrimaryDirection;
  reciprocal: VectorTuple;
  rollDegrees: number;
  vectorsExpanded: boolean;
}

export interface CrystalCameraPose {
  cameraPosition: VectorTuple;
  cameraUp: VectorTuple;
  distance: number;
  outward: VectorTuple;
  quaternion: Quaternion;
  target: VectorTuple;
  up: VectorTuple;
}

export interface CrystalCameraVectors {
  outward: Vector3;
  primary: Vector3;
  secondary: Vector3;
  up: Vector3;
}

const EPSILON = 1e-10;
const CAMERA_TARGET = new Vector3(0, 0, 0);
const CAMERA_LOCAL_FORWARD = new Vector3(0, 0, 1);
const CAMERA_LOCAL_UP = new Vector3(0, 1, 0);
const DEFAULT_DIRECT: VectorTuple = [0, 0, 1];
const DEFAULT_RECIPROCAL: VectorTuple = [0, 1, 0];
const FALLBACK_DIRECT_AXES: Record<CrystalAxisLabel, VectorTuple> = {
  a: [1, 0, 0],
  b: [0, 1, 0],
  c: [0, 0, 1],
};

export function createDefaultCrystalCameraState(): CrystalCameraState {
  return {
    direct: DEFAULT_DIRECT,
    primary: "outward",
    reciprocal: DEFAULT_RECIPROCAL,
    rollDegrees: 0,
    vectorsExpanded: false,
  };
}

export function crystalAxisDirectCoefficients(axis: CrystalAxisLabel): VectorTuple {
  return FALLBACK_DIRECT_AXES[axis];
}

export function computeCrystalBasisVectors(vectors: VectorTuple[]): CrystalBasisVectors {
  const [vectorA, vectorB, vectorC] = withDefaultCellVectors(vectors);
  const a = vectorFromTuple(vectorA, new Vector3(1, 0, 0));
  const b = vectorFromTuple(vectorB, new Vector3(0, 1, 0));
  const c = vectorFromTuple(vectorC, new Vector3(0, 0, 1));
  const volume = a.dot(b.clone().cross(c));

  if (Math.abs(volume) < EPSILON) {
    return {
      direct: [a, b, c],
      reciprocal: [
        new Vector3(1, 0, 0),
        new Vector3(0, 1, 0),
        new Vector3(0, 0, 1),
      ],
    };
  }

  return {
    direct: [a, b, c],
    reciprocal: [
      b.clone().cross(c).divideScalar(volume),
      c.clone().cross(a).divideScalar(volume),
      a.clone().cross(b).divideScalar(volume),
    ],
  };
}

export function computeCrystalCameraPose(
  vectors: VectorTuple[],
  state: CrystalCameraState,
  span: number,
): CrystalCameraPose {
  const cameraVectors = computeCrystalCameraVectors(vectors, state);
  const distance = Math.max(4, span * 4);
  const cameraPosition = cameraVectors.outward.clone().multiplyScalar(distance);
  const quaternion = cameraQuaternionFromOutwardUp(cameraVectors.outward, cameraVectors.up);

  return {
    cameraPosition: vectorTuple(cameraPosition),
    cameraUp: vectorTuple(cameraVectors.up),
    distance,
    outward: vectorTuple(cameraVectors.outward),
    quaternion,
    target: vectorTuple(CAMERA_TARGET),
    up: vectorTuple(cameraVectors.up),
  };
}

export function computeDefaultCrystalCameraPose(
  vectors: VectorTuple[],
  span: number,
): StandardCameraPose {
  const pose = computeCrystalCameraPose(vectors, createDefaultCrystalCameraState(), span);

  return {
    cameraPosition: pose.cameraPosition,
    cameraUp: pose.cameraUp,
    distance: pose.distance,
    outward: pose.outward,
    target: pose.target,
  };
}

export function computeCrystalCameraVectors(
  vectors: VectorTuple[],
  state: CrystalCameraState,
): CrystalCameraVectors {
  const basis = computeCrystalBasisVectors(vectors);
  const direct = coefficientsToVector(state.direct, basis.direct, new Vector3(0, 0, 1)).normalize();
  const reciprocal = coefficientsToVector(
    state.reciprocal,
    basis.reciprocal,
    new Vector3(0, 1, 0),
  );
  const fallbackSecondary = vestaLikeSecondaryForPrimary(basis, direct);
  const secondary = projectPerpendicular(reciprocal, direct, fallbackSecondary);

  if (state.primary === "upward") {
    return {
      outward: secondary,
      primary: direct,
      secondary,
      up: direct,
    };
  }

  return {
    outward: direct,
    primary: direct,
    secondary,
    up: secondary,
  };
}

export function applyCrystalCameraRoll(
  vectors: VectorTuple[],
  state: CrystalCameraState,
  rollDegrees: number,
): CrystalCameraState {
  const basis = computeCrystalBasisVectors(vectors);
  const primary = coefficientsToVector(state.direct, basis.direct, new Vector3(0, 0, 1)).normalize();
  const anchor = vestaLikeSecondaryForPrimary(basis, primary);
  const secondary = anchor
    .clone()
    .applyAxisAngle(primary, degreesToRadians(rollDegrees))
    .normalize();

  return {
    ...state,
    reciprocal: normalizeCoefficients(vectorToReciprocalCoefficients(secondary, basis)),
    rollDegrees: normalizeRollDegrees(rollDegrees),
  };
}

export function stateWithPrimaryDirection(
  vectors: VectorTuple[],
  quaternion: Quaternion,
  primary: CrystalCameraPrimaryDirection,
  vectorsExpanded: boolean,
): CrystalCameraState {
  const poseVectors = vectorsFromCameraQuaternion(quaternion);

  return stateFromViewVectors(vectors, primary, poseVectors.up, poseVectors.outward, vectorsExpanded);
}

export function stateFromViewVectors(
  vectors: VectorTuple[],
  primary: CrystalCameraPrimaryDirection,
  up: Vector3,
  outward: Vector3,
  vectorsExpanded = false,
): CrystalCameraState {
  const basis = computeCrystalBasisVectors(vectors);
  const primaryVector = primary === "upward" ? up : outward;
  const secondaryVector = primary === "upward" ? outward : up;
  const safePrimary = normalizeOrFallback(primaryVector, new Vector3(0, 0, 1));
  const anchor = vestaLikeSecondaryForPrimary(basis, safePrimary);
  const safeSecondary = projectPerpendicular(secondaryVector, safePrimary, anchor);
  const rollDegrees = signedAngleAroundAxis(anchor, safeSecondary, safePrimary);

  return {
    direct: normalizeCoefficients(vectorToDirectCoefficients(safePrimary, basis)),
    primary,
    reciprocal: normalizeCoefficients(vectorToReciprocalCoefficients(safeSecondary, basis)),
    rollDegrees: normalizeRollDegrees(rollDegrees),
    vectorsExpanded,
  };
}

export function stateWithDirectAxis(
  vectors: VectorTuple[],
  state: CrystalCameraState,
  axis: CrystalAxisLabel,
): CrystalCameraState {
  const nextState = {
    ...state,
    direct: crystalAxisDirectCoefficients(axis),
  };

  return applyCrystalCameraRoll(vectors, nextState, 0);
}

export function normalizeCoefficients(coefficients: VectorTuple): VectorTuple {
  const finite = coefficients.map((value) => (Number.isFinite(value) ? value : 0)) as VectorTuple;
  const maxAbs = Math.max(...finite.map((value) => Math.abs(value)));

  if (maxAbs < EPSILON) {
    return [0, 0, 0];
  }

  return finite.map((value) => snapCoefficient(value / maxAbs)) as VectorTuple;
}

export function parseVectorCoefficients(values: readonly string[]): VectorTuple | null {
  if (values.length !== 3) {
    return null;
  }

  const parsed = values.map((value) => Number(value.trim()));
  if (parsed.some((value) => !Number.isFinite(value))) {
    return null;
  }

  return parsed as VectorTuple;
}

export function normalizeRollDegrees(rollDegrees: number): number {
  if (!Number.isFinite(rollDegrees)) {
    return 0;
  }

  const normalized = ((((rollDegrees + 180) % 360) + 360) % 360) - 180;
  return Math.abs(normalized) < 0.000001 ? 0 : normalized;
}

export function vectorsFromCameraQuaternion(quaternion: Quaternion): {
  outward: Vector3;
  up: Vector3;
} {
  return {
    outward: CAMERA_LOCAL_FORWARD.clone().applyQuaternion(quaternion).normalize(),
    up: CAMERA_LOCAL_UP.clone().applyQuaternion(quaternion).normalize(),
  };
}

function vestaLikeSecondaryForPrimary(
  basis: CrystalBasisVectors,
  primary: Vector3,
): Vector3 {
  for (const candidate of [basis.reciprocal[2], basis.reciprocal[1], basis.reciprocal[0]]) {
    const projected = candidate.clone().sub(primary.clone().multiplyScalar(candidate.dot(primary)));
    if (projected.lengthSq() >= EPSILON) {
      return projected.normalize();
    }
  }

  return stablePerpendicular(primary);
}

function cameraQuaternionFromOutwardUp(outward: Vector3, up: Vector3): Quaternion {
  const z = normalizeOrFallback(outward, new Vector3(0, 0, 1));
  const y = projectPerpendicular(up, z, stablePerpendicular(z));
  const x = y.clone().cross(z).normalize();
  const correctedY = z.clone().cross(x).normalize();
  const matrix = new Matrix4().makeBasis(x, correctedY, z);

  return new Quaternion().setFromRotationMatrix(matrix).normalize();
}

function coefficientsToVector(
  coefficients: VectorTuple,
  basisVectors: [Vector3, Vector3, Vector3],
  fallback: Vector3,
): Vector3 {
  const vector = basisVectors[0]
    .clone()
    .multiplyScalar(coefficients[0])
    .add(basisVectors[1].clone().multiplyScalar(coefficients[1]))
    .add(basisVectors[2].clone().multiplyScalar(coefficients[2]));

  return normalizeOrFallback(vector, fallback);
}

function vectorToDirectCoefficients(vector: Vector3, basis: CrystalBasisVectors): VectorTuple {
  return [
    vector.dot(basis.reciprocal[0]),
    vector.dot(basis.reciprocal[1]),
    vector.dot(basis.reciprocal[2]),
  ];
}

function vectorToReciprocalCoefficients(vector: Vector3, basis: CrystalBasisVectors): VectorTuple {
  return [
    vector.dot(basis.direct[0]),
    vector.dot(basis.direct[1]),
    vector.dot(basis.direct[2]),
  ];
}

function projectPerpendicular(vector: Vector3, axis: Vector3, fallback: Vector3): Vector3 {
  const safeAxis = normalizeOrFallback(axis, new Vector3(0, 0, 1));
  const projected = vector.clone().sub(safeAxis.clone().multiplyScalar(vector.dot(safeAxis)));

  if (projected.lengthSq() >= EPSILON) {
    return projected.normalize();
  }

  return normalizeOrFallback(fallback, stablePerpendicular(safeAxis));
}

function stablePerpendicular(axis: Vector3): Vector3 {
  const candidates = [
    new Vector3(0, 0, 1),
    new Vector3(0, 1, 0),
    new Vector3(1, 0, 0),
  ];

  for (const candidate of candidates) {
    const projected = candidate.clone().sub(axis.clone().multiplyScalar(candidate.dot(axis)));
    if (projected.lengthSq() >= EPSILON) {
      return projected.normalize();
    }
  }

  return new Vector3(0, 1, 0);
}

function signedAngleAroundAxis(from: Vector3, to: Vector3, axis: Vector3): number {
  const safeFrom = projectPerpendicular(from, axis, stablePerpendicular(axis));
  const safeTo = projectPerpendicular(to, axis, safeFrom);
  const sin = axis.dot(safeFrom.clone().cross(safeTo));
  const cos = safeFrom.dot(safeTo);

  return radiansToDegrees(Math.atan2(sin, cos));
}

function normalizeOrFallback(vector: Vector3, fallback: Vector3): Vector3 {
  if (vector.lengthSq() < EPSILON) {
    return fallback.clone().normalize();
  }

  return vector.clone().normalize();
}

function vectorFromTuple(tuple: VectorTuple, fallback: Vector3): Vector3 {
  const vector = new Vector3(...tuple);

  return vector.lengthSq() < EPSILON ? fallback.clone() : vector;
}

function snapCoefficient(value: number): number {
  const rounded = Math.round(value);
  if (Math.abs(value - rounded) < 0.000001) {
    return rounded;
  }

  return Number(value.toFixed(4));
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

function vectorTuple(vector: Vector3): VectorTuple {
  return [vector.x, vector.y, vector.z];
}
