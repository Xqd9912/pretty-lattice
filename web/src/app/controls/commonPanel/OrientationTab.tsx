import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Check, Info, RotateCcw } from "lucide-react";
import {
  Color,
  type Mesh,
  type MeshBasicMaterial,
  Quaternion,
  Vector3,
} from "three";
import {
  type CSSProperties,
  type ChangeEvent,
  type FocusEvent,
  Fragment,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { AngleSlider } from "@/components/ui/angle-slider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import {
  computeCrystalCameraVectors,
  normalizeRollDegrees,
  parseVectorCoefficients,
  stateFromViewVectors,
} from "../../../scene/crystalCamera";
import type {
  CrystalCameraPrimaryDirection,
  CrystalCameraScreenDirection,
  CrystalCameraState,
  VectorTuple,
} from "../../../model";
import {
  TOOL_ICON_BUTTON_CLASS,
  TOOL_ICON_BUTTON_RESET_FEEDBACK_A_CLASS,
  TOOL_ICON_BUTTON_RESET_FEEDBACK_B_CLASS,
} from "../../surface";
import {
  TOOL_ICON_BUTTON_FEEDBACK_ANIMATION_MS,
  type ToolButtonFeedbackPhase,
} from "./controlFeedback";
import { COMMON_PANEL_SECTION_TITLE_TEXT_CLASS } from "./styles";

type ManualButtonFeedbackTarget = "apply" | "reset";

export function OrientationTabContent({
  cameraState,
  cellVectors,
  onCameraPrimaryChange,
  onCameraRollPreviewChange,
  onCameraRollPreviewStart,
  onCameraRollChange,
  onCameraSecondaryChange,
  onCameraStateChange,
}: {
  cameraState: CrystalCameraState;
  cellVectors: VectorTuple[];
  onCameraPrimaryChange: (primary: CrystalCameraPrimaryDirection) => void;
  onCameraRollPreviewChange: (rollDegrees: number) => void;
  onCameraRollPreviewStart: () => void;
  onCameraRollChange: (rollDegrees: number) => void;
  onCameraSecondaryChange: (secondary: CrystalCameraScreenDirection) => void;
  onCameraStateChange: (cameraState: CrystalCameraState) => void;
}) {
  const [rollResetFeedbackPhase, setRollResetFeedbackPhase] =
    useState<ToolButtonFeedbackPhase>(null);
  const rollResetFeedbackTickRef = useRef(0);
  const rollResetFeedbackTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (rollResetFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(rollResetFeedbackTimeoutRef.current);
      }
    };
  }, []);

  function handleResetRollClick() {
    if (rollResetFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(rollResetFeedbackTimeoutRef.current);
    }

    rollResetFeedbackTickRef.current += 1;
    setRollResetFeedbackPhase(rollResetFeedbackTickRef.current % 2 === 0 ? "b" : "a");
    rollResetFeedbackTimeoutRef.current = window.setTimeout(() => {
      setRollResetFeedbackPhase(null);
      rollResetFeedbackTimeoutRef.current = null;
    }, TOOL_ICON_BUTTON_FEEDBACK_ANIMATION_MS);
    onCameraRollChange(0);
  }

  return (
    <div className="flex flex-col" data-camera-tab-keepalive="">
      <section aria-labelledby="camera-axis-roll-label" className="mb-0.5 grid gap-1.5 px-1.5 pb-1">
        <div className="flex h-7 items-center justify-between gap-2">
          <h2
            id="camera-axis-roll-label"
            className={cn(COMMON_PANEL_SECTION_TITLE_TEXT_CLASS, "leading-tight text-muted-foreground")}
          >
            Primary Axis
          </h2>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Reset roll"
            className={cn(
              TOOL_ICON_BUTTON_CLASS,
              rollResetFeedbackPhase === "a" ? TOOL_ICON_BUTTON_RESET_FEEDBACK_A_CLASS : null,
              rollResetFeedbackPhase === "b" ? TOOL_ICON_BUTTON_RESET_FEEDBACK_B_CLASS : null,
            )}
            onClick={handleResetRollClick}
          >
            <RotateCcw aria-hidden="true" />
          </Button>
        </div>
        <div className="-mt-2 grid min-h-[124px] grid-cols-2 items-center gap-3">
          <div className="flex min-w-0 translate-x-2 items-center justify-center">
            <ScreenAxisChooser
              ariaLabelledBy="camera-axis-roll-label"
              value={cameraState.primary}
              onValueChange={onCameraPrimaryChange}
            />
          </div>

          <RollControl
            className="translate-x-1"
            value={cameraState.rollDegrees}
            onPreviewValueChange={onCameraRollPreviewChange}
            onPreviewStart={onCameraRollPreviewStart}
            onValueChange={onCameraRollChange}
          />
        </div>
      </section>

      <Separator />

      <VectorEditor
        cameraState={cameraState}
        cellVectors={cellVectors}
        onCameraSecondaryChange={onCameraSecondaryChange}
        onCameraStateChange={onCameraStateChange}
      />
    </div>
  );
}

