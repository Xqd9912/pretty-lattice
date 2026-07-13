import { useCallback, useMemo, useRef, useState } from "react";
import { UploadCloud } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  uploadBwdf,
  uploadPairList,
  type BwdfResponse,
  type PairListResponse,
} from "../../api/electronic";
import { ChartExportButtons, slugify, type CsvColumn } from "../analysis/chartExport";
import { ScatterChart, type ScatterSeries } from "../analysis/ScatterChart";

type Status = "idle" | "loading" | "ready" | "error";

const PAIR_PALETTE = ["#2563eb", "#dc2626", "#059669", "#d97706", "#7c3aed", "#0891b2", "#db2777"];
const NUMBER_INPUT_CLASS =
  "h-6 w-14 rounded border border-border bg-background px-1 text-center font-mono text-[11px]";

function errorMessage(caught: unknown, fallback: string): string {
  return caught instanceof Error ? caught.message : fallback;
}

function parseBound(text: string): number | undefined {
  const value = Number.parseFloat(text);
  return Number.isFinite(value) ? value : undefined;
}

function domainFrom(minText: string, maxText: string): [number, number] | undefined {
  const min = parseBound(minText);
  const max = parseBound(maxText);
  if (min === undefined || max === undefined || max <= min) {
    return undefined;
  }
  return [min, max];
}

/** Four inputs (x min/max, y min/max) for manual axis-range control; blank = auto. */
function AxisRangeInputs({
  title,
  xMin,
  xMax,
  yMin,
  yMax,
  onXMin,
  onXMax,
  onYMin,
  onYMax,
}: {
  title: string;
  xMin: string;
  xMax: string;
  yMin: string;
  yMax: string;
  onXMin: (value: string) => void;
  onXMax: (value: string) => void;
  onYMin: (value: string) => void;
  onYMax: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
      <span className="flex items-center gap-1">
        x
        <input
          aria-label={`${title} x min`}
          placeholder="auto"
          value={xMin}
          className={NUMBER_INPUT_CLASS}
          onChange={(event) => onXMin(event.target.value)}
        />
        <input
          aria-label={`${title} x max`}
          placeholder="auto"
          value={xMax}
          className={NUMBER_INPUT_CLASS}
          onChange={(event) => onXMax(event.target.value)}
        />
      </span>
      <span className="flex items-center gap-1">
        y
        <input
          aria-label={`${title} y min`}
          placeholder="auto"
          value={yMin}
          className={NUMBER_INPUT_CLASS}
          onChange={(event) => onYMin(event.target.value)}
        />
        <input
          aria-label={`${title} y max`}
          placeholder="auto"
          value={yMax}
          className={NUMBER_INPUT_CLASS}
          onChange={(event) => onYMax(event.target.value)}
        />
      </span>
    </div>
  );
}

function UploadButton({
  disabled,
  label,
  onFile,
}: {
  disabled?: boolean;
  label: string;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) {
            onFile(file);
          }
        }}
      />
      <Button
        size="sm"
        variant="outline"
        className="w-fit"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        <UploadCloud aria-hidden="true" />
        {label}
      </Button>
    </>
  );
}

/** Shared point-size control used by both scatter cards. */
function SizeControl({ size, onChange }: { size: number; onChange: (size: number) => void }) {
  return (
    <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
      size
      <input
        type="range"
        min={1}
        max={6}
        step={0.5}
        value={size}
        className="h-1 w-16 accent-foreground"
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </label>
  );
}

/**
 * ICOHP/ICOOP scatter: one series per element pair (Ge-Ge, Ge-Se, Se-Se), each
 * with a color and a checkbox to toggle it in/out of the plot — the same
 * per-pair selection model the radial distribution g(r) uses. x is the bond
 * length, y is the integrated population.
 */
