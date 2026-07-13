import type { RefObject } from "react";
import { Download, ImageDown } from "lucide-react";

import { downloadBlob } from "../../export/zipExport";

/** One named column of a CSV export; `values` are written top-to-bottom. */
export interface CsvColumn {
  header: string;
  values: Array<number | string>;
}

/** Turn a chart title into a safe, lowercase file stem. */
export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "chart"
  );
}

function escapeCsv(value: number | string | undefined): string {
  const text = value === undefined || value === null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Build a CSV string from column-major data; ragged columns are padded blank. */
export function buildCsv(columns: CsvColumn[]): string {
  const rowCount = columns.reduce((max, column) => Math.max(max, column.values.length), 0);
  const lines: string[] = [columns.map((column) => escapeCsv(column.header)).join(",")];
  for (let row = 0; row < rowCount; row += 1) {
    lines.push(columns.map((column) => escapeCsv(column.values[row])).join(","));
  }
  return lines.join("\n");
}

export function downloadCsv(fileName: string, columns: CsvColumn[]): void {
  const blob = new Blob([`﻿${buildCsv(columns)}`], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, fileName);
}

// Presentation properties that must travel with the clone: serialized SVG has no
// access to the page stylesheet, so Tailwind classes and `currentColor` would be
// lost. We copy the *resolved* computed values, which turns `currentColor` and
// CSS variables into concrete colors.
const SVG_STYLE_PROPS = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-dasharray",
  "stroke-linejoin",
  "stroke-linecap",
  "opacity",
  "color",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "text-anchor",
  "dominant-baseline",
];

function inlineComputedStyles(source: Element, clone: Element): void {
  const computed = window.getComputedStyle(source);
  let inline = "";
  for (const prop of SVG_STYLE_PROPS) {
    const value = computed.getPropertyValue(prop);
    if (value) {
      inline += `${prop}:${value};`;
    }
  }
  clone.setAttribute("style", inline);
  const sourceChildren = source.children;
  const cloneChildren = clone.children;
  for (let index = 0; index < sourceChildren.length; index += 1) {
    const child = sourceChildren[index];
    const clonedChild = cloneChildren[index];
    if (child && clonedChild) {
      inlineComputedStyles(child, clonedChild);
    }
  }
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** Rasterize a live chart `<svg>` to a PNG and download it. */
export async function exportSvgToPng(
  svg: SVGSVGElement,
  fileName: string,
  scale = 3,
): Promise<void> {
  const viewBox = svg.viewBox.baseVal;
  const width = viewBox && viewBox.width ? viewBox.width : svg.clientWidth || 360;
  const height = viewBox && viewBox.height ? viewBox.height : svg.clientHeight || 240;

  const clone = svg.cloneNode(true) as SVGSVGElement;
  inlineComputedStyles(svg, clone);
  clone.setAttribute("xmlns", SVG_NS);
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));

  // Opaque white backdrop so the PNG isn't transparent on dark backgrounds.
  const background = document.createElementNS(SVG_NS, "rect");
  background.setAttribute("x", "0");
  background.setAttribute("y", "0");
  background.setAttribute("width", String(width));
  background.setAttribute("height", String(height));
  background.setAttribute("fill", "#ffffff");
  clone.insertBefore(background, clone.firstChild);

  const serialized = new XMLSerializer().serializeToString(clone);
  const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialized)}`;

  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Failed to rasterize chart SVG."));
    image.src = svgUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context unavailable.");
  }
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  await new Promise<void>((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) {
        downloadBlob(blob, fileName);
      }
      resolve();
    }, "image/png");
  });
}

/** Download an already-rendered `<canvas>` (heatmaps) as a PNG. */
export async function exportCanvasToPng(
  canvas: HTMLCanvasElement,
  fileName: string,
): Promise<void> {
  await new Promise<void>((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) {
        downloadBlob(blob, fileName);
      }
      resolve();
    }, "image/png");
  });
}

const ACTION_BUTTON_CLASS =
  "flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground [&_svg]:size-3.5";

/**
 * Two compact icon buttons — export the chart as a PNG and its underlying data
 * as CSV — shared by every analysis/electronic chart card. The PNG button finds
 * the first `<svg class="plot-chart">` or `<canvas>` inside `targetRef`; the CSV
 * button pulls fresh columns from `csvColumns()` at click time.
 */
export function ChartExportButtons({
  targetRef,
  fileStem,
  csvColumns,
}: {
  targetRef: RefObject<HTMLElement | null>;
  fileStem: string;
  csvColumns: () => CsvColumn[];
}) {
  const handleImage = () => {
    const root = targetRef.current;
    if (!root) {
      return;
    }
    const svg = root.querySelector<SVGSVGElement>("svg.plot-chart");
    if (svg) {
      void exportSvgToPng(svg, `${fileStem}.png`);
      return;
    }
    const canvas = root.querySelector("canvas");
    if (canvas) {
      void exportCanvasToPng(canvas, `${fileStem}.png`);
    }
  };

  const handleCsv = () => {
    const columns = csvColumns();
    if (columns.length > 0) {
      downloadCsv(`${fileStem}.csv`, columns);
    }
  };

  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        aria-label="Export image (PNG)"
        title="Export image (PNG)"
        className={ACTION_BUTTON_CLASS}
        onClick={handleImage}
      >
        <ImageDown aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="Export data (CSV)"
        title="Export data (CSV)"
        className={ACTION_BUTTON_CLASS}
        onClick={handleCsv}
      >
        <Download aria-hidden="true" />
      </button>
    </div>
  );
}
