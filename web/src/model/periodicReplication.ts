import type {
  AtomSpec,
  BondSpec,
  ImageReason,
  PolyhedronSpec,
  SceneSpec,
  VisibilityDependency,
} from "../api/scene";

export interface CellAxisRange {
  from: number;
  to: number;
}

export interface PeriodicCellRange {
  a: CellAxisRange;
  b: CellAxisRange;
  c: CellAxisRange;
}

export interface PeriodicReplicationBudget {
  atomCandidates: number;
  bondCandidates: number;
  polyhedronCandidates: number;
  gridLineCandidates: number;
}

export interface PeriodicReplicationEstimate {
  cellCount: number;
  axisCounts: readonly [number, number, number];
  atomCandidates: number;
  bondCandidates: number;
  polyhedronCandidates: number;
  gridLineCandidates: number;
}

export type PeriodicCellRangeErrorCode =
  | "invalid-integer"
  | "invalid-order"
  | "missing-origin"
  | "unsafe-arithmetic"
  | "non-periodic"
  | "budget-exceeded";

export interface PeriodicCellRangeError {
  valid: false;
  code: PeriodicCellRangeErrorCode;
  message: string;
  estimate?: PeriodicReplicationEstimate;
  budgetKey?: keyof PeriodicReplicationBudget;
}

export interface ValidPeriodicCellRange {
  valid: true;
}

export interface ValidPeriodicReplication {
  valid: true;
  estimate: PeriodicReplicationEstimate;
}

export type PeriodicCellRangeValidation =
  | ValidPeriodicCellRange
  | PeriodicCellRangeError;

export type PeriodicReplicationValidation =
  | ValidPeriodicReplication
  | PeriodicCellRangeError;

export const DEFAULT_PERIODIC_CELL_RANGE: Readonly<PeriodicCellRange> = Object.freeze({
  a: Object.freeze({ from: 0, to: 0 }),
  b: Object.freeze({ from: 0, to: 0 }),
  c: Object.freeze({ from: 0, to: 0 }),
});

export const DEFAULT_PERIODIC_REPLICATION_BUDGET: Readonly<PeriodicReplicationBudget> =
  Object.freeze({
    atomCandidates: 20_000,
    bondCandidates: 15_000,
    polyhedronCandidates: 1_000,
    gridLineCandidates: 20_000,
  });

type AxisName = keyof PeriodicCellRange;
type ImageOffset = readonly [number, number, number];

const AXES: readonly AxisName[] = ["a", "b", "c"];
const DEPENDENCY_ORDER: readonly VisibilityDependency[] = [
  "boundaryAtoms",
  "oneHopBondedAtoms",
];
const IMAGE_REASON_ORDER: readonly ImageReason[] = ["boundary", "bonded"];
const FLOAT_ZERO_TOLERANCE = 1e-12;

export function createDefaultPeriodicCellRange(): PeriodicCellRange {
  return {
    a: { from: 0, to: 0 },
    b: { from: 0, to: 0 },
    c: { from: 0, to: 0 },
  };
}

export function isDefaultPeriodicCellRange(range: PeriodicCellRange): boolean {
  return AXES.every((axis) => range[axis].from === 0 && range[axis].to === 0);
}

export function periodicCellCount(range: PeriodicCellRange): number {
  const validation = validatePeriodicCellRange(range);
  if (!validation.valid) {
    return 0;
  }

  const [aCount, bCount, cCount] = axisCounts(range);
  const abCount = safeProduct(aCount, bCount);
  return abCount === null ? 0 : (safeProduct(abCount, cCount) ?? 0);
}

export function periodicCellRangeStatus(range: PeriodicCellRange): string {
  const validation = validatePeriodicCellRange(range);
  if (!validation.valid) {
    return "Invalid cell range";
  }

  const [aCount, bCount, cCount] = axisCounts(range);
  const cellCount = periodicCellCount(range);
  return `${aCount} × ${bCount} × ${cCount} · ${cellCount} ${cellCount === 1 ? "cell" : "cells"}`;
}

