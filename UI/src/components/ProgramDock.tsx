import { useEffect, useMemo, useState } from "react";
import { useBench } from "../context/BenchContext";
import { isOwnedState } from "../lib/protocol";
import { loadPumpProgram } from "../lib/storage";
import { ProgramControls } from "./ProgramControls";

export function ProgramDock({
  editorId,
  editorMinimized,
  onOpen,
  onCloseEditor,
}: {
  editorId: number | null;
  editorMinimized: boolean;
  onOpen: (id: number) => void;
  onCloseEditor: () => void;
}) {
  const { pumps, programs } = useBench();
  const [tracked, setTracked] = useState<number[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setTracked((current) => {
      const next = current.filter((id) => programs[id - 1]?.state !== "empty");
      programs.forEach((status, index) => {
        if (isOwnedState(status.state) && !next.includes(index + 1)) {
          next.push(index + 1);
        }
      });
      next.sort((a, b) => a - b);
      return next.length === current.length && next.every((id, i) => id === current[i])
        ? current
        : next;
    });
  }, [programs]);

  const entries = useMemo(() => {
    const ids = [...tracked];
    if (editorId !== null && editorMinimized && !ids.includes(editorId)) {
      ids.push(editorId);
    }
    return ids.sort((a, b) => a - b);
  }, [editorId, editorMinimized, tracked]);

  const editorVisible = editorId !== null && !editorMinimized;
  if (entries.length === 0 || editorVisible) {
    return null;
  }

  const activeCount = entries.filter((id) => isOwnedState(programs[id - 1].state)).length;

  return (
    <aside
      aria-label="Programações em andamento"
      className="fixed right-4 bottom-4 z-40 w-[350px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[16px] bg-panel-2/95 shadow-[0_18px_50px_rgba(15,23,42,0.22)] ring-1 ring-border backdrop-blur-xl"
    >
      <button
        type="button"
        onClick={() => setCollapsed((value) => !value)}
        aria-expanded={!collapsed}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left hover:bg-foreground/4"
      >
        <span className="text-[11px] tracking-[0.15em] text-muted-foreground uppercase">
          Programações
        </span>
        <span className="rounded-full bg-run/10 px-1.5 py-0.5 font-mono text-[10.5px] text-run ring-1 ring-run/25">
          {activeCount} ativa{activeCount === 1 ? "" : "s"}
        </span>
        <svg
          aria-hidden
          viewBox="0 0 12 8"
          className={`ml-auto h-2 w-3 text-muted-foreground transition-transform ${
            collapsed ? "rotate-180" : ""
          }`}
        >
          <path d="M1 1.5 6 6.5 11 1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
        <span className="sr-only">{collapsed ? "Expandir" : "Recolher"}</span>
      </button>

      {!collapsed ? (
        <ul className="max-h-[50vh] divide-y divide-border overflow-y-auto border-t border-border">
          {entries.map((id) => {
            const pump = pumps.find((item) => item.id === id);
            if (!pump) {
              return null;
            }
            const owned = isOwnedState(programs[id - 1].state);
            const isEditor = editorId === id;
            const program = loadPumpProgram(id);
            return (
              <li key={id} className="px-3.5 py-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="shrink-0 font-mono text-[12px] font-semibold tracking-widest text-foreground">
                    {pump.name}
                  </span>
                  <span
                    className="min-w-0 truncate text-[11px] text-faint"
                    title={program.name}
                  >
                    {isEditor ? `${program.name} · editor minimizado` : program.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpen(id)}
                    className="ml-auto rounded-[7px] bg-foreground/5 px-2 py-1 text-[11px] leading-none font-medium text-foreground ring-1 ring-border hover:bg-foreground/10"
                  >
                    Abrir editor
                  </button>
                  {!owned ? (
                    <button
                      type="button"
                      aria-label={`Dispensar ${pump.name}`}
                      title={isEditor ? "Fechar o editor" : "Dispensar"}
                      onClick={() => {
                        if (isEditor) {
                          onCloseEditor();
                        }
                        setTracked((current) => current.filter((item) => item !== id));
                      }}
                      className="grid size-6 place-items-center rounded-full text-[16px] leading-none text-muted-foreground hover:bg-foreground/8"
                    >
                      ×
                    </button>
                  ) : null}
                </div>
                <ProgramControls
                  pumpId={id}
                  pumpName={pump.name}
                  blocks={program.blocks}
                  layout="mini"
                />
              </li>
            );
          })}
        </ul>
      ) : null}
    </aside>
  );
}
