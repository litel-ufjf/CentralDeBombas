const fs = require("node:fs");
const path = require("node:path");
const initSqlJs = require("sql.js");

const MOTOR_COUNT = 6;
const SCHEMA_VERSION = 1;
const VISITANTE = {
  id: 1,
  slug: "visitante",
  displayName: "Visitante",
  hidden: true,
};

const DEFAULT_CALIBRATION = { a: 3, pwm0: 70 };
const DEFAULT_RECIPE = {
  pwm: 90,
  settleS: 15,
  direction: "forward",
  method: "fixedVolume",
  volumeMl: 100,
  measureS: 60,
};

function wasmPath(explicit) {
  if (explicit) {
    return explicit;
  }
  return path.join(__dirname, "..", "node_modules", "sql.js", "dist", "sql-wasm.wasm");
}

function packagedWasmPath() {
  try {
    const { app } = require("electron");
    if (app && app.isPackaged) {
      return path.join(process.resourcesPath, "sql-wasm.wasm");
    }
  } catch {
    /* testes em Node sem Electron */
  }
  return wasmPath();
}

function asJson(value, fallback) {
  try {
    return JSON.stringify(value ?? fallback);
  } catch {
    return JSON.stringify(fallback);
  }
}

function fromJson(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function createStore(userDataDir, options = {}) {
  const dir = String(userDataDir || "");
  if (!dir) {
    throw new Error("Informe a pasta de dados do aplicativo.");
  }
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, "painel-bombas.sqlite");
  let db = null;
  let persistTimer = null;

  function persistNow() {
    if (!db) {
      return;
    }
    const tmp = `${filePath}.tmp`;
    const bytes = Buffer.from(db.export());
    fs.writeFileSync(tmp, bytes);
    fs.copyFileSync(tmp, filePath);
    fs.unlinkSync(tmp);
  }

  function persistSoon() {
    if (persistTimer) {
      clearTimeout(persistTimer);
    }
    persistTimer = setTimeout(() => {
      persistTimer = null;
      persistNow();
    }, 80);
  }

  function exec(sql) {
    db.exec(sql);
  }

  function run(sql, params = []) {
    db.run(sql, params);
  }

  function get(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const row = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    return row;
  }

  function all(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  }

  function metaGet(key) {
    const row = get("SELECT value FROM app_meta WHERE key = ?", [key]);
    return row ? String(row.value) : "";
  }

  function metaSet(key, value) {
    run(
      "INSERT INTO app_meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [key, String(value)],
    );
  }

  function currentUserId() {
    const raw = Number(metaGet("current_user_id"));
    return Number.isInteger(raw) && raw > 0 ? raw : VISITANTE.id;
  }

  function ensureSchema() {
    exec(`
      CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        hidden INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS pump_state (
        user_id INTEGER NOT NULL,
        pump_id INTEGER NOT NULL,
        both_json TEXT NOT NULL,
        forward_json TEXT,
        reverse_json TEXT,
        recipe_json TEXT NOT NULL,
        charts_json TEXT NOT NULL,
        experiment_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, pump_id)
      );
      CREATE TABLE IF NOT EXISTS calibration_history (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        pump_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        saved_at INTEGER NOT NULL,
        scope TEXT NOT NULL,
        calibration_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_hist_user_pump
        ON calibration_history(user_id, pump_id, saved_at DESC);
    `);

    const existing = get("SELECT id FROM users WHERE slug = ?", [VISITANTE.slug]);
    if (!existing) {
      run(
        "INSERT INTO users(id, slug, display_name, hidden, created_at) VALUES(?, ?, ?, 1, ?)",
        [VISITANTE.id, VISITANTE.slug, VISITANTE.displayName, Date.now()],
      );
    }
    if (!metaGet("schema_version")) {
      metaSet("schema_version", SCHEMA_VERSION);
    }
    if (!metaGet("current_user_id")) {
      metaSet("current_user_id", VISITANTE.id);
    }
    if (!metaGet("local_migrated")) {
      metaSet("local_migrated", "0");
    }
    seedPumps(currentUserId());
  }

  function seedPumps(userId) {
    const now = Date.now();
    for (let pumpId = 1; pumpId <= MOTOR_COUNT; pumpId++) {
      const row = get(
        "SELECT pump_id FROM pump_state WHERE user_id = ? AND pump_id = ?",
        [userId, pumpId],
      );
      if (row) {
        continue;
      }
      run(
        `INSERT INTO pump_state(
          user_id, pump_id, both_json, forward_json, reverse_json,
          recipe_json, charts_json, experiment_json, updated_at
        ) VALUES(?, ?, ?, NULL, NULL, ?, ?, ?, ?)`,
        [
          userId,
          pumpId,
          asJson(DEFAULT_CALIBRATION, DEFAULT_CALIBRATION),
          asJson(DEFAULT_RECIPE, DEFAULT_RECIPE),
          asJson([], []),
          asJson([], []),
          now,
        ],
      );
    }
  }

  function currentUser() {
    const id = currentUserId();
    const row = get(
      "SELECT id, slug, display_name, hidden FROM users WHERE id = ?",
      [id],
    );
    if (!row) {
      return { ...VISITANTE };
    }
    return {
      id: Number(row.id),
      slug: String(row.slug),
      displayName: String(row.display_name),
      hidden: Number(row.hidden) === 1,
    };
  }

  function historyFor(userId, pumpId) {
    return all(
      `SELECT id, name, saved_at, scope, calibration_json
       FROM calibration_history
       WHERE user_id = ? AND pump_id = ?
       ORDER BY saved_at DESC
       LIMIT 40`,
      [userId, pumpId],
    ).map((row) => ({
      id: String(row.id),
      name: String(row.name || ""),
      savedAt: Number(row.saved_at) || Date.now(),
      scope: row.scope === "forward" || row.scope === "reverse" ? row.scope : "both",
      calibration: fromJson(row.calibration_json, DEFAULT_CALIBRATION),
    }));
  }

  function load() {
    const user = currentUser();
    seedPumps(user.id);
    const rows = all(
      `SELECT pump_id, both_json, forward_json, reverse_json, recipe_json, charts_json, experiment_json
       FROM pump_state WHERE user_id = ? ORDER BY pump_id`,
      [user.id],
    );
    const byId = new Map(rows.map((row) => [Number(row.pump_id), row]));
    const calibrations = [];
    const recipes = [];
    const charts = [];
    const experiments = [];
    for (let pumpId = 1; pumpId <= MOTOR_COUNT; pumpId++) {
      const row = byId.get(pumpId);
      calibrations.push({
        both: fromJson(row?.both_json, DEFAULT_CALIBRATION),
        forward: row?.forward_json ? fromJson(row.forward_json, null) : null,
        reverse: row?.reverse_json ? fromJson(row.reverse_json, null) : null,
        history: historyFor(user.id, pumpId),
      });
      recipes.push(fromJson(row?.recipe_json, DEFAULT_RECIPE));
      charts.push(fromJson(row?.charts_json, []));
      experiments.push(fromJson(row?.experiment_json, []));
    }
    return {
      user,
      calibrations,
      recipes,
      charts,
      experiments,
      preferences: fromJson(metaGet("preferences"), null),
      migratedFromLocal: metaGet("local_migrated") === "1",
    };
  }

  function savePreferences(preferences) {
    metaSet("preferences", asJson(preferences, {}));
    persistSoon();
    return load();
  }

  function replaceHistory(userId, pumpId, history) {
    run("DELETE FROM calibration_history WHERE user_id = ? AND pump_id = ?", [
      userId,
      pumpId,
    ]);
    const rows = Array.isArray(history) ? history.slice(0, 40) : [];
    for (const item of rows) {
      if (!item || !item.id) {
        continue;
      }
      run(
        `INSERT INTO calibration_history(
          id, user_id, pump_id, name, saved_at, scope, calibration_json
        ) VALUES(?, ?, ?, ?, ?, ?, ?)`,
        [
          String(item.id),
          userId,
          pumpId,
          String(item.name || ""),
          Number(item.savedAt) || Date.now(),
          item.scope === "forward" || item.scope === "reverse" ? item.scope : "both",
          asJson(item.calibration, DEFAULT_CALIBRATION),
        ],
      );
    }
  }

  function upsertPump(userId, pumpId, patch) {
    seedPumps(userId);
    const now = Date.now();
    const current = get(
      `SELECT both_json, forward_json, reverse_json, recipe_json, charts_json, experiment_json
       FROM pump_state WHERE user_id = ? AND pump_id = ?`,
      [userId, pumpId],
    );
    run(
      `UPDATE pump_state SET
        both_json = ?,
        forward_json = ?,
        reverse_json = ?,
        recipe_json = ?,
        charts_json = ?,
        experiment_json = ?,
        updated_at = ?
       WHERE user_id = ? AND pump_id = ?`,
      [
        patch.both_json ?? current?.both_json ?? asJson(DEFAULT_CALIBRATION, DEFAULT_CALIBRATION),
        patch.forward_json === undefined ? current?.forward_json ?? null : patch.forward_json,
        patch.reverse_json === undefined ? current?.reverse_json ?? null : patch.reverse_json,
        patch.recipe_json ?? current?.recipe_json ?? asJson(DEFAULT_RECIPE, DEFAULT_RECIPE),
        patch.charts_json ?? current?.charts_json ?? asJson([], []),
        patch.experiment_json ?? current?.experiment_json ?? asJson([], []),
        now,
        userId,
        pumpId,
      ],
    );
  }

  function saveCalibrations(calibrations) {
    const userId = currentUserId();
    const list = Array.isArray(calibrations) ? calibrations : [];
    for (let index = 0; index < MOTOR_COUNT; index++) {
      const set = list[index] || {};
      upsertPump(userId, index + 1, {
        both_json: asJson(set.both, DEFAULT_CALIBRATION),
        forward_json: set.forward ? asJson(set.forward, DEFAULT_CALIBRATION) : null,
        reverse_json: set.reverse ? asJson(set.reverse, DEFAULT_CALIBRATION) : null,
      });
      replaceHistory(userId, index + 1, set.history);
    }
    persistSoon();
    return load();
  }

  function saveRecipes(recipes) {
    const userId = currentUserId();
    const list = Array.isArray(recipes) ? recipes : [];
    for (let index = 0; index < MOTOR_COUNT; index++) {
      upsertPump(userId, index + 1, {
        recipe_json: asJson(list[index], DEFAULT_RECIPE),
      });
    }
    persistSoon();
    return load();
  }

  function saveCharts(layouts) {
    const userId = currentUserId();
    const list = Array.isArray(layouts) ? layouts : [];
    for (let index = 0; index < MOTOR_COUNT; index++) {
      upsertPump(userId, index + 1, {
        charts_json: asJson(list[index], []),
      });
    }
    persistSoon();
    return load();
  }

  function saveExperiments(programs) {
    const userId = currentUserId();
    const list = Array.isArray(programs) ? programs : [];
    for (let index = 0; index < MOTOR_COUNT; index++) {
      upsertPump(userId, index + 1, {
        experiment_json: asJson(list[index], []),
      });
    }
    persistSoon();
    return load();
  }

  function markMigrated() {
    metaSet("local_migrated", "1");
    persistSoon();
  }

  function importLocal(snapshot) {
    const userId = currentUserId();
    const calibrations = Array.isArray(snapshot?.calibrations) ? snapshot.calibrations : [];
    const recipes = Array.isArray(snapshot?.recipes) ? snapshot.recipes : [];
    const charts = Array.isArray(snapshot?.charts) ? snapshot.charts : [];
    const experiments = Array.isArray(snapshot?.experiments) ? snapshot.experiments : [];
    if (snapshot?.preferences) {
      metaSet("preferences", asJson(snapshot.preferences, {}));
    }
    for (let index = 0; index < MOTOR_COUNT; index++) {
      const set = calibrations[index] || {};
      upsertPump(userId, index + 1, {
        both_json: asJson(set.both, DEFAULT_CALIBRATION),
        forward_json: set.forward ? asJson(set.forward, DEFAULT_CALIBRATION) : null,
        reverse_json: set.reverse ? asJson(set.reverse, DEFAULT_CALIBRATION) : null,
        recipe_json: asJson(recipes[index], DEFAULT_RECIPE),
        charts_json: asJson(charts[index], []),
        experiment_json: asJson(experiments[index], []),
      });
      replaceHistory(userId, index + 1, set.history);
    }
    markMigrated();
    persistNow();
    return load();
  }

  function flush() {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    persistNow();
  }

  async function open() {
    const SQL = await initSqlJs({
      locateFile: (file) => {
        if (file === "sql-wasm.wasm") {
          return options.wasmPath || packagedWasmPath();
        }
        return wasmPath(options.wasmPath);
      },
    });
    if (fs.existsSync(filePath)) {
      db = new SQL.Database(fs.readFileSync(filePath));
    } else {
      db = new SQL.Database();
    }
    exec("PRAGMA foreign_keys = ON;");
    ensureSchema();
    persistNow();
    return api;
  }

  const api = {
    filePath,
    currentUser,
    load,
    saveCalibrations,
    saveRecipes,
    saveCharts,
    saveExperiments,
    savePreferences,
    importLocal,
    markMigrated,
    flush,
  };

  return open();
}

module.exports = { createStore, VISITANTE, MOTOR_COUNT };