function PairScatterCard({ data, title }: { data: PairListResponse; title: string }) {
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [colors, setColors] = useState<Record<string, string>>({});
  const [size, setSize] = useState(2.5);
  const [xMin, setXMin] = useState("");
  const [xMax, setXMax] = useState("");
  const [yMin, setYMin] = useState("");
  const [yMax, setYMax] = useState("");
  const cardRef = useRef<HTMLElement>(null);

  // ICOHP is conventionally plotted as −ICOHP so that bonding states point up
  // (more positive = more bonding); ICOOP already has that sign convention.
  const negate = data.kind === "icohp";

  const pointsByPair = useMemo(() => {
    const grouped: Record<string, { x: number; y: number }[]> = {};
    for (const record of data.records) {
      (grouped[record.pair] ??= []).push({
        x: record.distance,
        y: negate ? -record.value : record.value,
      });
    }
    return grouped;
  }, [data, negate]);

  const colorFor = useCallback(
    (pair: string, index: number) => colors[pair] ?? PAIR_PALETTE[index % PAIR_PALETTE.length]!,
    [colors],
  );

  const series: ScatterSeries[] = data.pairs
    .filter((pair) => !hidden[pair])
    .map((pair) => ({
      label: pair,
      points: pointsByPair[pair] ?? [],
      color: colorFor(pair, data.pairs.indexOf(pair)),
      size,
    }));

  const yLabel = negate ? "−ICOHP (eV)" : "ICOOP";

  const csvColumns = (): CsvColumn[] =>
    data.pairs.flatMap((pair) => {
      const points = pointsByPair[pair] ?? [];
      return [
        { header: `${pair} r (Å)`, values: points.map((point) => point.x) },
        { header: `${pair} ${yLabel}`, values: points.map((point) => point.y) },
      ];
    });

  return (
    <section ref={cardRef} className="flex flex-col gap-2 rounded-lg border border-border bg-background p-2">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
        <div className="flex items-center gap-3">
          <SizeControl size={size} onChange={setSize} />
          <ChartExportButtons targetRef={cardRef} fileStem={slugify(title)} csvColumns={csvColumns} />
        </div>
      </div>
      <ScatterChart
        series={series}
        xLabel="bond length r (Å)"
        yLabel={yLabel}
        xDomain={domainFrom(xMin, xMax)}
        yDomain={domainFrom(yMin, yMax)}
      />
      <AxisRangeInputs
        title={title}
        xMin={xMin}
        xMax={xMax}
        yMin={yMin}
        yMax={yMax}
        onXMin={setXMin}
        onXMax={setXMax}
        onYMin={setYMin}
        onYMax={setYMax}
      />
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {data.pairs.map((pair, index) => {
          const color = colorFor(pair, index);
          const count = pointsByPair[pair]?.length ?? 0;
          return (
            <label key={pair} className="flex items-center gap-1 text-[11px] text-foreground">
              <input
                type="checkbox"
                checked={!hidden[pair]}
                className="size-3 accent-foreground"
                onChange={(event) =>
                  setHidden((current) => ({ ...current, [pair]: !event.target.checked }))
                }
              />
              <input
                type="color"
                aria-label={`${pair} color`}
                value={color}
                className="h-3 w-4 cursor-pointer border-0 bg-transparent p-0"
                onChange={(event) =>
                  setColors((current) => ({ ...current, [pair]: event.target.value }))
                }
              />
              {pair} ({count})
            </label>
          );
        })}
      </div>
    </section>
  );
}

