import {
  ImageDown,
  Palette,
  RotateCcw,
  Rotate3d as CameraIcon,
  View as DisplayIcon,
  type LucideIcon,
} from "lucide-react";
import {
  type CSSProperties,
  type Dispatch,
  type KeyboardEvent,
  type ReactNode,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { AtomRadiusModel } from "../../api/scene";
import {
  COMPONENT_OPACITY_MAX,
  STYLE_SCALE_MAX,
  STYLE_SCALE_MIN,
  createDefaultComponentOpacity,
  createDefaultStyle,
  type BondColorMode,
  type ComponentOpacityState,
  type ComponentVisibilityState,
  type StyleState,
} from "../settings";
import { GLASS_SURFACE_CLASS } from "../surface";

type CommonPanelTab = "camera" | "display" | "style" | "export";

interface TabIndicatorRect {
  left: number;
  width: number;
}

const COMMON_PANEL_TABS: {
  Icon: LucideIcon;
  label: string;
  value: CommonPanelTab;
}[] = [
  { Icon: DisplayIcon, label: "Display", value: "display" },
  { Icon: CameraIcon, label: "Camera", value: "camera" },
  { Icon: Palette, label: "Style", value: "style" },
  { Icon: ImageDown, label: "Export", value: "export" },
];
const RESET_OPACITY_FEEDBACK_ANIMATION_MS = 150;
const OPAQUE_OPACITY_VALUE = 100;
const OPAQUE_SLIDER_SNAP_DISTANCE = 2;
const STYLE_SCALE_DEFAULT_VALUE = 100;
const STYLE_SCALE_SLIDER_SNAP_DISTANCE = 4;
const BOND_COLOR_OPTIONS: { label: string; value: BondColorMode }[] = [
  { label: "Unicolor", value: "neutral" },
  { label: "Bicolor", value: "by-atom" },
];
const ATOM_RADIUS_MODEL_OPTIONS: {
  menuLabel: string;
  triggerLabel: string;
  value: AtomRadiusModel;
}[] = [
  { menuLabel: "Uniform", triggerLabel: "Uniform", value: "uniform" },
  { menuLabel: "Atomic", triggerLabel: "Atomic", value: "atomic" },
  { menuLabel: "Van der Waals", triggerLabel: "vdW", value: "vdw" },
  { menuLabel: "Ionic", triggerLabel: "Ionic", value: "ionic" },
];
const BICOLOR_TOKEN_STYLE = {
  background: "linear-gradient(90deg, #f58c9a 0 50%, #78a7ff 50% 100%)",
} as const;

export function CommonControlsPanel({
  componentOpacity,
  componentVisibility,
  hasPolyhedra,
  onComponentOpacityChange,
  onComponentVisibilityChange,
  onAtomRadiusModelChange,
  onStyleChange,
  style,
}: {
  componentOpacity: ComponentOpacityState;
  componentVisibility: ComponentVisibilityState;
  hasPolyhedra: boolean;
  onAtomRadiusModelChange: (atomRadiusModel: AtomRadiusModel) => void;
  onComponentOpacityChange: Dispatch<SetStateAction<ComponentOpacityState>>;
  onComponentVisibilityChange: Dispatch<SetStateAction<ComponentVisibilityState>>;
  onStyleChange: Dispatch<SetStateAction<StyleState>>;
  style: StyleState;
}) {
  const tabTriggerRefs = useRef<Record<CommonPanelTab, HTMLButtonElement | null>>({
    camera: null,
    display: null,
    export: null,
    style: null,
  });
  const contentRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<CommonPanelTab>("display");
  const [tabIndicatorRect, setTabIndicatorRect] = useState<TabIndicatorRect | null>(null);
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const contentStyle = contentHeight === null
    ? undefined
    : ({ height: `${contentHeight}px` } as CSSProperties);
  const tabListStyle = {
    gridTemplateColumns: COMMON_PANEL_TABS.map(({ value }) =>
      value === activeTab ? "1.65fr" : "0.9fr",
    ).join(" "),
  } as const;

  useEffect(() => {
    const updateIndicatorRect = () => {
      const activeTrigger = tabTriggerRefs.current[activeTab];
      if (!activeTrigger) {
        return;
      }

      setTabIndicatorRect({
        left: activeTrigger.offsetLeft,
        width: activeTrigger.offsetWidth,
      });
    };

    updateIndicatorRect();
    const animationFrame = window.requestAnimationFrame(updateIndicatorRect);

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateIndicatorRect);
      return () => {
        window.cancelAnimationFrame(animationFrame);
        window.removeEventListener("resize", updateIndicatorRect);
      };
    }

    const resizeObserver = new ResizeObserver(updateIndicatorRect);
    for (const trigger of Object.values(tabTriggerRefs.current)) {
      if (trigger) {
        resizeObserver.observe(trigger);
      }
    }

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
    };
  }, [activeTab]);

  useEffect(() => {
    const contentElement = contentRef.current;
    if (!contentElement) {
      return;
    }

    function updateContentHeight() {
      const activeContent = contentElement?.querySelector<HTMLElement>(
        "[data-slot='tabs-content'][data-state='active']",
      );
      const nextHeight = activeContent?.scrollHeight ?? 0;

      setContentHeight(nextHeight > 0 ? nextHeight : null);
    }

    let resizeObserver: ResizeObserver | null = null;
    const animationFrame = window.requestAnimationFrame(() => {
      updateContentHeight();

      if (typeof ResizeObserver === "undefined") {
        return;
      }

      resizeObserver = new ResizeObserver(updateContentHeight);
      const activeContent = contentElement.querySelector<HTMLElement>(
        "[data-slot='tabs-content'][data-state='active']",
      );
      if (activeContent) {
        resizeObserver.observe(activeContent);
      }
    });
    window.addEventListener("resize", updateContentHeight);

    if (typeof ResizeObserver === "undefined") {
      return () => {
        window.cancelAnimationFrame(animationFrame);
        window.removeEventListener("resize", updateContentHeight);
      };
    }

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", updateContentHeight);
      resizeObserver?.disconnect();
    };
  }, [activeTab]);

  function handleTabValueChange(value: string) {
    const currentHeight = contentRef.current?.getBoundingClientRect().height;
    if (currentHeight && currentHeight > 0) {
      setContentHeight(currentHeight);
    }

    setActiveTab(value as CommonPanelTab);
  }

  return (
    <TooltipProvider>
      <aside
        aria-label="Common controls"
        className={cn(
          "rounded-xl border px-3 py-2 shadow-xl shadow-foreground/10",
          GLASS_SURFACE_CLASS,
        )}
      >
        <Tabs
          value={activeTab}
          onValueChange={handleTabValueChange}
        >
          <TabsList
            className="relative grid !h-8 w-full overflow-hidden rounded-lg bg-muted/70 p-1 transition-[grid-template-columns] duration-[420ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
            style={tabListStyle}
          >
            {tabIndicatorRect ? (
              <span
                aria-hidden="true"
                data-slot="common-controls-active-indicator"
                className="pointer-events-none absolute inset-y-1 left-0 z-0 rounded-md bg-background shadow-sm transition-[transform,width] duration-[420ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
                style={{
                  transform: `translateX(${tabIndicatorRect.left}px)`,
                  width: tabIndicatorRect.width,
                }}
              />
            ) : null}
            {COMMON_PANEL_TABS.map(({ Icon, label, value }) => {
              const isActive = value === activeTab;
              const trigger = (
                <TabsTrigger
                  ref={(node) => {
                    tabTriggerRefs.current[value] = node;
                  }}
                  key={value}
                  value={value}
                  aria-label={label}
                  className={cn(
                    "z-10 !h-6 min-w-0 rounded-lg !bg-transparent text-xs !shadow-none transition-[color,padding] duration-[420ms] ease-[cubic-bezier(0.16,1,0.3,1)] data-[state=active]:!bg-transparent data-[state=active]:!shadow-none motion-reduce:transition-none [&_svg]:size-3.5",
                    isActive ? "px-2 text-foreground" : "px-0.5 text-muted-foreground",
                  )}
                >
                  <Icon aria-hidden="true" />
                  <span
                    data-slot="common-controls-tab-label"
                    data-active={isActive ? "true" : "false"}
                    className={cn(
                      "overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-[420ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
                      isActive ? "max-w-16 opacity-100" : "max-w-0 opacity-0",
                    )}
                  >
                    {label}
                  </span>
                </TabsTrigger>
              );

              if (isActive) {
                return trigger;
              }

              return (
                <Tooltip key={value}>
                  <TooltipTrigger asChild>{trigger}</TooltipTrigger>
                  <TooltipContent side="top">{label}</TooltipContent>
                </Tooltip>
              );
            })}
          </TabsList>

          <div
            ref={contentRef}
            data-slot="common-controls-content"
            className="overflow-hidden transition-[height] duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
            style={contentStyle}
          >
            <TabsContent value="camera" className="pt-1.5">
              <ReservedTabContent />
            </TabsContent>
            <TabsContent value="display">
              <DisplayTabContent
                hasPolyhedra={hasPolyhedra}
                opacity={componentOpacity}
                onOpacityChange={onComponentOpacityChange}
                visibility={componentVisibility}
                onVisibilityChange={onComponentVisibilityChange}
              />
            </TabsContent>
            <TabsContent value="style">
              <StyleTabContent
                onAtomRadiusModelChange={onAtomRadiusModelChange}
                onStyleChange={onStyleChange}
                style={style}
              />
            </TabsContent>
            <TabsContent value="export" className="pt-1.5">
              <ReservedTabContent />
            </TabsContent>
          </div>
        </Tabs>
      </aside>
    </TooltipProvider>
  );
}

