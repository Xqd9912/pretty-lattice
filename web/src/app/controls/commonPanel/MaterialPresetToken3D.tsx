import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";
import {
  MATERIAL_PRESET_OPTIONS,
  materialPresetById,
  type MaterialPreset,
  type MaterialPresetId,
} from "../../../model/materialPresets";
import { MaterialPresetLights } from "../../../scene/MaterialPresetLights";
import type { ResolvedStructureMaterialFamily } from "../../../scene/materialPresetResolver";
import { StructureMaterial } from "../../../scene/StructureMaterial";

const TOKEN_CAMERA_POSITION = [2.4, 1.9, 3.1] as const;
const TOKEN_COLOR = "#c8d0dc";
const TOKEN_SIZE_CLASS = "size-6";
const TOKEN_CANVAS_SIZE_CLASS = "size-7";
const TOKEN_FALLBACK_STYLE = {
  background:
    "radial-gradient(circle at 58% 42%, #d8dde5 0 10%, #b7c0cc 34%, #8994a3 74%, #737d8b 100%)",
} as const;

const tokenImageStore = new Map<MaterialPresetId, string>();
const tokenImageListeners = new Set<() => void>();

export function MaterialPresetToken3D({
  className,
  presetId,
}: {
  className?: string;
  presetId: MaterialPresetId;
}) {
  const tokenImage = useMaterialPresetTokenImage(presetId);

  return (
    <span
      aria-hidden="true"
      data-slot="material-preset-token"
      className={cn(
        "relative inline-block shrink-0",
        TOKEN_SIZE_CLASS,
        className,
      )}
    >
      <span
        className={cn(
          "absolute left-1/2 top-1/2 block -translate-x-1/2 -translate-y-1/2 overflow-visible rounded-full",
          TOKEN_CANVAS_SIZE_CLASS,
        )}
        style={tokenImage ? undefined : TOKEN_FALLBACK_STYLE}
      >
        {tokenImage ? (
          <img
            alt=""
            className="block h-full w-full"
            draggable={false}
            src={tokenImage}
          />
        ) : null}
      </span>
    </span>
  );
}

export function MaterialPresetTokenPreloadPool() {
  return (
    <span
      aria-hidden="true"
      data-slot="material-preset-token-preload-pool"
      className="pointer-events-none fixed -left-[9999px] top-0 flex opacity-0"
    >
      {MATERIAL_PRESET_OPTIONS.map((option) => (
        <MaterialPresetTokenRenderer
          key={option.value}
          presetId={option.value}
        />
      ))}
    </span>
  );
}

function MaterialPresetTokenRenderer({
  presetId,
}: {
  presetId: MaterialPresetId;
}) {
  const tokenImage = useMaterialPresetTokenImage(presetId);
  const materialFamily = useMemo(
    () => materialPresetToFamily(materialPresetById(presetId)),
    [presetId],
  );

  if (tokenImage) {
    return null;
  }

  return (
    <span
      data-slot="material-preset-token-renderer"
      className={cn("relative block", TOKEN_CANVAS_SIZE_CLASS)}
    >
      <Canvas
        orthographic
        camera={{
          position: TOKEN_CAMERA_POSITION,
          zoom: 30,
          near: 0.1,
          far: 20,
        }}
        dpr={3}
        frameloop="demand"
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "low-power",
          preserveDrawingBuffer: true,
        }}
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{ pointerEvents: "none" }}
      >
        <MaterialPresetLights lighting={materialFamily.lighting} />
        <TokenImageCapture presetId={presetId} />
        <mesh>
          <sphereGeometry args={[0.26, 48, 32]} />
          <StructureMaterial
            color={TOKEN_COLOR}
            depthWrite
            materialFamily={materialFamily}
            opacity={1}
            transparent={false}
          />
        </mesh>
      </Canvas>
    </span>
  );
}

function TokenImageCapture({
  presetId,
}: {
  presetId: MaterialPresetId;
}) {
  const { camera, gl, invalidate, scene } = useThree();

  useEffect(() => {
    if (tokenImageStore.has(presetId)) {
      return;
    }

    let cleanupFrame = window.requestAnimationFrame(() => {
      invalidate();
      const secondFrame = window.requestAnimationFrame(() => {
        gl.render(scene, camera);
        setMaterialPresetTokenImage(presetId, gl.domElement.toDataURL("image/png"));
      });

      cleanupFrame = secondFrame;
    });

    return () => {
      window.cancelAnimationFrame(cleanupFrame);
    };
  }, [camera, gl, invalidate, presetId, scene]);

  return null;
}

function useMaterialPresetTokenImage(presetId: MaterialPresetId): string | null {
  return useSyncExternalStore(
    subscribeToMaterialPresetTokenImages,
    () => tokenImageStore.get(presetId) ?? null,
    () => null,
  );
}

function subscribeToMaterialPresetTokenImages(listener: () => void) {
  tokenImageListeners.add(listener);
  return () => {
    tokenImageListeners.delete(listener);
  };
}

function setMaterialPresetTokenImage(presetId: MaterialPresetId, image: string) {
  if (tokenImageStore.get(presetId) === image) {
    return;
  }

  tokenImageStore.set(presetId, image);
  for (const listener of tokenImageListeners) {
    listener();
  }
}

function materialPresetToFamily(preset: MaterialPreset): ResolvedStructureMaterialFamily {
  return {
    id: preset.id,
    label: preset.label,
    lighting: preset.lighting,
    material: preset.material,
  };
}
