import { describe, expect, it } from "bun:test";

import type { SceneSpec } from "../src/api/scene";
import {
  MAX_BOND_CUTOFF,
  bondCutoffPairsFromScene,
  bondCutoffsToSpecs,
  clampBondCutoff,
  updateBondCutoff,
} from "../src/model/bondCutoffs";

function sceneWithCutoffs(bondCutoffs: SceneSpec["bondCutoffs"]): SceneSpec {
  return {
    cell: { periodic: true, vectors: [] },
    atoms: [],
    bonds: [],
    polyhedra: [],
    summary: {
      formula: "-",
      atomCount: 0,
      cell: { a: "", b: "", c: "", alpha: "", beta: "", gamma: "" },
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
    bondCutoffs,
  };
}

describe("bondCutoffs model", () => {
  it("normalizes scene cutoffs into sorted, keyed pairs", () => {
    const pairs = bondCutoffPairsFromScene(
      sceneWithCutoffs([
        { elements: ["Te", "Ge"], distance: 3.2 },
        { elements: ["Ge", "Ge"], distance: 2.5 },
      ]),
    );

    expect(pairs).toEqual([
      { key: "Ge–Te", elements: ["Ge", "Te"], distance: 3.2 },
      { key: "Ge–Ge", elements: ["Ge", "Ge"], distance: 2.5 },
    ]);
  });

  it("tolerates a scene without cutoff data", () => {
    const scene = sceneWithCutoffs([]) as SceneSpec;
    // Simulate a pre-generated static scene that predates the field.
    delete (scene as { bondCutoffs?: unknown }).bondCutoffs;

    expect(bondCutoffPairsFromScene(scene)).toEqual([]);
    expect(bondCutoffPairsFromScene(null)).toEqual([]);
  });

  it("clamps cutoff distances to the editable range", () => {
    expect(clampBondCutoff(-1)).toBe(0);
    expect(clampBondCutoff(Number.NaN)).toBe(0);
    expect(clampBondCutoff(MAX_BOND_CUTOFF + 5)).toBe(MAX_BOND_CUTOFF);
    expect(clampBondCutoff(2.7)).toBe(2.7);
  });

  it("updates only the targeted pair and clamps the new value", () => {
    const pairs = bondCutoffPairsFromScene(
      sceneWithCutoffs([
        { elements: ["Ge", "Te"], distance: 3.2 },
        { elements: ["Sb", "Te"], distance: 3.1 },
      ]),
    );

    const updated = updateBondCutoff(pairs, "Ge–Te", -4);

    expect(updated.find((pair) => pair.key === "Ge–Te")?.distance).toBe(0);
    expect(updated.find((pair) => pair.key === "Sb–Te")?.distance).toBe(3.1);
  });

  it("serializes pairs back into request specs", () => {
    const pairs = bondCutoffPairsFromScene(
      sceneWithCutoffs([{ elements: ["Ge", "Te"], distance: 3.2 }]),
    );

    expect(bondCutoffsToSpecs(pairs)).toEqual([
      { elements: ["Ge", "Te"], distance: 3.2 },
    ]);
  });
});
