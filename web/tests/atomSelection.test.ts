import { describe, expect, test } from "bun:test";

import type { AtomSpec, SceneSpec } from "../src/api/scene";
import {
  canonicalSiteIndices,
  canonicalSites,
  clearSiteSelection,
  countVisibleSites,
  createDefaultSiteVisibility,
  elementVisibilitySummaries,
  hideSelectedSites,
  invertSiteSelection,
  isSiteVisible,
  isolateSelectedSites,
  reconcileSiteIndices,
  reconcileSiteSelection,
  reconcileSiteVisibility,
  setElementVisibility,
  setSiteVisibility,
  showAllSites,
  toggleElementVisibility,
  toggleSiteSelection,
  toggleSiteVisibility,
  visibleSceneForSites,
} from "../src/model";

describe("atom selection", () => {
  test("derives canonical sites once in structure order", () => {
    const scene = selectionScene();

    expect(canonicalSites(scene).map((atom) => atom.id)).toEqual([
      "Na-0",
      "Cl-1",
      "Na-2",
      "O-3",
    ]);
    expect(canonicalSiteIndices(scene)).toEqual([0, 1, 2, 3]);
    expect(canonicalSites(null)).toEqual([]);
  });

  test("toggles, clears, and inverts selection without mutating the input", () => {
    const initial = new Set([1]);
    const added = toggleSiteSelection(initial, 2);
    const removed = toggleSiteSelection(added, 1);

    expect(initial).toEqual(new Set([1]));
    expect(added).toEqual(new Set([1, 2]));
    expect(removed).toEqual(new Set([2]));
    expect(clearSiteSelection()).toEqual(new Set());
    expect(invertSiteSelection(new Set([1, 3, 99]), [0, 1, 2, 3])).toEqual(
      new Set([0, 2]),
    );
  });

  test("supports cumulative hide, isolate, and show all visibility actions", () => {
    const initial = createDefaultSiteVisibility();
    const hiddenOne = hideSelectedSites(initial, new Set([1]));
    const hiddenTwo = hideSelectedSites(hiddenOne, new Set([2]));

    expect(initial).toEqual({ mode: "all-except", siteIndices: new Set() });
    expect(hiddenTwo).toEqual({ mode: "all-except", siteIndices: new Set([1, 2]) });
    expect(isSiteVisible(hiddenTwo, 0)).toBe(true);
    expect(isSiteVisible(hiddenTwo, 1)).toBe(false);

    const isolated = isolateSelectedSites(new Set([0, 2]));
    expect(isolated).toEqual({ mode: "only", siteIndices: new Set([0, 2]) });
    expect(hideSelectedSites(isolated, new Set([2]))).toEqual({
      mode: "only",
      siteIndices: new Set([0]),
    });
    expect(showAllSites()).toEqual({ mode: "all-except", siteIndices: new Set() });
  });

  test("sets and toggles one site in both visibility modes without mutation", () => {
    const allExcept = {
      mode: "all-except" as const,
      siteIndices: new Set([1]),
    };
    const restored = setSiteVisibility(allExcept, 1, true);
    const hidden = toggleSiteVisibility(restored, 2);

    expect(allExcept.siteIndices).toEqual(new Set([1]));
    expect(restored).toEqual({ mode: "all-except", siteIndices: new Set() });
    expect(hidden).toEqual({ mode: "all-except", siteIndices: new Set([2]) });
    expect(toggleSiteVisibility(hidden, 2)).toEqual({
      mode: "all-except",
      siteIndices: new Set(),
    });

    const only = { mode: "only" as const, siteIndices: new Set([0, 2]) };
    const removed = setSiteVisibility(only, 2, false);
    const added = toggleSiteVisibility(removed, 1);

    expect(only.siteIndices).toEqual(new Set([0, 2]));
    expect(removed).toEqual({ mode: "only", siteIndices: new Set([0]) });
    expect(added).toEqual({ mode: "only", siteIndices: new Set([0, 1]) });
    expect(toggleSiteVisibility(added, 1)).toEqual({
      mode: "only",
      siteIndices: new Set([0]),
    });
  });

  test("toggles whole elements and reports visible, mixed, and hidden counts", () => {
    const scene = selectionScene();
    const initial = createDefaultSiteVisibility();

    expect(elementVisibilitySummaries(scene, initial)).toEqual([
      { element: "Na", totalCount: 2, visibleCount: 2, status: "visible" },
      { element: "Cl", totalCount: 1, visibleCount: 1, status: "visible" },
      { element: "O", totalCount: 1, visibleCount: 1, status: "visible" },
    ]);

    const mixedNa = hideSelectedSites(initial, new Set([0]));
    expect(elementVisibilitySummaries(scene, mixedNa)[0]).toEqual({
      element: "Na",
      totalCount: 2,
      visibleCount: 1,
      status: "mixed",
    });

    // A partially hidden element is restored by its next toggle.
    const restoredNa = toggleElementVisibility(scene, mixedNa, "Na");
    expect(elementVisibilitySummaries(scene, restoredNa)[0]?.status).toBe("visible");

    const hiddenNa = toggleElementVisibility(scene, restoredNa, "Na");
    expect(elementVisibilitySummaries(scene, hiddenNa)[0]).toEqual({
      element: "Na",
      totalCount: 2,
      visibleCount: 0,
      status: "hidden",
    });
    expect(countVisibleSites(scene, hiddenNa)).toBe(2);

    const onlyCl = setElementVisibility(
      scene,
      isolateSelectedSites(new Set([1, 2])),
      "Na",
      false,
    );
    expect(onlyCl).toEqual({ mode: "only", siteIndices: new Set([1]) });
  });

  test("reconciles selection and both visibility modes against a recomputed scene", () => {
    const unchangedSelection = new Set([0, 2]);
    expect(reconcileSiteIndices(unchangedSelection, [0, 1, 2])).toBe(
      unchangedSelection,
    );
    expect(reconcileSiteIndices(new Set([0, 2, 8]), [0, 1, 2])).toEqual(
      new Set([0, 2]),
    );
    expect(reconcileSiteSelection(new Set([1, 3, 9]), selectionScene())).toEqual(
      new Set([1, 3]),
    );
    expect(
      reconcileSiteVisibility(
        { mode: "all-except", siteIndices: new Set([0, 9]) },
        selectionScene(),
      ),
    ).toEqual({ mode: "all-except", siteIndices: new Set([0]) });
    expect(
      reconcileSiteVisibility(
        { mode: "only", siteIndices: new Set([2, 9]) },
        selectionScene(),
      ),
    ).toEqual({ mode: "only", siteIndices: new Set([2]) });
  });

  test("filters canonical atoms and all their images, then remaps surviving relations", () => {
    const scene = selectionScene();
    const originalAtoms = scene.atoms.slice();
    const originalBonds = scene.bonds.map((bond) => ({ ...bond }));
    const filtered = visibleSceneForSites(scene, {
      mode: "all-except",
      siteIndices: new Set([1]),
    });

    expect(filtered?.atoms.map((atom) => atom.id)).toEqual([
      "Na-0",
      "Na-0-image-1-0-0",
      "Na-2",
      "O-3",
    ]);
    expect(filtered?.bonds).toEqual([
      expect.objectContaining({ startAtomIndex: 2, endAtomIndex: 3 }),
    ]);
    expect(filtered?.polyhedra).toEqual([
      expect.objectContaining({ centerAtomIndex: 0, hullAtomIndices: [0, 2] }),
    ]);
    expect(scene.atoms).toEqual(originalAtoms);
    expect(scene.bonds).toEqual(originalBonds);
  });

  test("keeps a complete polyhedron and remaps its center and hull atom indices", () => {
    const filtered = visibleSceneForSites(selectionScene(), isolateSelectedSites(new Set([0, 2])));

    expect(filtered?.atoms.map((atom) => atom.id)).toEqual([
      "Na-0",
      "Na-0-image-1-0-0",
      "Na-2",
    ]);
    expect(filtered?.polyhedra).toEqual([
      expect.objectContaining({ centerAtomIndex: 0, hullAtomIndices: [0, 2] }),
    ]);
  });

  test("supports a fully hidden structure while preserving cell and summary metadata", () => {
    const scene = selectionScene();
    const filtered = visibleSceneForSites(scene, isolateSelectedSites(new Set()));

    expect(filtered?.atoms).toEqual([]);
    expect(filtered?.bonds).toEqual([]);
    expect(filtered?.polyhedra).toEqual([]);
    expect(filtered?.cell).toBe(scene.cell);
    expect(filtered?.summary).toBe(scene.summary);
  });

  test("preserves the raw scene identity while every site remains visible", () => {
    const scene = selectionScene();

    expect(visibleSceneForSites(scene, createDefaultSiteVisibility())).toBe(scene);
  });
});

