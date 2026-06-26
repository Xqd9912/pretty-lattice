import { describe, expect, test } from "bun:test";

import {
  COLOR_SCHEME_OPTIONS,
  elementColorForScheme,
  hasElementColor,
} from "../src/app/colorSchemes";
import { elementRadiusSymbols } from "../src/app/elementRadii";

describe("color schemes", () => {
  test("orders softened schemes before their source schemes", () => {
    expect(COLOR_SCHEME_OPTIONS.map((option) => option.value)).toEqual([
      "vesta-soft",
      "vesta",
      "jmol-soft",
      "jmol",
    ]);
  });

  test("cover every frontend element radius symbol", () => {
    const radiusElements = elementRadiusSymbols();

    for (const { value } of COLOR_SCHEME_OPTIONS) {
      const missingElements = radiusElements.filter(
        (element) => !hasElementColor(element, value),
      );

      expect(missingElements).toEqual([]);
    }
  });

  test("define Jmol colors for registry-only placeholders", () => {
    expect(elementColorForScheme("D", "jmol")).toBe("#ffffff");
    expect(elementColorForScheme("XX", "jmol")).toBe("#4c4c4c");
  });

  test("defines softened Jmol Soft colors", () => {
    expect(elementColorForScheme("H", "jmol-soft")).toBe("#dedede");
    expect(elementColorForScheme("N", "jmol-soft")).toBe("#4c6cca");
    expect(elementColorForScheme("O", "jmol-soft")).toBe("#d86254");
  });

  test("defines softened VESTA Soft colors", () => {
    expect(elementColorForScheme("O", "vesta-soft")).toBe("#d86253");
    expect(elementColorForScheme("Cl", "vesta-soft")).toBe("#96dc8d");
    expect(elementColorForScheme("Si", "vesta-soft")).toBe("#4064c2");
  });
});