const SCREEN_AXIS_OPTIONS: readonly {
  direction: CrystalCameraScreenDirection;
  letter: "X" | "Y" | "Z";
  label: "Right" | "Up" | "Out";
}[] = [
  { direction: "right", letter: "X", label: "Right" },
  { direction: "upward", letter: "Y", label: "Up" },
  { direction: "outward", letter: "Z", label: "Out" },
];

function screenAxisOption(direction: CrystalCameraScreenDirection) {
  return SCREEN_AXIS_OPTIONS.find((option) => option.direction === direction)!;
}

function screenAxisLabel(direction: CrystalCameraScreenDirection): string {
  const option = screenAxisOption(direction);
  return option.letter.toLowerCase();
}

const SCREEN_AXIS_CAMERA_FOV = 42.5;
const SCREEN_AXIS_CAMERA_POSITION: VectorTuple = [0.558, 0.471, 6.139];
const SCREEN_AXIS_CAMERA_ROLL = 0.0149;
const SCREEN_AXIS_GIZMO_POSITION: VectorTuple = [-0.911, -0.691, 0.061];
const SCREEN_AXIS_ARROW_CONE_LENGTH = 0.31;
const SCREEN_AXIS_ARROW_CONE_RADIUS = 0.152;
const SCREEN_AXIS_ARROW_LENGTH = 2.27;
const SCREEN_AXIS_ARROW_RADIUS = 0.083;
const SCREEN_AXIS_ARROW_SELECTED_RADIUS = 0.101;
const SCREEN_AXIS_ORIGIN_RADIUS = 0.1;
const SCREEN_AXIS_SELECTED_COLOR = "#505050";
const SCREEN_AXIS_HOVER_COLOR = "#a0a0a0";
const SCREEN_AXIS_MUTED_COLOR = "#d6d6d6";
const SCREEN_AXIS_TRANSITION_SECONDS = 0.09;
const SCREEN_AXIS_OUTWARD_ARROW_LENGTH = 2.56;
const SCREEN_AXIS_OUTWARD_CONE_RADIUS = 0.1;
const SCREEN_AXIS_OUTWARD_SHAFT_TIP_RADIUS_SCALE = 0.6;
const SCREEN_AXIS_Y = new Vector3(0, 1, 0);
const SCREEN_AXIS_GIZMO_AXES: readonly {
  direction: CrystalCameraScreenDirection;
  label: "x" | "y" | "z";
  vector: VectorTuple;
}[] = [
  { direction: "right", label: "x", vector: [1, 0, 0] },
  { direction: "upward", label: "y", vector: [0, 1, 0] },
  { direction: "outward", label: "z", vector: [0, 0, 1] },
];

const SCREEN_AXIS_HITBOX_ORIGIN = [4.05, 3.8] as const;
const SCREEN_AXIS_HITBOX_START_WIDTH_REM = 1.3;
const SCREEN_AXIS_HITBOXES: Record<
  CrystalCameraScreenDirection,
  {
    angleOffset: number;
    endWidth: number;
    target: readonly [number, number];
  }
> = {
  outward: { angleOffset: -10, endWidth: 3, target: [0.3, 6.95] },
  right: { angleOffset: 8, endWidth: 3.1, target: [9.65, 4.55] },
  upward: { angleOffset: 0, endWidth: 2.7, target: [4.0, -0.25] },
};

function screenAxisTransitionAlpha(deltaSeconds: number) {
  return 1 - Math.pow(0.001, deltaSeconds / SCREEN_AXIS_TRANSITION_SECONDS);
}

function screenAxisColorDistanceSquared(a: Color, b: Color) {
  const red = a.r - b.r;
  const green = a.g - b.g;
  const blue = a.b - b.b;
  return red * red + green * green + blue * blue;
}

function screenAxisLerpScale(current: number, target: number, alpha: number) {
  const next = current + (target - current) * alpha;
  return Math.abs(next - target) < 0.001 ? target : next;
}

function screenAxisHitboxStyle(direction: CrystalCameraScreenDirection): CSSProperties {
  const hitbox = SCREEN_AXIS_HITBOXES[direction];
  const [originX, originY] = SCREEN_AXIS_HITBOX_ORIGIN;
  const [targetX, targetY] = hitbox.target;
  const deltaX = targetX - originX;
  const deltaY = targetY - originY;
  const length = Math.hypot(deltaX, deltaY);
  const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI) + hitbox.angleOffset;
  const startInset = 50 - (SCREEN_AXIS_HITBOX_START_WIDTH_REM / hitbox.endWidth) * 50;

  return {
    clipPath: `polygon(0 ${startInset}%, 100% 0, 100% 100%, 0 ${100 - startInset}%)`,
    height: `${hitbox.endWidth}rem`,
    left: `${originX}rem`,
    top: `${originY}rem`,
    transform: `translateY(-50%) rotate(${angle}deg)`,
    transformOrigin: "left center",
    width: `${length}rem`,
  };
}

