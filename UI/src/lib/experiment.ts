import { newId } from "./calibration";

export type BlockCategory = "logic" | "action" | "profile" | "compare" | "io";

export type BlockKind =
  | "while"
  | "for"
  | "if"
  | "ifElse"
  | "switch"
  | "setFlow"
  | "invert"
  | "pause"
  | "ramp"
  | "sine"
  | "step"
  | "compare"
  | "and"
  | "or"
  | "xor"
  | "not"
  | "varFlow"
  | "varTime"
  | "varVolume"
  | "varDir";

export type IoRef = "varFlow" | "varTime" | "varVolume" | "varDir";
export type FieldValue = number | { ref: IoRef };

export type CompareOp = ">" | ">=" | "<" | "<=" | "==" | "!=";

export const COMPARE_OPS: { op: CompareOp; label: string }[] = [
  { op: ">", label: ">" },
  { op: ">=", label: "≥" },
  { op: "<", label: "<" },
  { op: "<=", label: "≤" },
  { op: "==", label: "=" },
  { op: "!=", label: "≠" },
];

export type Comparison = { left: FieldValue; op: CompareOp; right: FieldValue };
export type BinaryLogic = "and" | "or" | "xor";
export type LogicOp = BinaryLogic | "not";
export type LogicCondition =
  | { logic: BinaryLogic; a: Condition | null; b: Condition | null }
  | { logic: "not"; a: Condition | null };
/** Condição de Enquanto/Se: comparação, variável usada como booleano (≠ 0) ou operador lógico. */
export type Condition = Comparison | { ref: IoRef } | LogicCondition;

export const LOGIC_LABEL: Record<LogicOp, string> = {
  and: "e",
  or: "ou",
  xor: "ou exclusivo",
  not: "não",
};

export type SwitchCase = { id: string; match: FieldValue; children: ExperimentBlock[] };

/** Caminho da condição raiz; os operandos de um operador lógico são `cond.a`, `cond.a.b`… */
export const COND = "cond";
export const COND_LEFT = "cond.left";
export const COND_RIGHT = "cond.right";
export const BODY = "body";
export const ELSE = "else";

export function caseKey(caseId: string) {
  return `case:${caseId}`;
}

export type ExperimentBlock = {
  id: string;
  kind: BlockKind;
  fields: Record<string, FieldValue>;
  condition?: Condition | null;
  children?: ExperimentBlock[];
  elseChildren?: ExperimentBlock[];
  cases?: SwitchCase[];
};

export type PaletteItem = {
  kind: BlockKind;
  category: BlockCategory;
  label: string;
};

export const PALETTE: { title: string; category: BlockCategory; items: PaletteItem[] }[] = [
  {
    title: "Lógicos",
    category: "logic",
    items: [
      { kind: "while", category: "logic", label: "Enquanto" },
      { kind: "for", category: "logic", label: "Para" },
      { kind: "if", category: "logic", label: "Se" },
      { kind: "ifElse", category: "logic", label: "Se / senão" },
      { kind: "switch", category: "logic", label: "Escolha / caso" },
    ],
  },
  {
    title: "Ações da Bomba",
    category: "action",
    items: [
      { kind: "setFlow", category: "action", label: "Definir Vazão" },
      { kind: "invert", category: "action", label: "Inverter Rotação" },
      { kind: "pause", category: "action", label: "Pausar" },
    ],
  },
  {
    title: "Perfis",
    category: "profile",
    items: [
      { kind: "ramp", category: "profile", label: "Rampa de Vazão" },
      { kind: "sine", category: "profile", label: "Vazão Senoidal" },
      { kind: "step", category: "profile", label: "Vazão em Degrau" },
    ],
  },
  {
    title: "Condições",
    category: "compare",
    items: [
      { kind: "compare", category: "compare", label: "Comparação" },
      { kind: "and", category: "compare", label: "E" },
      { kind: "or", category: "compare", label: "OU" },
      { kind: "xor", category: "compare", label: "OU exclusivo" },
      { kind: "not", category: "compare", label: "NÃO" },
    ],
  },
  {
    title: "Variáveis/E/S",
    category: "io",
    items: [
      { kind: "varFlow", category: "io", label: "Vazão Atual" },
      { kind: "varTime", category: "io", label: "Tempo Decorrido" },
      { kind: "varVolume", category: "io", label: "Volume Total" },
      { kind: "varDir", category: "io", label: "Sentido" },
    ],
  },
];

