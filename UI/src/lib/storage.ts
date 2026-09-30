import {
  DEFAULT_CALIB_RECIPE,
  MOTOR_COUNT,
  createDefaultCalibrations,
  newId,
  pumpName,
  sanitizeCalibRecipe,
  sanitizeCalibrationSet,
  type CalibRunRecipe,
  type PumpCalibrationSet,
  type PumpChartConfig,
} from "./calibration";
import {
  createDefaultProgram,
  sanitizeProgram,
  type ExperimentBlock,
} from "./experiment";
import {
  DEFAULT_PREFERENCES,
  sanitizePreferences,
  type Preferences,
} from "./preferences";

const CAL_KEY = "bomba.calibration.v3";
const CAL_KEY_LEGACY = "bomba.calibration.v2";
const CHART_KEY = "bomba.charts.v1";
const RUN_KEY = "bomba.calib-run.v1";
const PROGRAM_KEY = "bomba.experiment.v1";
const PREFS_KEY = "bomba.preferences.v1";
const LIBRARY_KEY = "bomba.program-library.v1";

export type PumpProgram = {
  name: string;
  docId: string | null;
  blocks: ExperimentBlock[];
};

export type LibraryProgram = {
  id: string;
  name: string;
  blocks: ExperimentBlock[];
  updatedAt: number;
};

export function defaultProgramName(pumpId: number) {
  return `Programação ${pumpName(pumpId)}`;
}

function sanitizePumpProgram(value: unknown, pumpId: number): PumpProgram {
  if (Array.isArray(value)) {
    return {
      name: defaultProgramName(pumpId),
      docId: null,
      blocks: value.length > 0 ? sanitizeProgram(value) : createDefaultProgram(),
    };
  }
  if (value && typeof value === "object") {
    const raw = value as Partial<PumpProgram>;
    const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 80) : "";
    return {
      name: name || defaultProgramName(pumpId),
      docId: typeof raw.docId === "string" && raw.docId ? raw.docId : null,
      blocks: Array.isArray(raw.blocks) ? sanitizeProgram(raw.blocks) : createDefaultProgram(),
    };
  }
  return { name: defaultProgramName(pumpId), docId: null, blocks: createDefaultProgram() };
}

function sanitizeLibrary(value: unknown): LibraryProgram[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const list: LibraryProgram[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const raw = item as Partial<LibraryProgram>;
    const id = typeof raw.id === "string" && raw.id ? raw.id : newId();
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 80) : "";
    list.push({
      id,
      name: name || "Sem nome",
      blocks: Array.isArray(raw.blocks) ? sanitizeProgram(raw.blocks) : [],
      updatedAt: Number(raw.updatedAt) || Date.now(),
    });
  }
  return list.slice(0, 200);
}

export type HiddenUser = {
  id: number;
  slug: string;
  displayName: string;
  hidden: boolean;
};

type StoreSnapshot = {
  user: HiddenUser;
  calibrations: PumpCalibrationSet[];
  recipes: CalibRunRecipe[];
  charts: PumpChartConfig[][];
  experiments: PumpProgram[];
  library: LibraryProgram[];
  preferences: Preferences;
};

const VISITANTE: HiddenUser = {
  id: 1,
  slug: "visitante",
  displayName: "Visitante",
  hidden: true,
};

function emptyCharts(): PumpChartConfig[][] {
  return Array.from({ length: MOTOR_COUNT }, () => [] as PumpChartConfig[]);
}

function emptyRecipes(): CalibRunRecipe[] {
  return Array.from({ length: MOTOR_COUNT }, () => ({ ...DEFAULT_CALIB_RECIPE }));
}

function emptyExperiments(): PumpProgram[] {
  return Array.from({ length: MOTOR_COUNT }, (_, index) => sanitizePumpProgram(null, index + 1));
}

function padToMotors<T>(items: T[] | undefined, fallback: (index: number) => T): T[] {
  const source = Array.isArray(items) ? items : [];
  return Array.from({ length: MOTOR_COUNT }, (_, index) =>
    source[index] === undefined ? fallback(index) : source[index],
  );
}

function sanitizeCharts(value: PumpChartConfig[] | undefined): PumpChartConfig[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.slice(0, 6).map((chart) => {
    const series = (Array.isArray(chart?.series) ? chart.series : []).filter(
      (item): item is "flow" | "volume" => item === "flow" || item === "volume",
    );
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

function readLocalCalibrations(): PumpCalibrationSet[] {
  const fallback = createDefaultCalibrations();
  try {
    const raw = localStorage.getItem(CAL_KEY) ?? localStorage.getItem(CAL_KEY_LEGACY);
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return fallback;
    }
    return padToMotors(parsed, (index) => fallback[index]).map((item, index) =>
      sanitizeCalibrationSet(item ?? fallback[index]),
    );
  } catch {
    return fallback;
  }
}

function readLocalCharts(): PumpChartConfig[][] {
  const empty = emptyCharts();
  try {
    const raw = localStorage.getItem(CHART_KEY);
    if (!raw) {
      return empty;
    }
    const parsed = JSON.parse(raw) as PumpChartConfig[][];
    if (!Array.isArray(parsed)) {
      return empty;
    }
    return padToMotors(parsed, () => []).map((charts) => sanitizeCharts(charts));
  } catch {
    return empty;
  }
}

function readLocalRecipes(): CalibRunRecipe[] {
  const fallback = emptyRecipes();
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return fallback;
    }
    return padToMotors(parsed, () => ({ ...DEFAULT_CALIB_RECIPE })).map((item) =>
      sanitizeCalibRecipe(item ?? {}),
    );
  } catch {
    return fallback;
  }
}

function readLocalPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return sanitizePreferences(raw ? JSON.parse(raw) : DEFAULT_PREFERENCES);
  } catch {
    return { ...DEFAULT_PREFERENCES, display: { ...DEFAULT_PREFERENCES.display } };
  }
}

function readLocalExperiments(): PumpProgram[] {
  const fallback = emptyExperiments();
  try {
    const raw = localStorage.getItem(PROGRAM_KEY);
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return fallback;
    }
    return padToMotors(parsed as unknown[], () => null).map((item, index) =>
      sanitizePumpProgram(item, index + 1),
    );
  } catch {
    return fallback;
  }
}

function readLocalLibrary(): LibraryProgram[] {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    return sanitizeLibrary(raw ? JSON.parse(raw) : []);
  } catch {
    return [];
  }
}

function readLocalSnapshot(): StoreSnapshot {
  return {
    user: VISITANTE,
    calibrations: readLocalCalibrations(),
    recipes: readLocalRecipes(),
    charts: readLocalCharts(),
    experiments: readLocalExperiments(),
    library: readLocalLibrary(),
    preferences: readLocalPreferences(),
  };
}

function localHasKeys() {
  try {
    return Boolean(
      localStorage.getItem(CAL_KEY) ||
        localStorage.getItem(CAL_KEY_LEGACY) ||
        localStorage.getItem(CHART_KEY) ||
        localStorage.getItem(RUN_KEY) ||
        localStorage.getItem(PROGRAM_KEY) ||
        localStorage.getItem(LIBRARY_KEY) ||
        localStorage.getItem(PREFS_KEY),
    );
  } catch {
    return false;
  }
}

function writeLocalBackup(next: StoreSnapshot) {
  try {
    localStorage.setItem(
      CAL_KEY,
      JSON.stringify(next.calibrations.map((item) => sanitizeCalibrationSet(item))),
    );
    localStorage.setItem(
      CHART_KEY,
      JSON.stringify(next.charts.map((charts) => sanitizeCharts(charts))),
    );
    localStorage.setItem(RUN_KEY, JSON.stringify(next.recipes.map((item) => sanitizeCalibRecipe(item))));
    localStorage.setItem(PROGRAM_KEY, JSON.stringify(next.experiments));
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(next.library));
    localStorage.setItem(PREFS_KEY, JSON.stringify(sanitizePreferences(next.preferences)));
  } catch {
    /* quota ou modo privado */
  }
}

function sanitizeRemote(remote: Partial<StoreSnapshot> | StoreSnapshotInfo | null | undefined): StoreSnapshot {
  const fallback = readLocalSnapshot();
  return {
    user: remote?.user?.slug ? { ...VISITANTE, ...remote.user, hidden: true } : VISITANTE,
    calibrations: padToMotors(
      remote?.calibrations as PumpCalibrationSet[] | undefined,
      (index) => fallback.calibrations[index],
    ).map((item, index) => sanitizeCalibrationSet(item ?? fallback.calibrations[index])),
    recipes: padToMotors(
      remote?.recipes as CalibRunRecipe[] | undefined,
      () => ({ ...DEFAULT_CALIB_RECIPE }),
    ).map((item) => sanitizeCalibRecipe(item ?? {})),
    charts: padToMotors(remote?.charts as PumpChartConfig[][] | undefined, () => []).map((charts) =>
      sanitizeCharts(charts),
    ),
    experiments: padToMotors(remote?.experiments as unknown[] | undefined, () => null).map(
      (item, index) => sanitizePumpProgram(item, index + 1),
    ),
    library: sanitizeLibrary(
      (remote as StoreSnapshotInfo | undefined)?.library ?? fallback.library,
    ),
    preferences: sanitizePreferences(
      (remote as StoreSnapshotInfo | undefined)?.preferences ?? fallback.preferences,
    ),
  };
}

let snapshot: StoreSnapshot = {
  user: VISITANTE,
  calibrations: createDefaultCalibrations(),
  recipes: emptyRecipes(),
  charts: emptyCharts(),
  experiments: emptyExperiments(),
  library: [],
  preferences: {
    ...DEFAULT_PREFERENCES,
    display: { ...DEFAULT_PREFERENCES.display },
  },
};
let ready = false;

function desktopStore() {
  return window.bomba?.store;
}

