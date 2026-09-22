export const MOTOR_COUNT = 6;
export const BAUD_RATE = 115200;
export const PWM_BITS = 12;
export const PWM_MAX = (1 << PWM_BITS) - 1;

export type PumpDirection = "forward" | "reverse";
export type CalibrationScope = "both" | PumpDirection;

export type PumpSetpoint = {
  enabled: boolean;
  direction: PumpDirection;
  pwm: number;
};

export type Calibration = {
  a: number;
  pwm0: number;
};

export type CalibrationRecord = {
  id: string;
  name: string;
  savedAt: number;
  scope: CalibrationScope;
  calibration: Calibration;
};

export type PumpCalibrationSet = {
  both: Calibration;
  forward: Calibration | null;
  reverse: Calibration | null;
  history: CalibrationRecord[];
};

export const DEFAULT_CALIBRATION: Calibration = { a: 3, pwm0: 70 };

export function clampPwm(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, value));
}

export function clampPwm0(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_CALIBRATION.pwm0;
  }
  return Math.min(99.9, Math.max(0, value));
}

export function sanitizeCalibration(value: Partial<Calibration> | null | undefined): Calibration {
  const rawA = value?.a;
  const a = Number.isFinite(rawA) ? Math.max(0, rawA as number) : DEFAULT_CALIBRATION.a;
  return {
    a,
    pwm0: clampPwm0(value?.pwm0 ?? DEFAULT_CALIBRATION.pwm0),
  };
}

export function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function sanitizeHistory(value: unknown): CalibrationRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      const row = item as Partial<CalibrationRecord>;
      const scope: CalibrationScope =
        row.scope === "forward" || row.scope === "reverse" ? row.scope : "both";
      const savedAt = Number(row.savedAt);
      return {
        id: typeof row.id === "string" && row.id ? row.id : newId(),
        name: typeof row.name === "string" ? row.name.trim() : "",
        savedAt: Number.isFinite(savedAt) ? savedAt : Date.now(),
        scope,
        calibration: sanitizeCalibration(row.calibration),
      };
    })
    .sort((left, right) => right.savedAt - left.savedAt)
    .slice(0, 40);
}

export function sanitizeCalibrationSet(
  value: Partial<PumpCalibrationSet> | Partial<Calibration> | null | undefined,
): PumpCalibrationSet {
  const maybeOld = value as Partial<Calibration> | undefined;
  const maybeSet = value as Partial<PumpCalibrationSet> | undefined;
  const looksOld =
    maybeSet?.both === undefined &&
    (Number.isFinite(maybeOld?.a) || Number.isFinite(maybeOld?.pwm0));

  const both = sanitizeCalibration(looksOld ? maybeOld : maybeSet?.both);
  return {
    both,
    forward: maybeSet?.forward ? sanitizeCalibration(maybeSet.forward) : null,
    reverse: maybeSet?.reverse ? sanitizeCalibration(maybeSet.reverse) : null,
    history: sanitizeHistory(maybeSet?.history),
  };
}

export type ChartSeriesId = "flow" | "volume";
export type ChartTimeMode = "all" | "30" | "60" | "300" | "900";

export type PumpChartConfig = {
  id: string;
  series: ChartSeriesId[];
  timeMode: ChartTimeMode;
  visible: boolean;
};

export function createDefaultCalibrationSet(): PumpCalibrationSet {
  return {
    both: { ...DEFAULT_CALIBRATION },
    forward: null,
    reverse: null,
    history: [],
  };
}

export function createDefaultCalibrations(): PumpCalibrationSet[] {
  return Array.from({ length: MOTOR_COUNT }, () => createDefaultCalibrationSet());
}

export function calibrationFor(
  set: PumpCalibrationSet,
  direction: PumpDirection,
): Calibration {
  const own = direction === "forward" ? set.forward : set.reverse;
  return sanitizeCalibration(own ?? set.both);
}

export function calibrationForScope(
  set: PumpCalibrationSet,
  scope: CalibrationScope,
): Calibration {
  if (scope === "forward") {
    return sanitizeCalibration(set.forward ?? set.both);
  }
  if (scope === "reverse") {
    return sanitizeCalibration(set.reverse ?? set.both);
  }
  return sanitizeCalibration(set.both);
}