function ScreenAxisChooser({
  ariaLabelledBy,
  onValueChange,
  value,
}: {
  ariaLabelledBy: string;
  onValueChange: (value: CrystalCameraPrimaryDirection) => void;
  value: CrystalCameraPrimaryDirection;
}) {
  const [hoveredAxis, setHoveredAxis] = useState<CrystalCameraScreenDirection | null>(null);

  return (
    <div
      role="group"
      aria-labelledby={ariaLabelledBy}
      className="relative h-[120px] w-[10.75rem] select-none"
      onMouseLeave={() => setHoveredAxis(null)}
    >
      <Canvas
        aria-hidden="true"
        camera={{
          fov: SCREEN_AXIS_CAMERA_FOV,
          position: SCREEN_AXIS_CAMERA_POSITION,
          near: 0.1,
          far: 30,
        }}
        dpr={[1, 2]}
        frameloop="demand"
        gl={{ antialias: true, alpha: true }}
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{ pointerEvents: "none" }}
      >
        <ScreenAxisCameraSetup />
        <ScreenAxisGizmoScene
          hoveredAxis={hoveredAxis}
          selectedAxis={value}
        />
      </Canvas>
      <ScreenAxisOverlayLabel
        direction="upward"
        hoveredAxis={hoveredAxis}
        selectedAxis={value}
        className="left-[4.325rem] top-[0.65rem]"
      >
        y
      </ScreenAxisOverlayLabel>
      <ScreenAxisOverlayLabel
        direction="right"
        hoveredAxis={hoveredAxis}
        selectedAxis={value}
        className="left-[7.8rem] top-[5.15rem]"
      >
        x
      </ScreenAxisOverlayLabel>
      <ScreenAxisOverlayLabel
        direction="outward"
        hoveredAxis={hoveredAxis}
        selectedAxis={value}
        className="left-[1.6rem] top-[6.375rem]"
      >
        z
      </ScreenAxisOverlayLabel>
      <button
        type="button"
        aria-label="X Right"
        aria-pressed={value === "right"}
        className="absolute z-10 cursor-pointer outline-none focus-visible:ring-[2px] focus-visible:ring-ring/25"
        style={screenAxisHitboxStyle("right")}
        onClick={() => onValueChange("right")}
        onMouseEnter={() => setHoveredAxis("right")}
        onMouseLeave={() => setHoveredAxis(null)}
      />
      <button
        type="button"
        aria-label="Y Up"
        aria-pressed={value === "upward"}
        className="absolute z-10 cursor-pointer outline-none focus-visible:ring-[2px] focus-visible:ring-ring/25"
        style={screenAxisHitboxStyle("upward")}
        onClick={() => onValueChange("upward")}
        onMouseEnter={() => setHoveredAxis("upward")}
        onMouseLeave={() => setHoveredAxis(null)}
      />
      <button
        type="button"
        aria-label="Z Out"
        aria-pressed={value === "outward"}
        className="absolute z-10 cursor-pointer outline-none focus-visible:ring-[2px] focus-visible:ring-ring/25"
        style={screenAxisHitboxStyle("outward")}
        onClick={() => onValueChange("outward")}
        onMouseEnter={() => setHoveredAxis("outward")}
        onMouseLeave={() => setHoveredAxis(null)}
      />
    </div>
  );
}

function ScreenAxisOverlayLabel({
  children,
  className,
  direction,
  hoveredAxis,
  selectedAxis,
}: {
  children: ReactNode;
  className: string;
  direction: CrystalCameraScreenDirection;
  hoveredAxis: CrystalCameraScreenDirection | null;
  selectedAxis: CrystalCameraPrimaryDirection;
}) {
  const isEmphasized = direction === selectedAxis || direction === hoveredAxis;

  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute z-[5] select-none text-xs font-semibold italic leading-none transition-colors",
        isEmphasized ? "text-foreground" : "text-muted-foreground/55",
        className,
      )}
    >
      {children}
    </span>
  );
}

function ScreenAxisCameraSetup() {
  const { camera } = useThree();

  useEffect(() => {
    const cameraPosition = new Vector3(...SCREEN_AXIS_CAMERA_POSITION);
    const viewDirection = cameraPosition.multiplyScalar(-1).normalize();
    const cameraUp = new Vector3(0, 1, 0);

    cameraUp
      .sub(viewDirection.clone().multiplyScalar(cameraUp.dot(viewDirection)))
      .normalize()
      .applyAxisAngle(viewDirection, SCREEN_AXIS_CAMERA_ROLL);
    camera.up.copy(cameraUp);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
  }, [camera]);

  return null;
}

