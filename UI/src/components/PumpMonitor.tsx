import {
  type ChartSeriesId,
  type ChartTimeMode,
  type PumpChartConfig,
} from "../lib/calibration";
import {
  FlowChart,
  SERIES_OPTIONS,
  TIME_MODE_OPTIONS,
  type TelemetrySample,
} from "./FlowChart";

export function PumpMonitor({
  charts,
  samples,
  volume,
  initialVolume,
  signed,
  monitoring,
  onAdd,
  onUpdate,
  onRemove,
  onReset,
}: {
  charts: PumpChartConfig[];
  samples: TelemetrySample[];
  volume: number;
  initialVolume: number;
  signed: boolean;
  monitoring: boolean;
  onAdd: () => void;
  onUpdate: (chart: PumpChartConfig) => void;
  onRemove: (id: string) => void;
  onReset: () => void;
}) {
  return (
    <div className="rounded-[14px] bg-foreground/4 p-4 ring-1 ring-border">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] tracking-[0.15em] text-muted-foreground uppercase">
            Monitoramento
          </p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Adicione gráficos de vazão e do volume acumulado. O registro só
            começa depois do primeiro gráfico.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onAdd}
            disabled={charts.length >= 6}
            className="rounded-[10px] bg-run px-3 py-2 text-[12px] leading-none font-medium text-run-foreground ring-1 ring-run/30 disabled:opacity-40"
          >
            Adicionar gráfico
          </button>
          <button
            type="button"
            onClick={onReset}
            disabled={!monitoring}
            className="rounded-[10px] bg-foreground/5 px-3 py-2 text-[12px] leading-none font-medium ring-1 ring-border disabled:opacity-40"
          >
            {initialVolume !== 0 ? "Reiniciar volume" : "Zerar volume"}
          </button>
        </div>
      </div>

      {monitoring && (
        <p className="mt-3 font-mono text-[12px] text-run">
          Volume {volume.toFixed(2)} mL
          {initialVolume !== 0 ? ` (inicial ${initialVolume} mL)` : ""} · {samples.length}{" "}
          amostras
        </p>
      )}
      <p className="mt-1 text-[11px] text-faint">
        {signed
          ? "Vazão positiva no sentido direto e negativa no reverso; o volume soma e subtrai."
          : "Vazão sempre positiva; o volume acumula nos dois sentidos."}{" "}
        Altere em Configurações.
      </p>

      {charts.length === 0 && (
        <p className="mt-4 rounded-[12px] bg-panel-2 px-3 py-4 text-center text-[12px] text-muted-foreground ring-1 ring-border">
          Nenhum gráfico visível. Toque em adicionar para escolher as curvas.
        </p>
      )}

      <div className="mt-4 space-y-4">
        {charts.map((chart, index) => (
          <article
            key={chart.id}
            className="rounded-[14px] bg-panel/80 p-3 ring-1 ring-border"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[12px] font-semibold">Gráfico {index + 1}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onUpdate({ ...chart, visible: !chart.visible })
                  }
                  className="rounded-[8px] bg-foreground/5 px-2.5 py-1.5 text-[11px] font-medium ring-1 ring-border"
                >
                  {chart.visible ? "Ocultar" : "Exibir"}
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(chart.id)}
                  className="rounded-[8px] bg-off/10 px-2.5 py-1.5 text-[11px] font-medium text-off ring-1 ring-off/30"
                >
                  Remover
                </button>
              </div>
            </div>

            <div className="mb-3 flex flex-wrap gap-4">
              <fieldset className="min-w-0">
                <legend className="text-[10px] tracking-[0.16em] text-faint uppercase">
                  Curvas
                </legend>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {SERIES_OPTIONS.map((option) => {
                    const checked = chart.series.includes(option.id);
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => {
                          const next = toggleSeries(chart.series, option.id);
                          onUpdate({ ...chart, series: next });
                        }}
                        className={`rounded-full px-2.5 py-1 text-[11px] ring-1 ${
                          checked
                            ? "bg-run/12 text-run ring-run/30"
                            : "text-muted-foreground ring-border"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <fieldset className="min-w-0 flex-1">
                <legend className="text-[10px] tracking-[0.16em] text-faint uppercase">
                  Eixo de tempo
                </legend>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {TIME_MODE_OPTIONS.map((option) => {
                    const selected = chart.timeMode === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() =>
                          onUpdate({
                            ...chart,
                            timeMode: option.id as ChartTimeMode,
                          })
                        }
                        className={`rounded-full px-2.5 py-1 text-[11px] ring-1 ${
                          selected
                            ? "bg-foreground text-run-foreground ring-foreground"
                            : "text-muted-foreground ring-border"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            </div>

            {chart.visible ? (
              <FlowChart samples={samples} chart={chart} />
            ) : (
              <p className="rounded-[12px] bg-foreground/4 px-3 py-6 text-center text-[12px] text-muted-foreground">
                Gráfico oculto. As amostras continuam sendo registradas.
              </p>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

function toggleSeries(current: ChartSeriesId[], id: ChartSeriesId): ChartSeriesId[] {
  if (current.includes(id)) {
    const next = current.filter((item) => item !== id);
    return next.length > 0 ? next : current;
  }
  return [...current, id];
}
