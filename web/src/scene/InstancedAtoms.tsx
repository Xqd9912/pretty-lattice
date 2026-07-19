import { type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  BackSide,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Quaternion,
  SpriteMaterial,
  Vector3,
} from "three";

import type { AtomRadiusModel, AtomSpec } from "../api/scene";
import { atomColorForScheme, type ElementColorOverrides } from "../model/colorSchemes";
import type { StyleState } from "../model";
import { atomRadiusForModel } from "./sceneGeometry";
import type { ResolvedStructureMaterialFamily } from "./materialPresetResolver";
import { STRUCTURE_RENDER_ORDER } from "./renderOrder";
import { StructureMaterial } from "./StructureMaterial";
import type { SceneMeshDetail } from "./StructureSceneObjects";
import { AtomSelectionRing } from "./AtomSelectionRing";
import {
  ATOM_HIGHLIGHT_PULSE_COLOR_MIX,
  ATOM_HIGHLIGHT_PULSE_MS,
  ATOM_HIGHLIGHT_SELECT_MS,
  ATOM_HIGHLIGHT_SELECTED_COLOR_MIX,
  ATOM_HIGHLIGHT_TARGET_COLOR,
  ATOM_SELECTION_RING_PULSE_MIN_SCALE,
  ATOM_SELECTION_RING_SELECTED_OPACITY,
  ATOM_SELECTION_RING_SELECTED_SCALE,
  atomPulseFade,
  easeOutCubic,
} from "./atomHighlight";
import type { VectorTuple } from "./viewMath";
import {
  resolveAtomSelectionAction,
  selectedAtomInstanceIndices,
} from "./atomPicking";

interface AtomColorInstanceSpec {
  color: string;
  restingColor: Color;
}

interface AtomInstanceSpec {
  atom: AtomSpec;
  radius: number;
}

const EMPTY_SELECTED_SITE_INDICES: ReadonlySet<number> = new Set();
const ATOM_SELECTION_HALO_COLOR = "#38bdf8";
const ATOM_SELECTION_HALO_OPACITY = 0.9;
const ATOM_SELECTION_HALO_SCALE = 1.12;

