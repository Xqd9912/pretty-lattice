import { describe, expect, test } from "bun:test";
import { OrthographicCamera, Quaternion } from "three";

import type { AtomSpec, SceneSpec } from "../src/api/scene";
import {
  createDefaultComponentOpacity,
  createDefaultComponentVisibility,
  createDefaultStyle,
  visibleSceneForComponents,
} from "../src/app/settings";
import {
  BOND_COLOR,
  BOND_2D_RADIAL_SEGMENTS,
  BOND_RADIUS,
  BOND_TUBE_RADIAL_SEGMENTS,
  CELL_FRAME_LINE_WIDTH_PIXELS,
  EXPORT_SCENE_MESH_DETAIL_PRESETS,
  POLYHEDRON_EDGE_COLOR,
  POLYHEDRON_EDGE_OPACITY,
  POLYHEDRON_SURFACE_OPACITY,
  PREVIEW_SCENE_MESH_DETAIL,
  cellFrameLinePositions,
  computeSceneLayout,
  polyhedronGeometryFromAtoms,
  previewSafeAreaForViewport,
} from "../src/scene/LatticeScene";
import {
  applyCameraPoseSnapshot,
  createCameraPoseSnapshot,
} from "../src/scene/cameraPose";
import {
  computeStructureExportAspectRatio,
  computeStructureExportFramePlan,
  projectCellFrameLinesToExportFrame,
} from "../src/scene/exportFrame";
import {
  computeCameraFitZoom,
  computeOrthographicFrustum,
  computeStandardCameraPose,
} from "../src/scene/viewMath";
import { computeOrientationGizmoAxes } from "../src/scene/orientationGizmoMath";

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
    const safeArea = {
      bottom: 132,
      left: 420,
      right: 176,
      top: 24,
    };
    const zoom = computeCameraFitZoom(
      {
        projectedHeight: 17,
        projectedWidth: 17,
        span: 10,
      },
      1000,
      800,
      safeArea,
    );

    expect(zoom).toBeCloseTo(404 / 17);
  });

  test("gives slender standard projections a capped visual boost", () => {
    const safeArea = {
      bottom: 132,
      left: 420,
      right: 176,
      top: 24,
    };
    const zoom = computeCameraFitZoom(
      {
        projectedHeight: 2,
        projectedWidth: 4,
        span: 10,
      },
      1000,
      800,
      safeArea,
    );

    expect(zoom).toBeCloseTo((404 / 17) * 1.5);
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
      top: 476,
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

  test("fits the preview layout from raw scene atom radii", () => {
    const scene = sceneWithOffCenterAtoms();

    expect(computeSceneLayout(scene).span).toBeCloseTo(6);
    expect(computeSceneLayout(scene, "vdw").span).toBeCloseTo(8);
  });

  test("tracks the Standard-view projected fit size for slender structures", () => {
    const layout = computeSceneLayout(sceneWithLongCell());

    expect(layout.cameraFitBounds.span).toBeCloseTo(layout.span);
    expect(layout.cameraFitBounds.projectedWidth).toBeLessThan(layout.span);
  });

  test("uses fixed first-version bond styling", () => {
    expect(BOND_COLOR).toBe("#c7cbd1");
    expect(BOND_2D_RADIAL_SEGMENTS).toBe(12);
    expect(BOND_RADIUS).toBe(0.14);
    expect(BOND_TUBE_RADIAL_SEGMENTS).toBe(24);
  });

  test("keeps preview mesh detail fixed while export presets scale together", () => {
    expect(PREVIEW_SCENE_MESH_DETAIL).toEqual({
      bond2dRadialSegments: 10,
      bondRadialSegments: 16,
      sphereHeightSegments: 24,
      sphereWidthSegments: 32,
    });
    expect(EXPORT_SCENE_MESH_DETAIL_PRESETS.low).toEqual({
      bond2dRadialSegments: 8,
      bondRadialSegments: 12,
      sphereHeightSegments: 16,
      sphereWidthSegments: 24,
    });
    expect(EXPORT_SCENE_MESH_DETAIL_PRESETS.medium).toBe(PREVIEW_SCENE_MESH_DETAIL);
    expect(EXPORT_SCENE_MESH_DETAIL_PRESETS.high).toEqual({
      bond2dRadialSegments: 12,
      bondRadialSegments: 24,
      sphereHeightSegments: 32,
      sphereWidthSegments: 48,
    });
    expect(EXPORT_SCENE_MESH_DETAIL_PRESETS.xhigh.sphereWidthSegments).toBe(72);
    expect(EXPORT_SCENE_MESH_DETAIL_PRESETS.xhigh.bondRadialSegments).toBe(32);
  });

  test("captures and applies a narrow orthographic camera pose snapshot", () => {
    const sourceOrientation = new Quaternion();
    const snapshot = createCameraPoseSnapshot(sourceOrientation, [1, 2, 3]);
    const camera = new OrthographicCamera();

    applyCameraPoseSnapshot(camera, snapshot, 10, 3);

    expect(snapshot).toEqual({
      projection: "orthographic",
      quaternion: [0, 0, 0, 1],
      target: [1, 2, 3],
    });
    expect(camera.position.x).toBeCloseTo(1);
    expect(camera.position.y).toBeCloseTo(2);
    expect(camera.position.z).toBeCloseTo(13);
    expect(camera.up.x).toBeCloseTo(0);
    expect(camera.up.y).toBeCloseTo(1);
    expect(camera.up.z).toBeCloseTo(0);
    expect(camera.near).toBeCloseTo(0.01);
    expect(camera.far).toBeGreaterThanOrEqual(1000);
  });

  test("derives export aspect from the projected currently visible content", () => {
    const scene = sceneWithExportVisibilityAtoms();
    const visibility = createDefaultComponentVisibility(scene);
    const cameraPose = createCameraPoseSnapshot(new Quaternion());
    const componentOpacity = createDefaultComponentOpacity();
    const style = createDefaultStyle();

    const defaultVisibleScene = visibleSceneForComponents(scene, visibility);
    const withOneHopScene = visibleSceneForComponents(scene, {
      ...visibility,
      oneHopBondedAtoms: true,
    });

    expect(defaultVisibleScene).not.toBeNull();
    expect(withOneHopScene).not.toBeNull();
    expect(
      computeStructureExportAspectRatio({
        cameraPose,
        componentOpacity,
        scene: defaultVisibleScene!,
        showAtoms: true,
        showUnitCell: false,
        style,
      }),
    ).toBeCloseTo(2);
    expect(
      computeStructureExportAspectRatio({
        cameraPose,
        componentOpacity,
        scene: withOneHopScene!,
        showAtoms: true,
        showUnitCell: false,
        style,
      }),
    ).toBeCloseTo(2 / 3);
  });

  test("projects unit-cell frame lines into the export frame for vector PDF overlay", () => {
    const scene = sceneWithExportVisibilityAtoms();
    const cameraPose = createCameraPoseSnapshot(new Quaternion());
    const framePlan = computeStructureExportFramePlan({
      cameraPose,
      componentOpacity: createDefaultComponentOpacity(),
      height: 100,
      scene,
      showAtoms: false,
      showUnitCell: true,
      style: createDefaultStyle(),
      width: 100,
    });
    const lines = projectCellFrameLinesToExportFrame({ cameraPose, framePlan, scene });

    expect(lines).toHaveLength(12);
    for (const line of lines) {
      for (const point of [line.start, line.end]) {
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.x).toBeLessThanOrEqual(100);
        expect(point.y).toBeGreaterThanOrEqual(0);
        expect(point.y).toBeLessThanOrEqual(100);
      }
    }
  });

  test("builds polyhedron geometry from returned hull atoms and faces", () => {
    const scene = sceneWithOffCenterAtoms();
    const polyhedron = {
      id: "polyhedron-Si-0",
      centerAtomId: "Si-0",
      hullAtomIds: ["Si-0", "Si-1", "Si-2", "Si-3"],
      faces: [
        [0, 1, 2],
        [0, 1, 3],
        [0, 2, 3],
        [1, 2, 3],
      ],
      visibilityDependencies: [],
      visibilityDependencyGroups: [],
    } satisfies SceneSpec["polyhedra"][number];
    const atomById = new Map(scene.atoms.map((atom) => [atom.id, atom]));

    const geometry = polyhedronGeometryFromAtoms(polyhedron, atomById);

    expect(POLYHEDRON_EDGE_COLOR).toBe("#525866");
    expect(POLYHEDRON_EDGE_OPACITY).toBe(0.42);
    expect(POLYHEDRON_SURFACE_OPACITY).toBe(0.25);
    expect(geometry?.getAttribute("position").count).toBe(4);
    expect(geometry?.index?.count).toBe(12);
    geometry?.dispose();
  });

  test("skips polyhedron geometry when hull atoms or face indices are invalid", () => {
    const scene = sceneWithOffCenterAtoms();
    const atomById = new Map(scene.atoms.map((atom) => [atom.id, atom]));

    expect(
      polyhedronGeometryFromAtoms(
        {
          id: "polyhedron-missing",
          centerAtomId: "Si-0",
          hullAtomIds: ["Si-0", "missing", "Si-2"],
          faces: [[0, 1, 2]],
          visibilityDependencies: [],
          visibilityDependencyGroups: [],
        },
        atomById,
      ),
    ).toBeNull();
    expect(
      polyhedronGeometryFromAtoms(
        {
          id: "polyhedron-invalid-face",
          centerAtomId: "Si-0",
          hullAtomIds: ["Si-0", "Si-1", "Si-2"],
          faces: [[0, 1, 3]],
          visibilityDependencies: [],
          visibilityDependencyGroups: [],
        },
        atomById,
      ),
    ).toBeNull();
  });

  test("normalizes orientation gizmo axes without orthogonalizing the cell", () => {
    const axes = computeOrientationGizmoAxes([
      [4, 0, 0],
      [1, 3, 0],
      [0, 0, 2],
    ]);

    expect(axes.map((axis) => axis.label)).toEqual(["a", "b", "c"]);
    expectVectorClose(axes[0]!.direction, [1, 0, 0]);
    expectVectorClose(axes[1]!.direction, [1 / Math.sqrt(10), 3 / Math.sqrt(10), 0]);
    expectVectorClose(axes[2]!.direction, [0, 0, 1]);
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
      atom("Si-2", [0.1, 0.3, 0.1]),
      atom("Si-3", [0.1, 0.1, 0.3]),
    ],
    bonds: [],
    polyhedra: [],
    cell: {
      vectors: [
        [4, 0, 0],
        [1, 3, 0],
        [0, 0, 2],
      ],
    },
    summary: {
      atomCount: 4,
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

function sceneWithExportVisibilityAtoms(): SceneSpec {
  return {
    atoms: [
      atom("Na-0", [0, 0, 0]),
      {
        ...atom("Na-0-boundary", [1, 0, 0]),
        imageOffset: [1, 0, 0],
        imageReasons: ["boundary"],
        isPeriodicImage: true,
        visibilityDependencies: ["boundaryAtoms"],
        visibilityDependencyGroups: [["boundaryAtoms"]],
      },
      {
        ...atom("Cl-1-one-hop", [0, -2, 0]),
        imageOffset: [0, -1, 0],
        imageReasons: ["bonded"],
        isPeriodicImage: true,
        visibilityDependencies: ["oneHopBondedAtoms"],
        visibilityDependencyGroups: [["oneHopBondedAtoms"]],
      },
    ],
    bonds: [],
    cell: {
      vectors: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
    },
    polyhedra: [],
    summary: {
      atomCount: 1,
      cell: {
        a: "1.00",
        alpha: "90.00",
        b: "1.00",
        beta: "90.00",
        c: "1.00",
        gamma: "90.00",
      },
      formula: "NaCl",
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

function sceneWithLongCell(): SceneSpec {
  return {
    ...sceneWithOffCenterAtoms(),
    atoms: [
      atom("Si-0", [0, 0, 0]),
      atom("Si-1", [10, 0, 0]),
    ],
    cell: {
      vectors: [
        [10, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
    },
    summary: {
      ...sceneWithOffCenterAtoms().summary,
      atomCount: 2,
    },
  };
}

function atom(id: string, position: [number, number, number]): AtomSpec {
  return {
    element: "Si",
    fractionalPosition: [0, 0, 0],
    id,
    imageOffset: [0, 0, 0],
    isPeriodicImage: false,
    imageReasons: [],
    visibilityDependencies: [],
    visibilityDependencyGroups: [],
    position,
    radius: 0.5,
    radii: {
      atomic: 0.7,
      ionic: 1,
      uniform: 0.5,
      vdw: 1.5,
    },
    siteId: id,
  };
}