function ScreenAxisGizmoScene({
  hoveredAxis,
  selectedAxis,
}: {
  hoveredAxis: CrystalCameraScreenDirection | null;
  selectedAxis: CrystalCameraPrimaryDirection;
}) {
  return (
    <group position={SCREEN_AXIS_GIZMO_POSITION}>
      {SCREEN_AXIS_GIZMO_AXES.map((axis) => {
        const hovered = axis.direction === hoveredAxis;
        const selected = axis.direction === selectedAxis;

        return (
          <ScreenAxisArrow
            axis={axis}
            hovered={hovered}
            key={axis.direction}
            selected={selected}
          />
        );
      })}
      <mesh renderOrder={20}>
        <sphereGeometry args={[SCREEN_AXIS_ORIGIN_RADIUS * 1.35, 32, 16]} />
        <meshBasicMaterial color="#171717" depthTest={false} />
      </mesh>
      <mesh renderOrder={21}>
        <sphereGeometry args={[SCREEN_AXIS_ORIGIN_RADIUS, 32, 16]} />
        <meshBasicMaterial color="#f7f7f5" depthTest={false} />
      </mesh>
    </group>
  );
}

function ScreenAxisArrow({
  axis,
  hovered,
  selected,
}: {
  axis: (typeof SCREEN_AXIS_GIZMO_AXES)[number];
  hovered: boolean;
  selected: boolean;
}) {
  const shaftMaterialRef = useRef<MeshBasicMaterial | null>(null);
  const coneMaterialRef = useRef<MeshBasicMaterial | null>(null);
  const shaftMeshRef = useRef<Mesh | null>(null);
  const coneMeshRef = useRef<Mesh | null>(null);
  const invalidate = useThree((state) => state.invalidate);
  const axisDirection = useMemo(() => new Vector3(...axis.vector).normalize(), [axis.vector]);
  const axisRotation = useMemo(
    () => new Quaternion().setFromUnitVectors(SCREEN_AXIS_Y, axisDirection),
    [axisDirection],
  );
  const isHighlighted = selected || hovered;
  const axisColor = selected
    ? SCREEN_AXIS_SELECTED_COLOR
    : hovered
      ? SCREEN_AXIS_HOVER_COLOR
      : SCREEN_AXIS_MUTED_COLOR;
  const targetColor = useMemo(() => new Color(axisColor), [axisColor]);
  const initialAxisColorRef = useRef(axisColor);
  const shaftLength = axis.direction === "outward"
    ? SCREEN_AXIS_OUTWARD_ARROW_LENGTH
    : SCREEN_AXIS_ARROW_LENGTH;
  const shaftRadius = SCREEN_AXIS_ARROW_SELECTED_RADIUS;
  const targetShaftScale = isHighlighted
    ? 1
    : SCREEN_AXIS_ARROW_RADIUS / SCREEN_AXIS_ARROW_SELECTED_RADIUS;
  const initialShaftScaleRef = useRef(targetShaftScale);
  const shaftTopRadius = axis.direction === "outward"
    ? shaftRadius * SCREEN_AXIS_OUTWARD_SHAFT_TIP_RADIUS_SCALE
    : shaftRadius;
  const shaftBottomRadius = shaftRadius;
  const coneLength = SCREEN_AXIS_ARROW_CONE_LENGTH;
  const coneRadius = axis.direction === "outward"
    ? SCREEN_AXIS_OUTWARD_CONE_RADIUS
    : SCREEN_AXIS_ARROW_CONE_RADIUS;
  const targetConeScale = isHighlighted ? 1 : 1 / 1.04;
  const initialConeScaleRef = useRef(targetConeScale);

  useEffect(() => {
    invalidate();
  }, [invalidate, targetColor, targetConeScale, targetShaftScale]);

  useFrame((_, delta) => {
    const alpha = screenAxisTransitionAlpha(delta);
    let shouldContinue = false;

    for (const material of [shaftMaterialRef.current, coneMaterialRef.current]) {
      if (material === null) {
        continue;
      }

      if (screenAxisColorDistanceSquared(material.color, targetColor) < 0.00002) {
        material.color.copy(targetColor);
        continue;
      }

      material.color.lerp(targetColor, alpha);
      shouldContinue = true;
    }

    const shaftMesh = shaftMeshRef.current;
    if (shaftMesh !== null) {
      const nextScale = screenAxisLerpScale(shaftMesh.scale.x, targetShaftScale, alpha);
      shaftMesh.scale.set(nextScale, 1, nextScale);
      shouldContinue ||= nextScale !== targetShaftScale;
    }

    const coneMesh = coneMeshRef.current;
    if (coneMesh !== null) {
      const nextScale = screenAxisLerpScale(coneMesh.scale.x, targetConeScale, alpha);
      coneMesh.scale.set(nextScale, 1, nextScale);
      shouldContinue ||= nextScale !== targetConeScale;
    }

    if (shouldContinue) {
      invalidate();
    }
  });

  return (
    <group quaternion={axisRotation}>
      <mesh
        ref={shaftMeshRef}
        position={[0, shaftLength / 2, 0]}
        renderOrder={isHighlighted ? 8 : 2}
        scale={[initialShaftScaleRef.current, 1, initialShaftScaleRef.current]}
      >
        <cylinderGeometry
          args={[shaftTopRadius, shaftBottomRadius, shaftLength, 24]}
        />
        <meshBasicMaterial ref={shaftMaterialRef} color={initialAxisColorRef.current} />
      </mesh>
      <mesh
        ref={coneMeshRef}
        position={[0, shaftLength + coneLength / 2, 0]}
        renderOrder={isHighlighted ? 9 : 3}
        scale={[initialConeScaleRef.current, 1, initialConeScaleRef.current]}
      >
        <coneGeometry
          args={[
            coneRadius * 1.04,
            coneLength,
            32,
          ]}
        />
        <meshBasicMaterial ref={coneMaterialRef} color={initialAxisColorRef.current} />
      </mesh>
    </group>
  );
}

