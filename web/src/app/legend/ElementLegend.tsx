import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

import type { PreviewSafeArea } from "../../scene/LatticeScene";
import { lambertLegendSwatchBackground } from "../../scene/renderAppearance";
import type { ElementLegendEntry } from "../elementLegend";
import { GLASS_SURFACE_CLASS } from "../surface";

export function ElementLegend({
  entries,
  safeArea,
}: {
  entries: ElementLegendEntry[];
  safeArea: PreviewSafeArea;
}) {
  return (
    <nav
      aria-label="Element legend"
      className={cn(
        "pointer-events-none absolute bottom-7 -translate-x-1/2 rounded-full border px-4 py-2 shadow-lg shadow-foreground/10",
        GLASS_SURFACE_CLASS,
      )}
      style={legendContainerStyle(safeArea)}
    >
      <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        {entries.map((entry) => (
          <li key={entry.element} className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden="true"
              data-slot="element-legend-swatch"
              className="size-[18px] shrink-0 rounded-full border border-foreground/10 shadow-sm"
              style={legendSphereStyle(entry.color)}
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

function legendContainerStyle(safeArea: PreviewSafeArea): CSSProperties {
  return {
    left: `calc(50% + ${(safeArea.left - safeArea.right) / 2}px)`,
    maxWidth: `min(calc(100vw - ${safeArea.left + safeArea.right + 32}px), 760px)`,
  };
}

function legendSphereStyle(color: string): CSSProperties {
  return {
    background: lambertLegendSwatchBackground(color),
  };
}
