import {
  windowSeconds,
  type ChartSeriesId,
  type ChartTimeMode,
  type PumpChartConfig,
} from "../lib/calibration";

export type TelemetrySample = {
  t: number;
  flow: number;
  volume: number;
};

const WIDTH = 640;
const HEIGHT = 220;
const PAD = { top: 18, right: 48, bottom: 28, left: 48 };

const TICKS = 4;

function niceStep(value: number) {
  const exp = 10 ** Math.floor(Math.log10(value));
  const scaled = value / exp;
  const nice = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 2.5 ? 2.5 : scaled <= 5 ? 5 : 10;
  return nice * exp;
}

function niceRange(values: number[], includeZero: boolean): [number, number] {
  let lo = values.length ? Math.min(...values) : 0;
  let hi = values.length ? Math.max(...values) : 0;
  if (includeZero) {
    lo = Math.min(0, lo);
    hi = Math.max(0, hi);
  }
  if (hi - lo < 1e-9) {
    if (includeZero && lo === 0) {
      return [0, 1];
    }
    const pad = Math.max(1, Math.abs(hi) * 0.1);
    lo -= pad;
    hi += pad;
  }
  let step = niceStep((hi - lo) / TICKS);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const start = Math.floor(lo / step) * step;
    if (start + step * TICKS >= hi - 1e-9) {
      return [start, start + step * TICKS];
    }
    step = niceStep(step * 1.01);
  }
  return [lo, hi];
}

function formatTick(value: number) {
  if (Math.abs(value) < 1e-9) {
    return "0";
  }
  return Math.abs(value) >= 10 ? value.toFixed(0) : value.toFixed(1);
}

function toPath(points: { x: number; y: number }[]) {
  if (points.length === 0) {
    return "";
  }
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");
}

