import { newId } from "./calibration";

export type BlockCategory = "logic" | "action" | "profile" | "io";

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
  | "varFlow"
  | "varTime"
  | "varVolume";

export type IoRef = "varFlow" | "varTime" | "varVolume";
export type FieldValue = number | { ref: IoRef };

export type ExperimentBlock = {
  id: string;
  kind: BlockKind;
  fields: Record<string, FieldValue>;
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
    title: "Variáveis E/S",
    category: "io",
    items: [
      { kind: "varFlow", category: "io", label: "Vazão Atual" },
      { kind: "varTime", category: "io", label: "Tempo Decorrido" },
      { kind: "varVolume", category: "io", label: "Volume Total" },
    ],
  },
];

export const CATEGORY_COLOR: Record<BlockCategory, string> = {
  logic: "#3d8c4a",
  action: "#2f9e44",
  profile: "#3cb25a",
  io: "#dc2626",
};

export const PALETTE_INK: Record<BlockCategory, string> = {
  logic: "#2563eb",
  action: "#16a34a",
  profile: "#d97706",
  io: "#dc2626",
};

const KIND_META: Record<
  BlockKind,
  { category: BlockCategory; fields: Record<string, number> }
> = {
  while: { category: "logic", fields: { threshold: 0 } },
  for: { category: "logic", fields: { times: 3 } },
  if: { category: "logic", fields: { threshold: 10 } },
  setFlow: { category: "action", fields: { flow: 20 } },
  invert: { category: "action", fields: {} },
  pause: { category: "action", fields: { seconds: 10 } },
  ramp: { category: "profile", fields: { from: 10, to: 50, duration: 30 } },
  sine: { category: "profile", fields: { center: 30, amplitude: 10, period: 20 } },
  step: { category: "profile", fields: { from: 0, to: 40, duration: 5 } },
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

export function isReporter(kind: BlockKind) {
  return kind === "varFlow" || kind === "varTime" || kind === "varVolume";
}

export function createBlock(kind: BlockKind): ExperimentBlock {
  const meta = KIND_META[kind];
  return {
    id: newId(),
    kind,
    fields: { ...meta.fields },
    children: isContainer(kind) ? [] : undefined,
  };
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
  const pulled = removeBlock(blocks, id);
  if (!pulled.removed) {
    return blocks;
  }
  if (parentId && containsId(pulled.removed, parentId)) {
    return blocks;
  }
  return insertBlock(pulled.next, parentId, index, pulled.removed);
}

export function setField(
  blocks: ExperimentBlock[],
  id: string,
  key: string,
  value: FieldValue,
): ExperimentBlock[] {
  return blocks.map((block) => {
    if (block.id === id) {
      return { ...block, fields: { ...block.fields, [key]: value } };
    }
    if (block.children) {
      return { ...block, children: setField(block.children, id, key, value) };
    }
    return block;
  });
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

function sanitizeBlock(value: unknown): ExperimentBlock | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Partial<ExperimentBlock>;
  if (!raw.kind || !(raw.kind in KIND_META)) {
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