function RollControl({
  className,
  onPreviewStart,
  onPreviewValueChange,
  onValueChange,
  value,
}: {
  className?: string;
  onPreviewStart: () => void;
  onPreviewValueChange: (value: number) => void;
  onValueChange: (value: number) => void;
  value: number;
}) {
  const committedValue = toPositiveRollDegrees(value);
  const [isDragging, setIsDragging] = useState(false);
  const [draftValue, setDraftValue] = useState(committedValue);
  const displayedValue = isDragging ? draftValue : committedValue;
  const [valueText, setValueText] = useState(formatRollValue(committedValue));
  const [isValueFocused, setIsValueFocused] = useState(false);
  const [hasValueEdited, setHasValueEdited] = useState(false);
  const lastPreviewValueRef = useRef<number | null>(null);
  const valueTextAtFocusRef = useRef(valueText);
  const displayedValueText = isValueFocused && !hasValueEdited ? "" : valueText;

  useEffect(() => {
    if (isDragging) {
      return;
    }

    setDraftValue(committedValue);
    setValueText(formatRollValue(committedValue));
  }, [committedValue, isDragging]);

  function commitValueText(nextText = valueText) {
    const nextValue = parseRollInput(nextText);
    if (nextValue === null) {
      setValueText(formatRollValue(displayedValue));
      return;
    }

    const normalizedValue = toPositiveRollDegrees(nextValue);
    setDraftValue(normalizedValue);
    setValueText(formatRollValue(normalizedValue));
    onValueChange(normalizedValue);
  }

  function handleValueFocus() {
    valueTextAtFocusRef.current = valueText;
    setIsValueFocused(true);
    setHasValueEdited(false);
  }

  function handleValueBlur(event: FocusEvent<HTMLInputElement>) {
    const wasEdited = hasValueEdited;
    setIsValueFocused(false);
    setHasValueEdited(false);

    if (!wasEdited) {
      return;
    }

    if (event.currentTarget.value.trim() === "") {
      setValueText(valueTextAtFocusRef.current);
      return;
    }

    commitValueText(event.currentTarget.value);
  }

  function handleValueChange(event: ChangeEvent<HTMLInputElement>) {
    setHasValueEdited(true);
    setValueText(event.target.value);
  }

  function handleSliderInteractionStart() {
    setIsDragging(true);
    setDraftValue(committedValue);
    setValueText(formatRollValue(committedValue));
    lastPreviewValueRef.current = null;
    onPreviewStart();
  }

  function handleSliderPreviewChange(nextValue: number) {
    const normalizedValue = toPositiveRollDegrees(nextValue);
    if (Object.is(normalizedValue, lastPreviewValueRef.current)) {
      return;
    }

    lastPreviewValueRef.current = normalizedValue;
    setDraftValue(normalizedValue);
    setValueText(formatRollValue(normalizedValue));
    onPreviewValueChange(normalizedValue);
  }

  function handleSliderCommit(nextValue: number) {
    const normalizedValue = toPositiveRollDegrees(nextValue);
    setDraftValue(normalizedValue);
    setValueText(formatRollValue(normalizedValue));
    setIsDragging(false);
    lastPreviewValueRef.current = null;
    onValueChange(normalizedValue);
  }

  function handleValueKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      if (event.currentTarget.value.trim() === "") {
        setValueText(valueTextAtFocusRef.current);
      } else {
        commitValueText(event.currentTarget.value);
      }
      event.currentTarget.blur();
      return;
    }

    if (event.key === "Escape") {
      setValueText(valueTextAtFocusRef.current);
      event.currentTarget.blur();
      return;
    }

    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const normalizedValue = toPositiveRollDegrees(
        displayedValue + (event.key === "ArrowUp" ? 1 : -1),
      );
      setHasValueEdited(true);
      setValueText(formatRollValue(normalizedValue));
      onValueChange(normalizedValue);
    }
  }

  return (
    <section
      aria-labelledby="camera-roll-label"
      className={cn(
        "relative flex min-h-[116px] min-w-0 items-center justify-center",
        className,
      )}
    >
      <h2 id="camera-roll-label" className="sr-only">
        Roll
      </h2>
      <AngleSlider
        aria-label="Roll"
        className="size-[116px]"
        value={displayedValue}
        onInteractionStart={handleSliderInteractionStart}
        onValueChange={handleSliderPreviewChange}
        onValueCommit={handleSliderCommit}
      />
      <label className="absolute left-1/2 top-1/2 z-10 inline-flex h-5 min-w-[1.45rem] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[4px] border border-transparent bg-transparent px-1 transition-[background-color,border-color,box-shadow] duration-150 hover:border-foreground/8 hover:bg-background/55 focus-within:border-ring/15 focus-within:bg-background/70 focus-within:shadow-[0_0_0_0.5px_color-mix(in_srgb,var(--ring)_14%,transparent)]">
        <span className="sr-only">Roll value</span>
        <input
          type="text"
          inputMode="decimal"
          value={displayedValueText}
          aria-label="Roll value"
          className="h-full min-w-[1ch] border-0 bg-transparent px-0 text-right font-mono text-xs font-normal leading-none tabular-nums outline-none focus-visible:ring-0"
          style={{ width: rollValueInputWidth(displayedValueText) }}
          onBlur={handleValueBlur}
          onChange={handleValueChange}
          onFocus={handleValueFocus}
          onKeyDown={handleValueKeyDown}
        />
        <span
          aria-hidden="true"
          data-slot="roll-degree-symbol"
          className="pointer-events-none -ml-px select-none font-mono text-xs font-normal leading-none text-foreground"
        >
          °
        </span>
      </label>
    </section>
  );
}

