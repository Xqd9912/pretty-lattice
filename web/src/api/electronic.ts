import { apiFetch } from "./runtime";
import { BACKEND_UNAVAILABLE_MESSAGE, StructurePreviewError, type SceneSpec } from "./scene";

export type SliceAxis = "a" | "b" | "c";

export interface LedDistribution {
  threshold: number;
  binWidth: number;
  ledFraction: number;
  density: number[];
  percent: number[];
  min: number;
  max: number;
}

export interface DensitySlice {
  axis: SliceAxis;
  index: number;
  count: number;
  rowAxis: string;
  colAxis: string;
  matrix: number[][];
}

export interface GridAtom {
  index: number;
  label: string;
  element: string;
}

export interface ValueHistogram {
  binWidth: number;
  value: number[];
  percent: number[];
  min: number;
  max: number;
  mean: number;
}

export interface LineProfile {
  atomI: number;
  atomJ: number;
  labelI: string;
  labelJ: string;
  bondLength: number;
  radius: number;
  valueLabel: string;
  voxelCount: number;
  r: number[];
  value: number[];
  count: number[];
}

export interface ChgcarResponse {
  chgcarId: string;
  gridId: string;
  kind: "chgcar" | "elfcar";
  valueLabel: string;
  symbols: string[];
  counts: number[];
  atomCount: number;
  atoms: GridAtom[];
  grid: { nx: number; ny: number; nz: number };
  totalElectrons: number;
  distribution: LedDistribution;
  slice: DensitySlice;
  scene: SceneSpec;
  densityRange: { min: number; max: number };
}

/** ELFCAR upload: same shape as CHGCAR but the distribution is a value
 * histogram (ELF is bounded in [0, 1]) rather than the LED curve. */
export interface ElfcarResponse extends Omit<ChgcarResponse, "distribution"> {
  distribution: ValueHistogram;
}

export interface IsosurfaceMesh {
  level: number;
  vertices: Float32Array;
  faces: Uint32Array;
  vertexCount: number;
  triangleCount: number;
}

export interface DosResponse {
  energy: number[];
  total: number[];
  channels: { label: string; values: number[] }[];
}

export interface IprResponse {
  iprId: string;
  efermi: number;
  aggregation: "k-weighted-band-composition";
  dos: { energy: number[]; total: number[] };
  scene: SceneSpec;
  states: IprStateSummary[];
  warnings?: string[];
}

export interface IprStateSummary {
  stateId: string;
  bandIndex: number;
  energy: number;
  energyMin: number;
  energyMax: number;
  occupation: number;
  ipr: number;
  kPointCount: number;
}

export interface IprAtomContribution {
  siteIndex: number;
  element: string;
  composition: number;
  iprContribution: number;
}

export interface IprStateContributions {
  state: IprStateSummary;
  contributions: IprAtomContribution[];
}

export type ElectronicSpin = "up" | "down";

export interface ElectronicCapability {
  available: boolean;
  reason?: string;
}

export interface ElectronicDosSeries {
  id: string;
  label: string;
  kind: "tdos" | "element" | "orbital" | "element-orbital" | "site-group";
  spin: ElectronicSpin;
  values: number[];
  element?: string;
  orbital?: string;
}

export interface VasprunResponse {
  electronicId: string;
  source: "vasprun";
  efermi: number;
  energy: number[];
  dosSeries: ElectronicDosSeries[];
  pdosSeries: ElectronicDosSeries[];
  orbitalTypes: string[];
  spinChannels: ElectronicSpin[];
  capabilities: {
    dos: ElectronicCapability;
    pdos: ElectronicCapability;
    sitePdos: ElectronicCapability;
    ipr: ElectronicCapability;
  };
  ipr: {
    aggregation: "k-weighted-band-composition";
    states: IprStateSummary[];
  };
  scene: SceneSpec;
  warnings?: string[];
}

export interface SitePdosResponse {
  energy: number[];
  siteIndices: number[];
  atomCount: number;
  series: ElectronicDosSeries[];
}