export const CATEGORY_COLOR: Record<BlockCategory, string> = {
  logic: "#3879b5",
  action: "#4e9c51",
  profile: "#df811d",
  compare: "#7159a8",
  io: "#b9504d",
};

export const REPORTER_HINT: Record<IoRef, string> = {
  varFlow: "Vazão atual do programa, em mL/min",
  varTime: "Tempo desde o início do programa, em segundos",
  varVolume: "Volume bombeado desde o início do programa, em mL",
  varDir:
    "Sentido de rotação: 1 (verdadeiro) no direto, 0 (falso) no reverso. Em um campo numérico vale 1 ou 0; no espaço de condição de Enquanto/Se vale verdadeiro ou falso",
};

const KIND_META: Record<
  BlockKind,
  { category: BlockCategory; fields: Record<string, number> }
> = {
  while: { category: "logic", fields: {} },
  for: { category: "logic", fields: { times: 3 } },
  if: { category: "logic", fields: {} },
  ifElse: { category: "logic", fields: {} },
  switch: { category: "logic", fields: { value: 0 } },
  setFlow: { category: "action", fields: { flow: 20 } },
  invert: { category: "action", fields: {} },
  pause: { category: "action", fields: { seconds: 10 } },
  ramp: { category: "profile", fields: { from: 10, to: 50, duration: 30 } },
  sine: { category: "profile", fields: { center: 30, amplitude: 10, period: 20 } },
  step: { category: "profile", fields: { from: 0, to: 40, duration: 5 } },
  compare: { category: "compare", fields: {} },
  and: { category: "compare", fields: {} },
  or: { category: "compare", fields: {} },
  xor: { category: "compare", fields: {} },
  not: { category: "compare", fields: {} },
  varFlow: { category: "io", fields: {} },
  varTime: { category: "io", fields: {} },
  varVolume: { category: "io", fields: {} },
  varDir: { category: "io", fields: {} },
};

export function kindCategory(kind: BlockKind): BlockCategory {
  return KIND_META[kind].category;
}

export function isContainer(kind: BlockKind) {
  return (
    kind === "while" || kind === "for" || kind === "if" || kind === "ifElse" || kind === "switch"
  );
}

export function isReporter(kind: BlockKind): kind is IoRef {
  return kind === "varFlow" || kind === "varTime" || kind === "varVolume" || kind === "varDir";
}

/** Variáveis que também valem como condição sozinhas (verdadeiro/falso). */
export function isBooleanRef(ref: IoRef) {
  return ref === "varDir";
}

export function hasCondition(kind: BlockKind) {
  return kind === "while" || kind === "if";
}

export function isLogicKind(kind: BlockKind): kind is LogicOp {
  return kind === "and" || kind === "or" || kind === "xor" || kind === "not";
}

/** Blocos hexagonais que ocupam o espaço de condição. */
export function isConditionKind(kind: BlockKind) {
  return kind === "compare" || isLogicKind(kind);
}

export function isStatement(kind: BlockKind) {
  return !isReporter(kind) && !isConditionKind(kind);
}

export function isComparison(condition: Condition): condition is Comparison {
  return "op" in condition;
}

export function isLogic(condition: Condition): condition is LogicCondition {
  return "logic" in condition;
}

export function newLogic(logic: LogicOp, a: Condition | null = null): LogicCondition {
  return logic === "not" ? { logic, a } : { logic, a, b: null };
}

export function condChild(path: string, side: "a" | "b") {
  return `${path}.${side}`;
}

/** Diz se `path` é o próprio `ancestor` ou está dentro dele. */
export function isPathWithin(path: string, ancestor: string) {
  return path === ancestor || path.startsWith(`${ancestor}.`);
}

function pathSegments(path: string): ("a" | "b")[] | null {
  const [root, ...rest] = path.split(".");
  if (root !== COND || !rest.every((seg) => seg === "a" || seg === "b")) {
    return null;
  }
  return rest as ("a" | "b")[];
}

