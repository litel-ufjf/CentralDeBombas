import {
  MOTOR_COUNT,
  clampPwm,
  type PumpDirection,
  type PumpSetpoint,
} from "./calibration";

export type ParsedHello = {
  kind: "hello";
  motors: number;
  bits: number;
  programs: boolean;
};

export type ParsedState = {
  kind: "state";
  pumps: PumpSetpoint[];
};

export type ParsedError = {
  kind: "error";
  code: string;
  message: string;
};

export type ParsedClock = {
  kind: "clock";
  epochMs: number;
};

export type ProgramState =
  | "empty"
  | "loading"
  | "ready"
  | "waiting"
  | "running"
  | "paused"
  | "done"
  | "stopped";

export type ProgramStatus = {
  state: ProgramState;
  pc: number;
  count: number;
  runSeconds: number;
  startAt: number | null;
  flow: number;
  receivedAt: number;
};

export type ParsedReport = {
  kind: "report";
  id: number;
  status: ProgramStatus;
};

export type ParsedLine =
  | ParsedHello
  | ParsedState
  | ParsedError
  | ParsedClock
  | ParsedReport;

const STATE_BY_CODE: Record<string, ProgramState> = {
  E: "empty",
  L: "loading",
  K: "ready",
  W: "waiting",
  U: "running",
  P: "paused",
  D: "done",
  S: "stopped",
};

const ERROR_TEXT: Record<string, string> = {
  prog: "Esta bomba está sob um programa. Pare o programa para controlar manualmente.",
  ocupada: "Já há um programa ativo nesta bomba. Pare-o antes de enviar outro.",
  relogio: "O relógio da placa não está sincronizado para agendar.",
  incompleto: "O programa não chegou completo à placa. Envie novamente.",
  estado: "O programa não está no estado esperado para esta ação.",
  tamanho: "O programa excede o limite de instruções da placa.",
  instr: "Instrução inválida no programa.",
  operando: "Valor inválido em um bloco do programa.",
  sem_programa: "A placa não estava recebendo um programa. Envie novamente.",
  calib: "Calibração inválida enviada à placa.",
  cmd: "Comando desconhecido pela placa. Atualize o firmware.",
};

export function errorText(code: string) {
  return ERROR_TEXT[code] ?? code;
}

export function isOwnedState(state: ProgramState) {
  return state === "waiting" || state === "running" || state === "paused";
}

export function parseLine(raw: string): ParsedLine | null {
  const line = raw.trim();
  if (!line) {
    return null;
  }

  const parts = line.split(",");
  const tag = parts[0];

  if (tag === "H") {
    return {
      kind: "hello",
      motors: Number(parts[2] || MOTOR_COUNT),
      bits: Number(parts[3] || 12),
      programs: parts.slice(4).includes("PROG1"),
    };
  }

  if (tag === "ERR") {
    const code = parts.slice(1).join(",") || "erro";
    return { kind: "error", code, message: errorText(code) };
  }

  if (tag === "T") {
    return { kind: "clock", epochMs: Number(parts[1]) || 0 };
  }

  if (tag === "R") {
    const id = Number(parts[1]);
    const state = STATE_BY_CODE[parts[2]];
    if (!state || id < 1 || id > MOTOR_COUNT) {
      return null;
    }
    const startAt = Number(parts[6]) || 0;
    return {
      kind: "report",
      id,
      status: {
        state,
        pc: Number(parts[3]) || 0,
        count: Number(parts[4]) || 0,
        runSeconds: Number(parts[5]) || 0,
        startAt: startAt > 0 ? startAt : null,
        flow: Number(parts[7]) || 0,
        receivedAt: Date.now(),
      },
    };
  }

  if (tag === "S") {
    const pumps = createEmptyState();
    for (let i = 1; i + 3 < parts.length; i += 4) {
      const id = Number(parts[i]);
      if (id < 1 || id > MOTOR_COUNT) {
        continue;
      }
      pumps[id - 1] = {
        enabled: parts[i + 1] === "1",
        direction: parts[i + 2] === "R" ? "reverse" : "forward",
        pwm: clampPwm(Number(parts[i + 3])),
      };
    }
    return { kind: "state", pumps };
  }

  return null;
}

export function createEmptyState(): PumpSetpoint[] {
  return Array.from({ length: MOTOR_COUNT }, () => ({
    enabled: false,
    direction: "forward" as const,
    pwm: 0,
  }));
}

export function emptyProgramStatus(): ProgramStatus {
  return {
    state: "empty",
    pc: 0,
    count: 0,
    runSeconds: 0,
    startAt: null,
    flow: 0,
    receivedAt: 0,
  };
}

export const commands = {
  hello: () => "H",
  get: () => "G",
  stopAll: () => "X",
  stopManual: () => "XM",
  time: (epochMs: number) => `T,${Math.round(epochMs)}`,
  pwm: (id: number, percent: number) => `P,${id},${clampPwm(percent).toFixed(2)}`,
  direction: (id: number, direction: PumpDirection) =>
    `D,${id},${direction === "forward" ? "F" : "R"}`,
  enable: (id: number, enabled: boolean) => `E,${id},${enabled ? 1 : 0}`,
  programPause: (id: number, paused: boolean) => `PP,${id},${paused ? 1 : 0}`,
  programStop: (id: number) => `PX,${id}`,
};
