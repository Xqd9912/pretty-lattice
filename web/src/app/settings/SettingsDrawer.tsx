import { PanelRightClose, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import {
  BOND_ALGORITHM_OPTIONS,
  type BondAlgorithm,
} from "../../api/scene";
import { GLASS_SURFACE_CLASS } from "../surface";
import {
  INTERACTION_MODE_OPTIONS,
  type InteractionMode,
} from "../viewState";

export function SettingsTrigger({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            aria-controls="settings-drawer"
            aria-expanded={isOpen}
            aria-label="Open advanced settings"
            className={cn(
              "absolute right-4 top-4 rounded-full shadow-xl shadow-foreground/10 transition-[opacity,translate] duration-200 ease-out hover:-translate-x-0.5",
              GLASS_SURFACE_CLASS,
              isOpen ? "pointer-events-none translate-x-1 opacity-0" : "opacity-100",
            )}
            onClick={() => onOpenChange(true)}
          >
            <SlidersHorizontal data-icon="inline-start" aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">Advanced settings</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function SettingsDrawer({
  bondAlgorithm,
  interactionMode,
  isOpen,
  isSceneLoading,
  onBondAlgorithmChange,
  onInteractionModeChange,
  onOpenChange,
}: {
  bondAlgorithm: BondAlgorithm;
  interactionMode: InteractionMode;
  isOpen: boolean;
  isSceneLoading: boolean;
  onBondAlgorithmChange: (bondAlgorithm: BondAlgorithm) => void;
  onInteractionModeChange: (interactionMode: InteractionMode) => void;
  onOpenChange: (isOpen: boolean) => void;
}) {
  return (
    <>
      <aside
        id="settings-drawer"
        aria-labelledby="settings-drawer-title"
        aria-hidden={!isOpen}
        className={cn(
          "absolute inset-y-0 right-0 flex w-[320px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden border-l shadow-2xl shadow-foreground/10",
          GLASS_SURFACE_CLASS,
          "transition-transform duration-200 ease-out motion-reduce:transition-none",
          isOpen ? "translate-x-0" : "pointer-events-none translate-x-full",
        )}
      >
        <div className="flex h-16 shrink-0 items-center px-4 pr-16">
          <h2 id="settings-drawer-title" className="text-[0.95rem] font-semibold leading-tight">
            Advanced Settings
          </h2>
        </div>

        <Separator />

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
          <section
            aria-labelledby="interaction-mode-label"
            className={cn("rounded-md border px-3 py-2.5", GLASS_SURFACE_CLASS)}
          >
            <div className="flex items-center justify-between gap-3">
              <h3
                id="interaction-mode-label"
                className="min-w-0 truncate text-sm font-medium leading-tight"
              >
                Rotation mode
              </h3>
            </div>
            <InteractionModeControl
              disabled={!isOpen}
              interactionMode={interactionMode}
              onInteractionModeChange={onInteractionModeChange}
            />
          </section>

          <section
            aria-labelledby="bond-algorithm-label"
            className={cn("rounded-md border px-3 py-2.5", GLASS_SURFACE_CLASS)}
          >
            <div className="flex items-center justify-between gap-3">
              <h3
                id="bond-algorithm-label"
                className="min-w-0 truncate text-sm font-medium leading-tight"
              >
                Bond algorithm
              </h3>
            </div>
            <Select
              value={bondAlgorithm}
              disabled={!isOpen || isSceneLoading}
              onValueChange={(value) => onBondAlgorithmChange(value as BondAlgorithm)}
            >
              <SelectTrigger
                size="sm"
                aria-label="Bond algorithm"
                className="mt-2 w-full bg-background/70"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectGroup>
                  {BOND_ALGORITHM_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </section>
        </div>
      </aside>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              aria-controls="settings-drawer"
              aria-expanded={isOpen}
              aria-label="Collapse settings"
              className={cn(
                "absolute right-4 top-4 rounded-full shadow-xl shadow-foreground/10 transition-[opacity,translate] duration-200 ease-out hover:-translate-x-0.5",
                GLASS_SURFACE_CLASS,
                isOpen ? "opacity-100" : "pointer-events-none translate-x-1 opacity-0",
              )}
              tabIndex={isOpen ? undefined : -1}
              onClick={() => onOpenChange(false)}
            >
              <PanelRightClose data-icon="inline-start" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">Collapse</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </>
  );
}

function InteractionModeControl({
  disabled,
  interactionMode,
  onInteractionModeChange,
}: {
  disabled: boolean;
  interactionMode: InteractionMode;
  onInteractionModeChange: (interactionMode: InteractionMode) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Rotation interaction mode"
      className="mt-2 grid grid-cols-2 gap-1 rounded-lg border border-input bg-background/70 p-1"
    >
      {INTERACTION_MODE_OPTIONS.map((option) => {
        const isSelected = option.value === interactionMode;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            className={cn(
              "h-8 rounded-md px-2 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
              isSelected
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
            disabled={disabled}
            onClick={() => onInteractionModeChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
