"use client";

import { useEffect, useState } from "react";
import type { DeviceSummary } from "@/app/api/devices/route";
import { MODULES, defaultConfig, type ModuleConfig } from "@/lib/modules";
import Segmented from "./Segmented";
import ParamField from "./ParamField";
import { useRole } from "@/hooks/useRole";

const FAN = MODULES.find((m) => m.type === "fan")!;

/** Luefter-Steuerung: Modus, Stufe bzw. Automatik-Grenzen. Wird beim naechsten Messwert vom ESP uebernommen. */
export default function FanControl({ device, onSaved }: { device: DeviceSummary; onSaved: () => void }) {
  const found = device.config?.modules.find((m) => m.type === "fan") as ModuleConfig | undefined;
  // Fehlende Felder (aeltere Configs) mit Standardwerten auffuellen
  const saved = found ? ({ ...defaultConfig(FAN), ...found } as ModuleConfig) : undefined;
  const [cfg, setCfg] = useState<ModuleConfig | null>(saved ?? null);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const { isGuest } = useRole();

  // Wenn ein anderes Geraet gewaehlt wird, Formular neu fuellen
  useEffect(() => {
    setCfg(saved ?? null);
    setState("idle");
  }, [device.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!saved || !cfg) return null;

  const mode = cfg.mode === "manual" ? "manual" : "auto";
  const set = (key: string, v: string | number | boolean) => {
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

  const param = (key: string) => FAN.params.find((p) => p.key === key)!;
  const field = (key: string, label?: string) => (
    <ParamField key={key} param={param(key)} label={label} value={cfg[key]} onChange={(v) => set(key, v)} />
  );
  const useTemp = Boolean(cfg.use_temp);
  const useHum = Boolean(cfg.use_hum);
  const reasonText: Record<string, string> = {
    temp: "wegen Temperatur",
    hum: "wegen Feuchte",
    "temp+hum": "wegen Temperatur & Feuchte",
    idle: "kein Bedarf",
  };
  const speed = Number(cfg.speed ?? 5);

  return (
    <section className={`panel glass reveal fan ${isGuest ? "is-readonly" : ""}`}>
      <div className="panel-head">
        <div>
          <h2 className="panel-title">Lüfter</h2>
          <p className="page-sub" style={{ marginTop: 4 }}>
            Aktuell{" "}
            <span className="fan-now">
              Stufe {device.fan_speed ?? "–"}
            </span>
            {device.fan_mode && ` · ${device.fan_mode === "auto" ? "Automatik" : "manuell"}`}
            {device.fan_mode === "auto" && device.fan_reason && ` · ${reasonText[device.fan_reason] ?? ""}`}
          </p>
        </div>
        {isGuest ? (
          <span className="tag">nur Ansicht</span>
        ) : (
        <Segmented
          value={mode}
          onChange={(v) => set("mode", v)}
          options={[
            { value: "auto", label: "Automatik" },
            { value: "manual", label: "Manuell" },
          ]}
        />
        )}
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
            disabled={isGuest}
            style={{ "--p": `calc(11px + (100% - 22px) * ${speed / 10})` } as React.CSSProperties}
          />
          <div className="fan-steps">
            {Array.from({ length: 11 }, (_, i) => (
              <span
                key={i}
                className={i === speed ? "is-active" : ""}
                style={{ "--i": i } as React.CSSProperties}
              >
                {i}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="fan-auto2">
          <div className={`fan-group ${useTemp ? "" : "is-off"}`}>
            {field("use_temp")}
            <div className="fan-fields">
              {field("t_min", "Start")}
              {field("t_max", "Vollgas")}
            </div>
          </div>
          <div className={`fan-group ${useHum ? "" : "is-off"}`}>
            {field("use_hum")}
            <div className="fan-fields">
              {field("h_min", "Start")}
              {field("h_max", "Vollgas")}
            </div>
          </div>
          <div className="fan-group">
            <span className="eyebrow">Stufen</span>
            <div className="fan-fields three">
              {field("min_speed", "Start")}
              {field("max_speed", "Maximal")}
              {field("idle_speed", "Leerlauf")}
            </div>
          </div>
          <p className="hint fan-explain">
            {!useTemp && !useHum
              ? `Keine Regelung aktiv – der Lüfter läuft dauerhaft auf Stufe ${cfg.idle_speed}.`
              : [
                  useTemp &&
                    `ab ${cfg.t_min} °C Stufe ${cfg.min_speed}, bis ${cfg.t_max} °C steigend auf Stufe ${cfg.max_speed}`,
                  useHum &&
                    `ab ${cfg.h_min} % Feuchte Stufe ${cfg.min_speed}, bis ${cfg.h_max} % steigend auf Stufe ${cfg.max_speed}`,
                ]
                  .filter(Boolean)
                  .join(" · ") +
                ` – es gilt jeweils der höhere Wert. Ohne Bedarf: Stufe ${cfg.idle_speed}${
                  Number(cfg.idle_speed) === 0 ? " (aus)" : ""
                }.`}
          </p>
        </div>
      )}

      {!isGuest && (
      <div className="wizard-actions" style={{ marginTop: 18 }}>
        <span className="hint">Der ESP übernimmt die Einstellung mit der nächsten Messung.</span>
        <button className="btn btn-primary" onClick={save} disabled={state === "saving"}>
          {state === "saving" ? "Speichere…" : state === "saved" ? "Gespeichert ✓" : "Übernehmen"}
        </button>
      </div>
      )}
    </section>
  );
}