export function conditionAt(
  condition: Condition | null | undefined,
  path: string,
): Condition | null {
  const segments = pathSegments(path);
  let current = condition ?? null;
  for (const seg of segments ?? []) {
    if (!current || !isLogic(current)) {
      return null;
    }
    current = seg === "a" ? current.a : current.logic === "not" ? null : current.b;
  }
  return segments ? current : null;
}

function replaceAt(
  condition: Condition | null,
  segments: ("a" | "b")[],
  next: Condition | null,
): Condition | null | undefined {
  if (segments.length === 0) {
    return next;
  }
  if (!condition || !isLogic(condition)) {
    return undefined;
  }
  const [seg, ...rest] = segments;
  if (seg === "b" && condition.logic === "not") {
    return undefined;
  }
  const child = seg === "a" ? condition.a : (condition as { b: Condition | null }).b;
  const replaced = replaceAt(child, rest, next);
  return replaced === undefined ? undefined : { ...condition, [seg]: replaced };
}

/** Chave de um campo numérico dentro de uma comparação: `<caminho>.left` ou `<caminho>.right`. */
function valueSlotPath(key: string): { path: string; side: "left" | "right" } | null {
  const match = /^(cond(?:\.[ab])*)\.(left|right)$/.exec(key);
  return match ? { path: match[1], side: match[2] as "left" | "right" } : null;
}

export function emptyCondition(): Comparison {
  return { left: 0, op: ">", right: 0 };
}

function defaultCondition(kind: BlockKind): Comparison | undefined {
  if (kind === "while") {
    return { left: { ref: "varFlow" }, op: ">", right: 0 };
  }
  if (kind === "if" || kind === "ifElse") {
    return { left: { ref: "varFlow" }, op: ">=", right: 10 };
  }
  return undefined;
}

export function newCase(match: FieldValue = 0): SwitchCase {
  return { id: newId(), match, children: [] };
}

export function createBlock(kind: BlockKind): ExperimentBlock {
  if (kind === "ifElse") {
    return { ...createBlock("if"), elseChildren: [] };
  }
  const meta = KIND_META[kind];
  const block: ExperimentBlock = {
    id: newId(),
    kind,
    fields: { ...meta.fields },
  };
  if (kind === "switch") {
    block.fields.value = { ref: "varDir" };
    block.cases = [newCase(1), newCase(0)];
    block.elseChildren = [];
    return block;
  }
  if (isContainer(kind)) {
    block.children = [];
  }
  if (hasCondition(kind)) {
    block.condition = defaultCondition(kind);
  }
  return block;
}

export function slotValue(block: ExperimentBlock, key: string): FieldValue | undefined {
  const slot = valueSlotPath(key);
  if (slot) {
    const condition = conditionAt(block.condition, slot.path);
    return condition && isComparison(condition) ? condition[slot.side] : undefined;
  }
  if (key.startsWith("case:")) {
    return block.cases?.find((item) => caseKey(item.id) === key)?.match;
  }
  return block.fields[key];
}

/** Valor numérico que o campo volta a ter quando a variável é retirada dele. */
export function defaultSlotValue(block: ExperimentBlock, key: string): number {
  return KIND_META[block.kind].fields[key] ?? 0;
}

/** Braços de um bloco-contêiner, na ordem em que aparecem. */
export function branchesOf(block: ExperimentBlock): { key: string; blocks: ExperimentBlock[] }[] {
  const list: { key: string; blocks: ExperimentBlock[] }[] = [];
  if (block.kind === "switch") {
    for (const item of block.cases ?? []) {
      list.push({ key: caseKey(item.id), blocks: item.children });
    }
    list.push({ key: ELSE, blocks: block.elseChildren ?? [] });
    return list;
  }
  if (block.children) {
    list.push({ key: BODY, blocks: block.children });
  }
  if (block.elseChildren) {
    list.push({ key: ELSE, blocks: block.elseChildren });
  }
  return list;
}

