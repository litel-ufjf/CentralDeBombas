import { useEffect, useMemo, useState, type ReactNode } from "react";
import { branchesOf, type ExperimentBlock } from "../lib/experiment";
import { compileProgram, formatDuration } from "../lib/programCompiler";
import type { LibraryProgram } from "../lib/storage";

function countBlocks(blocks: ExperimentBlock[]): number {
  return blocks.reduce(
    (total, block) =>
      total + 1 + branchesOf(block).reduce((sum, branch) => sum + countBlocks(branch.blocks), 0),
    0,
  );
}

function describe(item: LibraryProgram) {
  const count = countBlocks(item.blocks);
  const parts = [count === 1 ? "1 bloco" : `${count} blocos`];
  try {
    const seconds = compileProgram(item.blocks).estimatedSeconds;
    if (seconds !== null) {
      parts.push(`≈ ${formatDuration(seconds)}`);
    }
  } catch {
    /* programação incompleta */
  }
  parts.push(
    new Date(item.updatedAt).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
  );
  return parts.join(" · ");
}

function IconButton({
  label,
  danger,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`grid size-7 place-items-center rounded-[6px] text-slate-500 ${
        danger ? "hover:bg-red-50 hover:text-red-600" : "hover:bg-slate-200/70 hover:text-slate-700"
      }`}
    >
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className="size-[15px]"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </svg>
    </button>
  );
}

export function ProgramLibraryDialog({
  library,
  currentDocId,
  blocked,
  onClose,
  onOpen,
  onRename,
  onDelete,
  onNew,
  onOpenFile,
  onSaveCopy,
}: {
  library: LibraryProgram[];
  currentDocId: string | null;
  blocked: boolean;
  onClose: () => void;
  onOpen: (item: LibraryProgram) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (item: LibraryProgram) => void;
  onNew: () => void;
  onOpenFile: () => void;
  onSaveCopy: () => void;
}) {
  const [query, setQuery] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !blocked) {
        event.stopPropagation();
        if (renaming) {
          setRenaming(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [blocked, onClose, renaming]);

  const items = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR");
    return library
      .filter((item) => !term || item.name.toLocaleLowerCase("pt-BR").includes(term))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [library, query]);

  const commitRename = () => {
    if (renaming) {
      const name = renaming.name.trim();
      if (name) {
        onRename(renaming.id, name);
      }
      setRenaming(null);
    }
  };

  const actionClass =
    "rounded-[5px] px-3 py-1.5 text-[12.5px] font-medium text-[#166993] ring-1 ring-[#c9dbe8] hover:bg-[#e8f1f7]";

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center p-6">
      <button
        type="button"
        aria-label="Fechar biblioteca"
        className="absolute inset-0 bg-slate-900/25"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-label="Biblioteca de programações"
        className="relative flex max-h-full w-full max-w-[560px] flex-col overflow-hidden rounded-[10px] bg-white shadow-[0_18px_50px_rgba(15,23,42,0.25)] ring-1 ring-black/5"
      >
        <div className="flex items-start gap-3 px-5 pt-4 pb-3">
          <div className="min-w-0">
            <h3 className="text-[16px] font-semibold text-[#141b21]">Abrir programação</h3>
            <p className="mt-0.5 text-[12px] text-slate-500">
              Programações salvas nesta aplicação. As alterações em uma programação aberta são
              salvas nela automaticamente.
            </p>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="ml-auto grid size-6 shrink-0 place-items-center rounded-full text-[18px] leading-none text-slate-500 hover:bg-slate-100"
          >
            ×
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-y border-[#e2e8ef] bg-[#f6f9fc] px-5 py-2.5">
          <button type="button" onClick={onNew} className={actionClass}>
            Nova programação
          </button>
          <button type="button" onClick={onOpenFile} className={actionClass}>
            Abrir arquivo…
          </button>
          <button type="button" onClick={onSaveCopy} className={actionClass}>
            Salvar cópia da atual
          </button>
          {library.length > 5 ? (
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar"
              aria-label="Buscar programação"
              className="ml-auto w-36 rounded-[5px] bg-white px-2.5 py-1.5 text-[12.5px] ring-1 ring-[#d5e0ea] outline-none focus:ring-[#166993]"
            />
          ) : null}
        </div>

        <ul className="bk-scroll min-h-[120px] flex-1 overflow-y-auto py-1">
          {items.length === 0 ? (
            <li className="px-5 py-8 text-center text-[13px] text-slate-400">
              {library.length === 0
                ? "Nenhuma programação na biblioteca. Use “Salvar” para guardar a programação atual."
                : "Nenhuma programação encontrada."}
            </li>
          ) : (
            items.map((item) => {
              const current = item.id === currentDocId;
              const editing = renaming?.id === item.id;
              return (
                <li
                  key={item.id}
                  className={`group flex items-center gap-3 px-5 py-2.5 ${
                    current ? "bg-[#eef5fa]" : "hover:bg-slate-50"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    {editing ? (
                      <input
                        autoFocus
                        value={renaming.name}
                        maxLength={80}
                        aria-label="Novo nome"
                        onChange={(event) =>
                          setRenaming({ id: item.id, name: event.target.value })
                        }
                        onBlur={commitRename}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            commitRename();
                          }
                        }}
                        className="w-full rounded-[4px] px-1.5 py-0.5 text-[13.5px] font-medium text-[#141b21] ring-1 ring-[#166993] outline-none"
                      />
                    ) : (
                      <p className="flex items-center gap-2 truncate text-[13.5px] font-medium text-[#141b21]">
                        <span className="truncate">{item.name}</span>
                        {current ? (
                          <span className="shrink-0 rounded-full bg-[#166993]/10 px-1.5 py-px text-[10.5px] font-medium text-[#166993]">
                            aberta
                          </span>
                        ) : null}
                      </p>
                    )}
                    <p className="mt-0.5 truncate text-[11.5px] text-slate-500">{describe(item)}</p>
                  </div>
                  <IconButton
                    label="Renomear"
                    onClick={() => setRenaming({ id: item.id, name: item.name })}
                  >
                    <path d="M10.5 2.5l3 3L6 13H3v-3z" />
                  </IconButton>
                  <IconButton label="Excluir" danger onClick={() => onDelete(item)}>
                    <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" />
                  </IconButton>
                  <button
                    type="button"
                    disabled={current}
                    onClick={() => onOpen(item)}
                    className="rounded-[5px] bg-[#166993] px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-[#12597d] disabled:bg-slate-300"
                  >
                    Abrir
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}
