import { describe, expect, test } from "bun:test";
import { Quaternion } from "three";

import type { SceneSpec } from "../src/api/scene";
import {
  createDefaultComponentOpacity,
  createDefaultStyle,
  type PeriodicCellRange,
} from "../src/model";
import { createCameraPoseSnapshot } from "../src/scene/cameraPose";
import {
  computeStructureExportProjectedSize,
} from "../src/scene/exportFrame";
import {
  cellCenter,
  cellCorners,
  cellFrameLinePositions,
} from "../src/scene/sceneGeometry";
import { computeSceneStructureLayout } from "../src/scene/sceneLayout";

const REPEATED_RANGE: PeriodicCellRange = {
  a: { from: -1, to: 1 },
  b: { from: 0, to: 1 },
  c: { from: 0, to: 0 },
};

describe("periodic cell-range rendering geometry", () => {
  test("centers and bounds a signed range in a skew lattice", () => {
    const vectors: SceneSpec["cell"]["vectors"] = [
      [2, 0, 0],
      [1, 3, 0],
      [0, 0, 4],
    ];
    const center = cellCenter(vectors, REPEATED_RANGE);
    const corners = cellCorners(vectors, REPEATED_RANGE);

    expect([center.x, center.y, center.z]).toEqual([2, 3, 2]);
    expect(corners).toHaveLength(8);
    expect(corners.map((corner) => [corner.x, corner.y, corner.z])).toContainEqual([
      -2,
      0,
      0,
    ]);
    expect(corners.map((corner) => [corner.x, corner.y, corner.z])).toContainEqual([
      6,
      6,
      4,
    ]);
  });

  test("draws every shared grid edge once as one long axis segment", () => {
    const positions = cellFrameLinePositions(identityVectors(), REPEATED_RANGE);
    const segments = chunks(positions, 6);

    // a-directed: (b + 1)(c + 1) = 6; b-directed: (a + 1)(c + 1) = 8;
    // c-directed: (a + 1)(b + 1) = 12.
    expect(segments).toHaveLength(26);
    expect(new Set(segments.map((segment) => segment.join(","))).size).toBe(26);
    expect(segments).toContainEqual([-1, 0, 0, 2, 0, 0]);
    expect(segments).toContainEqual([-1, 0, 0, -1, 2, 0]);
    expect(segments).toContainEqual([-1, 0, 0, -1, 0, 1]);
  });

  test("fits and recenters preview layout around the complete repeated range", () => {
    const layout = computeSceneStructureLayout(emptyCubicScene(), "uniform", REPEATED_RANGE);

    expect(layout.groupPosition).toEqual([-0.5, -1, -0.5]);
    expect(layout.span).toBe(3);
    expect(layout.cameraFitBounds.projectedWidth).toBeGreaterThan(1);
    expect(layout.cameraFitBounds.projectedHeight).toBeGreaterThan(1);
    expect(layout.depthCueingBackOffset).toBeGreaterThan(0);
  });

  test("includes the repeated unit-cell range in export projected bounds", () => {
    const commonOptions = {
      cameraPose: createCameraPoseSnapshot(new Quaternion()),
      componentOpacity: createDefaultComponentOpacity(),
      scene: emptyCubicScene(),
      showAtoms: false,
      showUnitCell: true,
      style: createDefaultStyle(),
    };

    expect(computeStructureExportProjectedSize(commonOptions)).toEqual({
      height: 1,
      width: 1,
    });
    expect(
      computeStructureExportProjectedSize({
        ...commonOptions,
        cellRange: REPEATED_RANGE,
      }),
    ).toEqual({
      height: 2,
      width: 3,
    });
  });
});

function identityVectors(): SceneSpec["cell"]["vectors"] {
  return [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
}

function emptyCubicScene(): SceneSpec {
  return {
    atoms: [],
    bondCutoffs: [],
    bonds: [],
    cell: {
      periodic: true,
      vectors: identityVectors(),
    },
    polyhedra: [],
    summary: {
      atomCount: 0,
      cell: {
        a: "1.00",
        alpha: "90.00",
        b: "1.00",
        beta: "90.00",
        c: "1.00",
        gamma: "90.00",
      },
      formula: "",
      symmetry: {
        available: false,
        crystalSystem: null,
        latticeSystem: null,
        pointGroup: null,
        pointGroupSchoenflies: null,
        spaceGroup: null,
        spaceGroupNumber: null,
      },
    },
  };
}

function chunks(values: number[], size: number): number[][] {
  const result: number[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}
