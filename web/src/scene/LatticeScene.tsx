import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  Box3,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  MOUSE,
  OrthographicCamera,
  Quaternion,
  TOUCH,
  Vector3,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TrackballControls } from "three/examples/jsm/controls/TrackballControls.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";

import type {
  AtomRadiusModel,
  AtomSpec,
  BondSpec,
  PolyhedronSpec,
  SceneSpec,
} from "../api/scene";
import type { BondColorMode, ComponentOpacityState, StyleState } from "../app/settings";
import { applyWheelZoomDelta, type InteractionMode } from "../app/viewState";
import { CameraHeadlight } from "./CameraHeadlight";
import { PREVIEW_AMBIENT_LIGHT_INTENSITY } from "./renderAppearance";
import {
  applyOrthographicFrustum,
  computeCameraFitZoom,
  computeStandardCameraPose,
  withDefaultCellVectors,
  type StandardCameraPose,
  type VectorTuple,
} from "./viewMath";

export interface PreviewSafeArea {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

export interface CameraOrientationRef {
  current: Quaternion;
}

const EMPTY_SAFE_AREA: PreviewSafeArea = {
  bottom: 0,
  left: 0,
  right: 0,
  top: 0,
};
const NARROW_VIEWPORT_BREAKPOINT = 760;
const NARROW_VIEWPORT_SAFE_AREA: PreviewSafeArea = {
  bottom: 132,
  left: 16,
  right: 88,
  top: 476,
};
const CAMERA_TARGET = new Vector3(0, 0, 0);
export const BOND_COLOR = "#c7cbd1";
export const BOND_RADIUS = 0.14;
const CELL_FRAME_COLOR = "#111111";
export const CELL_FRAME_LINE_WIDTH_PIXELS = 1;
export const POLYHEDRON_SURFACE_OPACITY = 0.25;
export const POLYHEDRON_EDGE_COLOR = "#525866";
export const POLYHEDRON_EDGE_OPACITY = 0.42;
const POLYHEDRON_EDGE_OPACITY_RATIO =
  POLYHEDRON_EDGE_OPACITY / POLYHEDRON_SURFACE_OPACITY;

export function LatticeScene({
  cameraOrientationRef,
  componentOpacity,
  interactionLocked,
  interactionMode,
  layoutScene,
  onViewScaleChange,
  resetCounter,
  safeArea = EMPTY_SAFE_AREA,
  scene,
  showAtoms = true,
  showUnitCell = true,
  style,
  viewScale,
}: {
  cameraOrientationRef?: CameraOrientationRef;
  componentOpacity: ComponentOpacityState;
  interactionLocked: boolean;
  interactionMode: InteractionMode;
  layoutScene?: SceneSpec;
  onViewScaleChange: (viewScale: number) => void;
  resetCounter: number;
  safeArea?: PreviewSafeArea;
  scene: SceneSpec;
  showAtoms?: boolean;
  showUnitCell?: boolean;
  style: StyleState;
  viewScale: number;
}) {
  const layoutSourceScene = layoutScene ?? scene;
  const layout = useMemo(
    () => computeSceneLayout(layoutSourceScene, style.atomRadiusModel),
    [layoutSourceScene, style.atomRadiusModel],
  );

  return (
    <Canvas
      orthographic
      camera={{
        position: layout.standardPose.cameraPosition,
        zoom: 1,
        near: 0.01,
        far: Math.max(1000, layout.standardPose.distance + layout.span * 8),
      }}
      gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
      data-testid="lattice-canvas"
    >
      <ambientLight intensity={PREVIEW_AMBIENT_LIGHT_INTENSITY} />
      <CameraHeadlight />
      <SceneContent
        componentOpacity={componentOpacity}
        layout={layout}
        resetCounter={resetCounter}
        safeArea={safeArea}
        scene={scene}
        showAtoms={showAtoms}
        showUnitCell={showUnitCell}
        style={style}
        viewScale={viewScale}
      />
      <CameraOrientationTracker cameraOrientationRef={cameraOrientationRef} />
      <InteractiveCameraControls
        interactionLocked={interactionLocked}
        interactionMode={interactionMode}
        onViewScaleChange={onViewScaleChange}
        resetCounter={resetCounter}
        viewScale={viewScale}
      />
    </Canvas>
  );
}

function CameraOrientationTracker({
  cameraOrientationRef,
}: {
  cameraOrientationRef?: CameraOrientationRef;
}) {
  const { camera } = useThree();

  useEffect(() => {
    cameraOrientationRef?.current.copy(camera.quaternion);
  }, [camera, cameraOrientationRef]);

  useFrame(() => {
    cameraOrientationRef?.current.copy(camera.quaternion);
  });

  return null;
}

function SceneContent({
  componentOpacity,
  layout,
  resetCounter,
  safeArea,
  scene,
  showAtoms,
  showUnitCell,
  style,
  viewScale,
}: {
  componentOpacity: ComponentOpacityState;
  layout: SceneLayout;
  resetCounter: number;
  safeArea: PreviewSafeArea;
  scene: SceneSpec;
  showAtoms: boolean;
  showUnitCell: boolean;
  style: StyleState;
  viewScale: number;
}) {
  const { camera, size } = useThree();
  const atomById = useMemo(() => new Map(scene.atoms.map((atom) => [atom.id, atom])), [scene]);
  const effectiveSafeArea = useMemo(
    () => previewSafeAreaForViewport(safeArea, size.width),
    [safeArea, size.width],
  );
  const fitZoom = useMemo(
    () => computeCameraFitZoom(layout.span, size.width, size.height, effectiveSafeArea),
    [effectiveSafeArea, layout.span, size.height, size.width],
  );
  const zoom = fitZoom * viewScale;

  useEffect(() => {
    applyStandardCameraPose(camera, layout.standardPose, layout.span);
  }, [camera, layout.span, layout.standardPose, resetCounter]);

  useEffect(() => {
    if (camera instanceof OrthographicCamera) {
      applyOrthographicFrustum(camera, size.width, size.height, zoom, effectiveSafeArea);
    }
  }, [camera, effectiveSafeArea, size.height, size.width, zoom]);

  return (
    <group>
      <group position={layout.groupPosition}>
        {showUnitCell ? (
          <CellFrame
            opacity={componentOpacity.unitCell / 100}
            vectors={scene.cell.vectors}
          />
        ) : null}
        {scene.polyhedra.map((polyhedron) => (
          <Polyhedron
            key={polyhedron.id}
            atomById={atomById}
            opacity={componentOpacity.polyhedra / 100}
            polyhedron={polyhedron}
          />
        ))}
        {scene.bonds.map((bond) => (
          <Bond
            key={bond.id}
            atomById={atomById}
            bond={bond}
            colorMode={style.bondColorMode}
            thicknessScale={style.bondThickness / 100}
            opacity={componentOpacity.bonds / 100}
          />
        ))}
        {showAtoms
          ? scene.atoms.map((atom) => (
              <Atom
                key={atom.id}
                atom={atom}
                radiusModel={style.atomRadiusModel}
                radiusScale={style.atomRadius / 100}
                opacity={componentOpacity.atoms / 100}
              />
            ))
          : null}
      </group>
    </group>
  );
}

type CameraControls = OrbitControls | TrackballControls;

function InteractiveCameraControls({
  interactionLocked,
  interactionMode,
  onViewScaleChange,
  resetCounter,
  viewScale,
}: {
  interactionLocked: boolean;
  interactionMode: InteractionMode;
  onViewScaleChange: (viewScale: number) => void;
  resetCounter: number;
  viewScale: number;
}) {
  const { camera, gl, size } = useThree();
  const controlsRef = useRef<CameraControls | null>(null);
  const viewScaleRef = useRef(viewScale);

  useEffect(() => {
    viewScaleRef.current = viewScale;
  }, [viewScale]);

  useEffect(() => {
    const controls =
      interactionMode === "trackball"
        ? new TrackballControls(camera, gl.domElement)
        : new OrbitControls(camera, gl.domElement);

    configureCameraControls(controls, interactionMode, interactionLocked);
    controls.target.copy(CAMERA_TARGET);
    resizeCameraControls(controls);
    controls.update();
    controlsRef.current = controls;

    return () => {
      controls.dispose();
      if (controlsRef.current === controls) {
        controlsRef.current = null;
      }
    };
  }, [camera, gl.domElement, interactionMode, resetCounter]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) {
      return;
    }

    configureCameraControls(controls, interactionMode, interactionLocked);
    controls.target.copy(CAMERA_TARGET);
    controls.update();
  }, [interactionLocked, interactionMode, resetCounter]);

  useEffect(() => {
    resizeCameraControls(controlsRef.current);
  }, [size.height, size.width]);

  useEffect(() => {
    const element = gl.domElement;

    function handleWheel(event: WheelEvent) {
      event.preventDefault();
      if (interactionLocked) {
        return;
      }

      onViewScaleChange(applyWheelZoomDelta(viewScaleRef.current, event.deltaY));
    }

    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => element.removeEventListener("wheel", handleWheel);
  }, [gl.domElement, interactionLocked, onViewScaleChange]);

  useFrame(() => {
    controlsRef.current?.update();
  });

  return null;
}

