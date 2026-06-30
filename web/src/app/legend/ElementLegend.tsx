import { useRef, useState, type CSSProperties } from "react";

import { cn } from "@/lib/utils";

import type { PreviewSafeArea } from "../../model/layout";
import { lambertLegendSwatchBackground } from "../../scene/renderAppearance";
import type { ElementLegendEntry } from "../elementLegend";
import { GLASS_SURFACE_CLASS } from "../surface";

export function ElementLegend({
  entries,
  offsetX = 0,
  onElementColorChange,
  safeArea,
}: {
  entries: ElementLegendEntry[];
  offsetX?: number;
  onElementColorChange?: (element: string, color: string) => void;
  safeArea: PreviewSafeArea;
}) {
  const [activeColorPickerElement, setActiveColorPickerElement] = useState<string | null>(null);

  return (
    <nav
      aria-label="Element legend"
      className={cn(
        "pointer-events-none absolute bottom-7 -translate-x-1/2 rounded-full border px-4 py-2 shadow-lg shadow-foreground/10 transition-[left,max-width] duration-[260ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
        GLASS_SURFACE_CLASS,
      )}
      style={legendContainerStyle(safeArea, offsetX)}
    >
      <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        {entries.map((entry) => (
          <li key={entry.element} className="flex min-w-0 items-center gap-2">
            <ElementLegendColorControl
              active={activeColorPickerElement === entry.element}
              color={entry.color}
              element={entry.element}
              onElementColorChange={onElementColorChange}
              onPickerActiveChange={setActiveColorPickerElement}
            />
            <span className="font-sans text-[0.95rem] font-normal leading-none text-foreground">
              {entry.element}
            </span>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function ElementLegendColorControl({
  active,
  color,
  element,
  onElementColorChange,
  onPickerActiveChange,
}: {
  active: boolean;
  color: string;
  element: string;
  onElementColorChange?: (element: string, color: string) => void;
  onPickerActiveChange: (element: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const nativeColor = nativeColorValue(color);

  function handleOpenPicker() {
    if (!onElementColorChange) {
      return;
    }

    const input = inputRef.current;
    if (!input) {
      return;
    }

    if (active) {
      input.blur();
      onPickerActiveChange(null);
      return;
    }

    onPickerActiveChange(element);

    try {
      if (typeof input.showPicker === "function") {
        input.showPicker();
        return;
      }
    } catch {
      // Fall through to the click fallback for browsers that expose but reject showPicker.
    }

    input.click();
  }

  if (!onElementColorChange) {
    return (
      <span
        aria-hidden="true"
        data-slot="element-legend-swatch"
        className="size-[18px] shrink-0 rounded-full border border-foreground/10 shadow-sm"
        style={legendSphereStyle(color)}
      />
    );
  }

  return (
    <span className="relative inline-flex size-[18px] shrink-0">
      <button
        type="button"
        aria-label={`Set ${element} color`}
        className="pointer-events-auto inline-flex size-[18px] shrink-0 items-center justify-center rounded-full bg-transparent p-0 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        onClick={handleOpenPicker}
      >
        <span
          aria-hidden="true"
          data-slot="element-legend-swatch"
          className="size-[18px] shrink-0 rounded-full border border-foreground/10 shadow-sm"
          style={legendSphereStyle(color)}
        />
      </button>
      <input
        ref={inputRef}
        type="color"
        aria-label={`${element} color value`}
        tabIndex={-1}
        value={nativeColor}
        className="pointer-events-none absolute size-px opacity-0"
        onBlur={() => onPickerActiveChange(null)}
        onChange={(event) => {
          const nextColor = event.target.value.toLowerCase();
          onPickerActiveChange(null);
          if (nextColor !== nativeColor) {
            onElementColorChange(element, nextColor);
          }
        }}
      />
    </span>
  );
}

function legendContainerStyle(safeArea: PreviewSafeArea, offsetX: number): CSSProperties {
  return {
    left: `calc(50% + ${(safeArea.left - safeArea.right) / 2 + offsetX}px)`,
    maxWidth: `min(calc(100vw - ${safeArea.left + safeArea.right + 32}px), 760px)`,
  };
}

function legendSphereStyle(color: string): CSSProperties {
  return {
    background: lambertLegendSwatchBackground(color),
  };
}

function nativeColorValue(color: string) {
  if (/^#[\da-fA-F]{6}$/.test(color)) {
    return color.toLowerCase();
  }
  return "#808080";
}
