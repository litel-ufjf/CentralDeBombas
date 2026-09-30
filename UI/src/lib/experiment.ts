import { newId } from "./calibration";

export type BlockCategory = "logic" | "action" | "profile" | "compare" | "io";

export type BlockKind =
  | "while"
  | "for"
  | "if"
  | "setFlow"
  | "invert"
  | "pause"
  | "ramp"
  | "sine"
  | "step"
  | "compare"
  | "varFlow"
  | "varTime"
  | "varVolume";

export type IoRef = "varFlow" | "varTime" | "varVolume";
export type FieldValue = number | { ref: IoRef };

export type CompareOp = ">" | ">=" | "<" | "<=";

export const COMPARE_OPS: { op: CompareOp; label: string }[] = [
  { op: ">", label: ">" },
  { op: ">=", label: "≥" },
  { op: "<", label: "<" },
  { op: "<=", label: "≤" },
];

export type Condition = { left: FieldValue; op: CompareOp; right: FieldValue };

export const COND_LEFT = "cond.left";
export const COND_RIGHT = "cond.right";

export type ExperimentBlock = {
  id: string;
  kind: BlockKind;
  fields: Record<string, FieldValue>;
  condition?: Condition | null;
  children?: ExperimentBlock[];
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
    items: [{ kind: "compare", category: "compare", label: "Comparação" }],
  },
  {
    title: "Variáveis/E/S",
    category: "io",
    items: [
      { kind: "varFlow", category: "io", label: "Vazão Atual" },
      { kind: "varTime", category: "io", label: "Tempo Decorrido" },
      { kind: "varVolume", category: "io", label: "Volume Total" },
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
};

const KIND_META: Record<
  BlockKind,
  { category: BlockCategory; fields: Record<string, number> }
> = {
  while: { category: "logic", fields: {} },
  for: { category: "logic", fields: { times: 3 } },
  if: { category: "logic", fields: {} },
  setFlow: { category: "action", fields: { flow: 20 } },
  invert: { category: "action", fields: {} },
  pause: { category: "action", fields: { seconds: 10 } },
  ramp: { category: "profile", fields: { from: 10, to: 50, duration: 30 } },
  sine: { category: "profile", fields: { center: 30, amplitude: 10, period: 20 } },
  step: { category: "profile", fields: { from: 0, to: 40, duration: 5 } },
  compare: { category: "compare", fields: {} },
  varFlow: { category: "io", fields: {} },
  varTime: { category: "io", fields: {} },
  varVolume: { category: "io", fields: {} },
};


export function kindCategory(kind: BlockKind): BlockCategory {
  return KIND_META[kind].category;
}

export function isContainer(kind: BlockKind) {
  return kind === "while" || kind === "for" || kind === "if";
}

export function isReporter(kind: BlockKind): kind is IoRef {
  return kind === "varFlow" || kind === "varTime" || kind === "varVolume";
}

export function hasCondition(kind: BlockKind) {
  return kind === "while" || kind === "if";
}

export function isStatement(kind: BlockKind) {
  return !isReporter(kind) && kind !== "compare";
}

export function emptyCondition(): Condition {
  return { left: 0, op: ">", right: 0 };
}

function defaultCondition(kind: BlockKind): Condition | undefined {
  if (kind === "while") {
    return { left: { ref: "varFlow" }, op: ">", right: 0 };
  }
  if (kind === "if") {
    return { left: { ref: "varFlow" }, op: ">=", right: 10 };
  }
  return undefined;
}

export function createBlock(kind: BlockKind): ExperimentBlock {
  const meta = KIND_META[kind];
  const block: ExperimentBlock = {
    id: newId(),
    kind,
    fields: { ...meta.fields },
    children: isContainer(kind) ? [] : undefined,
  };
  if (hasCondition(kind)) {
    block.condition = defaultCondition(kind);
  }
  return block;
}

export function slotValue(block: ExperimentBlock, key: string): FieldValue | undefined {
  if (key === COND_LEFT) {
    return block.condition?.left;
  }
  if (key === COND_RIGHT) {
    return block.condition?.right;
  }
  return block.fields[key];
}

/** Valor numérico que o campo volta a ter quando a variável é retirada dele. */
export function defaultSlotValue(block: ExperimentBlock, key: string): number {
  return KIND_META[block.kind].fields[key] ?? 0;
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
  };
}

export function findBlock(
  blocks: ExperimentBlock[],
  id: string,
): ExperimentBlock | null {
  for (const block of blocks) {
    if (block.id === id) {
      return block;
    }
    if (block.children) {
      const nested = findBlock(block.children, id);
      if (nested) {
        return nested;
      }
    }
  }
  return null;
}

