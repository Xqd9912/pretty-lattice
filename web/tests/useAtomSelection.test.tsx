import { act, renderHook } from "@testing-library/react";
import { describe, expect, test } from "bun:test";

import { useAtomSelection } from "../src/app/hooks/useAtomSelection";
import { isSiteVisible } from "../src/model";

describe("useAtomSelection IPR application", () => {
  test("shows the applied cluster without discarding unrelated base visibility", () => {
    const hook = renderHook(() => useAtomSelection());

    act(() => {
      hook.result.current.handleSiteVisibilityToggle(0);
      hook.result.current.handleSiteVisibilityToggle(1);
    });
    act(() => {
      hook.result.current.applySelectedSites([1, 2]);
    });

    expect([...hook.result.current.selectedSiteIndices]).toEqual([1, 2]);
    expect(hook.result.current.selectedOnly).toBe(true);
    expect(isSiteVisible(hook.result.current.siteVisibility, 0)).toBe(false);
    expect(isSiteVisible(hook.result.current.siteVisibility, 1)).toBe(true);
    expect(isSiteVisible(hook.result.current.siteVisibility, 2)).toBe(true);

    act(() => {
      hook.result.current.clearAppliedSelection();
    });

    expect([...hook.result.current.selectedSiteIndices]).toEqual([]);
    expect(hook.result.current.selectedOnly).toBe(false);
    expect(isSiteVisible(hook.result.current.siteVisibility, 0)).toBe(false);
    expect(isSiteVisible(hook.result.current.siteVisibility, 1)).toBe(true);
  });
});
