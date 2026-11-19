"use client";

import { useEffect, useState } from "react";
import type { DeviceSummary } from "@/app/api/devices/route";
import { MODULES, type ModuleConfig } from "@/lib/modules";
import Segmented from "./Segmented";
import ParamField from "./ParamField";

const FAN = MODULES.find((m) => m.type === "fan")!;

/** Luefter-Steuerung: Modus, Stufe bzw. Automatik-Grenzen. Wird beim naechsten Messwert vom ESP uebernommen. */
export default function FanControl({ device, onSaved }: { device: DeviceSummary; onSaved: () => void }) {
  const saved = device.config?.modules.find((m) => m.type === "fan") as ModuleConfig | undefined;
  const [cfg, setCfg] = useState<ModuleConfig | null>(saved ?? null);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");

  // Wenn ein anderes Geraet gewaehlt wird, Formular neu fuellen
  useEffect(() => {
    setCfg(saved ?? null);
    setState("idle");
  }, [device.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!saved || !cfg) return null;

  const mode = cfg.mode === "manual" ? "manual" : "auto";
  const set = (key: string, v: string | number) => {
    setCfg({ ...cfg, [key]: v });
    setState("idle");
  };

  async function save() {
    if (!device.config || !cfg) return;
    setState("saving");
    const modules = device.config.modules.map((m) => (m.type === "fan" ? cfg : m));
    await fetch(`/api/devices/${device.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: { interval: device.config.interval, modules } }),
    });
    setState("saved");
    onSaved();
  }

  const autoParams = FAN.params.filter((p) => ["t_min", "t_max", "h_max", "min_speed"].includes(p.key));
  const speed = Number(cfg.speed ?? 5);

  return (
    <section className="panel glass reveal fan">
      <div className="panel-head">
        <div>
          <h2 className="panel-title">Lüfter</h2>
          <p className="page-sub" style={{ marginTop: 4 }}>
            Aktuell{" "}
            <span className="fan-now">
              Stufe {device.fan_speed ?? "–"}
            </span>
            {device.fan_mode && ` · ${device.fan_mode === "auto" ? "Automatik" : "manuell"}`}
          </p>
        </div>
        <Segmented
          value={mode}
          onChange={(v) => set("mode", v)}
          options={[
            { value: "auto", label: "Automatik" },
            { value: "manual", label: "Manuell" },
          ]}
        />
      </div>

      {mode === "manual" ? (
        <div className="fan-slider">
          <input
            type="range"
            min={0}
            max={10}
            step={1}
            value={speed}
            onChange={(e) => set("speed", Number(e.target.value))}
            style={{ "--p": `${speed * 10}%` } as React.CSSProperties}
          />
          <div className="fan-steps">
            {Array.from({ length: 11 }, (_, i) => (
              <span key={i} className={i === speed ? "is-active" : ""}>
                {i}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="fan-auto">
          {autoParams.map((p) => (
            <ParamField key={p.key} param={p} value={cfg[p.key]} onChange={(v) => set(p.key, v)} />
          ))}
          <p className="hint" style={{ gridColumn: "1 / -1" }}>
            Ab {cfg.t_min} °C läuft der Lüfter auf Stufe {cfg.min_speed} und steigt bis {cfg.t_max} °C auf Stufe 10.
            Feuchte ab {Number(cfg.h_max) - 10} % treibt ihn zusätzlich hoch.
          </p>
        </div>
      )}

      <div className="wizard-actions" style={{ marginTop: 18 }}>
        <span className="hint">Der ESP übernimmt die Einstellung mit der nächsten Messung.</span>
        <button className="btn btn-primary" onClick={save} disabled={state === "saving"}>
          {state === "saving" ? "Speichere…" : state === "saved" ? "Gespeichert ✓" : "Übernehmen"}
        </button>
      </div>
    </section>
  );
}