export function validatePeriodicCellRange(
  range: PeriodicCellRange,
): PeriodicCellRangeValidation {
  for (const axis of AXES) {
    const { from, to } = range[axis];
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to)) {
      return invalidRange(
        "invalid-integer",
        `${axis} From and To must be safe integers.`,
      );
    }
    if (from > to) {
      return invalidRange("invalid-order", `${axis} From cannot be greater than To.`);
    }
    if (from > 0 || to < 0) {
      return invalidRange(
        "missing-origin",
        `${axis} range must include the original cell (0).`,
      );
    }
    if (!Number.isSafeInteger(to - from + 1)) {
      return invalidRange("unsafe-arithmetic", `${axis} range is too large.`);
    }
  }

  if (periodicCellCountUnchecked(range) === null) {
    return invalidRange("unsafe-arithmetic", "The requested cell count is too large.");
  }

  return { valid: true };
}

export function estimatePeriodicReplication(
  scene: SceneSpec,
  range: PeriodicCellRange,
): PeriodicReplicationEstimate | null {
  if (!validatePeriodicCellRange(range).valid) {
    return null;
  }

  const [aCount, bCount, cCount] = axisCounts(range);
  const cellCount = periodicCellCountUnchecked(range);
  if (cellCount === null) {
    return null;
  }

  const atomCandidates = safeProduct(scene.atoms.length, cellCount);
  const bondCandidates = safeProduct(scene.bonds.length, cellCount);
  const polyhedronCandidates = safeProduct(scene.polyhedra.length, cellCount);
  const gridLineCandidates = estimateGridLineCandidates(aCount, bCount, cCount);
  if (
    atomCandidates === null ||
    bondCandidates === null ||
    polyhedronCandidates === null ||
    gridLineCandidates === null
  ) {
    return null;
  }

  return {
    cellCount,
    axisCounts: [aCount, bCount, cCount],
    atomCandidates,
    bondCandidates,
    polyhedronCandidates,
    gridLineCandidates,
  };
}

export function validatePeriodicReplicationBudget(
  scene: SceneSpec,
  range: PeriodicCellRange,
  budget: Readonly<PeriodicReplicationBudget> = DEFAULT_PERIODIC_REPLICATION_BUDGET,
): PeriodicReplicationValidation {
  const rangeValidation = validatePeriodicCellRange(range);
  if (!rangeValidation.valid) {
    return rangeValidation;
  }
  if (!scene.cell.periodic && !isDefaultPeriodicCellRange(range)) {
    return invalidRange(
      "non-periodic",
      "Cell replication is unavailable because this structure is non-periodic.",
    );
  }

  const estimate = estimatePeriodicReplication(scene, range);
  if (!estimate) {
    return invalidRange(
      "unsafe-arithmetic",
      "The requested replication is too large to estimate safely.",
    );
  }

  for (const budgetKey of budgetKeys()) {
    if (estimate[budgetKey] > budget[budgetKey]) {
      return {
        valid: false,
        code: "budget-exceeded",
        message: `This range would generate ${estimate[budgetKey].toLocaleString()} ${budgetLabel(
          budgetKey,
        )}; the safety budget is ${budget[budgetKey].toLocaleString()}.`,
        estimate,
        budgetKey,
      };
    }
  }

  return { valid: true, estimate };
}

/**
 * Replicate a scene over inclusive lattice-cell ranges. The transformation is
 * deterministic and never mutates its input. Requested cells are unconditional;
 * dependency-controlled atoms and relations are retained only around the outer
 * completion region.
 */
