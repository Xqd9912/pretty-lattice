import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
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
import { atomColorForScheme } from "../app/colorSchemes";
import type {
  BondColorMode,
  ComponentOpacityState,
  ExportMeshQuality,
  StyleState,
} from "../app/settings";
import { applyWheelZoomDelta, type InteractionMode } from "../app/viewState";
import { CameraHeadlight } from "./CameraHeadlight";
import { applyCameraPoseSnapshot, type CameraPoseSnapshot } from "./cameraPose";
import {
  applyOrthographicExportFrame,
  type StructureExportFramePlan,
} from "./exportFrame";
import { PREVIEW_AMBIENT_LIGHT_INTENSITY } from "./renderAppearance";
import {
  BOND_RADIUS,
  CELL_FRAME_COLOR,
  CELL_FRAME_LINE_WIDTH_PIXELS,
  atomRadiusForModel,
  cellCenter,
  cellCorners,
  cellFrameLinePositions,
} from "./sceneGeometry";
import {
  applyOrthographicFrustum,
  type CameraFitBounds,
  computeCameraFitZoom,
  computeStandardCameraPose,
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

interface OrthographicCanvasCameraProps {
  far: number;
  near: number;
  position: VectorTuple;
  zoom: number;
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
export const BOND_2D_RADIAL_SEGMENTS = 12;
export const BOND_TUBE_RADIAL_SEGMENTS = 24;
export const POLYHEDRON_SURFACE_OPACITY = 0.5;
export const POLYHEDRON_EDGE_COLOR = "#f2f5f9";
export const POLYHEDRON_EDGE_OPACITY = 0.8;
const POLYHEDRON_EDGE_OPACITY_RATIO =
  POLYHEDRON_EDGE_OPACITY / POLYHEDRON_SURFACE_OPACITY;

export {
  BOND_RADIUS,
  CELL_FRAME_LINE_WIDTH_PIXELS,
  cellFrameLinePositions,
} from "./sceneGeometry";

export interface SceneMeshDetail {
  bond2dRadialSegments: number;
  bondRadialSegments: number;
  sphereHeightSegments: number;
  sphereWidthSegments: number;
}

export const PREVIEW_SCENE_MESH_DETAIL: SceneMeshDetail = {
  bond2dRadialSegments: 10,
  bondRadialSegments: 16,
  sphereHeightSegments: 24,
  sphereWidthSegments: 32,
};

export const EXPORT_SCENE_MESH_DETAIL_PRESETS: Record<ExportMeshQuality, SceneMeshDetail> = {
  low: {
    bond2dRadialSegments: 8,
    bondRadialSegments: 12,
    sphereHeightSegments: 16,
    sphereWidthSegments: 24,
  },
  medium: PREVIEW_SCENE_MESH_DETAIL,
  high: {
    bond2dRadialSegments: BOND_2D_RADIAL_SEGMENTS,
    bondRadialSegments: BOND_TUBE_RADIAL_SEGMENTS,
    sphereHeightSegments: 32,
    sphereWidthSegments: 48,
  },
  xhigh: {
    bond2dRadialSegments: 16,
    bondRadialSegments: 32,
    sphereHeightSegments: 48,
    sphereWidthSegments: 72,
  },
};

export function LatticeScene({
  cameraOrientationRef,
  componentOpacity,
  interactionLocked,
  interactionMode,
  layoutScene,
  onViewScaleChange,
  onCameraOrientationChange,
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
  onCameraOrientationChange?: () => void;
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
  const cameraProps = useMemo<OrthographicCanvasCameraProps>(
    () => ({
      position: layout.standardPose.cameraPosition,
      zoom: 1,
      near: 0.01,
      far: Math.max(1000, layout.standardPose.distance + layout.span * 8),
    }),
    [layout.span, layout.standardPose.cameraPosition, layout.standardPose.distance],
  );
  const glProps = useMemo(
    () => ({ antialias: true, alpha: true, preserveDrawingBuffer: true }),
    [],
  );

  return (
    <Canvas
      orthographic
      camera={cameraProps}
      gl={glProps}
      data-testid="lattice-canvas"
    >
      <ambientLight intensity={PREVIEW_AMBIENT_LIGHT_INTENSITY} />
      <CameraHeadlight />
      <PreviewSceneContent
        componentOpacity={componentOpacity}
        layout={layout}
        meshDetail={PREVIEW_SCENE_MESH_DETAIL}
        resetCounter={resetCounter}
        safeArea={safeArea}
        scene={scene}
        showAtoms={showAtoms}
        showUnitCell={showUnitCell}
        style={style}
        viewScale={viewScale}
      />
      <CameraOrientationTracker
        cameraOrientationRef={cameraOrientationRef}
        onCameraOrientationChange={onCameraOrientationChange}
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

function CameraOrientationTracker({
  cameraOrientationRef,
  onCameraOrientationChange,
}: {
  cameraOrientationRef?: CameraOrientationRef;
  onCameraOrientationChange?: () => void;
}) {
  const { camera } = useThree();
  const lastNotifiedOrientationRef = useRef(new Quaternion());
  const lastNotificationTimeRef = useRef(0);

  useEffect(() => {
    cameraOrientationRef?.current.copy(camera.quaternion);
    lastNotifiedOrientationRef.current.copy(camera.quaternion);
    lastNotificationTimeRef.current = performance.now();
    onCameraOrientationChange?.();
  }, [camera, cameraOrientationRef, onCameraOrientationChange]);

  useFrame(() => {
    cameraOrientationRef?.current.copy(camera.quaternion);
    if (!onCameraOrientationChange) {
      return;
    }

    const now = performance.now();
    const orientationDelta = lastNotifiedOrientationRef.current.angleTo(camera.quaternion);
    if (orientationDelta < 0.002 || now - lastNotificationTimeRef.current < 120) {
      return;
    }

    lastNotifiedOrientationRef.current.copy(camera.quaternion);
    lastNotificationTimeRef.current = now;
    onCameraOrientationChange();
  });

  return null;
}

function PreviewSceneContent({
  componentOpacity,
  layout,
  meshDetail,
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
  meshDetail: SceneMeshDetail;
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
    () => computeCameraFitZoom(layout.cameraFitBounds, size.width, size.height, effectiveSafeArea),
    [effectiveSafeArea, layout.cameraFitBounds, size.height, size.width],
  );
  const zoom = fitZoom * viewScale;

  useLayoutEffect(() => {
    applyStandardCameraPose(camera, layout.standardPose, layout.span);
  }, [camera, layout.span, layout.standardPose, resetCounter]);

  useLayoutEffect(() => {
    if (camera instanceof OrthographicCamera) {
      applyOrthographicFrustum(camera, size.width, size.height, zoom, effectiveSafeArea);
    }
  }, [camera, effectiveSafeArea, size.height, size.width, zoom]);

  return (
    <StructureSceneObjects
      atomById={atomById}
      componentOpacity={componentOpacity}
      groupPosition={layout.groupPosition}
      meshDetail={meshDetail}
      scene={scene}
      showAtoms={showAtoms}
      showUnitCell={showUnitCell}
      style={style}
    />
  );
}

export function ExportSceneContent({
  cameraPose,
  componentOpacity,
  exportFramePlan,
  layout,
  meshDetail,
  scene,
  showAtoms,
  showUnitCell,
  style,
}: {
  cameraPose: CameraPoseSnapshot;
  componentOpacity: ComponentOpacityState;
  exportFramePlan: StructureExportFramePlan;
  layout: SceneLayout;
  meshDetail: SceneMeshDetail;
  scene: SceneSpec;
  showAtoms: boolean;
  showUnitCell: boolean;
  style: StyleState;
}) {
  const { camera } = useThree();
  const atomById = useMemo(() => new Map(scene.atoms.map((atom) => [atom.id, atom])), [scene]);

  useLayoutEffect(() => {
    applyCameraPoseSnapshot(camera, cameraPose, layout.standardPose.distance, layout.span);
  }, [camera, cameraPose, layout.span, layout.standardPose.distance]);

  useLayoutEffect(() => {
    if (camera instanceof OrthographicCamera) {
      applyOrthographicExportFrame(camera, exportFramePlan);
    }
  }, [camera, exportFramePlan]);

  return (
    <StructureSceneObjects
      atomById={atomById}
      componentOpacity={componentOpacity}
      groupPosition={layout.groupPosition}
      meshDetail={meshDetail}
      scene={scene}
      showAtoms={showAtoms}
      showUnitCell={showUnitCell}
      style={style}
    />
  );
}

function StructureSceneObjects({
  atomById,
  componentOpacity,
  groupPosition,
  meshDetail,
  scene,
  showAtoms,
  showUnitCell,
  style,
}: {
  atomById: Map<string, AtomSpec>;
  componentOpacity: ComponentOpacityState;
  groupPosition: VectorTuple;
  meshDetail: SceneMeshDetail;
  scene: SceneSpec;
  showAtoms: boolean;
  showUnitCell: boolean;
  style: StyleState;
}) {
  return (
    <group>
      <group position={groupPosition}>
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
            colorScheme={style.colorScheme}
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
            colorScheme={style.colorScheme}
            meshDetail={meshDetail}
            thicknessScale={style.bondThickness / 100}
            opacity={componentOpacity.bonds / 100}
          />
        ))}
        {showAtoms
          ? scene.atoms.map((atom) => (
              <Atom
                key={atom.id}
                atom={atom}
                colorScheme={style.colorScheme}
                meshDetail={meshDetail}
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

      const nextViewScale = applyWheelZoomDelta(viewScaleRef.current, event.deltaY);
      viewScaleRef.current = nextViewScale;
      onViewScaleChange(nextViewScale);
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
  colorScheme,
  meshDetail,
  opacity,
  radiusModel,
  radiusScale,
}: {
  atom: AtomSpec;
  colorScheme: StyleState["colorScheme"];
  meshDetail: SceneMeshDetail;
  opacity: number;
  radiusModel: AtomRadiusModel;
  radiusScale: number;
}) {
  const isTransparent = opacity < 1;
  const radius = atomRadiusForModel(atom, radiusModel);
  const color = atomColorForScheme(atom, colorScheme);

  return (
    <mesh position={atom.position}>
      <sphereGeometry
        args={[
          radius * radiusScale,
          meshDetail.sphereWidthSegments,
          meshDetail.sphereHeightSegments,
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

function Bond({
  atomById,
  bond,
  colorMode,
  colorScheme,
  meshDetail,
  opacity,
  thicknessScale,
}: {
  atomById: Map<string, AtomSpec>;
  bond: BondSpec;
  colorMode: BondColorMode;
  colorScheme: StyleState["colorScheme"];
  meshDetail: SceneMeshDetail;
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
      endColor: atomColorForScheme(endAtom, colorScheme),
      endSegmentCenter,
      length,
      quaternion,
      startColor: atomColorForScheme(startAtom, colorScheme),
      startSegmentCenter,
    };
  }, [atomById, bond.endAtomId, bond.startAtomId, colorScheme]);

  if (!geometry) {
    return null;
  }

  const isTransparent = opacity < 1;
  const radius = BOND_RADIUS * thicknessScale;

  if (colorMode === "unicolor-2d") {
    return (
      <BondCylinder
        color={BOND_COLOR}
        isTransparent={isTransparent}
        length={geometry.length}
        material="basic"
        opacity={opacity}
        position={geometry.center}
        quaternion={geometry.quaternion}
        radialSegments={meshDetail.bond2dRadialSegments}
        radius={radius}
      />
    );
  }

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
          radialSegments={meshDetail.bondRadialSegments}
          radius={radius}
        />
        <BondCylinder
          color={geometry.endColor}
          isTransparent={isTransparent}
          length={geometry.length / 2}
          opacity={opacity}
          position={geometry.endSegmentCenter}
          quaternion={geometry.quaternion}
          radialSegments={meshDetail.bondRadialSegments}
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
      radialSegments={meshDetail.bondRadialSegments}
      radius={radius}
    />
  );
}

function BondCylinder({
  color,
  isTransparent,
  length,
  material = "lambert",
  opacity,
  position,
  quaternion,
  radialSegments,
  radius,
}: {
  color: string;
  isTransparent: boolean;
  length: number;
  material?: "basic" | "lambert";
  opacity: number;
  position: Vector3;
  quaternion: Quaternion;
  radialSegments: number;
  radius: number;
}) {
  const materialProps = {
    color,
    depthWrite: !isTransparent,
    opacity,
    transparent: isTransparent,
  };

  return (
    <mesh position={position} quaternion={quaternion}>
      <cylinderGeometry
        args={[
          radius,
          radius,
          length,
          radialSegments,
        ]}
      />
      {material === "basic" ? (
        <meshBasicMaterial
          key={isTransparent ? "basic-transparent" : "basic-opaque"}
          {...materialProps}
        />
      ) : (
        <meshLambertMaterial
          key={isTransparent ? "lambert-transparent" : "lambert-opaque"}
          {...materialProps}
        />
      )}
    </mesh>
  );
}

function Polyhedron({
  atomById,
  colorScheme,
  opacity,
  polyhedron,
}: {
  atomById: Map<string, AtomSpec>;
  colorScheme: StyleState["colorScheme"];
  opacity: number;
  polyhedron: PolyhedronSpec;
}) {
  const geometry = useMemo(
    () => polyhedronGeometryFromAtoms(polyhedron, atomById),
    [atomById, polyhedron],
  );
  const centerAtom = atomById.get(polyhedron.centerAtomId);

  useEffect(() => {
    return () => {
      geometry?.dispose();
    };
  }, [geometry]);

  if (!geometry || !centerAtom) {
    return null;
  }

  const color = atomColorForScheme(centerAtom, colorScheme);

  return (
    <group>
      <mesh geometry={geometry}>
        <meshLambertMaterial
          color={color}
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

export interface SceneLayout {
  cameraFitBounds: CameraFitBounds;
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
  const groupPosition: VectorTuple = [-center.x, -center.y, -center.z];
  const projectedFitSize = computeStandardProjectedFitSize(
    scene,
    atomRadiusModel,
    groupPosition,
    standardPose,
  );

  return {
    cameraFitBounds: {
      ...projectedFitSize,
      span,
    },
    groupPosition,
    span,
    standardPose,
  };
}

function computeStandardProjectedFitSize(
  scene: SceneSpec,
  atomRadiusModel: AtomRadiusModel,
  groupPosition: VectorTuple,
  standardPose: StandardCameraPose,
): Pick<CameraFitBounds, "projectedHeight" | "projectedWidth"> {
  const outward = new Vector3(...standardPose.outward).normalize();
  const cameraUp = new Vector3(...standardPose.cameraUp).normalize();
  const right = cameraUp.clone().cross(outward).normalize();
  const screenUp = outward.clone().cross(right).normalize();
  const offset = new Vector3(...groupPosition);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  function includePoint(point: Vector3 | VectorTuple, radius = 0) {
    const localPoint = Array.isArray(point)
      ? new Vector3(...point)
      : point.clone();
    localPoint.add(offset);
    const safeRadius = Math.max(0, radius);
    const x = localPoint.dot(right);
    const y = localPoint.dot(screenUp);

    minX = Math.min(minX, x - safeRadius);
    maxX = Math.max(maxX, x + safeRadius);
    minY = Math.min(minY, y - safeRadius);
    maxY = Math.max(maxY, y + safeRadius);
  }

  for (const corner of cellCorners(scene.cell.vectors)) {
    includePoint(corner);
  }

  for (const atom of scene.atoms) {
    includePoint(atom.position, atomRadiusForModel(atom, atomRadiusModel));
  }

  return {
    projectedHeight: Math.max(1, maxY - minY),
    projectedWidth: Math.max(1, maxX - minX),
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
