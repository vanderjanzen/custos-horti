"use client";

import { useEffect, useMemo, useState } from "react";
import { useDevices, useNow } from "@/hooks/useDevices";
import { ago, deviceLabel, isOnline } from "@/lib/format";
import Segmented from "./Segmented";
import ClimateChart, { type Point } from "./ClimateChart";
import CountUp from "./CountUp";

const RANGES = ["1h", "6h", "24h", "7d", "30d"] as const;
type Range = (typeof RANGES)[number];

const RESOLUTIONS = [
  { value: "auto", label: "Auflösung: Auto" },
  { value: "raw", label: "Rohdaten (30 s)" },
  { value: "1m", label: "1 Minute" },
  { value: "5m", label: "5 Minuten" },
  { value: "15m", label: "15 Minuten" },
  { value: "1h", label: "1 Stunde" },
];

/** Dampfdruckdefizit (VPD) in kPa aus Lufttemperatur und rel. Feuchte */
function vpd(t: number, rh: number) {
  const svp = 0.6108 * Math.exp((17.27 * t) / (t + 237.3));
  return svp * (1 - rh / 100);
}

function minMax(data: Point[], key: "temperature" | "humidity") {
  const v = data.map((d) => d[key]).filter((x): x is number => x != null);
  return v.length ? { min: Math.min(...v), max: Math.max(...v) } : null;
}

export default function DashboardView() {
  const { devices, error } = useDevices();
  const now = useNow(5000);
  const [selected, setSelected] = useState<string | null>(null);
  const [range, setRange] = useState<Range>("24h");
  const [res, setRes] = useState("auto");
  const [data, setData] = useState<Point[]>([]);

  const device = devices?.find((d) => d.id === selected) ?? devices?.[0];

  useEffect(() => {
    if (!device) return;
    let cancelled = false;
    const load = async () => {
      const q = new URLSearchParams({ device: device.id, range });
      if (res !== "auto") q.set("res", res);
      const r = await fetch(`/api/readings?${q}`, { cache: "no-store" });
      if (r.ok && !cancelled) setData(await r.json());
    };
    load();
    const t = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [device?.id, range, res]); // eslint-disable-line react-hooks/exhaustive-deps

  const tStats = useMemo(() => minMax(data, "temperature"), [data]);
  const hStats = useMemo(() => minMax(data, "humidity"), [data]);

  if (error) return <div className="glass empty error reveal">Keine Verbindung zur Datenbank: {error}</div>;
  if (!devices) return <div className="glass empty">Lade…</div>;
  if (!device)
    return (
      <>
        <PageHead />
        <div className="glass empty reveal">
          Noch keine Sensoren. Sobald ein ESP Daten an <code>/api/readings</code> schickt, taucht er hier auf.
        </div>
      </>
    );

  const online = isOnline(device.last_seen, now);
  const v = device.temperature != null && device.humidity != null ? vpd(device.temperature, device.humidity) : null;

  return (
    <>
      <PageHead>
        {devices.length > 1 && (
          <select className="select" value={device.id} onChange={(e) => setSelected(e.target.value)}>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {deviceLabel(d)}
              </option>
            ))}
          </select>
        )}
      </PageHead>

      <div className="stats">
        <div className="stat temp glass float reveal">
          <div className="stat-label eyebrow">Temperatur</div>
          <div className="stat-value">
            <CountUp value={device.temperature} decimals={1} />
            <small>°C</small>
          </div>
          <div className="stat-meta">
            {tStats ? `${tStats.min.toFixed(1)}° – ${tStats.max.toFixed(1)}° in ${range}` : "–"}
          </div>
        </div>

        <div className="stat hum glass float reveal">
          <div className="stat-label eyebrow">Luftfeuchte</div>
          <div className="stat-value">
            <CountUp value={device.humidity} decimals={0} />
            <small>%</small>
          </div>
          <div className="stat-meta">
            {hStats ? `${hStats.min.toFixed(0)} – ${hStats.max.toFixed(0)} % in ${range}` : "–"}
          </div>
        </div>

        <div className="stat vpd glass float reveal">
          <div className="stat-label eyebrow">VPD</div>
          <div className="stat-value">
            <CountUp value={v} decimals={2} />
            <small>kPa</small>
          </div>
          <div className="stat-meta">Dampfdruckdefizit der Luft</div>
        </div>

        <div className={`stat glass float reveal ${online ? "live" : ""}`}>
          <div className="stat-label eyebrow">
            <i className={`dot ${online ? "is-live" : ""}`} /> Sensor
          </div>
          <div className="stat-value is-text">{online ? "Live" : "Offline"}</div>
          <div className="stat-meta">
            {deviceLabel(device)} · {ago(device.last_seen, now)}
          </div>
        </div>
      </div>

      <section className="panel glass reveal">
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Klimaverlauf</h2>
            <div className="chart-legend" style={{ marginTop: 8 }}>
              <span style={{ "--c": "var(--temp)" } as React.CSSProperties}>
                <i /> Temperatur °C
              </span>
              <span style={{ "--c": "var(--hum)" } as React.CSSProperties}>
                <i /> Luftfeuchte %
              </span>
            </div>
          </div>
          <div className="controls">
            <Segmented options={RANGES.map((r) => ({ value: r, label: r }))} value={range} onChange={setRange} />
            <select className="select" value={res} onChange={(e) => setRes(e.target.value)}>
              {RESOLUTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <a
              className="btn btn-ghost"
              href={`/api/readings?device=${encodeURIComponent(device.id)}&range=${range}${res !== "auto" ? `&res=${res}` : ""}&format=csv`}
            >
              CSV ↓
            </a>
          </div>
        </div>
        <ClimateChart data={data} range={range} />
      </section>
    </>
  );
}

function PageHead({ children }: { children?: React.ReactNode }) {
  return (
    <div className="page-head reveal">
      <div>
        <div className="eyebrow">Übersicht</div>
        <h1 className="page-title">Dashboard</h1>
        <p className="page-sub">Live-Klima deiner Growbox</p>
      </div>
      {children && <div className="controls">{children}</div>}
    </div>
  );
}