function VectorEditor({
  cameraState,
  cellVectors,
  onCameraSecondaryChange,
  onCameraStateChange,
}: {
  cameraState: CrystalCameraState;
  cellVectors: VectorTuple[];
  onCameraSecondaryChange: (secondary: CrystalCameraScreenDirection) => void;
  onCameraStateChange: (cameraState: CrystalCameraState) => void;
}) {
  const currentDraft = useMemo(() => draftFromCameraState(cameraState), [cameraState]);
  const [draft, setDraft] = useState(currentDraft);
  const [isDirty, setIsDirty] = useState(false);
  const [buttonFeedbackPhase, setButtonFeedbackPhase] = useState<
    Record<ManualButtonFeedbackTarget, ToolButtonFeedbackPhase>
  >({
    apply: null,
    reset: null,
  });
  const buttonFeedbackTickRef = useRef<Record<ManualButtonFeedbackTarget, number>>({
    apply: 0,
    reset: 0,
  });
  const buttonFeedbackTimeoutRef = useRef<
    Record<ManualButtonFeedbackTarget, number | null>
  >({
    apply: null,
    reset: null,
  });

  useEffect(() => {
    if (!isDirty) {
      setDraft(currentDraft);
    }
  }, [currentDraft, isDirty]);

  useEffect(() => {
    return () => {
      for (const timeout of Object.values(buttonFeedbackTimeoutRef.current)) {
        if (timeout !== null) {
          window.clearTimeout(timeout);
        }
      }
    };
  }, []);

  function triggerButtonFeedback(target: ManualButtonFeedbackTarget) {
    const currentTimeout = buttonFeedbackTimeoutRef.current[target];
    if (currentTimeout !== null) {
      window.clearTimeout(currentTimeout);
    }

    buttonFeedbackTickRef.current[target] += 1;
    const nextPhase = buttonFeedbackTickRef.current[target] % 2 === 0 ? "b" : "a";
    setButtonFeedbackPhase((currentPhase) => ({
      ...currentPhase,
      [target]: nextPhase,
    }));
    buttonFeedbackTimeoutRef.current[target] = window.setTimeout(() => {
      setButtonFeedbackPhase((currentPhase) => ({
        ...currentPhase,
        [target]: null,
      }));
      buttonFeedbackTimeoutRef.current[target] = null;
    }, TOOL_ICON_BUTTON_FEEDBACK_ANIMATION_MS);
  }

  function updateDraft(row: "direct" | "reciprocal", index: number, value: string) {
    setIsDirty(true);
    setDraft((currentDraftState) => ({
      ...currentDraftState,
      [row]: currentDraftState[row].map((entry, entryIndex) =>
        entryIndex === index ? value : entry,
      ) as [string, string, string],
    }));
  }

  function resetDraft() {
    setDraft(currentDraft);
    setIsDirty(false);
  }

  function handleResetDraftClick() {
    triggerButtonFeedback("reset");
    resetDraft();
  }

  function applyDraft() {
    const direct = parseVectorCoefficients(draft.direct);
    const reciprocal = parseVectorCoefficients(draft.reciprocal);
    if (!direct || !reciprocal) {
      resetDraft();
      return;
    }

    const cameraVectors = computeCrystalCameraVectors(cellVectors, {
      ...cameraState,
      direct,
      reciprocal,
    });
    const nextState = stateFromViewVectors(
      cellVectors,
      cameraState.primary,
      cameraState.secondary,
      cameraVectors.up,
      cameraVectors.outward,
    );

    setIsDirty(false);
    onCameraStateChange(nextState);
  }

  function handleApplyDraftClick() {
    triggerButtonFeedback("apply");
    applyDraft();
  }

  function handleFieldKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.currentTarget.blur();
      applyDraft();
      return;
    }

    if (event.key === "Escape") {
      resetDraft();
      event.currentTarget.blur();
    }
  }

  const secondaryOptions = SCREEN_AXIS_OPTIONS.filter(
    (option) => option.direction !== cameraState.primary,
  );
  const vectorRows = [
    {
      basisLabels: ["a", "b", "c"],
      draft: draft.direct,
      isPrimaryAxis: true,
      label: screenAxisLabel(cameraState.primary),
      row: "direct",
    },
    {
      basisLabels: ["a*", "b*", "c*"],
      draft: draft.reciprocal,
      isPrimaryAxis: false,
      label: screenAxisLabel(cameraState.secondary),
      row: "reciprocal",
      secondaryOptions,
    },
  ] as const;

  return (
    <section aria-labelledby="camera-manual-label" className="mt-1 grid gap-1.5 px-1.5 pb-1">
      <div className="flex h-7 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          <h2
            id="camera-manual-label"
            className={cn(COMMON_PANEL_SECTION_TITLE_TEXT_CLASS, "leading-tight text-muted-foreground")}
          >
            Manual input
          </h2>
          <Tooltip delayDuration={650}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Manual input rules"
                className="inline-flex size-4 items-center justify-center rounded-md text-muted-foreground/75 outline-none transition-colors hover:text-foreground focus-visible:ring-[2px] focus-visible:ring-ring/30"
              >
                <Info aria-hidden="true" className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-56">
              The two vectors should be orthogonal. If not, primary is kept and secondary is
              orthogonalized.
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Reset vectors draft"
            className={cn(
              TOOL_ICON_BUTTON_CLASS,
              buttonFeedbackPhase.reset === "a" ? TOOL_ICON_BUTTON_RESET_FEEDBACK_A_CLASS : null,
              buttonFeedbackPhase.reset === "b" ? TOOL_ICON_BUTTON_RESET_FEEDBACK_B_CLASS : null,
            )}
            onClick={handleResetDraftClick}
          >
            <RotateCcw aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Apply vectors"
            className={cn(
              TOOL_ICON_BUTTON_CLASS,
              buttonFeedbackPhase.apply === "a" ? TOOL_ICON_BUTTON_RESET_FEEDBACK_A_CLASS : null,
              buttonFeedbackPhase.apply === "b" ? TOOL_ICON_BUTTON_RESET_FEEDBACK_B_CLASS : null,
            )}
            onClick={handleApplyDraftClick}
          >
            <Check aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div className="grid gap-1">
        {vectorRows.map((row) => (
          <VectorEditorRow
            basisLabels={row.basisLabels}
            isPrimaryAxis={row.isPrimaryAxis}
            key={row.row}
            label={row.label}
            secondaryOptions={"secondaryOptions" in row ? row.secondaryOptions : undefined}
            secondaryValue={"secondaryOptions" in row ? cameraState.secondary : undefined}
            values={row.draft}
            onSecondaryChange={onCameraSecondaryChange}
            onValueChange={(index, value) => updateDraft(row.row, index, value)}
            onKeyDown={handleFieldKeyDown}
          />
        ))}
      </div>
    </section>
  );
}

