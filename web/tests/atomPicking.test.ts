import { describe, expect, test } from "bun:test";

import {
  ATOM_PICK_MAX_DELTA_PX,
  atomPointerDistance,
  isAtomSelectionClick,
  resolveAtomSelectionAction,
  selectedAtomInstanceIndices,
  selectedSiteIndicesForHighlight,
} from "../src/scene/atomPicking";

describe("isAtomSelectionClick", () => {
  test("accepts a short primary-button click at the movement boundaries", () => {
    expect(
      selectionClick({ button: 0, detail: 1, endX: 0 }),
    ).toBe(true);
    expect(
      selectionClick({
        button: 0,
        detail: 1,
        endX: ATOM_PICK_MAX_DELTA_PX,
      }),
    ).toBe(true);
  });

  test("rejects drag, non-primary, and repeated double-click events", () => {
    expect(
      selectionClick({
        button: 0,
        detail: 1,
        endX: ATOM_PICK_MAX_DELTA_PX + 0.001,
      }),
    ).toBe(false);
    expect(
      selectionClick({ button: 1, detail: 1, endX: 0 }),
    ).toBe(false);
    expect(
      selectionClick({ button: 2, detail: 1, endX: 0 }),
    ).toBe(false);
    expect(
      selectionClick({ button: 0, detail: 2, endX: 0 }),
    ).toBe(false);
  });

  test("measures unrounded CSS-pixel movement and rejects a missing pointerdown", () => {
    expect(
      atomPointerDistance(
        { clientX: 1, clientY: 1 },
        { clientX: 4, clientY: 5 },
      ),
    ).toBe(5);
    expect(
      selectionClick({ button: 0, detail: 1, endX: 4.1 }),
    ).toBe(false);
    expect(
      isAtomSelectionClick({
        button: 0,
        detail: 1,
        pointerDown: null,
        pointerUp: { clientX: 0, clientY: 0 },
      }),
    ).toBe(false);
  });

  test("resolves ignored, locked, and toggle actions without WebGL", () => {
    const click = selectionClickInput({ button: 0, detail: 1, endX: 0 });

    expect(resolveAtomSelectionAction(click, false)).toBe("toggle");
    expect(resolveAtomSelectionAction(click, true)).toBe("locked");
    expect(
      resolveAtomSelectionAction(
        selectionClickInput({ button: 0, detail: 2, endX: 0 }),
        false,
      ),
    ).toBe("ignore");
  });
});

function selectionClick({
  button,
  detail,
  endX,
}: {
  button: number;
  detail: number;
  endX: number;
}) {
  return isAtomSelectionClick(selectionClickInput({ button, detail, endX }));
}

function selectionClickInput({
  button,
  detail,
  endX,
}: {
  button: number;
  detail: number;
  endX: number;
}) {
  return {
    button,
    detail,
    pointerDown: { clientX: 0, clientY: 0 },
    pointerUp: { clientX: endX, clientY: 0 },
  };
}

describe("selectedAtomInstanceIndices", () => {
  test("maps a selected crystallographic site to canonical and periodic instances", () => {
    const atoms = [
      { siteIndex: 0 },
      { siteIndex: 1 },
      { siteIndex: 0 },
      { siteIndex: 2 },
      { siteIndex: 1 },
    ];

    expect(selectedAtomInstanceIndices(atoms, new Set([1]))).toEqual([1, 4]);
    expect(selectedAtomInstanceIndices(atoms, new Set([0, 2]))).toEqual([
      0,
      2,
      3,
    ]);
  });

  test("returns no instances for an unknown or empty site selection", () => {
    const atoms = [{ siteIndex: 0 }, { siteIndex: 1 }];

    expect(selectedAtomInstanceIndices(atoms, new Set())).toEqual([]);
    expect(selectedAtomInstanceIndices(atoms, new Set([99]))).toEqual([]);
  });
});

test("selected-only view suppresses redundant selection highlights", () => {
  const selectedSiteIndices = new Set([1, 3]);

  expect(selectedSiteIndicesForHighlight(selectedSiteIndices, false)).toBe(
    selectedSiteIndices,
  );
  expect(selectedSiteIndicesForHighlight(selectedSiteIndices, true)).toEqual(
    new Set(),
  );
});