function BwdfScatterCard({ data }: { data: BwdfResponse }) {
  const [size, setSize] = useState(2);
  const [color, setColor] = useState("#111827");
  const [xMin, setXMin] = useState("");
  const [xMax, setXMax] = useState("");
  const [yMin, setYMin] = useState("");
  const [yMax, setYMax] = useState("");
  const cardRef = useRef<HTMLElement>(null);

  const csvColumns = (): CsvColumn[] => [
    { header: "r (Å)", values: data.r },
    { header: "BWDF", values: data.value },
  ];

  const series: ScatterSeries[] = [
    {
      label: "BWDF",
      points: data.r.map((r, index) => ({ x: r, y: data.value[index] ?? 0 })),
      color,
      size,
    },
  ];

  return (
    <section ref={cardRef} className="flex flex-col gap-2 rounded-lg border border-border bg-background p-2">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-foreground">Bond-weighted distribution</h3>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <input
              type="color"
              aria-label="BWDF color"
              value={color}
              className="h-3 w-4 cursor-pointer border-0 bg-transparent p-0"
              onChange={(event) => setColor(event.target.value)}
            />
            color
          </label>
          <SizeControl size={size} onChange={setSize} />
          <ChartExportButtons targetRef={cardRef} fileStem="bwdf" csvColumns={csvColumns} />
        </div>
      </div>
      <ScatterChart
        series={series}
        xLabel="bond length r (Å)"
        yLabel="BWDF"
        xDomain={domainFrom(xMin, xMax)}
        yDomain={domainFrom(yMin, yMax)}
      />
      <AxisRangeInputs
        title="BWDF"
        xMin={xMin}
        xMax={xMax}
        yMin={yMin}
        yMax={yMax}
        onXMin={setXMin}
        onXMax={setXMax}
        onYMin={setYMin}
        onYMax={setYMax}
      />
    </section>
  );
}

/**
 * LOBSTER bonding-analysis section: scatter plots of BWDF and the per-pair
 * ICOHP/ICOOP integrated populations against bond length.
 */
export function LobsterSection({ onError }: { onError: (message: string | null) => void }) {
  const [bwdf, setBwdf] = useState<BwdfResponse | null>(null);
  const [bwdfStatus, setBwdfStatus] = useState<Status>("idle");
  const [icohp, setIcohp] = useState<PairListResponse | null>(null);
  const [icohpStatus, setIcohpStatus] = useState<Status>("idle");
  const [icoop, setIcoop] = useState<PairListResponse | null>(null);
  const [icoopStatus, setIcoopStatus] = useState<Status>("idle");

  const loadBwdf = useCallback(
    async (file: File) => {
      setBwdfStatus("loading");
      onError(null);
      try {
        setBwdf(await uploadBwdf(file));
        setBwdfStatus("ready");
      } catch (caught) {
        setBwdfStatus("error");
        onError(errorMessage(caught, "BWDF load failed."));
      }
    },
    [onError],
  );

  const loadPairList = useCallback(
    async (file: File, kind: "icohp" | "icoop") => {
      const setStatus = kind === "icohp" ? setIcohpStatus : setIcoopStatus;
      const setData = kind === "icohp" ? setIcohp : setIcoop;
      setStatus("loading");
      onError(null);
      try {
        setData(await uploadPairList(file, kind));
        setStatus("ready");
      } catch (caught) {
        setStatus("error");
        onError(errorMessage(caught, `${kind.toUpperCase()} load failed.`));
      }
    },
    [onError],
  );

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <h3 className="text-[13px] font-bold text-muted-foreground">LOBSTER bonding analysis</h3>
        <div className="flex flex-wrap gap-2">
          <UploadButton
            label={bwdfStatus === "loading" ? "Loading BWDF…" : "Load BWDF"}
            disabled={bwdfStatus === "loading"}
            onFile={(file) => void loadBwdf(file)}
          />
          <UploadButton
            label={icohpStatus === "loading" ? "Loading ICOHP…" : "Load ICOHPLIST"}
            disabled={icohpStatus === "loading"}
            onFile={(file) => void loadPairList(file, "icohp")}
          />
          <UploadButton
            label={icoopStatus === "loading" ? "Loading ICOOP…" : "Load ICOOPLIST"}
            disabled={icoopStatus === "loading"}
            onFile={(file) => void loadPairList(file, "icoop")}
          />
        </div>
      </section>

      {bwdf ? <BwdfScatterCard data={bwdf} /> : null}
      {icohp ? <PairScatterCard data={icohp} title="ICOHP per bond" /> : null}
      {icoop ? <PairScatterCard data={icoop} title="ICOOP per bond" /> : null}
    </div>
  );
}
