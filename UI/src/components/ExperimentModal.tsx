import { useEffect, useMemo, useRef, useState } from "react";
import copasa from "../assets/copasa.png";
import logo from "../assets/logo.png";
import {
  CATEGORY_COLOR,
  PALETTE,
  PALETTE_INK,
  containsId,
  createBlock,
  findBlock,
  insertBlock,
  isContainer,
  isReporter,
  kindCategory,
  moveBlock,
  removeBlock,
  reporterLabel,
  setField,
  type BlockKind,
  type ExperimentBlock,
  type FieldValue,
  type IoRef,
} from "../lib/experiment";
import { loadProgram, saveProgram } from "../lib/storage";

type DropTarget = { parentId: string | null; index: number };
type DragPayload =
  | { from: "palette"; kind: BlockKind }
  | { from: "canvas"; id: string };

function asNumber(value: FieldValue | undefined, fallback: number) {
  return typeof value === "number" ? value : fallback;
}

function FieldChip({
  blockId,
  fieldKey,
  value,
  suffix,
  onChange,
  onDropReporter,
}: {
  blockId: string;
  fieldKey: string;
  value: FieldValue | undefined;
  suffix?: string;
  onChange: (next: FieldValue) => void;
  onDropReporter: (ref: IoRef) => void;
}) {
  if (value && typeof value === "object" && "ref" in value) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[12px] font-medium text-red-600 ring-1 ring-red-200">
        {reporterLabel(value.ref)}
        <button
          type="button"
          aria-label="Remover variável"
          className="text-[11px] text-red-400"
          onClick={() => onChange(0)}
        >
          ×
        </button>
      </span>
    );
  }

  return (
    <span
      data-field-target={`${blockId}:${fieldKey}`}
      className="inline-flex items-center gap-1"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("application/x-bomba-io")) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onDrop={(event) => {
        const ref = event.dataTransfer.getData("application/x-bomba-io") as IoRef;
        if (ref === "varFlow" || ref === "varTime" || ref === "varVolume") {
          event.preventDefault();
          event.stopPropagation();
          onDropReporter(ref);
        }
      }}
    >
      <input
        type="number"
        value={asNumber(value, 0)}
        onPointerDown={(event) => event.stopPropagation()}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-12 rounded-md border-0 bg-white px-1 py-0.5 text-center font-mono text-[13px] text-slate-700 outline-none shadow-sm"
      />
      {suffix ? <span className="text-[12px] font-medium text-white/95">{suffix}</span> : null}
    </span>
  );
}

function MiniChart({ kind, from, to }: { kind: "ramp" | "sine" | "step"; from: number; to: number }) {
  const points = useMemo(() => {
    const n = 28;
    return Array.from({ length: n }, (_, i) => {
      const t = i / (n - 1);
      let y = 0.5;
      if (kind === "ramp") {
        y = t;
      } else if (kind === "sine") {
        y = 0.5 + 0.42 * Math.sin(t * Math.PI * 2);
      } else {
        y = t < 0.45 ? 0.18 : 0.82;
      }
      return `${4 + t * 56},${22 - y * 16}`;
    }).join(" ");
  }, [kind]);

  return (
    <svg viewBox="0 0 64 24" className="h-8 w-16 shrink-0" aria-hidden>
      <polyline
        fill="none"
        stroke="rgba(255,255,255,0.92)"
        strokeWidth="2.2"
        strokeLinejoin="round"
        points={points}
      />
      <text x="4" y="22" fill="rgba(255,255,255,0.7)" fontSize="6">
        {from}
      </text>
      <text x="50" y="8" fill="rgba(255,255,255,0.7)" fontSize="6">
        {to}
      </text>
    </svg>
  );
}

