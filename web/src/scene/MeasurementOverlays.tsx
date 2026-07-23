import { useEffect, useMemo } from "react";
import { Vector3 } from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

import type { SceneSpec } from "../api/scene";
import {
  atomInstanceIdentity,
  resolveMeasurement,
  sameAtomInstance,
  type AtomInstanceIdentity,
  type MeasurementRecord,
  type MeasurementTool,
} from "../model/measurements";

const MEASUREMENT_COLOR = "#38bdf8";
const MEASUREMENT_LINE_WIDTH_PX = 3.5;
const MEASUREMENT_ARC_WIDTH_PX = 5;

export function MeasurementOverlays({
  activeTool = null,
  draft = [],
  records,
  scene,
}: {
  activeTool?: MeasurementTool | null;
  draft?: readonly AtomInstanceIdentity[];
  records: readonly MeasurementRecord[];
  scene: SceneSpec;
}) {
  const resolved = useMemo(
    () => records.map((record) => resolveMeasurement(scene, record)).filter((item) => item !== null),
    [records, scene],
  );
  const draftPositions = useMemo(
    () => draft.flatMap((identity) => {
      const atom = scene.atoms.find((candidate) => sameAtomInstance(
        identity,
        atomInstanceIdentity(candidate),
      ));
      return atom ? [new Vector3(...atom.position)] : [];
    }),
    [draft, scene.atoms],
  );
  return (
    <group>
      {resolved.map((measurement) => {
        const positions = measurement.atoms.map((atom) => new Vector3(...atom.position));
        return (
          <group key={measurement.record.id}>
            <MeasurementLine points={positions} />
            {measurement.record.type === "angle" ? (
              <MeasurementAngleArc points={positions} />
            ) : null}
          </group>
        );
      })}
      {activeTool && draftPositions.length > 0 ? (
        <group>
          {draftPositions.length > 1 ? (
            <MeasurementLine points={draftPositions} opacity={0.68} />
          ) : null}
        </group>
      ) : null}
    </group>
  );
}

function MeasurementLine({
  opacity = 0.95,
  points,
  width = MEASUREMENT_LINE_WIDTH_PX,
}: {
  opacity?: number;
  points: readonly Vector3[];
  width?: number;
}) {
  const line = useMemo(() => {
    const geometry = new LineGeometry();
    geometry.setPositions(points.flatMap((point) => point.toArray()));
    const material = new LineMaterial({
      alphaToCoverage: true,
      color: MEASUREMENT_COLOR,
      depthTest: false,
      depthWrite: false,
      linewidth: width,
      opacity,
      transparent: true,
      worldUnits: false,
    });
    const object = new Line2(geometry, material);
    object.renderOrder = 100;
    object.computeLineDistances();
    return object;
  }, [opacity, points, width]);
  useEffect(() => () => {
    line.geometry.dispose();
    line.material.dispose();
  }, [line]);
  return <primitive object={line} />;
}

function MeasurementAngleArc({ points }: { points: readonly Vector3[] }) {
  const arcPoints = useMemo(() => {
    if (points.length < 3) {
      return [];
    }
    const center = points[1]!;
    const first = points[0]!.clone().sub(center);
    const second = points[2]!.clone().sub(center);
    const radius = Math.min(first.length(), second.length()) * 0.34;
    if (radius <= 0) {
      return [];
    }
    const start = first.normalize();
    const end = second.normalize();
    const angle = start.angleTo(end);
    const axis = start.clone().cross(end).normalize();
    if (!Number.isFinite(angle) || axis.lengthSq() === 0) {
      return [];
    }
    return Array.from({ length: 33 }, (_, index) => start.clone()
      .applyAxisAngle(axis, angle * index / 32)
      .multiplyScalar(radius)
      .add(center));
  }, [points]);
  return arcPoints.length > 1 ? (
    <MeasurementLine points={arcPoints} width={MEASUREMENT_ARC_WIDTH_PX} />
  ) : null;
}
