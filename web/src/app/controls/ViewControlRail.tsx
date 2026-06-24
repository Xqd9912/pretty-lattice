import { Lock, RotateCcw, Unlock } from "lucide-react";
import {
  type CSSProperties,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { GLASS_SURFACE_CLASS } from "../surface";
import {
  formatZoomPercent,
  parseZoomPercentInput,
  sliderPositionToViewScale,
  snapZoomSliderPosition,
  viewScaleToSliderPosition,
} from "../viewState";

const LOCKED_INTERACTION_FEEDBACK_ANIMATION_MS = 420;
const RESET_VIEW_FEEDBACK_ANIMATION_MS = 150;
const ZOOM_SLIDER_BLUR_DELAY_MS = 500;
const ZOOM_SLIDER_HEIGHT_PX = 180;
const ZOOM_SLIDER_THUMB_SIZE_PX = 14;

export function ViewControlRail({
  className,
  interactionLocked,
  lockedInteractionFeedbackCount,
  onInteractionLockedChange,
  onResetView,
  onViewScaleChange,
  viewScale,
}: {
  className?: string;
  interactionLocked: boolean;
  lockedInteractionFeedbackCount: number;
  onInteractionLockedChange: (interactionLocked: boolean) => void;
  onResetView: () => void;
  onViewScaleChange: (viewScale: number) => void;
  viewScale: number;
}) {
  const [lockFeedbackPhase, setLockFeedbackPhase] = useState<"a" | "b" | null>(null);
  const [resetFeedbackPhase, setResetFeedbackPhase] = useState<"a" | "b" | null>(null);
  const [zoomText, setZoomText] = useState(formatZoomPercent(viewScale));
  const lastLockFeedbackCountRef = useRef(0);
  const lockFeedbackTimeoutRef = useRef<number | null>(null);
  const resetFeedbackTickRef = useRef(0);
  const resetFeedbackTimeoutRef = useRef<number | null>(null);
  const zoomSliderRef = useRef<HTMLInputElement>(null);
  const zoomSliderBlurTimeoutRef = useRef<number | null>(null);
  const isZoomSliderPointerActiveRef = useRef(false);
  const sliderPosition = viewScaleToSliderPosition(viewScale);
  const sliderValue = Math.round(sliderPosition * 1000);
  const sliderThumbTravelPx = ZOOM_SLIDER_HEIGHT_PX - ZOOM_SLIDER_THUMB_SIZE_PX;
  const sliderThumbTopPx =
    ZOOM_SLIDER_THUMB_SIZE_PX / 2 + (1 - sliderPosition) * sliderThumbTravelPx;
  const sliderStyle = {
    "--zoom-slider-thumb-top": `${sliderThumbTopPx}px`,
  } as CSSProperties;

  useEffect(() => {
    setZoomText(formatZoomPercent(viewScale));
  }, [viewScale]);

  useEffect(
    () => () => {
      if (lockFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(lockFeedbackTimeoutRef.current);
      }
      if (resetFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(resetFeedbackTimeoutRef.current);
      }
      if (zoomSliderBlurTimeoutRef.current !== null) {
        window.clearTimeout(zoomSliderBlurTimeoutRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (
      lockedInteractionFeedbackCount === 0 ||
      lockedInteractionFeedbackCount === lastLockFeedbackCountRef.current
    ) {
      return;
    }

    lastLockFeedbackCountRef.current = lockedInteractionFeedbackCount;
    if (!interactionLocked) {
      return;
    }

    if (lockFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(lockFeedbackTimeoutRef.current);
    }

    setLockFeedbackPhase(lockedInteractionFeedbackCount % 2 === 0 ? "b" : "a");
    lockFeedbackTimeoutRef.current = window.setTimeout(() => {
      setLockFeedbackPhase(null);
      lockFeedbackTimeoutRef.current = null;
    }, LOCKED_INTERACTION_FEEDBACK_ANIMATION_MS);
  }, [interactionLocked, lockedInteractionFeedbackCount]);

  useEffect(() => {
    if (!interactionLocked) {
      setLockFeedbackPhase(null);
    }
  }, [interactionLocked]);

  function handleResetClick() {
    onResetView();

    if (resetFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(resetFeedbackTimeoutRef.current);
    }

    resetFeedbackTickRef.current += 1;
    setResetFeedbackPhase(resetFeedbackTickRef.current % 2 === 0 ? "b" : "a");
    resetFeedbackTimeoutRef.current = window.setTimeout(() => {
      setResetFeedbackPhase(null);
      resetFeedbackTimeoutRef.current = null;
    }, RESET_VIEW_FEEDBACK_ANIMATION_MS);
  }

  function clearZoomSliderBlurTimeout() {
    if (zoomSliderBlurTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(zoomSliderBlurTimeoutRef.current);
    zoomSliderBlurTimeoutRef.current = null;
  }

  function scheduleZoomSliderBlur() {
    clearZoomSliderBlurTimeout();
    zoomSliderBlurTimeoutRef.current = window.setTimeout(() => {
      zoomSliderRef.current?.blur();
      isZoomSliderPointerActiveRef.current = false;
      zoomSliderBlurTimeoutRef.current = null;
    }, ZOOM_SLIDER_BLUR_DELAY_MS);
  }

  function handleZoomSliderPointerDown() {
    isZoomSliderPointerActiveRef.current = true;
    clearZoomSliderBlurTimeout();
  }

  function handleZoomSliderPointerEnd() {
    if (isZoomSliderPointerActiveRef.current) {
      scheduleZoomSliderBlur();
    }
  }

  function commitZoomText() {
    const nextScale = parseZoomPercentInput(zoomText);
    if (nextScale === null) {
      setZoomText(formatZoomPercent(viewScale));
      return;
    }

    onViewScaleChange(nextScale);
  }

  function handleZoomKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.currentTarget.blur();
      commitZoomText();
      return;
    }

    if (event.key === "Escape") {
      setZoomText(formatZoomPercent(viewScale));
      event.currentTarget.blur();
    }
  }

  return (
    <TooltipProvider>
      <aside
        aria-label="View controls"
        className={cn(
          "absolute left-[328px] top-4 flex w-[42px] flex-col items-center max-[760px]:bottom-[8.5rem] max-[760px]:left-auto max-[760px]:right-4 max-[760px]:top-auto",
          className,
        )}
      >
        <div
          className={cn(
            "flex w-[42px] flex-col items-center gap-1.5 rounded-xl border px-1 pb-2 pt-2 shadow-xl shadow-foreground/10",
            GLASS_SURFACE_CLASS,
          )}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Reset view"
                className={cn(
                  "view-rail-button size-7 rounded-[10px] border border-transparent bg-transparent text-muted-foreground shadow-none transition-[background-color,border-color,color,box-shadow] duration-150 [&_svg]:size-3.5",
                  resetFeedbackPhase === "a" ? "view-rail-button-reset-feedback-a" : null,
                  resetFeedbackPhase === "b" ? "view-rail-button-reset-feedback-b" : null,
                )}
                onClick={handleResetClick}
              >
                <RotateCcw aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Reset view</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-pressed={interactionLocked}
                aria-label={
                  interactionLocked ? "Unlock canvas interaction" : "Lock canvas interaction"
                }
                className={cn(
                  "view-rail-button size-7 rounded-[10px] border border-transparent bg-transparent shadow-none transition-[background-color,border-color,color,box-shadow] duration-100 ease-out motion-reduce:transition-none [&_svg]:size-3.5",
                  interactionLocked
                    ? "view-rail-button-active"
                    : "text-muted-foreground",
                  lockFeedbackPhase === "a" ? "view-rail-button-lock-feedback-a" : null,
                  lockFeedbackPhase === "b" ? "view-rail-button-lock-feedback-b" : null,
                )}
                onClick={() => onInteractionLockedChange(!interactionLocked)}
              >
                {interactionLocked ? <Lock aria-hidden="true" /> : <Unlock aria-hidden="true" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {interactionLocked ? "Unlock interaction" : "Lock interaction"}
            </TooltipContent>
          </Tooltip>

          <div className="zoom-slider-shell relative h-[180px] w-7" style={sliderStyle}>
            <input
              ref={zoomSliderRef}
              type="range"
              min={0}
              max={1000}
              step={1}
              value={sliderValue}
              aria-label="Zoom percentage"
              aria-valuetext={`${formatZoomPercent(viewScale)}%`}
              className="zoom-slider absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
              data-testid="zoom-slider"
              onChange={(event) => {
                const snappedPosition = snapZoomSliderPosition(Number(event.target.value) / 1000);

                onViewScaleChange(sliderPositionToViewScale(snappedPosition));
                if (isZoomSliderPointerActiveRef.current) {
                  scheduleZoomSliderBlur();
                }
              }}
              onBlur={() => {
                isZoomSliderPointerActiveRef.current = false;
                clearZoomSliderBlurTimeout();
              }}
              onPointerCancel={handleZoomSliderPointerEnd}
              onPointerDown={handleZoomSliderPointerDown}
              onPointerUp={handleZoomSliderPointerEnd}
            />
            <span
              aria-hidden="true"
              className="zoom-slider-track pointer-events-none"
            />
            <span
              aria-hidden="true"
              className="zoom-slider-snap-marker pointer-events-none"
            />
            <span
              aria-hidden="true"
              className="zoom-slider-thumb pointer-events-none"
            />
          </div>

          <label className="zoom-percent-control group -mt-1 flex h-[22px] w-[34px] items-baseline justify-center gap-0 rounded-md border px-0.5 transition-[background-color,border-color,box-shadow] duration-150">
            <span className="sr-only">Zoom percentage</span>
            <input
              type="text"
              inputMode="decimal"
              value={zoomText}
              aria-label="Zoom percentage input"
              className="zoom-percent-input h-full w-[1.35rem] border-0 bg-transparent px-0 text-center font-mono text-[0.68rem] leading-none tabular-nums outline-none"
              data-testid="zoom-input"
              onBlur={commitZoomText}
              onChange={(event) => setZoomText(event.target.value)}
              onKeyDown={handleZoomKeyDown}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none font-mono text-[0.68rem] font-normal leading-none text-muted-foreground"
            >
              %
            </span>
          </label>
        </div>
      </aside>
    </TooltipProvider>
  );
}
