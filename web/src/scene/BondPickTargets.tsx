import type { ThreeEvent } from "@react-three/fiber";
import { useCallback, useMemo, useRef } from "react";
import { Quaternion, Vector3 } from "three";

import type { AtomSpec, BondSpec } from "../api/scene";
import { resolveAtomSelectionAction } from "./atomPicking";
import { BOND_RADIUS } from "./sceneGeometry";

interface BondPickItem {
  atoms: [AtomSpec, AtomSpec];
  length: number;
  midpoint: [number, number, number];
  quaternion: Quaternion;
}

export function BondPickTargets({
  atoms,
  bonds,
  interactionLocked,
  onPick,
  onLockedInteractionAttempt,
}: {
  atoms: readonly AtomSpec[];
  bonds: readonly BondSpec[];
  interactionLocked: boolean;
  onPick?: (start: AtomSpec, end: AtomSpec) => void;
  onLockedInteractionAttempt?: () => void;
}) {
  const pointerDownRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const items = useMemo(() => createBondPickItems(atoms, bonds), [atoms, bonds]);
  const handleClick = useCallback((item: BondPickItem, event: ThreeEvent<MouseEvent>) => {
    const action = resolveAtomSelectionAction({
      button: event.button,
      detail: event.detail,
      pointerDown: pointerDownRef.current,
      pointerUp: event,
    }, interactionLocked);
    pointerDownRef.current = null;
    if (action === "ignore") {
      return;
    }
    event.stopPropagation();
    if (action === "locked") {
      onLockedInteractionAttempt?.();
      return;
    }
    onPick?.(...item.atoms);
  }, [interactionLocked, onLockedInteractionAttempt, onPick]);

  return (
    <group>
      {items.map((item, index) => (
        <mesh
          key={index}
          position={item.midpoint}
          quaternion={item.quaternion}
          scale={[BOND_RADIUS * 2.8, item.length, BOND_RADIUS * 2.8]}
          onClick={(event) => handleClick(item, event)}
          onPointerDown={(event) => {
            pointerDownRef.current = event.button === 0
              ? { clientX: event.clientX, clientY: event.clientY }
              : null;
          }}
          onPointerCancel={() => { pointerDownRef.current = null; }}
        >
          <cylinderGeometry args={[1, 1, 1, 10]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function createBondPickItems(
  atoms: readonly AtomSpec[],
  bonds: readonly BondSpec[],
): BondPickItem[] {
  const up = new Vector3(0, 1, 0);
  return bonds.flatMap((bond) => {
    const start = atoms[bond.startAtomIndex];
    const end = atoms[bond.endAtomIndex];
    if (!start || !end) {
      return [];
    }
    const startPosition = new Vector3(...start.position);
    const endPosition = new Vector3(...end.position);
    const direction = endPosition.clone().sub(startPosition);
    const length = direction.length();
    if (length <= 0) {
      return [];
    }
    return [{
      atoms: [start, end],
      length,
      midpoint: startPosition.add(endPosition).multiplyScalar(0.5).toArray(),
      quaternion: new Quaternion().setFromUnitVectors(up, direction.normalize()),
    }];
  });
}
