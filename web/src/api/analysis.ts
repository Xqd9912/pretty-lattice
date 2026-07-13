import { apiFetch } from "./runtime";
import { BACKEND_UNAVAILABLE_MESSAGE, StructurePreviewError, type BondCutoffSpec } from "./scene";

export interface FrameRange {
  frameStart: number;
  frameEnd: number;
  stride?: number;
}

export interface Series {
  label: string;
  values: number[];
}

export interface ElementSeries {
  element: string;
  values: number[];
}

export interface GrResult {
  r: number[];
  total: number[];
  pairs: Series[];
}

export interface AxisSeries {
  total: number[];
  perElement: ElementSeries[];
}

export interface CnResult extends AxisSeries {
  cn: number[];
}

export interface AdfResult extends AxisSeries {
  angle: number[];
}

export interface OrderParameterResult extends AxisSeries {
  value: number[];
}

export interface QResult extends AxisSeries {
  value: number[];
}

export interface DescriptorsResult {
  cn: CnResult;
  adf: AdfResult;
  orderParameter: OrderParameterResult;
  q: { q3: QResult; q4: QResult; q5: QResult };
  bondCounts: { pair: string; count: number }[];
}

export interface AltbcResult {
  rMin: number;
  rMax: number;
  nPoint: number;
  axis: number[];
  matrix: number[][];
}

export interface DynamicsResult {
  altbc: AltbcResult;
  msd: { time: number[]; total: number[]; perElement: ElementSeries[] };
}

export interface GrResponse {
  symbols: string[];
  frameCount: number;
  gr: GrResult;
  suggestedCutoffs: BondCutoffSpec[];
}

async function postAnalysis<T>(
  trajectoryId: string,
  endpoint: string,
  body: Record<string, unknown>,
): Promise<T> {
  let response: Response;
  try {
    response = await apiFetch(`/api/trajectory/${trajectoryId}/analysis/${endpoint}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new StructurePreviewError(BACKEND_UNAVAILABLE_MESSAGE, "backend-unavailable");
  }
  if (!response.ok) {
    let message = `Analysis failed with status ${response.status}.`;
    try {
      const payload = (await response.json()) as { detail?: string | { message?: string } };
      if (typeof payload.detail === "string") {
        message = payload.detail;
      } else if (payload.detail?.message) {
        message = payload.detail.message;
      }
    } catch {
      /* keep status message */
    }
    throw new StructurePreviewError(message);
  }
  return (await response.json()) as T;
}

export function computeGr(
  trajectoryId: string,
  range: FrameRange,
  options: { binWidth?: number; rMax?: number } = {},
): Promise<GrResponse> {
  return postAnalysis<GrResponse>(trajectoryId, "gr", { ...range, ...options });
}

export function computeDescriptors(
  trajectoryId: string,
  range: FrameRange,
  cutoffs: BondCutoffSpec[],
): Promise<{ symbols: string[]; frameCount: number; descriptors: DescriptorsResult }> {
  return postAnalysis(trajectoryId, "descriptors", { ...range, cutoffs });
}

export function computeDynamics(
  trajectoryId: string,
  range: FrameRange,
  options: {
    rMin?: number;
    rMax?: number;
    nPoint?: number;
    cutoffAngle?: number;
    timestep?: number;
  } = {},
): Promise<{ frameCount: number; dynamics: DynamicsResult }> {
  return postAnalysis(trajectoryId, "dynamics", { ...range, ...options });
}