export function replicateSceneForPeriodicRange(
  scene: SceneSpec | null,
  range: PeriodicCellRange,
  budget: Readonly<PeriodicReplicationBudget> = DEFAULT_PERIODIC_REPLICATION_BUDGET,
): SceneSpec | null {
  if (!scene || isDefaultPeriodicCellRange(range)) {
    return scene;
  }

  const validation = validatePeriodicReplicationBudget(scene, range, budget);
  if (!validation.valid) {
    throw new RangeError(validation.message);
  }

  if (scene.atoms.length === 0) {
    return {
      ...scene,
      atoms: [],
      bonds: [],
      polyhedra: [],
    };
  }

  const cellOffsets = periodicCellOffsets(range);
  const atomAccumulators: AtomAccumulator[] = [];
  const atomIndexByKey = new Map<string, number>();

  for (const cellOffset of cellOffsets) {
    for (const sourceAtom of scene.atoms) {
      const finalOffset = addOffsets(sourceAtom.imageOffset, cellOffset);
      const key = atomKey(sourceAtom.siteId, finalOffset);
      const interior = offsetInCellRange(finalOffset, range);
      const existingIndex = atomIndexByKey.get(key);
      if (existingIndex === undefined) {
        atomIndexByKey.set(key, atomAccumulators.length);
        atomAccumulators.push(
          createAtomAccumulator(scene, sourceAtom, cellOffset, finalOffset, interior),
        );
      } else {
        mergeAtomCandidate(atomAccumulators[existingIndex]!, sourceAtom, interior);
      }
    }
  }

  const atoms = atomAccumulators.map(finalizeAtomAccumulator);
  const bonds = replicateBonds(scene, cellOffsets, atomIndexByKey, atoms);
  const polyhedra = replicatePolyhedra(scene, cellOffsets, atomIndexByKey, atoms);

  return {
    ...scene,
    atoms,
    bonds,
    polyhedra,
  };
}

export function periodicCellOffsets(range: PeriodicCellRange): ImageOffset[] {
  if (!validatePeriodicCellRange(range).valid) {
    return [];
  }

  const offsets: ImageOffset[] = [[0, 0, 0]];
  for (let a = range.a.from; a <= range.a.to; a += 1) {
    for (let b = range.b.from; b <= range.b.to; b += 1) {
      for (let c = range.c.from; c <= range.c.to; c += 1) {
        if (a !== 0 || b !== 0 || c !== 0) {
          offsets.push([a, b, c]);
        }
      }
    }
  }
  return offsets;
}

interface AtomAccumulator {
  atom: AtomSpec;
  unconditional: boolean;
  dependencyGroups: VisibilityDependency[][];
  imageReasons: Set<ImageReason>;
}

function createAtomAccumulator(
  scene: SceneSpec,
  sourceAtom: AtomSpec,
  cellOffset: ImageOffset,
  finalOffset: ImageOffset,
  interior: boolean,
): AtomAccumulator {
  const unconditional =
    interior || dependencyGroupsAreUnconditional(sourceAtom.visibilityDependencyGroups);
  const shiftedPosition = translateCartesianPosition(
    sourceAtom.position,
    scene.cell.vectors,
    cellOffset,
  );
  const shiftedFractionalPosition = addFractionalOffset(
    sourceAtom.fractionalPosition,
    cellOffset,
  );
  const dependencyGroups = unconditional
    ? []
    : minimalDependencyGroups(sourceAtom.visibilityDependencyGroups);
  const imageReasons = new Set<ImageReason>(unconditional ? [] : sourceAtom.imageReasons);

  return {
    atom: {
      ...sourceAtom,
      id: atomInstanceId(sourceAtom.siteId, finalOffset),
      position: shiftedPosition,
      fractionalPosition: shiftedFractionalPosition,
      imageOffset: [...finalOffset],
      isPeriodicImage: !isZeroOffset(finalOffset),
      imageReasons: orderedImageReasons(imageReasons),
      visibilityDependencies: dependenciesForGroups(dependencyGroups),
      visibilityDependencyGroups: dependencyGroups,
    },
    unconditional,
    dependencyGroups,
    imageReasons,
  };
}

function mergeAtomCandidate(
  accumulator: AtomAccumulator,
  sourceAtom: AtomSpec,
  interior: boolean,
): void {
  const candidateUnconditional =
    interior || dependencyGroupsAreUnconditional(sourceAtom.visibilityDependencyGroups);
  if (accumulator.unconditional || candidateUnconditional) {
    accumulator.unconditional = true;
    accumulator.dependencyGroups = [];
    accumulator.imageReasons.clear();
    return;
  }

  accumulator.dependencyGroups = minimalDependencyGroups([
    ...accumulator.dependencyGroups,
    ...sourceAtom.visibilityDependencyGroups,
  ]);
  for (const reason of sourceAtom.imageReasons) {
    accumulator.imageReasons.add(reason);
  }
}