function StyleTabContent({
  onAtomRadiusModelChange,
  onStyleChange,
  style,
}: {
  onAtomRadiusModelChange: (atomRadiusModel: AtomRadiusModel) => void;
  onStyleChange: Dispatch<SetStateAction<StyleState>>;
  style: StyleState;
}) {
  function setStyleScale(key: keyof typeof STYLE_SCALE_MIN, value: number) {
    onStyleChange((currentStyle) => ({
      ...currentStyle,
      [key]: clampPercentValue(value, STYLE_SCALE_MIN[key], STYLE_SCALE_MAX[key]),
    }));
  }

  function setAtomRadiusModel(atomRadiusModel: AtomRadiusModel) {
    onAtomRadiusModelChange(atomRadiusModel);
  }

  function setBondColorMode(bondColorMode: BondColorMode) {
    onStyleChange((currentStyle) => ({
      ...currentStyle,
      bondColorMode,
    }));
  }

  const [resetFeedbackPhase, setResetFeedbackPhase] = useState<"a" | "b" | null>(null);
  const resetFeedbackTickRef = useRef(0);
  const resetFeedbackTimeoutRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (resetFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(resetFeedbackTimeoutRef.current);
      }
    },
    [],
  );

  function handleResetScaleClick() {
    onStyleChange((currentStyle) => ({
      ...currentStyle,
      atomRadius: createDefaultStyle().atomRadius,
      bondThickness: createDefaultStyle().bondThickness,
    }));

    if (resetFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(resetFeedbackTimeoutRef.current);
    }

    resetFeedbackTickRef.current += 1;
    setResetFeedbackPhase(resetFeedbackTickRef.current % 2 === 0 ? "b" : "a");
    resetFeedbackTimeoutRef.current = window.setTimeout(() => {
      setResetFeedbackPhase(null);
      resetFeedbackTimeoutRef.current = null;
    }, RESET_OPACITY_FEEDBACK_ANIMATION_MS);
  }

  return (
    <div className="flex flex-col gap-2.5">
      <section aria-labelledby="style-size-label">
        <div className="grid grid-cols-[minmax(5.5rem,1fr)_6.75rem_2.35rem] items-center gap-2 px-1.5">
          <h2
            id="style-size-label"
            className="text-xs font-bold leading-tight text-muted-foreground"
          >
            Radius
          </h2>
          <span aria-hidden="true" />
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex justify-end">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Reset scale"
                  className={cn(
                    "view-rail-button size-7 rounded-[10px] border border-transparent bg-transparent text-muted-foreground shadow-none transition-[background-color,border-color,color,box-shadow] duration-150 [&_svg]:size-3.5",
                    resetFeedbackPhase === "a" ? "view-rail-button-reset-feedback-a" : null,
                    resetFeedbackPhase === "b" ? "view-rail-button-reset-feedback-b" : null,
                  )}
                  onClick={handleResetScaleClick}
                >
                  <RotateCcw aria-hidden="true" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">Reset scale</TooltipContent>
          </Tooltip>
        </div>

        <div className="mt-1 flex flex-col gap-1">
          <PercentSliderRow
            accessibleLabel="Atom"
            label={(
              <AtomRadiusModelSelect
                value={style.atomRadiusModel}
                onValueChange={setAtomRadiusModel}
              />
            )}
            max={STYLE_SCALE_MAX.atomRadius}
            min={STYLE_SCALE_MIN.atomRadius}
            value={style.atomRadius}
            onValueChange={(value) => setStyleScale("atomRadius", value)}
          />
          <PercentSliderRow
            accessibleLabel="Bond"
            label="Bond"
            max={STYLE_SCALE_MAX.bondThickness}
            min={STYLE_SCALE_MIN.bondThickness}
            value={style.bondThickness}
            onValueChange={(value) => setStyleScale("bondThickness", value)}
          />
        </div>
      </section>

      <Separator />

      <div className="grid min-h-8 grid-cols-[minmax(5.5rem,1fr)_9.5rem] items-center gap-2 rounded-md px-1.5 text-sm">
        <span className="min-w-0 truncate leading-tight">Bond style</span>
        <Select
          value={style.bondColorMode}
          onValueChange={(value) => setBondColorMode(value as BondColorMode)}
        >
          <SelectTrigger
            size="sm"
            aria-label="Bond style"
            className="!h-6 w-full !px-2 !py-0"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent
            position="popper"
            className="!bg-background !text-foreground"
          >
            <SelectGroup>
              {BOND_COLOR_OPTIONS.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  textValue={option.label}
                  className="min-h-6 py-0.5 text-sm"
                >
                  <BondStyleOptionLabel
                    label={option.label}
                    value={option.value}
                  />
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function AtomRadiusModelSelect({
  onValueChange,
  value,
}: {
  onValueChange: (value: AtomRadiusModel) => void;
  value: AtomRadiusModel;
}) {
  const selectedOption = ATOM_RADIUS_MODEL_OPTIONS.find((option) => option.value === value);

  return (
    <Select
      value={value}
      onValueChange={(nextValue) => onValueChange(nextValue as AtomRadiusModel)}
    >
      <SelectTrigger
        size="sm"
        aria-label="Atom radius model"
        className="-ml-1.5 !h-6 w-20 gap-0.5 !py-0 !pr-0.5 !pl-1.5 [&_svg]:size-3.5"
      >
        <span data-slot="select-value" className="min-w-0 truncate">
          {selectedOption?.triggerLabel}
        </span>
      </SelectTrigger>
      <SelectContent
        position="popper"
        className="!bg-background !text-foreground"
      >
        <SelectGroup>
          <SelectLabel className="py-1 text-xs font-medium">Atom radius model</SelectLabel>
          {ATOM_RADIUS_MODEL_OPTIONS.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              textValue={option.menuLabel}
              className="min-h-6 py-0.5 text-sm"
            >
              {option.menuLabel}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function BondStyleOptionLabel({
  label,
  value,
}: {
  label: string;
  value: BondColorMode;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span
        aria-hidden="true"
        className={cn(
          "size-3.5 shrink-0 rounded-full border border-border",
          value === "neutral" ? "bg-[#8f96a3]" : null,
        )}
        style={value === "by-atom" ? BICOLOR_TOKEN_STYLE : undefined}
      />
      <span className="min-w-0 truncate">{label}</span>
    </span>
  );
}

function ReservedTabContent() {
  return (
    <div className="flex min-h-[64px] items-center justify-center rounded-md border border-dashed border-border/80 bg-background/40 text-xs text-muted-foreground">
      No controls
    </div>
  );
}

function DisplayTabContent({
  hasPolyhedra,
  onOpacityChange,
  onVisibilityChange,
  opacity,
  visibility,
}: {
  hasPolyhedra: boolean;
  onOpacityChange: Dispatch<SetStateAction<ComponentOpacityState>>;
  onVisibilityChange: Dispatch<SetStateAction<ComponentVisibilityState>>;
  opacity: ComponentOpacityState;
  visibility: ComponentVisibilityState;
}) {
  function setVisibility(key: keyof ComponentVisibilityState, value: boolean) {
    onVisibilityChange((currentVisibility) => ({
      ...currentVisibility,
      [key]: value,
    }));
  }

  function setOpacity(key: keyof ComponentOpacityState, value: number) {
    onOpacityChange((currentOpacity) => ({
      ...currentOpacity,
      [key]: clampOpacityValue(value, COMPONENT_OPACITY_MAX[key]),
    }));
  }

  const [resetFeedbackPhase, setResetFeedbackPhase] = useState<"a" | "b" | null>(null);
  const resetFeedbackTickRef = useRef(0);
  const resetFeedbackTimeoutRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (resetFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(resetFeedbackTimeoutRef.current);
      }
    },
    [],
  );

  function handleResetOpacityClick() {
    onOpacityChange(createDefaultComponentOpacity());

    if (resetFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(resetFeedbackTimeoutRef.current);
    }

    resetFeedbackTickRef.current += 1;
    setResetFeedbackPhase(resetFeedbackTickRef.current % 2 === 0 ? "b" : "a");
    resetFeedbackTimeoutRef.current = window.setTimeout(() => {
      setResetFeedbackPhase(null);
      resetFeedbackTimeoutRef.current = null;
    }, RESET_OPACITY_FEEDBACK_ANIMATION_MS);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <section aria-labelledby="display-components-label">
        <div className="grid grid-cols-[minmax(5.5rem,1fr)_6.75rem_2.35rem] items-center gap-2 px-1.5">
          <h2
            id="display-components-label"
            className="text-xs font-bold leading-tight text-muted-foreground"
          >
            Components
          </h2>
          <span className="text-right text-xs font-bold leading-tight text-muted-foreground">
            Opacity
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex justify-end">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Reset opacity"
                  className={cn(
                    "view-rail-button size-7 rounded-[10px] border border-transparent bg-transparent text-muted-foreground shadow-none transition-[background-color,border-color,color,box-shadow] duration-150 [&_svg]:size-3.5",
                    resetFeedbackPhase === "a" ? "view-rail-button-reset-feedback-a" : null,
                    resetFeedbackPhase === "b" ? "view-rail-button-reset-feedback-b" : null,
                  )}
                  onClick={handleResetOpacityClick}
                >
                  <RotateCcw aria-hidden="true" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">Reset opacity</TooltipContent>
          </Tooltip>
        </div>

        <div className="mt-1 flex flex-col gap-1">
          <ComponentOpacityRow
            checked={visibility.atoms}
            label="Atoms"
            max={COMPONENT_OPACITY_MAX.atoms}
            value={opacity.atoms}
            onCheckedChange={(checked) => setVisibility("atoms", checked)}
            onOpacityChange={(value) => setOpacity("atoms", value)}
          />
          <ComponentOpacityRow
            checked={visibility.bonds}
            label="Bonds"
            max={COMPONENT_OPACITY_MAX.bonds}
            value={opacity.bonds}
            onCheckedChange={(checked) => setVisibility("bonds", checked)}
            onOpacityChange={(value) => setOpacity("bonds", value)}
          />
          <ComponentOpacityRow
            checked={visibility.unitCell}
            label="Unit cell"
            max={COMPONENT_OPACITY_MAX.unitCell}
            value={opacity.unitCell}
            onCheckedChange={(checked) => setVisibility("unitCell", checked)}
            onOpacityChange={(value) => setOpacity("unitCell", value)}
          />
          <ComponentOpacityRow
            checked={hasPolyhedra && visibility.polyhedra}
            checkboxDisabled={!hasPolyhedra}
            label="Polyhedra"
            max={COMPONENT_OPACITY_MAX.polyhedra}
            value={opacity.polyhedra}
            onCheckedChange={(checked) => setVisibility("polyhedra", checked)}
            onOpacityChange={(value) => setOpacity("polyhedra", value)}
          />
        </div>
      </section>

      <Separator className="my-1" />

      <section aria-labelledby="image-components-label">
        <h2
          id="image-components-label"
          className="text-xs font-bold leading-tight text-muted-foreground"
        >
          Periodic images
        </h2>
        <div className="mt-1.5 flex flex-col gap-1">
          <ImageSwitchRow
            checked={visibility.boundaryAtoms}
            label="Cell-boundary atoms"
            onCheckedChange={(checked) => setVisibility("boundaryAtoms", checked)}
          />
          <ImageSwitchRow
            checked={visibility.oneHopBondedAtoms}
            label="One-hop bonded atoms"
            onCheckedChange={(checked) => setVisibility("oneHopBondedAtoms", checked)}
          />
        </div>
      </section>
    </div>
  );
}

function ComponentOpacityRow({
  checked,
  checkboxDisabled = false,
  label,
  max,
  onCheckedChange,
  onOpacityChange,
  value,
}: {
  checked: boolean;
  checkboxDisabled?: boolean;
  label: string;
  max: number;
  onCheckedChange: (checked: boolean) => void;
  onOpacityChange: (opacity: number) => void;
  value: number;
}) {
  const [opacityText, setOpacityText] = useState(formatOpacityValue(value));
  const sliderPosition = max > 0 ? value / max : 0;
  const sliderStyle = {
    "--opacity-slider-position": `${Math.min(100, Math.max(0, sliderPosition * 100))}%`,
  } as CSSProperties;
  const inputDisabled = checkboxDisabled || !checked;

  useEffect(() => {
    setOpacityText(formatOpacityValue(value));
  }, [value]);

  function commitOpacityText() {
    const nextOpacity = parseOpacityInput(opacityText);
    if (nextOpacity === null) {
      setOpacityText(formatOpacityValue(value));
      return;
    }

    onOpacityChange(clampOpacityValue(nextOpacity, max));
  }

  function handleOpacityKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.currentTarget.blur();
      commitOpacityText();
      return;
    }

    if (event.key === "Escape") {
      setOpacityText(formatOpacityValue(value));
      event.currentTarget.blur();
      return;
    }

    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const direction = event.key === "ArrowUp" ? 1 : -1;
      onOpacityChange(clampOpacityValue(value + direction, max));
    }
  }

  return (
    <div
      className={cn(
        "grid h-7 min-w-0 grid-cols-[minmax(5.5rem,1fr)_6.75rem_2.35rem] items-center gap-2 rounded-md px-1.5 text-sm transition-colors",
        checkboxDisabled ? "text-muted-foreground/55" : "hover:bg-accent/60",
      )}
    >
      <label
        className={cn(
          "flex min-w-0 items-center gap-2",
          checkboxDisabled ? "cursor-not-allowed" : "cursor-pointer",
        )}
      >
        <Checkbox
          checked={checked}
          disabled={checkboxDisabled}
          aria-label={label}
          className="size-3.5 rounded-[3px]"
          iconClassName="size-3"
          onCheckedChange={(nextChecked) => onCheckedChange(nextChecked === true)}
        />
        <span
          className={cn(
            "min-w-0 truncate leading-tight",
            inputDisabled ? "text-muted-foreground/60" : null,
          )}
        >
          {label}
        </span>
      </label>

      <div
        className="opacity-slider-shell relative mr-3 h-5"
        data-disabled={inputDisabled ? "true" : "false"}
        style={sliderStyle}
      >
        <input
          type="range"
          min={0}
          max={max}
          step={1}
          value={value}
          disabled={inputDisabled}
          aria-label={`${label} opacity`}
          aria-valuetext={`${formatOpacityValue(value)}%`}
          className="opacity-slider absolute inset-0 z-10 h-full w-full"
          onChange={(event) =>
            onOpacityChange(snapSliderOpacityValue(Number(event.target.value), max))
          }
        />
        <span aria-hidden="true" className="opacity-slider-track pointer-events-none" />
        <span aria-hidden="true" className="opacity-slider-fill pointer-events-none" />
        <span aria-hidden="true" className="opacity-slider-thumb pointer-events-none" />
      </div>

      <label
        className="opacity-value-control group flex h-[22px] items-baseline justify-center gap-0 rounded-md border px-0.5 transition-[background-color,border-color,box-shadow] duration-150"
        data-disabled={inputDisabled ? "true" : "false"}
      >
        <span className="sr-only">{label} opacity value</span>
        <input
          type="text"
          inputMode="numeric"
          value={opacityText}
          disabled={inputDisabled}
          aria-label={`${label} opacity value`}
          className="opacity-value-input h-full w-[1.35rem] border-0 bg-transparent px-0 text-center font-mono text-[0.68rem] leading-none tabular-nums outline-none"
          onBlur={commitOpacityText}
          onChange={(event) => setOpacityText(event.target.value)}
          onKeyDown={handleOpacityKeyDown}
        />
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none font-mono text-[0.68rem] font-normal leading-none text-muted-foreground",
            inputDisabled ? "text-muted-foreground/60" : null,
          )}
        >
          %
        </span>
      </label>
    </div>
  );
}

