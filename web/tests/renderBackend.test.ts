import { describe, expect, mock, test } from "bun:test";

class MockWebGpuRenderer {
  parameters: unknown;

  constructor(parameters: unknown) {
    this.parameters = parameters;
  }

  render() {}
}

mock.module("three/webgpu", () => ({
  WebGPURenderer: MockWebGpuRenderer,
}));

const {
  DEFAULT_RENDERER_PARAMETERS,
  createPreviewRendererFactory,
  detectWebGpuAvailable,
  initialWebGpuAvailability,
} = await import("../src/scene/renderBackend");

describe("renderBackend", () => {
  test("keeps WebGL preview rendering on default renderer parameters", () => {
    expect(createPreviewRendererFactory("webgl")).toBe(DEFAULT_RENDERER_PARAMETERS);
  });

  test("creates WebGPU renderers lazily with the shared renderer parameters", async () => {
    const canvas = document.createElement("canvas");
    const rendererFactory = createPreviewRendererFactory("webgpu");
    if (typeof rendererFactory !== "function") {
      throw new Error("Expected a WebGPU renderer factory.");
    }

    const renderer = await rendererFactory({ canvas });

    expect(renderer).toBeInstanceOf(MockWebGpuRenderer);
    expect((renderer as MockWebGpuRenderer).parameters).toMatchObject({
      ...DEFAULT_RENDERER_PARAMETERS,
      canvas,
    });
  });

  test("detects WebGPU availability without throwing when navigator GPU is missing", async () => {
    Object.defineProperty(navigator, "gpu", {
      configurable: true,
      value: undefined,
    });

    expect(initialWebGpuAvailability()).toBe("unavailable");
    expect(await detectWebGpuAvailable()).toBe(false);
  });

  test("detects WebGPU availability from requestAdapter", async () => {
    Object.defineProperty(navigator, "gpu", {
      configurable: true,
      value: {
        requestAdapter: mock(async () => ({})),
      },
    });

    expect(initialWebGpuAvailability()).toBe("checking");
    expect(await detectWebGpuAvailable()).toBe(true);
  });
});
