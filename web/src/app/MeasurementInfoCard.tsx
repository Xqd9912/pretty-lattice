import { Copy, Ruler, X } from "lucide-react";
import { useCallback, useMemo } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { SceneSpec } from "../api/scene";
import {
  atomInstanceIdentity,
  resolveMeasurement,
  sameAtomInstance,
  type AtomInstanceIdentity,
  type MeasurementRecord,
  type MeasurementTool,
} from "../model/measurements";
import { atomDisplayNumber, formatCellOffset } from "./atomInspector";
import { GLASS_SURFACE_CLASS, TOOL_ICON_BUTTON_CLASS } from "./surface";

const TOOL_LABELS: Record<MeasurementTool, string> = {
  bond: "Bond length",
  distance: "Distance",
  angle: "Bond angle",
  dihedral: "Dihedral",
};

export function MeasurementInfoCard({
  activeTool,
  draft,
  isInspectorOpen,
  onClose,
  record,
  scene,
}: {
  activeTool: MeasurementTool;
  draft: readonly AtomInstanceIdentity[];
  isInspectorOpen: boolean;
  onClose: () => void;
  record: MeasurementRecord | null;
  scene: SceneSpec;
}) {
  const resolved = useMemo(
    () => record ? resolveMeasurement(scene, record) : null,
    [record, scene],
  );
  const pointIdentities = record?.points ?? draft;
  const pointAtoms = useMemo(
    () => pointIdentities.flatMap((identity) => {
      const atom = scene.atoms.find((candidate) => sameAtomInstance(
        identity,
        atomInstanceIdentity(candidate),
      ));
      return atom ? [atom] : [];
    }),
    [pointIdentities, scene.atoms],
  );
  const atoms = resolved?.atoms ?? pointAtoms;
  const title = resolved
    ? `${TOOL_LABELS[activeTool]} · ${resolved.label}`
    : record
      ? `${TOOL_LABELS[activeTool]} · Unavailable`
      : TOOL_LABELS[activeTool];
  const copyText = useMemo(() => [
    `Measurement: ${TOOL_LABELS[activeTool]}`,
    resolved
      ? `Result: ${resolved.label}`
      : record
        ? "Result: Unavailable"
        : `Progress: ${draft.length}`,
    ...atoms.map((atom, index) => (
      `Point ${index + 1}: #${atomDisplayNumber(atom)} ${atom.element}; cell ${formatCellOffset(atom.imageOffset)}`
    )),
  ].join("\n"), [activeTool, atoms, draft.length, resolved]);
  const handleCopy = useCallback(() => {
    void navigator.clipboard?.writeText(copyText);
  }, [copyText]);

  return (
    <aside
      aria-label="Measurement info"
      className={cn(
        "absolute right-16 top-4 z-30 w-[300px] rounded-xl border px-3 py-2.5 font-mono text-xs shadow-xl shadow-foreground/10",
        "transition-[right] duration-[260ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
        "max-[760px]:right-4 max-[760px]:top-14 max-[760px]:w-[calc(100vw-2rem)]",
        isInspectorOpen ? "min-[761px]:right-[376px]" : null,
        GLASS_SURFACE_CLASS,
      )}
    >
      <div className="grid h-7 grid-cols-[1.5rem_0.875rem_minmax(8rem,1fr)_1.5rem] items-center gap-2">
        <CardButton label="Close measurement" onClick={onClose}>
          <X aria-hidden="true" />
        </CardButton>
        <Ruler aria-hidden="true" className="size-3.5 text-sky-500" />
        <span className="min-w-0 truncate text-[0.78rem] font-semibold text-foreground">
          {title}
        </span>
        <CardButton label="Copy measurement info" onClick={handleCopy}>
          <Copy aria-hidden="true" />
        </CardButton>
      </div>

      {atoms.length > 0 ? (
        <dl className="mt-2 grid grid-cols-[3.6rem_minmax(0,1fr)] gap-x-2 gap-y-1 tabular-nums">
          {atoms.map((atom, index) => (
            <div key={`${atom.id}:${index}`} className="contents">
              <dt className="text-muted-foreground">Point {index + 1}</dt>
              <dd className="truncate text-right text-foreground">
                #{atomDisplayNumber(atom)} {atom.element} · cell {formatCellOffset(atom.imageOffset)}
              </dd>
            </div>
          ))}
          {!resolved && !record ? (
            <>
              <dt className="text-muted-foreground">Next</dt>
              <dd className="text-right text-foreground">
                {activeTool === "bond"
                  ? "Click a visible bond"
                  : `Pick point ${draft.length + 1}`}
              </dd>
            </>
          ) : null}
        </dl>
      ) : (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {record
            ? "The selected atoms are currently hidden or outside the displayed cell range."
            : activeTool === "bond"
              ? "Click a visible bond."
              : "Pick the first visible atom."}
        </p>
      )}
    </aside>
  );
}

function CardButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <TooltipProvider delayDuration={500}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={label}
            className={cn(TOOL_ICON_BUTTON_CLASS, "size-6 rounded-[9px] [&_svg]:size-3.25")}
            onClick={onClick}
          >
            {children}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
