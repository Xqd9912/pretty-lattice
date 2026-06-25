import type {
  AtomRadiusModel,
  AtomSpec,
  BondSpec,
  PolyhedronSpec,
  SceneSpec,
  VisibilityDependency,
} from "../api/scene";
import type { ColorScheme } from "./colorSchemes";
import type { PreviewSafeArea } from "../scene/LatticeScene";

export const INSPECTOR_PREVIEW_SAFE_AREA: PreviewSafeArea = {
  bottom: 132,
  left: 420,
  right: 176,
  top: 24,
};
export const INSPECTOR_OPEN_SCENE_OFFSET_X_PX = -112;
export const INSPECTOR_SCENE_OFFSET_BREAKPOINT_PX = 760;

export interface ComponentVisibilityState {
  atoms: boolean;
  unitCell: boolean;
  bonds: boolean;
  polyhedra: boolean;
  boundaryAtoms: boolean;
  oneHopBondedAtoms: boolean;
}

export const DEFAULT_COMPONENT_VISIBILITY: ComponentVisibilityState = {
  atoms: true,
  unitCell: true,
  bonds: true,
  polyhedra: false,
  boundaryAtoms: true,
  oneHopBondedAtoms: false,
};

export interface ComponentOpacityState {
  atoms: number;
  unitCell: number;
  bonds: number;
  polyhedra: number;
}

export const DEFAULT_COMPONENT_OPACITY: ComponentOpacityState = {
  atoms: 100,
  unitCell: 100,
  bonds: 100,
  polyhedra: 25,
};

export const COMPONENT_OPACITY_MAX: ComponentOpacityState = {
  atoms: 100,
  unitCell: 100,
  bonds: 100,
  polyhedra: 50,
};

export type BondColorMode = "neutral" | "unicolor-2d" | "by-atom";
export interface StyleState {
  atomRadius: number;
  atomRadiusModel: AtomRadiusModel;
  bondColorMode: BondColorMode;
  bondThickness: number;
  colorScheme: ColorScheme;
}

export const DEFAULT_STYLE: StyleState = {
  atomRadius: 100,
  atomRadiusModel: "uniform",
  bondColorMode: "by-atom",
  bondThickness: 100,
  colorScheme: "vesta",
};

export const STYLE_SCALE_MIN: Pick<StyleState, "atomRadius" | "bondThickness"> = {
  atomRadius: 0,
  bondThickness: 0,
};

export const STYLE_SCALE_MAX: Pick<StyleState, "atomRadius" | "bondThickness"> = {
  atomRadius: 200,
  bondThickness: 200,
};

export type ExportFormat = "png" | "pdf";
export type ExportMeshQuality = "low" | "medium" | "high" | "xhigh";
export type ExportSupersampling = 1 | 2 | 3 | 4;

export interface ExportSettingsState {
  aspectRatioLocked: boolean;
  format: ExportFormat;
  height: number;
  meshQuality: ExportMeshQuality;
  supersampling: ExportSupersampling;
  width: number;
}

export interface ExportSettingsValidation {
  message: string | null;
  valid: boolean;
}

export const EXPORT_DIMENSION_MIN = 64;
export const EXPORT_DIMENSION_MAX = 6000;
export const EXPORT_RENDER_DIMENSION_MAX = 8192;
export const EXPORT_RENDER_PIXEL_MAX = 48_000_000;
export const EXPORT_SUPERSAMPLING_OPTIONS: readonly ExportSupersampling[] = [1, 2, 3, 4];
export const EXPORT_FORMAT_OPTIONS: readonly ExportFormat[] = ["png", "pdf"];
export const EXPORT_MESH_QUALITY_OPTIONS: readonly ExportMeshQuality[] = [
  "low",
  "medium",
  "high",
  "xhigh",
];

export const DEFAULT_EXPORT_SETTINGS: ExportSettingsState = {
  aspectRatioLocked: true,
  format: "png",
  height: 1800,
  meshQuality: "high",
  supersampling: 2,
  width: 2400,
};

export function createDefaultComponentVisibility(
  _scene: SceneSpec | null = null,
): ComponentVisibilityState {
  return { ...DEFAULT_COMPONENT_VISIBILITY };
}

