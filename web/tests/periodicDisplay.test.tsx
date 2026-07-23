import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, mock, test } from "bun:test";
import { useState } from "react";

import { DisplayTabContent } from "../src/app/controls/commonPanel/DisplayTab";
import { TooltipProvider } from "../src/components/ui/tooltip";
import {
  createDefaultComponentOpacity,
  createDefaultComponentVisibility,
  createDefaultPeriodicCellRange,
  type PeriodicCellRange,
} from "../src/model";

const NOOP_DISPATCH = () => {};

describe("periodic display controls", () => {
  test("commits signed cell bounds and updates the cell-count summary", () => {
    const onRangeChange = mock((_range: PeriodicCellRange) => null as string | null);

    render(
      <InteractivePeriodicDisplay onRangeChange={onRangeChange} />,
    );

    expect(screen.getByText("1 × 1 × 1 · 1 cell")).toBeTruthy();

    changeAndBlur(screen.getByRole("textbox", { name: "a cell from" }), "-1");
    expect(onRangeChange).toHaveBeenLastCalledWith({
      a: { from: -1, to: 0 },
      b: { from: 0, to: 0 },
      c: { from: 0, to: 0 },
    });
    expect(screen.getByText("2 × 1 × 1 · 2 cells")).toBeTruthy();

    changeAndBlur(screen.getByRole("textbox", { name: "a cell to" }), "1");
    expect(onRangeChange).toHaveBeenLastCalledWith({
      a: { from: -1, to: 1 },
      b: { from: 0, to: 0 },
      c: { from: 0, to: 0 },
    });
    expect(screen.getByText("3 × 1 × 1 · 3 cells")).toBeTruthy();
  });

  test("supports arrow-key increments and resets all axes", async () => {
    const user = userEvent.setup();
    const onReset = mock(() => {});

    render(
      <InteractivePeriodicDisplay
        initialRange={{
          a: { from: -1, to: 1 },
          b: { from: 0, to: 0 },
          c: { from: 0, to: 0 },
        }}
        onReset={onReset}
      />,
    );

    fireEvent.keyDown(screen.getByRole("textbox", { name: "b cell to" }), {
      key: "ArrowUp",
    });
    expect(screen.getByText("3 × 2 × 1 · 6 cells")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Reset cell range" }));
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(screen.getByText("1 × 1 × 1 · 1 cell")).toBeTruthy();
    expect((screen.getByRole("textbox", { name: "a cell from" }) as HTMLInputElement).value)
      .toBe("0");
  });

  test("Escape restores the committed value without applying the draft", () => {
    const onRangeChange = mock((_range: PeriodicCellRange) => null as string | null);
    render(<InteractivePeriodicDisplay onRangeChange={onRangeChange} />);

    const input = screen.getByRole("textbox", { name: "a cell from" });
    fireEvent.change(input, { target: { value: "-2" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect((input as HTMLInputElement).value).toBe("0");
    expect(onRangeChange).not.toHaveBeenCalled();
    expect(screen.getByText("1 × 1 × 1 · 1 cell")).toBeTruthy();
  });

  test("rejects non-integers locally and displays model validation errors", () => {
    const onRangeChange = mock((_range: PeriodicCellRange) => "Range exceeds the preview budget.");

    renderPeriodicDisplay({ onPeriodicCellRangeChange: onRangeChange });

    changeAndBlur(screen.getByRole("textbox", { name: "a cell from" }), "-0.5");
    expect(screen.getByRole("alert").textContent).toBe(
      "Cell bounds must be whole numbers.",
    );
    expect(onRangeChange).not.toHaveBeenCalled();

    changeAndBlur(screen.getByRole("textbox", { name: "a cell from" }), "-1");
    expect(onRangeChange).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert").textContent).toBe(
      "Range exceeds the preview budget.",
    );
    expect(screen.getByText("1 × 1 × 1 · 1 cell")).toBeTruthy();
  });

  test("disables range editing for non-periodic scenes and explains why", () => {
    renderPeriodicDisplay({
      periodicDisabledReason: "Periodic display requires a valid 3D periodic cell.",
    });

    expect(
      screen.getByText("Periodic display requires a valid 3D periodic cell."),
    ).toBeTruthy();
    for (const input of screen.getAllByRole("textbox", { name: /cell (from|to)$/ })) {
      expect((input as HTMLInputElement).disabled).toBe(true);
    }
    expect(
      (screen.getByRole("button", { name: "Reset cell range" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  test("shows an automatic-reset notice without replacing the current summary", () => {
    renderPeriodicDisplay({
      periodicNotice: "Cell range was reset for the newly loaded structure.",
    });

    expect(screen.getByText("1 × 1 × 1 · 1 cell")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe(
      "Cell range was reset for the newly loaded structure.",
    );
  });
});

function InteractivePeriodicDisplay({
  initialRange = createDefaultPeriodicCellRange(),
  onRangeChange,
  onReset,
}: {
  initialRange?: PeriodicCellRange;
  onRangeChange?: (range: PeriodicCellRange) => string | null;
  onReset?: () => void;
}) {
  const [range, setRange] = useState(initialRange);

  return (
    <TooltipProvider>
      <DisplayTabContent
        hasPolyhedra={false}
        onOpacityChange={NOOP_DISPATCH}
        onPeriodicCellRangeChange={(nextRange) => {
          const error = onRangeChange?.(nextRange) ?? null;
          if (!error) {
            setRange(nextRange);
          }
          return error;
        }}
        onPeriodicCellRangeReset={() => {
          onReset?.();
          setRange(createDefaultPeriodicCellRange());
        }}
        onVisibilityChange={NOOP_DISPATCH}
        opacity={createDefaultComponentOpacity()}
        periodicCellRange={range}
        visibility={createDefaultComponentVisibility()}
      />
    </TooltipProvider>
  );
}

function renderPeriodicDisplay(
  overrides: Partial<Parameters<typeof DisplayTabContent>[0]> = {},
) {
  const props: Parameters<typeof DisplayTabContent>[0] = {
    hasPolyhedra: false,
    onOpacityChange: NOOP_DISPATCH,
    onPeriodicCellRangeChange: () => null,
    onPeriodicCellRangeReset: () => {},
    onVisibilityChange: NOOP_DISPATCH,
    opacity: createDefaultComponentOpacity(),
    periodicCellRange: createDefaultPeriodicCellRange(),
    visibility: createDefaultComponentVisibility(),
    ...overrides,
  };

  return render(
    <TooltipProvider>
      <DisplayTabContent {...props} />
    </TooltipProvider>,
  );
}

function changeAndBlur(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
}