const VECTOR_AXIS_TOKEN_CLASS =
  "inline-flex h-6 w-7 items-center justify-center rounded-md px-0 text-xs font-bold italic leading-none shadow-sm";

function VectorEditorRow({
  basisLabels,
  isPrimaryAxis,
  label,
  onKeyDown,
  onSecondaryChange,
  secondaryOptions,
  secondaryValue,
  onValueChange,
  values,
}: {
  basisLabels: readonly string[];
  isPrimaryAxis: boolean;
  label: string;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onSecondaryChange: (secondary: CrystalCameraScreenDirection) => void;
  secondaryOptions?: readonly {
    direction: CrystalCameraScreenDirection;
    letter: "X" | "Y" | "Z";
    label: "Right" | "Up" | "Out";
  }[];
  secondaryValue?: CrystalCameraScreenDirection;
  onValueChange: (index: number, value: string) => void;
  values: readonly string[];
}) {
  const secondaryToggleOption = secondaryOptions?.find(
    (option) => option.direction === secondaryValue,
  );
  const nextSecondaryDirection = secondaryOptions?.find(
    (option) => option.direction !== secondaryValue,
  )?.direction;
  const labelContent = isPrimaryAxis || !secondaryToggleOption || !nextSecondaryDirection ? (
    <span
      className={cn(
        VECTOR_AXIS_TOKEN_CLASS,
        isPrimaryAxis
          ? "text-white"
          : "bg-muted text-muted-foreground",
      )}
      style={isPrimaryAxis ? { backgroundColor: SCREEN_AXIS_SELECTED_COLOR } : undefined}
    >
      {label}
    </span>
  ) : (
    <button
      type="button"
      aria-label={`${secondaryToggleOption.letter.toLowerCase()} secondary axis`}
      className={cn(
        VECTOR_AXIS_TOKEN_CLASS,
        "bg-muted text-muted-foreground transition-[background-color,color,box-shadow] hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-[2px] focus-visible:ring-ring/25",
      )}
      onClick={() => onSecondaryChange(nextSecondaryDirection)}
    >
      {secondaryToggleOption.letter.toLowerCase()}
    </button>
  );

  return (
    <div
      className="relative -mx-1 grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-1 rounded-md px-1 py-1"
      data-camera-vector-row={label.toLowerCase().replace(/\s+/g, "-")}
      data-primary-axis={isPrimaryAxis ? "true" : undefined}
    >
      {labelContent}
      <div className="grid min-w-0 grid-cols-[2.75rem_0.8rem_0.45rem_2.75rem_0.8rem_0.45rem_2.75rem_0.8rem] items-center gap-x-0.5">
        {basisLabels.map((basisLabel, index) => (
          <Fragment key={basisLabel}>
            <label className="contents">
              <VectorCoefficientInput
                accessibleLabel={`${label} ${basisLabel}`}
                value={values[index] ?? "0.00"}
                onValueChange={(value) => onValueChange(index, value)}
                onKeyDown={onKeyDown}
              />
              <span className="shrink-0 text-[0.68rem] font-semibold italic leading-none text-muted-foreground">
                {basisLabel}
              </span>
            </label>
            {index < basisLabels.length - 1 ? (
              <span
                aria-hidden="true"
                className="text-[0.68rem] font-semibold leading-none text-muted-foreground"
              >
                +
              </span>
            ) : null}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function VectorCoefficientInput({
  accessibleLabel,
  onKeyDown,
  onValueChange,
  value,
}: {
  accessibleLabel: string;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onValueChange: (value: string) => void;
  value: string;
}) {
  const [isFocused, setIsFocused] = useState(false);
  const [hasEdited, setHasEdited] = useState(false);
  const valueAtFocusRef = useRef(value);
  const displayedValue = isFocused && !hasEdited ? "" : value;

  function handleFocus() {
    valueAtFocusRef.current = value;
    setIsFocused(true);
    setHasEdited(false);
  }

  function handleBlur(event: FocusEvent<HTMLInputElement>) {
    setIsFocused(false);
    setHasEdited(false);

    if (hasEdited && event.currentTarget.value.trim() === "") {
      onValueChange(valueAtFocusRef.current);
    }
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setHasEdited(true);
    onValueChange(event.target.value);
  }

  return (
    <Input
      type="text"
      inputMode="decimal"
      value={displayedValue}
      aria-label={accessibleLabel}
      className="h-[22px] w-[2.75rem] min-w-0 px-1 text-right font-mono text-[0.68rem] tabular-nums focus-visible:border-ring/20 focus-visible:bg-background/80 focus-visible:ring-[1px] focus-visible:ring-ring/20 md:text-[0.68rem]"
      onBlur={handleBlur}
      onChange={handleChange}
      onFocus={handleFocus}
      onKeyDown={onKeyDown}
    />
  );
}

function draftFromCameraState(cameraState: CrystalCameraState): {
  direct: [string, string, string];
  reciprocal: [string, string, string];
} {
  return {
    direct: cameraState.direct.map(formatVectorCoefficient) as [string, string, string],
    reciprocal: cameraState.reciprocal.map(formatVectorCoefficient) as [string, string, string],
  };
}

function formatVectorCoefficient(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

function formatRollValue(value: number): string {
  return String(displayRollDegrees(value));
}

function rollValueInputWidth(value: string): string {
  return `${Math.min(8, Math.max(1, value.length))}ch`;
}

function toPositiveRollDegrees(value: number): number {
  const signedValue = normalizeRollDegrees(value);
  return signedValue < 0 ? signedValue + 360 : signedValue;
}

function displayRollDegrees(value: number): number {
  const roundedValue = Math.round(toPositiveRollDegrees(value));
  return roundedValue >= 360 ? 0 : roundedValue;
}

function parseRollInput(value: string): number | null {
  const nextValue = Number(value.trim().replace(/°$/, ""));
  return Number.isFinite(nextValue) ? nextValue : null;
}

function ReservedTabContent() {
  return (
    <div className="flex min-h-[64px] items-center justify-center rounded-md border border-dashed border-border/80 bg-background/40 text-xs text-muted-foreground">
      No controls
    </div>
  );
}
