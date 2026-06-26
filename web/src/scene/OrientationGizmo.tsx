import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CanvasTexture,
  Color,
  Group,
  LinearFilter,
  OrthographicCamera,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from "three";

import type { CameraOrientationRef } from "./LatticeScene";
import { CameraHeadlight } from "./CameraHeadlight";
import {
  computeOrientationGizmoAxes,
  type OrientationGizmoAxisLabel,
  type OrientationGizmoAxisSpec,
} from "./orientationGizmoMath";
import { pickOrientationGizmoAxis } from "./orientationGizmoHitTesting";
import { PREVIEW_AMBIENT_LIGHT_INTENSITY } from "./renderAppearance";
import type { VectorTuple } from "./viewMath";

const CAMERA_POSITION: VectorTuple = [0, 0, 5];
const BASE_CAMERA_ZOOM = 53;
const BASE_INNER_CANVAS_SIZE = 588;
const CONE_LENGTH = 0.24;
const CONE_RADIUS = 0.13;
const GIZMO_SCALE = 1.36;
const GIZMO_CANVAS_SCALE = 2.4;
const AXIS_HIT_RADIUS_PX = 18;
const LABEL_DISTANCE = 1.3;
const LABEL_HIT_RADIUS_PX = 24;
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
  onAxisClick,
  style,
}: {
  cameraOrientationRef: CameraOrientationRef;
  cellVectors: VectorTuple[];
  className?: string;
  onAxisClick?: (axis: OrientationGizmoAxisLabel) => void;
  style?: CSSProperties;
}) {
  const visualCanvasRef = useRef<HTMLDivElement | null>(null);
  const hoveredAxisRef = useRef<OrientationGizmoAxisLabel | null>(null);
  const suppressNextClickRef = useRef(false);
  const clickSuppressionTimeoutRef = useRef<number | null>(null);
  const axes = useMemo(() => computeOrientationGizmoAxes(cellVectors), [cellVectors]);
  const [hoveredAxis, setHoveredAxis] = useState<OrientationGizmoAxisLabel | null>(null);

  const pickAxisFromPointer = useCallback(
    (event: PointerEvent) => {
      const rect = visualCanvasRef.current?.getBoundingClientRect();
      if (!rect) {
        return null;
      }

      return pickOrientationGizmoAxis({
        axes,
        cameraOrientation: cameraOrientationRef.current,
        config: {
          axisHitRadiusPx: AXIS_HIT_RADIUS_PX,
          axisStartDistance: ORIGIN_SPHERE_RADIUS * 1.25,
          axisTipDistance: SHAFT_LENGTH + CONE_LENGTH,
          gizmoScale: GIZMO_SCALE,
          labelDistance: LABEL_DISTANCE,
          labelHitRadiusPx: LABEL_HIT_RADIUS_PX,
          pixelsPerWorldUnit: Math.min(rect.width, rect.height) * ZOOM_PER_CANVAS_PIXEL,
        },
        pointer: {
          clientX: event.clientX,
          clientY: event.clientY,
        },
        rect,
      });
    },
    [axes, cameraOrientationRef],
  );

  const updateHoveredAxis = useCallback((nextAxis: OrientationGizmoAxisLabel | null) => {
    if (hoveredAxisRef.current === nextAxis) {
      return;
    }

    hoveredAxisRef.current = nextAxis;
    setHoveredAxis(nextAxis);
  }, []);

  useEffect(() => {
    if (!hoveredAxis) {
      return;
    }

    const previousBodyCursor = document.body.style.cursor;
    const previousDocumentCursor = document.documentElement.style.cursor;
    document.body.style.cursor = "pointer";
    document.documentElement.style.cursor = "pointer";
    return () => {
      document.body.style.cursor = previousBodyCursor;
      document.documentElement.style.cursor = previousDocumentCursor;
    };
  }, [hoveredAxis]);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      updateHoveredAxis(pickAxisFromPointer(event));
    }

    function handlePointerDown(event: PointerEvent) {
      const axis = pickAxisFromPointer(event);
      if (!axis) {
        return;
      }

      suppressNextClickRef.current = true;
      if (clickSuppressionTimeoutRef.current) {
        window.clearTimeout(clickSuppressionTimeoutRef.current);
      }
      clickSuppressionTimeoutRef.current = window.setTimeout(() => {
        suppressNextClickRef.current = false;
        clickSuppressionTimeoutRef.current = null;
      }, 750);
      event.preventDefault();
      event.stopImmediatePropagation();
      onAxisClick?.(axis);
    }

    function handleClick(event: MouseEvent) {
      if (!suppressNextClickRef.current) {
        return;
      }

      suppressNextClickRef.current = false;
      if (clickSuppressionTimeoutRef.current) {
        window.clearTimeout(clickSuppressionTimeoutRef.current);
        clickSuppressionTimeoutRef.current = null;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
    }

    function clearHover() {
      updateHoveredAxis(null);
    }

    document.addEventListener("pointermove", handlePointerMove, true);
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("click", handleClick, true);
    window.addEventListener("blur", clearHover);
    return () => {
      document.removeEventListener("pointermove", handlePointerMove, true);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("blur", clearHover);
      if (clickSuppressionTimeoutRef.current) {
        window.clearTimeout(clickSuppressionTimeoutRef.current);
      }
    };
  }, [onAxisClick, pickAxisFromPointer, updateHoveredAxis]);

  return (
    <div
      aria-label="Orientation gizmo"
      className={className}
      style={{ ...style, overflow: "visible", pointerEvents: "none" }}
    >
      <div
        className="pointer-events-none absolute left-1/2 top-1/2"
        ref={visualCanvasRef}
        style={{
          height: `${GIZMO_CANVAS_SCALE * 100}%`,
          transform: "translate(-50%, -50%)",
          width: `${GIZMO_CANVAS_SCALE * 100}%`,
        }}
      >
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
          <ambientLight intensity={PREVIEW_AMBIENT_LIGHT_INTENSITY} />
          <CameraHeadlight />
          <ResponsiveGizmoCamera />
          <OrientationGizmoScene
            axes={axes}
            cameraOrientationRef={cameraOrientationRef}
            hoveredAxis={hoveredAxis}
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
  axes,
  cameraOrientationRef,
  hoveredAxis,
}: {
  axes: OrientationGizmoAxisSpec[];
  cameraOrientationRef: CameraOrientationRef;
  hoveredAxis: OrientationGizmoAxisLabel | null;
}) {
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
        <AxisArrow
          axis={axis}
          hovered={axis.label === hoveredAxis}
          key={axis.label}
        />
      ))}
      <mesh renderOrder={4}>
        <sphereGeometry args={[ORIGIN_SPHERE_RADIUS, 40, 24]} />
        <meshLambertMaterial color="#f3f2ee" />
      </mesh>
    </group>
  );
}

