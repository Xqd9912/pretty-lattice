import {
  ImageDown,
  Palette,
  Rotate3d as CameraIcon,
  View as DisplayIcon,
  type LucideIcon,
} from "lucide-react";
import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { ComponentVisibilityState } from "../settings";
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

export function CommonControlsPanel({
  componentVisibility,
  hasPolyhedra,
  onComponentVisibilityChange,
}: {
  componentVisibility: ComponentVisibilityState;
  hasPolyhedra: boolean;
  onComponentVisibilityChange: Dispatch<SetStateAction<ComponentVisibilityState>>;
}) {
  const tabTriggerRefs = useRef<Record<CommonPanelTab, HTMLButtonElement | null>>({
    camera: null,
    display: null,
    export: null,
    style: null,
  });
  const [activeTab, setActiveTab] = useState<CommonPanelTab>("display");
  const [tabIndicatorRect, setTabIndicatorRect] = useState<TabIndicatorRect | null>(null);
  const contentHeight =
    activeTab === "display"
      ? "h-[144px]"
      : "h-[76px]";
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
          onValueChange={(value) => setActiveTab(value as CommonPanelTab)}
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
                    "z-10 !h-6 min-w-0 rounded-md !bg-transparent text-xs !shadow-none transition-[color,padding] duration-[420ms] ease-[cubic-bezier(0.16,1,0.3,1)] data-[state=active]:!bg-transparent data-[state=active]:!shadow-none motion-reduce:transition-none [&_svg]:size-3.5",
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
            data-slot="common-controls-content"
            className={cn(
              "overflow-hidden transition-[height] duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
              contentHeight,
            )}
          >
            <TabsContent value="camera" className="mt-1.5">
              <ReservedTabContent />
            </TabsContent>
            <TabsContent value="display" className="mt-1.5">
              <DisplayTabContent
                hasPolyhedra={hasPolyhedra}
                visibility={componentVisibility}
                onVisibilityChange={onComponentVisibilityChange}
              />
            </TabsContent>
            <TabsContent value="style" className="mt-1.5">
              <ReservedTabContent />
            </TabsContent>
            <TabsContent value="export" className="mt-1.5">
              <ReservedTabContent />
            </TabsContent>
          </div>
        </Tabs>
      </aside>
    </TooltipProvider>
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
  onVisibilityChange,
  visibility,
}: {
  hasPolyhedra: boolean;
  onVisibilityChange: Dispatch<SetStateAction<ComponentVisibilityState>>;
  visibility: ComponentVisibilityState;
}) {
  function setVisibility(key: keyof ComponentVisibilityState, value: boolean) {
    onVisibilityChange((currentVisibility) => ({
      ...currentVisibility,
      [key]: value,
    }));
  }

  return (
    <div className="flex flex-col gap-1.5">
      <section aria-label="Display components">
        <div className="grid grid-cols-2 gap-0.5">
          <ComponentCheckboxRow
            checked={visibility.atoms}
            label="Atoms"
            onCheckedChange={(checked) => setVisibility("atoms", checked)}
          />
          <ComponentCheckboxRow
            checked={visibility.unitCell}
            label="Unit cell"
            onCheckedChange={(checked) => setVisibility("unitCell", checked)}
          />
          <ComponentCheckboxRow
            checked={visibility.bonds}
            label="Bonds"
            onCheckedChange={(checked) => setVisibility("bonds", checked)}
          />
          <ComponentCheckboxRow
            checked={hasPolyhedra && visibility.polyhedra}
            disabled={!hasPolyhedra}
            label="Polyhedra"
            onCheckedChange={(checked) => setVisibility("polyhedra", checked)}
          />
        </div>
      </section>

      <Separator className="my-1" />

      <section aria-labelledby="image-components-label">
        <h2
          id="image-components-label"
          className="text-xs font-bold leading-tight text-muted-foreground"
        >
          Images
        </h2>
        <div className="mt-0.5 flex flex-col gap-0.5">
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

function ComponentCheckboxRow({
  checked,
  disabled = false,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex h-6 min-w-0 items-center justify-between gap-1.5 rounded-md px-1.5 text-sm transition-colors",
        disabled ? "cursor-not-allowed text-muted-foreground/55" : "hover:bg-accent/60",
      )}
    >
      <span className="min-w-0 truncate leading-tight">{label}</span>
      <Checkbox
        checked={checked}
        disabled={disabled}
        aria-label={label}
        className="size-3.5 rounded-[3px]"
        iconClassName="size-3"
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
    </label>
  );
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
