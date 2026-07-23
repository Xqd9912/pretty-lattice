import { useEffect, useMemo } from "react";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";

import type { PeriodicCellRange, UnitCellLineStyle } from "../model";
import {
  CELL_FRAME_COLOR,
  CELL_FRAME_LINE_WIDTH_PIXELS,
  cellFrameLinePositions,
} from "./sceneGeometry";
import { STRUCTURE_RENDER_ORDER } from "./renderOrder";
import type { VectorTuple } from "./viewMath";

const CELL_FRAME_DASH_SIZE = 0.08;
const CELL_FRAME_GAP_SIZE = 0.03;

export function CellFrame({
  color = CELL_FRAME_COLOR,
  fog,
  lineWidthScale,
  lineStyle,
  opacity,
  cellRange,
  vectors,
}: {
  cellRange?: PeriodicCellRange;
  color?: string;
  fog: boolean;
  lineWidthScale: number;
  lineStyle: UnitCellLineStyle;
  opacity: number;
  vectors: VectorTuple[];
}) {
  const line = useMemo(() => {
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(cellFrameLinePositions(vectors, cellRange));
    const lineWidth = CELL_FRAME_LINE_WIDTH_PIXELS * lineWidthScale;
    const material = new LineMaterial({
      alphaToCoverage: true,
      color,
      dashed: lineStyle === "dashed",
      depthTest: true,
      depthWrite: false,
      dashSize: CELL_FRAME_DASH_SIZE,
      fog,
      gapSize: CELL_FRAME_GAP_SIZE,
      linewidth: lineWidth,
      opacity,
      transparent: true,
      worldUnits: false,
    });
    const line = new LineSegments2(geometry, material);
    line.renderOrder = STRUCTURE_RENDER_ORDER.unitCellFrame;
    if (lineStyle === "dashed") {
      material.defines.USE_DASH = "";
      material.needsUpdate = true;
      line.computeLineDistances();
    }
    return line;
  }, [cellRange, color, fog, lineStyle, lineWidthScale, opacity, vectors]);

  useEffect(() => {
    return () => {
      line.geometry.dispose();
      line.material.dispose();
    };
  }, [line]);

  return <primitive object={line} />;
}
