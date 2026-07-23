import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, mock, test } from "bun:test";

import {
  fetchIprStateContributions,
  uploadVasprun,
  type IprResponse,
  type IprStateSummary,
} from "../src/api/electronic";
import { DosIprCard } from "../src/app/electronic/DosIprCard";
import { DosIprChart } from "../src/app/electronic/DosIprChart";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function state(overrides: Partial<IprStateSummary> = {}): IprStateSummary {
  return {
    stateId: "state-1",
    bandIndex: 4,
    energy: 0.25,
    energyMin: 0.2,
    energyMax: 0.3,
    occupation: 0,
    ipr: 0.46,
    kPointCount: 2,
    ...overrides,
  };
}

function response(states = [state()]): IprResponse {
  return {
    iprId: "ipr-1",
    efermi: 5.25,
    aggregation: "k-weighted-band-composition",
    dos: { energy: [-1, 0, 1], total: [0, 2, 0] },
    scene: {} as IprResponse["scene"],
    states,
  };
}

describe("DosIprChart", () => {
  test("makes each state selectable by pointer and keyboard", () => {
    const onSelect = mock((_stateId: string) => {});
    render(
      <DosIprChart
        dosEnergy={[-1, 0, 1]}
        dosTotal={[0, 1, 0]}
        states={[state()]}
        dosColor="#0000ff"
        iprColor="#ff0000"
        dosWidth={1}
        barWidth={0.6}
        onStateSelect={onSelect}
      />,
    );

    const hitTarget = screen.getByRole("button", { name: "Select nearest IPR band from chart" });
    expect(Number(hitTarget.getAttribute("width"))).toBeGreaterThanOrEqual(8);
    const svg = screen.getByRole("group", { name: "DOS and IPR vs energy" });
    svg.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 380,
      bottom: 240,
      width: 380,
      height: 240,
      toJSON: () => ({}),
    });
    fireEvent.click(hitTarget, { clientX: 220, clientY: 100 });
    expect(onSelect).toHaveBeenLastCalledWith("state-1");
    fireEvent.keyDown(hitTarget, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledTimes(2);
  });
});

describe("IPR contribution API", () => {
  test("preserves the server's actionable error message", async () => {
    globalThis.fetch = mock(async () =>
      new Response(
        JSON.stringify({ detail: { message: "IPR analysis expired; reload vasprun.xml." } }),
        { status: 404 },
      ),
    ) as unknown as typeof fetch;

    await expect(fetchIprStateContributions("expired", "band-1"))
      .rejects.toThrow("IPR analysis expired; reload vasprun.xml.");
  });

  test("does not replace AbortError with a backend-unavailable error", async () => {
    globalThis.fetch = mock(async () => {
      throw new DOMException("cancelled", "AbortError");
    }) as unknown as typeof fetch;

    const error = await fetchIprStateContributions("ipr-1", "band-1")
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("AbortError");
  });

  test("allows an in-flight vasprun upload to be aborted", async () => {
    globalThis.fetch = mock((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("cancelled", "AbortError"));
        });
      }),
    ) as unknown as typeof fetch;
    const controller = new AbortController();
    const upload = uploadVasprun(new File(["xml"], "vasprun.xml"), controller.signal)
      .catch((caught: unknown) => caught);

    controller.abort();

    const error = await upload;
    expect((error as DOMException).name).toBe("AbortError");
  });
});