async function readError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { detail?: string | { message?: string } };
    if (typeof payload.detail === "string") {
      return payload.detail;
    }
    if (payload.detail?.message) {
      return payload.detail.message;
    }
  } catch {
    /* fall through */
  }
  return `Request failed with status ${response.status}.`;
}

async function uploadFile<T>(
  endpoint: string,
  file: File,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await apiFetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": file.type || "application/octet-stream",
        "x-glance-filename": encodeURIComponent(file.name),
      },
      body: file,
      signal,
    });
  } catch (caught) {
    if (caught instanceof Error && caught.name === "AbortError") {
      throw caught;
    }
    throw new StructurePreviewError(BACKEND_UNAVAILABLE_MESSAGE, "backend-unavailable");
  }
  if (!response.ok) {
    throw new StructurePreviewError(await readError(response));
  }
  return (await response.json()) as T;
}

export function uploadChgcar(file: File, threshold = 0.22): Promise<ChgcarResponse> {
  return uploadFile<ChgcarResponse>(
    `/api/electronic/chgcar?threshold=${encodeURIComponent(threshold)}`,
    file,
  );
}

export async function fetchChgcarSlice(
  chgcarId: string,
  axis: SliceAxis,
  index: number,
): Promise<DensitySlice> {
  const params = new URLSearchParams({ axis, index: String(index) });
  let response: Response;
  try {
    response = await apiFetch(`/api/electronic/chgcar/${chgcarId}/slice?${params}`);
  } catch {
    throw new StructurePreviewError(BACKEND_UNAVAILABLE_MESSAGE, "backend-unavailable");
  }
  if (!response.ok) {
    throw new StructurePreviewError(await readError(response));
  }
  return (await response.json()) as DensitySlice;
}

export async function fetchChgcarLed(
  chgcarId: string,
  threshold: number,
): Promise<LedDistribution> {
  const params = new URLSearchParams({ threshold: String(threshold) });
  let response: Response;
  try {
    response = await apiFetch(`/api/electronic/chgcar/${chgcarId}/led?${params}`);
  } catch {
    throw new StructurePreviewError(BACKEND_UNAVAILABLE_MESSAGE, "backend-unavailable");
  }
  if (!response.ok) {
    throw new StructurePreviewError(await readError(response));
  }
  return (await response.json()) as LedDistribution;
}

export async function fetchIsosurface(chgcarId: string, level: number): Promise<IsosurfaceMesh> {
  const params = new URLSearchParams({ level: String(level) });
  let response: Response;
  try {
    response = await apiFetch(`/api/electronic/chgcar/${chgcarId}/isosurface?${params}`);
  } catch {
    throw new StructurePreviewError(BACKEND_UNAVAILABLE_MESSAGE, "backend-unavailable");
  }
  if (!response.ok) {
    throw new StructurePreviewError(await readError(response));
  }
  const buffer = await response.arrayBuffer();
  // Header: [uint32 vertexCount][uint32 triangleCount], then float32 verts, uint32 faces.
  const header = new Uint32Array(buffer, 0, 2);
  const vertexCount = header[0]!;
  const triangleCount = header[1]!;
  const verticesOffset = 8;
  const facesOffset = verticesOffset + vertexCount * 3 * 4;
  const vertices = new Float32Array(buffer.slice(verticesOffset, facesOffset));
  const faces = new Uint32Array(buffer.slice(facesOffset));
  return { level, vertices, faces, vertexCount, triangleCount };
}

export function uploadDos(file: File): Promise<DosResponse> {
  return uploadFile<DosResponse>("/api/electronic/dos", file);
}

export function uploadVasprun(
  file: File,
  signal?: AbortSignal,
): Promise<VasprunResponse> {
  return uploadFile<VasprunResponse>("/api/electronic/vasprun", file, signal);
}

