import { useCallback, useState } from "react";

import type { SceneSpec } from "../../api/scene";
import {
  canonicalSiteIndices,
  clearSiteSelection,
  createDefaultSiteVisibility,
  hideSelectedSites,
  invertSiteSelection,
  isSiteVisible,
  reconcileSiteSelection,
  reconcileSiteVisibility,
  showAllSites,
  setSiteVisibility as setSingleSiteVisibility,
  toggleElementVisibility,
  toggleSiteVisibility,
  toggleSiteSelection,
  type SiteVisibilityState,
} from "../../model";

export function useAtomSelection() {
  const [selectedSiteIndices, setSelectedSiteIndices] = useState<ReadonlySet<number>>(
    () => new Set<number>(),
  );
  const [siteVisibility, setSiteVisibility] = useState<SiteVisibilityState>(
    createDefaultSiteVisibility,
  );
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [sessionVersion, setSessionVersion] = useState(0);

  const resetAtomSelection = useCallback(() => {
    setSelectedSiteIndices(new Set<number>());
    setSiteVisibility(createDefaultSiteVisibility());
    setSelectedOnly(false);
    setSessionVersion((version) => version + 1);
  }, []);

  const reconcileAtomSelection = useCallback((scene: SceneSpec | null) => {
    setSelectedSiteIndices((selection) => reconcileSiteSelection(selection, scene));
    setSiteVisibility((visibility) => reconcileSiteVisibility(visibility, scene));
  }, []);

  const handleSiteSelectionToggle = useCallback((siteIndex: number) => {
    const isAddingSite = !selectedSiteIndices.has(siteIndex);
    if (selectedOnly && isAddingSite) {
      setSiteVisibility((visibility) =>
        isSiteVisible(visibility, siteIndex)
          ? visibility
          : setSingleSiteVisibility(visibility, siteIndex, true),
      );
    }
    setSelectedSiteIndices((selection) => toggleSiteSelection(selection, siteIndex));
  }, [selectedOnly, selectedSiteIndices]);

  const handleSiteVisibilityToggle = useCallback((siteIndex: number) => {
    setSiteVisibility((visibility) => toggleSiteVisibility(visibility, siteIndex));
  }, []);

  const handleElementVisibilityToggle = useCallback(
    (scene: SceneSpec | null, element: string) => {
      setSiteVisibility((visibility) =>
        toggleElementVisibility(scene, visibility, element),
      );
    },
    [],
  );

  const handleHideSelected = useCallback(() => {
    setSelectedOnly(false);
    setSiteVisibility((visibility) =>
      hideSelectedSites(visibility, selectedSiteIndices),
    );
  }, [selectedSiteIndices]);

  const handleShowAll = useCallback(() => {
    setSelectedOnly(false);
    setSiteVisibility(showAllSites());
  }, []);

  const handleSelectedOnlyChange = useCallback((enabled: boolean) => {
    setSelectedOnly(enabled);
  }, []);

  const handleInvertSelection = useCallback((scene: SceneSpec | null) => {
    setSelectedSiteIndices((selection) =>
      invertSiteSelection(selection, canonicalSiteIndices(scene)),
    );
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedSiteIndices(clearSiteSelection());
  }, []);

  return {
    handleClearSelection,
    handleElementVisibilityToggle,
    handleHideSelected,
    handleInvertSelection,
    handleSelectedOnlyChange,
    handleShowAll,
    handleSiteSelectionToggle,
    handleSiteVisibilityToggle,
    reconcileAtomSelection,
    resetAtomSelection,
    selectedSiteIndices,
    selectedOnly,
    sessionVersion,
    siteVisibility,
  };
}