function formatClock(ts: number) {
  return new Date(ts).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDuration(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    return `${hours}h${String(minutes % 60).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function FlowChart({
  samples,
  chart,
  now = Date.now(),
}: {
  samples: TelemetrySample[];
  chart: PumpChartConfig;
  now?: number;
}) {
  const window = windowSeconds(chart.timeMode);
  const tMax = now;
  const tMin = window === null
    ? samples[0]?.t ?? tMax - 1000
    : tMax - window * 1000;
  const span = Math.max(1000, tMax - tMin);
  const visible = samples.filter((sample) => sample.t >= tMin && sample.t <= tMax);
  const series = chart.series;
  const showFlow = series.includes("flow");
  const showVolume = series.includes("volume");
  const [flowMin, flowMax] = niceRange(visible.map((sample) => sample.flow), true);
  const [volumeMin, volumeMax] = niceRange(visible.map((sample) => sample.volume), false);
  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;

  const mapX = (t: number) => PAD.left + ((t - tMin) / span) * innerW;
  const mapFlow = (value: number) =>
    PAD.top + innerH - ((value - flowMin) / (flowMax - flowMin)) * innerH;
  const mapVolume = (value: number) =>
    PAD.top + innerH - ((value - volumeMin) / (volumeMax - volumeMin)) * innerH;
  const flowZeroY = mapFlow(0);

  const flowPoints = visible.map((sample) => ({
    x: mapX(sample.t),
    y: mapFlow(sample.flow),
  }));
  const volumePoints = visible.map((sample) => ({
    x: mapX(sample.t),
    y: mapVolume(sample.volume),
  }));

  const last = visible[visible.length - 1];
  const ticks = TICKS;

  return (
    <div className="overflow-hidden rounded-[14px] bg-panel-2 ring-1 ring-border">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-[220px] w-full"
        role="img"
        aria-label="Gráfico de vazão e volume"
      >
        <defs>
          <linearGradient id={`flowFill-${chart.id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="oklch(48% 0.12 232)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="oklch(48% 0.12 232)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`volFill-${chart.id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#9b1b30" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#9b1b30" stopOpacity="0" />
          </linearGradient>
        </defs>
        {Array.from({ length: ticks + 1 }, (_, index) => {
          const y = PAD.top + (innerH * index) / ticks;
          return (
            <line
              key={index}
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y}
              y2={y}
              stroke="currentColor"
              className="text-border"
              strokeWidth="1"
            />
          );
        })}
        {showFlow && flowMin < 0 && (
          <line
            x1={PAD.left}
            x2={WIDTH - PAD.right}
            y1={flowZeroY}
            y2={flowZeroY}
            stroke="oklch(48% 0.12 232)"
            strokeOpacity="0.45"
            strokeDasharray="3 3"
            strokeWidth="1"
          />
        )}
        {showFlow && flowPoints.length > 1 && (
          <>
            <path
              d={`${toPath(flowPoints)} L ${flowPoints[flowPoints.length - 1].x.toFixed(1)} ${flowZeroY.toFixed(1)} L ${flowPoints[0].x.toFixed(1)} ${flowZeroY.toFixed(1)} Z`}
              fill={`url(#flowFill-${chart.id})`}
            />
            <path
              d={toPath(flowPoints)}
              fill="none"
              stroke="oklch(48% 0.12 232)"
              strokeWidth="2.4"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </>
        )}
        {showVolume && volumePoints.length > 1 && (
          <path
            d={toPath(volumePoints)}
            fill="none"
            stroke="#9b1b30"
            strokeWidth="2.4"
            strokeDasharray={showFlow ? "6 4" : undefined}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {visible.length <= 1 && (
          <text
            x={WIDTH / 2}
            y={HEIGHT / 2}
            textAnchor="middle"
            className="fill-faint"
            fontSize="12"
          >
            Aguardando amostras…
          </text>
        )}
        {showFlow &&
          Array.from({ length: ticks + 1 }, (_, index) => {
            const value = flowMax - ((flowMax - flowMin) * index) / ticks;
            const y = PAD.top + (innerH * index) / ticks;
            return (
              <text
                key={`f-${index}`}
                x={PAD.left - 8}
                y={y + 3}
                textAnchor="end"
                fontSize="9"
                className="fill-muted-foreground"
              >
                {formatTick(value)}
              </text>
            );
          })}
        {showVolume &&
          Array.from({ length: ticks + 1 }, (_, index) => {
            const value = volumeMax - ((volumeMax - volumeMin) * index) / ticks;
            const y = PAD.top + (innerH * index) / ticks;
            return (
              <text
                key={`v-${index}`}
                x={WIDTH - PAD.right + 8}
                y={y + 3}
                textAnchor="start"
                fontSize="9"
                className="fill-muted-foreground"
              >
                {formatTick(value)}
              </text>
            );
          })}
        <text
          x={PAD.left}
          y={HEIGHT - 6}
          fontSize="9"
          className="fill-faint"
        >
          {formatClock(tMin)}
        </text>
        <text
          x={WIDTH - PAD.right}
          y={HEIGHT - 6}
          textAnchor="end"
          fontSize="9"
          className="fill-faint"
        >
          {window === null ? formatDuration(span) : formatClock(tMax)}
        </text>
      </svg>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2">
        <div className="flex flex-wrap items-center gap-3 text-[11px]">
          {showFlow && (
            <span className="inline-flex items-center gap-1.5 text-run">
              <span className="h-0.5 w-4 rounded-full bg-run" />
              Vazão {last ? last.flow.toFixed(1) : "0.0"} mL/min
            </span>
          )}
          {showVolume && (
            <span className="inline-flex items-center gap-1.5 text-[#9b1b30]">
              <span className="h-0.5 w-4 rounded-full bg-[#9b1b30]" />
              Volume {last ? last.volume.toFixed(1) : "0.0"} mL
            </span>
          )}
        </div>
        <p className="font-mono text-[10px] text-faint">
          {visible.length} pts
        </p>
      </div>
    </div>
  );
}

export const TIME_MODE_OPTIONS: { id: ChartTimeMode; label: string }[] = [
  { id: "all", label: "Desde o início" },
  { id: "30", label: "30 s" },
  { id: "60", label: "1 min" },
  { id: "300", label: "5 min" },
  { id: "900", label: "15 min" },
];

export const SERIES_OPTIONS: { id: ChartSeriesId; label: string }[] = [
  { id: "flow", label: "Vazão" },
  { id: "volume", label: "Volume acumulado" },
];
