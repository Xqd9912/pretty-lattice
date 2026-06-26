import * as React from "react";

import { cn } from "@/lib/utils";

interface AngleSliderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  disabled?: boolean;
  onInteractionStart?: () => void;
  onValueCommit?: (value: number) => void;
  onValueChange?: (value: number) => void;
  step?: number;
  value: number;
}

const ANGLE_SLIDER_MIN = -180;
const ANGLE_SLIDER_MAX = 180;

function AngleSlider({
  className,
  disabled = false,
  onInteractionStart,
  onValueCommit,
  onValueChange,
  step = 1,
  style,
  value,
  ...props
}: AngleSliderProps) {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const isPointerActiveRef = React.useRef(false);
  const latestValueRef = React.useRef(normalizeAngleValue(value));
  const angle = valueToAngle(value);
  const displayValue = Math.round(normalizeAngleValue(value));

  React.useEffect(() => {
    if (!isPointerActiveRef.current) {
      latestValueRef.current = normalizeAngleValue(value);
    }
  }, [value]);

  function updateValueFromPointer(event: React.PointerEvent<HTMLDivElement>) {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) {
      return latestValueRef.current;
    }

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const pointerAngle =
      Math.atan2(event.clientX - centerX, centerY - event.clientY) * 180 / Math.PI;
    const normalizedAngle = ((pointerAngle % 360) + 360) % 360;
    const nextValue = snapValue(angleToValue(normalizedAngle), step);
    latestValueRef.current = nextValue;
    onValueChange?.(nextValue);
    return nextValue;
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (disabled) {
      return;
    }

    event.preventDefault();
    isPointerActiveRef.current = true;
    latestValueRef.current = normalizeAngleValue(value);
    onInteractionStart?.();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    updateValueFromPointer(event);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!isPointerActiveRef.current || disabled) {
      return;
    }

    event.preventDefault();
    updateValueFromPointer(event);
  }

  function handlePointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    const wasPointerActive = isPointerActiveRef.current;
    isPointerActiveRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (wasPointerActive) {
      onValueCommit?.(latestValueRef.current);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (disabled) {
      return;
    }

    const keyDeltas: Record<string, number> = {
      ArrowDown: -step,
      ArrowLeft: -step,
      ArrowRight: step,
      ArrowUp: step,
      PageDown: -step * 10,
      PageUp: step * 10,
    };

    if (event.key === "Home") {
      event.preventDefault();
      latestValueRef.current = 0;
      onValueChange?.(0);
      onValueCommit?.(0);
      return;
    }

    if (!(event.key in keyDeltas)) {
      return;
    }

    event.preventDefault();
    const nextValue = snapValue(value + keyDeltas[event.key]!, step);
    latestValueRef.current = nextValue;
    onValueChange?.(nextValue);
    onValueCommit?.(nextValue);
  }

  return (
    <div
      {...props}
      aria-disabled={disabled}
      aria-valuemax={ANGLE_SLIDER_MAX}
      aria-valuemin={ANGLE_SLIDER_MIN}
      aria-valuenow={displayValue}
      aria-valuetext={`${displayValue}°`}
      className={cn(
        "relative size-20 shrink-0 touch-none rounded-full outline-none",
        "focus-visible:ring-[3px] focus-visible:ring-ring/50",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        className,
      )}
      data-disabled={disabled}
      data-slot="angle-slider"
      ref={rootRef}
      role="slider"
      style={{
        "--angle-slider-angle": `${angle}deg`,
        ...style,
      } as React.CSSProperties}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={handleKeyDown}
      onPointerCancel={handlePointerEnd}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
    >
      <div
        aria-hidden="true"
        className="absolute inset-1 rounded-full border bg-background/65 shadow-inner"
        data-slot="angle-slider-track"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0"
        data-slot="angle-slider-rotor"
        style={{ transform: "rotate(var(--angle-slider-angle))" }}
      >
        <div
          className="absolute bottom-1/2 left-1/2 top-2 w-0.5 -translate-x-1/2 rounded-full bg-foreground/28"
          data-slot="angle-slider-needle"
        />
        <div
          className="absolute left-1/2 top-0 size-4 -translate-x-1/2 rounded-full border-[3px] border-background bg-foreground shadow-sm transition-shadow"
          data-slot="angle-slider-thumb"
        />
      </div>
      <div
        aria-hidden="true"
        className="absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/28"
        data-slot="angle-slider-center"
      />
    </div>
  );
}

function valueToAngle(value: number): number {
  return ((normalizeAngleValue(value) % 360) + 360) % 360;
}

function angleToValue(angle: number): number {
  return normalizeAngleValue(angle);
}

function normalizeAngleValue(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const normalized = ((((value + 180) % 360) + 360) % 360) - 180;
  return Math.abs(normalized) < 0.000001 ? 0 : normalized;
}

function snapValue(value: number, step: number): number {
  const safeStep = Number.isFinite(step) && step > 0 ? step : 1;
  const snapped = Math.round(value / safeStep) * safeStep;
  return Math.min(ANGLE_SLIDER_MAX, Math.max(ANGLE_SLIDER_MIN, normalizeAngleValue(snapped)));
}

export { AngleSlider };
