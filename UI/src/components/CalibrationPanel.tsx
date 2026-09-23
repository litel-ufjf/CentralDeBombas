import { useState } from "react";
import {
  calibrationForScope,
  maxFlowFromCalibration,
  scopeLabel,
  type Calibration,
  type CalibrationRecord,
  type CalibrationScope,
  type PumpCalibrationSet,
} from "../lib/calibration";

const SCOPES: CalibrationScope[] = ["both", "forward", "reverse"];

export function CalibrationPanel({
  set,
  activeRecordIds = [],
  onChange,
  onSaveHistory,
  onApplyHistory,
}: {
  set: PumpCalibrationSet;
  activeRecordIds?: Array<string | undefined>;
  onChange: (scope: CalibrationScope, calibration: Calibration) => void;
  onSaveHistory: (scope: CalibrationScope, name: string) => void;
  onApplyHistory: (record: CalibrationRecord) => void;
}) {
  const [scope, setScope] = useState<CalibrationScope>("both");
  const [name, setName] = useState("");
  const calibration = calibrationForScope(set, scope);
  const maxFlow = maxFlowFromCalibration(calibration);
  const own =
    scope === "forward"
      ? set.forward
      : scope === "reverse"
        ? set.reverse
        : set.both;

  return (
    <div className="rounded-[14px] bg-foreground/4 p-4 ring-1 ring-border">
      <p className="text-[11px] tracking-[0.15em] text-muted-foreground uppercase">
        Calibração com zona morta
      </p>
      <p className="mt-2 font-mono text-[12px] leading-relaxed text-faint">
        Q = 0 se PWM &lt; PWM₀
        <br />
        Q = a × (PWM − PWM₀) se PWM ≥ PWM₀
      </p>

      <p className="mt-4 text-[11px] tracking-[0.15em] text-muted-foreground uppercase">
        Aplica a
      </p>
      <div className="mt-2 flex rounded-[12px] bg-foreground/5 p-1 ring-1 ring-border">
        {SCOPES.map((item) => {
          const selected = scope === item;
          return (
            <button
              key={item}
              type="button"
              onClick={() => setScope(item)}
              className={`flex-1 rounded-[9px] py-2 text-[12px] leading-none font-medium ${
                selected
                  ? "bg-run/15 text-run ring-1 ring-run/30"
                  : "text-muted-foreground"
              }`}
            >
              {scopeLabel(item)}
            </button>
          );
        })}
      </div>
      {scope !== "both" && !own && (
        <p className="mt-2 text-[12px] text-muted-foreground">
          Este sentido ainda usa a calibração de ambos. Ao editar, passa a ter
          valores próprios.
        </p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="text-[11px] text-muted-foreground">
          PWM₀ (%)
          <input
            className="field-light mt-1"
            type="number"
            min={0}
            max={99.9}
            step="0.1"
            value={calibration.pwm0}
            onChange={(event) =>
              onChange(scope, {
                ...calibration,
                pwm0: Number(event.target.value),
              })
            }
          />
        </label>
        <label className="text-[11px] text-muted-foreground">
          a (mL/min / %)
          <input
            className="field-light mt-1"
            type="number"
            min={0}
            step="0.01"
            value={calibration.a}
            onChange={(event) =>
              onChange(scope, {
                ...calibration,
                a: Number(event.target.value),
              })
            }
          />
        </label>
      </div>
      <p className="mt-3 text-[12px] text-muted-foreground">
        PWM₀ é o limiar em que a bomba começa a mover. Em 100% ≈{" "}
        {maxFlow.toFixed(1)} mL/min
        {scope === "both"
          ? " nos dois sentidos."
          : ` no sentido ${scopeLabel(scope).toLowerCase()}.`}
      </p>

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
        <label className="text-[11px] text-muted-foreground">
          Nome no histórico (opcional)
          <input
            className="field-light mt-1"
            type="text"
            maxLength={80}
            placeholder="Ex.: ensaio 12/09"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            onSaveHistory(scope, name);
            setName("");
          }}
          className="rounded-[10px] bg-run px-3 py-2.5 text-[12px] leading-none font-medium text-run-foreground ring-1 ring-run/30"
        >
          Salvar
        </button>
      </div>

      <p className="mt-5 text-[11px] tracking-[0.15em] text-muted-foreground uppercase">
        Histórico
      </p>
      {set.history.length === 0 ? (
        <p className="mt-2 text-[12px] text-muted-foreground">
          Nenhuma calibração salva ainda.
        </p>
      ) : (
        <ul className="mt-2 max-h-48 space-y-1.5 overflow-auto">
          {set.history.map((record) => {
            const active = activeRecordIds.includes(record.id);
            return (
            <li
              key={record.id}
              className={`flex items-center justify-between gap-2 rounded-[10px] bg-panel-2 px-3 py-2 ring-1 ${
                active ? "ring-run/40" : "ring-border"
              }`}
            >
              <div className="min-w-0">
                <p className="truncate text-[12px] font-medium">
                  {record.name || "Sem nome"}
                  {active ? (
                    <span className="ml-2 text-[10px] font-medium tracking-wide text-run uppercase">
                      Em uso
                    </span>
                  ) : null}
                </p>
                <p className="font-mono text-[10px] text-faint">
                  {new Date(record.savedAt).toLocaleString("pt-BR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}{" "}
                  · {scopeLabel(record.scope)} · a={record.calibration.a} · PWM₀=
                  {record.calibration.pwm0}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setScope(record.scope);
                  onApplyHistory(record);
                }}
                className="shrink-0 rounded-[8px] bg-foreground/5 px-2.5 py-1.5 text-[11px] font-medium ring-1 ring-border"
              >
                Usar
              </button>
            </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
