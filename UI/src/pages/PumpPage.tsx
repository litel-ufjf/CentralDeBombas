import { useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { AppShell } from "../components/AppShell";
import { CalibrateRunPanel } from "../components/CalibrateRunPanel";
import { CalibrationPanel } from "../components/CalibrationPanel";
import { ConnectBar } from "../components/ConnectBar";
import { ExperimentModal } from "../components/ExperimentModal";
import { PumpMonitor } from "../components/PumpMonitor";
import { useBench } from "../context/BenchContext";
import {
  maxFlowFromCalibration,
  type PumpDirection,
} from "../lib/calibration";

export function PumpPage() {
  const { id } = useParams({ from: "/bomba/$id" });
  const {
    connected,
    pumps,
    setPwm,
    setFlow,
    setDirection,
    toggleRunning,
    setCalibration,
    saveCalibrationHistory,
    applyCalibrationHistory,
    chartsFor,
    samplesFor,
    volumeFor,
    monitoringFor,
    addChart,
    updateChart,
    removeChart,
    resetTelemetry,
  } = useBench();
  const [experimentOpen, setExperimentOpen] = useState(false);
  const pump = pumps.find((item) => item.id === Number(id));
  const maxFlow = pump ? maxFlowFromCalibration(pump.calibration) : 0;

  if (!pump) {
    return (
      <AppShell>
        <div className="grid flex-1 place-items-center px-6 text-center">
          <div>
            <p className="font-mono text-[11px] tracking-widest text-faint">
              UNIDADE INEXISTENTE
            </p>
            <h1 className="mt-2 text-[20px] font-semibold">
              Bomba não encontrada
            </h1>
            <Link
              to="/"
              className="mt-5 inline-block rounded-[12px] bg-foreground/5 px-4 py-2.5 text-[13px] ring-1 ring-border"
            >
              Voltar ao painel
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell wide>
      <ConnectBar />
      <div className="px-5 pt-3 pb-1">
        <Link
          to="/"
          className="font-mono text-[11px] tracking-widest text-muted-foreground"
        >
          ‹ PAINEL
        </Link>
      </div>
      <section className="mt-3 flex-1 rounded-t-[22px] bg-panel/90 px-5 pt-3 pb-8 ring-1 ring-border backdrop-blur-2xl">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-foreground/20" />
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[11px] tracking-widest text-faint">
              UNIDADE {pump.name}
            </p>
            <h1 className="mt-0.5 truncate text-[20px] leading-none font-semibold">
              Bomba de Fluxo
            </h1>
          </div>
          <span
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 ring-1 ${
              pump.running
                ? "bg-run/10 ring-run/30"
                : "bg-off/10 ring-off/30"
            }`}
          >
            <span
              className={
                pump.running
                  ? "lamp-run size-1.5 rounded-full bg-run"
                  : "size-1.5 rounded-full bg-off"
              }
            />
            <span
              className={`text-[11px] font-medium ${
                pump.running ? "text-run" : "text-off"
              }`}
            >
              {pump.running ? "Ativa" : "Desativada"}
            </span>
          </span>
        </div>

        <div className="mt-6">
          <div className="mb-1 flex items-end justify-between">
            <span className="text-[11px] tracking-[0.15em] text-muted-foreground uppercase">
              Velocidade estimada
            </span>
            <span className="font-mono text-[15px] text-foreground">
              {pump.speed.toFixed(1)}{" "}
              <span className="text-[10px] text-muted-foreground">mL/min</span>
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(1, maxFlow)}
            step={0.5}
            value={Math.min(maxFlow, pump.speed)}
            disabled={!connected}
            aria-label="Velocidade estimada da bomba"
            onChange={(event) => setFlow(pump.id, Number(event.target.value))}
            className="slider-run"
          />
        </div>

        <div className="mt-4">
          <div className="mb-1 flex items-end justify-between">
            <span className="text-[11px] tracking-[0.15em] text-muted-foreground uppercase">
              PWM
            </span>
            <span className="font-mono text-[15px] text-foreground">
              {pump.pwm.toFixed(1)}{" "}
              <span className="text-[10px] text-muted-foreground">%</span>
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={0.1}
            value={pump.pwm}
            disabled={!connected}
            aria-label="PWM da bomba"
            onChange={(event) => setPwm(pump.id, Number(event.target.value))}
            className="slider-run slider-flow"
          />
        </div>

        <div className="mt-6">
          <span className="text-[11px] tracking-[0.15em] text-muted-foreground uppercase">
            Sentido de rotação
          </span>
          <div className="mt-2 flex rounded-[12px] bg-foreground/5 p-1 ring-1 ring-border">
            {(["forward", "reverse"] as PumpDirection[]).map((direction) => {
              const selected = pump.direction === direction;
              return (
                <button
                  key={direction}
                  disabled={!connected}
                  onClick={() => setDirection(pump.id, direction)}
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

        <button
          onClick={() => toggleRunning(pump.id)}
          disabled={!connected}
          className={`mt-6 w-full rounded-[14px] py-3.5 text-[13px] leading-none font-semibold ring-1 disabled:opacity-40 ${
            pump.running
              ? "bg-run/90 text-run-foreground ring-run"
              : "bg-foreground/5 text-foreground ring-border"
          }`}
        >
          {pump.running ? "Desligar bomba" : "Ligar bomba"}
        </button>

        <button
          type="button"
          onClick={() => setExperimentOpen(true)}
          className="mt-3 w-full rounded-[14px] bg-panel-2 py-3.5 text-[13px] leading-none font-semibold text-foreground ring-1 ring-border"
        >
          Programar experimento
        </button>

        <div className="mt-8">
          <CalibrateRunPanel key={pump.id} pumpId={pump.id} />
        </div>

        <div className="mt-6">
          <CalibrationPanel
            set={pump.calibrationSet}
            onChange={(scope, calibration) =>
              setCalibration(pump.id, scope, calibration)
            }
            onSaveHistory={(scope, name) =>
              saveCalibrationHistory(pump.id, scope, name)
            }
            onApplyHistory={(record) =>
              applyCalibrationHistory(pump.id, record)
            }
          />
        </div>

        <div className="mt-6">
          <PumpMonitor
            charts={chartsFor(pump.id)}
            samples={samplesFor(pump.id)}
            volume={volumeFor(pump.id)}
            monitoring={monitoringFor(pump.id)}
            onAdd={() => addChart(pump.id)}
            onUpdate={(chart) => updateChart(pump.id, chart)}
            onRemove={(chartId) => removeChart(pump.id, chartId)}
            onReset={() => resetTelemetry(pump.id)}
          />
        </div>
      </section>
      {experimentOpen ? (
        <ExperimentModal
          key={pump.id}
          pumpId={pump.id}
          pumpName={pump.name}
          onClose={() => setExperimentOpen(false)}
        />
      ) : null}
    </AppShell>
  );
}
