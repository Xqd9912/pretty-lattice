import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, mock, test } from "bun:test";

import type { AtomSpec, SceneSpec } from "../src/api/scene";
import { MeasurementInfoCard } from "../src/app/MeasurementInfoCard";
import { MeasurementPopover } from "../src/app/controls/MeasurementPopover";
import { atomInstanceIdentity, type MeasurementRecord } from "../src/model";

describe("measurement UI", () => {
  test("expands four compact symbolic measurement tools", async () => {
    const user = userEvent.setup();
    const onToolChange = mock(() => {});
    render(<MeasurementPopover activeTool={null} onToolChange={onToolChange} />);

    expect(screen.queryByRole("button", { name: "Bond angle" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Open measurement tools" }));
    expect(screen.getByRole("button", { name: "Bond length" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Distance" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Bond angle" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Dihedral" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Bond angle" }));
    expect(onToolChange).toHaveBeenCalledWith("angle");
    expect(screen.queryByText(/Saved/)).toBeNull();
  });

  test("shows the single completed result in the shared top-right card style", () => {
    const scene = measurementScene();
    const record: MeasurementRecord = {
      id: "angle",
      type: "angle",
      points: scene.atoms.map(atomInstanceIdentity),
    };
    render(
      <MeasurementInfoCard
        activeTool="angle"
        draft={[]}
        isInspectorOpen={false}
        onClose={() => {}}
        record={record}
        scene={scene}
      />,
    );

    expect(screen.getByRole("complementary", { name: "Measurement info" })).toBeTruthy();
    expect(screen.getByText("Bond angle · 90.00 °")).toBeTruthy();
    expect(screen.getByText(/#1 H · cell 0, 0, 0/)).toBeTruthy();
    expect(screen.getByText(/#3 H · cell 0, 0, 0/)).toBeTruthy();
  });

  test("shows draft progress without placing a value tag on the canvas", () => {
    const scene = measurementScene();
    render(
      <MeasurementInfoCard
        activeTool="dihedral"
        draft={[atomInstanceIdentity(scene.atoms[0]!)]}
        isInspectorOpen={false}
        onClose={() => {}}
        record={null}
        scene={scene}
      />,
    );

    expect(screen.getByText("Pick point 2")).toBeTruthy();
    expect(screen.getByText(/#1 H/)).toBeTruthy();
  });
});

function measurementScene(): SceneSpec {
  return {
    cell: { vectors: [[5, 0, 0], [0, 5, 0], [0, 0, 5]], periodic: true },
    atoms: [
      atom("H-0", 0, [1, 0, 0]),
      atom("H-1", 1, [0, 0, 0]),
      atom("H-2", 2, [0, 1, 0]),
    ],
    bonds: [],
    polyhedra: [],
    summary: {
      formula: "H3",
      atomCount: 3,
      cell: { a: "5", b: "5", c: "5", alpha: "90", beta: "90", gamma: "90" },
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
    bondCutoffs: [],
  };
}

function atom(
  id: string,
  siteIndex: number,
  position: [number, number, number],
): AtomSpec {
  return {
    id,
    siteId: `site-${siteIndex}`,
    siteIndex,
    element: "H",
    position,
    fractionalPosition: position.map((value) => value / 5) as [number, number, number],
    imageOffset: [0, 0, 0],
    isPeriodicImage: false,
    imageReasons: [],
    visibilityDependencies: [],
    visibilityDependencyGroups: [],
  };
}
