import { formatCLPShort } from "@/lib/analytics";

/** Barras horizontales con etiqueta y valor. */
export function HBarChart({
  data,
  unit = "",
  color = "#006CFF",
}: {
  data: { label: string; value: number; color?: string; sub?: string }[];
  unit?: string;
  color?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-2.5">
      {data.map((d) => (
        <div key={d.label}>
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span className="text-white/70">{d.label}</span>
            <span className="text-white/50">
              {d.value.toLocaleString("es-CL")}
              {unit}
              {d.sub ? ` · ${d.sub}` : ""}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/8">
            <div
              className="h-full rounded-full"
              style={{ width: `${(d.value / max) * 100}%`, background: d.color ?? color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Dona (distribución de segmentos). */
export function Donut({
  data,
  size = 180,
}: {
  data: { name: string; count: number; color: string }[];
  size?: number;
}) {
  const total = data.reduce((a, d) => a + d.count, 0) || 1;
  const r = size / 2;
  const stroke = size * 0.16;
  const radius = r - stroke / 2;
  const circ = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        <g transform={`rotate(-90 ${r} ${r})`}>
          {data.map((d) => {
            const frac = d.count / total;
            const dash = frac * circ;
            const el = (
              <circle
                key={d.name}
                cx={r}
                cy={r}
                r={radius}
                fill="none"
                stroke={d.color}
                strokeWidth={stroke}
                strokeDasharray={`${dash} ${circ - dash}`}
                strokeDashoffset={-offset}
              />
            );
            offset += dash;
            return el;
          })}
        </g>
        <text x={r} y={r - 4} textAnchor="middle" className="fill-white" fontSize={size * 0.16} fontWeight="700">
          {total}
        </text>
        <text x={r} y={r + 16} textAnchor="middle" fill="rgba(255,255,255,0.45)" fontSize={size * 0.075}>
          leads
        </text>
      </svg>
      <ul className="space-y-1.5 text-xs">
        {data.map((d) => (
          <li key={d.name} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
            <span className="text-white/70">{d.name}</span>
            <span className="text-white/40">{Math.round((d.count / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Línea de ingresos con proyección punteada. */
export function LineForecast({
  months,
  forecast,
}: {
  months: { label: string; revenue: number }[];
  forecast: { label: string; revenue: number }[];
}) {
  const w = 560;
  const h = 220;
  const pad = 32;
  const all = [...months.map((m) => m.revenue), ...forecast.map((f) => f.revenue)];
  const max = Math.max(...all, 1) * 1.15;
  const pts = all.map((v, i) => {
    const step = (w - pad * 2) / (all.length - 1);
    return [pad + i * step, h - pad - (v / max) * (h - pad * 2)];
  });
  const histCount = months.length;
  const histLine = pts.slice(0, histCount).map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`).join(" ");
  const foreLine = pts.slice(histCount - 1).map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`).join(" ");
  const area = `${histLine} L${pts[histCount - 1][0]},${h - pad} L${pts[0][0]},${h - pad} Z`;
  const labels = [...months.map((m) => m.label), ...forecast.map((f) => f.label)];

  return (
    <svg viewBox={`0 0 ${w} ${h + 18}`} className="w-full">
      <defs>
        <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#006CFF" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#006CFF" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#revGrad)" />
      <path d={histLine} fill="none" stroke="#006CFF" strokeWidth="2.5" />
      <path d={foreLine} fill="none" stroke="#49A7FF" strokeWidth="2.5" strokeDasharray="5 5" />
      {pts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r="3" fill={i >= histCount ? "#49A7FF" : "#2D8CFF"} />
      ))}
      {labels.map((l, i) => (
        <text key={i} x={pts[i][0]} y={h - 6} fill="rgba(255,255,255,0.4)" fontSize="10" textAnchor="middle">
          {l}
          {i >= histCount ? " *" : ""}
        </text>
      ))}
    </svg>
  );
}

/** Embudo de conversión vertical. */
export function Funnel({
  stages,
}: {
  stages: { label: string; value: number; pct: number; dropFromPrev: number }[];
}) {
  return (
    <div className="space-y-1.5">
      {stages.map((s, i) => (
        <div key={s.label} className="relative">
          <div
            className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm"
            style={{
              width: `${Math.max(s.pct, 12)}%`,
              minWidth: "auto",
              background: `linear-gradient(90deg, rgba(0,108,255,${0.85 - i * 0.13}), rgba(45,140,255,${0.55 - i * 0.09}))`,
            }}
          >
            <span className="whitespace-nowrap font-medium text-white">{s.label}</span>
          </div>
          <div className="absolute right-0 top-1/2 flex -translate-y-1/2 items-center gap-3 text-xs">
            <span className="font-semibold text-white">{s.value.toLocaleString("es-CL")}</span>
            <span className="text-white/40">{s.pct}%</span>
            {i > 0 && (
              <span className={s.dropFromPrev >= 50 ? "text-emerald-400" : "text-amber-400"}>
                ↳ {s.dropFromPrev}%
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Tarjeta KPI compacta. */
export function KpiCard({
  icon,
  value,
  label,
  trend,
  accent = "#006CFF",
}: {
  icon: string;
  value: string;
  label: string;
  trend?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-ink-800/60 p-4">
      <div className="flex items-center justify-between">
        <span
          className="grid h-9 w-9 place-items-center rounded-lg text-base"
          style={{ background: `${accent}22`, color: accent }}
        >
          {icon}
        </span>
        {trend && <span className="text-xs text-emerald-400">{trend}</span>}
      </div>
      <p className="mt-2.5 text-xl font-bold">{value}</p>
      <p className="text-xs text-white/50">{label}</p>
    </div>
  );
}

export { formatCLPShort };