export function locateBlock(
  blocks: ExperimentBlock[],
  id: string,
  parentId: string | null = null,
): { parentId: string | null; index: number } | null {
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (block.id === id) {
      return { parentId, index };
    }
    if (block.children) {
      const nested = locateBlock(block.children, id, block.id);
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
  return Boolean(block.children?.some((child) => containsId(child, id)));
}

export function removeBlock(
  blocks: ExperimentBlock[],
  id: string,
): { next: ExperimentBlock[]; removed: ExperimentBlock | null } {
  const next: ExperimentBlock[] = [];
  let removed: ExperimentBlock | null = null;
  for (const block of blocks) {
    if (block.id === id) {
      removed = block;
      continue;
    }
    if (block.children) {
      const nested = removeBlock(block.children, id);
      if (nested.removed) {
        removed = nested.removed;
        next.push({ ...block, children: nested.next });
        continue;
      }
    }
    next.push(block);
  }
  return { next, removed };
}

export function insertBlock(
  blocks: ExperimentBlock[],
  parentId: string | null,
  index: number,
  incoming: ExperimentBlock,
): ExperimentBlock[] {
  if (parentId === null) {
    const copy = blocks.slice();
    const at = Math.max(0, Math.min(index, copy.length));
    copy.splice(at, 0, incoming);
    return copy;
  }
  return blocks.map((block) => {
    if (block.id === parentId && isContainer(block.kind)) {
      const children = (block.children ?? []).slice();
      const at = Math.max(0, Math.min(index, children.length));
      children.splice(at, 0, incoming);
      return { ...block, children };
    }
    if (block.children) {
      return {
        ...block,
        children: insertBlock(block.children, parentId, index, incoming),
      };
    }
    return block;
  });
}

export function moveBlock(
  blocks: ExperimentBlock[],
  id: string,
  parentId: string | null,
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
  const at =
    origin && origin.parentId === parentId && origin.index < index ? index - 1 : index;
  return insertBlock(pulled.next, parentId, at, pulled.removed);
}

export function updateBlock(
  blocks: ExperimentBlock[],
  id: string,
  update: (block: ExperimentBlock) => ExperimentBlock,
): ExperimentBlock[] {
  return blocks.map((block) => {
    if (block.id === id) {
      return update(block);
    }
    if (block.children) {
      return { ...block, children: updateBlock(block.children, id, update) };
    }
    return block;
  });
}

export function setField(
  blocks: ExperimentBlock[],
  id: string,
  key: string,
  value: FieldValue,
): ExperimentBlock[] {
  return updateBlock(blocks, id, (block) => {
    if (key === COND_LEFT || key === COND_RIGHT) {
      if (!block.condition) {
        return block;
      }
      const side = key === COND_LEFT ? "left" : "right";
      return { ...block, condition: { ...block.condition, [side]: value } };
    }
    return { ...block, fields: { ...block.fields, [key]: value } };
  });
}

export function clearSlot(blocks: ExperimentBlock[], id: string, key: string) {
  const block = findBlock(blocks, id);
  return block ? setField(blocks, id, key, defaultSlotValue(block, key)) : blocks;
}

export function setCondition(
  blocks: ExperimentBlock[],
  id: string,
  condition: Condition | null,
): ExperimentBlock[] {
  return updateBlock(blocks, id, (block) =>
    hasCondition(block.kind) ? { ...block, condition } : block,
  );
}

export function setCompareOp(
  blocks: ExperimentBlock[],
  id: string,
  op: CompareOp,
): ExperimentBlock[] {
  return updateBlock(blocks, id, (block) =>
    block.condition ? { ...block, condition: { ...block.condition, op } } : block,
  );
}

function sanitizeValue(value: unknown, fallback: number): FieldValue {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (
    value &&
    typeof value === "object" &&
    "ref" in value &&
    (value.ref === "varFlow" ||
      value.ref === "varTime" ||
      value.ref === "varVolume")
  ) {
    return { ref: value.ref };
  }
  return fallback;
}

function isCompareOp(value: unknown): value is CompareOp {
  return value === ">" || value === ">=" || value === "<" || value === "<=";
}

function sanitizeCondition(raw: Partial<ExperimentBlock>, kind: BlockKind): Condition | null {
  if (raw.condition === null) {
    return null;
  }
  const cond = raw.condition as Partial<Condition> | undefined;
  if (cond && typeof cond === "object") {
    return {
      left: sanitizeValue(cond.left, 0),
      op: isCompareOp(cond.op) ? cond.op : ">",
      right: sanitizeValue(cond.right, 0),
    };
  }
  const fallback = defaultCondition(kind) ?? emptyCondition();
  const legacy = (raw.fields as Record<string, unknown> | undefined)?.threshold;
  return legacy === undefined
    ? fallback
    : { ...fallback, right: sanitizeValue(legacy, fallback.right as number) };
}

function sanitizeBlock(value: unknown): ExperimentBlock | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Partial<ExperimentBlock>;
  if (!raw.kind || !(raw.kind in KIND_META) || !isStatement(raw.kind as BlockKind)) {
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
  if (isContainer(kind)) {
    const children = Array.isArray(raw.children)
      ? raw.children
          .map(sanitizeBlock)
          .filter((item): item is ExperimentBlock => Boolean(item))
      : [];
    block.children = children;
  }
  return block;
}

export function sanitizeProgram(value: unknown): ExperimentBlock[] {
  if (!Array.isArray(value)) {
    return createDefaultProgram();
  }
  const blocks = value
    .map(sanitizeBlock)
    .filter((item): item is ExperimentBlock => Boolean(item));
  return blocks;
}

export function reporterLabel(kind: IoRef) {
  if (kind === "varFlow") {
    return "Vazão Atual";
  }
  if (kind === "varTime") {
    return "Tempo Decorrido";
  }
  return "Volume Total";
}