function configureCameraControls(
  controls: CameraControls,
  interactionMode: InteractionMode,
  interactionLocked: boolean,
) {
  controls.enabled = !interactionLocked;

  if (interactionMode === "trackball" && controls instanceof TrackballControls) {
    controls.noPan = true;
    controls.noZoom = true;
    controls.noRotate = interactionLocked;
    controls.mouseButtons.LEFT = MOUSE.ROTATE;
    controls.mouseButtons.MIDDLE = null;
    controls.mouseButtons.RIGHT = null;
    return;
  }

  if (interactionMode === "orbit" && controls instanceof OrbitControls) {
    controls.enableDamping = false;
    controls.enablePan = false;
    controls.enableRotate = !interactionLocked;
    controls.enableZoom = false;
    controls.mouseButtons.LEFT = MOUSE.ROTATE;
    controls.mouseButtons.MIDDLE = null;
    controls.mouseButtons.RIGHT = null;
    controls.touches.ONE = TOUCH.ROTATE;
    controls.touches.TWO = null;
  }
}

function resizeCameraControls(controls: CameraControls | null) {
  if (controls instanceof TrackballControls) {
    controls.handleResize();
  }
}

function applyStandardCameraPose(
  camera: { lookAt: (x: number, y: number, z: number) => void; position: Vector3; up: Vector3 },
  standardPose: StandardCameraPose,
  span: number,
) {
  camera.position.set(...standardPose.cameraPosition);
  camera.up.set(...standardPose.cameraUp);
  camera.lookAt(...standardPose.target);

  if (camera instanceof OrthographicCamera) {
    camera.near = 0.01;
    camera.far = Math.max(1000, standardPose.distance + span * 8);
    camera.updateProjectionMatrix();
  }

  camera.position.set(...standardPose.cameraPosition);
}