export function createDefaultComponentOpacity(): ComponentOpacityState {
  return { ...DEFAULT_COMPONENT_OPACITY };
}

export function createDefaultStyle(): StyleState {
  return { ...DEFAULT_STYLE };
}

export function createDefaultExportSettings(): ExportSettingsState {
  return { ...DEFAULT_EXPORT_SETTINGS };
}

export function setExportDimension(
  settings: ExportSettingsState,
  dimension: "height" | "width",
  value: number,
): ExportSettingsState {
  const nextValue = clampExportDimension(value);
  if (!settings.aspectRatioLocked) {
    return {
      ...settings,
      [dimension]: nextValue,
    };
  }

  const aspectRatio = exportAspectRatio(settings);
  if (dimension === "width") {
    return {
      ...settings,
      width: nextValue,
      height: clampExportDimension(Math.round(nextValue / aspectRatio)),
    };
  }

  return {
    ...settings,
    height: nextValue,
    width: clampExportDimension(Math.round(nextValue * aspectRatio)),
  };
}

export function setExportAspectRatioLocked(
  settings: ExportSettingsState,
  aspectRatioLocked: boolean,
): ExportSettingsState {
  return {
    ...settings,
    aspectRatioLocked,
  };
}

export function setExportFormat(
  settings: ExportSettingsState,
  format: ExportFormat,
): ExportSettingsState {
  return {
    ...settings,
    format,
  };
}

export function setExportMeshQuality(
  settings: ExportSettingsState,
  meshQuality: ExportMeshQuality,
): ExportSettingsState {
  return {
    ...settings,
    meshQuality,
  };
}

export function setExportSupersampling(
  settings: ExportSettingsState,
  supersampling: number,
): ExportSettingsState {
  return {
    ...settings,
    supersampling: clampExportSupersampling(supersampling),
  };
}

export function parseExportDimensionInput(value: string): number | null {
  const parsedValue = parsePositiveIntegerInput(value);
  if (parsedValue === null) {
    return null;
  }

  return clampExportDimension(parsedValue);
}

export function validateExportSettings(
  settings: ExportSettingsState,
): ExportSettingsValidation {
  if (
    !Number.isInteger(settings.width) ||
    !Number.isInteger(settings.height) ||
    settings.width < EXPORT_DIMENSION_MIN ||
    settings.height < EXPORT_DIMENSION_MIN ||
    settings.width > EXPORT_DIMENSION_MAX ||
    settings.height > EXPORT_DIMENSION_MAX
  ) {
    return {
      valid: false,
      message: `Size must be ${EXPORT_DIMENSION_MIN}-${EXPORT_DIMENSION_MAX} px.`,
    };
  }

  if (!EXPORT_SUPERSAMPLING_OPTIONS.includes(settings.supersampling)) {
    return {
      valid: false,
      message: "Supersampling must be 1x, 2x, 3x, or 4x.",
    };
  }

  const renderWidth = settings.width * settings.supersampling;
  const renderHeight = settings.height * settings.supersampling;
  if (
    renderWidth > EXPORT_RENDER_DIMENSION_MAX ||
    renderHeight > EXPORT_RENDER_DIMENSION_MAX ||
    renderWidth * renderHeight > EXPORT_RENDER_PIXEL_MAX
  ) {
    return {
      valid: false,
      message: "Size and supersampling are too large for this browser export.",
    };
  }

  return {
    valid: true,
    message: null,
  };
}

export function componentOpacityEquals(
  firstOpacity: ComponentOpacityState,
  secondOpacity: ComponentOpacityState,
): boolean {
  return (
    firstOpacity.atoms === secondOpacity.atoms &&
    firstOpacity.unitCell === secondOpacity.unitCell &&
    firstOpacity.bonds === secondOpacity.bonds &&
    firstOpacity.polyhedra === secondOpacity.polyhedra
  );
}

export function countPeriodicImageAtoms(scene: SceneSpec | null): number {
  if (!scene) {
    return 0;
  }

  return scene.atoms.filter((atom) => atom.isPeriodicImage).length;
}

export function hasPeriodicImageAtoms(scene: SceneSpec | null): boolean {
  return countPeriodicImageAtoms(scene) > 0;
}