export function withCalibrationAtScope(
  set: PumpCalibrationSet,
  scope: CalibrationScope,
  calibration: Calibration,
): PumpCalibrationSet {
  const next = sanitizeCalibration(calibration);
  if (scope === "forward") {
    return { ...set, forward: next };
  }
  if (scope === "reverse") {
    return { ...set, reverse: next };
  }
  return { ...set, both: next };
}

export type CalibRunMethod = "fixedVolume" | "fixedTime";

export type CalibRunRecipe = {
  pwm: number;
  settleS: number;
  direction: PumpDirection;
  method: CalibRunMethod;
  volumeMl: number;
  measureS: number;
};

export const DEFAULT_CALIB_RECIPE: CalibRunRecipe = {
  pwm: 90,
  settleS: 15,
  direction: "forward",
  method: "fixedVolume",
  volumeMl: 100,
  measureS: 60,
};

export function sanitizeCalibRecipe(
  value: Partial<CalibRunRecipe> | null | undefined,
): CalibRunRecipe {
  const pwm = clampPwm(Number(value?.pwm));
  const settleS = Number(value?.settleS);
  const measureS = Number(value?.measureS);
  const volumeMl = Number(value?.volumeMl);
  return {
    pwm: pwm > 0 ? pwm : DEFAULT_CALIB_RECIPE.pwm,
    settleS:
      Number.isFinite(settleS) && settleS >= 0
        ? Math.min(600, settleS)
        : DEFAULT_CALIB_RECIPE.settleS,
    direction: value?.direction === "reverse" ? "reverse" : "forward",
    method: value?.method === "fixedTime" ? "fixedTime" : "fixedVolume",
    volumeMl:
      Number.isFinite(volumeMl) && volumeMl > 0
        ? volumeMl
        : DEFAULT_CALIB_RECIPE.volumeMl,
    measureS:
      Number.isFinite(measureS) && measureS > 0
        ? Math.min(3600, measureS)
        : DEFAULT_CALIB_RECIPE.measureS,
  };
}

export function flowFromVolumeTime(volumeMl: number, seconds: number) {
  if (!Number.isFinite(volumeMl) || !Number.isFinite(seconds) || volumeMl <= 0 || seconds <= 0) {
    return 0;
  }
  return volumeMl / (seconds / 60);
}

export function slopeFromSteadyRun(pwm: number, flowMlMin: number, pwm0: number) {
  const duty = clampPwm(pwm);
  const threshold = clampPwm0(pwm0);
  if (duty <= threshold || !Number.isFinite(flowMlMin) || flowMlMin <= 0) {
    return null;
  }
  return flowMlMin / (duty - threshold);
}

export function flowFromPwm(pwm: number, calibration: Calibration) {
  const { a, pwm0 } = sanitizeCalibration(calibration);
  const duty = clampPwm(pwm);
  if (duty < pwm0 || a <= 0) {
    return 0;
  }
  return a * (duty - pwm0);
}

export function maxFlowFromCalibration(calibration: Calibration) {
  const { a, pwm0 } = sanitizeCalibration(calibration);
  return Math.max(0, a * (100 - pwm0));
}

export function pwmFromFlow(flow: number, calibration: Calibration) {
  const { a, pwm0 } = sanitizeCalibration(calibration);
  if (!Number.isFinite(flow) || flow <= 0 || a <= 0) {
    return 0;
  }
  return clampPwm(pwm0 + flow / a);
}

export function pumpName(id: number) {
  return `P${String(id).padStart(2, "0")}`;
}

export function createDefaultSetpoints(): PumpSetpoint[] {
  return Array.from({ length: MOTOR_COUNT }, () => ({
    enabled: false,
    direction: "forward" as const,
    pwm: 0,
  }));
}

export function formatFlow(value: number) {
  return String(Math.max(0, Math.round(value))).padStart(3, "0");
}

export function formatPwm(value: number) {
  return value.toFixed(1).padStart(5, "0");
}

export function createChartConfig(): PumpChartConfig {
  return {
    id: newId(),
    series: ["flow"],
    timeMode: "60",
    visible: true,
  };
}

export function windowSeconds(mode: ChartTimeMode) {
  if (mode === "all") {
    return null;
  }
  return Number(mode);
}

export function scopeLabel(scope: CalibrationScope) {
  if (scope === "forward") {
    return "Direto";
  }
  if (scope === "reverse") {
    return "Reverso";
  }
  return "Ambos";
}
