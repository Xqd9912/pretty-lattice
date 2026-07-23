import { apiFetch } from "./runtime";
import { STRUCTURE_ATOM_COUNT_THRESHOLD } from "../model/structureLimits";
import sceneContract from "../../../src/glance/structures/scene_contract.json";

export interface SceneSpec {
  cell: {
    vectors: [number, number, number][];
    periodic: boolean;
  };
  atoms: AtomSpec[];
  bonds: BondSpec[];
  polyhedra: PolyhedronSpec[];
  summary: StructureSummary;
  bondCutoffs: BondCutoffSpec[];
  warnings?: AnalysisWarningSpec[];
}

export interface BondCutoffSpec {
  elements: [string, string];
  distance: number;
}

export type BondAlgorithm =
  | "crystal-nn"
  | "minimum-distance"
  | "cut-off-dict"
  | "custom-cutoff";
export type AtomRadiusModel = "uniform" | "atomic" | "vdw" | "ionic";

export const DEFAULT_BOND_ALGORITHM: BondAlgorithm =
  sceneContract.defaultBondAlgorithm as BondAlgorithm;
export const LARGE_STRUCTURE_BOND_ALGORITHM: BondAlgorithm =
  sceneContract.largeStructureBondAlgorithm as BondAlgorithm;
export const IMAGE_REASONS = sceneContract.imageReasons as ImageReason[];
export const VISIBILITY_DEPENDENCIES =
  sceneContract.visibilityDependencies as VisibilityDependency[];

export const BOND_ALGORITHM_OPTIONS: { label: string; value: BondAlgorithm }[] =
  sceneContract.bondAlgorithms.map((entry) => ({
    label: entry.uiLabel,
    value: entry.value as BondAlgorithm,
  }));

export interface StructureSummary {
  formula: string;
  atomCount: number;
  cell: CellSummary;
  symmetry: SymmetrySummary;
}

export interface CellSummary {
  a: string;
  b: string;
  c: string;
  alpha: string;
  beta: string;
  gamma: string;
}

export interface SymmetrySummary {
  available: boolean;
  spaceGroup: string | null;
  spaceGroupNumber: number | null;
  pointGroup: string | null;
  pointGroupSchoenflies: string | null;
  crystalSystem: string | null;
  latticeSystem: string | null;
}

export interface AtomSpec {
  id: string;
  siteId: string;
  siteIndex: number;
  element: string;
  position: [number, number, number];
  fractionalPosition: [number, number, number];
  imageOffset: [number, number, number];
  isPeriodicImage: boolean;
  imageReasons: ImageReason[];
  visibilityDependencies: VisibilityDependency[];
  visibilityDependencyGroups: VisibilityDependency[][];
}

export type ImageReason = "boundary" | "bonded";

export type VisibilityDependency = "boundaryAtoms" | "oneHopBondedAtoms";

export interface BondSpec {
  startAtomIndex: number;
  endAtomIndex: number;
  visibilityDependencies: VisibilityDependency[];
  visibilityDependencyGroups: VisibilityDependency[][];
}

export interface PolyhedronSpec {
  centerAtomIndex: number;
  hullAtomIndices: number[];
  faces: [number, number, number][];
  visibilityDependencies: VisibilityDependency[];
  visibilityDependencyGroups: VisibilityDependency[][];
}

export interface AnalysisWarningSpec {
  code: string;
  message: string;
}

export function defaultBondAlgorithmForScene(
  scene: Pick<SceneSpec, "summary">,
): BondAlgorithm {
  if (scene.summary.atomCount < STRUCTURE_ATOM_COUNT_THRESHOLD) {
    return DEFAULT_BOND_ALGORITHM;
  }

  return LARGE_STRUCTURE_BOND_ALGORITHM;
}

export class StructurePreviewError extends Error {
  readonly reason: "backend-unavailable" | "preview-failed";