export function withBranch(
  block: ExperimentBlock,
  key: string,
  blocks: ExperimentBlock[],
): ExperimentBlock {
  if (key === BODY) {
    return { ...block, children: blocks };
  }
  if (key === ELSE) {
    return { ...block, elseChildren: blocks };
  }
  return {
    ...block,
    cases: block.cases?.map((item) => (caseKey(item.id) === key ? { ...item, children: blocks } : item)),
  };
}

function mapBranches(
  block: ExperimentBlock,
  map: (blocks: ExperimentBlock[]) => ExperimentBlock[],
): ExperimentBlock {
  let next = block;
  for (const branch of branchesOf(block)) {
    const mapped = map(branch.blocks);
    if (mapped !== branch.blocks) {
      next = withBranch(next, branch.key, mapped);
    }
  }
  return next;
}

export function createDefaultProgram(): ExperimentBlock[] {
  const loop = createBlock("for");
  loop.fields.times = 3;
  loop.children = [createBlock("ramp"), createBlock("pause")];
  return [loop];
}

export function cloneBlock(block: ExperimentBlock): ExperimentBlock {
  return {
    id: newId(),
    kind: block.kind,
    fields: { ...block.fields },
    condition: block.condition ? { ...block.condition } : block.condition,
    children: block.children?.map(cloneBlock),
    elseChildren: block.elseChildren?.map(cloneBlock),
    cases: block.cases?.map((item) => ({
      id: newId(),
      match: item.match,
      children: item.children.map(cloneBlock),
    })),
  };
}

export function findBlock(blocks: ExperimentBlock[], id: string): ExperimentBlock | null {
  for (const block of blocks) {
    if (block.id === id) {
      return block;
    }
    for (const branch of branchesOf(block)) {
      const nested = findBlock(branch.blocks, id);
      if (nested) {
        return nested;
      }
    }
  }
  return null;
}

export type BlockLocation = { parentId: string | null; branch: string; index: number };

export function locateBlock(
  blocks: ExperimentBlock[],
  id: string,
  parentId: string | null = null,
  branch = BODY,
): BlockLocation | null {
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (block.id === id) {
      return { parentId, branch, index };
    }
    for (const item of branchesOf(block)) {
      const nested = locateBlock(item.blocks, id, block.id, item.key);
      if (nested) {
        return nested;
      }
    }
  }
  return null;
}

export function containsId(block: ExperimentBlock, id: string): boolean {
  if (block.id === id) {
    return true;
  }
  return branchesOf(block).some((branch) => branch.blocks.some((child) => containsId(child, id)));
}

export function removeBlock(
  blocks: ExperimentBlock[],
  id: string,
): { next: ExperimentBlock[]; removed: ExperimentBlock | null } {
  let removed: ExperimentBlock | null = null;
  const prune = (list: ExperimentBlock[]): ExperimentBlock[] => {
    let changed = false;
    const next: ExperimentBlock[] = [];
    for (const block of list) {
      if (block.id === id) {
        removed = block;
        changed = true;
        continue;
      }
      const mapped = mapBranches(block, prune);
      changed ||= mapped !== block;
      next.push(mapped);
    }
    return changed ? next : list;
  };
  return { next: prune(blocks), removed };
}

export function insertBlock(
  blocks: ExperimentBlock[],
  parentId: string | null,
  branch: string,
  index: number,
  incoming: ExperimentBlock,
): ExperimentBlock[] {
  const splice = (list: ExperimentBlock[]) => {
    const copy = list.slice();
    copy.splice(Math.max(0, Math.min(index, copy.length)), 0, incoming);
    return copy;
  };
  if (parentId === null) {
    return splice(blocks);
  }
  const visit = (list: ExperimentBlock[]): ExperimentBlock[] =>
    list.map((block) => {
      if (block.id === parentId && isContainer(block.kind)) {
        const target = branchesOf(block).find((item) => item.key === branch);
        return target ? withBranch(block, branch, splice(target.blocks)) : block;
      }
      return mapBranches(block, visit);
    });
  return visit(blocks);
}

