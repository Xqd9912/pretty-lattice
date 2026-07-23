import {
  Link2,
  MoveHorizontal,
  Ruler,
  Spline,
  TriangleRight,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { MeasurementTool } from "../../model/measurements";
import {
  GLASS_SURFACE_CLASS,
  TOOL_ICON_BUTTON_ACTIVE_CLASS,
  TOOL_ICON_BUTTON_CLASS,
} from "../surface";

const TOOLS: {
  icon: LucideIcon;
  label: string;
  value: MeasurementTool;
}[] = [
  { icon: Link2, label: "Bond length", value: "bond" },
  { icon: MoveHorizontal, label: "Distance", value: "distance" },
  { icon: TriangleRight, label: "Bond angle", value: "angle" },
  { icon: Spline, label: "Dihedral", value: "dihedral" },
];

export function MeasurementPopover({
  activeTool,
  onToolChange,
}: {
  activeTool: MeasurementTool | null;
  onToolChange: (tool: MeasurementTool | null) => void;
}) {
  const [isOpen, setIsOpen] = useState(activeTool !== null);

  useEffect(() => {
    if (activeTool !== null) {
      setIsOpen(true);
    }
  }, [activeTool]);

  return (
    <TooltipProvider delayDuration={400}>
      <div className="relative">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={isOpen ? "Close measurement tools" : "Open measurement tools"}
              aria-expanded={isOpen}
              aria-pressed={activeTool !== null}
              className={cn(
                TOOL_ICON_BUTTON_CLASS,
                activeTool ? TOOL_ICON_BUTTON_ACTIVE_CLASS : "text-muted-foreground",
              )}
              onClick={() => {
                const nextOpen = !isOpen;
                setIsOpen(nextOpen);
                if (!nextOpen) {
                  onToolChange(null);
                }
              }}
            >
              <Ruler aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Measurement tools</TooltipContent>
        </Tooltip>

        <div
          aria-label="Measurement tool"
          aria-hidden={!isOpen}
          inert={!isOpen}
          className={cn(
            "absolute left-[calc(100%+7px)] top-0 z-50 flex h-9 items-center gap-0.5 rounded-xl border px-1 shadow-xl shadow-foreground/10",
            "origin-left transition-[opacity,transform] duration-150 motion-reduce:transition-none",
            GLASS_SURFACE_CLASS,
            isOpen
              ? "pointer-events-auto translate-x-0 opacity-100"
              : "pointer-events-none -translate-x-1 opacity-0",
          )}
          role="group"
        >
          {TOOLS.map(({ icon: Icon, label, value }) => (
            <Tooltip key={value}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={label}
                  aria-pressed={activeTool === value}
                  className={cn(
                    "size-7 rounded-lg [&_svg]:size-3.5",
                    activeTool === value
                      ? TOOL_ICON_BUTTON_ACTIVE_CLASS
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => onToolChange(activeTool === value ? null : value)}
                >
                  <Icon aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{label}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}
