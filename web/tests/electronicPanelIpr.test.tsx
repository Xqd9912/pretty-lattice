import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, mock, test } from "bun:test";

import { ElectronicPanel } from "../src/app/electronic/ElectronicPanel";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("aborts and ignores an IPR upload when another scene replaces its session", async () => {
  const requestState: { signal?: AbortSignal } = {};
  let resolveUpload: (response: Response) => void = () => {};
  globalThis.fetch = mock((_input: RequestInfo | URL, init?: RequestInit) => {
    requestState.signal = init?.signal ?? undefined;
    return new Promise<Response>((resolve) => {
      resolveUpload = resolve;
    });
  }) as unknown as typeof fetch;
  const onIprSceneLoad = mock((_next: unknown) => {});
  const commonProps = {
    isOpen: true,
    width: 520,
    onWidthChange: () => {},
    rightOffset: 0,
    onResizeActiveChange: () => {},
    onDensitySceneChange: () => {},
    onIsosurfaceChange: () => {},
    onIprSceneLoad,
  };
  const view = render(<ElectronicPanel {...commonProps} iprSessionVersion={0} />);
  const iprSection = screen.getByRole("button", { name: "Load vasprun.xml" }).closest("section");
  if (!iprSection) {
    throw new Error("IPR upload section was not rendered.");
  }
  const input = iprSection.querySelectorAll<HTMLInputElement>("input[type='file']")[1];
  if (!input) {
    throw new Error("IPR file input was not rendered.");
  }

  fireEvent.change(input, {
    target: {
      files: [new File(["xml"], "vasprun.xml", { type: "application/xml" })],
    },
  });
  await waitFor(() => expect(requestState.signal).toBeDefined());

  view.rerender(<ElectronicPanel {...commonProps} iprSessionVersion={1} />);
  expect(requestState.signal?.aborted).toBe(true);

  await act(async () => {
    resolveUpload(new Response(JSON.stringify({
      capabilities: {
        dos: { available: false },
        pdos: { available: false },
        sitePdos: { available: false },
        ipr: { available: true },
      },
      dosSeries: [],
      efermi: 0,
      electronicId: "stale",
      energy: [],
      ipr: { aggregation: "k-weighted-band-composition", states: [] },
      orbitalTypes: [],
      pdosSeries: [],
      scene: {},
      source: "vasprun",
      spinChannels: [],
      warnings: [],
    }), { status: 200 }));
  });

  expect(onIprSceneLoad).not.toHaveBeenCalled();
  expect(
    within(iprSection).getByRole("button", { name: "Load vasprun.xml" }),
  ).toBeTruthy();
});
