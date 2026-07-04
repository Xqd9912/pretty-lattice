import { useEffect, useMemo, useRef } from "react";

export type DensityColormap = "viridis" | "magma" | "gray";

const STOPS: Record<DensityColormap, [number, number, number][]> = {
  viridis: [
    [68, 1, 84], [72, 40, 120], [62, 74, 137], [49, 104, 142],
    [38, 130, 142], [31, 158, 137], [53, 183, 121], [110, 206, 88], [253, 231, 37],
  ],
  magma: [
    [0, 0, 4], [28, 16, 68], [79, 18, 123], [129, 37, 129],
    [181, 54, 122], [229, 80, 100], [251, 135, 97], [254, 194, 135], [252, 253, 191],
  ],
  gray: [
    [10, 10, 10], [255, 255, 255],
  ],
};

function sample(colormap: DensityColormap, t: number): [number, number, number] {
  const stops = STOPS[colormap];
  const clamped = Math.min(1, Math.max(0, t));
  const scaled = clamped * (stops.length - 1);
  const lo = Math.floor(scaled);
  const hi = Math.min(stops.length - 1, lo + 1);
  const frac = scaled - lo;
  const a = stops[lo] ?? [0, 0, 0];
  const b = stops[hi] ?? a;
  return [
    Math.round(a[0] + (b[0] - a[0]) * frac),
    Math.round(a[1] + (b[1] - a[1]) * frac),
    Math.round(a[2] + (b[2] - a[2]) * frac),
  ];
}

const MAX_SIZE = 260;

/**
 * Heatmap for an arbitrary rows×cols matrix (CHGCAR slices are not necessarily
 * square). Values are mapped through `[vmin, vmax]`; the canvas is drawn at the
 * grid resolution and scaled up with nearest-neighbor sampling.
 */
export function DensityHeatmap({
  matrix,
  colormap,
  vmin,
  vmax,
  rowLabel,
  colLabel,
}: {
  matrix: number[][];
  colormap: DensityColormap;
  vmin: number;
  vmax: number;
  rowLabel: string;
  colLabel: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rows = matrix.length;
  const cols = matrix[0]?.length ?? 0;

  const { displayWidth, displayHeight } = useMemo(() => {
    if (rows === 0 || cols === 0) {
      return { displayWidth: MAX_SIZE, displayHeight: MAX_SIZE };
    }
    const scale = MAX_SIZE / Math.max(rows, cols);
    return {
      displayWidth: Math.round(cols * scale),
      displayHeight: Math.round(rows * scale),
    };
  }, [rows, cols]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || rows === 0 || cols === 0) {
      return;
    }
    const source = document.createElement("canvas");
    source.width = cols;
    source.height = rows;
    const sourceCtx = source.getContext("2d");
    const ctx = canvas.getContext("2d");
    if (!sourceCtx || !ctx) {
      return;
    }
    const span = vmax - vmin || 1;
    const image = sourceCtx.createImageData(cols, rows);
    for (let row = 0; row < rows; row += 1) {
      // Flip rows so the axis origin is at the bottom-left.
      const sourceRow = matrix[rows - 1 - row];
      for (let col = 0; col < cols; col += 1) {
        const value = sourceRow?.[col] ?? 0;
        const [r, g, b] = sample(colormap, (value - vmin) / span);
        const offset = (row * cols + col) * 4;
        image.data[offset] = r;
        image.data[offset + 1] = g;
        image.data[offset + 2] = b;
        image.data[offset + 3] = 255;
      }
    }
    sourceCtx.putImageData(image, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  }, [matrix, colormap, vmin, vmax, rows, cols]);

  const colorbar = [0, 0.25, 0.5, 0.75, 1].map((t) => sample(colormap, t));

  return (
    <div className="plot-labels flex items-end gap-2 text-[10px] text-muted-foreground">
      <div className="flex flex-col gap-1">
        <canvas
          ref={canvasRef}
          width={displayWidth}
          height={displayHeight}
          className="rounded-sm border border-border"
          style={{ width: displayWidth, height: displayHeight }}
        />
        <div className="text-center" style={{ width: displayWidth }}>
          {colLabel}
        </div>
      </div>
      <div className="flex flex-col items-center gap-1 pb-4">
        <span className="[writing-mode:vertical-rl] rotate-180">{rowLabel}</span>
      </div>
      <div className="flex flex-col items-center gap-1 pb-4">
        <span>{vmax.toFixed(2)}</span>
        <div
          className="h-[160px] w-3 rounded-sm border border-border"
          style={{
            background: `linear-gradient(to top, ${colorbar
              .map((c) => `rgb(${c[0]},${c[1]},${c[2]})`)
              .join(",")})`,
          }}
        />
        <span>{vmin.toFixed(2)}</span>
      </div>
    </div>
  );
}
