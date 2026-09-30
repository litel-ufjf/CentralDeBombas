import { sanitizeProgram, type ExperimentBlock } from "./experiment";

export const PROGRAM_FILE_FORMAT = "painel-bombas/programacao";

export class ProgramFileError extends Error {}

export type ProgramFile = { name: string; blocks: ExperimentBlock[] };

export function serializeProgram(name: string, blocks: ExperimentBlock[]) {
  return JSON.stringify(
    {
      format: PROGRAM_FILE_FORMAT,
      version: 1,
      name,
      savedAt: new Date().toISOString(),
      blocks,
    },
    null,
    2,
  );
}

export function parseProgram(content: string, fallbackName: string): ProgramFile {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    throw new ProgramFileError("O arquivo não é um JSON válido.");
  }
  if (Array.isArray(data)) {
    return { name: fallbackName, blocks: sanitizeProgram(data) };
  }
  if (!data || typeof data !== "object") {
    throw new ProgramFileError("Arquivo de programação não reconhecido.");
  }
  const raw = data as { format?: unknown; name?: unknown; blocks?: unknown };
  if (raw.format !== undefined && raw.format !== PROGRAM_FILE_FORMAT) {
    throw new ProgramFileError("Arquivo de programação não reconhecido.");
  }
  if (!Array.isArray(raw.blocks)) {
    throw new ProgramFileError("O arquivo não contém blocos de programação.");
  }
  const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 80) : "";
  return { name: name || fallbackName, blocks: sanitizeProgram(raw.blocks) };
}

function safeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|]+/g, "-").trim() || "programacao";
}

export async function exportProgramFile(name: string, blocks: ExperimentBlock[]) {
  const content = serializeProgram(name, blocks);
  const files = window.bomba?.files;
  if (files) {
    return files.saveProgram(safeFileName(name), content);
  }
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeFileName(name)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return link.download;
}

function pickBrowserFile(): Promise<{ name: string; content: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      file
        .text()
        .then((content) => resolve({ name: file.name.replace(/\.[^.]+$/, ""), content }))
        .catch(() => resolve(null));
    });
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}

export async function openProgramFile(): Promise<ProgramFile | null> {
  const files = window.bomba?.files;
  const picked = files ? await files.openProgram() : await pickBrowserFile();
  if (!picked) {
    return null;
  }
  return parseProgram(picked.content, picked.name);
}
