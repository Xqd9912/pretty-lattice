import type { SceneSpec } from "../api/scene";

export interface ElementLegendEntry {
  color: string;
  element: string;
}

export function deriveElementLegendEntries(scene: SceneSpec | null): ElementLegendEntry[] {
  if (!scene) {
    return [];
  }

  const entries: ElementLegendEntry[] = [];
  const seenElements = new Set<string>();
  for (const atom of scene.atoms) {
    if (atom.isPeriodicImage) {
      continue;
    }
    if (seenElements.has(atom.element)) {
      continue;
    }

    seenElements.add(atom.element);
    entries.push({
      color: atom.color,
      element: atom.element,
    });
  }

  return entries;
}
