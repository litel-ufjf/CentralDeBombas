import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useBench } from "../context/BenchContext";
import logo from "../assets/logo.png";

export function StatusStrip() {
  const { connected, portLabel } = useBench();
  const [clock, setClock] = useState("--:--:--");

  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      );
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center justify-between px-5 pt-3 pb-2">
      <div className="flex min-w-0 items-center gap-2">
        <img
          src={logo}
          alt=""
          className="size-5 shrink-0 rounded-[6px] ring-1 ring-border"
        />
        <span
          className={
            connected
              ? "lamp-run size-1.5 shrink-0 rounded-full bg-run"
              : "size-1.5 shrink-0 rounded-full bg-off/80"
          }
        />
        <span className="truncate text-[11px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
          Litel · UFJF ·{" "}
          {connected ? `Online · ${portLabel}` : "Desconectada"}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <Link
          to="/configuracoes"
          className="text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase"
        >
          Configurações
        </Link>
        <span className="font-mono text-[11px] tracking-wider text-faint">
          {clock}
        </span>
      </div>
    </div>
  );
}