  constructor(
    message: string,
    reason: "backend-unavailable" | "preview-failed" = "preview-failed",
  ) {
    super(message);
    this.name = "StructurePreviewError";
    this.reason = reason;
  }
}

export const STATIC_SCENE_PREVIEW_URL =
  import.meta.env.VITE_GLANCE_STATIC_SCENE ?? "";
export const STATIC_SCENE_PREVIEW_NAME =
  import.meta.env.VITE_GLANCE_STATIC_SCENE_NAME ?? "Example structure";

export const BACKEND_UNAVAILABLE_TITLE = "Python backend is unavailable";
export const BACKEND_UNAVAILABLE_MESSAGE =
  "Start Glance locally to upload or recompute structures.";

export function hasStaticScenePreview(): boolean {
  return STATIC_SCENE_PREVIEW_URL.length > 0;
}

export function isBackendUnavailablePreviewError(
  error: unknown,
): error is StructurePreviewError {
  return error instanceof StructurePreviewError && error.reason === "backend-unavailable";
}

export async function loadStaticScenePreview(): Promise<SceneSpec | null> {
  if (!hasStaticScenePreview()) {
    return null;
  }

  let response: Response;
  try {
    response = await fetch(STATIC_SCENE_PREVIEW_URL);
  } catch {
    throw new StructurePreviewError("Static example could not be loaded.");
  }

  if (!response.ok) {
    throw new StructurePreviewError("Static example could not be loaded.");
  }

  return (await response.json()) as SceneSpec;
}

export interface StructurePreviewOptions {
  bondAlgorithm?: BondAlgorithm;
  cutoffs?: BondCutoffSpec[];
}

export async function uploadStructurePreview(
  file: File,
  options: StructurePreviewOptions = {},
): Promise<SceneSpec> {
  if (hasStaticScenePreview()) {
    throw new StructurePreviewError(BACKEND_UNAVAILABLE_MESSAGE, "backend-unavailable");
  }

  const endpoint = previewEndpointForOptions(options);
  let response: Response;
  try {
    response = await apiFetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": file.type || "application/octet-stream",
        "x-glance-filename": encodeURIComponent(file.name),
      },
      body: file,
    });
  } catch {
    throw new StructurePreviewError(BACKEND_UNAVAILABLE_MESSAGE, "backend-unavailable");
  }

  if (!response.ok) {
    if (isBackendUnavailableResponse(response)) {
      throw new StructurePreviewError(BACKEND_UNAVAILABLE_MESSAGE, "backend-unavailable");
    }
    throw new StructurePreviewError(await readPreviewError(response));
  }

  if (!isJsonResponse(response)) {
    throw new StructurePreviewError(BACKEND_UNAVAILABLE_MESSAGE, "backend-unavailable");
  }

  return (await response.json()) as SceneSpec;
}

function previewEndpointForOptions(options: StructurePreviewOptions): string {
  const params = new URLSearchParams();
  if (options.bondAlgorithm) {
    params.set("bondAlgorithm", options.bondAlgorithm);
  }
  if (options.bondAlgorithm === "custom-cutoff" && options.cutoffs && options.cutoffs.length > 0) {
    params.set("cutoffs", JSON.stringify(options.cutoffs));
  }

  const query = params.toString();
  if (!query) {
    return "/api/structure-preview";
  }

  return `/api/structure-preview?${query}`;
}

async function readPreviewError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as {
      detail?: string | { message?: string };
    };
    if (typeof payload.detail === "string") {
      return payload.detail;
    }
    if (payload.detail?.message) {
      return payload.detail.message;
    }
  } catch {
    // Fall through to the status-based message.
  }

  return `Structure preview failed with status ${response.status}.`;
}

function isBackendUnavailableResponse(response: Response): boolean {
  return response.status === 404 || response.status === 405 || !isJsonResponse(response);
}

function isJsonResponse(response: Response): boolean {
  return response.headers?.get("content-type")?.toLowerCase().includes("application/json") ?? false;
}