function PercentSliderRow({
  accessibleLabel,
  label,
  max,
  min,
  onValueChange,
  value,
}: {
  accessibleLabel: string;
  label: ReactNode;
  max: number;
  min: number;
  onValueChange: (value: number) => void;
  value: number;
}) {
  const [valueText, setValueText] = useState(formatPercentValue(value));
  const sliderPosition = percentValueToLinearSliderPosition(value, min, max);
  const sliderStyle = {
    "--opacity-slider-position": `${Math.min(100, Math.max(0, sliderPosition * 100))}%`,
  } as CSSProperties;

  useEffect(() => {
    setValueText(formatPercentValue(value));
  }, [value]);

  function commitValueText() {
    const nextValue = parsePercentInput(valueText);
    if (nextValue === null) {
      setValueText(formatPercentValue(value));
      return;
    }

    onValueChange(clampPercentValue(nextValue, min, max));
  }

  function handleValueKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.currentTarget.blur();
      commitValueText();
      return;
    }

    if (event.key === "Escape") {
      setValueText(formatPercentValue(value));
      event.currentTarget.blur();
      return;
    }

    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const direction = event.key === "ArrowUp" ? 1 : -1;
      onValueChange(clampPercentValue(value + direction, min, max));
    }
  }

  return (
    <div className="grid h-7 min-w-0 grid-cols-[minmax(5.5rem,1fr)_6.75rem_2.35rem] items-center gap-2 rounded-md px-1.5 text-sm">
      <div className="min-w-0 overflow-visible leading-tight">{label}</div>

      <div
        className="opacity-slider-shell relative mr-3 h-5"
        data-disabled="false"
        style={sliderStyle}
      >
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={clampPercentValue(value, min, max)}
          aria-label={`${accessibleLabel} scale`}
          aria-valuetext={`${formatPercentValue(value)}%`}
          className="opacity-slider absolute inset-0 z-10 h-full w-full"
          onChange={(event) =>
            onValueChange(snapSliderPercentValue(Number(event.target.value), min, max))
          }
        />
        <span aria-hidden="true" className="opacity-slider-track pointer-events-none" />
        <span aria-hidden="true" className="opacity-slider-snap-marker pointer-events-none" />
        <span aria-hidden="true" className="opacity-slider-fill pointer-events-none" />
        <span aria-hidden="true" className="opacity-slider-thumb pointer-events-none" />
      </div>

      <label
        className="opacity-value-control group flex h-[22px] items-baseline justify-center gap-0 rounded-md border px-0.5 transition-[background-color,border-color,box-shadow] duration-150"
        data-disabled="false"
      >
        <span className="sr-only">{accessibleLabel} scale value</span>
        <input
          type="text"
          inputMode="numeric"
          value={valueText}
          aria-label={`${accessibleLabel} scale value`}
          className="opacity-value-input h-full w-[1.35rem] border-0 bg-transparent px-0 text-center font-mono text-[0.68rem] leading-none tabular-nums outline-none"
          onBlur={commitValueText}
          onChange={(event) => setValueText(event.target.value)}
          onKeyDown={handleValueKeyDown}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none font-mono text-[0.68rem] font-normal leading-none text-muted-foreground"
        >
          %
        </span>
      </label>
    </div>
  );
}

