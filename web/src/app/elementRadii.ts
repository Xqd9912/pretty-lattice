import type { AtomRadiusModel, AtomSpec } from "../api/scene";
import elementRadii from "../data/element-radii.json";

interface ElementRadiiData {
  elements: Record<string, Record<AtomRadiusModel, number>>;
}

const ELEMENT_RADII = elementRadii as ElementRadiiData;

export function atomRadiusForModel(atom: AtomSpec, model: AtomRadiusModel): number {
  return elementRadiusForModel(atom.element, model);
}

export function elementRadiusForModel(element: string, model: AtomRadiusModel): number {
  const radii = ELEMENT_RADII.elements[element];
  if (radii === undefined) {
    throw new Error(`No element radius is defined for element ${element}.`);
  }
  return radii[model];
}

export function hasElementRadius(element: string): boolean {
  return ELEMENT_RADII.elements[element] !== undefined;
}

export function elementRadiusSymbols(): string[] {
  return Object.keys(ELEMENT_RADII.elements);
}
