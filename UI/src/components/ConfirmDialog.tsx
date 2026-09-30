import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type ConfirmRequest = {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  hideDontAsk?: boolean;
  onConfirm: (dontAskAgain: boolean) => void;
};

export function ConfirmDialog({
  request,
  onCancel,
}: {
  request: ConfirmRequest | null;
  onCancel: () => void;
}) {
  const [dontAsk, setDontAsk] = useState(false);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();
  const textId = useId();

  useEffect(() => {
    if (!request) {
      return;
    }
    setDontAsk(false);
    confirmRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel, request]);

  if (!request) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
      <button
        type="button"
        aria-label="Cancelar"
        className="absolute inset-0 bg-slate-900/40"
        onClick={onCancel}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={textId}
        className="relative w-full max-w-[380px] rounded-[16px] bg-panel-2 p-5 shadow-[0_24px_60px_rgba(15,23,42,0.3)] ring-1 ring-border"
      >
        <h2 id={titleId} className="text-[16px] leading-tight font-semibold text-foreground">
          {request.title}
        </h2>
        <p id={textId} className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          {request.message}
        </p>
        {request.hideDontAsk ? null : (
          <label className="mt-4 flex cursor-pointer items-center gap-2 text-[12px] text-muted-foreground select-none">
            <input
              type="checkbox"
              checked={dontAsk}
              onChange={(event) => setDontAsk(event.target.checked)}
              className="size-3.5 accent-[var(--run)]"
            />
            Não exibir esta mensagem novamente
          </label>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-[10px] bg-foreground/5 px-4 py-2 text-[13px] font-medium text-foreground ring-1 ring-border hover:bg-foreground/10"
          >
            Cancelar
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => request.onConfirm(dontAsk)}
            className={`rounded-[10px] px-4 py-2 text-[13px] font-semibold text-white ${
              request.danger
                ? "bg-[var(--destructive)] hover:brightness-95"
                : "bg-run hover:brightness-95"
            }`}
          >
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