function DropSlot({
  target,
  active,
  onDragOver,
}: {
  target: DropTarget;
  active: boolean;
  onDragOver: (target: DropTarget) => void;
}) {
  return (
    <div
      data-drop-parent={target.parentId ?? ""}
      data-drop-index={target.index}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onDragOver(target);
      }}
      className={`mx-1 rounded-full transition-all ${
        active ? "my-1 h-2 bg-sky-400/80" : "h-2 bg-transparent"
      }`}
    />
  );
}

function BlockCard({
  block,
  parentId,
  index,
  hover,
  onDragOver,
  onField,
  onDragStart,
}: {
  block: ExperimentBlock;
  parentId: string | null;
  index: number;
  hover: DropTarget | null;
  onDragOver: (target: DropTarget) => void;
  onField: (id: string, key: string, value: FieldValue) => void;
  onDragStart: (event: React.DragEvent, payload: DragPayload) => void;
}) {
  const color = CATEGORY_COLOR[kindCategory(block.kind)];
  const reporter = isReporter(block.kind);
  const isHoverInside =
    hover?.parentId === block.id && isContainer(block.kind);

  const body = (() => {
    switch (block.kind) {
      case "for":
        return (
          <>
            Para iterando{" "}
            <FieldChip
              blockId={block.id}
              fieldKey="times"
              value={block.fields.times}
              suffix="vezes"
              onChange={(value) => onField(block.id, "times", value)}
              onDropReporter={(ref) => onField(block.id, "times", { ref })}
            />
          </>
        );
      case "while":
        return (
          <>
            Enquanto vazão &gt;{" "}
            <FieldChip
              blockId={block.id}
              fieldKey="threshold"
              value={block.fields.threshold}
              suffix="mL/min"
              onChange={(value) => onField(block.id, "threshold", value)}
              onDropReporter={(ref) => onField(block.id, "threshold", { ref })}
            />
          </>
        );
      case "if":
        return (
          <>
            Se vazão ≥{" "}
            <FieldChip
              blockId={block.id}
              fieldKey="threshold"
              value={block.fields.threshold}
              suffix="mL/min"
              onChange={(value) => onField(block.id, "threshold", value)}
              onDropReporter={(ref) => onField(block.id, "threshold", { ref })}
            />
          </>
        );
      case "setFlow":
        return (
          <>
            Definir vazão{" "}
            <FieldChip
              blockId={block.id}
              fieldKey="flow"
              value={block.fields.flow}
              suffix="mL/min"
              onChange={(value) => onField(block.id, "flow", value)}
              onDropReporter={(ref) => onField(block.id, "flow", { ref })}
            />
          </>
        );
      case "invert":
        return <>Inverter rotação</>;
      case "pause":
        return (
          <>
            Pausar for{" "}
            <FieldChip
              blockId={block.id}
              fieldKey="seconds"
              value={block.fields.seconds}
              suffix="s"
              onChange={(value) => onField(block.id, "seconds", value)}
              onDropReporter={(ref) => onField(block.id, "seconds", { ref })}
            />
          </>
        );
      case "ramp":
        return (
          <span className="flex w-full items-center justify-between gap-3">
            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              Rampa de Vazão
              <FieldChip
                blockId={block.id}
                fieldKey="from"
                value={block.fields.from}
                onChange={(value) => onField(block.id, "from", value)}
                onDropReporter={(ref) => onField(block.id, "from", { ref })}
              />
              a
              <FieldChip
                blockId={block.id}
                fieldKey="to"
                value={block.fields.to}
                suffix="mL/min"
                onChange={(value) => onField(block.id, "to", value)}
                onDropReporter={(ref) => onField(block.id, "to", { ref })}
              />
            </span>
            <MiniChart
              kind="ramp"
              from={asNumber(block.fields.from, 10)}
              to={asNumber(block.fields.to, 50)}
            />
          </span>
        );
      case "sine":
        return (
          <span className="flex w-full items-center justify-between gap-3">
            <span className="flex flex-wrap items-center gap-1">
              Senoidal{" "}
              <FieldChip
                blockId={block.id}
                fieldKey="center"
                value={block.fields.center}
                onChange={(value) => onField(block.id, "center", value)}
                onDropReporter={(ref) => onField(block.id, "center", { ref })}
              />
              ±
              <FieldChip
                blockId={block.id}
                fieldKey="amplitude"
                value={block.fields.amplitude}
                suffix="mL/min"
                onChange={(value) => onField(block.id, "amplitude", value)}
                onDropReporter={(ref) => onField(block.id, "amplitude", { ref })}
              />
            </span>
            <MiniChart kind="sine" from={0} to={asNumber(block.fields.center, 30)} />
          </span>
        );
      case "step":
        return (
          <span className="flex w-full items-center justify-between gap-3">
            <span className="flex flex-wrap items-center gap-1">
              Degrau{" "}
              <FieldChip
                blockId={block.id}
                fieldKey="from"
                value={block.fields.from}
                onChange={(value) => onField(block.id, "from", value)}
                onDropReporter={(ref) => onField(block.id, "from", { ref })}
              />
              →
              <FieldChip
                blockId={block.id}
                fieldKey="to"
                value={block.fields.to}
                suffix="mL/min"
                onChange={(value) => onField(block.id, "to", value)}
                onDropReporter={(ref) => onField(block.id, "to", { ref })}
              />
            </span>
            <MiniChart
              kind="step"
              from={asNumber(block.fields.from, 0)}
              to={asNumber(block.fields.to, 40)}
            />
          </span>
        );
      case "varFlow":
        return <>Vazão Atual</>;
      case "varTime":
        return <>Tempo Decorrido</>;
      case "varVolume":
        return <>Volume Total</>;
    }
  })();

  if (reporter) {
    return (
      <div
        draggable
        onDragStart={(event) => onDragStart(event, { from: "canvas", id: block.id })}
        className="inline-flex cursor-grab items-center rounded-full px-3 py-1 text-[12px] font-medium text-white shadow-sm active:cursor-grabbing"
        style={{ background: color }}
      >
        {body}
      </div>
    );
  }

  return (
    <div className="w-[min(100%,34rem)]">
      <DropSlot
        target={{ parentId, index }}
        active={hover?.parentId === parentId && hover.index === index}
        onDragOver={onDragOver}
      />
      <article
        draggable
        onDragStart={(event) => onDragStart(event, { from: "canvas", id: block.id })}
        className="overflow-hidden rounded-[18px] text-white shadow-[0_8px_20px_rgba(15,23,42,0.12)]"
        style={{ background: color }}
      >
        <div className="flex items-center gap-2 px-3 py-2.5 text-[13.5px] leading-snug font-medium">
          <span className="mt-0.5 h-8 w-1.5 shrink-0 rounded-full bg-white/35" />
          <div className="min-w-0 flex-1">{body}</div>
        </div>
        {isContainer(block.kind) ? (
          <div
            className={`mx-2 mb-2 min-h-12 rounded-[14px] bg-white/15 p-2 ring-1 ring-white/20 ${
              isHoverInside ? "ring-2 ring-white" : ""
            }`}
            onDragOver={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onDragOver({
                parentId: block.id,
                index: block.children?.length ?? 0,
              });
            }}
          >
            {(block.children ?? []).length === 0 ? (
              <p className="px-2 py-3 text-center text-[11px] text-white/70">
                Solte blocos aqui
              </p>
            ) : (
              (block.children ?? []).map((child, childIndex) => (
                <BlockCard
                  key={child.id}
                  block={child}
                  parentId={block.id}
                  index={childIndex}
                  hover={hover}
                  onDragOver={onDragOver}
                  onField={onField}
                  onDragStart={onDragStart}
                />
              ))
            )}
            <DropSlot
              target={{
                parentId: block.id,
                index: block.children?.length ?? 0,
              }}
              active={
                hover?.parentId === block.id &&
                hover.index === (block.children?.length ?? 0)
              }
              onDragOver={onDragOver}
            />
          </div>
        ) : null}
      </article>
    </div>
  );
}

