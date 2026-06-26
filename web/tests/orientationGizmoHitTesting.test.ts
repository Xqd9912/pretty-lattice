import { describe, expect, test } from "bun:test";
import { Quaternion } from "three";

import { pickOrientationGizmoAxis } from "../src/scene/orientationGizmoHitTesting";
import type { OrientationGizmoAxisSpec } from "../src/scene/orientationGizmoMath";

const axes: OrientationGizmoAxisSpec[] = [
  {
    color: "#d27686",
    direction: [1, 0, 0],
    label: "a",
  },
  {
    color: "#80c393",
    direction: [0, 1, 0],
    label: "b",
  },
  {
    color: "#75a4dd",
    direction: [0, 0, 1],
    label: "c",
  },
];

const config = {
  axisHitRadiusPx: 12,
  axisStartDistance: 0.16,
  axisTipDistance: 1.06,
  gizmoScale: 1.36,
  labelDistance: 1.3,
  labelHitRadiusPx: 20,
  pixelsPerWorldUnit: 50,
};

const rect = {
  height: 240,
  left: 100,
  top: 50,
  width: 240,
};

describe("orientation gizmo hit testing", () => {
  test("picks an axis from the projected shaft, not just the label", () => {
    expect(
      pickOrientationGizmoAxis({
        axes,
        cameraOrientation: new Quaternion(),
        config,
        pointer: {
          clientX: 270,
          clientY: 170,
        },
        rect,
      }),
    ).toBe("a");
  });

  test("returns null in empty space near the gizmo", () => {
    expect(
      pickOrientationGizmoAxis({
        axes,
        cameraOrientation: new Quaternion(),
        config,
        pointer: {
          clientX: 155,
          clientY: 95,
        },
        rect,
      }),
    ).toBeNull();
  });

  test("keeps a screen-out axis clickable through its collapsed projection", () => {
    expect(
      pickOrientationGizmoAxis({
        axes,
        cameraOrientation: new Quaternion(),
        config,
        pointer: {
          clientX: 220,
          clientY: 170,
        },
        rect,
      }),
    ).toBe("c");
  });
});