function selectionScene(): SceneSpec {
  return {
    atoms: [
      atom("Na-0", "Na", 0),
      atom("Na-0-image-1-0-0", "Na", 0, true),
      atom("Cl-1", "Cl", 1),
      atom("Cl-1-image-0-1-0", "Cl", 1, true),
      atom("Na-2", "Na", 2),
      atom("O-3", "O", 3),
    ],
    bonds: [
      bond(0, 2),
      bond(1, 2),
      bond(2, 4),
      bond(4, 5),
    ],
    polyhedra: [
      {
        centerAtomIndex: 0,
        hullAtomIndices: [0, 4],
        faces: [],
        visibilityDependencies: [],
        visibilityDependencyGroups: [],
      },
      {
        centerAtomIndex: 2,
        // The center is intentionally not part of the hull so the test above
        // independently verifies that a hidden center removes the polyhedron.
        hullAtomIndices: [0, 4, 5],
        faces: [[0, 1, 2]],
        visibilityDependencies: [],
        visibilityDependencyGroups: [],
      },
    ],
    bondCutoffs: [],
    cell: {
      periodic: true,
      vectors: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
    },
    summary: {
      formula: "Na2ClO",
      atomCount: 4,
      cell: {
        a: "1.00",
        b: "1.00",
        c: "1.00",
        alpha: "90.00",
        beta: "90.00",
        gamma: "90.00",
      },
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
  };
}

function atom(
  id: string,
  element: string,
  siteIndex: number,
  isPeriodicImage = false,
): AtomSpec {
  return {
    id,
    siteId: `${element}-${siteIndex}`,
    siteIndex,
    element,
    position: [siteIndex, 0, 0],
    fractionalPosition: [siteIndex / 4, 0, 0],
    imageOffset: isPeriodicImage ? [1, 0, 0] : [0, 0, 0],
    isPeriodicImage,
    imageReasons: isPeriodicImage ? ["boundary"] : [],
    visibilityDependencies: isPeriodicImage ? ["boundaryAtoms"] : [],
    visibilityDependencyGroups: isPeriodicImage ? [["boundaryAtoms"]] : [],
  };
}

function bond(startAtomIndex: number, endAtomIndex: number): SceneSpec["bonds"][number] {
  return {
    startAtomIndex,
    endAtomIndex,
    visibilityDependencies: [],
    visibilityDependencyGroups: [],
  };
}
