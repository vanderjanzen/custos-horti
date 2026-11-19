"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import type { LogEntry } from "@/app/api/log/route";
import { useDevices } from "@/hooks/useDevices";
import { deviceLabel, fmtDate, fmtTime } from "@/lib/format";

const PAGE = 50;

export default function LogsView() {
  const { devices } = useDevices();
  const [device, setDevice] = useState("");
  const [items, setItems] = useState<LogEntry[] | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const seen = useRef(new Set<string>());

  const query = useCallback(
    async (extra: Record<string, string> = {}) => {
      const q = new URLSearchParams({ limit: String(PAGE), ...extra });
      if (device) q.set("device", device);
      const r = await fetch(`/api/log?${q}`, { cache: "no-store" });
      return r.ok ? ((await r.json()) as LogEntry[]) : [];
    },
    [device],
  );

  // Erstes Laden + bei Filterwechsel
  useEffect(() => {
    seen.current.clear();
    setItems(null);
    query().then((rows) => {
      setItems(rows);
      setHasMore(rows.length === PAGE);
    });
  }, [query]);

  // Neue Eintraege alle 15 s oben einfuegen
  useEffect(() => {
    const t = setInterval(async () => {
      const rows = await query();
      setItems((prev) => {
        if (!prev) return rows;
        const top = prev[0] ? BigInt(prev[0].id) : 0n;
        const fresh = rows.filter((r) => BigInt(r.id) > top);
        return fresh.length ? [...fresh, ...prev] : prev;
      });
    }, 15_000);
    return () => clearInterval(t);
  }, [query]);

  async function loadMore() {
    if (!items?.length) return;
    setLoading(true);
    const rows = await query({ before: items[items.length - 1].id });
    setItems([...items, ...rows]);
    setHasMore(rows.length === PAGE);
    setLoading(false);
  }

  // Nur neu hinzugekommene Zeilen einblenden
  useGSAP(
    () => {
      const fresh = gsap.utils
        .toArray<HTMLElement>(".log-item")
        .filter((el) => !seen.current.has(el.dataset.id!));
      fresh.forEach((el) => seen.current.add(el.dataset.id!));
      if (!fresh.length) return;
      gsap.from(fresh.slice(0, 40), {
        opacity: 0,
        y: 10,
        duration: 0.6,
        ease: "expo.out",
        stagger: 0.015,
        clearProps: "transform,opacity",
      });
    },
    { scope: listRef, dependencies: [items] },
  );

  return (
    <>
      <div className="page-head reveal">
        <div>
          <div className="eyebrow">Daten</div>
          <h1 className="page-title">Logs</h1>
          <p className="page-sub">Alle Messwerte, neueste zuerst · aktualisiert sich automatisch</p>
        </div>
        <div className="controls">
          <select className="select" value={device} onChange={(e) => setDevice(e.target.value)}>
            <option value="">Alle Sensoren</option>
            {devices?.map((d) => (
              <option key={d.id} value={d.id}>
                {deviceLabel(d)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <section className="panel glass reveal">
        {items === null ? (
          <div className="empty">Lade…</div>
        ) : items.length === 0 ? (
          <div className="empty">Noch keine Messwerte vorhanden.</div>
        ) : (
          <>
            <div className="log-head eyebrow">
              <span>Zeit</span>
              <span>Sensor</span>
              <span style={{ textAlign: "right" }}>Temp.</span>
              <span style={{ textAlign: "right" }}>Feuchte</span>
            </div>
            <div className="log-list" ref={listRef}>
              {items.map((e) => (
                <div className="log-item" key={e.id} data-id={e.id}>
                  <span className="log-time">
                    {fmtTime(e.created_at)}
                    <small>{fmtDate(e.created_at)}</small>
                  </span>
                  <span className="log-device">{deviceLabel({ id: e.device_id, name: e.device_name })}</span>
                  <span className="log-val t">{e.temperature?.toFixed(1) ?? "–"} °C</span>
                  <span className="log-val h">{e.humidity?.toFixed(0) ?? "–"} %</span>
                </div>
              ))}
            </div>
            {hasMore && (
              <div className="log-more">
                <button className="btn" onClick={loadMore} disabled={loading}>
                  {loading ? "Lade…" : "Ältere laden"}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
