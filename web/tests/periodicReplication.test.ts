import { describe, expect, test } from "bun:test";

import type {
  AtomSpec,
  BondSpec,
  PolyhedronSpec,
  SceneSpec,
  VisibilityDependency,
} from "../src/api/scene";
import {
  DEFAULT_PERIODIC_REPLICATION_BUDGET,
  createDefaultPeriodicCellRange,
  estimatePeriodicReplication,
  periodicCellCount,
  periodicCellOffsets,
  periodicCellRangeStatus,
  replicateSceneForPeriodicRange,
  validatePeriodicCellRange,
  validatePeriodicReplicationBudget,
} from "../src/model";

describe("periodic replication model", () => {
  test("uses an inclusive origin range and preserves identity by default", () => {
    const scene = periodicScene();
    const range = createDefaultPeriodicCellRange();

    expect(periodicCellCount(range)).toBe(1);
    expect(periodicCellOffsets(range)).toEqual([[0, 0, 0]]);
    expect(periodicCellRangeStatus(range)).toBe("1 × 1 × 1 · 1 cell");
    expect(replicateSceneForPeriodicRange(scene, range)).toBe(scene);
    expect(replicateSceneForPeriodicRange(null, range)).toBeNull();
  });

  test("validates integer ordering and requires every axis to include zero", () => {
    expect(
      validatePeriodicCellRange({
        a: { from: -1.5, to: 0 },
        b: { from: 0, to: 0 },
        c: { from: 0, to: 0 },
      }),
    ).toEqual(
      expect.objectContaining({ valid: false, code: "invalid-integer" }),
    );
    expect(
      validatePeriodicCellRange({
        a: { from: 1, to: 0 },
        b: { from: 0, to: 0 },
        c: { from: 0, to: 0 },
      }),
    ).toEqual(expect.objectContaining({ valid: false, code: "invalid-order" }));
    expect(
      validatePeriodicCellRange({
        a: { from: 0, to: 1 },
        b: { from: -2, to: -1 },
        c: { from: 0, to: 0 },
      }),
    ).toEqual(expect.objectContaining({ valid: false, code: "missing-origin" }));

    expect(
      validatePeriodicCellRange({
        a: { from: Number.MIN_SAFE_INTEGER, to: 0 },
        b: { from: 0, to: 0 },
        c: { from: 0, to: 0 },
      }),
    ).toEqual(
      expect.objectContaining({ valid: false, code: "unsafe-arithmetic" }),
    );
  });

  test("estimates scale-dependent work instead of imposing a fixed cell cap", () => {
    const range = {
      a: { from: -500, to: 500 },
      b: { from: 0, to: 0 },
      c: { from: 0, to: 0 },
    };
    const emptyScene = periodicScene({ atoms: [], bonds: [], polyhedra: [] });
    const estimate = estimatePeriodicReplication(emptyScene, range);

    expect(estimate).toEqual({
      cellCount: 1001,
      axisCounts: [1001, 1, 1],
      atomCandidates: 0,
      bondCandidates: 0,
      polyhedronCandidates: 0,
      gridLineCandidates: 4012,
    });
    expect(validatePeriodicReplicationBudget(emptyScene, range).valid).toBe(true);

    const atomHeavyScene = periodicScene({
      atoms: Array.from({ length: 51 }, (_, siteIndex) =>
        atom(`C-${siteIndex}`, siteIndex, [0, 0, 0]),
      ),
      bonds: [],
      polyhedra: [],
    });
    expect(validatePeriodicReplicationBudget(atomHeavyScene, range)).toEqual(
      expect.objectContaining({
        valid: false,
        code: "budget-exceeded",
        budgetKey: "atomCandidates",
      }),
    );
    expect(DEFAULT_PERIODIC_REPLICATION_BUDGET).toEqual({
      atomCandidates: 20_000,
      bondCandidates: 15_000,
      polyhedronCandidates: 1_000,
      gridLineCandidates: 20_000,
    });

    const gridHeavyRange = {
      a: { from: -99, to: 100 },
      b: { from: -99, to: 100 },
      c: { from: -99, to: 100 },
    };
    expect(validatePeriodicReplicationBudget(emptyScene, gridHeavyRange)).toEqual(
      expect.objectContaining({
        valid: false,
        code: "budget-exceeded",
        budgetKey: "gridLineCandidates",
      }),
    );
  });

  test("rejects non-default replication for a non-periodic scene", () => {
    const scene = periodicScene();
    scene.cell.periodic = false;
    const range = rangeAlongA(0, 1);

    expect(validatePeriodicReplicationBudget(scene, range)).toEqual(
      expect.objectContaining({ valid: false, code: "non-periodic" }),
    );
    expect(() => replicateSceneForPeriodicRange(scene, range)).toThrow(
      "non-periodic",
    );
  });

  test("translates negative ranges with skew lattice vectors deterministically", () => {
    const scene = periodicScene({
      cell: {
        periodic: true,
        vectors: [
          [2, 1, 0],
          [0, 3, 0],
          [0, 0, 4],
        ],
      },
      atoms: [atom("Si-0", 0, [0, 0, 0], [0.5, 0.75, 1])],
      bonds: [],
      polyhedra: [],
    });
    const original = structuredClone(scene);
    const replicated = replicateSceneForPeriodicRange(scene, rangeAlongA(-1, 0));

    expect(replicated?.atoms.map((candidate) => candidate.id)).toEqual([
      "Si-0",
      "Si-0-image--1-0-0",
    ]);
    expect(replicated?.atoms[1]).toEqual(
      expect.objectContaining({
        position: [-1.5, -0.25, 1],
        fractionalPosition: [-0.5, 0.75, 1],
        imageOffset: [-1, 0, 0],
        isPeriodicImage: true,
        visibilityDependencyGroups: [],
      }),
    );
    expect(scene).toEqual(original);
  });

  test("deduplicates requested atoms and keeps only outer completion dependencies", () => {
    const boundaryGroups: VisibilityDependency[][] = [
      ["boundaryAtoms"],
      ["oneHopBondedAtoms"],
    ];
    const scene = periodicScene({
      atoms: [
        atom("Na-0", 0, [0, 0, 0]),
        atom("Na-0", 0, [1, 0, 0], [1, 0, 0], boundaryGroups, [
          "boundary",
          "bonded",
        ]),
      ],
      bonds: [],
      polyhedra: [],
    });
    const replicated = replicateSceneForPeriodicRange(scene, rangeAlongA(0, 1));

    expect(replicated?.atoms.map((candidate) => candidate.imageOffset)).toEqual([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
    ]);
    expect(replicated?.atoms[1]).toEqual(
      expect.objectContaining({
        id: "Na-0-image-1-0-0",
        imageReasons: [],
        visibilityDependencies: [],
        visibilityDependencyGroups: [],
      }),
    );
    expect(replicated?.atoms[2]).toEqual(
      expect.objectContaining({
        imageReasons: ["boundary", "bonded"],
        visibilityDependencies: ["boundaryAtoms", "oneHopBondedAtoms"],
        visibilityDependencyGroups: boundaryGroups,
      }),
    );
  });

  test("remaps and deduplicates bonds while making only interior bonds unconditional", () => {
    const scene = relationScene();
    const replicated = replicateSceneForPeriodicRange(scene, rangeAlongA(0, 1));

    expect(replicated?.bonds).toHaveLength(2);
    expect(replicated?.bonds[0]).toEqual(
      expect.objectContaining({
        startAtomIndex: 0,
        endAtomIndex: 2,
        visibilityDependencies: [],
        visibilityDependencyGroups: [],
      }),
    );
    expect(replicated?.bonds[1]).toEqual(
      expect.objectContaining({
        visibilityDependencies: ["oneHopBondedAtoms"],
        visibilityDependencyGroups: [["oneHopBondedAtoms"]],
      }),
    );
    const outerBond = replicated!.bonds[1]!;
    expect(replicated?.atoms[outerBond.startAtomIndex]?.imageOffset).toEqual([1, 0, 0]);
    expect(replicated?.atoms[outerBond.endAtomIndex]?.imageOffset).toEqual([2, 0, 0]);
  });

  test("remaps and deduplicates polyhedra with stable hull faces", () => {
    const scene = relationScene();
    const replicated = replicateSceneForPeriodicRange(scene, rangeAlongA(0, 1));

    expect(replicated?.polyhedra).toHaveLength(2);
    expect(replicated?.polyhedra[0]).toEqual(
      expect.objectContaining({
        centerAtomIndex: 0,
        hullAtomIndices: [0, 2],
        faces: [[0, 1, 0]],
        visibilityDependencies: [],
        visibilityDependencyGroups: [],
      }),
    );
    expect(replicated?.polyhedra[1]).toEqual(
      expect.objectContaining({
        visibilityDependencies: ["oneHopBondedAtoms"],
        visibilityDependencyGroups: [["oneHopBondedAtoms"]],
      }),
    );
  });
});