export function InstancedAtoms({
  atomPickingEnabled = false,
  atoms,
  colorScheme,
  colorOverrides,
  inspectedAtomId,
  interactionLocked,
  materialFamily,
  meshDetail,
  onInspect,
  onPulse,
  onAtomSelectionToggle,
  onLockedInteractionAttempt,
  opacity,
  pulseAtomId,
  pulseToken,
  radiusModel,
  radiusScale,
  selectedSiteIndices = EMPTY_SELECTED_SITE_INDICES,
}: {
  atomPickingEnabled?: boolean;
  atoms: AtomSpec[];
  colorScheme: StyleState["colorScheme"];
  colorOverrides?: ElementColorOverrides;
  inspectedAtomId: string | null;
  interactionLocked: boolean;
  materialFamily: ResolvedStructureMaterialFamily;
  meshDetail: SceneMeshDetail;
  onInspect?: (atomId: string | null) => void;
  onPulse?: (atomId: string) => void;
  onAtomSelectionToggle?: (siteIndex: number) => void;
  onLockedInteractionAttempt?: () => void;
  opacity: number;
  pulseAtomId: string | null;
  pulseToken: number;
  radiusModel: AtomRadiusModel;
  radiusScale: number;
  selectedSiteIndices?: ReadonlySet<number>;
}) {
  const meshRef = useRef<InstancedMesh | null>(null);
  const selectionPointerDownRef = useRef<{
    clientX: number;
    clientY: number;
  } | null>(null);
  const invalidate = useThree((state) => state.invalidate);
  const isTransparent = opacity < 1;
  const atomColorInstances = useMemo<AtomColorInstanceSpec[]>(
    () =>
      atoms.map((atom) => {
        const color = atomColorForScheme(atom, colorScheme, colorOverrides);
        return {
          color,
          restingColor: new Color(color),
        };
      }),
    [atoms, colorOverrides, colorScheme],
  );
  const atomInstances = useMemo<AtomInstanceSpec[]>(
    () =>
      atoms.map((atom) => ({
        atom,
        radius: atomRadiusForModel(atom, radiusModel) * radiusScale,
      })),
    [atoms, radiusModel, radiusScale],
  );
  const selectedInstanceIndices = useMemo(
    () => selectedAtomInstanceIndices(atoms, selectedSiteIndices),
    [atoms, selectedSiteIndices],
  );
  const atomIndexById = useMemo(() => {
    const indexById = new Map<string, number>();
    atomInstances.forEach((instance, index) => {
      indexById.set(instance.atom.id, index);
    });
    return indexById;
  }, [atomInstances]);
  const inspectedInstance = highlightedInstanceForAtomId(
    atomInstances,
    atomColorInstances,
    atomIndexById,
    inspectedAtomId,
  );
  const activePulse = pulseAtomId && pulseToken !== 0
    ? { atomId: pulseAtomId, token: pulseToken }
    : null;
  const pulseInstance = inspectedInstance || !activePulse
    ? null
    : highlightedInstanceForAtomId(
        atomInstances,
        atomColorInstances,
        atomIndexById,
        activePulse.atomId,
      );
  const activeHighlight = inspectedInstance ?? pulseInstance;

  const handlePulseComplete = useCallback(() => {}, []);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) {
      return;
    }

    const matrix = new Matrix4();
    const position = new Vector3();
    const scale = new Vector3();
    const quaternion = new Quaternion();
    for (let index = 0; index < atomInstances.length; index += 1) {
      const instance = atomInstances[index]!;
      position.fromArray(instance.atom.position);
      scale.setScalar(instance.radius);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
    }

    mesh.count = atomInstances.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    invalidate();
  }, [atomInstances, invalidate]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) {
      return;
    }

    for (let index = 0; index < atomColorInstances.length; index += 1) {
      const instance = atomColorInstances[index]!;
      mesh.setColorAt(index, instance.restingColor);
    }

    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
    invalidate();
  }, [atomColorInstances, invalidate]);

  const atomForEvent = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      if (event.instanceId === undefined) {
        return null;
      }

      return atomInstances[event.instanceId]?.atom ?? null;
    },
    [atomInstances],
  );

  const handleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      const atom = atomForEvent(event);
      if (!atom) {
        return;
      }

      if (atomPickingEnabled) {
        const pointerDown = selectionPointerDownRef.current;
        selectionPointerDownRef.current = null;
        const selectionAction = resolveAtomSelectionAction(
          {
            button: event.button,
            detail: event.detail,
            pointerDown,
            pointerUp: event,
          },
          interactionLocked,
        );
        if (selectionAction === "ignore") {
          return;
        }

        event.stopPropagation();
        if (selectionAction === "locked") {
          onLockedInteractionAttempt?.();
          return;
        }

        onAtomSelectionToggle?.(atom.siteIndex);
        return;
      }

      event.stopPropagation();
      if (interactionLocked) {
        return;
      }

      onPulse?.(atom.id);
    },
    [
      atomForEvent,
      atomPickingEnabled,
      interactionLocked,
      onAtomSelectionToggle,
      onLockedInteractionAttempt,
      onPulse,
    ],
  );

  const handlePointerDown = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      selectionPointerDownRef.current =
        atomPickingEnabled && event.button === 0
          ? { clientX: event.clientX, clientY: event.clientY }
          : null;
    },
    [atomPickingEnabled],
  );

  const handlePointerCancel = useCallback(() => {
    selectionPointerDownRef.current = null;
  }, []);

  const handleDoubleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      const atom = atomForEvent(event);
      if (!atom) {
        return;
      }

      event.stopPropagation();
      if (atomPickingEnabled) {
        return;
      }

      if (interactionLocked) {
        onLockedInteractionAttempt?.();
        return;
      }

      onInspect?.(atom.id);
    },
    [
      atomForEvent,
      atomPickingEnabled,
      interactionLocked,
      onInspect,
      onLockedInteractionAttempt,
    ],
  );

  if (atomInstances.length === 0) {
    return null;
  }

  return (
    <>
      <InstancedAtomSelectionHalos
        atomInstances={atomInstances}
        meshDetail={meshDetail}
        selectedInstanceIndices={selectedInstanceIndices}
      />
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, atomInstances.length]}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onPointerCancel={handlePointerCancel}
        onPointerDown={handlePointerDown}
        renderOrder={STRUCTURE_RENDER_ORDER.atomMesh}
      >
        <sphereGeometry
          args={[
            1,
            meshDetail.sphereWidthSegments,
            meshDetail.sphereHeightSegments,
          ]}
        />
        <StructureMaterial
          color="#ffffff"
          // Transparent instanced atoms cannot be sorted per atom by Three.js.
          // Keep depth writes so farther instances cannot repaint nearer ones.
          depthWrite={true}
          materialFamily={materialFamily}
          opacity={opacity}
          transparent={isTransparent}
        />
      </instancedMesh>
      {activeHighlight ? (
        <InstancedAtomHighlightAnimator
          key={[
            activeHighlight.instance.atom.id,
            inspectedInstance ? "selected" : "pulse",
            inspectedInstance ? "" : pulseToken,
            activeHighlight.instance.color,
          ].join(":")}
          restingColor={activeHighlight.instance.restingColor}
          index={activeHighlight.index}
          inspected={inspectedInstance !== null}
          meshRef={meshRef}
          onComplete={handlePulseComplete}
        />
      ) : null}
      {inspectedInstance ? (
        <InstancedAtomSelectionRing
          key={inspectedInstance.instance.atom.id}
          position={inspectedInstance.instance.atom.position}
          radius={inspectedInstance.instance.radius}
        />
      ) : null}
    </>
  );
}

