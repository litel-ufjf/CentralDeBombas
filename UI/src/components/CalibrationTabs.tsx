import { useEffect, useState } from "react";
import { CalibrateRunPanel } from "./CalibrateRunPanel";
import { CalibrationPanel } from "./CalibrationPanel";
import {
  resolveCalibration,
  type Preferences,
} from "../lib/preferences";
import type {
  Calibration,
  CalibrationRecord,
  CalibrationScope,
  PumpCalibrationSet,
} from "../lib/calibration";

type TabId = "run" | "params";

const STORAGE_KEY = "bomba.calib-tab.v1";

function loadTab(pumpId: number, fallback: TabId): TabId {
  try {
    const raw = sessionStorage.getItem(`${STORAGE_KEY}.${pumpId}`);
    if (raw === "run" || raw === "params") {
      return raw;
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

function saveTab(pumpId: number, tab: TabId) {
  try {
    sessionStorage.setItem(`${STORAGE_KEY}.${pumpId}`, tab);
  } catch {
    /* ignore */
  }
}

export function CalibrationTabs({
  pumpId,
  set,
  preferences,
  onChange,
  onSaveHistory,
  onApplyHistory,
}: {
  pumpId: number;
  set: PumpCalibrationSet;
  preferences: Preferences;
  onChange: (scope: CalibrationScope, calibration: Calibration) => void;
  onSaveHistory: (scope: CalibrationScope, name: string) => void;
  onApplyHistory: (record: CalibrationRecord) => void;
}) {
  const showRun = preferences.display.calibrateRun;
  const showParams = preferences.display.calibrationEditor;
  const fallback: TabId = showRun ? "run" : "params";
  const [tab, setTab] = useState<TabId>(() => loadTab(pumpId, fallback));

  useEffect(() => {
    setTab(loadTab(pumpId, showRun ? "run" : "params"));
  }, [pumpId, showRun]);

  useEffect(() => {
    if (tab === "run" && !showRun && showParams) {
      setTab("params");
    } else if (tab === "params" && !showParams && showRun) {
      setTab("run");
    }
  }, [tab, showRun, showParams]);

  useEffect(() => {
    saveTab(pumpId, tab);
  }, [pumpId, tab]);

  if (!showRun && !showParams) {
    return null;
  }

  const both = showRun && showParams;
  const active: TabId = both
    ? tab === "run" && showRun
      ? "run"
      : "params"
    : showRun
      ? "run"
      : "params";

  const tabs: { id: TabId; label: string }[] = [];
  if (showRun) {
    tabs.push({ id: "run", label: "Calibrar" });
  }
  if (showParams) {
    tabs.push({ id: "params", label: "Zona morta" });
  }

  return (
    <div className="mt-8 rounded-[14px] bg-foreground/4 ring-1 ring-border">
      {both ? (
        <div
          role="tablist"
          aria-label="Modo de calibração"
          className="flex gap-1 border-b border-border px-2 pt-2"
        >
          {tabs.map((item) => {
            const selected = active === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                id={`calib-tab-${item.id}`}
                aria-controls={`calib-panel-${item.id}`}
                onClick={() => setTab(item.id)}
                className={`-mb-px px-4 py-2.5 text-[13px] leading-none font-medium border-b-2 ${
                  selected
                    ? "border-run text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <div
        className="p-4"
        role="tabpanel"
        id={`calib-panel-${active}`}
        aria-labelledby={both ? `calib-tab-${active}` : undefined}
      >
        {active === "run" ? (
          <CalibrateRunPanel
            pumpId={pumpId}
            embedded
            hideTitle={both}
          />
        ) : (
          <CalibrationPanel
            embedded
            hideTitle={both}
            set={set}
            activeRecordIds={[
              resolveCalibration(set, "forward", preferences, pumpId).record
                ?.id,
              resolveCalibration(set, "reverse", preferences, pumpId).record
                ?.id,
            ]}
            onChange={onChange}
            onSaveHistory={onSaveHistory}
            onApplyHistory={onApplyHistory}
          />
        )}
      </div>
    </div>
  );
}
