import type { Calibration } from "./calibration";
import {
  isStatement,
  type CompareOp,
  type Condition,
  type ExperimentBlock,
  type FieldValue,
} from "./experiment";

export const MAX_INSTRUCTIONS = 128;

export type Instruction = {
  op: string;
  jump: number;
  cmp: ">" | "G" | "<" | "L" | "-";
  args: [string, string, string];
};

export type CompiledProgram = {
  instructions: Instruction[];
  estimatedSeconds: number | null;
  /** Usa comparações que só o firmware com PROG2 entende. */
  needsConditions: boolean;
};

const CMP_CODE: Record<CompareOp, Instruction["cmp"]> = {
  ">": ">",
  ">=": "G",
  "<": "<",
  "<=": "L",
};

export class ProgramCompileError extends Error {}

const NONE = "-";

function operand(value: FieldValue | undefined): string {
  if (value === undefined) {
    return "0";
  }
  if (typeof value === "object") {
    if (value.ref === "varFlow") {
      return "@F";
    }
    if (value.ref === "varTime") {
      return "@T";
    }
    return "@V";
  }
  if (!Number.isFinite(value)) {
    return "0";
  }
  return String(Math.round(value * 1000) / 1000);
}

function seconds(value: FieldValue | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : null;
}

function emit(
  out: Instruction[],
  op: string,
  args: string[] = [],
  cmp: Instruction["cmp"] = "-",
): number {
  out.push({
    op,
    jump: -1,
    cmp,
    args: [args[0] ?? NONE, args[1] ?? NONE, args[2] ?? NONE],
  });
  return out.length - 1;
}

type CompileState = { out: Instruction[]; needsConditions: boolean };

function conditionArgs(condition: Condition, state: CompileState) {
  const flowOnLeft =
    typeof condition.left === "object" &&
    condition.left.ref === "varFlow" &&
    (condition.op === ">" || condition.op === ">=");
  if (flowOnLeft) {
    return [operand(condition.right)];
  }
  state.needsConditions = true;
  return [operand(condition.left), operand(condition.right)];
}

function compileList(blocks: ExperimentBlock[], state: CompileState): number | null {
  const out = state.out;
  let total: number | null = 0;
  const add = (value: number | null) => {
    total = total === null || value === null ? null : total + value;
  };

  for (const block of blocks) {
    if (!isStatement(block.kind)) {
      continue;
    }
    const f = block.fields;
    switch (block.kind) {
      case "setFlow":
        emit(out, "F", [operand(f.flow)]);
        break;
      case "invert":
        emit(out, "I");
        break;
      case "pause":
        emit(out, "W", [operand(f.seconds)]);
        add(seconds(f.seconds));
        break;
      case "ramp":
        emit(out, "R", [operand(f.from), operand(f.to), operand(f.duration)]);
        add(seconds(f.duration));
        break;
      case "sine":
        emit(out, "S", [operand(f.center), operand(f.amplitude), operand(f.period)]);
        add(seconds(f.period));
        break;
      case "step":
        emit(out, "D", [operand(f.from), operand(f.to), operand(f.duration)]);
        add(seconds(f.duration));
        break;
      case "for":
      case "while":
      case "if": {
        let open: number;
        if (block.kind === "for") {
          open = emit(out, "L", [operand(f.times)]);
        } else {
          const condition = block.condition;
          if (!condition) {
            throw new ProgramCompileError(
              `O bloco “${block.kind === "while" ? "Enquanto" : "Se"}” está sem condição. Encaixe nele uma Comparação.`,
            );
          }
          open = emit(
            out,
            block.kind === "while" ? "H" : "C",
            conditionArgs(condition, state),
            CMP_CODE[condition.op],
          );
        }
        const inner = compileList(block.children ?? [], state);
        const close = emit(out, "E");
        out[open].jump = close;
        out[close].jump = open;
        if (block.kind === "for") {
          const times = seconds(f.times);
          add(times === null || inner === null ? null : Math.round(times) * inner);
        } else if (block.kind === "while") {
          add(null);
        } else {
          add(inner === 0 ? 0 : null);
        }
        break;
      }
    }
  }
  return total;
}

export function compileProgram(blocks: ExperimentBlock[]): CompiledProgram {
  const state: CompileState = { out: [], needsConditions: false };
  const estimatedSeconds = compileList(blocks, state);
  const instructions = state.out;
  if (instructions.length === 0) {
    throw new ProgramCompileError("O programa está vazio. Arraste ao menos um bloco de ação.");
  }
  if (instructions.length > MAX_INSTRUCTIONS) {
    throw new ProgramCompileError(
      `O programa tem ${instructions.length} instruções; o limite da placa é ${MAX_INSTRUCTIONS}.`,
    );
  }
  return { instructions, estimatedSeconds, needsConditions: state.needsConditions };
}

function calibField(value: number) {
  return String(Math.round(value * 10000) / 10000);
}

export function programLines(
  pumpId: number,
  program: CompiledProgram,
  forward: Calibration,
  reverse: Calibration,
  startAt: number | null,
): string[] {
  const lines = [
    [
      "PB",
      pumpId,
      program.instructions.length,
      calibField(forward.a),
      calibField(forward.pwm0),
      calibField(reverse.a),
      calibField(reverse.pwm0),
    ].join(","),
  ];
  program.instructions.forEach((item, index) => {
    lines.push(
      ["PI", pumpId, index, item.op, item.jump, item.cmp, ...item.args].join(","),
    );
  });
  lines.push(`PS,${pumpId},${startAt && startAt > 0 ? Math.round(startAt) : 0}`);
  return lines;
}

export function formatDuration(totalSeconds: number) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  if (h > 0) {
    return `${h}h ${String(m).padStart(2, "0")}min`;
  }
  if (m > 0) {
    return `${m}min ${String(rest).padStart(2, "0")}s`;
  }
  return `${rest}s`;
}
