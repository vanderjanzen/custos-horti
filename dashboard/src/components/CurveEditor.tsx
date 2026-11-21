"use client";

import { useMemo, useRef, useState } from "react";
import { curveAt, sampleToPts, type CurveDef, type Pt, type Shape } from "@/lib/fanCurve";

const W = 560;
const H = 250;
const PAD = { l: 38, r: 14, t: 14, b: 30 };
const X0 = -0.22; // links vom Start: Leerlauf-Bereich
const X1 = 1.12; // rechts von Vollgas
const MAX_PTS = 8;

const sx = (x: number) => PAD.l + ((x - X0) / (X1 - X0)) * (W - PAD.l - PAD.r);
const sy = (y: number) => PAD.t + (1 - y / 100) * (H - PAD.t - PAD.b);

type Props = {
  curve: CurveDef;
  idle: number;
  color: string;
  /** Beschriftung fuer x (0 = Start, 1 = Vollgas) */
  tick: (x: number) => string;
  live?: { x: number; label: string } | null;
  readOnly?: boolean;
  onChange: (c: { shape: Shape; pts: Pt[] }) => void;
};

/** Kurven-Editor wie die Gradationskurve in Photoshop: Punkte ziehen, Doppelklick fuegt hinzu/entfernt */
export default function CurveEditor({ curve, idle, color, tick, live, readOnly, onChange }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const custom = curve.shape === "custom";
  // Bei Presets Griffe aus der Kurve ableiten – wer zieht, macht daraus eine eigene Kurve
  const pts = custom && curve.pts.length >= 2 ? curve.pts : sampleToPts(curve);

  const path = useMemo(() => {
    const seg: string[] = [];
    seg.push(`M${sx(X0)},${sy(idle)} L${sx(0) - 0.01},${sy(idle)}`);
    for (let i = 0; i <= 120; i++) {
      const x = i / 120;
      seg.push(`L${sx(x).toFixed(1)},${sy(curveAt(curve, x)).toFixed(1)}`);
    }
    seg.push(`L${sx(X1)},${sy(curveAt(curve, 1))}`);
    return seg.join(" ");
  }, [curve, idle]);
  const area = `${path} L${sx(X1)},${sy(0)} L${sx(X0)},${sy(0)} Z`;

  function toLocal(e: React.PointerEvent | React.MouseEvent): Pt | null {
    const el = svg.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const py = ((e.clientY - r.top) / r.height) * H;
    const x = X0 + ((px - PAD.l) / (W - PAD.l - PAD.r)) * (X1 - X0);
    const y = (1 - (py - PAD.t) / (H - PAD.t - PAD.b)) * 100;
    return [x, Math.min(Math.max(y, 0), 100)];
  }

  function move(e: React.PointerEvent) {
    if (drag === null || readOnly) return;
    const p = toLocal(e);
    if (!p) return;
    const next = pts.map((q) => [...q] as Pt);
    const last = next.length - 1;
    let x = p[0];
    if (drag === 0) x = 0;
    else if (drag === last) x = 1;
    else x = Math.min(Math.max(x, next[drag - 1][0] + 0.03), next[drag + 1][0] - 0.03);
    next[drag] = [Math.round(x * 1000) / 1000, Math.round(p[1] * 10) / 10];
    onChange({ shape: "custom", pts: next });
  }

  function addPoint(e: React.MouseEvent) {
    if (readOnly || pts.length >= MAX_PTS) return;
    const p = toLocal(e);
    if (!p || p[0] <= 0.03 || p[0] >= 0.97) return;
    if (pts.some((q) => Math.abs(q[0] - p[0]) < 0.04)) return;
    const next = [...pts, [Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 10) / 10] as Pt].sort((a, b) => a[0] - b[0]);
    onChange({ shape: "custom", pts: next });
  }

  function removePoint(i: number) {
    if (readOnly || i === 0 || i === pts.length - 1) return;
    onChange({ shape: "custom", pts: pts.filter((_, j) => j !== i) });
  }

  const liveY = live ? (live.x < 0 ? idle : curveAt(curve, Math.min(live.x, 1))) : null;
  const liveX = live ? Math.min(Math.max(live.x, X0 + 0.02), X1 - 0.02) : 0;
  const gid = `curve-${color.replace(/[^a-z]/gi, "")}`;

  return (
    <div className={`curve ${readOnly ? "is-readonly" : ""}`} style={{ "--c": color } as React.CSSProperties}>
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        onPointerMove={move}
        onPointerUp={() => setDrag(null)}
        onPointerLeave={() => setDrag(null)}
        onDoubleClick={addPoint}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>

        {/* Leerlauf-Bereich unter der Startschwelle */}
        <rect className="curve-idle" x={sx(X0)} y={PAD.t} width={sx(0) - sx(X0)} height={H - PAD.t - PAD.b} />
        <text className="curve-note" x={(sx(X0) + sx(0)) / 2} y={PAD.t + 14} textAnchor="middle">
          Leerlauf
        </text>

        {[0, 25, 50, 75, 100].map((y) => (
          <g key={y}>
            <line className="curve-grid" x1={PAD.l} x2={W - PAD.r} y1={sy(y)} y2={sy(y)} />
            <text className="curve-tick" x={PAD.l - 8} y={sy(y) + 4} textAnchor="end">
              {y}
            </text>
          </g>
        ))}
        {[0, 0.25, 0.5, 0.75, 1].map((x) => (
          <g key={x}>
            <line className={`curve-grid ${x === 0 || x === 1 ? "is-edge" : ""}`} x1={sx(x)} x2={sx(x)} y1={PAD.t} y2={H - PAD.b} />
            <text className="curve-tick" x={sx(x)} y={H - 10} textAnchor="middle">
              {tick(x)}
            </text>
          </g>
        ))}

        <path d={area} fill={`url(#${gid})`} />
        <path className="curve-line" d={path} stroke={color} />

        {live && liveY !== null && (
          <g className="curve-live">
            <line x1={sx(liveX)} x2={sx(liveX)} y1={PAD.t} y2={H - PAD.b} />
            <line x1={PAD.l} x2={sx(liveX)} y1={sy(liveY)} y2={sy(liveY)} />
            <circle className="pulse" cx={sx(liveX)} cy={sy(liveY)} r={10} fill={color} />
            <circle cx={sx(liveX)} cy={sy(liveY)} r={5} fill={color} />
            <text
              x={sx(liveX) + (liveX > 0.75 ? -10 : 10)}
              y={Math.max(sy(liveY) - 10, PAD.t + 12)}
              textAnchor={liveX > 0.75 ? "end" : "start"}
            >
              {live.label} → {Math.round(liveY)} %
            </text>
          </g>
        )}

        {!readOnly &&
          pts.map(([x, y], i) => (
            <circle
              key={i}
              className={`curve-handle ${custom ? "" : "is-ghost"} ${drag === i ? "is-drag" : ""}`}
              cx={sx(x)}
              cy={sy(y)}
              r={drag === i ? 8 : 6.5}
              onPointerDown={(e) => {
                (e.target as Element).setPointerCapture?.(e.pointerId);
                setDrag(i);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                removePoint(i);
              }}
            >
              <title>{`${tick(x)} → ${Math.round(y)} %`}</title>
            </circle>
          ))}
      </svg>
      {!readOnly && (
        <p className="hint curve-help">
          Punkte ziehen · Doppelklick auf die Fläche fügt einen Punkt hinzu, auf einen Punkt entfernt ihn
          {custom ? "" : " · Ziehen macht aus dem Preset eine eigene Kurve"}
        </p>
      )}
    </div>
  );
}
