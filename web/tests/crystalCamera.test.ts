import { describe, expect, test } from "bun:test";
import { Vector3 } from "three";

import {
  applyCrystalCameraRoll,
  computeCrystalBasisVectors,
  computeCrystalCameraVectors,
  createDefaultCrystalCameraState,
  normalizeCoefficients,
  stateFromViewVectors,
  stateWithDirectAxis,
} from "../src/scene/crystalCamera";
import type { VectorTuple } from "../src/scene/viewMath";

const CUBIC_CELL: VectorTuple[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

describe("crystal camera math", () => {
  test("computes reciprocal vectors dual to the direct lattice", () => {
    const basis = computeCrystalBasisVectors([
      [4, 0, 0],
      [1, 3, 0],
      [0, 0, 2],
    ]);

    for (let directIndex = 0; directIndex < 3; directIndex += 1) {
      for (let reciprocalIndex = 0; reciprocalIndex < 3; reciprocalIndex += 1) {
        expect(
          basis.direct[directIndex]!.dot(basis.reciprocal[reciprocalIndex]!),
        ).toBeCloseTo(directIndex === reciprocalIndex ? 1 : 0);
      }
    }
  });

  test("uses cyclic direct-axis alignment for roll zero", () => {
    const aPrimary = computeCrystalCameraVectors(
      CUBIC_CELL,
      stateWithDirectAxis(CUBIC_CELL, createDefaultCrystalCameraState(), "a"),
    );
    const bPrimary = computeCrystalCameraVectors(
      CUBIC_CELL,
      stateWithDirectAxis(CUBIC_CELL, createDefaultCrystalCameraState(), "b"),
    );
    const cPrimary = computeCrystalCameraVectors(
      CUBIC_CELL,
      stateWithDirectAxis(CUBIC_CELL, createDefaultCrystalCameraState(), "c"),
    );

    expectVectorClose(aPrimary.outward, [1, 0, 0]);
    expectVectorClose(aPrimary.right, [0, 1, 0]);
    expectVectorClose(aPrimary.up, [0, 0, 1]);
    expectVectorClose(bPrimary.outward, [0, 1, 0]);
    expectVectorClose(bPrimary.right, [0, 0, 1]);
    expectVectorClose(bPrimary.up, [1, 0, 0]);
    expectVectorClose(cPrimary.outward, [0, 0, 1]);
    expectVectorClose(cPrimary.right, [1, 0, 0]);
    expectVectorClose(cPrimary.up, [0, 1, 0]);
  });

  test("uses cyclic direct-axis alignment for non-outward primary screen axes", () => {
    const aRight = computeCrystalCameraVectors(CUBIC_CELL, {
      ...createDefaultCrystalCameraState(),
      direct: [1, 0, 0],
      primary: "right",
      reciprocal: [0, 1, 0],
      secondary: "upward",
    });
    const aUpward = computeCrystalCameraVectors(CUBIC_CELL, {
      ...createDefaultCrystalCameraState(),
      direct: [1, 0, 0],
      primary: "upward",
      reciprocal: [0, 1, 0],
      secondary: "outward",
    });

    expectVectorClose(aRight.right, [1, 0, 0]);
    expectVectorClose(aRight.up, [0, 1, 0]);
    expectVectorClose(aRight.outward, [0, 0, 1]);
    expectVectorClose(aUpward.up, [1, 0, 0]);
    expectVectorClose(aUpward.outward, [0, 1, 0]);
    expectVectorClose(aUpward.right, [0, 0, 1]);
  });

  test("falls back to direct c then direct a when cyclic transport degenerates", () => {
    const symmetricDirection = computeCrystalCameraVectors(CUBIC_CELL, {
      ...createDefaultCrystalCameraState(),
      direct: [1, 1, 1],
      primary: "outward",
      reciprocal: [0, 0, 0],
      secondary: "right",
    });
    const cOutward = computeCrystalCameraVectors(CUBIC_CELL, {
      ...createDefaultCrystalCameraState(),
      direct: [0, 0, 1],
      primary: "outward",
      reciprocal: [0, 0, 0],
      secondary: "right",
    });

    expectVectorClose(
      symmetricDirection.right,
      new Vector3(-1, -1, 2).normalize().toArray() as VectorTuple,
    );
    expectVectorClose(cOutward.right, [1, 0, 0]);
  });

  test("default standard view matches the Naumann cubic orientation", () => {
    const vectors = computeCrystalCameraVectors(
      CUBIC_CELL,
      createDefaultCrystalCameraState(),
    );

    expectVectorClose(vectors.outward, standardCubicOutward());
    expectVectorClose(vectors.up, standardCubicUp());
    expect(Math.abs(vectors.up.dot(vectors.outward))).toBeLessThan(0.000001);
  });

  test("default standard view keeps the same orientation for rectangular orthogonal cells", () => {
    const vectors = computeCrystalCameraVectors(
      [
        [2, 0, 0],
        [0, 3, 0],
        [0, 0, 4],
      ],
      createDefaultCrystalCameraState([
        [2, 0, 0],
        [0, 3, 0],
        [0, 0, 4],
      ]),
    );

    expectVectorClose(vectors.outward, standardCubicOutward());
    expectVectorClose(vectors.up, standardCubicUp());
  });

  test("default standard view uses an orthonormal basal frame for hexagonal cells", () => {
    const hexagonalCell: VectorTuple[] = [
      [1, 0, 0],
      [-0.5, Math.sqrt(3) / 2, 0],
      [0, 0, 1],
    ];
    const vectors = computeCrystalCameraVectors(
      hexagonalCell,
      createDefaultCrystalCameraState(hexagonalCell),
    );

    expectVectorClose(vectors.outward, standardCubicOutward());
    expectVectorClose(vectors.up, standardCubicUp());
  });

  test("roll rotates around the primary direct direction", () => {
    const cOutwardState = stateWithDirectAxis(
      CUBIC_CELL,
      createDefaultCrystalCameraState(),
      "c",
    );
    const rolledState = applyCrystalCameraRoll(CUBIC_CELL, cOutwardState, 90);
    const rolledVectors = computeCrystalCameraVectors(CUBIC_CELL, rolledState);

    expectVectorClose(rolledVectors.outward, [0, 0, 1]);
    expectVectorClose(rolledVectors.up, [-1, 0, 0]);
    expect(rolledState.rollDegrees).toBe(90);
  });

  test("derives the missing screen axis from a right-handed frame", () => {
    const vectors = computeCrystalCameraVectors(CUBIC_CELL, {
      ...createDefaultCrystalCameraState(),
      direct: [1, 0, 0],
      primary: "right",
      reciprocal: [0, 1, 0],
      secondary: "upward",
    });

    expectVectorClose(vectors.right, [1, 0, 0]);
    expectVectorClose(vectors.up, [0, 1, 0]);
    expectVectorClose(vectors.outward, [0, 0, 1]);
  });

  test("manual secondary vectors recompute the nearest roll angle", () => {
    const state = stateFromViewVectors(
      CUBIC_CELL,
      "upward",
      "outward",
      new Vector3(0, 0, 1),
      new Vector3(-1, 0, 0),
    );

    expect(state.primary).toBe("upward");
    expect(state.secondary).toBe("outward");
    expect(Math.abs(state.rollDegrees)).toBeCloseTo(180);
    expect(state.direct).toEqual([0, 0, 1]);
    expect(state.reciprocal).toEqual([-1, 0, 0]);
  });

  test("secondary direction changes do not redefine roll zero", () => {
    const state = stateFromViewVectors(
      CUBIC_CELL,
      "outward",
      "right",
      new Vector3(0, 1, 0),
      new Vector3(0, 0, 1),
    );

    expect(state.secondary).toBe("right");
    expect(state.rollDegrees).toBeCloseTo(0);
    expect(state.direct).toEqual([0, 0, 1]);
    expect(state.reciprocal).toEqual([1, 0, 0]);

    const rolledState = applyCrystalCameraRoll(CUBIC_CELL, state, 90);
    const rolledVectors = computeCrystalCameraVectors(CUBIC_CELL, rolledState);

    expect(rolledState.secondary).toBe("right");
    expect(rolledState.rollDegrees).toBe(90);
    expectVectorClose(rolledVectors.outward, [0, 0, 1]);
    expectVectorClose(rolledVectors.up, [-1, 0, 0]);
    expectVectorClose(rolledVectors.right, [0, 1, 0]);
  });

  test("normalizes coefficients and silently falls back from degenerate vectors", () => {
    expect(normalizeCoefficients([2, -4, 0.0000000001])).toEqual([0.5, -1, 0]);

    const vectors = computeCrystalCameraVectors(CUBIC_CELL, {
      ...createDefaultCrystalCameraState(),
      direct: [0, 0, 0],
      reciprocal: [0, 0, 1],
    });

    expect(Number.isFinite(vectors.up.x)).toBe(true);
    expect(Number.isFinite(vectors.outward.y)).toBe(true);
    expect(Math.abs(vectors.up.dot(vectors.outward))).toBeLessThan(0.000001);
  });
});

function expectVectorClose(actual: Vector3, expected: VectorTuple) {
  expect(actual.x).toBeCloseTo(expected[0]);
  expect(actual.y).toBeCloseTo(expected[1]);
  expect(actual.z).toBeCloseTo(expected[2]);
}

function standardCubicOutward(): VectorTuple {
  const length = Math.sqrt(41);
  return [6 / length, 2 / length, 1 / length];
}

function standardCubicUp(): VectorTuple {
  const length = Math.sqrt(1640);
  return [-6 / length, -2 / length, 40 / length];
}
