import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import copasa from "../assets/copasa.png";
import {
  BLOCK_MD,
  BLOCK_SM,
  cBlockPath,
  shade,
  statementPath,
  type BlockMetrics,
} from "../lib/blockShapes";
import {
  CATEGORY_COLOR,
  PALETTE,
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
  type PaletteItem,
} from "../lib/experiment";
import { newId } from "../lib/calibration";
import { exportProgramFile, openProgramFile, ProgramFileError } from "../lib/programFile";
import {
  defaultProgramName,
  loadLibrary,
  loadPumpProgram,
  saveLibrary,
  savePumpProgram,
  type LibraryProgram,
} from "../lib/storage";
import { ConfirmDialog, type ConfirmRequest } from "./ConfirmDialog";
import { LitelMark } from "./LitelMark";
import { ProgramControls } from "./ProgramControls";
import { ProgramLibraryDialog } from "./ProgramLibraryDialog";

const EXPANDED_KEY = "bomba.editor-expanded";

function readExpanded() {
  try {
    return localStorage.getItem(EXPANDED_KEY) === "1";
  } catch {
    return false;
  }
}

function HeaderButton({
  onClick,
  title,
  primary,
  children,
}: {
  onClick: () => void;
  title?: string;
  primary?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={
        primary
          ? "rounded-[5px] bg-[#166993] px-4 py-2 text-[13px] font-medium whitespace-nowrap text-white shadow-sm hover:bg-[#12597d]"
          : "rounded-[5px] bg-white px-3 py-2 text-[13px] font-medium whitespace-nowrap text-[#166993] ring-1 ring-[#c9dbe8] hover:bg-[#e8f1f7]"
      }
    >
      {children}
    </button>
  );
}

const BLOCK_FONT = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';
const IO_MIME = "application/x-bomba-io";
const DURATION_OPTIONS = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 300];
const STACK_GAP = 3;

type DropTarget = { parentId: string | null; index: number };
type DragPayload =
  | { from: "palette"; kind: BlockKind }
  | { from: "canvas"; id: string };

function asNumber(value: FieldValue | undefined, fallback: number) {
  return typeof value === "number" ? value : fallback;
}

function isIoRef(value: string): value is IoRef {
  return value === "varFlow" || value === "varTime" || value === "varVolume";
}

function useBoxSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const update = () => {
      const w = element.offsetWidth;
      const h = element.offsetHeight;
      setSize((current) => (current.w === w && current.h === h ? current : { w, h }));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}

/** Inputs inside a draggable block only get text selection if the block is not draggable at that moment. */
function armDrag(event: PointerEvent<HTMLElement>) {
  const target = event.target as HTMLElement;
  event.currentTarget.draggable = !target.closest("input, select, button");
}

function ShapePath({ d, color }: { d: string; color: string }) {
  return (
    <path
      d={d}
      fill={color}
      stroke={shade(color, 0.22)}
      strokeWidth={1}
      style={{ pointerEvents: "visiblePainted" }}
    />
  );
}

function StatementShape({
  color,
  metrics,
  children,
}: {
  color: string;
  metrics: BlockMetrics;
  children: ReactNode;
}) {
  const [ref, size] = useBoxSize<HTMLDivElement>();
  return (
    <div ref={ref} className="relative inline-flex" style={{ minHeight: metrics.minH }}>
      {size.w > 0 ? (
        <svg
          aria-hidden
          width={size.w}
          height={size.h}
          className="pointer-events-none absolute top-0 left-0 overflow-visible"
        >
          <ShapePath d={statementPath(size.w, size.h, metrics)} color={color} />
        </svg>
      ) : null}
      <div className="relative flex items-center">{children}</div>
    </div>
  );
}

function CShape({
  color,
  metrics,
  header,
  children,
  innerMinH,
  bottomRatio = 0.62,
  stackGap = 0,
  onHeaderDragOver,
  onBottomDragOver,
}: {
  color: string;
  metrics: BlockMetrics;
  header: ReactNode;
  children: ReactNode;
  innerMinH: number;
  bottomRatio?: number;
  stackGap?: number;
  onHeaderDragOver?: (event: DragEvent<HTMLDivElement>) => void;
  onBottomDragOver?: (event: DragEvent<HTMLDivElement>) => void;
}) {
  const [headRef, head] = useBoxSize<HTMLDivElement>();
  const [innerRef, inner] = useBoxSize<HTMLDivElement>();
  const bottomW = Math.min(
    head.w,
    Math.max(metrics.armW + 40, Math.round(head.w * bottomRatio)),
  );
  return (
    <div className="pointer-events-none relative inline-flex flex-col items-start">
      {head.w > 0 ? (
        <svg
          aria-hidden
          width={head.w}
          height={head.h + inner.h + metrics.bottomH}
          className="pointer-events-none absolute top-0 left-0 overflow-visible"
        >
          <ShapePath d={cBlockPath(head.w, head.h, inner.h, bottomW, metrics)} color={color} />
        </svg>
      ) : null}
      <div
        ref={headRef}
        onDragOver={onHeaderDragOver}
        className="pointer-events-auto relative flex items-center"
        style={{ minHeight: metrics.minH }}
      >
        {header}
      </div>
      <div
        ref={innerRef}
        className="relative flex flex-col items-start"
        style={{
          marginLeft: metrics.armW,
          minHeight: innerMinH,
          gap: stackGap,
          paddingTop: stackGap,
          paddingBottom: stackGap,
        }}
      >
        {children}
      </div>
      <div
        onDragOver={onBottomDragOver}
        className="pointer-events-auto relative"
        style={{ height: metrics.bottomH, width: bottomW }}
      />
    </div>
  );
}