export function ExperimentModal({
  pumpId,
  pumpName,
  onClose,
}: {
  pumpId: number;
  pumpName: string;
  onClose: () => void;
}) {
  const [blocks, setBlocks] = useState<ExperimentBlock[]>(() => loadProgram(pumpId));
  const [hover, setHover] = useState<DropTarget | null>(null);
  const [overTrash, setOverTrash] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [saved, setSaved] = useState(false);
  const dragRef = useRef<DragPayload | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const applyDrop = (target: DropTarget | "trash") => {
    const drag = dragRef.current;
    dragRef.current = null;
    setHover(null);
    setOverTrash(false);
    if (!drag) {
      return;
    }
    if (target === "trash") {
      if (drag.from === "canvas") {
        setBlocks((current) => removeBlock(current, drag.id).next);
      }
      return;
    }
    if (drag.from === "palette") {
      const created = createBlock(drag.kind);
      if (isReporter(drag.kind) && target.parentId) {
        const parent = findBlock(blocks, target.parentId);
        if (parent && !isContainer(parent.kind)) {
          return;
        }
      }
      setBlocks((current) => insertBlock(current, target.parentId, target.index, created));
      return;
    }
    const moving = findBlock(blocks, drag.id);
    if (moving && target.parentId && containsId(moving, target.parentId)) {
      return;
    }
    setBlocks((current) => moveBlock(current, drag.id, target.parentId, target.index));
  };

  const startDrag = (event: React.DragEvent, payload: DragPayload) => {
    dragRef.current = payload;
    event.dataTransfer.effectAllowed = "copyMove";
    if (payload.from === "palette" && isReporter(payload.kind)) {
      event.dataTransfer.setData("application/x-bomba-io", payload.kind);
    }
    event.dataTransfer.setData("text/plain", payload.from === "palette" ? payload.kind : payload.id);
  };

  const handleSave = () => {
    saveProgram(pumpId, blocks);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8">
      <button
        type="button"
        aria-label="Fechar programação"
        className="absolute inset-0 bg-slate-900/25 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-labelledby="experiment-title"
        className="relative flex h-[min(860px,92vh)] w-full max-w-6xl overflow-hidden rounded-[28px] bg-[#f7f8fb] shadow-[0_30px_80px_rgba(15,23,42,0.22)] ring-1 ring-black/5"
      >
        <aside className="flex w-[250px] shrink-0 flex-col border-r border-slate-200/80 bg-white/80 px-4 py-5">
          <h2
            id="experiment-title"
            className="pr-2 text-[18px] leading-tight font-semibold text-slate-800"
          >
            Programação de Experimento
          </h2>
          <p className="mt-1 text-[11px] tracking-wide text-slate-400 uppercase">
            Unidade {pumpName}
          </p>
          <div className="mt-6 space-y-5 overflow-auto pr-1">
            {PALETTE.map((group) => (
              <section key={group.category}>
                <p
                  className="mb-2 flex items-center gap-2 text-[12px] font-semibold"
                  style={{ color: PALETTE_INK[group.category] }}
                >
                  <span
                    className="size-2.5 rounded-[3px]"
                    style={{ background: PALETTE_INK[group.category] }}
                  />
                  {group.title}
                </p>
                <div className="space-y-1.5">
                  {group.items.map((item) => (
                    <button
                      key={item.kind}
                      type="button"
                      draggable
                      onDragStart={(event) =>
                        startDrag(event, { from: "palette", kind: item.kind })
                      }
                      onClick={() =>
                        setBlocks((current) => [
                          ...current,
                          createBlock(item.kind),
                        ])
                      }
                      className="flex w-full cursor-grab items-center gap-2 rounded-[10px] bg-white px-2.5 py-2 text-left text-[13px] text-slate-600 ring-1 ring-slate-200/80 hover:bg-slate-50 active:cursor-grabbing"
                    >
                      <span
                        className="h-5 w-1 rounded-full"
                        style={{ background: PALETTE_INK[item.category] }}
                      />
                      {item.label}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-end gap-3 px-5 pt-4 pb-2">
            <div className="mr-auto flex items-center gap-2 text-[11px] font-semibold tracking-[0.18em] text-slate-400">
              <img src={logo} alt="" className="size-6 rounded-md ring-1 ring-slate-200" />
              LITEL
              <span className="text-slate-300">|</span>
              <img src={copasa} alt="Copasa" className="h-5 w-auto object-contain" />
            </div>
            <button
              type="button"
              onClick={handleSave}
              className="rounded-full bg-slate-800 px-4 py-1.5 text-[13px] font-medium text-white shadow-sm"
            >
              {saved ? "Salvo" : "Salvar"}
            </button>
            <button
              type="button"
              aria-label="Fechar"
              onClick={onClose}
              className="grid size-8 place-items-center rounded-full text-xl leading-none text-slate-400 hover:bg-slate-200/60"
            >
              ×
            </button>
          </header>

          <div
            className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-6 py-6 pr-20"
            onDragOver={(event) => {
              event.preventDefault();
              if (!hover) {
                setHover({ parentId: null, index: blocks.length });
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              applyDrop(hover ?? { parentId: null, index: blocks.length });
            }}
            onDragLeave={(event) => {
              if (event.currentTarget === event.target) {
                setHover(null);
              }
            }}
          >
            <div
              className="origin-top-left"
              style={{ transform: `scale(${zoom})`, minHeight: "100%" }}
            >
              {blocks.length === 0 ? (
                <div className="grid h-[360px] place-items-center rounded-[22px] border border-dashed border-slate-200 bg-white/70 text-sm text-slate-400">
                  Arraste blocos da esquerda para montar o experimento
                </div>
              ) : (
                <>
                  {blocks.map((block, index) => (
                    <BlockCard
                      key={block.id}
                      block={block}
                      parentId={null}
                      index={index}
                      hover={hover}
                      onDragOver={setHover}
                      onField={(id, key, value) =>
                        setBlocks((current) => setField(current, id, key, value))
                      }
                      onDragStart={startDrag}
                    />
                  ))}
                  <DropSlot
                    target={{ parentId: null, index: blocks.length }}
                    active={hover?.parentId === null && hover.index === blocks.length}
                    onDragOver={setHover}
                  />
                </>
              )}
            </div>

            <div className="pointer-events-none absolute right-5 bottom-5 flex flex-col items-center gap-2">
              <div className="pointer-events-auto flex flex-col overflow-hidden rounded-full bg-white shadow-md ring-1 ring-slate-200">
                <button
                  type="button"
                  aria-label="Aumentar zoom"
                  onClick={() => setZoom((value) => Math.min(1.4, value + 0.1))}
                  className="grid size-9 place-items-center text-lg text-slate-500 hover:bg-slate-50"
                >
                  +
                </button>
                <button
                  type="button"
                  aria-label="Diminuir zoom"
                  onClick={() => setZoom((value) => Math.max(0.7, value - 0.1))}
                  className="grid size-9 place-items-center text-lg text-slate-500 hover:bg-slate-50"
                >
                  −
                </button>
              </div>
              <button
                type="button"
                aria-label="Lixeira: solte um bloco para apagar"
                onDragOver={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setOverTrash(true);
                  setHover(null);
                }}
                onDragLeave={() => setOverTrash(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  applyDrop("trash");
                }}
                onClick={() => {
                  const last = blocks[blocks.length - 1];
                  if (last) {
                    setBlocks((current) => removeBlock(current, last.id).next);
                  }
                }}
                className={`pointer-events-auto grid size-11 place-items-center rounded-2xl ring-1 ${
                  overTrash
                    ? "bg-red-500 text-white ring-red-500"
                    : "bg-white text-slate-400 ring-slate-200"
                }`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M4 7h16M9 7V5h6v2m-8 0 1 12h8l1-12"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
