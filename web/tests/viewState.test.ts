import { describe, expect, test } from "bun:test";

import {
  clampViewScale,
  createPreviewViewState,
  formatZoomPercent,
  parseZoomPercentInput,
  resetPreviewViewState,
  setPreviewInteractionLocked,
  setPreviewInteractionMode,
  setPreviewViewScale,
  sliderPositionToViewScale,
  snapZoomSliderPosition,
  viewScaleToSliderPosition,
} from "../src/app/viewState";
import { createDefaultCrystalCameraState } from "../src/scene/crystalCamera";

describe("preview view state", () => {
  test("defaults to Trackball at fitted zoom with unlocked interaction", () => {
    expect(createPreviewViewState()).toEqual({
      camera: createDefaultCrystalCameraState(),
      interactionLocked: false,
      interactionMode: "trackball",
      resetCounter: 0,
      viewScale: 1,
    });
  });

  test("resets zoom and emits a reset signal without changing lock or mode", () => {
    const state = setPreviewInteractionLocked(
      setPreviewInteractionMode(setPreviewViewScale(createPreviewViewState(), 3), "orbit"),
      true,
    );

    expect(resetPreviewViewState(state)).toEqual({
      camera: createDefaultCrystalCameraState(),
      interactionLocked: true,
      interactionMode: "orbit",
      resetCounter: 1,
      viewScale: 1,
    });
  });

  test("clamps zoom at the shared 20 to 500 percent bounds", () => {
    expect(clampViewScale(0.1)).toBe(0.2);
    expect(clampViewScale(6)).toBe(5);
    expect(clampViewScale(Number.NaN)).toBe(1);
  });

  test("maps the logarithmic slider with 100 percent at the midpoint", () => {
    expect(viewScaleToSliderPosition(0.2)).toBeCloseTo(0);
    expect(viewScaleToSliderPosition(1)).toBeCloseTo(0.5);
    expect(viewScaleToSliderPosition(5)).toBeCloseTo(1);
    expect(sliderPositionToViewScale(0.5)).toBeCloseTo(1);
  });

  test("snaps the zoom slider to 100 percent near the midpoint", () => {
    expect(snapZoomSliderPosition(0.475)).toBe(0.5);
    expect(snapZoomSliderPosition(0.525)).toBe(0.5);
    expect(snapZoomSliderPosition(0.455)).toBe(0.455);
  });

  test("parses and formats editable zoom percentages with clamping for positive values", () => {
    expect(formatZoomPercent(1)).toBe("100");
    expect(parseZoomPercentInput("250")).toBe(2.5);
    expect(parseZoomPercentInput("10%")).toBe(0.2);
    expect(parseZoomPercentInput("700")).toBe(5);
    expect(parseZoomPercentInput("-10")).toBeNull();
    expect(parseZoomPercentInput("0")).toBeNull();
    expect(parseZoomPercentInput("not a number")).toBeNull();
  });

});
