import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, mock, test } from "bun:test";
import { useState } from "react";

import type { AtomSpec } from "../src/api/scene";
import {
  deriveElementVisibilityEntries,
  filterAndOrderAtoms,
  SELECT_TAB_LIST_HEIGHT_PX,
  SELECT_TAB_ROW_HEIGHT_PX,
  SelectTabContent,
  virtualAtomWindow,
} from "../src/app/controls/commonPanel/SelectTab";

const NOOP = () => {};

describe("SelectTabContent", () => {
  test("summarizes mixed element visibility and keeps hidden coordinates readable", () => {
    const atoms = [atom(0, "O"), atom(1, "Na"), atom(2, "O")];
    const hidden = new Set([2]);

    renderSelectTab({
      atoms,
      selectedSiteIndices: new Set([1]),
      isSiteVisible: (siteIndex) => !hidden.has(siteIndex),
    });

    expect(screen.getByText("1 selected · 2 / 3 visible")).toBeTruthy();
    const elementButtons = within(screen.getByRole("group", { name: "Element visibility" }))
      .getAllByRole("button");
    expect(elementButtons.map((button) => button.textContent)).toEqual(["O1/2", "Na1/1"]);
    expect(elementButtons[0]?.getAttribute("data-visibility-state")).toBe("mixed");
    expect(elementButtons[0]?.getAttribute("aria-pressed")).toBe("mixed");
    expect(elementButtons[1]?.getAttribute("data-visibility-state")).toBe("full");

    const hiddenToggle = screen.getByRole("button", { name: "Show hidden atom #3 O" });
    const hiddenRow = hiddenToggle.closest<HTMLElement>("[role='listitem']");
    expect(hiddenRow).not.toBeNull();
    expect(within(hiddenRow!).getByText("0.200 0.300 0.400")).toBeTruthy();
    expect(
      within(hiddenRow!).getByLabelText(
        "Fractional coordinates [0.200, 0.300, 0.400]",
      ),
    ).toBeTruthy();
    expect(within(hiddenRow!).queryByText("Hidden")).toBeNull();
  });

  test("keeps selection, base visibility, and selected-only visibility distinct", async () => {
    const user = userEvent.setup();
    render(
      <InteractiveSelectTab
        atoms={[atom(0, "Na"), atom(1, "Cl"), atom(2, "Na")]}
        initialSelected={[1]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Selected only" }));
    expect(screen.getByText("1 selected · 1 / 3 visible")).toBeTruthy();

    const unselectedRow = screen
      .getByRole("button", { name: "Hide atom #1 Na" })
      .closest<HTMLElement>("[role='listitem']");
    expect(unselectedRow?.getAttribute("data-visible")).toBe("false");
    expect(unselectedRow?.getAttribute("data-base-visible")).toBe("true");

    await user.click(screen.getByRole("button", { name: "Hide atom #2 Cl" }));
    expect(screen.getByText("1 selected · 0 / 3 visible")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show hidden atom #2 Cl" })).toBeTruthy();
    expect(screen.getByText("0.100 0.200 0.300")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Toggle Cl visibility, 0 of 1 visible/ }))
      .toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Show hidden atom #2 Cl" }));
    expect(screen.getByText("1 selected · 1 / 3 visible")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hide atom #2 Cl" })).toBeTruthy();
  });

  test("searches element symbols case-insensitively and atom numbers exactly", async () => {
    const user = userEvent.setup();
    renderSelectTab({ atoms: [atom(0, "Na"), atom(1, "Cl"), atom(2, "Na")] });

    const search = screen.getByRole("searchbox", { name: "Search atoms" });
    await user.type(search, "nA");
    expect(screen.getAllByRole("listitem").map((row) => row.textContent)).toEqual([
      "#1 Na0.000 0.100 0.200",
      "#3 Na0.200 0.300 0.400",
    ]);

    await user.clear(search);
    await user.type(search, "#2");
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("checkbox", { name: "Select atom #2 Cl" })).toBeTruthy();

    await user.clear(search);
    await user.type(search, "20");
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByText("No matching atoms.")).toBeTruthy();

    await user.clear(search);
    await user.type(search, "N");
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  test("keeps number order while selecting until selected-first sorting is requested", async () => {
    const user = userEvent.setup();
    render(<InteractiveSelectTab atoms={[atom(0, "C"), atom(1, "C"), atom(2, "C")]} />);

    const numberSort = screen.getByRole("button", { name: "Sort atoms by number" });
    const selectedSort = screen.getByRole("button", { name: "Put selected atoms first" });
    expect(numberSort.getAttribute("aria-pressed")).toBe("true");
    expect(selectedSort.getAttribute("aria-pressed")).toBe("false");

    await user.click(screen.getByRole("checkbox", { name: "Select atom #3 C" }));
    expect(renderedSiteIndices()).toEqual([0, 1, 2]);

    await user.click(selectedSort);
    expect(selectedSort.getAttribute("aria-pressed")).toBe("true");
    expect(numberSort.getAttribute("aria-pressed")).toBe("false");
    expect(renderedSiteIndices()).toEqual([2, 0, 1]);

    await user.click(numberSort);
    expect(renderedSiteIndices()).toEqual([0, 1, 2]);
  });

  test("uses a fixed-height windowed scroll list without pagination", () => {
    const atoms = Array.from({ length: 50 }, (_, index) => atom(index, "C"));
    renderSelectTab({ atoms });

    const list = screen.getByRole("list", { name: "Atoms" }) as HTMLDivElement;
    expect(list.style.height).toBe(`${SELECT_TAB_LIST_HEIGHT_PX}px`);
    expect((list.firstElementChild as HTMLElement | null)?.style.height).toBe(
      `${atoms.length * SELECT_TAB_ROW_HEIGHT_PX}px`,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(11);
    expect(renderedSiteIndices()).toEqual(Array.from({ length: 11 }, (_, index) => index));
    expect(screen.queryByRole("button", { name: "Previous atom page" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Next atom page" })).toBeNull();
    expect(screen.queryByText(/Page \d/)).toBeNull();

    list.scrollTop = SELECT_TAB_ROW_HEIGHT_PX * 20;
    fireEvent.scroll(list);

    expect(screen.getAllByRole("listitem").length).toBeLessThan(atoms.length);
    expect(renderedSiteIndices()[0]).toBe(17);
    expect(renderedSiteIndices().at(-1)).toBe(30);
  });

  test("exposes selected-only as a view mode and groups actions by meaning", async () => {
    const user = userEvent.setup();
    const onSelectedOnlyChange = mock((_enabled: boolean) => {});
    const atoms = [atom(0, "Na"), atom(1, "Cl")];
    const props = {
      ...staticProps(atoms),
      onSelectedOnlyChange,
    };
    const { rerender } = render(<SelectTabContent {...props} selectedOnly={false} />);

    const viewMode = screen.getByRole("group", { name: "View mode" });
    const visibilityActions = screen.getByRole("group", { name: "Visibility actions" });
    const selectionActions = screen.getByRole("group", { name: "Selection actions" });
    expect(
      within(viewMode).getAllByRole("button").map((button) => button.textContent),
    ).toEqual(["Normal view", "Selected only"]);
    expect(
      within(visibilityActions).getAllByRole("button").map((button) => button.textContent),
    ).toEqual(["Hide selected", "Show all"]);
    expect(
      within(selectionActions).getAllByRole("button").map((button) => button.textContent),
    ).toEqual(["Invert", "Clear"]);

    const normalView = within(viewMode).getByRole("button", { name: "Normal view" });
    const selectedOnly = within(viewMode).getByRole("button", {
      name: "Selected only",
    });
    expect(normalView.getAttribute("aria-pressed")).toBe("true");
    expect(selectedOnly.getAttribute("aria-pressed")).toBe("false");
    await user.click(selectedOnly);
    expect(onSelectedOnlyChange).toHaveBeenLastCalledWith(true);

    rerender(<SelectTabContent {...props} selectedOnly={true} />);
    expect(
      screen.getByRole("button", { name: "Selected only" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "Normal view" }).getAttribute("aria-pressed"),
    ).toBe("false");
    await user.click(screen.getByRole("button", { name: "Selected only" }));
    expect(onSelectedOnlyChange).toHaveBeenLastCalledWith(false);
  });

  test("keeps selection independent from manual visibility actions", async () => {
    const user = userEvent.setup();
    render(<InteractiveSelectTab atoms={[atom(0, "Na"), atom(1, "Cl"), atom(2, "Na")]} />);

    expect((screen.getByRole("button", { name: "Hide selected" }) as HTMLButtonElement).disabled)
      .toBe(true);
    expect((screen.getByRole("button", { name: "Show all atoms" }) as HTMLButtonElement).disabled)
      .toBe(true);
    expect((screen.getByRole("button", { name: "Clear selection" }) as HTMLButtonElement).disabled)
      .toBe(true);
    expect((screen.getByRole("button", { name: "Invert selection" }) as HTMLButtonElement).disabled)
      .toBe(false);

    await user.click(screen.getByRole("checkbox", { name: "Select atom #1 Na" }));
    await user.click(screen.getByRole("checkbox", { name: "Select atom #3 Na" }));
    await user.click(screen.getByRole("button", { name: "Hide selected" }));
    expect(screen.getByText("2 selected · 1 / 3 visible")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Show hidden atom/ })).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(screen.getByText("0 selected · 1 / 3 visible")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Show hidden atom/ })).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: /Toggle Na visibility/ }));
    expect(screen.getByText("0 selected · 3 / 3 visible")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Invert selection" }));
    expect(screen.getByText("3 selected · 3 / 3 visible")).toBeTruthy();
  });

  test("show all restores visibility without clearing selection", async () => {
    const user = userEvent.setup();
    render(
      <InteractiveSelectTab
        atoms={[atom(0, "Na"), atom(1, "Cl"), atom(2, "Na")]}
        initialSelected={[1]}
        initialVisible={[0]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Show all atoms" }));
    expect(screen.getByText("1 selected · 3 / 3 visible")).toBeTruthy();
    expect(
      screen.getByRole("checkbox", { name: "Select atom #2 Cl" }).getAttribute("aria-checked"),
    ).toBe("true");
  });

  test("session changes reset search, sort mode, and scroll position", async () => {
    const user = userEvent.setup();
    const atoms = Array.from({ length: 30 }, (_, index) => atom(index, "C"));
    const props = {
      ...staticProps(atoms),
      selectedSiteIndices: new Set([29]) as ReadonlySet<number>,
    };
    const { rerender } = render(<SelectTabContent {...props} sessionVersion={1} />);

    await user.type(screen.getByRole("searchbox", { name: "Search atoms" }), "C");
    await user.click(screen.getByRole("button", { name: "Put selected atoms first" }));
    expect(renderedSiteIndices()[0]).toBe(29);

    const list = screen.getByRole("list", { name: "Atoms" }) as HTMLDivElement;
    list.scrollTop = SELECT_TAB_ROW_HEIGHT_PX * 10;
    fireEvent.scroll(list);
    expect(list.scrollTop).toBe(SELECT_TAB_ROW_HEIGHT_PX * 10);

    rerender(<SelectTabContent {...props} sessionVersion={2} />);

    expect((screen.getByRole("searchbox", { name: "Search atoms" }) as HTMLInputElement).value)
      .toBe("");
    expect(
      screen.getByRole("button", { name: "Sort atoms by number" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "Put selected atoms first" }).getAttribute(
        "aria-pressed",
      ),
    ).toBe("false");
    expect(list.scrollTop).toBe(0);
    expect(renderedSiteIndices()[0]).toBe(0);
  });

  test("renders a fixed-height empty state with safe action disablement", () => {
    renderSelectTab({ atoms: [] });

    expect(screen.getByText("0 selected · 0 / 0 visible")).toBeTruthy();
    expect(screen.getAllByText("No atoms available.")).toHaveLength(2);
    expect(screen.getByRole("list", { name: "Atoms" }).getAttribute("style")).toContain(
      `height: ${SELECT_TAB_LIST_HEIGHT_PX}px`,
    );
    expect((screen.getByRole("button", { name: "Selected only" }) as HTMLButtonElement).disabled)
      .toBe(true);
    expect((screen.getByRole("button", { name: "Invert selection" }) as HTMLButtonElement).disabled)
      .toBe(true);
    expect((screen.getByRole("button", { name: "Show all atoms" }) as HTMLButtonElement).disabled)
      .toBe(true);
    expect(screen.queryByText(/Page \d/)).toBeNull();
  });
});

describe("Select tab derivation", () => {
  test("derives full, mixed, and hidden element states without sorting elements", () => {
    const atoms = [atom(0, "O"), atom(1, "Na"), atom(2, "O"), atom(3, "Cl")];
    const visible = new Set([0, 1]);

    expect(deriveElementVisibilityEntries(atoms, (siteIndex) => visible.has(siteIndex))).toEqual([
      { element: "O", totalCount: 2, visibleCount: 1, state: "mixed" },
      { element: "Na", totalCount: 1, visibleCount: 1, state: "full" },
      { element: "Cl", totalCount: 1, visibleCount: 0, state: "none" },
    ]);
  });

  test("sorts by atom number by default and only pins selection in selected mode", () => {
    const atoms = [atom(3, "Si"), atom(1, "Si"), atom(2, "O"), atom(0, "Si")];
    const selected = new Set([3, 1]);

    expect(filterAndOrderAtoms(atoms, "si", selected).map((entry) => entry.siteIndex)).toEqual([
      0,
      1,
      3,
    ]);
    expect(
      filterAndOrderAtoms(atoms, "si", selected, "selected").map((entry) => entry.siteIndex),
    ).toEqual([1, 3, 0]);
    expect(filterAndOrderAtoms(atoms, "3", new Set()).map((entry) => entry.siteIndex)).toEqual([
      2,
    ]);
  });

  test("calculates an overscanned atom window from fixed row geometry", () => {
    expect(virtualAtomWindow(100, 0)).toEqual({ startIndex: 0, endIndex: 11 });
    expect(virtualAtomWindow(100, SELECT_TAB_ROW_HEIGHT_PX * 20)).toEqual({
      startIndex: 17,
      endIndex: 31,
    });
    expect(virtualAtomWindow(5, Number.NaN)).toEqual({ startIndex: 0, endIndex: 5 });
  });
});

function renderSelectTab({
  atoms,
  isSiteBaseVisible,
  isSiteVisible = () => true,
  onElementVisibilityToggle = NOOP,
  onSelectedOnlyChange = NOOP,
  onSiteSelectionToggle = NOOP,
  onSiteVisibilityToggle = NOOP,
  selectedOnly = false,
  selectedSiteIndices = new Set<number>(),
}: {
  atoms: readonly AtomSpec[];
  isSiteBaseVisible?: (siteIndex: number) => boolean;
  isSiteVisible?: (siteIndex: number) => boolean;
  onElementVisibilityToggle?: (element: string) => void;
  onSelectedOnlyChange?: (enabled: boolean) => void;
  onSiteSelectionToggle?: (siteIndex: number) => void;
  onSiteVisibilityToggle?: (siteIndex: number) => void;
  selectedOnly?: boolean;
  selectedSiteIndices?: ReadonlySet<number>;
}) {
  const resolvedSiteBaseVisibility = isSiteBaseVisible ?? isSiteVisible;
  return render(
    <SelectTabContent
      {...staticProps(atoms)}
      isSiteBaseVisible={resolvedSiteBaseVisibility}
      isSiteVisible={isSiteVisible}
      onElementVisibilityToggle={onElementVisibilityToggle}
      onSelectedOnlyChange={onSelectedOnlyChange}
      onSiteSelectionToggle={onSiteSelectionToggle}
      onSiteVisibilityToggle={onSiteVisibilityToggle}
      selectedOnly={selectedOnly}
      selectedSiteIndices={selectedSiteIndices}
    />,
  );
}

function InteractiveSelectTab({
  atoms,
  initialSelected = [],
  initialVisible = atoms.map((entry) => entry.siteIndex),
}: {
  atoms: readonly AtomSpec[];
  initialSelected?: number[];
  initialVisible?: number[];
}) {
  const [selectedSiteIndices, setSelectedSiteIndices] = useState<ReadonlySet<number>>(
    () => new Set(initialSelected),
  );
  const [visibleSiteIndices, setVisibleSiteIndices] = useState<ReadonlySet<number>>(
    () => new Set(initialVisible),
  );
  const [selectedOnly, setSelectedOnly] = useState(false);

  return (
    <SelectTabContent
      canonicalAtoms={atoms}
      selectedSiteIndices={selectedSiteIndices}
      selectedOnly={selectedOnly}
      isSiteBaseVisible={(siteIndex) => visibleSiteIndices.has(siteIndex)}
      isSiteVisible={(siteIndex) =>
        visibleSiteIndices.has(siteIndex) &&
        (!selectedOnly || selectedSiteIndices.has(siteIndex))
      }
      onSiteSelectionToggle={(siteIndex) => {
        setSelectedSiteIndices((current) => toggleSetValue(current, siteIndex));
      }}
      onElementVisibilityToggle={(element) => {
        const elementSiteIndices = atoms
          .filter((entry) => entry.element === element)
          .map((entry) => entry.siteIndex);
        const allVisible = elementSiteIndices.every((siteIndex) =>
          visibleSiteIndices.has(siteIndex),
        );
        setVisibleSiteIndices((current) => {
          const next = new Set(current);
          for (const siteIndex of elementSiteIndices) {
            if (allVisible) {
              next.delete(siteIndex);
            } else {
              next.add(siteIndex);
            }
          }
          return next;
        });
      }}
      onSiteVisibilityToggle={(siteIndex) => {
        setVisibleSiteIndices((current) => toggleSetValue(current, siteIndex));
      }}
      onSelectedOnlyChange={setSelectedOnly}
      onHideSelected={() => {
        setSelectedOnly(false);
        setVisibleSiteIndices((current) => {
          const next = new Set(current);
          for (const siteIndex of selectedSiteIndices) {
            next.delete(siteIndex);
          }
          return next;
        });
      }}
      onShowAll={() => {
        setSelectedOnly(false);
        setVisibleSiteIndices(new Set(atoms.map((entry) => entry.siteIndex)));
      }}
      onInvertSelection={() => {
        setSelectedSiteIndices(
          new Set(
            atoms
              .map((entry) => entry.siteIndex)
              .filter((siteIndex) => !selectedSiteIndices.has(siteIndex)),
          ),
        );
      }}
      onClearSelection={() => {
        setSelectedOnly(false);
        setSelectedSiteIndices(new Set());
      }}
      sessionVersion={0}
    />
  );
}

function staticProps(atoms: readonly AtomSpec[]) {
  return {
    canonicalAtoms: atoms,
    selectedSiteIndices: new Set<number>() as ReadonlySet<number>,
    selectedOnly: false,
    isSiteBaseVisible: () => true,
    isSiteVisible: () => true,
    onSiteSelectionToggle: NOOP,
    onSiteVisibilityToggle: NOOP,
    onElementVisibilityToggle: NOOP,
    onSelectedOnlyChange: NOOP,
    onHideSelected: NOOP,
    onShowAll: NOOP,
    onInvertSelection: NOOP,
    onClearSelection: NOOP,
    sessionVersion: 0,
  };
}

function renderedSiteIndices(): number[] {
  return screen.getAllByRole("listitem").map((row) => Number(row.getAttribute("data-site-index")));
}

function toggleSetValue(values: ReadonlySet<number>, value: number): ReadonlySet<number> {
  const next = new Set(values);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
}

function atom(siteIndex: number, element: string): AtomSpec {
  const coordinate = siteIndex / 10;
  return {
    id: `atom-${siteIndex}`,
    siteId: `site-${siteIndex}`,
    siteIndex,
    element,
    position: [siteIndex, 0, 0],
    fractionalPosition: [coordinate, coordinate + 0.1, coordinate + 0.2],
    imageOffset: [0, 0, 0],
    isPeriodicImage: false,
    imageReasons: [],
    visibilityDependencies: [],
    visibilityDependencyGroups: [],
  };
}
