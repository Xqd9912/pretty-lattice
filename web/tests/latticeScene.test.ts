import { describe, expect, test } from "bun:test";

import type { SceneSpec } from "../src/api/scene";
import {
  CELL_FRAME_LINE_WIDTH_PIXELS,
  cellFrameLinePositions,
  computeSceneLayout,
  previewSafeAreaForViewport,
} from "../src/scene/LatticeScene";
import {
  computeCameraFitZoom,
  computeOrthographicFrustum,
  computeStandardCameraPose,
} from "../src/scene/viewMath";

describe("computeSceneLayout", () => {
  test("anchors the preview on the unit-cell center instead of atom distribution", () => {
    const scene = sceneWithOffCenterAtoms();

    expect(computeSceneLayout(scene).groupPosition).toEqual([-2.5, -1.5, -1]);
  });

  test("uses the c-up three-quarter Standard camera pose", () => {
    const pose = computeStandardCameraPose(
      [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      3,
    );
    const diagonal = 1 / Math.sqrt(3);
    const cUp = 1 / Math.sqrt(6);

    expectVectorClose(pose.outward, [diagonal, diagonal, diagonal]);
    expectVectorClose(pose.cameraUp, [-cUp, -cUp, 2 * cUp]);
    expect(dot(pose.outward, pose.cameraUp)).toBeCloseTo(0);
    expect(dot([0, 0, 1], pose.cameraUp)).toBeGreaterThan(0);
  });

  test("fits the camera to stable preview safe areas", () => {
    const zoom = computeCameraFitZoom(10, 1000, 800, {
      bottom: 132,
      left: 420,
      right: 176,
      top: 24,
    });

    expect(zoom).toBeCloseTo(404 / 17);
  });

  test("offsets the orthographic frustum toward the safe-area center", () => {
    const frustum = computeOrthographicFrustum(1000, 800, 100, {
      bottom: 132,
      left: 420,
      right: 176,
      top: 24,
    });

    expect((frustum.left + frustum.right) / 2).toBeCloseTo(-1.22);
    expect((frustum.bottom + frustum.top) / 2).toBeCloseTo(-0.54);
  });

  test("folds the preview safe area for narrow viewports", () => {
    const desktopSafeArea = {
      bottom: 132,
      left: 420,
      right: 176,
      top: 24,
    };

    expect(previewSafeAreaForViewport(desktopSafeArea, 1280)).toBe(desktopSafeArea);
    expect(previewSafeAreaForViewport(desktopSafeArea, 390)).toEqual({
      bottom: 132,
      left: 16,
      right: 88,
      top: 384,
    });
  });

  test("describes the unit-cell frame as twelve screen-space line segments", () => {
    const positions = cellFrameLinePositions([
      [4, 0, 0],
      [1, 3, 0],
      [0, 0, 2],
    ]);

    expect(CELL_FRAME_LINE_WIDTH_PIXELS).toBe(1);
    expect(positions).toHaveLength(72);
    expect(positions.slice(0, 6)).toEqual([0, 0, 0, 4, 0, 0]);
    expect(positions.slice(-6)).toEqual([1, 3, 2, 5, 3, 2]);
  });
});

function expectVectorClose(actual: [number, number, number], expected: [number, number, number]) {
  expect(actual[0]).toBeCloseTo(expected[0]);
  expect(actual[1]).toBeCloseTo(expected[1]);
  expect(actual[2]).toBeCloseTo(expected[2]);
}

function dot(left: [number, number, number], right: [number, number, number]) {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function sceneWithOffCenterAtoms(): SceneSpec {
  return {
    atoms: [
      atom("Si-0", [0.1, 0.1, 0.1]),
      atom("Si-1", [0.3, 0.1, 0.1]),
    ],
    cell: {
      vectors: [
        [4, 0, 0],
        [1, 3, 0],
        [0, 0, 2],
      ],
    },
    summary: {
      atomCount: 2,
      cell: {
        a: "4.00",
        alpha: "90.00",
        b: "3.16",
        beta: "90.00",
        c: "2.00",
        gamma: "71.57",
      },
      formula: "Si",
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

function atom(id: string, position: [number, number, number]) {
  return {
    color: "#9a9a9a",
    element: "Si",
    fractionalPosition: [0, 0, 0],
    id,
    imageOffset: [0, 0, 0],
    isPeriodicImage: false,
    position,
    radius: 0.5,
    siteId: id,
  } as const;
}
