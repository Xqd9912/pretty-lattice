import type { AtomSpec, SceneSpec } from "../api/scene";

import { filterSceneAtoms } from "./sceneFiltering";

export type SiteVisibilityState =
  | { mode: "all-except"; siteIndices: ReadonlySet<number> }
  | { mode: "only"; siteIndices: ReadonlySet<number> };

export type ElementVisibilityStatus = "visible" | "hidden" | "mixed";

export interface ElementVisibilitySummary {
  element: string;
  totalCount: number;
  visibleCount: number;
  status: ElementVisibilityStatus;
}

export const DEFAULT_SITE_VISIBILITY: SiteVisibilityState = {
  mode: "all-except",
  siteIndices: new Set<number>(),
};

export function createDefaultSiteVisibility(): SiteVisibilityState {
  return { mode: "all-except", siteIndices: new Set<number>() };
}

/** Canonical (non-image) sites in their first occurrence order. */
export function canonicalSites(scene: SceneSpec | null): AtomSpec[] {
  if (!scene) {
    return [];
  }

  const seenSiteIndices = new Set<number>();
  return scene.atoms.filter((atom) => {
    if (atom.isPeriodicImage || seenSiteIndices.has(atom.siteIndex)) {
      return false;
    }
    seenSiteIndices.add(atom.siteIndex);
    return true;
  });
}

export function canonicalSiteIndices(scene: SceneSpec | null): number[] {
  return canonicalSites(scene).map((atom) => atom.siteIndex);
}

export function isSiteVisible(
  visibility: SiteVisibilityState,
  siteIndex: number,
): boolean {
  const listed = visibility.siteIndices.has(siteIndex);
  return visibility.mode === "only" ? listed : !listed;
}

export function setSiteVisibility(
  visibility: SiteVisibilityState,
  siteIndex: number,
  visible: boolean,
): SiteVisibilityState {
  const siteIndices = new Set(visibility.siteIndices);
  const shouldList = visibility.mode === "only" ? visible : !visible;
  if (shouldList) {
    siteIndices.add(siteIndex);
  } else {
    siteIndices.delete(siteIndex);
  }
  return { ...visibility, siteIndices };
}

export function toggleSiteVisibility(
  visibility: SiteVisibilityState,
  siteIndex: number,
): SiteVisibilityState {
  return setSiteVisibility(
    visibility,
    siteIndex,
    !isSiteVisible(visibility, siteIndex),
  );
}

export function countVisibleSites(
  scene: SceneSpec | null,
  visibility: SiteVisibilityState,
): number {
  return canonicalSites(scene).filter((atom) =>
    isSiteVisible(visibility, atom.siteIndex),
  ).length;
}

export function toggleSiteSelection(
  selection: ReadonlySet<number>,
  siteIndex: number,
): ReadonlySet<number> {
  const nextSelection = new Set(selection);
  if (nextSelection.has(siteIndex)) {
    nextSelection.delete(siteIndex);
  } else {
    nextSelection.add(siteIndex);
  }
  return nextSelection;
}

export function clearSiteSelection(): ReadonlySet<number> {
  return new Set<number>();
}

export function invertSiteSelection(
  selection: ReadonlySet<number>,
  validSiteIndices: Iterable<number>,
): ReadonlySet<number> {
  const nextSelection = new Set<number>();
  for (const siteIndex of validSiteIndices) {
    if (!selection.has(siteIndex)) {
      nextSelection.add(siteIndex);
    }
  }
  return nextSelection;
}

/** Remove indices that no longer exist after a scene recomputation. */
export function reconcileSiteIndices(
  siteIndices: ReadonlySet<number>,
  validSiteIndices: Iterable<number>,
): ReadonlySet<number> {
  const valid = new Set(validSiteIndices);
  const nextSiteIndices = new Set<number>();
  let changed = false;
  for (const siteIndex of siteIndices) {
    if (valid.has(siteIndex)) {
      nextSiteIndices.add(siteIndex);
    } else {
      changed = true;
    }
  }
  return changed ? nextSiteIndices : siteIndices;
}

