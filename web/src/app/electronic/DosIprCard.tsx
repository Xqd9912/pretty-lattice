import { useRef, useState } from "react";

import { ChartExportButtons, type CsvColumn } from "../analysis/chartExport";
import { DosIprChart } from "./DosIprChart";

const NUMBER_INPUT_CLASS =
  "h-6 w-14 rounded border border-border bg-background px-1 text-center font-mono text-[11px]";

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

export function DosIprCard({
  dosEnergy,
  dosTotal,
  iprEnergy,
  iprValue,
  efermi,
}: {
  dosEnergy: number[];
  dosTotal: number[];
  iprEnergy: number[];
  iprValue: number[];
  efermi: number;
}) {
  const [dosColor, setDosColor] = useState("#2563eb");
  const [iprColor, setIprColor] = useState("#dc2626");
  const [dosWidth, setDosWidth] = useState(1.5);
  const [barWidth, setBarWidth] = useState(0.6);
  const [xMin, setXMin] = useState("");
  const [xMax, setXMax] = useState("");
  const [dosMin, setDosMin] = useState("");
  const [dosMax, setDosMax] = useState("");
  const [iprMin, setIprMin] = useState("");
  const [iprMax, setIprMax] = useState("");
  const cardRef = useRef<HTMLElement>(null);

  const csvColumns = (): CsvColumn[] => [
    { header: "dos_energy (eV)", values: dosEnergy },
    { header: "dos", values: dosTotal },
    { header: "ipr_energy (eV)", values: iprEnergy },
    { header: "ipr", values: iprValue },
  ];

  return (
    <section ref={cardRef} className="flex flex-col gap-2 rounded-lg border border-border bg-background p-2">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-foreground">DOS &amp; IPR</h3>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <label className="flex items-center gap-1">
            DOS w
            <input type="range" min={0.5} max={4} step={0.5} value={dosWidth} className="h-1 w-12 accent-foreground" onChange={(e) => setDosWidth(Number(e.currentTarget.value))} />
          </label>
          <label className="flex items-center gap-1">
            IPR w
            <input type="range" min={0.3} max={2} step={0.1} value={barWidth} className="h-1 w-12 accent-foreground" onChange={(e) => setBarWidth(Number(e.currentTarget.value))} />
          </label>
          <ChartExportButtons targetRef={cardRef} fileStem="dos-ipr" csvColumns={csvColumns} />
        </div>
      </div>

      <DosIprChart
        dosEnergy={dosEnergy}
        dosTotal={dosTotal}
        iprEnergy={iprEnergy}
        iprValue={iprValue}
        dosColor={dosColor}
        iprColor={iprColor}
        dosWidth={dosWidth}
        barWidth={barWidth}
        xDomain={domainFrom(xMin, xMax)}
        dosDomain={domainFrom(dosMin, dosMax)}
        iprDomain={domainFrom(iprMin, iprMax)}
      />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          x
          <input aria-label="DOS/IPR x min" placeholder="auto" value={xMin} className={NUMBER_INPUT_CLASS} onChange={(e) => setXMin(e.target.value)} />
          <input aria-label="DOS/IPR x max" placeholder="auto" value={xMax} className={NUMBER_INPUT_CLASS} onChange={(e) => setXMax(e.target.value)} />
        </span>
        <span className="flex items-center gap-1">
          DOS
          <input aria-label="DOS y min" placeholder="auto" value={dosMin} className={NUMBER_INPUT_CLASS} onChange={(e) => setDosMin(e.target.value)} />
          <input aria-label="DOS y max" placeholder="auto" value={dosMax} className={NUMBER_INPUT_CLASS} onChange={(e) => setDosMax(e.target.value)} />
        </span>
        <span className="flex items-center gap-1">
          IPR
          <input aria-label="IPR y min" placeholder="auto" value={iprMin} className={NUMBER_INPUT_CLASS} onChange={(e) => setIprMin(e.target.value)} />
          <input aria-label="IPR y max" placeholder="auto" value={iprMax} className={NUMBER_INPUT_CLASS} onChange={(e) => setIprMax(e.target.value)} />
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-foreground">
        <label className="flex items-center gap-1">
          <input type="color" aria-label="DOS color" value={dosColor} className="h-3 w-4 cursor-pointer border-0 bg-transparent p-0" onChange={(e) => setDosColor(e.target.value)} />
          DOS
        </label>
        <label className="flex items-center gap-1">
          <input type="color" aria-label="IPR color" value={iprColor} className="h-3 w-4 cursor-pointer border-0 bg-transparent p-0" onChange={(e) => setIprColor(e.target.value)} />
          IPR
        </label>
        <span className="text-muted-foreground">
          E_f = {efermi.toFixed(3)} eV · {iprEnergy.length} states
        </span>
      </div>
    </section>
  );
}
