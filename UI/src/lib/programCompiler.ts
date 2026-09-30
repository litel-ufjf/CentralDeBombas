import type { Calibration } from "./calibration";
import {
  isComparison,
  isLogic,
  isStatement,
  type CompareOp,
  type Comparison,
  type Condition,
  type IoRef,
  type ExperimentBlock,
  type FieldValue,
  type LogicOp,
  type SwitchCase,
} from "./experiment";

export const MAX_INSTRUCTIONS = 128;
/** Tamanho da pilha que a placa usa para avaliar condições compostas. */
const MAX_CONDITION_STACK = 8;

export type Instruction = {
  op: string;
  jump: number;
  cmp: ">" | "G" | "<" | "L" | "=" | "!" | "?" | "-";
  args: [string, string, string];
};

const LOGIC_CODE: Record<LogicOp, string> = { and: "&", or: "|", xor: "^", not: "~" };
const CONDITION_OPS = new Set(["Q", ...Object.values(LOGIC_CODE)]);

export type CompiledProgram = {
  instructions: Instruction[];
  estimatedSeconds: number | null;
  /** Versão mínima do protocolo de programas (PROGn) que a placa precisa anunciar. */
  firmwareLevel: number;
};

const CMP_CODE: Record<CompareOp, Instruction["cmp"]> = {
  ">": ">",
  ">=": "G",
  "<": "<",
  "<=": "L",
  "==": "=",
  "!=": "!",
};

const REF_CODE = { varFlow: "@F", varTime: "@T", varVolume: "@V", varDir: "@D" } as const;

export class ProgramCompileError extends Error {}

const NONE = "-";