export function hasPolyhedra(scene: SceneSpec | null): boolean {
  return (scene?.polyhedra.length ?? 0) > 0;
}

export function visibleSceneForComponents(
  scene: SceneSpec | null,
  visibility: ComponentVisibilityState,
): SceneSpec | null {
  if (!scene) {
    return scene;
  }

  const atoms = scene.atoms.filter((atom) => isAtomAvailable(atom, visibility));
  const visibleAtomIds = new Set(atoms.map((atom) => atom.id));
  const bonds = visibility.bonds
    ? scene.bonds.filter((bond) => isBondAvailable(bond, visibleAtomIds))
    : [];
  const polyhedra = visibility.polyhedra
    ? scene.polyhedra.filter((polyhedron) => isPolyhedronAvailable(polyhedron, visibleAtomIds))
    : [];

  return {
    ...scene,
    atoms,
    bonds,
    polyhedra,
  };
}

export function previewSafeAreaForInspector(): PreviewSafeArea {
  return INSPECTOR_PREVIEW_SAFE_AREA;
}

export function sceneOffsetXForInspector(
  isInspectorOpen: boolean,
  viewportWidth: number,
): number {
  if (!isInspectorOpen || viewportWidth <= INSPECTOR_SCENE_OFFSET_BREAKPOINT_PX) {
    return 0;
  }

  return INSPECTOR_OPEN_SCENE_OFFSET_X_PX;
}

function isAtomAvailable(atom: AtomSpec, visibility: ComponentVisibilityState): boolean {
  if (!atom.isPeriodicImage) {
    return true;
  }

  return dependencyGroupsAllow(atom.visibilityDependencyGroups, visibility);
}

function isBondAvailable(
  bond: BondSpec,
  visibleAtomIds: Set<string>,
): boolean {
  return (
    visibleAtomIds.has(bond.startAtomId) &&
    visibleAtomIds.has(bond.endAtomId)
  );
}

function isPolyhedronAvailable(
  polyhedron: PolyhedronSpec,
  visibleAtomIds: Set<string>,
): boolean {
  return polyhedron.hullAtomIds.every((atomId) => visibleAtomIds.has(atomId));
}

function dependencyGroupsAllow(
  dependencyGroups: VisibilityDependency[][],
  visibility: ComponentVisibilityState,
): boolean {
  if (dependencyGroups.length === 0) {
    return true;
  }

  return dependencyGroups.some((dependencyGroup) =>
    dependencyGroup.every((dependency) => dependencyEnabled(dependency, visibility)),
  );
}

function dependencyEnabled(
  dependency: VisibilityDependency,
  visibility: ComponentVisibilityState,
): boolean {
  if (dependency === "boundaryAtoms") {
    return visibility.boundaryAtoms;
  }

  return visibility.oneHopBondedAtoms;
}

function clampExportDimension(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_EXPORT_SETTINGS.width;
  }

  return Math.min(EXPORT_DIMENSION_MAX, Math.max(EXPORT_DIMENSION_MIN, Math.round(value)));
}

function clampExportSupersampling(value: number): ExportSupersampling {
  const roundedValue = Math.round(value);
  if (EXPORT_SUPERSAMPLING_OPTIONS.includes(roundedValue as ExportSupersampling)) {
    return roundedValue as ExportSupersampling;
  }

  if (roundedValue <= EXPORT_SUPERSAMPLING_OPTIONS[0]) {
    return EXPORT_SUPERSAMPLING_OPTIONS[0];
  }

  return EXPORT_SUPERSAMPLING_OPTIONS[EXPORT_SUPERSAMPLING_OPTIONS.length - 1];
}

function exportAspectRatio(settings: ExportSettingsState): number {
  if (settings.width > 0 && settings.height > 0) {
    return settings.width / settings.height;
  }

  return DEFAULT_EXPORT_SETTINGS.width / DEFAULT_EXPORT_SETTINGS.height;
}

function parsePositiveIntegerInput(value: string): number | null {
  const trimmedValue = value.trim().replace(/px$/, "").trim();
  if (trimmedValue === "") {
    return null;
  }

  const parsedValue = Number(trimmedValue);
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return null;
  }

  return Math.round(parsedValue);
}
