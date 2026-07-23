import type { AtomSpec, SceneSpec } from "../api/scene";

export type MeasurementTool = "bond" | "distance" | "angle" | "dihedral";

export interface AtomInstanceIdentity {
  siteIndex: number;
  imageOffset: [number, number, number];
}

export interface MeasurementRecord {
  id: string;
  type: MeasurementTool;
  points: AtomInstanceIdentity[];
}

export interface ResolvedMeasurement {
  record: MeasurementRecord;
  atoms: AtomSpec[];
  value: number;
  unit: "Å" | "°";
  label: string;
}

export const MEASUREMENT_POINT_COUNTS: Record<MeasurementTool, number> = {
  bond: 2,
  distance: 2,
  angle: 3,
  dihedral: 4,
};

export function atomInstanceIdentity(atom: AtomSpec): AtomInstanceIdentity {
  return { siteIndex: atom.siteIndex, imageOffset: [...atom.imageOffset] };
}

export function sameAtomInstance(
  left: AtomInstanceIdentity,
  right: AtomInstanceIdentity,
): boolean {
  return left.siteIndex === right.siteIndex
    && left.imageOffset.every((value, index) => value === right.imageOffset[index]);
}

export function resolveMeasurement(
  scene: SceneSpec,
  record: MeasurementRecord,
): ResolvedMeasurement | null {
  const atoms = record.points.map((point) => scene.atoms.find((atom) =>
    sameAtomInstance(point, atomInstanceIdentity(atom))));
  if (atoms.some((atom) => atom === undefined)) {
    return null;
  }
  const resolvedAtoms = atoms as AtomSpec[];
  const value = measurementValue(record.type, resolvedAtoms.map((atom) => atom.position));
  if (!Number.isFinite(value)) {
    return null;
  }
  const unit = record.type === "bond" || record.type === "distance" ? "Å" : "°";
  return {
    record,
    atoms: resolvedAtoms,
    value,
    unit,
    label: `${value.toFixed(unit === "Å" ? 3 : 2)} ${unit}`,
  };
}

export function measurementValue(
  type: MeasurementTool,
  points: readonly [number, number, number][],
): number {
  if ((type === "bond" || type === "distance") && points.length >= 2) {
    return vectorLength(subtract(points[1]!, points[0]!));
  }
  if (type === "angle" && points.length >= 3) {
    const first = subtract(points[0]!, points[1]!);
    const second = subtract(points[2]!, points[1]!);
    return radiansToDegrees(Math.acos(clamp(dot(first, second) / (vectorLength(first) * vectorLength(second)), -1, 1)));
  }
  if (type === "dihedral" && points.length >= 4) {
    const b0 = subtract(points[0]!, points[1]!);
    const b1 = subtract(points[2]!, points[1]!);
    const b2 = subtract(points[3]!, points[2]!);
    const normal1 = cross(b0, b1);
    const normal2 = cross(b1, b2);
    const denominator = vectorLength(normal1) * vectorLength(normal2);
    if (denominator === 0) {
      return Number.NaN;
    }
    return radiansToDegrees(Math.acos(clamp(dot(normal1, normal2) / denominator, -1, 1)));
  }
  return Number.NaN;
}

export function appendMeasurementPoint(
  draft: readonly AtomInstanceIdentity[],
  point: AtomInstanceIdentity,
  tool: Exclude<MeasurementTool, "bond">,
): { draft: AtomInstanceIdentity[]; completed?: MeasurementRecord } {
  // Repeated pointer events or an accidental second click on the same sphere
  // must not advance a geometric measurement. Different periodic images remain
  // valid because imageOffset is part of the identity.
  if (draft.some((entry) => sameAtomInstance(entry, point))) {
    return { draft: [...draft] };
  }
  const next = [...draft, point];
  if (next.length < MEASUREMENT_POINT_COUNTS[tool]) {
    return { draft: next };
  }
  return {
    draft: [],
    completed: { id: crypto.randomUUID(), type: tool, points: next },
  };
}

function subtract(
  left: readonly number[],
  right: readonly number[],
): [number, number, number] {
  return [left[0]! - right[0]!, left[1]! - right[1]!, left[2]! - right[2]!];
}

function dot(left: readonly number[], right: readonly number[]): number {
  return left[0]! * right[0]! + left[1]! * right[1]! + left[2]! * right[2]!;
}

function cross(left: readonly number[], right: readonly number[]): [number, number, number] {
  return [
    left[1]! * right[2]! - left[2]! * right[1]!,
    left[2]! * right[0]! - left[0]! * right[2]!,
    left[0]! * right[1]! - left[1]! * right[0]!,
  ];
}

function vectorLength(vector: readonly number[]): number {
  return Math.hypot(vector[0]!, vector[1]!, vector[2]!);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function radiansToDegrees(value: number): number {
  return value * 180 / Math.PI;
}
