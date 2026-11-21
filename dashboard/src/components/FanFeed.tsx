"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import type { FanEvent } from "@/lib/fanEvents";
import Segmented from "./Segmented";

const KIND_LABEL: Record<string, string> = { decision: "Regelung", config: "Einstellung", tune: "Auto-Tune" };
const REASON_CLASS: Record<string, string> = {
  temp: "is-temp", hum: "is-hum", vpd: "is-vpd", pid: "is-pid", tune: "is-pid", manual: "is-manual", idle: "is-idle",
  done: "is-live", fail: "is-danger",
};

function time(iso: string) {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  const t = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  return today ? t : `${d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })} ${t}`;
}

/** Feed wie bei TradingView: warum hat der Luefter das gerade so entschieden? */
export default function FanFeed({ deviceId, refreshKey }: { deviceId: string; refreshKey?: number }) {
  const [events, setEvents] = useState<FanEvent[] | null>(null);
  const [filter, setFilter] = useState<"all" | "decision" | "config">("all");
  const list = useRef<HTMLOListElement>(null);
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    seen.current = new Set();
    setEvents(null);
    const load = async () => {
      const r = await fetch(`/api/fan-events?device=${encodeURIComponent(deviceId)}&limit=80`, { cache: "no-store" });
      if (r.ok && alive) setEvents(await r.json());
    };
    load();
    const t = setInterval(load, 10_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [deviceId, refreshKey]);

  // Neue Eintraege sanft einblenden
  useEffect(() => {
    if (!events || !list.current) return;
    const fresh = events.filter((e) => !seen.current.has(e.id));
    const first = seen.current.size === 0;
    fresh.forEach((e) => seen.current.add(e.id));
    if (first || !fresh.length) return;
    const els = fresh
      .map((e) => list.current!.querySelector(`[data-id="${e.id}"]`))
      .filter((el): el is Element => Boolean(el));
    gsap.fromTo(els, { opacity: 0, y: -8 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.05, ease: "expo.out" });
  }, [events]);

  const shown = events?.filter((e) => filter === "all" || (filter === "config" ? e.kind !== "decision" : e.kind === "decision"));

  return (
    <aside className="fan-feed">
      <div className="fan-feed-head">
        <span className="eyebrow">
          <i className="dot is-live" /> Entscheidungen
        </span>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "Alle" },
            { value: "decision", label: "Regelung" },
            { value: "config", label: "Setup" },
          ]}
        />
      </div>
      {!shown ? (
        <div className="hint">Lade…</div>
      ) : shown.length === 0 ? (
        <div className="hint">Noch keine Einträge. Sobald der ESP mit Firmware 0.7 Daten schickt, erklärt er hier jede Entscheidung.</div>
      ) : (
        <ol ref={list} className="fan-feed-list">
          {shown.map((e) => (
            <li key={e.id} data-id={e.id} className={`fan-feed-item ${REASON_CLASS[e.reason ?? ""] ?? "is-config"}`}>
              <div className="fan-feed-meta">
                <time>{time(e.created_at)}</time>
                <span>{KIND_LABEL[e.kind] ?? e.kind}</span>
                {e.speed != null && <strong>{Math.round(e.speed)} %</strong>}
              </div>
              <p>{e.message}</p>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
