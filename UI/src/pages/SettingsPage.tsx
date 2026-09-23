import { Link } from "@tanstack/react-router";
import { AppShell } from "../components/AppShell";
import { ConnectBar } from "../components/ConnectBar";
import { useBench } from "../context/BenchContext";
import { scopeLabel } from "../lib/calibration";
import {
  describeRecord,
  latestAny,
  latestForDirection,
  manualPickFor,
  resolveCalibration,
  type CalibrationPolicy,
  type DisplayPreferences,
} from "../lib/preferences";

const DISPLAY_OPTIONS: { key: keyof DisplayPreferences; label: string; hint: string }[] = [
  {
    key: "estimatedFlow",
    label: "Vazão estimada",
    hint: "Número em mL/min nos cartões e na página da bomba.",
  },
  {
    key: "globalPwm",
    label: "PWM global",
    hint: "Barra no painel para ajustar as seis bombas juntas.",
  },
  {
    key: "calibrateRun",
    label: "Ensaio Calibrar",
    hint: "Assistente de volume fixo ou tempo fixo.",
  },
  {
    key: "calibrationEditor",
    label: "Zona morta e histórico",
    hint: "Coeficientes a, PWM₀ e lista de ensaios.",
  },
  {
    key: "experiment",
    label: "Programar experimento",
    hint: "Editor no-code na página da bomba.",
  },
  {
    key: "charts",
    label: "Gráficos",
    hint: "Vazão e volume acumulado.",
  },
];

const POLICIES: { id: CalibrationPolicy; title: string; text: string }[] = [
  {
    id: "latest",
    title: "Última por sentido",
    text: "Adota o ensaio mais recente daquele sentido. Se ainda não houver, usa o outro sentido, se existir.",
  },
  {
    id: "shared",
    title: "Mesma para os dois sentidos",
    text: "O ensaio mais recente vale no direto e no reverso.",
  },
  {
    id: "manual",
    title: "Escolher manualmente",
    text: "Você aponta qual ensaio do histórico vale para cada sentido.",
  },
];

export function SettingsPage() {
  const {
    pumps,
    preferences,
    setCalibrationPolicy,
    setManualCalibration,
    setDisplayPreference,
  } = useBench();

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
      <section className="mt-3 flex-1 rounded-t-[22px] bg-panel/90 px-5 pt-3 pb-10 ring-1 ring-border backdrop-blur-2xl">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-foreground/20" />
        <p className="font-mono text-[11px] tracking-widest text-faint">
          PREFERÊNCIAS
        </p>
        <h1 className="mt-0.5 text-[20px] leading-none font-semibold">
          Configurações
        </h1>
        <p className="mt-3 text-[13px] text-muted-foreground">
          O que aparece na tela e qual calibração a bomba usa quando há vários
          ensaios. Sem login, isso fica no perfil Visitante.
        </p>

        <div className="mt-8">
          <p className="text-[11px] tracking-[0.15em] text-muted-foreground uppercase">
            Exibir
          </p>
          <ul className="mt-3 space-y-2">
            {DISPLAY_OPTIONS.map((item) => {
              const on = preferences.display[item.key];
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => setDisplayPreference(item.key, !on)}
                    className="flex w-full items-start justify-between gap-3 rounded-[14px] bg-foreground/4 px-3 py-3 text-left ring-1 ring-border"
                  >
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium">
                        {item.label}
                      </span>
                      <span className="mt-0.5 block text-[12px] text-muted-foreground">
                        {item.hint}
                      </span>
                    </span>
                    <span
                      className={`mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 ring-1 ${
                        on ? "bg-run/20 ring-run/40" : "bg-foreground/5 ring-border"
                      }`}
                      aria-hidden
                    >
                      <span
                        className={`size-4 rounded-full transition-transform ${
                          on ? "translate-x-4 bg-run" : "bg-faint"
                        }`}
                      />
                    </span>
                    <span className="sr-only">{on ? "Visível" : "Oculto"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="mt-10">
          <p className="text-[11px] tracking-[0.15em] text-muted-foreground uppercase">
            Calibração adotada
          </p>
          <p className="mt-2 text-[12px] text-muted-foreground">
            Um ensaio pode valer só para um sentido. O padrão é a última
            calibração daquele sentido; o outro sentido busca a dele ou, se não
            houver, reutiliza a que existir.
          </p>
          <div className="mt-3 space-y-2">
            {POLICIES.map((item) => {
              const selected = preferences.calibrationPolicy === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setCalibrationPolicy(item.id)}
                  className={`w-full rounded-[14px] px-3 py-3 text-left ring-1 ${
                    selected
                      ? "bg-run/10 ring-run/30"
                      : "bg-foreground/4 ring-border"
                  }`}
                >
                  <span className="flex items-center gap-2 text-[13px] font-medium">
                    <span
                      className={`grid size-4 place-items-center rounded-full ring-1 ${
                        selected ? "ring-run" : "ring-border"
                      }`}
                    >
                      {selected ? (
                        <span className="size-2 rounded-full bg-run" />
                      ) : null}
                    </span>
                    {item.title}
                  </span>
                  <span className="mt-1 block pl-6 text-[12px] text-muted-foreground">
                    {item.text}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-8 space-y-3">
          {pumps.map((pump) => {
            const pick = manualPickFor(preferences, pump.id);
            const forward = resolveCalibration(
              pump.calibrationSet,
              "forward",
              preferences,
              pump.id,
            );
            const reverse = resolveCalibration(
              pump.calibrationSet,
              "reverse",
              preferences,
              pump.id,
            );
            const history = pump.calibrationSet.history;
            return (
              <div
                key={pump.id}
                className="rounded-[14px] bg-foreground/4 p-3 ring-1 ring-border"
              >
                <p className="font-mono text-[11px] tracking-widest text-faint">
                  {pump.name}
                </p>
                {preferences.calibrationPolicy === "manual" ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {(["forward", "reverse"] as const).map((direction) => (
                      <label
                        key={direction}
                        className="text-[11px] text-muted-foreground"
                      >
                        {scopeLabel(direction)}
                        <select
                          className="field-light mt-1"
                          value={
                            (direction === "forward"
                              ? pick.forwardId
                              : pick.reverseId) ?? ""
                          }
                          onChange={(event) => {
                            if (event.target.value) {
                              setManualCalibration(
                                pump.id,
                                direction,
                                event.target.value,
                              );
                            }
                          }}
                        >
                          <option value="">
                            {history.length === 0
                              ? "Sem ensaios"
                              : "Escolha um ensaio"}
                          </option>
                          {history.map((record) => (
                            <option key={record.id} value={record.id}>
                              {describeRecord(record)}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                ) : (
                  <dl className="mt-2 space-y-1 text-[12px] text-muted-foreground">
                    <div>
                      <dt className="inline text-faint">Direto · </dt>
                      <dd className="inline">
                        {describeRecord(
                          preferences.calibrationPolicy === "shared"
                            ? latestAny(pump.calibrationSet)
                            : (latestForDirection(
                                pump.calibrationSet,
                                "forward",
                              ) ?? forward.record),
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline text-faint">Reverso · </dt>
                      <dd className="inline">
                        {describeRecord(
                          preferences.calibrationPolicy === "shared"
                            ? latestAny(pump.calibrationSet)
                            : (latestForDirection(
                                pump.calibrationSet,
                                "reverse",
                              ) ?? reverse.record),
                        )}
                      </dd>
                    </div>
                  </dl>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </AppShell>
  );
}
