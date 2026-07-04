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

export interface ChgcarResponse {
  chgcarId: string;
  symbols: string[];
  counts: number[];
  atomCount: number;
  grid: { nx: number; ny: number; nz: number };
  totalElectrons: number;
  distribution: LedDistribution;
  slice: DensitySlice;
  scene: SceneSpec;
  densityRange: { min: number; max: number };
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
  efermi: number;
  dos: { energy: number[]; total: number[] };
  ipr: { energy: number[]; value: number[] };
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

async function uploadFile<T>(endpoint: string, file: File): Promise<T> {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": file.type || "application/octet-stream",
        "x-pretty-lattice-filename": encodeURIComponent(file.name),
      },
      body: file,
    });
  } catch {
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
    response = await fetch(`/api/electronic/chgcar/${chgcarId}/slice?${params}`);
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
    response = await fetch(`/api/electronic/chgcar/${chgcarId}/led?${params}`);
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
    response = await fetch(`/api/electronic/chgcar/${chgcarId}/isosurface?${params}`);
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

export function uploadIpr(file: File): Promise<IprResponse> {
  return uploadFile<IprResponse>("/api/electronic/ipr", file);
}
