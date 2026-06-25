import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import {
  COLOR_SCHEME_OPTIONS,
  elementColorForScheme,
  hasElementColor,
} from "../src/app/colorSchemes";

const ELEMENT_DECLARATION_RE = /^\[elements\.([^\]]+)\]$/gm;

describe("color schemes", () => {
  test("cover every backend element symbol", () => {
    const backendElements = backendElementSymbols();

    for (const { value } of COLOR_SCHEME_OPTIONS) {
      const missingElements = backendElements.filter(
        (element) => !hasElementColor(element, value),
      );

      expect(missingElements).toEqual([]);
    }
  });

  test("define Jmol colors for registry-only placeholders", () => {
    expect(elementColorForScheme("D", "jmol")).toBe("#ffffff");
    expect(elementColorForScheme("XX", "jmol")).toBe("#4c4c4c");
  });

  test("defines softened VESTA Modern colors", () => {
    expect(elementColorForScheme("O", "vesta-modern")).toBe("#d16759");
    expect(elementColorForScheme("Cl", "vesta-modern")).toBe("#9fda96");
    expect(elementColorForScheme("Si", "vesta-modern")).toBe("#4565ba");
  });
});

function backendElementSymbols(): string[] {
  const elementsToml = readFileSync(
    new URL("../../src/pretty_lattice/data/elements.toml", import.meta.url),
    "utf8",
  );

  return [...elementsToml.matchAll(ELEMENT_DECLARATION_RE)].map((match) => match[1]!);
}
