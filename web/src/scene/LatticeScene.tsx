import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Box3, MOUSE, OrthographicCamera, TOUCH, Vector3 } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TrackballControls } from "three/examples/jsm/controls/TrackballControls.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";

import type { AtomSpec, SceneSpec } from "../api/scene";
import { applyWheelZoomDelta, type InteractionMode } from "../app/viewState";
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
  top: 384,
};
const CAMERA_TARGET = new Vector3(0, 0, 0);
const CELL_FRAME_COLOR = "#111111";
export const CELL_FRAME_LINE_WIDTH_PIXELS = 1;

export function LatticeScene({
  interactionLocked,
  interactionMode,
  onViewScaleChange,
  resetCounter,
  safeArea = EMPTY_SAFE_AREA,
  scene,
  viewScale,
}: {
  interactionLocked: boolean;
  interactionMode: InteractionMode;
  onViewScaleChange: (viewScale: number) => void;
  resetCounter: number;
  safeArea?: PreviewSafeArea;
  scene: SceneSpec;
  viewScale: number;
}) {
  const layout = useMemo(() => computeSceneLayout(scene), [scene]);

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
      <ambientLight intensity={0.62} />
      <directionalLight position={[5, 7, 9]} intensity={2.4} />
      <directionalLight position={[-4, -3, 2]} intensity={0.8} />
      <SceneContent
        layout={layout}
        resetCounter={resetCounter}
        safeArea={safeArea}
        scene={scene}
        viewScale={viewScale}
      />
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

function SceneContent({
  layout,
  resetCounter,
  safeArea,
  scene,
  viewScale,
}: {
  layout: SceneLayout;
  resetCounter: number;
  safeArea: PreviewSafeArea;
  scene: SceneSpec;
  viewScale: number;
}) {
  const { camera, size } = useThree();
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
  }, [camera, resetCounter]);

  useEffect(() => {
    if (camera instanceof OrthographicCamera) {
      applyOrthographicFrustum(camera, size.width, size.height, zoom, effectiveSafeArea);
    }
  }, [camera, effectiveSafeArea, size.height, size.width, zoom]);

  return (
    <group>
      <group position={layout.groupPosition}>
        <CellFrame vectors={scene.cell.vectors} />
        {scene.atoms.map((atom) => (
          <Atom key={atom.id} atom={atom} />
        ))}
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

function Atom({ atom }: { atom: AtomSpec }) {
  return (
    <mesh position={atom.position}>
      <sphereGeometry args={[atom.radius, 48, 32]} />
      <meshStandardMaterial color={atom.color} roughness={0.42} metalness={0.04} />
    </mesh>
  );
}

function CellFrame({ vectors }: { vectors: VectorTuple[] }) {
  const cellFrame = useMemo(() => {
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(cellFrameLinePositions(vectors));

    const material = new LineMaterial({
      color: CELL_FRAME_COLOR,
      linewidth: CELL_FRAME_LINE_WIDTH_PIXELS,
      worldUnits: false,
    });

    return new LineSegments2(geometry, material);
  }, [vectors]);

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
  const standardPose = computeStandardCameraPose(scene.cell.vectors, span);

  return {
    groupPosition: [-center.x, -center.y, -center.z],
    span,
    standardPose,
  };
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
