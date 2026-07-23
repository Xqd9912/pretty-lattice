import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, mock, test } from "bun:test";

import { ElectronicDosCard } from "../src/app/electronic/ElectronicDosCard";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("ElectronicDosCard", () => {
  test("snapshots canonical selected sites into one replaceable PDOS group", async () => {
    const user = userEvent.setup();
    let requestBody: unknown;
    globalThis.fetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({
        energy: [-1, 0, 1],
        siteIndices: [0, 2],
        atomCount: 2,
        series: [{
          id: "selected:total:up",
          label: "Selected total (up)",
          kind: "site-group",
          orbital: "total",
          spin: "up",
          values: [2, 4, 6],
        }],
      }), { status: 200 });
    }) as unknown as typeof fetch;

    const view = render(
      <ElectronicDosCard
        electronicId="electronic-1"
        energy={[-1, 0, 1]}
        series={[{
          id: "tdos:up",
          label: "TDOS",
          kind: "tdos",
          spin: "up",
          values: [1, 2, 1],
        }]}
        selectedSiteIndices={new Set([2, 0])}
        sitePdosCapability={{ available: true }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Add selected atoms" }));
    await screen.findByText(/Selected atoms \(2\)/);
    expect(requestBody).toEqual({ siteIndices: [0, 2] });
    expect(screen.getByText(/#1, #3/)).toBeTruthy();

    view.rerender(
      <ElectronicDosCard
        electronicId="electronic-1"
        energy={[-1, 0, 1]}
        series={[{
          id: "tdos:up",
          label: "TDOS",
          kind: "tdos",
          spin: "up",
          values: [1, 2, 1],
        }]}
        selectedSiteIndices={new Set([1])}
        sitePdosCapability={{ available: true }}
      />,
    );
    expect(screen.getByText(/#1, #3/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Replace from Select" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Average" }));
    expect(screen.getByRole("button", { name: "Average" }).getAttribute("aria-pressed")).toBe("true");
  });

  test("explains that TDOS.dat cannot provide atom PDOS", async () => {
    render(<ElectronicDosCard energy={[0]} series={[]} />);
    await waitFor(() => expect(screen.getByText(/TDOS.dat contains total DOS only/)).toBeTruthy());
  });

  test("toggles orbital series without retaining a cleared React event", async () => {
    const user = userEvent.setup();
    render(
      <ElectronicDosCard
        electronicId="electronic-series"
        energy={[-1, 0, 1]}
        series={[
          {
            id: "tdos:up",
            label: "TDOS (up)",
            kind: "tdos",
            spin: "up",
            values: [1, 2, 1],
          },
          {
            id: "orbital:p:up",
            label: "p (up)",
            kind: "orbital",
            orbital: "p",
            spin: "up",
            values: [0.5, 1, 0.5],
          },
        ]}
        sitePdosCapability={{ available: false }}
      />,
    );

    await user.click(screen.getByText(/Series/));
    const orbital = screen.getByRole("checkbox", { name: "p (up)" });
    await user.click(orbital);
    expect((orbital as HTMLInputElement).checked).toBe(true);
    await user.click(orbital);
    expect((orbital as HTMLInputElement).checked).toBe(false);
  });

  test("exposes manual x and y chart ranges", async () => {
    const user = userEvent.setup();
    render(
      <ElectronicDosCard
        energy={[-2, 0, 2]}
        series={[{
          id: "tdos:up",
          label: "TDOS",
          kind: "tdos",
          spin: "up",
          values: [1, 2, 1],
        }]}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "DOS / PDOS x min" }), "-1");
    await user.type(screen.getByRole("textbox", { name: "DOS / PDOS x max" }), "1");
    await user.type(screen.getByRole("textbox", { name: "DOS / PDOS y min" }), "0");
    await user.type(screen.getByRole("textbox", { name: "DOS / PDOS y max" }), "3");

    expect(screen.getByRole("img", { name: "DOS vs E − E_f (eV)" })).toBeTruthy();
  });
});