export function moveBlock(
  blocks: ExperimentBlock[],
  id: string,
  parentId: string | null,
  branch: string,
  index: number,
): ExperimentBlock[] {
  const origin = locateBlock(blocks, id);
  const pulled = removeBlock(blocks, id);
  if (!pulled.removed) {
    return blocks;
  }
  if (parentId && containsId(pulled.removed, parentId)) {
    return blocks;
  }
  const sameList =
    origin && origin.parentId === parentId && (parentId === null || origin.branch === branch);
  const at = sameList && origin.index < index ? index - 1 : index;
  return insertBlock(pulled.next, parentId, branch, at, pulled.removed);
}

export function updateBlock(
  blocks: ExperimentBlock[],
  id: string,
  update: (block: ExperimentBlock) => ExperimentBlock,
): ExperimentBlock[] {
  const visit = (list: ExperimentBlock[]): ExperimentBlock[] => {
    let changed = false;
    const next = list.map((block) => {
      const mapped = block.id === id ? update(block) : mapBranches(block, visit);
      changed ||= mapped !== block;
      return mapped;
    });
    return changed ? next : list;
  };
  return visit(blocks);
}

export function setField(
  blocks: ExperimentBlock[],
  id: string,
  key: string,
  value: FieldValue,
): ExperimentBlock[] {
  return updateBlock(blocks, id, (block) => {
    const slot = valueSlotPath(key);
    if (slot) {
      const condition = conditionAt(block.condition, slot.path);
      if (!condition || !isComparison(condition)) {
        return block;
      }
      return withCondition(block, slot.path, { ...condition, [slot.side]: value });
    }
    if (key.startsWith("case:")) {
      return {
        ...block,
        cases: block.cases?.map((item) =>
          caseKey(item.id) === key ? { ...item, match: value } : item,
        ),
      };
    }
    return { ...block, fields: { ...block.fields, [key]: value } };
  });
}

export function clearSlot(blocks: ExperimentBlock[], id: string, key: string) {
  const block = findBlock(blocks, id);
  return block ? setField(blocks, id, key, defaultSlotValue(block, key)) : blocks;
}

function withCondition(
  block: ExperimentBlock,
  path: string,
  next: Condition | null,
): ExperimentBlock {
  const segments = pathSegments(path);
  if (!segments || !hasCondition(block.kind)) {
    return block;
  }
  const replaced = replaceAt(block.condition ?? null, segments, next);
  return replaced === undefined ? block : { ...block, condition: replaced };
}

export function setCondition(
  blocks: ExperimentBlock[],
  id: string,
  condition: Condition | null,
  path = COND,
): ExperimentBlock[] {
  return updateBlock(blocks, id, (block) => withCondition(block, path, condition));
}

export function setCompareOp(
  blocks: ExperimentBlock[],
  id: string,
  op: CompareOp,
  path = COND,
): ExperimentBlock[] {
  return updateBlock(blocks, id, (block) => {
    const condition = conditionAt(block.condition, path);
    return condition && isComparison(condition)
      ? withCondition(block, path, { ...condition, op })
      : block;
  });
}

export function toggleElse(blocks: ExperimentBlock[], id: string): ExperimentBlock[] {
  return updateBlock(blocks, id, (block) => {
    if (block.kind !== "if") {
      return block;
    }
    if (block.elseChildren) {
      const { elseChildren: _removed, ...rest } = block;
      return rest;
    }
    return { ...block, elseChildren: [] };
  });
}

export function addCase(blocks: ExperimentBlock[], id: string): ExperimentBlock[] {
  return updateBlock(blocks, id, (block) => {
    const cases = block.cases ?? [];
    const numbers = cases
      .map((item) => item.match)
      .filter((match): match is number => typeof match === "number");
    const next = numbers.length > 0 ? Math.max(...numbers) + 1 : 0;
    return { ...block, cases: [...cases, newCase(next)] };
  });
}

export function removeCase(blocks: ExperimentBlock[], id: string, caseId: string): ExperimentBlock[] {
  return updateBlock(blocks, id, (block) => ({
    ...block,
    cases: block.cases?.filter((item) => item.id !== caseId),
  }));
}

function isIoRef(value: unknown): value is IoRef {
  return value === "varFlow" || value === "varTime" || value === "varVolume" || value === "varDir";
}

