import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { type CSSProperties, useEffect, useMemo, useRef } from "react";
import {
  CanvasTexture,
  Group,
  LinearFilter,
  OrthographicCamera,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from "three";

import type { CameraOrientationRef } from "./LatticeScene";
import { computeOrientationGizmoAxes, type OrientationGizmoAxisSpec } from "./orientationGizmoMath";
import type { VectorTuple } from "./viewMath";

const CAMERA_POSITION: VectorTuple = [0, 0, 5];
const BASE_CAMERA_ZOOM = 53;
const BASE_INNER_CANVAS_SIZE = 588;
const CONE_LENGTH = 0.24;
const CONE_RADIUS = 0.13;
const GIZMO_SCALE = 1.36;
const LABEL_DISTANCE = 1.3;
const LABEL_SCALE = 0.38;
const LABEL_FILL_COLOR = "#343434";
const LABEL_HALO_COLOR = "rgb(255 255 255)";
const ORIGIN_SPHERE_RADIUS = 0.13;
const SHAFT_LENGTH = 0.82;
const SHAFT_RADIUS = 0.055;
const ZOOM_PER_CANVAS_PIXEL = BASE_CAMERA_ZOOM / BASE_INNER_CANVAS_SIZE;
const Y_AXIS = new Vector3(0, 1, 0);

export function OrientationGizmo({
  cameraOrientationRef,
  cellVectors,
  className,
  style,
}: {
  cameraOrientationRef: CameraOrientationRef;
  cellVectors: VectorTuple[];
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      aria-hidden="true"
      className={className}
      style={{ ...style, overflow: "visible", pointerEvents: "none" }}
    >
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[240%] w-[240%] -translate-x-1/2 -translate-y-1/2">
        <Canvas
          orthographic
          camera={{
            position: CAMERA_POSITION,
            zoom: BASE_CAMERA_ZOOM,
            near: 0.1,
            far: 20,
          }}
          dpr={[1, 2]}
          gl={{ antialias: true, alpha: true }}
          style={{ pointerEvents: "none" }}
        >
          <ambientLight intensity={0.95} />
          <directionalLight position={[3, 4, 5]} intensity={1.35} />
          <directionalLight position={[-4, -3, 2]} intensity={0.35} />
          <ResponsiveGizmoCamera />
          <OrientationGizmoScene
            cameraOrientationRef={cameraOrientationRef}
            cellVectors={cellVectors}
          />
        </Canvas>
      </div>
    </div>
  );
}

function ResponsiveGizmoCamera() {
  const { camera, size } = useThree();

  useEffect(() => {
    if (!(camera instanceof OrthographicCamera)) {
      return;
    }

    camera.zoom = Math.min(size.width, size.height) * ZOOM_PER_CANVAS_PIXEL;
    camera.updateProjectionMatrix();
  }, [camera, size.height, size.width]);

  return null;
}

function OrientationGizmoScene({
  cameraOrientationRef,
  cellVectors,
}: {
  cameraOrientationRef: CameraOrientationRef;
  cellVectors: VectorTuple[];
}) {
  const axes = useMemo(() => computeOrientationGizmoAxes(cellVectors), [cellVectors]);
  const groupRef = useRef<Group | null>(null);
  const nextRotationRef = useRef(new Quaternion());

  useFrame(() => {
    const group = groupRef.current;
    if (!group) {
      return;
    }

    group.quaternion.copy(nextRotationRef.current.copy(cameraOrientationRef.current).invert());
  });

  return (
    <group ref={groupRef} scale={GIZMO_SCALE}>
      {axes.map((axis) => (
        <AxisArrow axis={axis} key={axis.label} />
      ))}
      <mesh renderOrder={4}>
        <sphereGeometry args={[ORIGIN_SPHERE_RADIUS, 40, 24]} />
        <meshStandardMaterial
          color="#f3f2ee"
          metalness={0}
          roughness={0.9}
        />
      </mesh>
    </group>
  );
}

function AxisArrow({ axis }: { axis: OrientationGizmoAxisSpec }) {
  const axisRotation = useMemo(
    () => new Quaternion().setFromUnitVectors(Y_AXIS, new Vector3(...axis.direction)),
    [axis.direction],
  );

  return (
    <group quaternion={axisRotation}>
      <mesh position={[0, SHAFT_LENGTH / 2, 0]}>
        <cylinderGeometry args={[SHAFT_RADIUS, SHAFT_RADIUS, SHAFT_LENGTH, 32]} />
        <meshStandardMaterial
          color={axis.color}
          metalness={0.12}
          opacity={0.9}
          roughness={0.84}
          transparent
        />
      </mesh>
      <mesh position={[0, SHAFT_LENGTH + CONE_LENGTH / 2, 0]}>
        <coneGeometry args={[CONE_RADIUS, CONE_LENGTH, 40]} />
        <meshStandardMaterial
          color={axis.color}
          metalness={0.12}
          opacity={0.9}
          roughness={0.82}
          transparent
        />
      </mesh>
      <AxisLabel label={axis.label} position={[0, LABEL_DISTANCE, 0]} />
    </group>
  );
}

function AxisLabel({
  label,
  position,
}: {
  label: string;
  position: VectorTuple;
}) {
  const texture = useMemo(() => createLabelTexture(label), [label]);

  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <sprite
      position={position}
      renderOrder={10}
      scale={[LABEL_SCALE, LABEL_SCALE, 1]}
    >
      <spriteMaterial
        depthTest={false}
        depthWrite={false}
        map={texture}
        transparent
      />
    </sprite>
  );
}

function createLabelTexture(label: string) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  canvas.width = 128;
  canvas.height = 128;

  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.font = "italic 500 76px Geist, 'Helvetica Neue', Arial, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineJoin = "round";
    context.miterLimit = 2;
    context.strokeStyle = LABEL_HALO_COLOR;
    context.lineWidth = 10;
    context.strokeText(label, canvas.width / 2, canvas.height / 2 + 2);
    context.fillStyle = LABEL_FILL_COLOR;
    context.fillText(label, canvas.width / 2, canvas.height / 2 + 2);
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;

  return texture;
}