function finalizeAtomAccumulator(accumulator: AtomAccumulator): AtomSpec {
  const dependencyGroups = accumulator.unconditional
    ? []
    : minimalDependencyGroups(accumulator.dependencyGroups);
  return {
    ...accumulator.atom,
    imageReasons: accumulator.unconditional
      ? []
      : orderedImageReasons(accumulator.imageReasons),
    visibilityDependencies: dependenciesForGroups(dependencyGroups),
    visibilityDependencyGroups: dependencyGroups,
  };
}

interface RelationAccumulator<T> {
  relation: T;
  dependencyGroups: VisibilityDependency[][];
}

function replicateBonds(
  scene: SceneSpec,
  cellOffsets: readonly ImageOffset[],
  atomIndexByKey: ReadonlyMap<string, number>,
  atoms: readonly AtomSpec[],
): BondSpec[] {
  const accumulators = new Map<string, RelationAccumulator<BondSpec>>();
  for (const cellOffset of cellOffsets) {
    for (const sourceBond of scene.bonds) {
      const sourceStart = scene.atoms[sourceBond.startAtomIndex];
      const sourceEnd = scene.atoms[sourceBond.endAtomIndex];
      if (!sourceStart || !sourceEnd) {
        continue;
      }

      const startAtomIndex = translatedAtomIndex(sourceStart, cellOffset, atomIndexByKey);
      const endAtomIndex = translatedAtomIndex(sourceEnd, cellOffset, atomIndexByKey);
      if (
        startAtomIndex === undefined ||
        endAtomIndex === undefined ||
        startAtomIndex === endAtomIndex
      ) {
        continue;
      }

      const endpointIndices = [startAtomIndex, endAtomIndex].sort((left, right) => left - right);
      const key = `${endpointIndices[0]}:${endpointIndices[1]}`;
      const dependencyGroups = dependencyGroupsForAtomIndices(
        endpointIndices,
        atoms,
      );
      mergeRelationAccumulator(accumulators, key, {
        ...sourceBond,
        startAtomIndex,
        endAtomIndex,
        visibilityDependencies: dependenciesForGroups(dependencyGroups),
        visibilityDependencyGroups: dependencyGroups,
      }, dependencyGroups);
    }
  }

  return [...accumulators.values()].map(finalizeRelationAccumulator);
}

function replicatePolyhedra(
  scene: SceneSpec,
  cellOffsets: readonly ImageOffset[],
  atomIndexByKey: ReadonlyMap<string, number>,
  atoms: readonly AtomSpec[],
): PolyhedronSpec[] {
  const accumulators = new Map<string, RelationAccumulator<PolyhedronSpec>>();
  for (const cellOffset of cellOffsets) {
    for (const sourcePolyhedron of scene.polyhedra) {
      const sourceCenter = scene.atoms[sourcePolyhedron.centerAtomIndex];
      if (!sourceCenter) {
        continue;
      }
      const centerAtomIndex = translatedAtomIndex(
        sourceCenter,
        cellOffset,
        atomIndexByKey,
      );
      if (centerAtomIndex === undefined) {
        continue;
      }

      const hullAtomIndices: number[] = [];
      let hasMissingAtom = false;
      for (const sourceHullIndex of sourcePolyhedron.hullAtomIndices) {
        const sourceHullAtom = scene.atoms[sourceHullIndex];
        const hullAtomIndex = sourceHullAtom
          ? translatedAtomIndex(sourceHullAtom, cellOffset, atomIndexByKey)
          : undefined;
        if (hullAtomIndex === undefined) {
          hasMissingAtom = true;
          break;
        }
        hullAtomIndices.push(hullAtomIndex);
      }
      if (hasMissingAtom) {
        continue;
      }

      const sortedHull = [...new Set(hullAtomIndices)].sort((left, right) => left - right);
      const key = `${centerAtomIndex}:${sortedHull.join(",")}`;
      const dependencyGroups = dependencyGroupsForAtomIndices(
        [centerAtomIndex, ...hullAtomIndices],
        atoms,
      );
      mergeRelationAccumulator(accumulators, key, {
        ...sourcePolyhedron,
        centerAtomIndex,
        hullAtomIndices,
        faces: sourcePolyhedron.faces.map((face) => [...face]),
        visibilityDependencies: dependenciesForGroups(dependencyGroups),
        visibilityDependencyGroups: dependencyGroups,
      }, dependencyGroups);
    }
  }

  return [...accumulators.values()].map(finalizeRelationAccumulator);
}

