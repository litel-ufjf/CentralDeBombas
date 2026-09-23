import {
  MOTOR_COUNT,
  pumpName,
  sanitizeCalibration,
  scopeLabel,
  type Calibration,
  type CalibrationRecord,
  type CalibrationScope,
  type PumpCalibrationSet,
  type PumpDirection,
} from "./calibration";

export type CalibrationPolicy = "latest" | "shared" | "manual";

export type ManualPick = {
  forwardId: string | null;
  reverseId: string | null;
};

export type DisplayPreferences = {
  estimatedFlow: boolean;
  globalPwm: boolean;
  calibrateRun: boolean;
  calibrationEditor: boolean;
  experiment: boolean;
  charts: boolean;
};

export type Preferences = {
  calibrationPolicy: CalibrationPolicy;
  manualPicks: Record<string, ManualPick>;
  display: DisplayPreferences;
};

export type CalibrationSource =
  | "latest"
  | "other-direction"
  | "shared"
  | "manual"
  | "fallback";

export type ResolvedCalibration = {
  calibration: Calibration;
  record: CalibrationRecord | null;
  source: CalibrationSource;
};

export const DEFAULT_DISPLAY: DisplayPreferences = {
  estimatedFlow: true,
  globalPwm: true,
  calibrateRun: true,
  calibrationEditor: true,
  experiment: true,
  charts: true,
};

export const DEFAULT_PREFERENCES: Preferences = {
  calibrationPolicy: "latest",
  manualPicks: {},
  display: { ...DEFAULT_DISPLAY },
};

export function sanitizePreferences(value: unknown): Preferences {
  const raw = (value ?? {}) as Partial<Preferences>;
  const policy =
    raw.calibrationPolicy === "shared" || raw.calibrationPolicy === "manual"
      ? raw.calibrationPolicy
      : "latest";
  const picks: Record<string, ManualPick> = {};
  const incoming = raw.manualPicks ?? {};
  for (let id = 1; id <= MOTOR_COUNT; id++) {
    const item = incoming[String(id)] ?? incoming[id as unknown as string];
    picks[String(id)] = {
      forwardId: typeof item?.forwardId === "string" ? item.forwardId : null,
      reverseId: typeof item?.reverseId === "string" ? item.reverseId : null,
    };
  }
  const display = raw.display ?? DEFAULT_DISPLAY;
  return {
    calibrationPolicy: policy,
    manualPicks: picks,
    display: {
      estimatedFlow: display.estimatedFlow !== false,
      globalPwm: display.globalPwm !== false,
      calibrateRun: display.calibrateRun !== false,
      calibrationEditor: display.calibrationEditor !== false,
      experiment: display.experiment !== false,
      charts: display.charts !== false,
    },
  };
}

export function manualPickFor(prefs: Preferences, pumpId: number): ManualPick {
  return (
    prefs.manualPicks[String(pumpId)] ?? {
      forwardId: null,
      reverseId: null,
    }
  );
}

export function withManualPick(
  prefs: Preferences,
  pumpId: number,
  scope: CalibrationScope,
  recordId: string,
): Preferences {
  const current = manualPickFor(prefs, pumpId);
  const next: ManualPick =
    scope === "both"
      ? { forwardId: recordId, reverseId: recordId }
      : scope === "forward"
        ? { ...current, forwardId: recordId }
        : { ...current, reverseId: recordId };
  return sanitizePreferences({
    ...prefs,
    calibrationPolicy: "manual",
    manualPicks: { ...prefs.manualPicks, [String(pumpId)]: next },
  });
}

function byNewest(left: CalibrationRecord, right: CalibrationRecord) {
  return right.savedAt - left.savedAt;
}

function matchesDirection(record: CalibrationRecord, direction: PumpDirection) {
  return record.scope === direction || record.scope === "both";
}

function findRecord(history: CalibrationRecord[], id: string | null) {
  if (!id) {
    return null;
  }
  return history.find((item) => item.id === id) ?? null;
}

export function latestForDirection(
  set: PumpCalibrationSet,
  direction: PumpDirection,
): CalibrationRecord | null {
  return (
    [...set.history]
      .filter((item) => matchesDirection(item, direction))
      .sort(byNewest)[0] ?? null
  );
}

export function latestAny(set: PumpCalibrationSet): CalibrationRecord | null {
  return [...set.history].sort(byNewest)[0] ?? null;
}

export function resolveCalibration(
  set: PumpCalibrationSet,
  direction: PumpDirection,
  prefs: Preferences,
  pumpId: number,
): ResolvedCalibration {
  const fallback: ResolvedCalibration = {
    calibration: sanitizeCalibration(
      (direction === "forward" ? set.forward : set.reverse) ?? set.both,
    ),
    record: null,
    source: "fallback",
  };

  if (prefs.calibrationPolicy === "manual") {
    const pick = manualPickFor(prefs, pumpId);
    const id = direction === "forward" ? pick.forwardId : pick.reverseId;
    const chosen = findRecord(set.history, id);
    if (chosen) {
      return {
        calibration: sanitizeCalibration(chosen.calibration),
        record: chosen,
        source: "manual",
      };
    }
  }

  if (prefs.calibrationPolicy === "shared") {
    const latest = latestAny(set);
    if (latest) {
      return {
        calibration: sanitizeCalibration(latest.calibration),
        record: latest,
        source: "shared",
      };
    }
    return fallback;
  }

  const own = latestForDirection(set, direction);
  if (own) {
    return {
      calibration: sanitizeCalibration(own.calibration),
      record: own,
      source: "latest",
    };
  }

  const otherDir: PumpDirection = direction === "forward" ? "reverse" : "forward";
  const other = latestForDirection(set, otherDir);
  if (other) {
    return {
      calibration: sanitizeCalibration(other.calibration),
      record: other,
      source: "other-direction",
    };
  }

  const shared = latestAny(set);
  if (shared) {
    return {
      calibration: sanitizeCalibration(shared.calibration),
      record: shared,
      source: "shared",
    };
  }

  return fallback;
}

export function sourceLabel(source: CalibrationSource) {
  if (source === "latest") {
    return "Último ensaio deste sentido";
  }
  if (source === "other-direction") {
    return "Sem ensaio neste sentido · usando o outro";
  }
  if (source === "shared") {
    return "Mesma calibração nos dois sentidos";
  }
  if (source === "manual") {
    return "Escolha manual";
  }
  return "Valor corrente da bomba";
}

export function describeRecord(record: CalibrationRecord | null) {
  if (!record) {
    return "Nenhum ensaio no histórico";
  }
  const when = new Date(record.savedAt).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
  const title = record.name || "Sem nome";
  return `${title} · ${scopeLabel(record.scope)} · ${when}`;
}

export function policyLabel(policy: CalibrationPolicy) {
  if (policy === "shared") {
    return "Mesma para os dois sentidos";
  }
  if (policy === "manual") {
    return "Escolher manualmente";
  }
  return "Última por sentido";
}

export function pumpOptions() {
  return Array.from({ length: MOTOR_COUNT }, (_, index) => ({
    id: index + 1,
    name: pumpName(index + 1),
  }));
}
