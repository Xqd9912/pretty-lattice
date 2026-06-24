export interface SceneSpec {
  cell: {
    vectors: [number, number, number][];
  };
  atoms: AtomSpec[];
  bonds: BondSpec[];
  polyhedra: PolyhedronSpec[];
  summary: StructureSummary;
  warnings?: AnalysisWarningSpec[];
}

export type BondAlgorithm = "crystal-nn" | "minimum-distance" | "voronoi-nn";
export type AtomRadiusModel = "uniform" | "atomic" | "vdw" | "ionic";

export const DEFAULT_BOND_ALGORITHM: BondAlgorithm = "crystal-nn";

export const BOND_ALGORITHM_OPTIONS: { label: string; value: BondAlgorithm }[] = [
  { label: "CrystalNN", value: "crystal-nn" },
  { label: "Minimum distance", value: "minimum-distance" },
  { label: "VoronoiNN", value: "voronoi-nn" },
];

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
  element: string;
  position: [number, number, number];
  fractionalPosition: [number, number, number];
  imageOffset: [number, number, number];
  isPeriodicImage: boolean;
  imageReasons: ImageReason[];
  visibilityDependencies: VisibilityDependency[];
  visibilityDependencyGroups: VisibilityDependency[][];
  radius: number;
  radii?: AtomRadii;
  color: string;
}

export type AtomRadii = Record<AtomRadiusModel, number>;

export type ImageReason = "boundary" | "bonded";

export type VisibilityDependency = "boundaryAtoms" | "oneHopBondedAtoms";

export interface BondSpec {
  id: string;
  startAtomId: string;
  endAtomId: string;
  visibilityDependencies: VisibilityDependency[];
  visibilityDependencyGroups: VisibilityDependency[][];
}

export interface PolyhedronSpec {
  id: string;
  centerAtomId: string;
  hullAtomIds: string[];
  faces: [number, number, number][];
  color: string;
  visibilityDependencies: VisibilityDependency[];
  visibilityDependencyGroups: VisibilityDependency[][];
}

export interface AnalysisWarningSpec {
  code: string;
  message: string;
}

export class StructurePreviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StructurePreviewError";
  }
}

export async function uploadStructurePreview(
  file: File,
  options: { bondAlgorithm?: BondAlgorithm } = {},
): Promise<SceneSpec> {
  const endpoint = previewEndpointForOptions(options);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": file.type || "application/octet-stream",
      "x-pretty-lattice-filename": encodeURIComponent(file.name),
    },
    body: file,
  });

  if (!response.ok) {
    throw new StructurePreviewError(await readPreviewError(response));
  }

  return (await response.json()) as SceneSpec;
}

function previewEndpointForOptions(options: { bondAlgorithm?: BondAlgorithm }): string {
  const params = new URLSearchParams();
  if (options.bondAlgorithm && options.bondAlgorithm !== DEFAULT_BOND_ALGORITHM) {
    params.set("bondAlgorithm", options.bondAlgorithm);
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
