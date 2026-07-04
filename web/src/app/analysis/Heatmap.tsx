import { useEffect, useMemo, useRef } from "react";

export type Colormap = "viridis" | "magma" | "gray";

const STOPS: Record<Colormap, [number, number, number][]> = {
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

function sample(colormap: Colormap, t: number): [number, number, number] {
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

interface HeatmapProps {
  matrix: number[][];
  axis: number[];
  colormap: Colormap;
  vmax?: number | null;
  xLabel?: string;
  yLabel?: string;
}

const SIZE = 240;

export function Heatmap({ matrix, axis, colormap, vmax, xLabel, yLabel }: HeatmapProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const maxValue = useMemo(() => {
    if (vmax && vmax > 0) {
      return vmax;
    }
    let peak = 0;
    for (const row of matrix) {
      for (const value of row) {
        if (value > peak) {
          peak = value;
        }
      }
    }
    return peak || 1;
  }, [matrix, vmax]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const n = matrix.length;
    if (!canvas || n === 0) {
      return;
    }
    const source = document.createElement("canvas");
    source.width = n;
    source.height = n;
    const sourceCtx = source.getContext("2d");
    const ctx = canvas.getContext("2d");
    if (!sourceCtx || !ctx) {
      return;
    }
    const image = sourceCtx.createImageData(n, n);
    for (let row = 0; row < n; row += 1) {
      for (let col = 0; col < n; col += 1) {
        // Flip rows so the axis origin is at the bottom-left.
        const value = matrix[n - 1 - row]?.[col] ?? 0;
        const [r, g, b] = sample(colormap, value / maxValue);
        const offset = (row * n + col) * 4;
        image.data[offset] = r;
        image.data[offset + 1] = g;
        image.data[offset + 2] = b;
        image.data[offset + 3] = 255;
      }
    }
    sourceCtx.putImageData(image, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.drawImage(source, 0, 0, SIZE, SIZE);
  }, [matrix, colormap, maxValue]);

  const axisMin = axis[0] ?? 0;
  const axisMax = axis[axis.length - 1] ?? 1;
  const ticks = [axisMin, (axisMin + axisMax) / 2, axisMax].map((value) => value.toFixed(1));
  const colorbar = [0, 0.25, 0.5, 0.75, 1].map((t) => sample(colormap, t));

  return (
    <div className="plot-labels flex flex-col gap-1 text-[10px] text-muted-foreground">
      <div className="flex items-start gap-2">
        <div className="flex flex-col items-end justify-between py-0.5" style={{ height: SIZE }}>
          <span>{ticks[2]}</span>
          <span>{ticks[1]}</span>
          <span>{ticks[0]}</span>
        </div>
        <div className="flex flex-col gap-1">
          <canvas
            ref={canvasRef}
            width={SIZE}
            height={SIZE}
            className="rounded-sm border border-border"
            style={{ width: SIZE, height: SIZE }}
          />
          <div className="flex justify-between" style={{ width: SIZE }}>
            <span>{ticks[0]}</span>
            <span>{ticks[1]}</span>
            <span>{ticks[2]}</span>
          </div>
          {xLabel ? <div className="text-center" style={{ width: SIZE }}>{xLabel}</div> : null}
        </div>
        <div className="flex flex-col items-center gap-1">
          <div
            className="h-[180px] w-3 rounded-sm border border-border"
            style={{
              background: `linear-gradient(to top, ${colorbar
                .map((c) => `rgb(${c[0]},${c[1]},${c[2]})`)
                .join(",")})`,
            }}
          />
          <span>{maxValue.toFixed(2)}</span>
          <span>0</span>
        </div>
      </div>
      {yLabel ? <div className="pl-6">{yLabel}</div> : null}
    </div>
  );
}