export async function fetchIprStateContributions(
  iprId: string,
  stateId: string,
  signal?: AbortSignal,
): Promise<IprStateContributions> {
  let response: Response;
  try {
    response = await apiFetch(
      `/api/electronic/vasprun/${encodeURIComponent(iprId)}`
        + `/ipr/states/${encodeURIComponent(stateId)}`,
      { signal },
    );
  } catch (caught) {
    if (caught instanceof Error && caught.name === "AbortError") {
      throw caught;
    }
    throw new StructurePreviewError(BACKEND_UNAVAILABLE_MESSAGE, "backend-unavailable");
  }
  if (!response.ok) {
    throw new StructurePreviewError(await readError(response));
  }
  return (await response.json()) as IprStateContributions;
}

export async function fetchVasprunIprStateContributions(
  electronicId: string,
  stateId: string,
  signal?: AbortSignal,
): Promise<IprStateContributions> {
  return fetchIprStateContributions(electronicId, stateId, signal);
}

export async function fetchVasprunSitePdos(
  electronicId: string,
  siteIndices: readonly number[],
  signal?: AbortSignal,
): Promise<SitePdosResponse> {
  let response: Response;
  try {
    response = await apiFetch(
      `/api/electronic/vasprun/${encodeURIComponent(electronicId)}/pdos/sites`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ siteIndices }),
        signal,
      },
    );
  } catch (caught) {
    if (caught instanceof Error && caught.name === "AbortError") {
      throw caught;
    }
    throw new StructurePreviewError(BACKEND_UNAVAILABLE_MESSAGE, "backend-unavailable");
  }
  if (!response.ok) {
    throw new StructurePreviewError(await readError(response));
  }
  return (await response.json()) as SitePdosResponse;
}

export function uploadElfcar(file: File): Promise<ElfcarResponse> {
  return uploadFile<ElfcarResponse>("/api/electronic/elfcar", file);
}

async function fetchJson<T>(url: string): Promise<T> {
  let response: Response;
  try {
    response = await apiFetch(url);
  } catch {
    throw new StructurePreviewError(BACKEND_UNAVAILABLE_MESSAGE, "backend-unavailable");
  }
  if (!response.ok) {
    throw new StructurePreviewError(await readError(response));
  }
  return (await response.json()) as T;
}

export function fetchGridHistogram(gridId: string): Promise<ValueHistogram> {
  return fetchJson<ValueHistogram>(`/api/electronic/grid/${gridId}/histogram`);
}

export interface NeighborEntry {
  index: number;
  label: string;
  distance: number;
}

export interface NeighborList {
  atomI: number;
  labelI: string;
  rCut: number;
  neighbors: NeighborEntry[];
}

/** Neighbors of atom `i` within `rCut` (Angstrom), sorted nearest first. */
export function fetchNeighbors(
  gridId: string,
  i: number,
  rCut: number,
): Promise<NeighborList> {
  const params = new URLSearchParams({ i: String(i), rcut: String(rCut) });
  return fetchJson<NeighborList>(`/api/electronic/grid/${gridId}/neighbors?${params}`);
}

/** Value averaged over a cylinder along the line joining atoms `i` and `j`. */
export function fetchLineProfile(
  gridId: string,
  i: number,
  j: number,
  radius: number,
): Promise<LineProfile> {
  const params = new URLSearchParams({ i: String(i), j: String(j), radius: String(radius) });
  return fetchJson<LineProfile>(`/api/electronic/grid/${gridId}/line-profile?${params}`);
}

// ── LOBSTER bonding analysis ────────────────────────────────────────────────

export interface BwdfResponse {
  r: number[];
  value: number[];
  min: number;
  max: number;
}

export interface PairRecord {
  index: number;
  atomA: string;
  atomB: string;
  pair: string;
  distance: number;
  value: number;
}

export interface PairListResponse {
  kind: "icohp" | "icoop";
  records: PairRecord[];
  pairs: string[];
  count: number;
  valueRange: { min: number; max: number };
  distanceRange: { min: number; max: number };
}

export function uploadBwdf(file: File): Promise<BwdfResponse> {
  return uploadFile<BwdfResponse>("/api/electronic/lobster/bwdf", file);
}

export function uploadPairList(
  file: File,
  kind: "icohp" | "icoop",
): Promise<PairListResponse> {
  return uploadFile<PairListResponse>(`/api/electronic/lobster/${kind}`, file);
}
