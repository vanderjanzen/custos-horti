"use client";

import { useMemo, useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Area, AreaChart, CartesianGrid, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useThemeColors } from "@/hooks/useThemeColors";
import type { Phase } from "@/lib/phases";
import { vpd } from "@/lib/vpd";
import type { Point } from "./ClimateChart";

function fmtTick(iso: string, range: string) {
  const d = new Date(iso);
  if (range === "1h" || range === "6h" || range === "24h")
    return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

/** VPD-Verlauf mit Zielbereich der aktuellen Grow-Phase */
export default function VpdPanel({ data, range, phase }: { data: Point[]; range: string; phase: Phase | null }) {
  const c = useThemeColors();
  const root = useRef<HTMLElement>(null);

  const points = useMemo(
    () =>
      data
        .filter((d) => d.temperature != null && d.humidity != null)
        .map((d) => ({ t: d.t, vpd: Math.round(vpd(d.temperature!, d.humidity!) * 100) / 100 })),
    [data],
  );

  // Weich aufklappen
  useGSAP(
    () => {
      gsap.from(root.current, {
        height: 0,
        opacity: 0,
        y: -10,
        duration: 0.7,
        ease: "expo.out",
        clearProps: "height,opacity,transform",
      });
    },
    { scope: root },
  );

  const inRange = phase
    ? points.filter((p) => p.vpd >= phase.vpd[0] && p.vpd <= phase.vpd[1]).length / Math.max(points.length, 1)
    : null;

  return (
    <section className="panel glass vpd-panel" ref={root}>
      <div className="panel-head">
        <div>
          <h2 className="panel-title">VPD-Verlauf</h2>
          <div className="chart-legend" style={{ marginTop: 8 }}>
            <span style={{ "--c": "var(--vpd)" } as React.CSSProperties}>
              <i /> VPD kPa
            </span>
            {phase && (
              <span style={{ "--c": "var(--accent)" } as React.CSSProperties}>
                <i style={{ opacity: 0.5 }} /> Ziel {phase.name} ({phase.vpd[0].toFixed(1)}–{phase.vpd[1].toFixed(1)})
              </span>
            )}
          </div>
        </div>
        {inRange != null && points.length > 0 && (
          <div className="vpd-score">
            <span className="mono">{Math.round(inRange * 100)} %</span>
            <span className="eyebrow">im Zielbereich</span>
          </div>
        )}
      </div>

      {!c || points.length === 0 ? (
        <div className="empty">Keine Daten in diesem Zeitraum.</div>
      ) : (
        <div className="chart-wrap" style={{ height: "min(36vh, 320px)" }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 10, right: 24, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="fillVpd" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={c["--vpd"]} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={c["--vpd"]} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={c["--chart-grid"]} vertical={false} />
              {phase && (
                <ReferenceArea
                  y1={phase.vpd[0]}
                  y2={phase.vpd[1]}
                  fill={c["--accent"]}
                  fillOpacity={0.08}
                  stroke={c["--accent"]}
                  strokeOpacity={0.35}
                  strokeDasharray="4 4"
                />
              )}
              <XAxis
                dataKey="t"
                tickFormatter={(v) => fmtTick(v, range)}
                axisLine={false}
                tickLine={false}
                minTickGap={48}
                tickMargin={10}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                width={44}
                domain={[0, (max: number) => Math.max(2, Math.ceil(max * 4) / 4)]}
                tickFormatter={(v: number) => v.toFixed(1)}
              />
              <Tooltip
                cursor={{ stroke: c["--chart-cursor"], strokeDasharray: "3 4" }}
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <div className="chart-tooltip">
                      <div style={{ color: "var(--text-dim)" }}>
                        {new Date(String(label)).toLocaleString("de-DE", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                      <div className="row">
                        <span>VPD</span>
                        <span style={{ color: "var(--vpd)" }}>{Number(payload[0].value).toFixed(2)} kPa</span>
                      </div>
                    </div>
                  ) : null
                }
              />
              <Area
                className="area-v"
                type="monotone"
                dataKey="vpd"
                stroke={c["--vpd"]}
                strokeWidth={3}
                fill="url(#fillVpd)"
                dot={false}
                activeDot={{ r: 5, fill: c["--vpd"], stroke: c["--bg"], strokeWidth: 2 }}
                isAnimationActive={points.length < 1500}
                animationDuration={1200}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
