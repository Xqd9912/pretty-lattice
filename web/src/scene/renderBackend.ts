import type { GLProps } from "@react-three/fiber";

import type { RenderBackend } from "../app/settings";

export const DEFAULT_RENDERER_PARAMETERS = {
  alpha: true,
  antialias: true,
  preserveDrawingBuffer: true,
} as const;

type RendererDefaultProps = Parameters<Extract<GLProps, (...args: never[]) => unknown>>[0];
export type WebGpuAvailability = "available" | "checking" | "unavailable";

export function createPreviewRendererFactory(renderBackend: RenderBackend): GLProps {
  if (renderBackend === "webgpu") {
    return createWebGpuRenderer;
  }

  return DEFAULT_RENDERER_PARAMETERS;
}

export async function createWebGpuRenderer(defaultProps: RendererDefaultProps) {
  const { WebGPURenderer } = await import("three/webgpu");
  return new WebGPURenderer({
    ...DEFAULT_RENDERER_PARAMETERS,
    canvas: defaultProps.canvas as HTMLCanvasElement,
  });
}

export async function detectWebGpuAvailable(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.gpu) {
    return false;
  }

  try {
    const adapter = await navigator.gpu.requestAdapter();
    return adapter !== null;
  } catch {
    return false;
  }
}

export function initialWebGpuAvailability(): WebGpuAvailability {
  return typeof navigator !== "undefined" && Boolean(navigator.gpu)
    ? "checking"
    : "unavailable";
}