function remember(next: StoreSnapshot) {
  snapshot = next;
  writeLocalBackup(next);
  return snapshot;
}

export async function bootstrapStore() {
  if (ready) {
    return snapshot;
  }
  const api = desktopStore();
  if (api) {
    try {
      const remote = await api.load();
      snapshot = sanitizeRemote(remote);
      if (!remote.migratedFromLocal && localHasKeys()) {
        const imported = await api.importLocal(readLocalSnapshot());
        snapshot = sanitizeRemote(imported);
      }
    } catch {
      snapshot = readLocalSnapshot();
    }
  } else {
    snapshot = readLocalSnapshot();
  }
  writeLocalBackup(snapshot);
  ready = true;
  return snapshot;
}

export function currentHiddenUser() {
  return snapshot.user;
}

export function loadCalibrations(): PumpCalibrationSet[] {
  return snapshot.calibrations;
}

export function saveCalibrations(calibrations: PumpCalibrationSet[]) {
  const next = {
    ...snapshot,
    calibrations: padToMotors(calibrations, (index) => snapshot.calibrations[index]).map((item) =>
      sanitizeCalibrationSet(item),
    ),
  };
  remember(next);
  void desktopStore()?.saveCalibrations(next.calibrations);
}

export function loadChartLayouts(): PumpChartConfig[][] {
  return snapshot.charts;
}

export function saveChartLayouts(layouts: PumpChartConfig[][]) {
  const next = {
    ...snapshot,
    charts: padToMotors(layouts, () => []).map((charts) => sanitizeCharts(charts)),
  };
  remember(next);
  void desktopStore()?.saveCharts(next.charts);
}

export function loadCalibRecipes(): CalibRunRecipe[] {
  return snapshot.recipes;
}

export function saveCalibRecipe(pumpId: number, recipe: CalibRunRecipe) {
  const recipes = loadCalibRecipes().slice();
  const index = Math.max(0, Math.min(MOTOR_COUNT - 1, pumpId - 1));
  recipes[index] = sanitizeCalibRecipe(recipe);
  const next = { ...snapshot, recipes };
  remember(next);
  void desktopStore()?.saveRecipes(next.recipes);
}

export function loadCalibRecipe(pumpId: number): CalibRunRecipe {
  const index = Math.max(0, Math.min(MOTOR_COUNT - 1, pumpId - 1));
  return loadCalibRecipes()[index] ?? { ...DEFAULT_CALIB_RECIPE };
}

function pumpIndex(pumpId: number) {
  return Math.max(0, Math.min(MOTOR_COUNT - 1, pumpId - 1));
}

export function loadPumpProgram(pumpId: number): PumpProgram {
  const program = snapshot.experiments[pumpIndex(pumpId)] ?? sanitizePumpProgram(null, pumpId);
  const doc = program.docId ? snapshot.library.find((item) => item.id === program.docId) : null;
  if (program.docId && !doc) {
    return { ...program, docId: null };
  }
  return doc ? { ...program, name: doc.name, blocks: doc.blocks } : program;
}

export function savePumpProgram(pumpId: number, program: PumpProgram) {
  const experiments = snapshot.experiments.slice();
  const clean = sanitizePumpProgram(program, pumpId);
  experiments[pumpIndex(pumpId)] = clean;
  let library = snapshot.library;
  const linked = Boolean(clean.docId && library.some((item) => item.id === clean.docId));
  if (linked) {
    library = library.map((item) =>
      item.id === clean.docId
        ? { ...item, name: clean.name, blocks: clean.blocks, updatedAt: Date.now() }
        : item,
    );
  } else {
    clean.docId = null;
  }
  const next = { ...snapshot, experiments, library };
  remember(next);
  void desktopStore()?.saveExperiments(next.experiments);
  if (linked) {
    void desktopStore()?.saveLibrary(next.library);
  }
}

export function loadProgram(pumpId: number): ExperimentBlock[] {
  return loadPumpProgram(pumpId).blocks;
}

export function saveProgram(pumpId: number, blocks: ExperimentBlock[]) {
  savePumpProgram(pumpId, { ...loadPumpProgram(pumpId), blocks });
}

export function loadLibrary(): LibraryProgram[] {
  return snapshot.library;
}

export function saveLibrary(library: LibraryProgram[]) {
  const clean = sanitizeLibrary(library);
  const ids = new Set(clean.map((item) => item.id));
  const experiments = snapshot.experiments.map((item) =>
    item.docId && !ids.has(item.docId) ? { ...item, docId: null } : item,
  );
  const next = { ...snapshot, library: clean, experiments };
  remember(next);
  void desktopStore()?.saveLibrary(next.library);
  void desktopStore()?.saveExperiments(next.experiments);
}

export function loadPreferences(): Preferences {
  return snapshot.preferences;
}

export function savePreferences(preferences: Preferences) {
  const next = {
    ...snapshot,
    preferences: sanitizePreferences(preferences),
  };
  remember(next);
  void desktopStore()?.savePreferences(next.preferences);
}
