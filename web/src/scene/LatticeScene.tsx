import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { Box3, CatmullRomCurve3, TubeGeometry, Vector3 } from "three";

import type { AtomSpec, SceneSpec } from "../api/scene";

type VectorTuple = [number, number, number];

export function LatticeScene({ scene }: { scene: SceneSpec }) {
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
      <ResponsiveCamera position={layout.cameraPosition} span={layout.span} />
      <group position={layout.groupPosition} rotation={[-0.18, 0.48, 0.0]}>
        <CellFrame vectors={scene.cell.vectors} />
        {scene.atoms.map((atom) => (
          <Atom key={atom.id} atom={atom} />
        ))}
      </group>
    </Canvas>
  );
}

function ResponsiveCamera({ position, span }: { position: VectorTuple; span: number }) {
  const { camera, size } = useThree();

  useEffect(() => {
    camera.position.set(...position);
    camera.lookAt(0, 0, 0);

    if ("zoom" in camera) {
      camera.zoom = Math.max(28, Math.min(120, Math.min(size.width, size.height) / (span * 1.7)));
      camera.updateProjectionMatrix();
    }
  }, [camera, position, size.height, size.width, span]);

  return null;
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

function computeSceneLayout(scene: SceneSpec): {
  cameraPosition: VectorTuple;
  groupPosition: VectorTuple;
  span: number;
} {
  const points = [
    ...cellCorners(scene.cell.vectors),
    ...scene.atoms.map((atom) => new Vector3(...atom.position)),
  ];
  const box = new Box3().setFromPoints(points);
  const maxRadius = Math.max(0, ...scene.atoms.map((atom) => atom.radius));
  box.expandByScalar(maxRadius);
  const center = box.getCenter(new Vector3());
  const size = box.getSize(new Vector3());
  const span = Math.max(1, size.x, size.y, size.z);

  return {
    cameraPosition: [span * 1.2, -span * 1.45, span * 1.05],
    groupPosition: [-center.x, -center.y, -center.z],
    span,
  };
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
