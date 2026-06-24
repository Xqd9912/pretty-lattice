import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import { Quaternion, Vector3 } from "three";

import type { AtomSpec, SceneSpec } from "../src/api/scene";

interface FetchCall {
  input: RequestInfo | URL;
  init: RequestInit | undefined;
}

class MockControls {
  enabled = true;
  mouseButtons: Record<string, unknown> = {};
  noPan = false;
  noRotate = false;
  noZoom = false;
  target = new Vector3();
  touches: Record<string, unknown> = {};

  dispose() {}

  handleResize() {}

  update() {}
}

class MockOrbitControls extends MockControls {}

class MockTrackballControls extends MockControls {}

class MockCamera {
  far = 1000;
  near = 0.01;
  position = new Vector3();
  quaternion = new Quaternion();
  up = new Vector3(0, 1, 0);

  lookAt() {}

  updateProjectionMatrix() {}
}

mock.module("@react-three/fiber", () => {
  return {
    Canvas: ({
      camera: _camera,
      children: _children,
      gl: _gl,
      orthographic: _orthographic,
      ...props
    }: {
      camera?: unknown;
      children: ReactNode;
      gl?: unknown;
      orthographic?: boolean;
    }) => <div {...props} />,
    useFrame: () => {},
    useThree: () => ({
      camera: new MockCamera(),
      gl: {
        domElement: document.createElement("canvas"),
      },
      size: {
        height: 768,
        width: 1024,
      },
    }),
  };
});

mock.module("three/examples/jsm/controls/OrbitControls.js", () => ({
  OrbitControls: MockOrbitControls,
}));

mock.module("three/examples/jsm/controls/TrackballControls.js", () => ({
  TrackballControls: MockTrackballControls,
}));

mock.module("../src/scene/OrientationGizmo", () => ({
  OrientationGizmo: () => <div data-testid="mock-orientation-gizmo" />,
}));

const { App } = await import("../src/app/App");
let fetchCalls: FetchCall[] = [];
let fetchResponses: Response[] = [];

beforeEach(() => {
  fetchCalls = [];
  fetchResponses = [];
  globalThis.fetch = (async (input, init) => {
    fetchCalls.push({ input, init });
    const response = fetchResponses.shift();
    if (!response) {
      throw new Error("Unexpected fetch request.");
    }

    return response;
  }) as typeof fetch;
});