function Atom({
  atom,
  opacity,
  radiusModel,
  radiusScale,
}: {
  atom: AtomSpec;
  opacity: number;
  radiusModel: AtomRadiusModel;
  radiusScale: number;
}) {
  const isTransparent = opacity < 1;
  const radius = atomRadiusForModel(atom, radiusModel);

  return (
    <mesh position={atom.position}>
      <sphereGeometry args={[radius * radiusScale, 48, 32]} />
      <meshLambertMaterial
        key={isTransparent ? "transparent" : "opaque"}
        color={atom.color}
        depthWrite={!isTransparent}
        opacity={opacity}
        transparent={isTransparent}
      />
    </mesh>
  );
}

function Bond({
  atomById,
  bond,
  colorMode,
  opacity,
  thicknessScale,
}: {
  atomById: Map<string, AtomSpec>;
  bond: BondSpec;
  colorMode: BondColorMode;
  opacity: number;
  thicknessScale: number;
}) {
  const geometry = useMemo(() => {
    const startAtom = atomById.get(bond.startAtomId);
    const endAtom = atomById.get(bond.endAtomId);
    if (!startAtom || !endAtom) {
      return null;
    }

    const start = new Vector3(...startAtom.position);
    const end = new Vector3(...endAtom.position);
    const direction = end.clone().sub(start);
    const length = direction.length();
    if (length <= 0) {
      return null;
    }

    const center = start.clone().add(end).multiplyScalar(0.5);
    const startSegmentCenter = start.clone().add(direction.clone().multiplyScalar(0.25));
    const endSegmentCenter = start.clone().add(direction.clone().multiplyScalar(0.75));
    const quaternion = new Quaternion().setFromUnitVectors(
      new Vector3(0, 1, 0),
      direction.clone().normalize(),
    );

    return {
      center,
      endColor: endAtom.color,
      endSegmentCenter,
      length,
      quaternion,
      startColor: startAtom.color,
      startSegmentCenter,
    };
  }, [atomById, bond.endAtomId, bond.startAtomId]);

  if (!geometry) {
    return null;
  }

  const isTransparent = opacity < 1;
  const radius = BOND_RADIUS * thicknessScale;

  if (colorMode === "by-atom") {
    return (
      <>
        <BondCylinder
          color={geometry.startColor}
          isTransparent={isTransparent}
          length={geometry.length / 2}
          opacity={opacity}
          position={geometry.startSegmentCenter}
          quaternion={geometry.quaternion}
          radius={radius}
        />
        <BondCylinder
          color={geometry.endColor}
          isTransparent={isTransparent}
          length={geometry.length / 2}
          opacity={opacity}
          position={geometry.endSegmentCenter}
          quaternion={geometry.quaternion}
          radius={radius}
        />
      </>
    );
  }

  return (
    <BondCylinder
      color={BOND_COLOR}
      isTransparent={isTransparent}
      length={geometry.length}
      opacity={opacity}
      position={geometry.center}
      quaternion={geometry.quaternion}
      radius={radius}
    />
  );
}

