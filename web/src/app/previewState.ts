import type { CellSummary, SceneSpec, SymmetrySummary } from "../api/scene";

export type PreviewStatus = "idle" | "loading" | "ready" | "error";

export interface StructureSummary {
  atomCount: number;
  formula: string;
  cell: CellSummary | null;
  symmetry: SymmetrySummary | null;
}

export function summarizeScene(scene: SceneSpec | null): StructureSummary {
  if (!scene) {
    return {
      atomCount: 0,
      formula: "-",
      cell: null,
      symmetry: null,
    };
  }

  return scene.summary;
}