describe("App", () => {
  test("starts with an empty preview and a compact structure card", () => {
    render(<App />);

    expect(screen.getByText("No structure loaded").isConnected).toBe(true);
    expect(screen.queryByTestId("lattice-canvas")).toBeNull();
    expect(screen.queryByRole("button", { name: "Open advanced settings" })).toBeNull();

    const structureCard = screen.getByRole("complementary", { name: "Current structure" });
    expect(within(structureCard).getByText("Pretty Lattice").isConnected).toBe(true);
    expect(within(structureCard).getByRole("button", { name: "Open structure" }).isConnected).toBe(
      true,
    );
    expect(within(structureCard).queryByText("File")).toBeNull();
    expect(within(structureCard).queryByText("No file selected")).toBeNull();
    expect(structureCard.querySelector("[data-slot='separator']")).toBeNull();
  });

  test("uploads a structure and renders the summary, legend, and view controls", async () => {
    const user = userEvent.setup();
    const scene = sceneWithPeriodicImages();
    const file = structureFile();
    queueFetchResponse(jsonResponse(scene));

    render(<App />);

    await user.upload(getFileInput(), file);

    await waitFor(() => expect(fetchCalls).toHaveLength(1));
    const uploadRequest = fetchCalls[0]!;
    expect(uploadRequest.input).toBe("/api/structure-preview");
    expect(uploadRequest.init?.body).toBe(file);
    expect(uploadRequest.init?.method).toBe("POST");
    expect(uploadRequest.init?.headers).toEqual({
      "content-type": "chemical/x-cif",
      "x-pretty-lattice-filename": "NaCl.cif",
    });

    expect((await screen.findByTestId("lattice-canvas")).isConnected).toBe(true);
    expect(screen.getByTestId("mock-orientation-gizmo").isConnected).toBe(true);

    const structureCard = screen.getByRole("complementary", { name: "Current structure" });
    expect(structureCard.querySelector("[data-slot='separator']")).not.toBeNull();
    expect(within(structureCard).getByText("NaCl.cif").isConnected).toBe(true);
    expect(within(structureCard).getByText("NaCl").isConnected).toBe(true);
    expect(within(structureCard).getByText("2").isConnected).toBe(true);
    expect(within(structureCard).getByText("Symmetry unavailable").isConnected).toBe(true);

    const legend = screen.getByRole("navigation", { name: "Element legend" });
    expect(within(legend).getByText("Na").isConnected).toBe(true);
    expect(within(legend).getByText("Cl").isConnected).toBe(true);
    expect(screen.getByRole("complementary", { name: "View controls" }).isConnected).toBe(true);
    const commonControls = screen.getByRole("complementary", { name: "Common controls" });
    expect(within(commonControls).getByRole("tab", { name: "Display" }).isConnected).toBe(true);
    expect(within(commonControls).queryByRole("heading", { name: "Display" })).toBeNull();
    expect(within(commonControls).getByText("Periodic images").isConnected).toBe(true);
    expect(
      commonControls.querySelector("[data-slot='common-controls-content']")?.className,
    ).not.toContain("h-[");
    const polyhedraCheckbox = within(commonControls).getByRole("checkbox", {
      name: "Polyhedra",
    }) as HTMLButtonElement;
    expect(polyhedraCheckbox.disabled).toBe(false);
    expect(polyhedraCheckbox.getAttribute("aria-checked")).toBe("false");
    expect(
      within(commonControls)
        .getAllByRole("checkbox")
        .map((checkbox) => checkbox.getAttribute("aria-label")),
    ).toEqual(["Atoms", "Bonds", "Unit cell", "Polyhedra"]);
  });

  test("lets display controls change image visibility and advanced settings change rotation mode", async () => {
    const user = userEvent.setup();

    await renderLoadedStructure(user);

    const boundaryAtomSwitch = screen.getByRole("switch", {
      name: "Cell-boundary atoms",
    });
    expect((boundaryAtomSwitch as HTMLButtonElement).disabled).toBe(false);
    expect(boundaryAtomSwitch.getAttribute("aria-checked")).toBe("true");

    await user.click(boundaryAtomSwitch);

    expect(boundaryAtomSwitch.getAttribute("aria-checked")).toBe("false");

    const oneHopSwitch = screen.getByRole("switch", {
      name: "One-hop bonded atoms",
    });
    expect(oneHopSwitch.getAttribute("aria-checked")).toBe("false");

    await user.click(oneHopSwitch);

    expect(oneHopSwitch.getAttribute("aria-checked")).toBe("true");

    await user.click(screen.getByRole("button", { name: "Open advanced settings" }));

    expect(screen.getByRole("radio", { name: "Trackball" }).getAttribute("aria-checked")).toBe(
      "true",
    );

    await user.click(screen.getByRole("radio", { name: "Orbit" }));

    expect(screen.getByRole("radio", { name: "Orbit" }).getAttribute("aria-checked")).toBe(
      "true",
    );
  });

  test("toggles polyhedra independently from atoms, bonds, and unit cell", async () => {
    const user = userEvent.setup();

    await renderLoadedStructure(user);

    const commonControls = screen.getByRole("complementary", { name: "Common controls" });
    const atomsCheckbox = within(commonControls).getByRole("checkbox", {
      name: "Atoms",
    });
    const bondsCheckbox = within(commonControls).getByRole("checkbox", {
      name: "Bonds",
    });
    const unitCellCheckbox = within(commonControls).getByRole("checkbox", {
      name: "Unit cell",
    });
    const polyhedraCheckbox = within(commonControls).getByRole("checkbox", {
      name: "Polyhedra",
    });

    expect(polyhedraCheckbox.getAttribute("aria-checked")).toBe("false");
    await user.click(polyhedraCheckbox);
    expect(polyhedraCheckbox.getAttribute("aria-checked")).toBe("true");

    await user.click(atomsCheckbox);
    expect(atomsCheckbox.getAttribute("aria-checked")).toBe("false");
    expect(polyhedraCheckbox.getAttribute("aria-checked")).toBe("true");

    await user.click(polyhedraCheckbox);
    expect(polyhedraCheckbox.getAttribute("aria-checked")).toBe("false");
    expect(atomsCheckbox.getAttribute("aria-checked")).toBe("false");

    await user.click(bondsCheckbox);
    await user.click(unitCellCheckbox);
    expect(bondsCheckbox.getAttribute("aria-checked")).toBe("false");
    expect(unitCellCheckbox.getAttribute("aria-checked")).toBe("false");
    expect(polyhedraCheckbox.getAttribute("aria-checked")).toBe("false");
  });

  test("shows disabled unchecked Polyhedra control when the scene has no polyhedra", async () => {
    const user = userEvent.setup();

    await renderLoadedStructure(user, sceneWithPeriodicImages({ polyhedra: false }));

    const polyhedraCheckbox = screen.getByRole("checkbox", {
      name: "Polyhedra",
    }) as HTMLButtonElement;
    expect(polyhedraCheckbox.disabled).toBe(true);
    expect(polyhedraCheckbox.getAttribute("aria-checked")).toBe("false");
  });

  test("manages component opacity with clamped numeric input and opacity-only reset", async () => {
    const user = userEvent.setup();

    await renderLoadedStructure(user);

    const commonControls = screen.getByRole("complementary", { name: "Common controls" });
    const resetOpacityButton = within(commonControls).getByRole("button", {
      name: "Reset opacity",
    }) as HTMLButtonElement;
    const atomsCheckbox = within(commonControls).getByRole("checkbox", {
      name: "Atoms",
    });
    const atomsOpacityInput = within(commonControls).getByRole("textbox", {
      name: "Atoms opacity value",
    }) as HTMLInputElement;
    const atomsOpacitySlider = within(commonControls).getByRole("slider", {
      name: "Atoms opacity",
    }) as HTMLInputElement;
    const unitCellOpacityInput = within(commonControls).getByRole("textbox", {
      name: "Unit cell opacity value",
    }) as HTMLInputElement;
    const bondsOpacityInput = within(commonControls).getByRole("textbox", {
      name: "Bonds opacity value",
    }) as HTMLInputElement;
    const polyhedraOpacityInput = within(commonControls).getByRole("textbox", {
      name: "Polyhedra opacity value",
    }) as HTMLInputElement;
    const polyhedraOpacitySlider = within(commonControls).getByRole("slider", {
      name: "Polyhedra opacity",
    }) as HTMLInputElement;

    expect(resetOpacityButton.disabled).toBe(false);
    expect(atomsOpacityInput.value).toBe("100");
    expect(atomsOpacityInput.parentElement?.textContent).toContain("%");
    expect(bondsOpacityInput.value).toBe("100");
    expect(polyhedraOpacityInput.value).toBe("25");
    expect(polyhedraOpacitySlider.max).toBe("50");

    await user.clear(atomsOpacityInput);
    await user.type(atomsOpacityInput, "98{Enter}");

    expect(atomsOpacityInput.value).toBe("98");
    expect(atomsOpacitySlider.value).toBe("98");

    fireEvent.change(atomsOpacitySlider, { target: { value: "99" } });

    expect(atomsOpacityInput.value).toBe("100");
    expect(atomsOpacitySlider.value).toBe("100");

    await user.click(resetOpacityButton);

    expect(resetOpacityButton.className).toContain("view-rail-button-reset-feedback");
    expect(polyhedraOpacityInput.value).toBe("25");

    const polyhedraCheckbox = within(commonControls).getByRole("checkbox", {
      name: "Polyhedra",
    });
    await user.click(polyhedraCheckbox);
    expect(polyhedraCheckbox.getAttribute("aria-checked")).toBe("true");

    await user.clear(polyhedraOpacityInput);
    await user.type(polyhedraOpacityInput, "80%{Enter}");

    expect(polyhedraOpacityInput.value).toBe("50");
    expect(polyhedraOpacitySlider.value).toBe("50");

    await user.click(atomsCheckbox);
    expect(atomsCheckbox.getAttribute("aria-checked")).toBe("false");

    await user.clear(unitCellOpacityInput);
    await user.type(unitCellOpacityInput, "20{Enter}");

    expect(unitCellOpacityInput.value).toBe("20");

    await user.click(resetOpacityButton);

    expect(atomsCheckbox.getAttribute("aria-checked")).toBe("false");
    expect(unitCellOpacityInput.value).toBe("100");
    expect(bondsOpacityInput.value).toBe("100");
    expect(polyhedraOpacityInput.value).toBe("25");
    expect(resetOpacityButton.className).toContain("view-rail-button-reset-feedback");
    await waitFor(() =>
      expect(resetOpacityButton.className).not.toContain("view-rail-button-reset-feedback"),
    );
    expect(resetOpacityButton.disabled).toBe(false);
  });

  test("lets style controls scale sizes and choose bond color mode", async () => {
    const user = userEvent.setup();

    await renderLoadedStructure(user);

    const commonControls = screen.getByRole("complementary", { name: "Common controls" });
    await user.click(within(commonControls).getByRole("tab", { name: "Style" }));

    expect(within(commonControls).getByText("Radius").isConnected).toBe(true);
    const atomRadiusModelSelect = within(commonControls).getByRole("combobox", {
      name: "Atom radius model",
    });
    const atomRadiusSlider = within(commonControls).getByRole("slider", {
      name: "Atom scale",
    }) as HTMLInputElement;
    const atomRadiusInput = within(commonControls).getByRole("textbox", {
      name: "Atom scale value",
    }) as HTMLInputElement;
    const bondThicknessSlider = within(commonControls).getByRole("slider", {
      name: "Bond scale",
    }) as HTMLInputElement;
    const bondThicknessInput = within(commonControls).getByRole("textbox", {
      name: "Bond scale value",
    }) as HTMLInputElement;
    const bondStyleSelect = within(commonControls).getByRole("combobox", {
      name: "Bond style",
    });

    expect(atomRadiusSlider.min).toBe("0");
    expect(atomRadiusSlider.max).toBe("200");
    expect(atomRadiusSlider.value).toBe("100");
    expect(atomRadiusInput.value).toBe("100");
    expect(atomRadiusInput.parentElement?.textContent).toContain("%");
    expect(bondThicknessSlider.value).toBe("100");
    expect(bondThicknessInput.value).toBe("100");
    expect(commonControls.querySelectorAll(".opacity-slider-snap-marker")).toHaveLength(2);
    expect(atomRadiusModelSelect.textContent).toContain("Uniform");
    expect(bondStyleSelect.textContent).toContain("Unicolor");

    await user.click(atomRadiusModelSelect);
    expect(await screen.findByText("Atom radius model")).toBeTruthy();
    await user.click(await screen.findByRole("option", { name: "Van der Waals" }));

    expect(fetchCalls).toHaveLength(1);
    expect(atomRadiusModelSelect.textContent).toContain("vdW");

    await user.click(bondStyleSelect);
    await user.click(await screen.findByRole("option", { name: "Bicolor" }));

    expect(bondStyleSelect.textContent).toContain("Bicolor");

    fireEvent.change(atomRadiusSlider, { target: { value: "200" } });

    expect(atomRadiusInput.value).toBe("200");
    expect(atomRadiusSlider.value).toBe("200");

    fireEvent.change(atomRadiusSlider, { target: { value: "104" } });

    expect(atomRadiusInput.value).toBe("100");
    expect(atomRadiusSlider.value).toBe("100");

    await user.clear(bondThicknessInput);
    await user.type(bondThicknessInput, "240{Enter}");

    expect(bondThicknessInput.value).toBe("200");
    expect(bondThicknessSlider.value).toBe("200");

    const resetScaleButton = within(commonControls).getByRole("button", {
      name: "Reset scale",
    }) as HTMLButtonElement;
    await user.click(resetScaleButton);

    expect(resetScaleButton.className).toContain("view-rail-button-reset-feedback");
    expect(atomRadiusInput.value).toBe("100");
    expect(atomRadiusSlider.value).toBe("100");
    expect(bondThicknessInput.value).toBe("100");
    expect(bondThicknessSlider.value).toBe("100");
    expect(atomRadiusModelSelect.textContent).toContain("vdW");
    expect(bondStyleSelect.textContent).toContain("Bicolor");
  });

  test("uses a single sliding active indicator for tab animation", async () => {
    const user = userEvent.setup();

    await renderLoadedStructure(user);

    const commonControls = screen.getByRole("complementary", { name: "Common controls" });
    const content = commonControls.querySelector("[data-slot='common-controls-content']");
    expect(content?.className).toContain("transition-[height]");
    expect(content?.className).not.toContain("h-[");
    expect(content?.className).not.toContain("min-h");
    const activeIndicator = commonControls.querySelector(
      "[data-slot='common-controls-active-indicator']",
    ) as HTMLElement | null;
    const tabsList = commonControls.querySelector("[data-slot='tabs-list']") as HTMLElement | null;
    expect(tabsList?.className).toContain("!h-8");
    expect(tabsList?.className).toContain("transition-[grid-template-columns]");
    expect(tabsList?.style.gridTemplateColumns).toContain("1.65fr");
    expect(activeIndicator?.className).toContain("transition-[transform,width]");
    expect(
      within(commonControls)
        .getAllByRole("tab")
        .map((tab) => tab.getAttribute("aria-label")),
    ).toEqual(["Display", "Camera", "Style", "Export"]);
    const displayTab = within(commonControls).getByRole("tab", { name: "Display" });
    const cameraTab = within(commonControls).getByRole("tab", { name: "Camera" });
    expect(displayTab.className).toContain("!bg-transparent");
    expect(displayTab.className).toContain("!h-6");
    expect(displayTab.style.flexGrow).toBe("");
    expect(cameraTab.style.flexGrow).toBe("");
    expect(cameraTab.className).not.toContain("transition-[flex-grow");
    expect(
      cameraTab.querySelector("[data-slot='common-controls-tab-label']")?.className,
    ).toContain("max-w-0");

    await user.click(cameraTab);

    expect(content?.className).not.toContain("h-[");
    expect(within(commonControls).getByRole("tab", { name: "Camera" }).className).toContain(
      "!bg-transparent",
    );
    expect(within(commonControls).getByRole("tab", { name: "Camera" }).textContent).toContain(
      "Camera",
    );
    expect(tabsList?.style.gridTemplateColumns).toContain("1.65fr");
    expect(
      within(commonControls)
        .getByRole("tab", { name: "Camera" })
        .querySelector("[data-slot='common-controls-tab-label']")
        ?.className,
    ).toContain("max-w-16");
    expect(
      within(commonControls)
        .getByRole("tab", { name: "Display" })
        .querySelector("[data-slot='common-controls-tab-label']")
        ?.className,
    ).toContain("max-w-0");

    await user.click(within(commonControls).getByRole("tab", { name: "Display" }));

    expect(content?.className).not.toContain("h-[");
  });

  test("collapses and expands extended structure details from the card", async () => {
    const user = userEvent.setup();

    await renderLoadedStructure(user);

    const structureCard = screen.getByRole("complementary", { name: "Current structure" });
    const detailsRegion = structureCard.querySelector(
      "[data-slot='structure-summary-details']",
    ) as HTMLElement | null;
    const collapseButton = within(structureCard).getByRole("button", {
      name: "Collapse details",
    });

    expect(collapseButton.getAttribute("aria-expanded")).toBe("true");
    expect(detailsRegion?.className).toContain("transition-[height]");
    expect(detailsRegion?.style.height).not.toBe("0px");

    await user.click(collapseButton);

    const expandButton = within(structureCard).getByRole("button", {
      name: "Expand details",
    });
    expect(expandButton.getAttribute("aria-expanded")).toBe("false");
    expect(detailsRegion?.style.height).toBe("0px");

    await user.click(expandButton);

    expect(
      within(structureCard)
        .getByRole("button", { name: "Collapse details" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(detailsRegion?.style.height).not.toBe("0px");
  });

  test("keeps atom radius model local and reuploads when the bond algorithm changes", async () => {
    const user = userEvent.setup();

    await renderLoadedStructure(user);
    const commonControls = screen.getByRole("complementary", { name: "Common controls" });
    const polyhedraCheckbox = within(commonControls).getByRole("checkbox", {
      name: "Polyhedra",
    });
    await user.click(polyhedraCheckbox);
    await user.click(within(commonControls).getByRole("tab", { name: "Style" }));
    const atomRadiusModelSelect = within(commonControls).getByRole("combobox", {
      name: "Atom radius model",
    });
    await user.click(atomRadiusModelSelect);
    await user.click(await screen.findByRole("option", { name: "Van der Waals" }));

    expect(fetchCalls).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Open advanced settings" }));
    queueFetchResponse(jsonResponse(sceneWithPeriodicImages()));

    await user.click(screen.getByRole("combobox", { name: "Bond algorithm" }));
    await user.click(await screen.findByRole("option", { name: "Minimum distance" }));

    await waitFor(() => expect(fetchCalls).toHaveLength(2));
    expect(fetchCalls[1]?.input).toBe(
      "/api/structure-preview?bondAlgorithm=minimum-distance",
    );
    expect(fetchCalls[1]?.init?.body).toBeInstanceOf(File);
    expect(polyhedraCheckbox.getAttribute("aria-checked")).toBe("true");
  });

  test("keeps view controls wired to lock, zoom, and reset state", async () => {
    const user = userEvent.setup();

    await renderLoadedStructure(user);

    await user.click(screen.getByRole("button", { name: "Lock canvas interaction" }));

    expect(
      screen.getByRole("button", { name: "Unlock canvas interaction" }).getAttribute(
        "aria-pressed",
      ),
    ).toBe("true");

    const zoomInput = screen.getByRole("textbox", { name: "Zoom percentage input" });
    await user.clear(zoomInput);
    await user.type(zoomInput, "250{Enter}");

    expect((zoomInput as HTMLInputElement).value).toBe("250");

    await user.click(screen.getByRole("button", { name: "Reset view" }));

    expect((zoomInput as HTMLInputElement).value).toBe("100");
  });

  test("shows API parse errors without leaving a stale scene behind", async () => {
    const user = userEvent.setup();
    queueFetchResponse(errorResponse("Could not parse CIF."));

    render(<App />);

    await user.upload(getFileInput(), structureFile("bad.cif"));

    expect((await screen.findByRole("alert")).textContent).toContain("Could not parse CIF.");
    expect(screen.getByText("No structure loaded").isConnected).toBe(true);
    expect(screen.queryByTestId("lattice-canvas")).toBeNull();
    expect(screen.queryByRole("button", { name: "Open advanced settings" })).toBeNull();
  });

  test("shows non-fatal analysis warnings while keeping the scene visible", async () => {
    const user = userEvent.setup();
    queueFetchResponse(
      jsonResponse({
        ...sceneWithPeriodicImages(),
        warnings: [
          {
            code: "bond-analysis-failed",
            message: "Bond analysis with CrystalNN failed: neighbor graph unavailable",
          },
        ],
      }),
    );

    render(<App />);
    await user.upload(getFileInput(), structureFile());

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Bond analysis with CrystalNN failed",
    );
    expect(screen.getByTestId("lattice-canvas").isConnected).toBe(true);
  });
});

async function renderLoadedStructure(user: UserEvent, scene = sceneWithPeriodicImages()) {
  queueFetchResponse(jsonResponse(scene));

  render(<App />);
  await user.upload(getFileInput(), structureFile());
  await screen.findByTestId("lattice-canvas");
}

function queueFetchResponse(response: Response) {
  fetchResponses.push(response);
}

function getFileInput(): HTMLInputElement {
  const input = document.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("Could not find structure file input.");
  }

  return input;
}

function jsonResponse(body: unknown): Response {
  return {
    json: async () => body,
    ok: true,
  } as Response;
}

function errorResponse(message: string): Response {
  return {
    json: async () => ({ detail: { message } }),
    ok: false,
    status: 422,
  } as Response;
}

function structureFile(name = "NaCl.cif"): File {
  return new File(["data_NaCl"], name, { type: "chemical/x-cif" });
}

function sceneWithPeriodicImages({
  polyhedra = true,
}: {
  polyhedra?: boolean;
} = {}): SceneSpec {
  return {
    atoms: [
      atom("Na-0", "Na", [0, 0, 0], [], []),
      atom("Na-0-image-1-0-0", "Na", [1, 0, 0], ["boundary"], [["boundaryAtoms"]]),
      atom("Cl-1", "Cl", [0, 0, 0], [], []),
      atom(
        "Cl-1-image-0--1-0",
        "Cl",
        [0, -1, 0],
        ["bonded"],
        [["oneHopBondedAtoms"]],
      ),
    ],
    bonds: [
      {
        id: "bond-canonical",
        startAtomId: "Na-0",
        endAtomId: "Cl-1",
        visibilityDependencies: [],
        visibilityDependencyGroups: [],
      },
      {
        id: "bond-one-hop",
        startAtomId: "Na-0",
        endAtomId: "Cl-1-image-0--1-0",
        visibilityDependencies: ["oneHopBondedAtoms"],
        visibilityDependencyGroups: [["oneHopBondedAtoms"]],
      },
    ],
    polyhedra: polyhedra
      ? [
          polyhedron("polyhedron-canonical", ["Na-0", "Cl-1"]),
          polyhedron("polyhedron-one-hop", ["Na-0", "Cl-1-image-0--1-0", "Cl-1"]),
        ]
      : [],
    cell: {
      vectors: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
    },
    summary: {
      atomCount: 2,
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

function polyhedron(id: string, hullAtomIds: string[]): SceneSpec["polyhedra"][number] {
  return {
    id,
    centerAtomId: hullAtomIds[0]!,
    hullAtomIds,
    faces: hullAtomIds.length >= 3 ? [[0, 1, 2]] : [],
    color: "#fadd3d",
    visibilityDependencies: [],
    visibilityDependencyGroups: [],
  };
}

function atom(
  id: string,
  element: string,
  imageOffset: [number, number, number],
  imageReasons: AtomSpec["imageReasons"],
  visibilityDependencyGroups: AtomSpec["visibilityDependencyGroups"],
): AtomSpec {
  const isPeriodicImage = imageOffset.some((value) => value !== 0);
  const visibilityDependencies = Array.from(new Set(visibilityDependencyGroups.flat()));
  return {
    color: element === "Na" ? "#fadd3d" : "#1ff01f",
    element,
    fractionalPosition: imageOffset,
    id,
    imageOffset,
    isPeriodicImage,
    imageReasons,
    visibilityDependencies,
    visibilityDependencyGroups,
    position: imageOffset,
    radius: 0.5,
    radii: {
      atomic: 0.7,
      ionic: 0.9,
      uniform: 0.5,
      vdw: 1.4,
    },
    siteId: id.split("-image-", 1)[0]!,
  };
}
