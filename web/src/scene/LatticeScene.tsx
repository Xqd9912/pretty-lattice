import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { Box3, CatmullRomCurve3, TubeGeometry, Vector3 } from "three";

import type { AtomSpec, SceneSpec } from "../api/scene";

type VectorTuple = [number, number, number];

export interface PreviewSafeArea {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

const EMPTY_SAFE_AREA: PreviewSafeArea = {
  bottom: 0,
  left: 0,
  right: 0,
  top: 0,
};
const SCENE_ROTATION: VectorTuple = [-0.18, 0.48, 0.0];

export function LatticeScene({
  safeArea = EMPTY_SAFE_AREA,
  scene,
}: {
  safeArea?: PreviewSafeArea;
  scene: SceneSpec;
}) {
  const layout = useMemo(() => computeSceneLayout(scene), [scene]);

  return (
    <Canvas
      orthographic
      camera={{
        position: layout.cameraPosition,
        zoom: 72,
        near: 0.1,
        far: 1000,
      }}
      gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
      data-testid="lattice-canvas"
    >
      <ambientLight intensity={0.62} />
      <directionalLight position={[5, 7, 9]} intensity={2.4} />
      <directionalLight position={[-4, -3, 2]} intensity={0.8} />
      <SceneContent layout={layout} safeArea={safeArea} scene={scene} />
    </Canvas>
  );
}

function SceneContent({
  layout,
  safeArea,
  scene,
}: {
  layout: SceneLayout;
  safeArea: PreviewSafeArea;
  scene: SceneSpec;
}) {
  const { camera, size } = useThree();
  const zoom = useMemo(
    () => computeCameraZoom(layout.span, size.width, size.height, safeArea),
    [layout.span, safeArea, size.height, size.width],
  );
  const safeAreaWorldOffset = useMemo(
    () => computeSafeAreaWorldOffset(layout.cameraPosition, zoom, safeArea),
    [layout.cameraPosition, safeArea, zoom],
  );

  useEffect(() => {
    camera.position.set(...layout.cameraPosition);
    camera.lookAt(0, 0, 0);

    if ("zoom" in camera) {
      camera.zoom = zoom;
      camera.updateProjectionMatrix();
    }
  }, [camera, layout.cameraPosition, zoom]);

  return (
    <group position={safeAreaWorldOffset} rotation={SCENE_ROTATION}>
      <group position={layout.groupPosition}>
        <CellFrame vectors={scene.cell.vectors} />
        {scene.atoms.map((atom) => (
          <Atom key={atom.id} atom={atom} />
        ))}
      </group>
    </group>
  );
}

function Atom({ atom }: { atom: AtomSpec }) {
  return (
    <mesh position={atom.position}>
      <sphereGeometry args={[atom.radius, 48, 32]} />
      <meshStandardMaterial color={atom.color} roughness={0.42} metalness={0.04} />
    </mesh>
  );
}

function CellFrame({ vectors }: { vectors: VectorTuple[] }) {
  const edges = useMemo(() => {
    const [vectorA = [3.2, 0, 0], vectorB = [0, 3.2, 0], vectorC = [0, 0, 3.2]] = vectors;
    const origin = new Vector3(0, 0, 0);
    const a = new Vector3(...vectorA);
    const b = new Vector3(...vectorB);
    const c = new Vector3(...vectorC);
    const ab = a.clone().add(b);
    const ac = a.clone().add(c);
    const bc = b.clone().add(c);
    const abc = a.clone().add(b).add(c);

    return [
      vectorEdge(origin, a),
      vectorEdge(origin, b),
      vectorEdge(origin, c),
      vectorEdge(a, ab),
      vectorEdge(a, ac),
      vectorEdge(b, ab),
      vectorEdge(b, bc),
      vectorEdge(c, ac),
      vectorEdge(c, bc),
      vectorEdge(ab, abc),
      vectorEdge(ac, abc),
      vectorEdge(bc, abc),
    ];
  }, [vectors]);

  return (
    <group>
      {edges.map((edge, index) => (
        <CellEdge key={index} edge={edge} />
      ))}
    </group>
  );
}

function CellEdge({ edge }: { edge: readonly [number, number, number, number, number, number] }) {
  const geometry = useMemo(
    () =>
      new TubeGeometry(
        new CatmullRomCurve3([
          new Vector3(edge[0], edge[1], edge[2]),
          new Vector3(edge[3], edge[4], edge[5]),
        ]),
        4,
        0.018,
        8,
        false,
      ),
    [edge],
  );

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color="#30363d" roughness={0.5} />
    </mesh>
  );
}