function ValueInput({
  color,
  value,
  onChange,
}: {
  color: string;
  value: FieldValue | undefined;
  onChange: (next: FieldValue) => void;
}) {
  const allowIo = (event: DragEvent) => {
    if (event.dataTransfer.types.includes(IO_MIME)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const socket = (
    <span
      aria-hidden
      className="h-[15px] w-[5px] shrink-0 rounded-l-[2px]"
      style={{ background: shade(color, 0.42) }}
    />
  );

  if (value && typeof value === "object" && "ref" in value) {
    const io = CATEGORY_COLOR.io;
    return (
      <span className="inline-flex items-center">
        {socket}
        <span
          className="inline-flex h-[26px] items-center gap-1 rounded-[4px] pr-1 pl-2 text-[14.5px] text-white"
          style={{ background: io, boxShadow: `inset 0 0 0 1px ${shade(io, 0.22)}` }}
        >
          {reporterLabel(value.ref)}
          <button
            type="button"
            aria-label="Remover variável"
            onClick={() => onChange(0)}
            className="grid size-4 place-items-center rounded-full text-[11px] leading-none text-white/75 hover:bg-white/20 hover:text-white"
          >
            ×
          </button>
        </span>
      </span>
    );
  }

  const text = String(asNumber(value, 0));
  return (
    <span
      className="inline-flex items-center"
      onDragOver={allowIo}
      onDrop={(event) => {
        const ref = event.dataTransfer.getData(IO_MIME);
        if (isIoRef(ref)) {
          event.preventDefault();
          event.stopPropagation();
          onChange({ ref });
        }
      }}
    >
      {socket}
      <input
        type="number"
        value={text}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-[26px] rounded-[4px] bg-[#eeedfa] px-1 text-center text-[15px] text-[#2d2d3a] outline-none [appearance:textfield] focus:ring-2 focus:ring-white/80 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        style={{ width: `calc(${Math.max(text.length, 1)}ch + 22px)`, fontFamily: BLOCK_FONT }}
      />
    </span>
  );
}

function DurationSelect({
  color,
  value,
  onChange,
}: {
  color: string;
  value: number;
  onChange: (next: number) => void;
}) {
  const options = DURATION_OPTIONS.includes(value)
    ? DURATION_OPTIONS
    : [...DURATION_OPTIONS, value].sort((a, b) => a - b);
  return (
    <span className="relative inline-flex items-center">
      <select
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-[24px] cursor-pointer appearance-none rounded-[4px] pr-[20px] pl-[8px] text-[14.5px] text-white outline-none focus:ring-2 focus:ring-white/70"
        style={{
          background: shade(color, -0.2),
          boxShadow: `inset 0 0 0 1px ${shade(color, 0.12)}`,
          fontFamily: BLOCK_FONT,
        }}
      >
        {options.map((option) => (
          <option key={option} value={option} className="text-slate-800">
            {option}
          </option>
        ))}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 8 5"
        className="pointer-events-none absolute right-[6px] h-[5px] w-[8px]"
      >
        <path d="M0.5 0.5 4 4.2 7.5 0.5" fill="none" stroke="white" strokeWidth="1.3" />
      </svg>
    </span>
  );
}

function profileSeries(kind: "ramp" | "sine" | "step", fields: Record<string, FieldValue>) {
  const n = 56;
  const from = asNumber(fields.from, 10);
  const to = asNumber(fields.to, 50);
  const center = asNumber(fields.center, 30);
  const amplitude = asNumber(fields.amplitude, 10);
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    if (kind === "ramp") {
      return from + (to - from) * t;
    }
    if (kind === "sine") {
      return center + amplitude * Math.sin(t * Math.PI * 2);
    }
    return t < 0.5 ? from : to;
  });
}

function MiniChart({
  kind,
  fields,
  width = 150,
  height = 104,
}: {
  kind: "ramp" | "sine" | "step";
  fields: Record<string, FieldValue>;
  width?: number;
  height?: number;
}) {
  const left = 22;
  const right = 10;
  const top = 9;
  const bottom = 16;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const values = profileSeries(kind, fields);
  const yMax = Math.max(1, ...values.map((v) => Math.abs(v)));
  const xLabel =
    kind === "sine" ? asNumber(fields.period, 20) : asNumber(fields.duration, 30);
  const points = values.map((v, i) => {
    const x = left + (i / (values.length - 1)) * plotW;
    const y = top + plotH - (Math.max(0, v) / yMax) * plotH;
    return [x, y] as const;
  });
  const line = points
    .map(([x, y], i) => {
      if (kind === "step" && i > 0 && points[i - 1][1] !== y) {
        return `L ${x.toFixed(1)},${points[i - 1][1].toFixed(1)} L ${x.toFixed(1)},${y.toFixed(1)}`;
      }
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const area = `${line} L ${left + plotW},${top + plotH} L ${left},${top + plotH} Z`;
  const [endX, endY] = points[points.length - 1];
  const labelFont = { fontFamily: BLOCK_FONT, fontSize: 11 };

  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className="shrink-0"
    >
      <rect x={0.5} y={0.5} width={width - 1} height={height - 1} rx={2} fill="#ffffff" />
      <rect
        x={left}
        y={top}
        width={plotW}
        height={plotH}
        fill="#f5f7fa"
        stroke="#d7dde5"
        strokeWidth={0.8}
      />
      <path d={area} fill="#c4d4e3" opacity={0.85} />
      <path d={line} fill="none" stroke="#1f3a57" strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={endX} cy={endY} r={2.6} fill="#1f3a57" />
      <text x={left - 3} y={top + 6} textAnchor="end" fill="#4b5563" style={labelFont}>
        {Math.round(yMax)}
      </text>
      <text x={left - 3} y={top + plotH + 1} textAnchor="end" fill="#4b5563" style={labelFont}>
        0
      </text>
      <text x={left + plotW} y={height - 3} textAnchor="middle" fill="#4b5563" style={labelFont}>
        {xLabel}
      </text>
    </svg>
  );
}

function Row({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[26px] items-center gap-[8px] whitespace-nowrap">{children}</div>
  );
}

function ChartRow({ label, chart, control }: { label: string; chart: ReactNode; control: ReactNode }) {
  return (
    <div className="flex items-start justify-end gap-[8px] whitespace-nowrap">
      <span className="pt-[8px]">{label}</span>
      {chart}
      <span className="flex items-center gap-[6px] pt-[3px]">{control}</span>
    </div>
  );
}

function BlockBody({
  block,
  color,
  onField,
}: {
  block: ExperimentBlock;
  color: string;
  onField: (key: string, value: FieldValue) => void;
}) {
  const field = (key: string) => (
    <ValueInput color={color} value={block.fields[key]} onChange={(next) => onField(key, next)} />
  );
  const duration = (key: string) => (
    <DurationSelect
      color={color}
      value={asNumber(block.fields[key], 30)}
      onChange={(next) => onField(key, next)}
    />
  );

  switch (block.kind) {
    case "for":
      return (
        <Row>
          Para iterando {field("times")} vezes
        </Row>
      );
    case "while":
      return (
        <Row>
          Enquanto vazão &gt; {field("threshold")} mL/min
        </Row>
      );
    case "if":
      return (
        <Row>
          Se vazão ≥ {field("threshold")} mL/min
        </Row>
      );
    case "setFlow":
      return (
        <Row>
          Definir vazão {field("flow")} mL/min
        </Row>
      );
    case "invert":
      return <Row>Inverter rotação</Row>;
    case "pause":
      return (
        <Row>
          Pausar por {field("seconds")} s
        </Row>
      );
    case "ramp":
      return (
        <div className="flex flex-col gap-[10px] pb-[4px]">
          <Row>
            Rampa de Vazão {field("from")} a {field("to")} mL/min
          </Row>
          <ChartRow
            label="em"
            chart={<MiniChart kind="ramp" fields={block.fields} />}
            control={<>{duration("duration")} s</>}
          />
        </div>
      );
    case "sine":
      return (
        <div className="flex flex-col gap-[10px] pb-[4px]">
          <Row>
            Vazão Senoidal {field("center")} ± {field("amplitude")} mL/min
          </Row>
          <ChartRow
            label="período"
            chart={<MiniChart kind="sine" fields={block.fields} />}
            control={<>{duration("period")} s</>}
          />
        </div>
      );
    case "step":
      return (
        <div className="flex flex-col gap-[10px] pb-[4px]">
          <Row>
            Vazão em Degrau {field("from")} → {field("to")} mL/min
          </Row>
          <ChartRow
            label="em"
            chart={<MiniChart kind="step" fields={block.fields} />}
            control={<>{duration("duration")} s</>}
          />
        </div>
      );
    case "varFlow":
    case "varTime":
    case "varVolume":
      return <Row>{reporterLabel(block.kind)}</Row>;
  }
}

function InsertionMarker({ metrics }: { metrics: BlockMetrics }) {
  const w = 120;
  const h = metrics.minH;
  return (
    <div
      className="pointer-events-auto relative"
      style={{ width: w, height: h }}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <svg aria-hidden width={w} height={h} className="absolute top-0 left-0 overflow-visible">
        <path
          d={statementPath(w, h, metrics)}
          fill="rgba(15,23,42,0.16)"
          stroke="rgba(15,23,42,0.28)"
          strokeDasharray="3 2"
        />
      </svg>
    </div>
  );
}

type NodeHandlers = {
  hover: DropTarget | null;
  draggingId: string | null;
  onHover: (target: DropTarget) => void;
  onField: (id: string, key: string, value: FieldValue) => void;
  onDragStart: (event: DragEvent, payload: DragPayload) => void;
  onDragEnd: () => void;
};

function pickHalf(
  event: DragEvent<HTMLElement>,
  before: DropTarget,
  after: DropTarget,
  onHover: (target: DropTarget) => void,
) {
  event.preventDefault();
  event.stopPropagation();
  const rect = event.currentTarget.getBoundingClientRect();
  onHover(event.clientY < rect.top + rect.height / 2 ? before : after);
}

function CanvasNode({
  block,
  parentId,
  index,
  ...handlers
}: { block: ExperimentBlock; parentId: string | null; index: number } & NodeHandlers) {
  const color = CATEGORY_COLOR[kindCategory(block.kind)];
  const dragging = handlers.draggingId === block.id;
  const body = (
    <div
      className="py-[5px] pr-[14px] pl-[12px] text-[16px] leading-none text-white"
      style={{ fontFamily: BLOCK_FONT }}
    >
      <BlockBody
        block={block}
        color={color}
        onField={(key, value) => handlers.onField(block.id, key, value)}
      />
    </div>
  );
  const dragProps = {
    draggable: true,
    onPointerDown: armDrag,
    onDragStart: (event: DragEvent<HTMLDivElement>) => {
      event.stopPropagation();
      handlers.onDragStart(event, { from: "canvas", id: block.id });
    },
    onDragEnd: handlers.onDragEnd,
  };

  if (isContainer(block.kind)) {
    return (
      <div
        {...dragProps}
        className={`pointer-events-none relative cursor-grab active:cursor-grabbing ${
          dragging ? "opacity-40" : ""
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <CShape
          color={color}
          metrics={BLOCK_MD}
          header={body}
          innerMinH={BLOCK_MD.minH * 0.75}
          stackGap={STACK_GAP}
          onHeaderDragOver={(event) =>
            pickHalf(
              event,
              { parentId, index },
              { parentId: block.id, index: 0 },
              handlers.onHover,
            )
          }
          onBottomDragOver={(event) => {
            event.preventDefault();
            event.stopPropagation();
            handlers.onHover({ parentId, index: index + 1 });
          }}
        >
          <Stack blocks={block.children ?? []} parentId={block.id} {...handlers} />
        </CShape>
      </div>
    );
  }

  return (
    <div
      {...dragProps}
      className={`pointer-events-auto relative cursor-grab active:cursor-grabbing ${
        dragging ? "opacity-40" : ""
      }`}
      onDragOver={(event) =>
        pickHalf(event, { parentId, index }, { parentId, index: index + 1 }, handlers.onHover)
      }
    >
      <StatementShape color={color} metrics={BLOCK_MD}>
        {body}
      </StatementShape>
    </div>
  );
}

function Stack({
  blocks,
  parentId,
  ...handlers
}: { blocks: ExperimentBlock[]; parentId: string | null } & NodeHandlers) {
  const markerAt = handlers.hover && handlers.hover.parentId === parentId ? handlers.hover.index : -1;
  return (
    <>
      {blocks.map((block, index) => (
        <Fragment key={block.id}>
          {markerAt === index ? <InsertionMarker metrics={BLOCK_MD} /> : null}
          <CanvasNode block={block} parentId={parentId} index={index} {...handlers} />
        </Fragment>
      ))}
      {markerAt === blocks.length ? <InsertionMarker metrics={BLOCK_MD} /> : null}
      {blocks.length === 0 && markerAt !== 0 && parentId !== null ? (
        <div
          className="pointer-events-auto h-[24px] w-[64px]"
          onDragOver={(event) => {
            event.preventDefault();
            event.stopPropagation();
            handlers.onHover({ parentId, index: 0 });
          }}
        />
      ) : null}
    </>
  );
}

function PaletteBlock({
  item,
  onDragStart,
  onDragEnd,
  onAdd,
}: {
  item: PaletteItem;
  onDragStart: (event: DragEvent, payload: DragPayload) => void;
  onDragEnd: () => void;
  onAdd: () => void;
}) {
  const color = CATEGORY_COLOR[item.category];
  const label = item.category === "logic" ? `${item.label}...` : item.label;
  const text = (
    <div
      className="py-[4px] pr-[12px] pl-[9px] text-[13.5px] leading-none whitespace-nowrap text-white"
      style={{ fontFamily: BLOCK_FONT }}
    >
      {item.kind === "ramp" || item.kind === "sine" || item.kind === "step" ? (
        <div className="flex flex-col gap-[3px] py-[2px]">
          <span>{label}</span>
          <span className="flex justify-end pl-[84px]">
            <MiniChart kind={item.kind} fields={createBlock(item.kind).fields} width={116} height={82} />
          </span>
        </div>
      ) : (
        label
      )}
    </div>
  );

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={item.label}
      title="Arraste para a área de montagem ou clique para adicionar ao fim"
      draggable
      onDragStart={(event) => onDragStart(event, { from: "palette", kind: item.kind })}
      onDragEnd={onDragEnd}
      onClick={onAdd}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onAdd();
        }
      }}
      className="w-fit cursor-grab rounded-[6px] outline-none focus-visible:ring-2 focus-visible:ring-sky-400 active:cursor-grabbing"
    >
      {item.kind === "if" ? (
        <CShape
          color={color}
          metrics={BLOCK_SM}
          header={<div className="pr-[22px]">{text}</div>}
          innerMinH={9}
          bottomRatio={1}
        >
          {null}
        </CShape>
      ) : (
        <StatementShape color={color} metrics={BLOCK_SM}>
          {text}
        </StatementShape>
      )}
    </div>
  );
}

function RoundControl({
  label,
  onClick,
  ring = true,
  children,
}: {
  label: string;
  onClick: () => void;
  ring?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="pointer-events-auto grid size-[31px] place-items-center text-[#c4c4c4] transition-colors hover:text-[#8f8f8f]"
    >
      <svg viewBox="0 0 24 24" className="size-[27px]" fill="none" stroke="currentColor" strokeWidth={1.5}>
        {ring ? <circle cx="12" cy="12" r="10.5" /> : null}
        {children}
      </svg>
    </button>
  );
}

function TrashCan({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 36 44" className="h-[44px] w-[36px]" aria-hidden>
      <g
        style={{
          transformOrigin: "3px 9px",
          transform: open ? "rotate(-24deg)" : "none",
          transition: "transform 120ms ease-out",
        }}
      >
        <rect x="13" y="1.5" width="10" height="5" rx="1.2" fill="none" stroke="currentColor" strokeWidth="2" />
        <rect x="1.5" y="6" width="33" height="4.5" rx="1" fill="currentColor" />
      </g>
      <path d="M4 12.5 H32 L30.6 41.2 A2 2 0 0 1 28.6 43 H7.4 A2 2 0 0 1 5.4 41.2 Z" fill="currentColor" />
    </svg>
  );
}

export function ExperimentModal({
  pumpId,
  pumpName,
  minimized = false,
  onMinimize,
  onClose,
}: {
  pumpId: number;
  pumpName: string;
  minimized?: boolean;
  onMinimize?: () => void;
  onClose: () => void;
}) {
  const [initial] = useState(() => loadPumpProgram(pumpId));
  const [blocks, setBlocks] = useState<ExperimentBlock[]>(initial.blocks);
  const [name, setName] = useState(initial.name);
  const [docId, setDocId] = useState(initial.docId);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(readExpanded);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [library, setLibrary] = useState<LibraryProgram[]>(loadLibrary);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [hover, setHover] = useState<DropTarget | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overTrash, setOverTrash] = useState(false);
  const [zoom, setZoom] = useState(1);
  const dragRef = useRef<DragPayload | null>(null);
  const blocksRef = useRef(blocks);
  const programRef = useRef({ name, docId, blocks });
  const savedRef = useRef(initial);
  const pendingRef = useRef(false);
  const flashTimer = useRef<number | undefined>(undefined);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  blocksRef.current = blocks;
  programRef.current = { name, docId, blocks };

  const persistNow = () => {
    pendingRef.current = false;
    savedRef.current = programRef.current;
    savePumpProgram(pumpId, programRef.current);
    setSaving(false);
  };

  useEffect(() => {
    const last = savedRef.current;
    if (blocks === last.blocks && name === last.name && docId === last.docId) {
      return;
    }
    pendingRef.current = true;
    setSaving(true);
    const timer = window.setTimeout(persistNow, 500);
    return () => window.clearTimeout(timer);
  }, [blocks, docId, name, pumpId]);

  useEffect(
    () => () => {
      if (pendingRef.current) {
        savePumpProgram(pumpId, programRef.current);
      }
      window.clearTimeout(flashTimer.current);
    },
    [pumpId],
  );

  useEffect(() => {
    if (minimized) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !libraryOpen && !confirm) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirm, libraryOpen, minimized, onClose]);

  useEffect(() => {
    try {
      localStorage.setItem(EXPANDED_KEY, expanded ? "1" : "0");
    } catch {
      /* modo privado */
    }
  }, [expanded]);

  const showFlash = (message: string) => {
    setFlash(message);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 2200);
  };

  const commitName = () => {
    if (nameDraft === null) {
      return;
    }
    const next = nameDraft.trim().slice(0, 80);
    setNameDraft(null);
    if (next && next !== name) {
      setName(next);
    }
  };

  const refreshLibrary = () => setLibrary(loadLibrary());
  const cancelConfirm = useCallback(() => setConfirm(null), []);

  const isDraftAtRisk = () => !docId && blocksRef.current.length > 0;

  const replaceProgram = (next: { name: string; docId: string | null; blocks: ExperimentBlock[] }) => {
    const apply = () => {
      setConfirm(null);
      setFlash(null);
      setNameDraft(null);
      setName(next.name);
      setDocId(next.docId);
      setBlocks(next.blocks);
      programRef.current = next;
      persistNow();
      setLibraryOpen(false);
      setZoom(1);
      canvasRef.current?.scrollTo({ left: 0, top: 0 });
    };
    if (!isDraftAtRisk()) {
      apply();
      return;
    }
    setConfirm({
      title: "Substituir a programação atual?",
      message: `“${name}” não está salva na biblioteca e será descartada. Use “Salvar” antes se quiser mantê-la.`,
      confirmLabel: "Substituir",
      danger: true,
      hideDontAsk: true,
      onConfirm: apply,
    });
  };

  const addToLibrary = (docName: string) => {
    const doc: LibraryProgram = {
      id: newId(),
      name: docName,
      blocks: blocksRef.current,
      updatedAt: Date.now(),
    };
    saveLibrary([doc, ...loadLibrary()]);
    setName(docName);
    setDocId(doc.id);
    programRef.current = { name: docName, docId: doc.id, blocks: blocksRef.current };
    persistNow();
    refreshLibrary();
    return doc;
  };

  const handleSave = () => {
    commitName();
    const currentName = nameDraft?.trim() || name;
    if (docId && loadLibrary().some((item) => item.id === docId)) {
      programRef.current = { ...programRef.current, name: currentName };
      persistNow();
      refreshLibrary();
      showFlash("Salvo na biblioteca");
      return;
    }
    addToLibrary(currentName);
    showFlash("Adicionado à biblioteca");
  };

  const handleSaveCopy = () => {
    const taken = new Set(loadLibrary().map((item) => item.name));
    let copyName = `${name} (cópia)`;
    for (let n = 2; taken.has(copyName); n++) {
      copyName = `${name} (cópia ${n})`;
    }
    addToLibrary(copyName.slice(0, 80));
    setLibraryOpen(false);
    showFlash("Cópia salva na biblioteca");
  };

  const handleExport = async () => {
    try {
      const saved = await exportProgramFile(name, blocksRef.current);
      if (saved) {
        showFlash("Arquivo exportado");
      }
    } catch {
      showFlash("Falha ao exportar o arquivo");
    }
  };

  const handleOpenFile = async () => {
    try {
      const file = await openProgramFile();
      if (file) {
        replaceProgram({ name: file.name, docId: null, blocks: file.blocks });
      }
    } catch (error) {
      showFlash(error instanceof ProgramFileError ? error.message : "Falha ao abrir o arquivo");
    }
  };

  const handleRename = (id: string, docName: string) => {
    saveLibrary(
      loadLibrary().map((item) =>
        item.id === id ? { ...item, name: docName, updatedAt: Date.now() } : item,
      ),
    );
    if (id === docId) {
      setName(docName);
    }
    refreshLibrary();
  };

  const handleDelete = (item: LibraryProgram) => {
    setConfirm({
      title: "Excluir programação?",
      message:
        item.id === docId
          ? `“${item.name}” será removida da biblioteca. A programação continua aberta no editor como rascunho.`
          : `“${item.name}” será removida da biblioteca. Esta ação não pode ser desfeita.`,
      confirmLabel: "Excluir",
      danger: true,
      hideDontAsk: true,
      onConfirm: () => {
        setConfirm(null);
        saveLibrary(loadLibrary().filter((entry) => entry.id !== item.id));
        if (item.id === docId) {
          setDocId(null);
        }
        refreshLibrary();
      },
    });
  };

  const resetDrag = () => {
    dragRef.current = null;
    setHover(null);
    setDraggingId(null);
    setOverTrash(false);
  };

  const hoverTarget = (target: DropTarget) => {
    const drag = dragRef.current;
    if (drag?.from === "canvas" && target.parentId) {
      const moving = findBlock(blocksRef.current, drag.id);
      if (moving && containsId(moving, target.parentId)) {
        setHover(null);
        return;
      }
    }
    setHover((current) =>
      current && current.parentId === target.parentId && current.index === target.index
        ? current
        : target,
    );
  };

  const applyDrop = (target: DropTarget | "trash") => {
    const drag = dragRef.current;
    resetDrag();
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
      setBlocks((current) =>
        insertBlock(current, target.parentId, target.index, createBlock(drag.kind)),
      );
      return;
    }
    setBlocks((current) => moveBlock(current, drag.id, target.parentId, target.index));
  };

  const startDrag = (event: DragEvent, payload: DragPayload) => {
    dragRef.current = payload;
    event.dataTransfer.effectAllowed = "copyMove";
    if (payload.from === "palette" && isReporter(payload.kind)) {
      event.dataTransfer.setData(IO_MIME, payload.kind);
    }
    event.dataTransfer.setData("text/plain", payload.from === "palette" ? payload.kind : payload.id);
    if (payload.from === "canvas") {
      window.setTimeout(() => setDraggingId(payload.id), 0);
    }
  };

  const handlers: NodeHandlers = {
    hover,
    draggingId,
    onHover: hoverTarget,
    onField: (id, key, value) => setBlocks((current) => setField(current, id, key, value)),
    onDragStart: startDrag,
    onDragEnd: resetDrag,
  };

  const acceptCanvasBlock = (event: DragEvent) => {
    if (dragRef.current?.from === "canvas") {
      event.preventDefault();
      setHover(null);
    }
  };

  return (
    <div
      className={
        minimized
          ? "hidden"
          : `fixed inset-0 z-50 flex items-center justify-center ${expanded ? "" : "p-4 sm:p-8"}`
      }
    >
      <button
        type="button"
        aria-label="Fechar programação"
        className="absolute inset-0 bg-slate-900/35"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-labelledby="experiment-title"
        aria-describedby="experiment-unit"
        className={`relative flex flex-col overflow-hidden bg-[#f6f9fc] ${
          expanded
            ? "h-[100dvh] w-screen"
            : "h-[min(780px,90vh)] w-[min(1010px,96vw)] rounded-[10px] shadow-[0_24px_70px_rgba(15,23,42,0.28)] ring-1 ring-black/5"
        }`}
        style={{ fontFamily: BLOCK_FONT }}
      >
        <div className="absolute top-1.5 right-2 z-10 flex items-center gap-0.5">
          <button
            type="button"
            aria-label={expanded ? "Restaurar tamanho" : "Expandir"}
            title={expanded ? "Restaurar tamanho" : "Expandir para a tela inteira"}
            aria-pressed={expanded}
            onClick={() => setExpanded((value) => !value)}
            className="grid size-6 place-items-center rounded-full text-slate-600 hover:bg-slate-200/70"
          >
            <svg
              aria-hidden
              viewBox="0 0 12 12"
              className="size-3"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {expanded ? (
                <path d="M4.5 1.5v3h-3M7.5 1.5v3h3M4.5 10.5v-3h-3M7.5 10.5v-3h3" />
              ) : (
                <path d="M1.5 4.5v-3h3M10.5 4.5v-3h-3M1.5 7.5v3h3M10.5 7.5v3h-3" />
              )}
            </svg>
          </button>
          {onMinimize ? (
            <button
              type="button"
              aria-label="Minimizar"
              title="Minimizar: acompanhe a execução no canto da tela"
              onClick={onMinimize}
              className="grid size-6 place-items-center rounded-full text-slate-600 hover:bg-slate-200/70"
            >
              <svg aria-hidden viewBox="0 0 12 12" className="size-3">
                <path d="M2 9.5h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="grid size-6 place-items-center rounded-full text-[18px] leading-none text-slate-600 hover:bg-slate-200/70"
          >
            ×
          </button>
        </div>

        <header className="flex items-center gap-4 pt-[30px] pr-6 pb-[12px] pl-6">
          <div className="min-w-0">
            <div className="flex items-baseline gap-3">
              <h2
                id="experiment-title"
                className="shrink-0 text-[21px] font-semibold whitespace-nowrap text-[#141b21]"
              >
                Programação de Experimento
              </h2>
              <span id="experiment-unit" className="truncate text-[12px] text-slate-400">
                {pumpName}
              </span>
            </div>
            <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[12.5px]">
              <input
                ref={nameRef}
                value={nameDraft ?? name}
                maxLength={80}
                aria-label="Nome da programação"
                title="Clique para renomear"
                onFocus={() => setNameDraft(name)}
                onChange={(event) => setNameDraft(event.target.value)}
                onBlur={commitName}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.currentTarget.blur();
                  } else if (event.key === "Escape") {
                    event.stopPropagation();
                    setNameDraft(null);
                    requestAnimationFrame(() => nameRef.current?.blur());
                  }
                }}
                className="field-sizing-content max-w-[40ch] min-w-[6ch] rounded-[4px] bg-transparent px-1 py-0.5 -ml-1 font-medium text-[#1f2933] outline-none hover:bg-slate-200/60 focus:bg-white focus:ring-1 focus:ring-[#166993]"
              />
              <button
                type="button"
                aria-label="Renomear programação"
                title="Renomear"
                onClick={() => nameRef.current?.select()}
                className="grid size-5 shrink-0 place-items-center rounded text-slate-400 hover:text-slate-600"
              >
                <svg
                  aria-hidden
                  viewBox="0 0 16 16"
                  className="size-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                >
                  <path d="M10.5 2.5l3 3L6 13H3v-3z" />
                </svg>
              </button>
              <span
                aria-live="polite"
                className={`truncate text-[11.5px] ${flash ? "text-[#166993]" : "text-slate-400"}`}
              >
                {flash
                  ? `${flash} ✓`
                  : saving
                    ? "Salvando…"
                    : docId
                      ? "Na biblioteca · salvo automaticamente"
                      : "Rascunho · salvo automaticamente"}
              </span>
            </div>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <LitelMark className="mr-1.5 max-[980px]:hidden" />
            <img
              src={copasa}
              alt="Copasa"
              className="mr-2 h-8 w-auto object-contain max-[980px]:hidden"
            />
            <HeaderButton
              title="Abrir uma programação da biblioteca ou de um arquivo"
              onClick={() => {
                refreshLibrary();
                setLibraryOpen(true);
              }}
            >
              Abrir
            </HeaderButton>
            <HeaderButton title="Exportar para um arquivo .json" onClick={() => void handleExport()}>
              Exportar
            </HeaderButton>
            <HeaderButton
              primary
              title={
                docId
                  ? "A programação já está na biblioteca e é salva automaticamente"
                  : "Guardar esta programação na biblioteca da aplicação"
              }
              onClick={handleSave}
            >
              Salvar
            </HeaderButton>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 gap-3 pr-3 pb-3">
          <aside
            aria-label="Blocos disponíveis"
            className="bk-scroll w-[min(292px,32%)] shrink-0 overflow-y-auto bg-[#f2f7fb] py-1 pr-2"
            onDragOver={acceptCanvasBlock}
            onDrop={(event) => {
              if (dragRef.current?.from === "canvas") {
                event.preventDefault();
                applyDrop("trash");
              }
            }}
          >
            {PALETTE.map((group) => (
              <section key={group.category} className="relative mb-[8px] py-[6px] pl-[26px]">
                <span
                  aria-hidden
                  className="absolute top-0 bottom-0 left-0 w-[4px]"
                  style={{ background: shade(CATEGORY_COLOR[group.category], 0.08) }}
                />
                <h3 className="mb-2.5 text-[15px] font-medium text-[#1f2933]">{group.title}</h3>
                <div className="flex flex-col items-start gap-[10px]">
                  {group.items.map((item) => (
                    <PaletteBlock
                      key={item.kind}
                      item={item}
                      onDragStart={startDrag}
                      onDragEnd={resetDrag}
                      onAdd={() => setBlocks((current) => [...current, createBlock(item.kind)])}
                    />
                  ))}
                </div>
              </section>
            ))}
          </aside>

          <div className="relative min-w-0 flex-1 overflow-hidden rounded-[6px] bg-white ring-1 ring-[#e2e8ef]">
            <div
              ref={canvasRef}
              className="bk-scroll absolute inset-0 overflow-auto"
              onDragOver={(event) => {
                event.preventDefault();
                hoverTarget({ parentId: null, index: blocksRef.current.length });
              }}
              onDrop={(event) => {
                event.preventDefault();
                applyDrop(hover ?? { parentId: null, index: blocks.length });
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setHover(null);
                }
              }}
            >
              <div
                className="inline-flex min-h-[150%] min-w-[150%] flex-col items-start pt-[90px] pr-16 pb-40 pl-[136px]"
                style={{ transform: `scale(${zoom})`, transformOrigin: "0 0", gap: STACK_GAP }}
              >
                <Stack blocks={blocks} parentId={null} {...handlers} />
              </div>
              {blocks.length === 0 && !hover ? (
                <p className="pointer-events-none absolute inset-0 grid place-items-center text-[13px] text-slate-400">
                  Arraste blocos da esquerda para montar o experimento
                </p>
              ) : null}
            </div>

            <div className="pointer-events-none absolute right-[30px] bottom-[34px] flex flex-col items-center">
              <RoundControl
                label="Centralizar e restaurar zoom"
                ring={false}
                onClick={() => {
                  setZoom(1);
                  canvasRef.current?.scrollTo({ left: 0, top: 0, behavior: "smooth" });
                }}
              >
                <circle cx="12" cy="12" r="6.5" />
                <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
                <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
              </RoundControl>
              <span aria-hidden className="h-[8px]" />
              <RoundControl
                label="Aumentar zoom"
                onClick={() => setZoom((value) => Math.min(1.6, +(value + 0.1).toFixed(2)))}
              >
                <path d="M12 7v10M7 12h10" />
              </RoundControl>
              <RoundControl
                label="Diminuir zoom"
                onClick={() => setZoom((value) => Math.max(0.6, +(value - 0.1).toFixed(2)))}
              >
                <path d="M7 12h10" />
              </RoundControl>
              <button
                type="button"
                aria-label="Lixeira: solte um bloco para apagar"
                title="Solte um bloco aqui para apagar"
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
                className={`pointer-events-auto mt-[22px] grid place-items-center transition-colors ${
                  overTrash ? "text-[#8d8d8d]" : "text-[#c6c6c6] hover:text-[#a9a9a9]"
                }`}
              >
                <TrashCan open={overTrash} />
              </button>
            </div>
          </div>
        </div>

        <footer className="border-t border-[#e2e8ef] bg-white/70 px-6 py-2.5">
          <ProgramControls
            pumpId={pumpId}
            pumpName={pumpName}
            blocks={blocks}
            onBeforeRun={persistNow}
            layout="bar"
          />
        </footer>

        {libraryOpen ? (
          <ProgramLibraryDialog
            library={library}
            currentDocId={docId}
            blocked={Boolean(confirm)}
            onClose={() => setLibraryOpen(false)}
            onOpen={(item) => replaceProgram({ name: item.name, docId: item.id, blocks: item.blocks })}
            onRename={handleRename}
            onDelete={handleDelete}
            onNew={() =>
              replaceProgram({ name: defaultProgramName(pumpId), docId: null, blocks: [] })
            }
            onOpenFile={() => void handleOpenFile()}
            onSaveCopy={handleSaveCopy}
          />
        ) : null}
        <ConfirmDialog request={confirm} onCancel={cancelConfirm} />
      </div>
    </div>
  );
}