function rangeAlongA(from: number, to: number) {
  return {
    a: { from, to },
    b: { from: 0, to: 0 },
    c: { from: 0, to: 0 },
  };
}

function periodicScene(overrides: Partial<SceneSpec> = {}): SceneSpec {
  return {
    cell: {
      periodic: true,
      vectors: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
    },
    atoms: [atom("Na-0", 0, [0, 0, 0])],
    bonds: [],
    polyhedra: [],
    summary: {
      formula: "Na",
      atomCount: 1,
      cell: { a: "1", b: "1", c: "1", alpha: "90", beta: "90", gamma: "90" },
      symmetry: {
        available: true,
        spaceGroup: "Pm-3m",
        spaceGroupNumber: 221,
        pointGroup: "m-3m",
        pointGroupSchoenflies: "Oh",
        crystalSystem: "cubic",
        latticeSystem: "cubic",
      },
    },
    bondCutoffs: [],
    ...overrides,
  };
}

function relationScene(): SceneSpec {
  const completionGroups: VisibilityDependency[][] = [["oneHopBondedAtoms"]];
  const bonds: BondSpec[] = [
    bond(0, 2, completionGroups),
    bond(2, 0, completionGroups),
  ];
  const polyhedra: PolyhedronSpec[] = [
    polyhedron(0, [0, 2], completionGroups),
    polyhedron(0, [2, 0], completionGroups),
  ];
  return periodicScene({
    atoms: [
      atom("Na-0", 0, [0, 0, 0]),
      atom("Cl-1", 1, [0, 0, 0], [0.5, 0.5, 0.5]),
      atom("Cl-1", 1, [1, 0, 0], [1.5, 0.5, 0.5], completionGroups, [
        "bonded",
      ]),
    ],
    bonds,
    polyhedra,
  });
}