interface SceneLayout {
  cameraPosition: VectorTuple;
  groupPosition: VectorTuple;
  span: number;
}

export function computeSceneLayout(scene: SceneSpec): SceneLayout {
  const points = [
    ...cellCorners(scene.cell.vectors),
    ...scene.atoms.map((atom) => new Vector3(...atom.position)),
  ];
  const box = new Box3().setFromPoints(points);
  const maxRadius = Math.max(0, ...scene.atoms.map((atom) => atom.radius));
  box.expandByScalar(maxRadius);
  const center = cellCenter(scene.cell.vectors);
  const size = box.getSize(new Vector3());
  const span = Math.max(1, size.x, size.y, size.z);

  return {
    cameraPosition: [span * 1.2, -span * 1.45, span * 1.05],
    groupPosition: [-center.x, -center.y, -center.z],
    span,
  };
}

function cellCenter(vectors: VectorTuple[]): Vector3 {
  const [vectorA = [3.2, 0, 0], vectorB = [0, 3.2, 0], vectorC = [0, 0, 3.2]] = vectors;

  return new Vector3(...vectorA)
    .add(new Vector3(...vectorB))
    .add(new Vector3(...vectorC))
    .multiplyScalar(0.5);
}

function computeCameraZoom(
  span: number,
  width: number,
  height: number,
  safeArea: PreviewSafeArea,
): number {
  const availableWidth = Math.max(1, width - safeArea.left - safeArea.right);
  const availableHeight = Math.max(1, height - safeArea.top - safeArea.bottom);

  return Math.max(28, Math.min(120, Math.min(availableWidth, availableHeight) / (span * 1.7)));
}

function computeSafeAreaWorldOffset(
  cameraPosition: VectorTuple,
  zoom: number,
  safeArea: PreviewSafeArea,
): VectorTuple {
  const cameraPositionVector = new Vector3(...cameraPosition);
  const forward = new Vector3(0, 0, 0).sub(cameraPositionVector).normalize();
  const worldUp = new Vector3(0, 1, 0);
  const right = forward.clone().cross(worldUp);
  if (right.lengthSq() === 0) {
    right.set(1, 0, 0);
  } else {
    right.normalize();
  }
  const up = right.clone().cross(forward).normalize();

  const screenOffsetX = (safeArea.left - safeArea.right) / 2;
  const screenOffsetY = (safeArea.bottom - safeArea.top) / 2;
  const offset = right
    .multiplyScalar(screenOffsetX / zoom)
    .add(up.multiplyScalar(screenOffsetY / zoom));

  return [offset.x, offset.y, offset.z];
}

function cellCorners(vectors: VectorTuple[]): Vector3[] {
  const [vectorA = [3.2, 0, 0], vectorB = [0, 3.2, 0], vectorC = [0, 0, 3.2]] = vectors;
  const origin = new Vector3(0, 0, 0);
  const a = new Vector3(...vectorA);
  const b = new Vector3(...vectorB);
  const c = new Vector3(...vectorC);

  return [
    origin,
    a,
    b,
    c,
    a.clone().add(b),
    a.clone().add(c),
    b.clone().add(c),
    a.clone().add(b).add(c),
  ];
}

function vectorEdge(
  start: Vector3,
  end: Vector3,
): [number, number, number, number, number, number] {
  return [start.x, start.y, start.z, end.x, end.y, end.z];
}
