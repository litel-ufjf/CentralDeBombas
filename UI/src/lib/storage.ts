import {
  DEFAULT_CALIB_RECIPE,
  MOTOR_COUNT,
  createDefaultCalibrations,
  newId,
  sanitizeCalibRecipe,
  sanitizeCalibrationSet,
  type CalibRunRecipe,
  type PumpCalibrationSet,
  type PumpChartConfig,
} from "./calibration";

const CAL_KEY = "bomba.calibration.v3";
const CAL_KEY_LEGACY = "bomba.calibration.v2";
const CHART_KEY = "bomba.charts.v1";
const RUN_KEY = "bomba.calib-run.v1";

export function loadCalibrations(): PumpCalibrationSet[] {
  const fallback = createDefaultCalibrations();
  try {
    const raw = localStorage.getItem(CAL_KEY) ?? localStorage.getItem(CAL_KEY_LEGACY);
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== MOTOR_COUNT) {
      return fallback;
    }
    return parsed.map((item, index) =>
      sanitizeCalibrationSet(item ?? fallback[index]),
    );
  } catch {
    return fallback;
  }
}

export function saveCalibrations(calibrations: PumpCalibrationSet[]) {
  localStorage.setItem(
    CAL_KEY,
    JSON.stringify(calibrations.map((item) => sanitizeCalibrationSet(item))),
  );
}

export function loadChartLayouts(): PumpChartConfig[][] {
  const empty = Array.from({ length: MOTOR_COUNT }, () => [] as PumpChartConfig[]);
  try {
    const raw = localStorage.getItem(CHART_KEY);
    if (!raw) {
      return empty;
    }
    const parsed = JSON.parse(raw) as PumpChartConfig[][];
    if (!Array.isArray(parsed) || parsed.length !== MOTOR_COUNT) {
      return empty;
    }
    return parsed.map((charts) => sanitizeCharts(charts));
  } catch {
    return empty;
  }
}

export function saveChartLayouts(layouts: PumpChartConfig[][]) {
  localStorage.setItem(CHART_KEY, JSON.stringify(layouts.map((charts) => sanitizeCharts(charts))));
}

export function loadCalibRecipes(): CalibRunRecipe[] {
  const fallback = Array.from({ length: MOTOR_COUNT }, () => ({
    ...DEFAULT_CALIB_RECIPE,
  }));
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== MOTOR_COUNT) {
      return fallback;
    }
    return parsed.map((item) => sanitizeCalibRecipe(item ?? {}));
  } catch {
    return fallback;
  }
}

export function saveCalibRecipe(pumpId: number, recipe: CalibRunRecipe) {
  const all = loadCalibRecipes();
  const index = Math.max(0, Math.min(MOTOR_COUNT - 1, pumpId - 1));
  all[index] = sanitizeCalibRecipe(recipe);
  localStorage.setItem(RUN_KEY, JSON.stringify(all));
}

export function loadCalibRecipe(pumpId: number): CalibRunRecipe {
  const index = Math.max(0, Math.min(MOTOR_COUNT - 1, pumpId - 1));
  return loadCalibRecipes()[index] ?? { ...DEFAULT_CALIB_RECIPE };
}

function sanitizeCharts(value: PumpChartConfig[] | undefined): PumpChartConfig[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.slice(0, 6).map((chart) => {
    const series = (Array.isArray(chart?.series) ? chart.series : [])
      .filter((item): item is "flow" | "volume" => item === "flow" || item === "volume");
    const timeMode =
      chart?.timeMode === "30" ||
      chart?.timeMode === "60" ||
      chart?.timeMode === "300" ||
      chart?.timeMode === "900"
        ? chart.timeMode
        : "all";
    return {
      id: chart?.id || newId(),
      series: series.length > 0 ? series : ["flow"],
      timeMode,
      visible: chart?.visible !== false,
    };
  });
}