function atom(
  siteId: string,
  siteIndex: number,
  imageOffset: [number, number, number],
  fractionalPosition: [number, number, number] = [0, 0, 0],
  visibilityDependencyGroups: VisibilityDependency[][] = [],
  imageReasons: AtomSpec["imageReasons"] = [],
): AtomSpec {
  const id =
    imageOffset.every((value) => value === 0)
      ? siteId
      : `${siteId}-image-${imageOffset.join("-")}`;
  return {
    id,
    siteId,
    siteIndex,
    element: siteId.split("-")[0]!,
    position: [...fractionalPosition],
    fractionalPosition,
    imageOffset,
    isPeriodicImage: imageOffset.some((value) => value !== 0),
    imageReasons,
    visibilityDependencies: [
      ...new Set(visibilityDependencyGroups.flat()),
    ],
    visibilityDependencyGroups,
  };
}

function bond(
  startAtomIndex: number,
  endAtomIndex: number,
  visibilityDependencyGroups: VisibilityDependency[][],
): BondSpec {
  return {
    startAtomIndex,
    endAtomIndex,
    visibilityDependencies: [...new Set(visibilityDependencyGroups.flat())],
    visibilityDependencyGroups,
  };
}

function polyhedron(
  centerAtomIndex: number,
  hullAtomIndices: number[],
  visibilityDependencyGroups: VisibilityDependency[][],
): PolyhedronSpec {
  return {
    centerAtomIndex,
    hullAtomIndices,
    faces: [[0, 1, 0]],
    visibilityDependencies: [...new Set(visibilityDependencyGroups.flat())],
    visibilityDependencyGroups,
  };
}
