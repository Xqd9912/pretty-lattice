import type { CSSProperties } from "react";

import type { AtomSpec } from "../api/scene";
import colormapCatalogData from "../data/colormaps/catalog.json";
import jmolSoftColormap from "../data/colormaps/presets/jmol-soft.json";
import jmolColormap from "../data/colormaps/presets/jmol.json";
import vestaSoftColormap from "../data/colormaps/presets/vesta-soft.json";
import vestaColormap from "../data/colormaps/presets/vesta.json";
import {
  createAutoDistinctElementColorOverrides,
  type ElementColorOverrides,
} from "./colorSchemes/autoDistinct";

export type { ElementColorOverrides } from "./colorSchemes/autoDistinct";

export type ColorScheme = string;

interface RawColormapData {
  elements: Record<string, string>;
  name: string;
}

export interface Colormap {
  elements: Record<string, string>;
  id: ColorScheme;
  label: string;
  tokenElements: readonly string[];
}

export interface ColormapCatalog {
  colormaps: Colormap[];
  defaultColorSchemeId: ColorScheme;
  version: 1;
}

export interface ColormapCatalogIndex {
  colormaps: ColormapCatalogEntry[];
  defaultColorSchemeId: ColorScheme;
  version: 1;
}

export interface ColormapCatalogEntry {
  file: string;
  id: ColorScheme;
  label: string;
  tokenElements: readonly string[];
}

export interface ColorSchemeOption {
  label: string;
  tokenStyle: CSSProperties;
  value: ColorScheme;
}

const STATIC_COLORMAP_MODULES: Record<string, unknown> = {
  "../data/colormaps/presets/jmol-soft.json": jmolSoftColormap,
  "../data/colormaps/presets/jmol.json": jmolColormap,
  "../data/colormaps/presets/vesta-soft.json": vestaSoftColormap,
  "../data/colormaps/presets/vesta.json": vestaColormap,
};
const COLORMAP_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COLORMAP_FILE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*\.json$/;
const ELEMENT_SYMBOL_PATTERN = /^[A-Z][a-z]{0,2}$|^D$|^XX$/;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/;

export const COLORMAP_CATALOG = buildColormapCatalog(
  colormapCatalogData,
  collectBundledColormapData(),
);
export const COLOR_SCHEMES = COLORMAP_CATALOG.colormaps;
export const DEFAULT_COLOR_SCHEME_ID = COLORMAP_CATALOG.defaultColorSchemeId;
export const COLOR_SCHEME_OPTIONS: ColorSchemeOption[] = COLOR_SCHEMES.map(
  (colormap) => ({
    label: colormap.label,
    tokenStyle: colormapTokenStyle(colormap),
    value: colormap.id,
  }),
);

export function atomColorForScheme(
  atom: AtomSpec,
  colorScheme: ColorScheme,
  overrides?: ElementColorOverrides,
): string {
  return elementColorForScheme(atom.element, colorScheme, overrides);
}

export function hasElementColor(element: string, colorScheme: ColorScheme): boolean {
  return colormapById(colorScheme).elements[element] !== undefined;
}

export function elementColorForScheme(
  element: string,
  colorScheme: ColorScheme,
  overrides?: ElementColorOverrides,
): string {
  const override = overrides?.[element];
  if (override !== undefined) {
    return override;
  }

  const color = colormapById(colorScheme).elements[element];
  if (color === undefined) {
    throw new Error(`No ${colorScheme} color is defined for element ${element}.`);
  }
  return color;
}

export function elementColorsForScheme(colorScheme: ColorScheme): Record<string, string> {
  return { ...colormapById(colorScheme).elements };
}

export function colorSchemeTokenStyle(colorScheme: ColorScheme): CSSProperties {
  return colormapTokenStyle(colormapById(colorScheme));
}

export function autoDistinctElementColorOverrides(
  atoms: readonly AtomSpec[],
  colorScheme: ColorScheme,
  enabled: boolean,
): ElementColorOverrides | undefined {
  return createAutoDistinctElementColorOverrides({
    atoms,
    elementColor: (element) => elementColorForScheme(element, colorScheme),
    enabled,
  });
}

