import { describe, expect, test } from "bun:test";

import {
  electronicDosDisplayValues,
  electronicDosDomain,
  isElectronicDosSeriesValid,
} from "../src/app/electronic/electronicDos";

describe("electronic DOS display", () => {
  test("mirrors spin-down channels and keeps spin-up positive", () => {
    expect(electronicDosDisplayValues({
      kind: "tdos", spin: "up", values: [1, 2],
    }, "sum", 1)).toEqual([1, 2]);
    expect(electronicDosDisplayValues({
      kind: "tdos", spin: "down", values: [1, -2],
    }, "sum", 1)).toEqual([-1, -2]);
  });

  test("averages only selected-site PDOS groups", () => {
    expect(electronicDosDisplayValues({
      kind: "site-group", spin: "up", values: [3, 6],
    }, "average", 3)).toEqual([1, 2]);
    expect(electronicDosDisplayValues({
      kind: "element", spin: "up", values: [3, 6],
    }, "average", 3)).toEqual([3, 6]);
  });

  test("accepts only finite DOS series aligned to the energy axis", () => {
    expect(isElectronicDosSeriesValid({ values: [1, 2] }, 2)).toBe(true);
    expect(isElectronicDosSeriesValid({ values: [1] }, 2)).toBe(false);
    expect(isElectronicDosSeriesValid({ values: [1, Number.NaN] }, 2)).toBe(false);
  });

  test("parses complete increasing manual chart domains", () => {
    expect(electronicDosDomain("-5", "3")).toEqual([-5, 3]);
    expect(electronicDosDomain("", "3")).toBeUndefined();
    expect(electronicDosDomain("3", "-5")).toBeUndefined();
  });
});