function InstancedAtomSelectionHalos({
  atomInstances,
  meshDetail,
  selectedInstanceIndices,
}: {
  atomInstances: AtomInstanceSpec[];
  meshDetail: SceneMeshDetail;
  selectedInstanceIndices: number[];
}) {
  const meshRef = useRef<InstancedMesh | null>(null);
  const invalidate = useThree((state) => state.invalidate);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) {
      // Removing the final halo still needs a frame on the demand-rendered canvas.
      invalidate();
      return;
    }

    const matrix = new Matrix4();
    const position = new Vector3();
    const scale = new Vector3();
    const quaternion = new Quaternion();
    let haloIndex = 0;

    for (const atomIndex of selectedInstanceIndices) {
      const instance = atomInstances[atomIndex];
      if (!instance) {
        continue;
      }

      position.fromArray(instance.atom.position);
      scale.setScalar(instance.radius * ATOM_SELECTION_HALO_SCALE);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(haloIndex, matrix);
      haloIndex += 1;
    }

    mesh.count = haloIndex;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    invalidate();
  }, [atomInstances, invalidate, selectedInstanceIndices]);

  if (selectedInstanceIndices.length === 0) {
    return null;
  }

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, selectedInstanceIndices.length]}
      raycast={ignoreAtomSelectionHaloRaycast}
      renderOrder={STRUCTURE_RENDER_ORDER.atomSelectionHalo}
    >
      <sphereGeometry
        args={[
          1,
          meshDetail.sphereWidthSegments,
          meshDetail.sphereHeightSegments,
        ]}
      />
      <meshBasicMaterial
        color={ATOM_SELECTION_HALO_COLOR}
        depthWrite={false}
        opacity={ATOM_SELECTION_HALO_OPACITY}
        side={BackSide}
        toneMapped={false}
        transparent
      />
    </instancedMesh>
  );
}

function ignoreAtomSelectionHaloRaycast() {}

function instanceForAtomId(
  atomInstances: AtomInstanceSpec[],
  atomIndexById: Map<string, number>,
  atomId: string | null,
): { index: number; instance: AtomInstanceSpec } | null {
  if (!atomId) {
    return null;
  }

  const index = atomIndexById.get(atomId);
  if (index === undefined) {
    return null;
  }

  const instance = atomInstances[index];
  return instance ? { index, instance } : null;
}

