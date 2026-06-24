import { FolderOpen } from "lucide-react";
import { useMemo } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import type { SceneSpec } from "../../api/scene";
import {
  CellMetric,
  SummaryRow,
  SymmetryMetric,
  formatPointGroupTitle,
  formatSpaceGroupTitle,
  renderFormula,
  renderPointGroup,
  renderSpaceGroup,
} from "./structureSummaryFormatting";
import { summarizeScene, type PreviewStatus } from "../previewState";
import { GLASS_SURFACE_CLASS } from "../surface";

export function StructureSummaryCard({
  errorMessage,
  onOpenStructure,
  previewStatus,
  scene,
  selectedFileName,
}: {
  errorMessage: string | null;
  onOpenStructure: () => void;
  previewStatus: PreviewStatus;
  scene: SceneSpec | null;
  selectedFileName: string | null;
}) {
  const summary = useMemo(() => summarizeScene(scene), [scene]);

  return (
    <aside
      className={cn(
        "rounded-xl border px-3 py-3.5 shadow-xl shadow-foreground/10",
        GLASS_SURFACE_CLASS,
      )}
      aria-label="Current structure"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <img
            src="/favicon.svg"
            alt=""
            className="size-7 shrink-0"
          />
          <div className="min-w-0">
            <h1 className="truncate text-[0.95rem] font-semibold leading-tight">Pretty Lattice</h1>
          </div>
        </div>

        <Button
          size="sm"
          aria-label="Open structure"
          className="h-7 gap-1.5 rounded-full px-2.5 text-xs transition-colors duration-150 ease-out active:bg-primary/80 [&_svg]:size-3.5"
          disabled={previewStatus === "loading"}
          onClick={onOpenStructure}
        >
          <FolderOpen data-icon="inline-start" aria-hidden="true" />
          <span>Open</span>
        </Button>
      </div>

      {selectedFileName ? <Separator className="my-2.5" /> : null}

      <div className="flex flex-col gap-1">
        {selectedFileName ? (
          <SummaryRow
            label="File"
            value={selectedFileName}
            title={selectedFileName}
          />
        ) : null}

        {scene ? (
          <>
            <SummaryRow
              label="Formula"
              value={renderFormula(summary.formula)}
              mono={false}
            />
            <SummaryRow label="Atoms" value={summary.atomCount} />
          </>
        ) : null}
      </div>

      {errorMessage ? (
        <Alert variant="destructive" className="mt-2 rounded-md px-2.5 py-2">
          <AlertDescription className="font-mono text-xs leading-snug">
            {errorMessage}
          </AlertDescription>
        </Alert>
      ) : null}

      {scene?.warnings?.map((warning) => (
        <Alert key={warning.code} className="mt-2 rounded-md px-2.5 py-2">
          <AlertDescription className="text-xs leading-snug">
            {warning.message}
          </AlertDescription>
        </Alert>
      ))}

      {scene ? (
        <div className="mt-2.5 flex flex-col gap-2.5 max-[760px]:hidden">
          <Separator />
          <div>
            <span className="block text-xs font-bold text-muted-foreground">Symmetry</span>
            {summary.symmetry?.available ? (
              <dl className="mt-1.5 flex flex-col gap-1 text-sm">
                <SymmetryMetric
                  label="Space group"
                  value={renderSpaceGroup(
                    summary.symmetry.spaceGroup,
                    summary.symmetry.spaceGroupNumber,
                  )}
                  title={formatSpaceGroupTitle(
                    summary.symmetry.spaceGroup,
                    summary.symmetry.spaceGroupNumber,
                  )}
                />
                <SymmetryMetric
                  label="Point group"
                  value={renderPointGroup(
                    summary.symmetry.pointGroup,
                    summary.symmetry.pointGroupSchoenflies,
                  )}
                  title={formatPointGroupTitle(
                    summary.symmetry.pointGroup,
                    summary.symmetry.pointGroupSchoenflies,
                  )}
                />
                <SymmetryMetric
                  label="Crystal system"
                  value={summary.symmetry.crystalSystem ?? "-"}
                />
              </dl>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">Symmetry unavailable</p>
            )}
          </div>

          {summary.cell ? (
            <>
              <Separator />
              <div>
                <span className="block text-xs font-bold text-muted-foreground">
                  Lattice Parameters
                </span>
                <dl className="mt-1.5 grid grid-cols-3 gap-x-3 gap-y-1 font-mono text-sm">
                  <CellMetric label="a" value={summary.cell.a} unit="Å" />
                  <CellMetric label="b" value={summary.cell.b} unit="Å" />
                  <CellMetric label="c" value={summary.cell.c} unit="Å" />
                  <CellMetric label="α" value={summary.cell.alpha} unit="°" />
                  <CellMetric label="β" value={summary.cell.beta} unit="°" />
                  <CellMetric label="γ" value={summary.cell.gamma} unit="°" />
                </dl>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