function mergeRelationAccumulator<T extends BondSpec | PolyhedronSpec>(
  accumulators: Map<string, RelationAccumulator<T>>,
  key: string,
  relation: T,
  dependencyGroups: VisibilityDependency[][],
): void {
  const accumulator = accumulators.get(key);
  if (!accumulator) {
    accumulators.set(key, { relation, dependencyGroups });
    return;
  }

  accumulator.dependencyGroups = mergeAlternativeDependencyGroups(
    accumulator.dependencyGroups,
    dependencyGroups,
  );
}

function finalizeRelationAccumulator<T extends BondSpec | PolyhedronSpec>(
  accumulator: RelationAccumulator<T>,
): T {
  const dependencyGroups = minimalDependencyGroups(accumulator.dependencyGroups);
  return {
    ...accumulator.relation,
    visibilityDependencies: dependenciesForGroups(dependencyGroups),
    visibilityDependencyGroups: dependencyGroups,
  };
}

function translatedAtomIndex(
  sourceAtom: AtomSpec,
  cellOffset: ImageOffset,
  atomIndexByKey: ReadonlyMap<string, number>,
): number | undefined {
  return atomIndexByKey.get(
    atomKey(sourceAtom.siteId, addOffsets(sourceAtom.imageOffset, cellOffset)),
  );
}

function dependencyGroupsForAtomIndices(
  atomIndices: readonly number[],
  atoms: readonly AtomSpec[],
): VisibilityDependency[][] {
  let combinedGroups: VisibilityDependency[][] = [[]];
  for (const atomIndex of atomIndices) {
    const atom = atoms[atomIndex];
    if (!atom) {
      return [];
    }
    const atomGroups =
      atom.visibilityDependencyGroups.length === 0
        ? [[]]
        : atom.visibilityDependencyGroups;
    const products: VisibilityDependency[][] = [];
    for (const currentGroup of combinedGroups) {
      for (const atomGroup of atomGroups) {
        products.push([...currentGroup, ...atomGroup]);
      }
    }
    combinedGroups = minimalDependencyGroups(products, true);
  }

  return combinedGroups.some((group) => group.length === 0)
    ? []
    : minimalDependencyGroups(combinedGroups);
}

function mergeAlternativeDependencyGroups(
  first: VisibilityDependency[][],
  second: VisibilityDependency[][],
): VisibilityDependency[][] {
  if (first.length === 0 || second.length === 0) {
    return [];
  }
  return minimalDependencyGroups([...first, ...second]);
}

function dependencyGroupsAreUnconditional(
  groups: readonly (readonly VisibilityDependency[])[],
): boolean {
  return groups.length === 0 || groups.some((group) => group.length === 0);
}

function minimalDependencyGroups(
  groups: readonly (readonly VisibilityDependency[])[],
  retainEmpty = false,
): VisibilityDependency[][] {
  const uniqueGroups = new Map<string, VisibilityDependency[]>();
  for (const group of groups) {
    const normalized = orderedDependencies(new Set(group));
    if (normalized.length === 0 && !retainEmpty) {
      return [];
    }
    uniqueGroups.set(normalized.join("|"), normalized);
  }

  const ordered = [...uniqueGroups.values()].sort((left, right) => {
    if (left.length !== right.length) {
      return left.length - right.length;
    }
    return left.join("|").localeCompare(right.join("|"));
  });
  const minimal: VisibilityDependency[][] = [];
  for (const candidate of ordered) {
    if (!minimal.some((existing) => isSubset(existing, candidate))) {
      minimal.push(candidate);
    }
  }
  return minimal;
}

function dependenciesForGroups(
  dependencyGroups: readonly (readonly VisibilityDependency[])[],
): VisibilityDependency[] {
  return orderedDependencies(new Set(dependencyGroups.flat()));
}

function orderedDependencies(
  dependencies: ReadonlySet<VisibilityDependency>,
): VisibilityDependency[] {
  return DEPENDENCY_ORDER.filter((dependency) => dependencies.has(dependency));
}

function orderedImageReasons(reasons: ReadonlySet<ImageReason>): ImageReason[] {
  return IMAGE_REASON_ORDER.filter((reason) => reasons.has(reason));
}