function highlightedInstanceForAtomId(
  atomInstances: AtomInstanceSpec[],
  atomColorInstances: AtomColorInstanceSpec[],
  atomIndexById: Map<string, number>,
  atomId: string | null,
): { index: number; instance: AtomInstanceSpec & AtomColorInstanceSpec } | null {
  const atomInstance = instanceForAtomId(atomInstances, atomIndexById, atomId);
  if (!atomInstance) {
    return null;
  }

  const colorInstance = atomColorInstances[atomInstance.index];
  return colorInstance
    ? {
        index: atomInstance.index,
        instance: { ...atomInstance.instance, ...colorInstance },
      }
    : null;
}

function setAtomInstanceColor(
  mesh: InstancedMesh,
  index: number,
  color: Color,
) {
  mesh.setColorAt(index, color);
  if (mesh.instanceColor) {
    mesh.instanceColor.needsUpdate = true;
  }
}

function InstancedAtomHighlightAnimator({
  index,
  inspected,
  meshRef,
  onComplete,
  restingColor,
}: {
  index: number;
  inspected: boolean;
  meshRef: { current: InstancedMesh | null };
  onComplete: () => void;
  restingColor: Color;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const startTimeRef = useRef(performance.now());
  const isActiveRef = useRef(true);

  useEffect(() => {
    startTimeRef.current = performance.now();
    isActiveRef.current = true;
    invalidate();

    return () => {
      const mesh = meshRef.current;
      if (mesh) {
        setAtomInstanceColor(mesh, index, restingColor);
        invalidate();
      }
    };
  }, [index, inspected, invalidate, meshRef, restingColor]);

  useFrame(() => {
    if (!isActiveRef.current) {
      return;
    }

    const mesh = meshRef.current;
    if (!mesh) {
      return;
    }

    const elapsedMs = performance.now() - startTimeRef.current;
    const targetMix = inspected
      ? ATOM_HIGHLIGHT_SELECTED_COLOR_MIX
      : ATOM_HIGHLIGHT_PULSE_COLOR_MIX;
    const durationMs = inspected ? ATOM_HIGHLIGHT_SELECT_MS : ATOM_HIGHLIGHT_PULSE_MS;
    const progress = Math.min(1, elapsedMs / durationMs);
    const fade = inspected ? easeOutCubic(progress) : atomPulseFade(progress);
    const color = restingColor
      .clone()
      .lerp(ATOM_HIGHLIGHT_TARGET_COLOR, targetMix * fade);
    setAtomInstanceColor(mesh, index, color);

    if (progress >= 1) {
      setAtomInstanceColor(mesh, index, restingColor);
      if (!inspected) {
        onComplete();
      }
      isActiveRef.current = false;
      return;
    }

    invalidate();
  });

  return null;
}

function InstancedAtomSelectionRing({
  position,
  radius,
}: {
  position: VectorTuple;
  radius: number;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const ringGroupRef = useRef<Group | null>(null);
  const ringMaterialRef = useRef<SpriteMaterial | null>(null);
  const startTimeRef = useRef(performance.now());
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    startTimeRef.current = performance.now();
    setIsActive(true);
    invalidate();
  }, [invalidate]);

  useFrame(() => {
    if (!isActive) {
      return;
    }

    const ringGroup = ringGroupRef.current;
    const ringMaterial = ringMaterialRef.current;
    if (!ringGroup || !ringMaterial) {
      return;
    }

    const progress = Math.min(
      1,
      (performance.now() - startTimeRef.current) / ATOM_HIGHLIGHT_SELECT_MS,
    );
    const easedProgress = easeOutCubic(progress);
    const scale =
      ATOM_SELECTION_RING_PULSE_MIN_SCALE +
      (ATOM_SELECTION_RING_SELECTED_SCALE - ATOM_SELECTION_RING_PULSE_MIN_SCALE) *
        easedProgress;
    ringGroup.scale.setScalar(scale);
    ringMaterial.opacity = ATOM_SELECTION_RING_SELECTED_OPACITY * easedProgress;

    if (progress >= 1) {
      setIsActive(false);
      return;
    }

    invalidate();
  });

  return (
    <AtomSelectionRing
      materialRef={ringMaterialRef}
      opacity={0}
      position={position}
      radius={radius}
      ringRef={ringGroupRef}
      scale={ATOM_SELECTION_RING_PULSE_MIN_SCALE}
    />
  );
}
