import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import {
  Children,
  isValidElement,
  type ReactNode,
} from "react";
import { OrthographicCamera, Vector3 } from "three";

import type { SceneSpec } from "../src/api/scene";

class MockControls {
  enabled = true;
  maxZoom = Infinity;
  minZoom = 0;
  mouseButtons: Record<string, unknown> = {};
  noPan = false;
  noRotate = false;
  noZoom = false;
  target = new Vector3();
  touches: Record<string, unknown> = {};

  addEventListener() {}

  dispose() {}

  handleResize() {}

  removeEventListener() {}

  update() {}
}

class MockOrbitControls extends MockControls {}

class MockTrackballControls extends MockControls {}

let mockCamera = new OrthographicCamera();
let latestFrameCallback: (() => void) | null = null;

function resetMockCamera() {
  mockCamera = new OrthographicCamera();
  latestFrameCallback = null;
}

mock.module("@react-three/fiber", () => ({
  Canvas: ({
    children,
  }: {
    children: ReactNode;
  }) => (
    <div data-testid="lattice-canvas">
      {Children.toArray(children).filter(
        (child) =>
          isValidElement(child) &&
          typeof child.type === "function" &&
          child.type.name === "PreviewCameraController",
      )}
    </div>
  ),
  useFrame: (callback: () => void) => {
    latestFrameCallback = callback;
  },
  useThree: () => ({
    camera: mockCamera,
    gl: {
      domElement: document.createElement("canvas"),
    },
    size: {
      height: 800,
      width: 1000,
    },
  }),
}));

mock.module("three/examples/jsm/controls/OrbitControls.js", () => ({
  OrbitControls: MockOrbitControls,
}));

mock.module("three/examples/jsm/controls/TrackballControls.js", () => ({
  TrackballControls: MockTrackballControls,
}));

const { createDefaultComponentOpacity, createDefaultStyle } = await import("../src/app/settings");
const { LatticeScene } = await import("../src/scene/LatticeScene");
const { createDefaultCrystalCameraState, stateWithDirectAxis } = await import(
  "../src/scene/crystalCamera"
);

afterEach(() => {
  resetMockCamera();
});

describe("LatticeScene camera commands", () => {
  test("applies each command pose in the same render instead of lagging one command behind", () => {
    const scene = orthogonalScene();
    const defaultCamera = createDefaultCrystalCameraState();
    const aCamera = stateWithDirectAxis(scene.cell.vectors, defaultCamera, "a");
    const bCamera = stateWithDirectAxis(scene.cell.vectors, defaultCamera, "b");
    const props = {
      cameraCommandVersion: 0,
      cameraState: defaultCamera,
      componentOpacity: createDefaultComponentOpacity(),
      interactionLocked: false,
      interactionMode: "trackball" as const,
      onViewScaleChange: () => {},
      renderBackend: "webgl" as const,
      resetCounter: 0,
      scene,
      style: createDefaultStyle(),
      viewScale: 1,
    };

    const { rerender } = render(<LatticeScene {...props} />);

    rerender(
      <LatticeScene
        {...props}
        cameraCommandVersion={1}
        cameraState={aCamera}
      />,
    );
    expect(mockCamera.position.x).toBeGreaterThan(0);
    expect(Math.abs(mockCamera.position.y)).toBeLessThan(1e-8);
    expect(Math.abs(mockCamera.position.z)).toBeLessThan(1e-8);

    rerender(
      <LatticeScene
        {...props}
        cameraCommandVersion={2}
        cameraState={bCamera}
      />,
    );
    expect(Math.abs(mockCamera.position.x)).toBeLessThan(1e-8);
    expect(mockCamera.position.y).toBeGreaterThan(0);
    expect(Math.abs(mockCamera.position.z)).toBeLessThan(1e-8);
  });

  test("animates flagged camera commands from the current pose to the target pose", () => {
    let now = 0;
    const nowSpy = spyOn(performance, "now").mockImplementation(() => now);
    const scene = orthogonalScene();
    const defaultCamera = createDefaultCrystalCameraState();
    const aCamera = stateWithDirectAxis(scene.cell.vectors, defaultCamera, "a");
    const props = {
      cameraAnimatedCommandVersion: 0,
      cameraCommandVersion: 0,
      cameraState: defaultCamera,
      componentOpacity: createDefaultComponentOpacity(),
      interactionLocked: false,
      interactionMode: "trackball" as const,
      onViewScaleChange: () => {},
      renderBackend: "webgl" as const,
      resetCounter: 0,
      scene,
      style: createDefaultStyle(),
      viewScale: 1,
    };

    try {
      const { rerender } = render(<LatticeScene {...props} />);
      expect(Math.abs(mockCamera.position.x)).toBeLessThan(1e-8);
      expect(mockCamera.position.z).toBeGreaterThan(0);

      rerender(
        <LatticeScene
          {...props}
          cameraAnimatedCommandVersion={1}
          cameraCommandVersion={1}
          cameraState={aCamera}
        />,
      );
      expect(Math.abs(mockCamera.position.x)).toBeLessThan(1e-8);
      expect(mockCamera.position.z).toBeGreaterThan(0);

      now = 130;
      act(() => latestFrameCallback?.());
      expect(mockCamera.position.x).toBeGreaterThan(0);
      expect(mockCamera.position.z).toBeGreaterThan(0);

      now = 280;
      act(() => latestFrameCallback?.());
      expect(mockCamera.position.x).toBeGreaterThan(0);
      expect(Math.abs(mockCamera.position.y)).toBeLessThan(1e-8);
      expect(Math.abs(mockCamera.position.z)).toBeLessThan(1e-8);
    } finally {
      nowSpy.mockRestore();
    }
  });
});

function orthogonalScene(): SceneSpec {
  return {
    atoms: [
      {
        element: "Si",
        fractionalPosition: [0, 0, 0],
        id: "Si-0",
        imageOffset: [0, 0, 0],
        imageReasons: [],
        isPeriodicImage: false,
        position: [0, 0, 0],
        siteId: "Si-0",
        visibilityDependencies: [],
        visibilityDependencyGroups: [],
      },
    ],
    bonds: [],
    cell: {
      vectors: [
        [2, 0, 0],
        [0, 3, 0],
        [0, 0, 4],
      ],
    },
    polyhedra: [],
    summary: {
      atomCount: 1,
      cell: {
        a: "2.00",
        alpha: "90.00",
        b: "3.00",
        beta: "90.00",
        c: "4.00",
        gamma: "90.00",
      },
      formula: "Si",
      symmetry: {
        available: false,
        crystalSystem: null,
        latticeSystem: null,
        pointGroup: null,
        pointGroupSchoenflies: null,
        spaceGroup: null,
        spaceGroupNumber: null,
      },
    },
  };
}
