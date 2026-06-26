import { Quaternion, Vector3 } from "three";

import type {
  OrientationGizmoAxisLabel,
  OrientationGizmoAxisSpec,
} from "./orientationGizmoMath";

export interface OrientationGizmoHitTestConfig {
  axisHitRadiusPx: number;
  axisStartDistance: number;
  axisTipDistance: number;
  gizmoScale: number;
  labelDistance: number;
  labelHitRadiusPx: number;
  pixelsPerWorldUnit: number;
}

export interface OrientationGizmoPointer {
  clientX: number;
  clientY: number;
}

export interface OrientationGizmoScreenRect {
  height: number;
  left: number;
  top: number;
  width: number;
}

export function pickOrientationGizmoAxis({
  axes,
  cameraOrientation,
  config,
  pointer,
  rect,
}: {
  axes: OrientationGizmoAxisSpec[];
  cameraOrientation: Quaternion;
  config: OrientationGizmoHitTestConfig;
  pointer: OrientationGizmoPointer;
  rect: OrientationGizmoScreenRect;
}): OrientationGizmoAxisLabel | null {
  if (
    rect.width <= 0 ||
    rect.height <= 0 ||
    config.pixelsPerWorldUnit <= 0 ||
    !Number.isFinite(pointer.clientX) ||
    !Number.isFinite(pointer.clientY)
  ) {
    return null;
  }

  const edgePadding = Math.max(config.axisHitRadiusPx, config.labelHitRadiusPx);
  if (
    pointer.clientX < rect.left - edgePadding ||
    pointer.clientX > rect.left + rect.width + edgePadding ||
    pointer.clientY < rect.top - edgePadding ||
    pointer.clientY > rect.top + rect.height + edgePadding
  ) {
    return null;
  }

  const center = {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
  const inverseCamera = cameraOrientation.clone().invert();
  let bestAxis: OrientationGizmoAxisLabel | null = null;
  let bestScore = Infinity;

  for (const axis of axes) {
    const projectedDirection = new Vector3(...axis.direction).applyQuaternion(inverseCamera);
    const start = projectAxisPoint(center, projectedDirection, config.axisStartDistance, config);
    const tip = projectAxisPoint(center, projectedDirection, config.axisTipDistance, config);
    const label = projectAxisPoint(center, projectedDirection, config.labelDistance, config);

    const axisDistance = distanceToSegment(
      pointer.clientX,
      pointer.clientY,
      start.x,
      start.y,
      tip.x,
      tip.y,
    );
    const labelDistance = distance(pointer.clientX, pointer.clientY, label.x, label.y);
    const score = Math.min(
      axisDistance / config.axisHitRadiusPx,
      labelDistance / config.labelHitRadiusPx,
    );

    if (score <= 1 && score < bestScore) {
      bestAxis = axis.label;
      bestScore = score;
    }
  }

  return bestAxis;
}

function projectAxisPoint(
  center: { x: number; y: number },
  projectedDirection: Vector3,
  distanceFromOrigin: number,
  config: OrientationGizmoHitTestConfig,
) {
  const screenDistance = distanceFromOrigin * config.gizmoScale * config.pixelsPerWorldUnit;

  return {
    x: center.x + projectedDirection.x * screenDistance,
    y: center.y - projectedDirection.y * screenDistance,
  };
}

function distance(x1: number, y1: number, x2: number, y2: number) {
  return Math.hypot(x1 - x2, y1 - y2);
}

function distanceToSegment(
  pointX: number,
  pointY: number,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
) {
  const segmentX = endX - startX;
  const segmentY = endY - startY;
  const segmentLengthSq = segmentX * segmentX + segmentY * segmentY;

  if (segmentLengthSq <= 1e-8) {
    return distance(pointX, pointY, endX, endY);
  }

  const rawT = ((pointX - startX) * segmentX + (pointY - startY) * segmentY) / segmentLengthSq;
  const t = Math.max(0, Math.min(1, rawT));
  return distance(pointX, pointY, startX + segmentX * t, startY + segmentY * t);
}
