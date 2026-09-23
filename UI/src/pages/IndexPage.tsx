import { Link } from "@tanstack/react-router";
import { AppShell } from "../components/AppShell";
import { ConnectBar } from "../components/ConnectBar";
import { useBench } from "../context/BenchContext";
import copasa from "../assets/copasa.png";
import logo from "../assets/logo.png";
import ufjf from "../assets/ufjf.png";

export function IndexPage() {
  const {
    connected,
    pumps,
    globalPwm,
    applyGlobalPwm,
    setGlobalPwm,
    stopAll,
    preferences,
  } = useBench();
  const activeCount = pumps.filter((pump) => pump.running).length;

  return (
    <AppShell wide>
      <header className="px-5 pt-2 pb-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex min-w-0 items-end gap-3">
            <img
              src={logo}
              alt="Painel de Bombas"
              className="size-12 shrink-0 rounded-[14px] ring-1 ring-border"
            />
            <div className="min-w-0">
              <p className="text-[11px] tracking-[0.3em] text-faint uppercase">
                Laboratório Litel · UFJF
              </p>
              <h1 className="mt-1 text-[28px] leading-none font-semibold text-balance">
                Painel de Bombas
              </h1>
              <p className="mt-2 text-[13px] text-muted-foreground">
                Bancada de bombas peristálticas · {activeCount} ativas ·{" "}
                {pumps.length - activeCount} paradas
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <img
              src={ufjf}
              alt="UFJF"
              className="h-12 w-auto object-contain"
            />
            <span className="h-10 w-px bg-border" />
            <div className="text-right">
              <p className="text-[10px] tracking-[0.16em] text-faint uppercase">
                Projeto
              </p>
              <img
                src={copasa}
                alt="Copasa"
                className="mt-1 h-7 w-auto object-contain"
              />
            </div>
          </div>
        </div>
      </header>

      <ConnectBar />

      <div className="sticky top-0 z-20 border-b border-border bg-panel/70 px-4 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          {preferences.display.globalPwm ? (
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 flex items-center justify-between">
              <span className="text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                PWM global
              </span>
              <span className="font-mono text-[12px] text-run">
                {globalPwm.toFixed(1)} %
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={0.1}
              value={globalPwm}
              disabled={!connected}
              aria-label="PWM global"
              onChange={(event) => setGlobalPwm(Number(event.target.value))}
              onPointerUp={(event) =>
                applyGlobalPwm(Number(event.currentTarget.value))
              }
              onKeyUp={(event) =>
                applyGlobalPwm(Number(event.currentTarget.value))
              }
              className="slider-run"
            />
          </div>
          ) : (
            <div className="min-w-0 flex-1 text-[12px] text-muted-foreground">
              Painel de bombas
            </div>
          )}
          <button
            onClick={stopAll}
            disabled={!connected}
            className="shrink-0 rounded-[10px] bg-foreground/8 px-3 py-2 text-[12px] leading-none font-medium text-foreground ring-1 ring-border active:bg-foreground/15 disabled:opacity-40"
          >
            Parar tudo
          </button>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-3 px-4 py-4 pb-6 sm:grid-cols-2 lg:grid-cols-3">
        {pumps.map((pump) => (
          <Link
            key={pump.id}
            to="/bomba/$id"
            params={{ id: String(pump.id) }}
            className="rounded-[16px] bg-panel-2/80 p-3.5 ring-1 ring-border backdrop-blur-md active:ring-run/40"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] tracking-widest text-faint">
                {pump.name}
              </span>
              <span
                className={
                  pump.running
                    ? "lamp-run size-2 rounded-full bg-run"
                    : "size-2 rounded-full bg-off/80"
                }
              />
            </div>
            <div className="mt-3 flex items-end justify-between gap-2">
              {preferences.display.estimatedFlow ? (
                <div
                  className={`font-mono text-[30px] leading-none font-semibold ${
                    pump.running ? "text-foreground" : "text-faint"
                  }`}
                >
                  {String(Math.round(pump.speed)).padStart(3, "0")}
                </div>
              ) : (
                <div
                  className={`font-mono text-[30px] leading-none font-semibold ${
                    pump.running ? "text-foreground" : "text-faint"
                  }`}
                >
                  {pump.pwm.toFixed(0).padStart(3, "0")}
                </div>
              )}
              <div className="text-right text-[10px] leading-tight text-muted-foreground">
                {preferences.display.estimatedFlow ? "mL/min estim." : "PWM %"}
                <br />
                {pump.running ? (
                  pump.direction === "forward" ? (
                    <span className="text-run">▲ Direto</span>
                  ) : (
                    <span className="text-flow">◄ Reverso</span>
                  )
                ) : (
                  <span className="text-faint">— Parada</span>
                )}
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="shrink-0 text-[10px] tracking-[0.15em] text-faint uppercase">
                PWM
              </span>
              <div className="h-1 flex-1 rounded-full bg-input">
                <div
                  className={`h-full rounded-full ${
                    pump.running
                      ? pump.direction === "reverse"
                        ? "bg-flow"
                        : "bg-run"
                      : "bg-off/70"
                  }`}
                  style={{ width: `${pump.pwm}%` }}
                />
              </div>
              <span
                className={`shrink-0 font-mono text-[11px] ${
                  pump.running ? "text-muted-foreground" : "text-faint"
                }`}
              >
                {pump.pwm.toFixed(1)}%
              </span>
            </div>
            <div className="mt-3 grid h-8 place-items-center rounded-[10px] bg-foreground/5 ring-1 ring-border">
              <span className="font-mono text-[12px] text-foreground">
                Abrir ›
              </span>
            </div>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