function isSubset<T>(subset: readonly T[], superset: readonly T[]): boolean {
  return subset.every((value) => superset.includes(value));
}

function translateCartesianPosition(
  position: readonly [number, number, number],
  vectors: readonly (readonly [number, number, number])[],
  offset: ImageOffset,
): [number, number, number] {
  const a = vectors[0] ?? [0, 0, 0];
  const b = vectors[1] ?? [0, 0, 0];
  const c = vectors[2] ?? [0, 0, 0];
  return [0, 1, 2].map((component) =>
    cleanNumber(
      position[component]! +
        offset[0] * a[component]! +
        offset[1] * b[component]! +
        offset[2] * c[component]!,
    ),
  ) as [number, number, number];
}

function addFractionalOffset(
  fractionalPosition: readonly [number, number, number],
  offset: ImageOffset,
): [number, number, number] {
  return [
    cleanNumber(fractionalPosition[0] + offset[0]),
    cleanNumber(fractionalPosition[1] + offset[1]),
    cleanNumber(fractionalPosition[2] + offset[2]),
  ];
}

function atomInstanceId(siteId: string, imageOffset: ImageOffset): string {
  return isZeroOffset(imageOffset)
    ? siteId
    : `${siteId}-image-${imageOffset[0]}-${imageOffset[1]}-${imageOffset[2]}`;
}

function atomKey(siteId: string, imageOffset: ImageOffset): string {
  return `${siteId}\u0000${imageOffset[0]},${imageOffset[1]},${imageOffset[2]}`;
}

function addOffsets(
  left: readonly number[],
  right: ImageOffset,
): ImageOffset {
  return [left[0]! + right[0], left[1]! + right[1], left[2]! + right[2]];
}

function isZeroOffset(offset: ImageOffset): boolean {
  return offset[0] === 0 && offset[1] === 0 && offset[2] === 0;
}

function offsetInCellRange(offset: ImageOffset, range: PeriodicCellRange): boolean {
  return (
    offset[0] >= range.a.from &&
    offset[0] <= range.a.to &&
    offset[1] >= range.b.from &&
    offset[1] <= range.b.to &&
    offset[2] >= range.c.from &&
    offset[2] <= range.c.to
  );
}

function cleanNumber(value: number): number {
  return Math.abs(value) <= FLOAT_ZERO_TOLERANCE ? 0 : value;
}

function axisCounts(range: PeriodicCellRange): [number, number, number] {
  return [
    range.a.to - range.a.from + 1,
    range.b.to - range.b.from + 1,
    range.c.to - range.c.from + 1,
  ];
}

function periodicCellCountUnchecked(range: PeriodicCellRange): number | null {
  const [aCount, bCount, cCount] = axisCounts(range);
  const abCount = safeProduct(aCount, bCount);
  return abCount === null ? null : safeProduct(abCount, cCount);
}

function estimateGridLineCandidates(
  aCount: number,
  bCount: number,
  cCount: number,
): number | null {
  const alongA = safeProduct(bCount + 1, cCount + 1);
  const alongB = safeProduct(aCount + 1, cCount + 1);
  const alongC = safeProduct(aCount + 1, bCount + 1);
  if (alongA === null || alongB === null || alongC === null) {
    return null;
  }
  const total = alongA + alongB + alongC;
  return Number.isSafeInteger(total) ? total : null;
}

function safeProduct(left: number, right: number): number | null {
  const product = left * right;
  return Number.isSafeInteger(product) ? product : null;
}

function invalidRange(
  code: PeriodicCellRangeErrorCode,
  message: string,
): PeriodicCellRangeError {
  return { valid: false, code, message };
}

function budgetKeys(): (keyof PeriodicReplicationBudget)[] {
  return [
    "atomCandidates",
    "bondCandidates",
    "polyhedronCandidates",
    "gridLineCandidates",
  ];
}

function budgetLabel(key: keyof PeriodicReplicationBudget): string {
  switch (key) {
    case "atomCandidates":
      return "atom candidates";
    case "bondCandidates":
      return "bond candidates";
    case "polyhedronCandidates":
      return "polyhedron candidates";
    case "gridLineCandidates":
      return "cell-grid lines";
  }
}
