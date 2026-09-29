import { useCallback, useEffect, useMemo, useState } from "react";
import { useBench } from "../context/BenchContext";
import type { ExperimentBlock } from "../lib/experiment";
import type { ConfirmationPreferences } from "../lib/preferences";
import { compileProgram, formatDuration } from "../lib/programCompiler";
import { isOwnedState, type ProgramState, type ProgramStatus } from "../lib/protocol";
import { ConfirmDialog, type ConfirmRequest } from "./ConfirmDialog";

const STATE_LABEL: Record<ProgramState, string> = {
  empty: "Sem programa",
  loading: "Enviando",
  ready: "Carregado",
  waiting: "Agendado",
  running: "Executando",
  paused: "Pausado",
  done: "Concluído",
  stopped: "Parado",
};

const STATE_TONE: Record<ProgramState, string> = {
  empty: "bg-foreground/5 text-muted-foreground ring-border",
  loading: "bg-flow/10 text-flow ring-flow/30",
  ready: "bg-foreground/5 text-muted-foreground ring-border",
  waiting: "bg-flow/10 text-flow ring-flow/30",
  running: "bg-run/10 text-run ring-run/30",
  paused: "bg-amber-500/10 text-amber-700 ring-amber-500/30",
  done: "bg-emerald-600/10 text-emerald-700 ring-emerald-600/30",
  stopped: "bg-off/10 text-off ring-off/30",
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toLocalInput(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function defaultStart() {
  const minute = 60000;
  return toLocalInput(Math.ceil((Date.now() + 5 * minute) / minute) * minute);
}

function formatClock(ms: number) {
  return new Date(ms).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) {
      return;
    }
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

function elapsedSeconds(status: ProgramStatus, now: number) {
  if (status.state !== "running") {
    return status.runSeconds;
  }
  return status.runSeconds + Math.max(0, now - status.receivedAt) / 1000;
}

export function ProgramBadge({ status }: { status: ProgramStatus }) {
  if (status.state === "empty" || status.state === "ready") {
    return null;
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${
        STATE_TONE[status.state]
      }`}
    >
      {status.state === "running" ? (
        <span className="lamp-run size-1.5 rounded-full bg-run" />
      ) : null}
      {STATE_LABEL[status.state]}
    </span>
  );
}

export function ProgramControls({
  pumpId,
  pumpName,
  blocks,
  onBeforeRun,
  layout,
}: {
  pumpId: number;
  pumpName: string;
  blocks: ExperimentBlock[];
  onBeforeRun?: () => void;
  layout: "bar" | "card" | "mini";
}) {
  const {
    connected,
    programSupport,
    programs,
    programEstimates,
    runProgram,
    pauseProgram,
    resumeProgram,
    stopProgram,
    preferences,
    setConfirmation,
  } = useBench();
  const status = programs[pumpId - 1];
  const owned = isOwnedState(status.state);
  const [mode, setMode] = useState<"now" | "schedule">("now");
  const [when, setWhen] = useState(defaultStart);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const now = useNow(status.state === "running" || status.state === "waiting");
  const closeConfirm = useCallback(() => setConfirm(null), []);

  const compiled = useMemo(() => {
    try {
      return { program: compileProgram(blocks), error: null };
    } catch (caught) {
      return {
        program: null,
        error: caught instanceof Error ? caught.message : "Programa inválido.",
      };
    }
  }, [blocks]);

  const ask = (
    key: keyof ConfirmationPreferences,
    request: Omit<ConfirmRequest, "onConfirm">,
    action: () => void,
  ) => {
    if (!preferences.confirmations[key]) {
      action();
      return;
    }
    setConfirm({
      ...request,
      onConfirm: (dontAsk) => {
        if (dontAsk) {
          setConfirmation(key, false);
        }
        setConfirm(null);
        action();
      },
    });
  };

  const start = async () => {
    setMessage(null);
    let startAt: number | null = null;
    if (mode === "schedule") {
      startAt = new Date(when).getTime();
      if (!Number.isFinite(startAt)) {
        setMessage("Informe a data e a hora de início.");
        return;
      }
    }
    onBeforeRun?.();
    setBusy(true);
    try {
      await runProgram(pumpId, blocks, startAt);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Falha ao enviar o programa.");
    } finally {
      setBusy(false);
    }
  };

  const requestPause = () =>
    ask(
      "pauseProgram",
      {
        title: "Pausar programação?",
        message: `A bomba ${pumpName} desliga até você retomar. O tempo em pausa não conta no programa.`,
        confirmLabel: "Pausar",
      },
      () => pauseProgram(pumpId),
    );

  const requestStop = () =>
    ask(
      "stopProgram",
      status.state === "waiting"
        ? {
            title: "Cancelar agendamento?",
            message: `A programação da bomba ${pumpName} não vai mais começar no horário marcado.`,
            confirmLabel: "Cancelar agendamento",
            danger: true,
          }
        : {
            title: "Parar programação?",
            message: `A execução é encerrada e a bomba ${pumpName} desliga. Para rodar de novo, o programa recomeça do início.`,
            confirmLabel: "Parar",
            danger: true,
          },
      () => stopProgram(pumpId),
    );

  const estimate = owned ? programEstimates[pumpId - 1] : compiled.program?.estimatedSeconds;
  const elapsed = elapsedSeconds(status, now);
  const progress =
    estimate && estimate > 0 && (status.state === "running" || status.state === "paused")
      ? Math.min(1, elapsed / estimate)
      : null;

  let detail: string;
  if (status.state === "waiting" && status.startAt) {
    detail = `Início ${formatClock(status.startAt)} · em ${formatDuration(
      (status.startAt - now) / 1000,
    )}`;
  } else if (status.state === "running") {
    detail = `${formatDuration(elapsed)}${
      estimate ? ` de ~${formatDuration(estimate)}` : ""
    } · ${status.flow.toFixed(1)} mL/min`;
  } else if (status.state === "paused") {
    detail = `Pausado em ${formatDuration(status.runSeconds)}`;
  } else if (compiled.error) {
    detail = compiled.error;
  } else if (compiled.program) {
    const prefix =
      status.state === "done"
        ? `Concluído em ${formatDuration(status.runSeconds)} · `
        : status.state === "stopped"
          ? `Interrompido em ${formatDuration(status.runSeconds)} · `
          : "";
    detail = `${prefix}${
      compiled.program.estimatedSeconds === null
        ? "Duração variável"
        : `Duração ~${formatDuration(compiled.program.estimatedSeconds)}`
    } · ${compiled.program.instructions.length} instruções`;
  } else {
    detail = "";
  }

  let hint: string | null = null;
  if (!connected) {
    hint = "Conecte o Arduino para executar.";
  } else if (!programSupport) {
    hint = "Firmware sem suporte a programas: grave Arduino/interface_prog na placa.";
  }

  const canStart = connected && programSupport && !busy && !compiled.error;
  const bar = layout === "bar";
  const mini = layout === "mini";

  const buttonBase = `shrink-0 rounded-[8px] leading-none font-semibold ring-1 disabled:cursor-not-allowed disabled:opacity-40 ${
    mini ? "px-2.5 py-1.5 text-[11.5px]" : "px-3.5 py-2 text-[12.5px]"
  }`;

  const statusBlock = (
    <div className={`min-w-0 ${bar || mini ? "flex-1" : ""}`}>
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${
            STATE_TONE[busy ? "loading" : status.state]
          }`}
        >
          {status.state === "running" && !busy ? (
            <span className="lamp-run size-1.5 rounded-full bg-run" />
          ) : null}
          {busy ? "Enviando" : owned || status.state !== "empty" ? STATE_LABEL[status.state] : "Pronto"}
        </span>
        <span className="truncate text-[12px] text-muted-foreground" title={detail}>
          {detail}
        </span>
      </div>
      {progress !== null ? (
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-input">
          <div
            className={`h-full rounded-full ${
              status.state === "paused" ? "bg-amber-500" : "bg-run"
            }`}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      ) : null}
      {message ? (
        <p role="alert" className="mt-1 text-[12px] text-[var(--destructive)]">
          {message}
        </p>
      ) : hint && !mini ? (
        <p className="mt-1 text-[11.5px] text-faint">{hint}</p>
      ) : null}
    </div>
  );

  const actions = owned ? (
    <div className="flex shrink-0 items-center gap-2">
      {status.state === "running" ? (
        <button
          type="button"
          onClick={requestPause}
          disabled={!connected}
          className={`${buttonBase} bg-panel-2 text-foreground ring-border hover:bg-foreground/5`}
        >
          Pausar
        </button>
      ) : null}
      {status.state === "paused" ? (
        <button
          type="button"
          onClick={() => resumeProgram(pumpId)}
          disabled={!connected}
          className={`${buttonBase} bg-run text-run-foreground ring-run hover:brightness-95`}
        >
          Retomar
        </button>
      ) : null}
      <button
        type="button"
        onClick={requestStop}
        disabled={!connected}
        className={`${buttonBase} bg-[var(--destructive)] text-white ring-[var(--destructive)] hover:brightness-95`}
      >
        {status.state === "waiting" ? (mini ? "Cancelar" : "Cancelar agendamento") : "Parar"}
      </button>
    </div>
  ) : mini ? null : (
    <div className={`flex items-center gap-2 ${bar ? "shrink-0" : "flex-wrap"}`}>
      <div
        role="radiogroup"
        aria-label="Início da programação"
        className="flex shrink-0 rounded-[8px] bg-foreground/5 p-0.5 ring-1 ring-border"
      >
        {(
          [
            ["now", "Agora"],
            ["schedule", "Agendar"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            onClick={() => setMode(value)}
            className={`rounded-[6px] px-2.5 py-1.5 text-[12px] leading-none font-medium ${
              mode === value ? "bg-panel-2 text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === "schedule" ? (
        <input
          type="datetime-local"
          aria-label="Data e hora de início"
          value={when}
          min={toLocalInput(Date.now())}
          onChange={(event) => setWhen(event.target.value)}
          className="h-[30px] shrink-0 rounded-[8px] bg-panel-2 px-2 text-[12px] text-foreground ring-1 ring-border outline-none focus:ring-run/50"
        />
      ) : null}
      <button
        type="button"
        onClick={() => void start()}
        disabled={!canStart}
        className={`${buttonBase} bg-[#166993] text-white ring-[#166993] hover:bg-[#12597d]`}
      >
        {busy ? "Enviando…" : mode === "now" ? "Executar agora" : "Agendar"}
      </button>
    </div>
  );

  return (
    <>
      {mini ? (
        <div className="space-y-2">
          {statusBlock}
          {actions ? <div className="flex justify-end">{actions}</div> : null}
        </div>
      ) : bar ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {statusBlock}
          {actions}
        </div>
      ) : (
        <div className="space-y-3">
          {statusBlock}
          {actions}
        </div>
      )}
      <ConfirmDialog request={confirm} onCancel={closeConfirm} />
    </>
  );
}