describe("DosIprCard", () => {
  test("loads contributions on demand and applies an explicit cluster", async () => {
    const user = userEvent.setup();
    const onApply = mock((_siteIndices: readonly number[]) => {});
    const onClear = mock(() => {});
    globalThis.fetch = mock(async () =>
      new Response(
        JSON.stringify({
          state: state(),
          contributions: [
            { siteIndex: 0, element: "C", composition: 0.6, iprContribution: 0.36 },
            { siteIndex: 1, element: "N", composition: 0.3, iprContribution: 0.09 },
            { siteIndex: 2, element: "O", composition: 0.1, iprContribution: 0.01 },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    ) as unknown as typeof fetch;

    render(
      <DosIprCard
        ipr={response()}
        onApplyToStructure={onApply}
        onClearFromStructure={onClear}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Next IPR band" }));
    expect(await screen.findByText("2 atoms · 90.0% composition · 97.8% of IPR captured"))
      .toBeTruthy();
    expect(screen.getAllByLabelText("Included")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Apply to structure" }));
    expect(onApply).toHaveBeenLastCalledWith([0, 1]);
    expect(screen.getByText("Applied to structure")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Top K" }));
    expect(screen.getByText("Changes not applied")).toBeTruthy();
    expect(screen.getByText("3 atoms · 100.0% composition · 100.0% of IPR captured"))
      .toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Clear from structure" }));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Ready to apply")).toBeTruthy();
  });

  test("ignores a stale contribution response after selecting another state", async () => {
    const pending: Array<(response: Response) => void> = [];
    const onApply = mock((_siteIndices: readonly number[]) => {});
    globalThis.fetch = mock(
      () => new Promise<Response>((resolve) => pending.push(resolve)),
    ) as unknown as typeof fetch;
    const states = [state(), state({ stateId: "state-2", bandIndex: 5, energy: 0.5 })];
    render(
      <DosIprCard ipr={response(states)} onApplyToStructure={onApply} onClearFromStructure={() => {}} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Next IPR band" }));
    await waitFor(() => expect(pending).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "Next IPR band" }));
    await waitFor(() => expect(pending).toHaveLength(2));
    const applyButton = screen.getByRole("button", { name: "Apply to structure" });
    expect((applyButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(applyButton);
    expect(onApply).not.toHaveBeenCalled();

    await act(async () => {
      pending[1]!(new Response(JSON.stringify({
        state: states[1],
        contributions: [{ siteIndex: 8, element: "Si", composition: 1, iprContribution: 0.46 }],
      }), { status: 200 }));
    });
    expect(await screen.findByText("#9")).toBeTruthy();

    await act(async () => {
      pending[0]!(new Response(JSON.stringify({
        state: states[0],
        contributions: [{ siteIndex: 0, element: "C", composition: 1, iprContribution: 0.46 }],
      }), { status: 200 }));
    });
    expect(screen.queryByText("#1")).toBeNull();
    expect(screen.getByText("#9")).toBeTruthy();
  });

  test("cannot apply the previous band while the next band is loading", async () => {
    const pending: Array<(response: Response) => void> = [];
    const onApply = mock((_siteIndices: readonly number[]) => {});
    globalThis.fetch = mock(
      () => new Promise<Response>((resolve) => pending.push(resolve)),
    ) as unknown as typeof fetch;
    const states = [state(), state({ stateId: "state-2", bandIndex: 5, energy: 0.5 })];
    render(
      <DosIprCard
        ipr={response(states)}
        onApplyToStructure={onApply}
        onClearFromStructure={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Next IPR band" }));
    await waitFor(() => expect(pending).toHaveLength(1));
    await act(async () => {
      pending[0]!(new Response(JSON.stringify({
        state: states[0],
        contributions: [
          { siteIndex: 0, element: "C", composition: 1, iprContribution: 0.46 },
        ],
      }), { status: 200 }));
    });
    expect(await screen.findByText("#1")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Next IPR band" }));
    await waitFor(() => expect(pending).toHaveLength(2));
    const applyButton = screen.getByRole("button", { name: "Apply to structure" });
    expect((applyButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(applyButton);
    expect(onApply).not.toHaveBeenCalled();
  });

  test("reports when the Select panel changes an applied cluster", async () => {
    const user = userEvent.setup();
    const ipr = response();
    const onApply = mock((_siteIndices: readonly number[]) => {});
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({
        state: state(),
        contributions: [
          { siteIndex: 0, element: "C", composition: 0.6, iprContribution: 0.36 },
          { siteIndex: 1, element: "N", composition: 0.3, iprContribution: 0.09 },
          { siteIndex: 2, element: "O", composition: 0.1, iprContribution: 0.01 },
        ],
      }), { status: 200 }),
    ) as unknown as typeof fetch;

    const view = render(
      <DosIprCard
        ipr={ipr}
        onApplyToStructure={onApply}
        onClearFromStructure={() => {}}
        structureSelectedOnly={false}
        structureSelectedSiteIndices={new Set()}
        structureVisibleSiteIndices={new Set([0, 1, 2])}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Next IPR band" }));
    await screen.findByText("2 atoms · 90.0% composition · 97.8% of IPR captured");
    await user.click(screen.getByRole("button", { name: "Apply to structure" }));

    view.rerender(
      <DosIprCard
        ipr={ipr}
        onApplyToStructure={onApply}
        onClearFromStructure={() => {}}
        structureSelectedOnly
        structureSelectedSiteIndices={new Set([0, 1])}
        structureVisibleSiteIndices={new Set([0, 1])}
      />,
    );
    expect(screen.getByText("Applied to structure")).toBeTruthy();

    view.rerender(
      <DosIprCard
        ipr={ipr}
        onApplyToStructure={onApply}
        onClearFromStructure={() => {}}
        structureSelectedOnly
        structureSelectedSiteIndices={new Set([0])}
        structureVisibleSiteIndices={new Set([0])}
      />,
    );
    expect(screen.getByText("Structure selection changed")).toBeTruthy();
  });
});
