import { Vector3 } from "three";

import { withDefaultCellVectors, type VectorTuple } from "./viewMath";

export type OrientationGizmoAxisLabel = "a" | "b" | "c";

export interface OrientationGizmoAxisSpec {
  color: string;
  direction: VectorTuple;
  label: OrientationGizmoAxisLabel;
}

const FALLBACK_DIRECTIONS: Record<OrientationGizmoAxisLabel, Vector3> = {
  a: new Vector3(1, 0, 0),
  b: new Vector3(0, 1, 0),
  c: new Vector3(0, 0, 1),
};

const AXIS_COLORS: Record<OrientationGizmoAxisLabel, string> = {
  a: "#d27686",
  b: "#80c393",
  c: "#75a4dd",
};

export function computeOrientationGizmoAxes(vectors: VectorTuple[]): OrientationGizmoAxisSpec[] {
  const [vectorA, vectorB, vectorC] = withDefaultCellVectors(vectors);

  return [
    {
      color: AXIS_COLORS.a,
      direction: normalizeAxisVector(vectorA, FALLBACK_DIRECTIONS.a),
      label: "a",
    },
    {
      color: AXIS_COLORS.b,
      direction: normalizeAxisVector(vectorB, FALLBACK_DIRECTIONS.b),
      label: "b",
    },
    {
      color: AXIS_COLORS.c,
      direction: normalizeAxisVector(vectorC, FALLBACK_DIRECTIONS.c),
      label: "c",
    },
  ];
}

function normalizeAxisVector(vector: VectorTuple, fallback: Vector3): VectorTuple {
  const nextVector = new Vector3(...vector);
  if (nextVector.lengthSq() < 1e-12) {
    return vectorTuple(fallback);
  }

  return vectorTuple(nextVector.normalize());
}

function vectorTuple(vector: Vector3): VectorTuple {
  return [vector.x, vector.y, vector.z];
}