export function buildColormapCatalog(
  catalogData: unknown,
  colormapModules: Record<string, unknown>,
): ColormapCatalog {
  const catalogIndex = validateColormapCatalogIndex(catalogData);
  const colormapDataByFile = new Map<string, RawColormapData>();

  for (const [modulePath, moduleData] of Object.entries(colormapModules)) {
    const file = modulePath.split("/").at(-1);
    if (file === undefined) {
      throw new Error(`Bundled colormap path "${modulePath}" is invalid.`);
    }
    if (colormapDataByFile.has(file)) {
      throw new Error(`Duplicate bundled colormap file "${file}".`);
    }
    colormapDataByFile.set(
      file,
      parseRawColormap(moduleData, `colormap files.${file}`),
    );
  }

  const colormaps = catalogIndex.colormaps.map((entry) => {
    const data = colormapDataByFile.get(entry.file);
    if (!data) {
      throw new Error(
        `colormaps.catalog entry "${entry.id}" references missing file "${entry.file}".`,
      );
    }
    if (data.name !== entry.id) {
      throw new Error(
        `colormap file "${entry.file}" name "${data.name}" must match catalog id "${entry.id}".`,
      );
    }

    for (const element of entry.tokenElements) {
      if (data.elements[element] === undefined) {
        throw new Error(
          `colormaps.catalog entry "${entry.id}" token element "${element}" has no color.`,
        );
      }
    }

    return {
      elements: data.elements,
      id: entry.id,
      label: entry.label,
      tokenElements: entry.tokenElements,
    };
  });

  if (colormaps.length !== colormapDataByFile.size) {
    const catalogFiles = new Set(catalogIndex.colormaps.map((entry) => entry.file));
    const unlistedFile = Array.from(colormapDataByFile.keys()).find(
      (file) => !catalogFiles.has(file),
    );
    throw new Error(
      `Bundled colormap file "${unlistedFile ?? "unknown"}" is not listed in colormaps.catalog.`,
    );
  }

  return {
    colormaps,
    defaultColorSchemeId: catalogIndex.defaultColorSchemeId,
    version: catalogIndex.version,
  };
}

export function validateColormapCatalogIndex(data: unknown): ColormapCatalogIndex {
  const root = expectRecord(data, "colormaps.catalog");
  assertKnownKeys(root, "colormaps.catalog", [
    "colormaps",
    "defaultColorSchemeId",
    "version",
  ]);

  const version = root.version;
  if (version !== 1) {
    throw new Error("colormaps.catalog.version must be 1.");
  }

  const defaultColorSchemeId = expectColormapId(
    root.defaultColorSchemeId,
    "colormaps.catalog.defaultColorSchemeId",
  );
  if (!Array.isArray(root.colormaps) || root.colormaps.length === 0) {
    throw new Error("colormaps.catalog.colormaps must be a non-empty array.");
  }

  const ids = new Set<string>();
  const files = new Set<string>();
  const colormaps = root.colormaps.map((entry, index) => {
    const colormap = parseColormapCatalogEntry(
      entry,
      `colormaps.catalog.colormaps[${index}]`,
    );
    if (ids.has(colormap.id)) {
      throw new Error(`Duplicate colormap ID "${colormap.id}".`);
    }
    if (files.has(colormap.file)) {
      throw new Error(`Duplicate colormap file "${colormap.file}".`);
    }
    ids.add(colormap.id);
    files.add(colormap.file);
    return colormap;
  });

  if (!ids.has(defaultColorSchemeId)) {
    throw new Error(
      `colormaps.catalog.defaultColorSchemeId "${defaultColorSchemeId}" does not match a bundled colormap.`,
    );
  }

  return {
    colormaps,
    defaultColorSchemeId,
    version,
  };
}

function collectBundledColormapData(): Record<string, unknown> {
  if (typeof import.meta.glob === "function") {
    return import.meta.glob("../data/colormaps/presets/*.json", {
      eager: true,
      import: "default",
    });
  }

  return STATIC_COLORMAP_MODULES;
}