function BondCylinder({
  color,
  isTransparent,
  length,
  opacity,
  position,
  quaternion,
  radius,
}: {
  color: string;
  isTransparent: boolean;
  length: number;
  opacity: number;
  position: Vector3;
  quaternion: Quaternion;
  radius: number;
}) {
  return (
    <mesh position={position} quaternion={quaternion}>
      <cylinderGeometry
        args={[
          radius,
          radius,
          length,
          24,
        ]}
      />
      <meshLambertMaterial
        key={isTransparent ? "transparent" : "opaque"}
        color={color}
        depthWrite={!isTransparent}
        opacity={opacity}
        transparent={isTransparent}
      />
    </mesh>
  );
}

function Polyhedron({
  atomById,
  opacity,
  polyhedron,
}: {
  atomById: Map<string, AtomSpec>;
  opacity: number;
  polyhedron: PolyhedronSpec;
}) {
  const geometry = useMemo(
    () => polyhedronGeometryFromAtoms(polyhedron, atomById),
    [atomById, polyhedron],
  );

  useEffect(() => {
    return () => {
      geometry?.dispose();
    };
  }, [geometry]);

  if (!geometry) {
    return null;
  }

  return (
    <group>
      <mesh geometry={geometry}>
        <meshLambertMaterial
          color={polyhedron.color}
          depthWrite={false}
          opacity={opacity}
          side={DoubleSide}
          transparent
        />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[geometry]} />
        <lineBasicMaterial
          color={POLYHEDRON_EDGE_COLOR}
          depthWrite={false}
          opacity={Math.min(1, opacity * POLYHEDRON_EDGE_OPACITY_RATIO)}
          transparent
        />
      </lineSegments>
    </group>
  );
}

