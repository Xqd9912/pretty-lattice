import { apiFetch } from "./runtime";
import {
  BACKEND_UNAVAILABLE_MESSAGE,
  StructurePreviewError,
  hasStaticScenePreview,
  type BondAlgorithm,
  type BondCutoffSpec,
  type SceneSpec,
} from "./scene";

export type TrajectoryFormat = "xdatcar" | "lammps-dump" | "xyz";

export interface TrajectoryMeta {
  trajectoryId: string;
  format: TrajectoryFormat;
  frameCount: number;
  atomCount: number;
  elements: string[];
  typeIds: number[] | null;
}

export const TRAJECTORY_FILE_EXTENSIONS = [".dump", ".lammpstrj", ".xyz"] as const;

export function isTrajectoryFileName(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  if (lower.includes("xdatcar")) {
    return true;
  }
  return TRAJECTORY_FILE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

function typeMapQuery(typeMap: Record<number, string> | undefined): string {
  if (!typeMap || Object.keys(typeMap).length === 0) {
    return "";
  }
  return `typeMap=${encodeURIComponent(JSON.stringify(typeMap))}`;
}

export async function uploadTrajectory(
  file: File,
  options: { typeMap?: Record<number, string> } = {},
): Promise<TrajectoryMeta> {
  if (hasStaticScenePreview()) {
    throw new StructurePreviewError(BACKEND_UNAVAILABLE_MESSAGE, "backend-unavailable");
  }

  const query = typeMapQuery(options.typeMap);
  const endpoint = query ? `/api/trajectory?${query}` : "/api/trajectory";

  let response: Response;
  try {
    response = await apiFetch(endpoint, {
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

  return (await readTrajectoryResponse(response)) as TrajectoryMeta;
}

export async function updateTrajectoryTypeMap(
  trajectoryId: string,
  typeMap: Record<number, string>,
): Promise<TrajectoryMeta> {
  const response = await apiFetch(
    `/api/trajectory/${trajectoryId}/type-map?${typeMapQuery(typeMap)}`,
    { method: "POST" },
  );
  return (await readTrajectoryResponse(response)) as TrajectoryMeta;
}

export async function fetchTrajectoryFrame(
  trajectoryId: string,
  frameIndex: number,
  options: { bondAlgorithm?: BondAlgorithm; cutoffs?: BondCutoffSpec[] } = {},
): Promise<SceneSpec> {
  const params = new URLSearchParams();
  if (options.bondAlgorithm) {
    params.set("bondAlgorithm", options.bondAlgorithm);
  }
  if (options.bondAlgorithm === "custom-cutoff" && options.cutoffs && options.cutoffs.length > 0) {
    params.set("cutoffs", JSON.stringify(options.cutoffs));
  }
  const query = params.toString();
  const endpoint = `/api/trajectory/${trajectoryId}/frames/${frameIndex}${
    query ? `?${query}` : ""
  }`;

  let response: Response;
  try {
    response = await apiFetch(endpoint);
  } catch {
    throw new StructurePreviewError(BACKEND_UNAVAILABLE_MESSAGE, "backend-unavailable");
  }

  if (!response.ok) {
    throw new StructurePreviewError(await readTrajectoryError(response));
  }
  return (await response.json()) as SceneSpec;
}

async function readTrajectoryResponse(response: Response): Promise<unknown> {
  if (!response.ok) {
    throw new StructurePreviewError(await readTrajectoryError(response));
  }
  const contentType = response.headers?.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    throw new StructurePreviewError(BACKEND_UNAVAILABLE_MESSAGE, "backend-unavailable");
  }
  return response.json();
}

async function readTrajectoryError(response: Response): Promise<string> {
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
  return `Trajectory request failed with status ${response.status}.`;
}
