"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useThemeColors } from "@/hooks/useThemeColors";

export type Point = { t: string; temperature: number | null; humidity: number | null };


function fmtTick(iso: string, range: string) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  if (range === "1h" || range === "6h" || range === "24h") return time;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { payload: Point }[]; label?: string }) {
  if (!active || !payload?.length || !label) return null;
  const p = payload[0].payload;
  const d = new Date(label);
  return (
    <div className="chart-tooltip">
      <div style={{ color: "var(--text-dim)" }}>
        {d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}{" "}
        {d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
      </div>
      <div className="row">
        <span>Temperatur</span>
        <span className="t">{p.temperature?.toFixed(1) ?? "–"} °C</span>
      </div>
      <div className="row">
        <span>Luftfeuchte</span>
        <span className="h">{p.humidity?.toFixed(0) ?? "–"} %</span>
      </div>
    </div>
  );
}

export default function ClimateChart({ data, range }: { data: Point[]; range: string }) {
  const c = useThemeColors();
  if (!c) return <div className="chart-wrap" />;
  const TEMP = c["--temp"];
  const HUM = c["--hum"];
  if (data.length === 0) {
    return <div className="empty">Keine Daten in diesem Zeitraum.</div>;
  }
  // Bei vielen Punkten Animation aus -> fluessig auch bei 30 Tagen Rohdaten
  const animate = data.length < 1500;

  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="fillTemp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={TEMP} stopOpacity={0.32} />
              <stop offset="100%" stopColor={TEMP} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="fillHum" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={HUM} stopOpacity={0.26} />
              <stop offset="100%" stopColor={HUM} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={c["--chart-grid"]} vertical={false} />
          <XAxis
            dataKey="t"
            tickFormatter={(v) => fmtTick(v, range)}
            axisLine={false}
            tickLine={false}
            minTickGap={48}
            tickMargin={10}
          />
          <YAxis yAxisId="t" axisLine={false} tickLine={false} width={44} unit="°" allowDecimals={false} domain={[(min: number) => Math.floor(min - 0.5), (max: number) => Math.ceil(max + 0.5)]} />
          <YAxis yAxisId="h" orientation="right" axisLine={false} tickLine={false} width={44} unit="%" domain={[0, 100]} />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: c["--chart-cursor"], strokeDasharray: "3 4" }} />
          <Area
            className="area-h"
            yAxisId="h"
            type="monotone"
            dataKey="humidity"
            stroke={HUM}
            strokeWidth={3}
            fill="url(#fillHum)"
            dot={false}
            activeDot={{ r: 5, fill: HUM, stroke: c["--bg"], strokeWidth: 2 }}
            connectNulls
            isAnimationActive={animate}
            animationDuration={1200}
            animationEasing="ease-out"
          />
          <Area
            className="area-t"
            yAxisId="t"
            type="monotone"
            dataKey="temperature"
            stroke={TEMP}
            strokeWidth={3}
            fill="url(#fillTemp)"
            dot={false}
            activeDot={{ r: 5, fill: TEMP, stroke: c["--bg"], strokeWidth: 2 }}
            connectNulls
            isAnimationActive={animate}
            animationDuration={1200}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
