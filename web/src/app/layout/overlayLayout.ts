import { useEffect, useState, type CSSProperties } from "react";

import type { PreviewSafeArea } from "../../scene/LatticeScene";

const MAX_ORIENTATION_GIZMO_SIZE_PX = 280;
const MIN_ORIENTATION_GIZMO_SIZE_PX = 160;
const ORIENTATION_GIZMO_AVAILABLE_SIDE_RATIO = 0.35;

export interface ViewportSize {
  height: number;
  width: number;
}

export function orientationGizmoContainerStyle(
  safeArea: PreviewSafeArea,
  size: number,
): CSSProperties {
  return {
    bottom: Math.max(16, safeArea.bottom - 100),
    height: size,
    left: Math.max(16, safeArea.left - 78),
    width: size,
  };
}

export function orientationGizmoSizeForViewport(
  viewportSize: ViewportSize,
  safeArea: PreviewSafeArea,
): number {
  const availableWidth = Math.max(1, viewportSize.width - safeArea.left - safeArea.right);
  const availableHeight = Math.max(1, viewportSize.height - safeArea.top - safeArea.bottom);

  return Math.max(
    MIN_ORIENTATION_GIZMO_SIZE_PX,
    Math.min(
      Math.min(availableWidth, availableHeight) * ORIENTATION_GIZMO_AVAILABLE_SIDE_RATIO,
      MAX_ORIENTATION_GIZMO_SIZE_PX,
    ),
  );
}

export function useViewportSize(): ViewportSize {
  const [viewportSize, setViewportSize] = useState(getViewportSize);

  useEffect(() => {
    function handleResize() {
      setViewportSize(getViewportSize());
    }

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return viewportSize;
}

function getViewportSize(): ViewportSize {
  return {
    height: window.innerHeight,
    width: window.innerWidth,
  };
}