function clampOpacityValue(value: number, max: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(max, Math.max(0, Math.round(value)));
}

function snapSliderOpacityValue(value: number, max: number): number {
  const clampedValue = clampOpacityValue(value, max);
  if (
    max === OPAQUE_OPACITY_VALUE &&
    clampedValue >= OPAQUE_OPACITY_VALUE - OPAQUE_SLIDER_SNAP_DISTANCE
  ) {
    return OPAQUE_OPACITY_VALUE;
  }

  return clampedValue;
}

function formatOpacityValue(value: number): string {
  return String(Math.round(value));
}

function parseOpacityInput(value: string): number | null {
  return parsePercentNumberInput(value);
}

function clampPercentValue(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}

function snapSliderPercentValue(value: number, min: number, max: number): number {
  const clampedValue = clampPercentValue(value, min, max);
  if (
    min <= STYLE_SCALE_DEFAULT_VALUE &&
    max >= STYLE_SCALE_DEFAULT_VALUE &&
    Math.abs(clampedValue - STYLE_SCALE_DEFAULT_VALUE) <= STYLE_SCALE_SLIDER_SNAP_DISTANCE
  ) {
    return STYLE_SCALE_DEFAULT_VALUE;
  }

  return clampedValue;
}

function percentValueToLinearSliderPosition(value: number, min: number, max: number): number {
  if (max <= min) {
    return 0;
  }

  return (clampPercentValue(value, min, max) - min) / (max - min);
}

function formatPercentValue(value: number): string {
  return String(Math.round(value));
}

function parsePercentInput(value: string): number | null {
  return parsePercentNumberInput(value);
}

function parsePercentNumberInput(value: string): number | null {
  const trimmedValue = value.trim().replace(/%$/, "").trim();
  if (trimmedValue === "") {
    return null;
  }

  const parsedValue = Number(trimmedValue);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function ImageSwitchRow({
  checked,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex h-6 items-center justify-between gap-1.5 rounded-md px-1.5 text-sm transition-colors hover:bg-accent/60">
      <span className="min-w-0 truncate leading-tight">{label}</span>
      <Switch
        checked={checked}
        aria-label={label}
        className="h-4 w-7 p-0.5"
        thumbClassName="size-3 data-[state=checked]:translate-x-3"
        onCheckedChange={onCheckedChange}
      />
    </label>
  );
}