export function reconcileSiteSelection(
  selection: ReadonlySet<number>,
  scene: SceneSpec | null,
): ReadonlySet<number> {
  return reconcileSiteIndices(selection, canonicalSiteIndices(scene));
}

export function reconcileSiteVisibility(
  visibility: SiteVisibilityState,
  scene: SceneSpec | null,
): SiteVisibilityState {
  const siteIndices = reconcileSiteIndices(
    visibility.siteIndices,
    canonicalSiteIndices(scene),
  );
  return siteIndices === visibility.siteIndices
    ? visibility
    : { ...visibility, siteIndices };
}

/** Hide selected sites without changing which sites are selected. */
export function hideSelectedSites(
  visibility: SiteVisibilityState,
  selectedSiteIndices: ReadonlySet<number>,
): SiteVisibilityState {
  const siteIndices = new Set(visibility.siteIndices);
  for (const siteIndex of selectedSiteIndices) {
    if (visibility.mode === "all-except") {
      siteIndices.add(siteIndex);
    } else {
      siteIndices.delete(siteIndex);
    }
  }
  return { ...visibility, siteIndices };
}

export function isolateSelectedSites(
  selectedSiteIndices: ReadonlySet<number>,
): SiteVisibilityState {
  return { mode: "only", siteIndices: new Set(selectedSiteIndices) };
}

export function showAllSites(): SiteVisibilityState {
  return createDefaultSiteVisibility();
}

export function setElementVisibility(
  scene: SceneSpec | null,
  visibility: SiteVisibilityState,
  element: string,
  visible: boolean,
): SiteVisibilityState {
  const elementSiteIndices = canonicalSites(scene)
    .filter((atom) => atom.element === element)
    .map((atom) => atom.siteIndex);
  const siteIndices = new Set(visibility.siteIndices);

  for (const siteIndex of elementSiteIndices) {
    const shouldList = visibility.mode === "only" ? visible : !visible;
    if (shouldList) {
      siteIndices.add(siteIndex);
    } else {
      siteIndices.delete(siteIndex);
    }
  }

  return { ...visibility, siteIndices };
}

/** Hide an entirely visible element; otherwise restore all its sites. */
export function toggleElementVisibility(
  scene: SceneSpec | null,
  visibility: SiteVisibilityState,
  element: string,
): SiteVisibilityState {
  const elementSites = canonicalSites(scene).filter((atom) => atom.element === element);
  const allVisible =
    elementSites.length > 0 &&
    elementSites.every((atom) => isSiteVisible(visibility, atom.siteIndex));
  return setElementVisibility(scene, visibility, element, !allVisible);
}

export function elementVisibilitySummaries(
  scene: SceneSpec | null,
  visibility: SiteVisibilityState,
): ElementVisibilitySummary[] {
  const summaries = new Map<string, { totalCount: number; visibleCount: number }>();
  for (const atom of canonicalSites(scene)) {
    const summary = summaries.get(atom.element) ?? { totalCount: 0, visibleCount: 0 };
    summary.totalCount += 1;
    if (isSiteVisible(visibility, atom.siteIndex)) {
      summary.visibleCount += 1;
    }
    summaries.set(atom.element, summary);
  }

  return Array.from(summaries, ([element, { totalCount, visibleCount }]) => ({
    element,
    totalCount,
    visibleCount,
    status:
      visibleCount === 0
        ? "hidden"
        : visibleCount === totalCount
          ? "visible"
          : "mixed",
  }));
}

export function visibleSceneForSites(
  scene: SceneSpec | null,
  visibility: SiteVisibilityState,
): SceneSpec | null {
  return filterSceneAtoms(scene, (atom) => isSiteVisible(visibility, atom.siteIndex));
}
