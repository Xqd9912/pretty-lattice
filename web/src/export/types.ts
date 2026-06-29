import type { SceneSpec } from "../api/scene";
import type { CameraOrientationRef } from "../scene/LatticeScene";
import type {
  ComponentOpacityState,
  ComponentVisibilityState,
  ExportFormat,
  ExportSettingsState,
  StyleState,
  UnitCellLineStyle,
} from "../model";

export interface CreateFigureExportOptions {
  cameraOrientationRef: CameraOrientationRef;
  componentOpacity: ComponentOpacityState;
  componentVisibility: ComponentVisibilityState;
  fileName: string | null;
  lightStrength: number;
  scene: SceneSpec;
  settings: ExportSettingsState;
  showCrystalAxisLabels: boolean;
  style: StyleState;
  unitCellLineStyle: UnitCellLineStyle;
}

export interface FigureExportFile {
  blob: Blob;
  fileName: string;
  format: ExportFormat;
}

export type RasterExportFileFormat = Exclude<ExportFormat, "pdf">;