function sanitizeValue(value: unknown, fallback: number): FieldValue {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (value && typeof value === "object" && "ref" in value && isIoRef(value.ref)) {
    return { ref: value.ref };
  }
  return fallback;
}

function isCompareOp(value: unknown): value is CompareOp {
  return COMPARE_OPS.some((item) => item.op === value);
}

const LOGIC_OPS = Object.keys(LOGIC_LABEL) as LogicOp[];
const MAX_CONDITION_DEPTH = 8;

function sanitizeConditionNode(value: unknown, depth: number): Condition | null {
  if (!value || typeof value !== "object" || depth > MAX_CONDITION_DEPTH) {
    return null;
  }
  const cond = value as Record<string, unknown>;
  if ("logic" in cond) {
    const logic = LOGIC_OPS.find((item) => item === cond.logic);
    if (!logic) {
      return null;
    }
    const a = sanitizeConditionNode(cond.a, depth + 1);
    return logic === "not"
      ? { logic, a }
      : { logic, a, b: sanitizeConditionNode(cond.b, depth + 1) };
  }
  if (!("op" in cond) && isIoRef(cond.ref)) {
    return { ref: cond.ref };
  }
  return {
    left: sanitizeValue(cond.left, 0),
    op: isCompareOp(cond.op) ? cond.op : ">",
    right: sanitizeValue(cond.right, 0),
  };
}

function sanitizeCondition(raw: Partial<ExperimentBlock>, kind: BlockKind): Condition | null {
  if (raw.condition === null) {
    return null;
  }
  if (raw.condition && typeof raw.condition === "object") {
    return sanitizeConditionNode(raw.condition, 0);
  }
  const fallback = defaultCondition(kind) ?? emptyCondition();
  const legacy = (raw.fields as Record<string, unknown> | undefined)?.threshold;
  return legacy === undefined
    ? fallback
    : { ...fallback, right: sanitizeValue(legacy, fallback.right as number) };
}

function sanitizeList(value: unknown): ExperimentBlock[] {
  return Array.isArray(value)
    ? value.map(sanitizeBlock).filter((item): item is ExperimentBlock => Boolean(item))
    : [];
}

function sanitizeBlock(value: unknown): ExperimentBlock | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Partial<ExperimentBlock>;
  const known = raw.kind && raw.kind in KIND_META && raw.kind !== "ifElse";
  if (!known || !isStatement(raw.kind as BlockKind)) {
    return null;
  }
  const kind = raw.kind as BlockKind;
  const defaults = KIND_META[kind].fields;
  const fields: Record<string, FieldValue> = {};
  for (const [key, fallback] of Object.entries(defaults)) {
    fields[key] = sanitizeValue(raw.fields?.[key], fallback);
  }
  const block: ExperimentBlock = {
    id: typeof raw.id === "string" && raw.id ? raw.id : newId(),
    kind,
    fields,
  };
  if (hasCondition(kind)) {
    block.condition = sanitizeCondition(raw, kind);
  }
  if (kind === "switch") {
    const seen = new Set<string>();
    block.cases = (Array.isArray(raw.cases) ? raw.cases : []).flatMap((item) => {
      if (!item || typeof item !== "object") {
        return [];
      }
      const id = typeof item.id === "string" && item.id && !seen.has(item.id) ? item.id : newId();
      seen.add(id);
      return [{ id, match: sanitizeValue(item.match, 0), children: sanitizeList(item.children) }];
    });
    block.elseChildren = sanitizeList(raw.elseChildren);
  } else if (isContainer(kind)) {
    block.children = sanitizeList(raw.children);
    if (kind === "if" && Array.isArray(raw.elseChildren)) {
      block.elseChildren = sanitizeList(raw.elseChildren);
    }
  }
  return block;
}

export function sanitizeProgram(value: unknown): ExperimentBlock[] {
  if (!Array.isArray(value)) {
    return createDefaultProgram();
  }
  return sanitizeList(value);
}

export function reporterLabel(kind: IoRef) {
  if (kind === "varFlow") {
    return "Vazão Atual";
  }
  if (kind === "varTime") {
    return "Tempo Decorrido";
  }
  if (kind === "varDir") {
    return "Sentido";
  }
  return "Volume Total";
}
