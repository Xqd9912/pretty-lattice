import { describe, expect, test } from "bun:test";

import type { AtomSpec, SceneSpec } from "../src/api/scene";
import {
  appendMeasurementPoint,
  atomInstanceIdentity,
  measurementValue,
  resolveMeasurement,
  sameAtomInstance,
  type MeasurementRecord,
} from "../src/model";

describe("structure measurements", () => {
  test("computes distance, angle, and unsigned dihedral values", () => {
    expect(measurementValue("distance", [[0, 0, 0], [3, 4, 0]])).toBeCloseTo(5);
    expect(measurementValue("angle", [[1, 0, 0], [0, 0, 0], [0, 1, 0]])).toBeCloseTo(90);
    expect(measurementValue("dihedral", [
      [1, 0, 0],
      [0, 0, 0],
      [0, 1, 0],
      [0, 1, 1],
    ])).toBeCloseTo(90);
  });

  test("identifies periodic instances by site index and image offset", () => {
    const scene = measurementScene();
    const canonical = scene.atoms[0]!;
    const image = scene.atoms[1]!;
    expect(sameAtomInstance(atomInstanceIdentity(canonical), atomInstanceIdentity(image))).toBe(false);

    const record: MeasurementRecord = {
      id: "periodic-distance",
      type: "distance",
      points: [atomInstanceIdentity(canonical), atomInstanceIdentity(image)],
    };
    expect(resolveMeasurement(scene, record)?.value).toBeCloseTo(5);
    expect(resolveMeasurement({ ...scene, atoms: [canonical] }, record)).toBeNull();
  });

  test("completes only after the active tool receives all points", () => {
    const points = [
      { siteIndex: 0, imageOffset: [0, 0, 0] as [number, number, number] },
      { siteIndex: 1, imageOffset: [0, 0, 0] as [number, number, number] },
      { siteIndex: 2, imageOffset: [0, 0, 0] as [number, number, number] },
    ];
    const first = appendMeasurementPoint([], points[0]!, "angle");
    const duplicate = appendMeasurementPoint(first.draft, points[0]!, "angle");
    const second = appendMeasurementPoint(duplicate.draft, points[1]!, "angle");
    const third = appendMeasurementPoint(second.draft, points[2]!, "angle");
    expect(first.completed).toBeUndefined();
    expect(duplicate.draft).toHaveLength(1);
    expect(second.completed).toBeUndefined();
    expect(third.completed?.type).toBe("angle");
    expect(third.completed?.points).toHaveLength(3);
    expect(third.draft).toEqual([]);
  });
});

function measurementScene(): SceneSpec {
  return {
    cell: { vectors: [[5, 0, 0], [0, 5, 0], [0, 0, 5]], periodic: true },
    atoms: [
      atom("H-0", 0, [0, 0, 0], [0, 0, 0]),
      atom("H-0-image", 0, [5, 0, 0], [1, 0, 0]),
    ],
    bonds: [],
    polyhedra: [],
    summary: {
      formula: "H",
      atomCount: 1,
      cell: { a: "5", b: "5", c: "5", alpha: "90", beta: "90", gamma: "90" },
      symmetry: {
        available: false,
        spaceGroup: null,
        spaceGroupNumber: null,
        pointGroup: null,
        pointGroupSchoenflies: null,
        crystalSystem: null,
        latticeSystem: null,
      },
    },
    bondCutoffs: [],
  };
}

function atom(
  id: string,
  siteIndex: number,
  position: [number, number, number],
  imageOffset: [number, number, number],
): AtomSpec {
  return {
    id,
    siteId: `site-${siteIndex}`,
    siteIndex,
    element: "H",
    position,
    fractionalPosition: [0, 0, 0],
    imageOffset,
    isPeriodicImage: imageOffset.some((value) => value !== 0),
    imageReasons: [],
    visibilityDependencies: [],
    visibilityDependencyGroups: [],
  };
}