function AxisArrow({
  axis,
  hovered,
}: {
  axis: OrientationGizmoAxisSpec;
  hovered: boolean;
}) {
  const axisRotation = useMemo(
    () => new Quaternion().setFromUnitVectors(Y_AXIS, new Vector3(...axis.direction)),
    [axis.direction],
  );
  const materialColor = hovered ? new Color(axis.color).lerp(new Color("#ffffff"), 0.3) : axis.color;
  const emissiveColor = hovered ? new Color(axis.color).lerp(new Color("#ffffff"), 0.5) : "#000000";

  return (
    <group quaternion={axisRotation}>
      <mesh position={[0, SHAFT_LENGTH / 2, 0]}>
        <cylinderGeometry args={[SHAFT_RADIUS, SHAFT_RADIUS, SHAFT_LENGTH, 32]} />
        <meshLambertMaterial
          color={materialColor}
          emissive={emissiveColor}
          emissiveIntensity={hovered ? 0.35 : 0}
        />
      </mesh>
      <mesh position={[0, SHAFT_LENGTH + CONE_LENGTH / 2, 0]}>
        <coneGeometry args={[CONE_RADIUS, CONE_LENGTH, 40]} />
        <meshLambertMaterial
          color={materialColor}
          emissive={emissiveColor}
          emissiveIntensity={hovered ? 0.35 : 0}
        />
      </mesh>
      <AxisLabel hovered={hovered} label={axis.label} position={[0, LABEL_DISTANCE, 0]} />
    </group>
  );
}

function AxisLabel({
  hovered,
  label,
  position,
}: {
  hovered: boolean;
  label: string;
  position: VectorTuple;
}) {
  const texture = useMemo(() => createLabelTexture(label, hovered), [hovered, label]);

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

function createLabelTexture(label: string, hovered: boolean) {
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
    context.fillStyle = hovered ? "#111111" : LABEL_FILL_COLOR;
    context.fillText(label, canvas.width / 2, canvas.height / 2 + 2);
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;

  return texture;
}