export function polyhedronGeometryFromAtoms(
  polyhedron: PolyhedronSpec,
  atomById: Map<string, AtomSpec>,
): BufferGeometry | null {
  const positions: number[] = [];
  for (const atomId of polyhedron.hullAtomIds) {
    const atom = atomById.get(atomId);
    if (!atom) {
      return null;
    }

    positions.push(...atom.position);
  }

  const indices: number[] = [];
  for (const face of polyhedron.faces) {
    if (
      face.length !== 3 ||
      new Set(face).size !== 3 ||
      face.some(
        (vertexIndex) =>
          !Number.isInteger(vertexIndex) ||
          vertexIndex < 0 ||
          vertexIndex >= polyhedron.hullAtomIds.length,
      )
    ) {
      return null;
    }

    indices.push(...face);
  }

  if (indices.length === 0) {
    return null;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function CellFrame({ opacity, vectors }: { opacity: number; vectors: VectorTuple[] }) {
  const cellFrame = useMemo(() => {
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(cellFrameLinePositions(vectors));

    const material = new LineMaterial({
      color: CELL_FRAME_COLOR,
      depthWrite: opacity >= 1,
      linewidth: CELL_FRAME_LINE_WIDTH_PIXELS,
      opacity,
      transparent: opacity < 1,
      worldUnits: false,
    });

    return new LineSegments2(geometry, material);
  }, [opacity, vectors]);

  useEffect(() => {
    return () => {
      cellFrame.geometry.dispose();
      cellFrame.material.dispose();
    };
  }, [cellFrame]);

  return <primitive object={cellFrame} />;
}

export function cellFrameLinePositions(vectors: VectorTuple[]): number[] {
  const [vectorA, vectorB, vectorC] = withDefaultCellVectors(vectors);
  const origin = new Vector3(0, 0, 0);
  const a = new Vector3(...vectorA);
  const b = new Vector3(...vectorB);
  const c = new Vector3(...vectorC);
  const ab = a.clone().add(b);
  const ac = a.clone().add(c);
  const bc = b.clone().add(c);
  const abc = a.clone().add(b).add(c);

  return [
    ...vectorEdge(origin, a),
    ...vectorEdge(origin, b),
    ...vectorEdge(origin, c),
    ...vectorEdge(a, ab),
    ...vectorEdge(a, ac),
    ...vectorEdge(b, ab),
    ...vectorEdge(b, bc),
    ...vectorEdge(c, ac),
    ...vectorEdge(c, bc),
    ...vectorEdge(ab, abc),
    ...vectorEdge(ac, abc),
    ...vectorEdge(bc, abc),
  ];
}

interface SceneLayout {
  groupPosition: VectorTuple;
  span: number;
  standardPose: StandardCameraPose;
}

export function computeSceneLayout(
  scene: SceneSpec,
  atomRadiusModel: AtomRadiusModel = "uniform",
): SceneLayout {
  const points = [
    ...cellCorners(scene.cell.vectors),
    ...scene.atoms.map((atom) => new Vector3(...atom.position)),
  ];
  const box = new Box3().setFromPoints(points);
  const maxRadius = Math.max(
    0,
    ...scene.atoms.map((atom) => atomRadiusForModel(atom, atomRadiusModel)),
  );
  box.expandByScalar(maxRadius);
  const center = cellCenter(scene.cell.vectors);
  const size = box.getSize(new Vector3());
  const span = Math.max(1, size.x, size.y, size.z);
  const standardPose = computeStandardCameraPose(scene.cell.vectors, span);

  return {
    groupPosition: [-center.x, -center.y, -center.z],
    span,
    standardPose,
  };
}

function atomRadiusForModel(atom: AtomSpec, model: AtomRadiusModel): number {
  return atom.radii?.[model] ?? atom.radius;
}

export function previewSafeAreaForViewport(
  safeArea: PreviewSafeArea,
  viewportWidth: number,
): PreviewSafeArea {
  if (viewportWidth > NARROW_VIEWPORT_BREAKPOINT) {
    return safeArea;
  }

  return {
    bottom: Math.max(safeArea.bottom, NARROW_VIEWPORT_SAFE_AREA.bottom),
    left: NARROW_VIEWPORT_SAFE_AREA.left,
    right: NARROW_VIEWPORT_SAFE_AREA.right,
    top: Math.max(safeArea.top, NARROW_VIEWPORT_SAFE_AREA.top),
  };
}

function cellCenter(vectors: VectorTuple[]): Vector3 {
  const [vectorA, vectorB, vectorC] = withDefaultCellVectors(vectors);

  return new Vector3(...vectorA)
    .add(new Vector3(...vectorB))
    .add(new Vector3(...vectorC))
    .multiplyScalar(0.5);
}

function cellCorners(vectors: VectorTuple[]): Vector3[] {
  const [vectorA, vectorB, vectorC] = withDefaultCellVectors(vectors);
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