function operand(value: FieldValue | undefined): string {
  if (value === undefined) {
    return "0";
  }
  if (typeof value === "object") {
    return REF_CODE[value.ref];
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

const MISSING_OPERAND =
  "Há um operador lógico (e, ou, não) com um espaço de condição vazio. Encaixe nele uma Comparação, outro operador ou a variável Sentido.";

/** Condição composta em notação pós-fixa: Q empilha uma comparação; &, |, ^ e ~ combinam o topo. */
function emitConditionPostfix(condition: Condition | null, out: Instruction[], depth = 0): number {
  if (!condition) {
    throw new ProgramCompileError(MISSING_OPERAND);
  }
  if (isLogic(condition)) {
    const left = emitConditionPostfix(condition.a, out, depth);
    const right = condition.logic === "not" ? 0 : emitConditionPostfix(condition.b, out, depth + 1);
    emit(out, LOGIC_CODE[condition.logic]);
    return Math.max(left, right);
  }
  const leaf = isComparison(condition)
    ? { args: [operand(condition.left), operand(condition.right)], cmp: CMP_CODE[condition.op] }
    : { args: [operand(condition), "0"], cmp: "!" as const };
  emit(out, "Q", leaf.args, leaf.cmp);
  return depth + 1;
}

/** Emite a instrução H/C; condições compostas vêm antes dela, e a placa as reavalia a cada passagem. */
function emitOpener(op: "H" | "C", condition: Condition, out: Instruction[]): number {
  if (!isLogic(condition)) {
    const test = conditionInstr(condition);
    return emit(out, op, test.args, test.cmp);
  }
  const start = out.length;
  const depth = emitConditionPostfix(condition, out);
  if (depth > MAX_CONDITION_STACK) {
    throw new ProgramCompileError(
      `Uma condição tem operadores lógicos aninhados demais (o limite da placa é ${MAX_CONDITION_STACK} níveis). Simplifique-a.`,
    );
  }
  return emit(out, op, [String(out.length - start)], "?");
}

function conditionInstr(condition: Comparison | { ref: IoRef }): { args: string[]; cmp: Instruction["cmp"] } {
  if (!isComparison(condition)) {
    return { args: [operand(condition), "0"], cmp: "!" };
  }
  const flowOnLeft =
    typeof condition.left === "object" &&
    condition.left.ref === "varFlow" &&
    (condition.op === ">" || condition.op === ">=");
  return {
    args: flowOnLeft
      ? [operand(condition.right)]
      : [operand(condition.left), operand(condition.right)],
    cmp: CMP_CODE[condition.op],
  };
}

/** Duração de blocos alternativos: só é conhecida se todos os caminhos durarem o mesmo. */
function sameDuration(values: (number | null)[]): number | null {
  const first = values[0] ?? 0;
  return values.every((value) => value !== null && value === first) ? first : null;
}

function compileSwitch(
  value: FieldValue | undefined,
  cases: SwitchCase[],
  elseBlocks: ExperimentBlock[],
  out: Instruction[],
): (number | null)[] {
  if (cases.length === 0) {
    return [compileList(elseBlocks, out)];
  }
  const [first, ...rest] = cases;
  const open = emit(out, "C", [operand(value), operand(first.match)], "=");
  const durations = [compileList(first.children, out)];
  if (rest.length > 0 || elseBlocks.length > 0) {
    const otherwise = emit(out, "N");
    out[open].jump = otherwise;
    durations.push(...compileSwitch(value, rest, elseBlocks, out));
    const close = emit(out, "E");
    out[otherwise].jump = close;
    out[close].jump = open;
  } else {
    const close = emit(out, "E");
    out[open].jump = close;
    out[close].jump = open;
    durations.push(0);
  }
  return durations;
}

function compileList(blocks: ExperimentBlock[], out: Instruction[]): number | null {
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
      case "switch":
        add(sameDuration(compileSwitch(f.value, block.cases ?? [], block.elseChildren ?? [], out)));
        break;
      case "for": {
        const open = emit(out, "L", [operand(f.times)]);
        const inner = compileList(block.children ?? [], out);
        const close = emit(out, "E");
        out[open].jump = close;
        out[close].jump = open;
        const times = seconds(f.times);
        add(times === null || inner === null ? null : Math.round(times) * inner);
        break;
      }
      case "while":
      case "if": {
        const condition = block.condition;
        if (!condition) {
          throw new ProgramCompileError(
            `O bloco “${block.kind === "while" ? "Enquanto" : "Se"}” está sem condição. Encaixe nele uma Comparação, um operador lógico ou a variável Sentido.`,
          );
        }
        const open = emitOpener(block.kind === "while" ? "H" : "C", condition, out);
        const inner = compileList(block.children ?? [], out);
        if (block.kind === "if" && block.elseChildren) {
          const otherwise = emit(out, "N");
          out[open].jump = otherwise;
          const alternative = compileList(block.elseChildren, out);
          const close = emit(out, "E");
          out[otherwise].jump = close;
          out[close].jump = open;
          add(sameDuration([inner, alternative]));
        } else {
          const close = emit(out, "E");
          out[open].jump = close;
          out[close].jump = open;
          add(block.kind === "while" ? null : sameDuration([inner, 0]));
        }
        break;
      }
    }
  }
  return total;
}

function firmwareLevel(instructions: Instruction[]) {
  let level = 1;
  for (const item of instructions) {
    if (item.cmp === "?" || CONDITION_OPS.has(item.op)) {
      return 4;
    }
    if (item.op === "N" || item.cmp === "=" || item.cmp === "!" || item.args.includes("@D")) {
      level = 3;
    }
    if (level === 3) {
      continue;
    }
    if ((item.op === "H" || item.op === "C") && item.args[1] !== NONE) {
      level = 2;
    }
  }
  return level;
}

export function compileProgram(blocks: ExperimentBlock[]): CompiledProgram {
  const instructions: Instruction[] = [];
  const estimatedSeconds = compileList(blocks, instructions);
  if (instructions.length === 0) {
    throw new ProgramCompileError("O programa está vazio. Arraste ao menos um bloco de ação.");
  }
  if (instructions.length > MAX_INSTRUCTIONS) {
    throw new ProgramCompileError(
      `O programa tem ${instructions.length} instruções; o limite da placa é ${MAX_INSTRUCTIONS}.`,
    );
  }
  return { instructions, estimatedSeconds, firmwareLevel: firmwareLevel(instructions) };
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