function colormapById(id: ColorScheme): Colormap {
  const colormap = COLOR_SCHEMES.find((candidate) => candidate.id === id);
  if (!colormap) {
    throw new Error(`Unknown color scheme ID "${id}".`);
  }

  return colormap;
}

function parseColormapCatalogEntry(
  data: unknown,
  path: string,
): ColormapCatalogEntry {
  const entry = expectRecord(data, path);
  assertKnownKeys(entry, path, ["file", "id", "label", "tokenElements"]);

  const id = expectColormapId(entry.id, `${path}.id`);
  return {
    file: expectColormapFile(entry.file, `${path}.file`),
    id,
    label: expectNonEmptyString(entry.label, `${path}.label`),
    tokenElements: expectTokenElements(entry.tokenElements, `${path}.tokenElements`),
  };
}

function parseRawColormap(data: unknown, path: string): RawColormapData {
  const colormap = expectRecord(data, path);
  assertKnownKeys(colormap, path, ["elements", "name"]);

  const name = expectColormapId(colormap.name, `${path}.name`);
  const elementsRoot = expectRecord(colormap.elements, `${path}.elements`);
  const elements: Record<string, string> = {};
  for (const [element, color] of Object.entries(elementsRoot)) {
    if (!ELEMENT_SYMBOL_PATTERN.test(element)) {
      throw new Error(`${path}.elements.${element} must be an element symbol.`);
    }
    elements[element] = expectHexColor(color, `${path}.elements.${element}`);
  }

  return { elements, name };
}

function colormapTokenStyle(colormap: Colormap): CSSProperties {
  const stops = colormap.tokenElements.map((element, index) => {
    const start = (index / colormap.tokenElements.length) * 100;
    const end = ((index + 1) / colormap.tokenElements.length) * 100;
    return `${colormap.elements[element]} ${start}% ${end}%`;
  });

  return {
    background: `linear-gradient(90deg, ${stops.join(", ")})`,
  };
}

function expectRecord(data: unknown, path: string): Record<string, unknown> {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error(`${path} must be an object.`);
  }

  return data as Record<string, unknown>;
}

function assertKnownKeys(
  data: Record<string, unknown>,
  path: string,
  knownKeys: string[],
) {
  const allowedKeys = new Set(knownKeys);
  for (const key of Object.keys(data)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`${path}.${key} is not supported.`);
    }
  }
}

function expectNonEmptyString(data: unknown, path: string): string {
  if (typeof data !== "string" || data.trim() === "") {
    throw new Error(`${path} must be a non-empty string.`);
  }

  return data;
}

function expectColormapId(data: unknown, path: string): string {
  const value = expectNonEmptyString(data, path);
  if (!COLORMAP_ID_PATTERN.test(value)) {
    throw new Error(
      `${path} must use lowercase letters, numbers, and hyphen separators.`,
    );
  }

  return value;
}

function expectColormapFile(data: unknown, path: string): string {
  const value = expectNonEmptyString(data, path);
  if (!COLORMAP_FILE_PATTERN.test(value)) {
    throw new Error(
      `${path} must be a JSON filename using lowercase letters, numbers, and hyphen separators.`,
    );
  }

  return value;
}

function expectTokenElements(data: unknown, path: string): readonly string[] {
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`${path} must be a non-empty array.`);
  }

  const elements = data.map((entry, index) => {
    const element = expectNonEmptyString(entry, `${path}[${index}]`);
    if (!ELEMENT_SYMBOL_PATTERN.test(element)) {
      throw new Error(`${path}[${index}] must be an element symbol.`);
    }
    return element;
  });

  return elements;
}

function expectHexColor(data: unknown, path: string): string {
  const value = expectNonEmptyString(data, path);
  if (!HEX_COLOR_PATTERN.test(value)) {
    throw new Error(`${path} must be a #RRGGBB or #RRGGBBAA hex color.`);
  }

  return value.toLowerCase();
}
