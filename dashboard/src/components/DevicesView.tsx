"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import gsap from "gsap";
import { Flip } from "gsap/Flip";
import { useGSAP } from "@gsap/react";
import { useDevices, useNow } from "@/hooks/useDevices";
import { ago, deviceLabel, isOnline } from "@/lib/format";
import Segmented from "./Segmented";
import { IconGrid, IconList, IconPlus } from "./Icons";

gsap.registerPlugin(Flip);

type View = "grid" | "list";

export default function DevicesView() {
  const { devices, error, reload } = useDevices(10_000);
  const now = useNow(1000);
  const [view, setView] = useState<View>("grid");
  const root = useRef<HTMLDivElement>(null);
  const flipState = useRef<Flip.FlipState | null>(null);

  function switchView(v: View) {
    if (v === view) return;
    flipState.current = Flip.getState(".device, .device-values, .device-meta", { props: "borderRadius" });
    setView(v);
  }

  // Kachel <-> Liste weich morphen
  useGSAP(
    () => {
      if (!flipState.current) return;
      Flip.from(flipState.current, {
        duration: 0.7,
        ease: "expo.inOut",
        stagger: 0.02,
        nested: true,
        absolute: false,
      });
      flipState.current = null;
    },
    { scope: root, dependencies: [view] },
  );

  // Karten beim ersten Laden einblenden
  const shown = useRef(false);
  useGSAP(
    () => {
      if (shown.current || !devices?.length) return;
      shown.current = true;
      gsap.from(".device", { y: 16, opacity: 0, duration: 0.8, ease: "expo.out", stagger: 0.06, clearProps: "transform,opacity" });
    },
    { scope: root, dependencies: [devices?.length] },
  );

  async function rename(id: string, current: string | null) {
    const name = prompt("Name für diesen Sensor", current ?? "");
    if (name === null) return;
    await fetch(`/api/devices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    reload();
  }

  const online = devices?.filter((d) => isOnline(d.last_seen, now)).length ?? 0;

  return (
    <>
      <div className="page-head reveal">
        <div>
          <div className="eyebrow">Hardware</div>
          <h1 className="page-title">Geräte</h1>
          <p className="page-sub">
            {devices ? `${online} von ${devices.length} gerade live` : "Lade…"}
          </p>
        </div>
        <div className="controls">
          <Segmented
            value={view}
            onChange={switchView}
            options={[
              { value: "grid", label: <IconGrid size={15} />, title: "Kacheln" },
              { value: "list", label: <IconList size={15} />, title: "Liste" },
            ]}
          />
          <Link href="/geraete/neu" className="btn btn-primary">
            <IconPlus size={16} /> Gerät hinzufügen
          </Link>
        </div>
      </div>

      {error && <div className="glass empty error">Fehler: {error}</div>}
      {devices && devices.length === 0 && (
        <div className="glass empty reveal">Noch keine Geräte verbunden.</div>
      )}

      <div ref={root} className={`devices ${view === "grid" ? "is-grid" : "is-list"}`}>
        {devices?.map((d) => {
          const live = isOnline(d.last_seen, now);
          return (
            <article key={d.id} className="device glass float" data-flip-id={d.id}>
              <div className="device-top">
                <i className={`dot ${live ? "is-live" : ""}`} />
                <div style={{ minWidth: 0 }}>
                  <div className="device-name">{deviceLabel(d)}</div>
                  <div className="device-id">{d.id}</div>
                </div>
              </div>

              <div className="device-values" data-flip-id={`${d.id}-v`}>
                <div className="device-value t">
                  {d.temperature?.toFixed(1) ?? "–"}
                  <small> °C</small>
                </div>
                <div className="device-value h">
                  {d.humidity?.toFixed(0) ?? "–"}
                  <small> %</small>
                </div>
              </div>

              <div className="device-meta" data-flip-id={`${d.id}-m`}>
                <span className="status-pill">
                  <i className={`dot ${live ? "is-live" : ""}`} style={{ width: 6, height: 6 }} />
                  {live ? "live" : "offline"}
                </span>
                <span>{ago(d.last_seen, now)}</span>
                {d.rssi != null && <span>{d.rssi} dBm</span>}
                {d.fw && <span>fw {d.fw}</span>}
              </div>

              <div className="device-actions">
                <button className="btn btn-ghost" onClick={() => rename(d.id, d.name)}>
                  umbenennen
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
