import { useEffect, useRef, useState } from "react";
import {
  calibrationFor,
  flowFromVolumeTime,
  sanitizeCalibRecipe,
  slopeFromSteadyRun,
  type CalibRunMethod,
  type CalibRunRecipe,
  type PumpDirection,
} from "../lib/calibration";
import { loadCalibRecipe, saveCalibRecipe } from "../lib/storage";
import { useBench } from "../context/BenchContext";

type Phase = "setup" | "settle" | "measure" | "volume" | "done";

function formatClock(seconds: number) {
  const total = Math.max(0, seconds);
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(1).padStart(4, "0")}`;
}

export function CalibrateRunPanel({ pumpId }: { pumpId: number }) {
  const {
    connected,
    pumps,
    setPwm,
    setDirection,
    setEnabled,
    setCalibration,
    saveCalibrationHistory,
  } = useBench();
  const pump = pumps.find((item) => item.id === pumpId);
  const [recipe, setRecipe] = useState<CalibRunRecipe>(() => loadCalibRecipe(pumpId));
  const [phase, setPhase] = useState<Phase>("setup");
  const [elapsed, setElapsed] = useState(0);
  const [measureS, setMeasureS] = useState(0);
  const [volumeInput, setVolumeInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);
  const tickRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);

  useEffect(() => {
    saveCalibRecipe(pumpId, recipe);
  }, [pumpId, recipe]);

  useEffect(() => {
    return () => {
      if (tickRef.current) {
        window.clearInterval(tickRef.current);
      }
      if (startedRef.current) {
        setEnabled(pumpId, false);
        startedRef.current = false;
      }
    };
  }, [pumpId, setEnabled]);

  const update = (patch: Partial<CalibRunRecipe>) => {
    setRecipe((current) => sanitizeCalibRecipe({ ...current, ...patch }));
  };

  const stopTick = () => {
    if (tickRef.current) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  };

  const startPump = () => {
    setDirection(pumpId, recipe.direction);
    setPwm(pumpId, recipe.pwm);
    setEnabled(pumpId, true);
    startedRef.current = true;
  };

  const stopPump = () => {
    if (startedRef.current) {
      setEnabled(pumpId, false);
      startedRef.current = false;
    }
  };

  const begin = () => {
    setError(null);
    if (recipe.pwm <= 0) {
      setError("Informe o PWM de regime permanente.");
      return;
    }
    if (recipe.method === "fixedVolume" && recipe.volumeMl <= 0) {
      setError("Informe o volume fixo de medição.");
      return;
    }
    if (recipe.method === "fixedTime" && recipe.measureS <= 0) {
      setError("Informe o tempo de medição em regime.");
      return;
    }
    const pwm0 = pump ? calibrationFor(pump.calibrationSet, recipe.direction).pwm0 : 70;
    if (recipe.pwm <= pwm0) {
      setError(
        `O PWM de regime (${recipe.pwm}%) precisa ficar acima do PWM₀ (${pwm0}%).`,
      );
      return;
    }
    startPump();
    startedAtRef.current = performance.now();
    setElapsed(0);
    setMeasureS(0);
    setVolumeInput(recipe.method === "fixedVolume" ? String(recipe.volumeMl) : "");
    setPhase("settle");
    tickRef.current = window.setInterval(() => {
      setElapsed((performance.now() - startedAtRef.current) / 1000);
    }, 80);
  };

  const finishMeasure = (seconds: number, volume: number) => {
    stopTick();
    stopPump();
    setMeasureS(seconds);
    if (volume > 0) {
      setVolumeInput(String(volume));
    }
    setPhase("done");
  };

  useEffect(() => {
    if (phase !== "settle") {
      return;
    }
    if (elapsed >= recipe.settleS) {
      startedAtRef.current = performance.now();
      setElapsed(0);
      setPhase("measure");
    }
  }, [elapsed, phase, recipe.settleS]);

  useEffect(() => {
    if (phase !== "measure" || recipe.method !== "fixedTime") {
      return;
    }
    if (elapsed >= recipe.measureS) {
      stopTick();
      stopPump();
      setMeasureS(recipe.measureS);
      setPhase("volume");
    }
  }, [elapsed, phase, recipe.measureS, recipe.method]);

  const cancel = () => {
    stopTick();
    stopPump();
    setPhase("setup");
    setElapsed(0);
    setError(null);
  };

  const measuredSeconds =
    phase === "done" || phase === "volume" ? measureS : phase === "measure" ? elapsed : 0;
  const volumeMl =
    recipe.method === "fixedVolume"
      ? recipe.volumeMl
      : Number(volumeInput);
  const flow = flowFromVolumeTime(volumeMl, measuredSeconds);
  const pwm0 = pump ? calibrationFor(pump.calibrationSet, recipe.direction).pwm0 : 70;
  const slope = slopeFromSteadyRun(recipe.pwm, flow, pwm0);

  const applyResult = () => {
    if (!pump || !slope) {
      setError("Não foi possível calcular a. Confira volume e tempo.");
      return;
    }
    const calibration = {
      ...calibrationFor(pump.calibrationSet, recipe.direction),
      a: Number(slope.toFixed(4)),
    };
    setCalibration(pumpId, recipe.direction, calibration);
    const label =
      recipe.method === "fixedVolume"
        ? `Vol. fixo ${recipe.volumeMl} mL · ${recipe.pwm}% · ${formatClock(measuredSeconds)}`
        : `Tempo fixo ${recipe.measureS} s · ${recipe.pwm}% · ${volumeMl} mL`;
    saveCalibrationHistory(pumpId, recipe.direction, label);
    setPhase("setup");
  };

  const busy = phase !== "setup" && phase !== "done";

  return (
    <div className="rounded-[14px] bg-foreground/4 p-4 ring-1 ring-border">
      <p className="text-[11px] tracking-[0.15em] text-muted-foreground uppercase">
        Calibrar
      </p>
      <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
        A bomba sobe no PWM de regime, espera o transitório (mangueira com
        líquido, sem ar) e só então mede a vazão.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="text-[11px] text-muted-foreground">
          PWM de regime (%)
          <input
            className="field-light mt-1"
            type="number"
            min={0}
            max={100}
            step="0.1"
            disabled={busy}
            value={recipe.pwm}
            onChange={(event) => update({ pwm: Number(event.target.value) })}
          />
        </label>
        <label className="text-[11px] text-muted-foreground">
          Estabilização (s)
          <input
            className="field-light mt-1"
            type="number"
            min={0}
            max={600}
            step="1"
            disabled={busy}
            value={recipe.settleS}
            onChange={(event) => update({ settleS: Number(event.target.value) })}
          />
        </label>
        <div>
          <p className="text-[11px] text-muted-foreground">Sentido</p>
          <div className="mt-1 flex rounded-[12px] bg-foreground/5 p-1 ring-1 ring-border">
            {(["forward", "reverse"] as PumpDirection[]).map((direction) => {
              const selected = recipe.direction === direction;
              return (
                <button
                  key={direction}
                  type="button"
                  disabled={busy}
                  onClick={() => update({ direction })}
                  className={`flex-1 rounded-[9px] py-2 text-[12px] leading-none font-medium disabled:opacity-40 ${
                    selected
                      ? "bg-run/15 text-run ring-1 ring-run/30"
                      : "text-muted-foreground"
                  }`}
                >
                  {direction === "forward" ? "Direto" : "Reverso"}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <p className="mt-5 text-[11px] tracking-[0.15em] text-muted-foreground uppercase">
        Modo de medição
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {(
          [
            [
              "fixedVolume",
              "Volume fixo",
              "PWM e volume fixos; você cronometra até o béquer.",
            ],
            [
              "fixedTime",
              "Tempo fixo",
              "PWM e tempo de regime fixos; você informa o volume depois.",
            ],
          ] as [CalibRunMethod, string, string][]
        ).map(([method, title, hint]) => {
          const selected = recipe.method === method;
          return (
            <button
              key={method}
              type="button"
              disabled={busy}
              onClick={() => update({ method })}
              className={`rounded-[12px] px-3 py-3 text-left ring-1 disabled:opacity-40 ${
                selected
                  ? "bg-run/10 ring-run/30"
                  : "bg-panel-2 ring-border"
              }`}
            >
              <p className="text-[13px] font-medium">{title}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
            </button>
          );
        })}
      </div>

      {recipe.method === "fixedVolume" ? (
        <label className="mt-3 block text-[11px] text-muted-foreground">
          Volume de medição (mL)
          <input
            className="field-light mt-1"
            type="number"
            min={0.1}
            step="0.1"
            disabled={busy}
            value={recipe.volumeMl}
            onChange={(event) => update({ volumeMl: Number(event.target.value) })}
          />
        </label>
      ) : (
        <label className="mt-3 block text-[11px] text-muted-foreground">
          Tempo em regime (s)
          <input
            className="field-light mt-1"
            type="number"
            min={1}
            step="1"
            disabled={busy}
            value={recipe.measureS}
            onChange={(event) => update({ measureS: Number(event.target.value) })}
          />
        </label>
      )}

      {!connected && (
        <p className="mt-3 text-[12px] text-off">
          Conecte a placa para a bomba seguir o ensaio. Os campos já podem ser
          preenchidos.
        </p>
      )}
      {error && <p className="mt-3 text-[12px] text-off">{error}</p>}

      {phase === "setup" && (
        <button
          type="button"
          onClick={begin}
          disabled={!connected}
          className="mt-4 w-full rounded-[12px] bg-run py-3 text-[13px] font-semibold text-run-foreground ring-1 ring-run/30 disabled:opacity-40"
        >
          Iniciar ensaio
        </button>
      )}

      {phase === "settle" && (
        <div className="mt-4 rounded-[12px] bg-panel-2 px-3 py-3 ring-1 ring-border">
          <p className="text-[12px] font-medium">Estabilizando</p>
          <p className="mt-1 font-mono text-[20px]">
            {formatClock(Math.max(0, recipe.settleS - elapsed))}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            PWM {recipe.pwm}% · enchendo a mangueira, ainda sem contar a medição.
          </p>
        </div>
      )}

      {phase === "measure" && recipe.method === "fixedVolume" && (
        <div className="mt-4 rounded-[12px] bg-panel-2 px-3 py-3 ring-1 ring-border">
          <p className="text-[12px] font-medium">
            Cronômetro — volume alvo {recipe.volumeMl} mL
          </p>
          <p className="mt-1 font-mono text-[28px]">{formatClock(elapsed)}</p>
          <button
            type="button"
            onClick={() => finishMeasure(elapsed, recipe.volumeMl)}
            className="mt-3 w-full rounded-[12px] bg-run py-3 text-[13px] font-semibold text-run-foreground"
          >
            Atingi o volume
          </button>
        </div>
      )}

      {phase === "measure" && recipe.method === "fixedTime" && (
        <div className="mt-4 rounded-[12px] bg-panel-2 px-3 py-3 ring-1 ring-border">
          <p className="text-[12px] font-medium">Coletando em regime</p>
          <p className="mt-1 font-mono text-[28px]">
            {formatClock(Math.max(0, recipe.measureS - elapsed))}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            A bomba para sozinha ao fim do tempo.
          </p>
        </div>
      )}

      {phase === "volume" && (
        <div className="mt-4 rounded-[12px] bg-panel-2 px-3 py-3 ring-1 ring-border">
          <p className="text-[12px] font-medium">
            Informe o volume coletado em {formatClock(measureS)}
          </p>
          <label className="mt-2 block text-[11px] text-muted-foreground">
            Volume (mL)
            <input
              className="field-light mt-1"
              type="number"
              min={0.1}
              step="0.1"
              value={volumeInput}
              onChange={(event) => setVolumeInput(event.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={() => {
              const volume = Number(volumeInput);
              if (!Number.isFinite(volume) || volume <= 0) {
                setError("Informe o volume medido no béquer.");
                return;
              }
              setError(null);
              setPhase("done");
            }}
            className="mt-3 w-full rounded-[12px] bg-run py-3 text-[13px] font-semibold text-run-foreground"
          >
            Calcular vazão
          </button>
        </div>
      )}

      {phase === "done" && (
        <div className="mt-4 rounded-[12px] bg-panel-2 px-3 py-3 ring-1 ring-border">
          <p className="text-[12px] font-medium">Resultado do ensaio</p>
          <p className="mt-2 font-mono text-[13px] leading-relaxed">
            Q ≈ {flow.toFixed(2)} mL/min
            <br />
            PWM = {recipe.pwm}% · PWM₀ = {pwm0}%
            <br />
            a ≈ {slope !== null ? slope.toFixed(4) : "—"} (mL/min)/%
          </p>
          <button
            type="button"
            onClick={applyResult}
            disabled={!slope}
            className="mt-3 w-full rounded-[12px] bg-run py-3 text-[13px] font-semibold text-run-foreground disabled:opacity-40"
          >
            Aplicar a este sentido
          </button>
        </div>
      )}

      {phase !== "setup" && (
        <button
          type="button"
          onClick={cancel}
          className="mt-2 w-full rounded-[12px] bg-foreground/5 py-2.5 text-[12px] font-medium ring-1 ring-border"
        >
          Cancelar
        </button>
      )}
    </div>
  );
}
