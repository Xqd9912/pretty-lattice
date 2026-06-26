import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { AngleSlider } from "../src/components/ui/angle-slider";

const originalSetPointerCapture = HTMLElement.prototype.setPointerCapture;
const originalReleasePointerCapture = HTMLElement.prototype.releasePointerCapture;
const originalHasPointerCapture = HTMLElement.prototype.hasPointerCapture;

let capturedPointers: Set<number>;

beforeEach(() => {
  capturedPointers = new Set();
  HTMLElement.prototype.setPointerCapture = function setPointerCapture(pointerId: number) {
    capturedPointers.add(pointerId);
  };
  HTMLElement.prototype.releasePointerCapture = function releasePointerCapture(pointerId: number) {
    capturedPointers.delete(pointerId);
  };
  HTMLElement.prototype.hasPointerCapture = function hasPointerCapture(pointerId: number) {
    return capturedPointers.has(pointerId);
  };
});

afterEach(() => {
  HTMLElement.prototype.setPointerCapture = originalSetPointerCapture;
  HTMLElement.prototype.releasePointerCapture = originalReleasePointerCapture;
  HTMLElement.prototype.hasPointerCapture = originalHasPointerCapture;
});

describe("AngleSlider", () => {
  test("ends pointer interaction when the pointer returns without a pressed button", () => {
    const onValueChange = mock((value: number) => {
      void value;
    });
    const onValueCommit = mock((value: number) => {
      void value;
    });

    render(
      <AngleSlider
        aria-label="Roll"
        value={0}
        onValueChange={onValueChange}
        onValueCommit={onValueCommit}
      />,
    );

    const slider = screen.getByRole("slider", { name: "Roll" });
    mockSliderBounds(slider);

    fireEvent.pointerDown(slider, {
      buttons: 1,
      clientX: 50,
      clientY: 0,
      pointerId: 1,
    });
    fireEvent.pointerMove(slider, {
      buttons: 1,
      clientX: 100,
      clientY: 50,
      pointerId: 1,
    });

    expect(onValueChange.mock.calls.at(-1)?.[0]).toBe(90);

    fireEvent.pointerMove(slider, {
      buttons: 0,
      clientX: 0,
      clientY: 50,
      pointerId: 1,
    });

    expect(onValueCommit).toHaveBeenCalledWith(90);
    const changeCallCount = onValueChange.mock.calls.length;

    fireEvent.pointerMove(slider, {
      buttons: 0,
      clientX: 50,
      clientY: 100,
      pointerId: 1,
    });

    expect(onValueChange).toHaveBeenCalledTimes(changeCallCount);
  });

  test("ignores moves from a different pointer", () => {
    const onValueChange = mock((value: number) => {
      void value;
    });

    render(
      <AngleSlider
        aria-label="Roll"
        value={0}
        onValueChange={onValueChange}
      />,
    );

    const slider = screen.getByRole("slider", { name: "Roll" });
    mockSliderBounds(slider);

    fireEvent.pointerDown(slider, {
      buttons: 1,
      clientX: 50,
      clientY: 0,
      pointerId: 1,
    });
    const changeCallCount = onValueChange.mock.calls.length;

    fireEvent.pointerMove(slider, {
      buttons: 1,
      clientX: 100,
      clientY: 50,
      pointerId: 2,
    });

    expect(onValueChange).toHaveBeenCalledTimes(changeCallCount);
  });
});

function mockSliderBounds(element: HTMLElement) {
  element.getBoundingClientRect = () => ({
    bottom: 100,
    height: 100,
    left: 0,
    right: 100,
    toJSON: () => {},
    top: 0,
    width: 100,
    x: 0,
    y: 0,
  });
}
