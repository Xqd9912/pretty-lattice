import { describe, expect, test } from "bun:test";

import type { IprAtomContribution } from "../src/api/electronic";
import {
  IPR_CONTRIBUTION_LIST_HEIGHT_PX,
  IPR_CONTRIBUTION_ROW_HEIGHT_PX,
  IprContributionCache,
  selectIprCluster,
  virtualIprContributionWindow,
} from "../src/app/electronic/iprSelection";

describe("IPR contribution cache", () => {
  test("evicts the least-recently-used state at its fixed capacity", () => {
    const cache = new IprContributionCache<number>(2);
    cache.set("first", 1);
    cache.set("second", 2);
    expect(cache.get("first")).toBe(1);

    cache.set("third", 3);

    expect(cache.get("second")).toBeUndefined();
    expect(cache.get("first")).toBe(1);
    expect(cache.get("third")).toBe(3);
  });
});

function contribution(
  siteIndex: number,
  composition: number,
  iprContribution = composition * composition,
): IprAtomContribution {
  return { siteIndex, element: "C", composition, iprContribution };
}

describe("IPR cluster selection", () => {
  test("uses the shortest deterministic composition prefix", () => {
    const selected = selectIprCluster(
      [contribution(3, 0.1), contribution(2, 0.3), contribution(0, 0.3), contribution(1, 0.3)],
      { mode: "composition", threshold: 0.9 },
    );

    expect(selected.rows.map((row) => row.siteIndex)).toEqual([0, 1, 2, 3]);
    expect(selected.siteIndices).toEqual([0, 1, 2]);
    expect(selected.includedComposition).toBeCloseTo(0.9, 12);
    expect(selected.rows.map((row) => row.cumulativeComposition)).toEqual([
      0.3,
      0.6,
      0.8999999999999999,
      0.9999999999999999,
    ]);
  });

  test("counts composition rather than IPR contribution", () => {
    const selected = selectIprCluster(
      [contribution(0, 0.6, 0.36), contribution(1, 0.3, 0.09), contribution(2, 0.1, 0.01)],
      { mode: "composition", threshold: 0.9 },
    );

    expect(selected.siteIndices).toEqual([0, 1]);
    expect(selected.includedIprContribution).toBeCloseTo(0.45);
  });

  test("clamps Top K to positive-composition atoms", () => {
    const selected = selectIprCluster(
      [contribution(0, 0.7), contribution(1, 0.3), contribution(2, 0)],
      { mode: "top-k", topK: 20 },
    );

    expect(selected.siteIndices).toEqual([0, 1]);
    expect(selected.rows[2]?.included).toBe(false);
  });

  test("returns an empty cluster for a zero-projection state", () => {
    expect(
      selectIprCluster([contribution(0, 0), contribution(1, 0)], {
        mode: "composition",
        threshold: 0.9,
      }).siteIndices,
    ).toEqual([]);
  });
});

describe("IPR contribution virtualization", () => {
  test("renders a bounded overscanned window", () => {
    const window = virtualIprContributionWindow(
      100,
      20 * IPR_CONTRIBUTION_ROW_HEIGHT_PX,
      IPR_CONTRIBUTION_LIST_HEIGHT_PX,
    );

    expect(window.start).toBe(17);
    expect(window.end).toBe(31);
    expect(window.offsetTop).toBe(17 * IPR_CONTRIBUTION_ROW_HEIGHT_PX);
    expect(window.totalHeight).toBe(100 * IPR_CONTRIBUTION_ROW_HEIGHT_PX);
  });
});
