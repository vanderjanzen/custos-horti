"use client";

import { useEffect, useMemo, useState } from "react";
import type { DeviceSummary } from "@/app/api/devices/route";
import { CURVE_LABELS, CURVE_SHAPES, MODULES, defaultConfig, sanitizeModules, stageFor, type ConfigValue, type ModuleConfig } from "@/lib/modules";
import { ease, flatPts, toPts, type CurveDef, type Shape } from "@/lib/fanCurve";
import type { FanTune } from "@/lib/fanEvents";
import { vpd as calcVpd } from "@/lib/vpd";
import Segmented from "./Segmented";
import ParamField from "./ParamField";
import CurveEditor from "./CurveEditor";
import FanFeed from "./FanFeed";
import { useRole } from "@/hooks/useRole";
import { usePhase } from "@/hooks/usePhase";

const FAN = MODULES.find((m) => m.type === "fan")!;
type Mode = "manual" | "auto" | "pid";
type Src = "temp" | "hum" | "vpd";

/** Empfohlene Startwerte, wenn die Regelgroesse gewechselt wird (Auto-Tune findet bessere) */
const PID_DEFAULTS: Record<Src, { kp: number; ti: number; td: number }> = {
  temp: { kp: 10, ti: 900, td: 0 },
  hum: { kp: 4, ti: 600, td: 0 },
  vpd: { kp: 60, ti: 600, td: 0 },
};
const REASON_TEXT: Record<string, string> = {
  temp: "Temperatur",
  hum: "Luftfeuchte",
  vpd: "VPD zu niedrig",
  idle: "kein Bedarf",
  manual: "manuell",
  pid: "PID-Regler",
  tune: "Auto-Tune läuft",
};
const nf = (v: number, d = 1) => v.toLocaleString("de-DE", { maximumFractionDigits: d });

/** Luefter-Steuerung: stufenlos manuell, Kurven-Automatik oder PID. Der ESP uebernimmt die Config mit der naechsten Messung. */
export default function FanControl({ device, onSaved }: { device: DeviceSummary; onSaved: () => void }) {
  const found = device.config?.modules.find((m) => m.type === "fan");
  // Aeltere Configs (Stufen) auf Prozent umrechnen und mit Standardwerten auffuellen
  const saved = useMemo(
    () => (found ? (sanitizeModules([{ ...defaultConfig(FAN), ...found }])[0] ?? { ...defaultConfig(FAN), ...found }) : undefined),
    [JSON.stringify(found)], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [cfg, setCfg] = useState<ModuleConfig | null>(saved ?? null);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [src, setSrc] = useState<Src>("temp");
  const [feedKey, setFeedKey] = useState(0);
  const { isGuest } = useRole();
  const { phase } = usePhase();

  useEffect(() => {
    setCfg(saved ?? null);
    setState("idle");
  }, [device.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-Tune fertig -> neue Werte vom Server ins Formular holen
  useEffect(() => {
    if (saved && cfg && cfg.tune && !saved.tune) setCfg({ ...cfg, tune: false, kp: saved.kp, ti: saved.ti, td: saved.td });
  }, [saved?.tune]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!saved || !cfg) return null;

  const n = (k: string) => Number(cfg[k]);
  const b = (k: string) => Boolean(cfg[k]);
  const mode: Mode = cfg.mode === "manual" ? "manual" : cfg.mode === "pid" ? "pid" : "auto";
  const dirty = JSON.stringify(cfg) !== JSON.stringify(saved);

  const set = (patch: Record<string, ConfigValue>) => {
    setCfg({ ...cfg, ...patch });
    setState("idle");
  };

  async function save(next: ModuleConfig = cfg!) {
    if (!device.config) return;
    setState("saving");
    const modules = device.config.modules.map((m) => (m.type === "fan" ? next : m));
    await fetch(`/api/devices/${device.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: { interval: device.config.interval, modules } }),
    });
    setState("saved");
    setFeedKey((k) => k + 1);
    onSaved();
  }

  const param = (key: string) => FAN.params.find((p) => p.key === key)!;
  const field = (key: string, label?: string) => (
    <ParamField key={key} param={param(key)} label={label} value={cfg[key]} onChange={(v) => set({ [key]: v })} />
  );

  // Live-Werte
  const speed = device.fan_speed;
  const target = device.fan_target;
  const detail = device.fan_state?.detail ?? {};
  const tune = device.fan_state?.tune ?? null;
  const T = device.temperature;
  const RH = device.humidity;
  const V = T != null && RH != null ? calcVpd(T, RH) : null;
  const vpdFromPhase = b("vpd_phase");
  const vpdMin = vpdFromPhase && phase ? phase.vpd[0] : n("vpd_min");
  const vpdMax = vpdFromPhase && phase ? phase.vpd[1] : n("vpd_max");

  return (
    <section className={`panel glass reveal fan ${isGuest ? "is-readonly" : ""}`}>
      <div className="panel-head">
        <div className="fan-head">
          <h2 className="panel-title">Lüfter</h2>
          <div className="fan-gauge" title="Aktuell / Ziel">
            <span className="fan-gauge-value">
              {speed != null ? `${nf(speed, 0)}` : "–"}
              <small>%</small>
            </span>
            <span className="fan-gauge-bar">
              <i style={{ width: `${speed ?? 0}%` }} />
              {target != null && <b style={{ left: `${target}%` }} />}
            </span>
            <span className="page-sub">
              {target != null && speed != null && Math.abs(target - speed) >= 1 ? `→ ${nf(target, 0)} % · ` : ""}
              {device.fan_reason ? REASON_TEXT[device.fan_reason] ?? device.fan_reason : "warte auf Daten"}
              {speed != null && ` · ≈ Stufe ${stageFor(speed)}`}
            </span>
          </div>
        </div>
        {isGuest ? (
          <span className="tag">nur Ansicht</span>
        ) : (
          <Segmented
            value={mode}
            onChange={(v) => set({ mode: v })}
            options={[
              { value: "manual", label: "Manuell" },
              { value: "auto", label: "Kurven" },
              { value: "pid", label: "PID" },
            ]}
          />
        )}
      </div>

      <div className="fan-layout">
        <div className="fan-main">
          {mode === "manual" && <Manual cfg={cfg} set={set} field={field} readOnly={isGuest} />}
          {mode === "auto" && (
            <Auto
              cfg={cfg}
              set={set}
              field={field}
              src={src}
              setSrc={setSrc}
              readOnly={isGuest}
              live={{ T, RH, V, detail }}
              vpd={{ min: vpdMin, max: vpdMax, fromPhase: vpdFromPhase, phaseName: phase?.name }}
            />
          )}
          {mode === "pid" && (
            <Pid
              cfg={cfg}
              set={set}
              field={field}
              readOnly={isGuest}
              live={{ T, RH, V, detail, reason: device.fan_reason, mode: device.fan_mode }}
              tune={tune}
              vpd={{ min: vpdMin, max: vpdMax, fromPhase: vpdFromPhase, phaseName: phase?.name }}
              startTune={() => {
                const next = { ...cfg, mode: "pid", tune: true };
                setCfg(next);
                save(next);
              }}
              stopTune={() => {
                const next = { ...cfg, tune: false };
                setCfg(next);
                save(next);
              }}
            />
          )}

          <div className="fan-common">
            {mode !== "manual" && (
              <div className="fan-fields three">
                {field("min_pct", "Start")}
                {field("max_pct", "Maximal")}
                {mode === "auto" ? field("idle_pct", "Leerlauf") : <span />}
              </div>
            )}
            <label className="field fan-ramp">
              <span className="eyebrow">Weichheit · Rampe {n("ramp") > 0 ? `${nf(n("ramp"))} %/s` : "aus (sofort)"}</span>
              <input
                type="range"
                min={0}
                max={30}
                step={0.5}
                value={n("ramp")}
                disabled={isGuest}
                onChange={(e) => set({ ramp: Number(e.target.value) })}
                style={{ "--p": `${(n("ramp") / 30) * 100}%` } as React.CSSProperties}
              />
              <span className="hint">
                {n("ramp") > 0
                  ? `Von 0 auf 100 % in ${nf(100 / n("ramp"), 0)} s – keine Sprünge, leiser Lauf.`
                  : "Der Lüfter springt sofort auf den neuen Wert."}
              </span>
            </label>
          </div>

          {!isGuest && (
            <div className="wizard-actions" style={{ marginTop: 18 }}>
              <span className="hint">
                {dirty ? "Ungespeicherte Änderungen · " : ""}Der ESP übernimmt die Einstellung mit der nächsten Messung.
              </span>
              <button className="btn btn-primary" onClick={() => save()} disabled={state === "saving" || (!dirty && state !== "idle")}>
                {state === "saving" ? "Speichere…" : state === "saved" && !dirty ? "Gespeichert ✓" : "Übernehmen"}
              </button>
            </div>
          )}
        </div>

        <FanFeed deviceId={device.id} refreshKey={feedKey} />
      </div>
    </section>
  );
}

type Setter = (patch: Record<string, ConfigValue>) => void;
type FieldFn = (key: string, label?: string) => React.ReactNode;
type VpdInfo = { min: number; max: number; fromPhase: boolean; phaseName?: string };

/* --- Manuell ------------------------------------------------------------ */

function Manual({ cfg, set, field, readOnly }: { cfg: ModuleConfig; set: Setter; field: FieldFn; readOnly: boolean }) {
  const pct = Number(cfg.pct);
  const start = Number(cfg.min_pct);
  return (
    <div className="fan-manual">
      <div className="fan-big">
        <strong>{Math.round(pct)}</strong>
        <small>%</small>
        <span className="hint">≈ VEVOR-Stufe {stageFor(pct)}</span>
      </div>
      <div className="fan-slider">
        <div className="fan-zone" style={{ width: `calc(11px + (100% - 22px) * ${start / 100})` }} title="Darunter läuft der Lüfter evtl. nicht an" />
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={pct}
          disabled={readOnly}
          onChange={(e) => set({ pct: Number(e.target.value) })}
          style={{ "--p": `calc(11px + (100% - 22px) * ${pct / 100})` } as React.CSSProperties}
        />
        <div className="fan-steps">
          {Array.from({ length: 11 }, (_, i) => (
            <span key={i} className={Math.round(pct / 10) === i ? "is-active" : ""} style={{ "--i": i } as React.CSSProperties}>
              {i * 10}
            </span>
          ))}
        </div>
      </div>
      <div className="fan-fields three">
        {field("pct", "Genau")}
        {field("min_pct", "Anlaufgrenze")}
        <span />
      </div>
      <p className="hint">
        Stufenlos von 0 bis 100 %. Unterhalb der Anlaufgrenze (schraffiert) dreht der Motor evtl. nicht mehr sicher an – den
        Wert kannst du testen, indem du langsam herunterziehst, bis er stehen bleibt.
      </p>
    </div>
  );
}

/* --- Kurven-Automatik --------------------------------------------------- */

function Auto({
  cfg,
  set,
  field,
  src,
  setSrc,
  readOnly,
  live,
  vpd,
}: {
  cfg: ModuleConfig;
  set: Setter;
  field: FieldFn;
  src: Src;
  setSrc: (s: Src) => void;
  readOnly: boolean;
  live: { T: number | null; RH: number | null; V: number | null; detail: { t?: number; h?: number; v?: number } };
  vpd: VpdInfo;
}) {
  const useVpd = Boolean(cfg.use_vpd);
  const p = src === "temp" ? "t" : src === "hum" ? "h" : "v";
  const enabledKey = src === "temp" ? "use_temp" : src === "hum" ? "use_hum" : "use_vpd";
  const on = Boolean(cfg[enabledKey]) && !(src === "hum" && useVpd);
  const shape = String(cfg[`${p}_shape`]) as Shape;
  const curve: CurveDef = {
    shape,
    ease: Number(cfg[`${p}_ease`]),
    pts: toPts(cfg[`${p}_pts`]),
    min: Number(cfg.min_pct),
    max: Number(cfg.max_pct),
  };
  const lo = src === "temp" ? Number(cfg.t_min) : src === "hum" ? Number(cfg.h_min) : 0;
  const hi = src === "temp" ? Number(cfg.t_max) : src === "hum" ? Number(cfg.h_max) : Number(cfg.vpd_span);
  const value = src === "temp" ? live.T : src === "hum" ? live.RH : live.V;
  const liveX =
    value == null ? null : src === "vpd" ? (vpd.min - value) / Math.max(hi, 0.01) : (value - lo) / Math.max(hi - lo, 0.01);
  const tick = (x: number) =>
    src === "temp" ? `${nf(lo + x * (hi - lo))}°` : src === "hum" ? `${nf(lo + x * (hi - lo), 0)} %` : nf(vpd.min - x * hi, 2);
  const label = value == null ? "" : src === "temp" ? `${nf(value)} °C` : src === "hum" ? `${nf(value, 0)} %` : `${nf(value, 2)} kPa`;
  const color = src === "temp" ? "var(--temp)" : src === "hum" ? "var(--hum)" : "var(--vpd)";

  const chip = (s: Src, name: string, key: string, demand?: number, disabled?: boolean) => (
    <button
      key={s}
      type="button"
      className={`fan-chip ${src === s ? "is-active" : ""} ${cfg[key] && !disabled ? "is-on" : ""} fan-chip-${s}`}
      onClick={() => setSrc(s)}
    >
      <input
        type="checkbox"
        checked={Boolean(cfg[key])}
        disabled={readOnly}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => set({ [key]: e.target.checked })}
      />
      <span>{name}</span>
      <em>{disabled ? "durch VPD ersetzt" : demand != null && demand >= 0 ? `${Math.round(demand)} %` : "–"}</em>
    </button>
  );

  return (
    <div className="fan-auto3">
      <div className="fan-chips">
        {chip("temp", "Temperatur", "use_temp", live.detail.t)}
        {chip("hum", "Luftfeuchte", "use_hum", live.detail.h, useVpd)}
        {chip("vpd", "VPD", "use_vpd", live.detail.v)}
      </div>

      <div className={`fan-editor ${on ? "" : "is-off"}`}>
        <div className="fan-editor-controls">
          {src === "vpd" ? (
            <>
              <div className="fan-sub">{field("vpd_phase", vpd.phaseName ? `Ziel aus Grow-Phase (${vpd.phaseName})` : undefined)}</div>
              {vpd.fromPhase ? (
                <div className="vpd-target">
                  <span className="eyebrow">Ziel</span>
                  <strong>
                    {nf(vpd.min, 2)}–{nf(vpd.max, 2)} kPa
                  </strong>
                </div>
              ) : (
                <>
                  {field("vpd_min", "Ziel min.")}
                  {field("vpd_max", "Ziel max.")}
                </>
              )}
              {field("vpd_span", "Regelbereich")}
            </>
          ) : (
            <>
              {field(`${p}_min`, "Start")}
              {field(`${p}_max`, "Vollgas")}
            </>
          )}
        </div>

        <div className="fan-shape">
          <span className="eyebrow">Verlauf</span>
          <Segmented
            value={shape}
            onChange={(v) => {
              if (readOnly) return;
              // Beim Wechsel auf "Eigene" mit der aktuellen Kurve als Startpunkt beginnen
              if (v === "custom" && shape !== "custom") {
                const pts = [0, 0.33, 0.66, 1].map((x) => [x, Math.round((curve.min + (curve.max - curve.min) * ease(shape, x, curve.ease)) * 10) / 10] as [number, number]);
                set({ [`${p}_shape`]: v, [`${p}_pts`]: flatPts(pts) });
              } else set({ [`${p}_shape`]: v });
            }}
            options={CURVE_SHAPES.map((s, i) => ({ value: s as Shape, label: <ShapeIcon shape={s as Shape} title={CURVE_LABELS[i]} /> }))}
          />
          {shape !== "custom" && shape !== "linear" && (
            <label className="field fan-ease">
              <span className="eyebrow">Stärke {nf(Number(cfg[`${p}_ease`]))}</span>
              <input
                type="range"
                min={1}
                max={5}
                step={0.1}
                value={Number(cfg[`${p}_ease`])}
                disabled={readOnly}
                onChange={(e) => set({ [`${p}_ease`]: Number(e.target.value) })}
                style={{ "--p": `${((Number(cfg[`${p}_ease`]) - 1) / 4) * 100}%` } as React.CSSProperties}
              />
            </label>
          )}
          <span className="hint">{SHAPE_HINT[shape]}</span>
        </div>

        <CurveEditor
          curve={curve}
          idle={Number(cfg.idle_pct)}
          color={color}
          tick={tick}
          readOnly={readOnly || !on}
          live={liveX != null ? { x: liveX, label } : null}
          onChange={({ shape: s, pts }) => set({ [`${p}_shape`]: s, [`${p}_pts`]: flatPts(pts) })}
        />
      </div>

      <p className="hint">
        Jede aktive Kurve rechnet ihren eigenen Wert – es gilt der höchste. Unter der Startschwelle läuft der Lüfter auf
        Leerlauf ({Math.round(Number(cfg.idle_pct))} %).
        {useVpd && " Der Lüfter kann den VPD nur anheben (entfeuchten); ist es zu trocken, bleibt er im Leerlauf."}
      </p>
    </div>
  );
}

const SHAPE_HINT: Record<Shape, string> = {
  linear: "Gleichmäßig von Start bis Vollgas.",
  in: "Ease-in: anfangs sanft, kurz vor Vollgas kräftig – leise im Normalbetrieb.",
  out: "Ease-out: reagiert sofort kräftig, oben sanft – gut gegen schnelle Hitze.",
  inout: "S-Kurve: sanfter Einstieg und sanftes Ende, dazwischen zügig.",
  custom: "Eigene Kurve – frei wie die Gradationskurve in Photoshop.",
};

function ShapeIcon({ shape, title }: { shape: Shape; title: string }) {
  const d: Record<Shape, string> = {
    linear: "M2 14 L18 2",
    in: "M2 14 C12 14 16 10 18 2",
    out: "M2 14 C4 6 8 2 18 2",
    inout: "M2 14 C10 14 10 2 18 2",
    custom: "M2 14 C5 8 8 12 11 7 S16 4 18 2",
  };
  return (
    <span className="shape-icon" title={title}>
      <svg viewBox="0 0 20 16" width="20" height="16">
        <path d={d[shape]} />
      </svg>
      <span>{title}</span>
    </span>
  );
}

/* --- PID ---------------------------------------------------------------- */

function Pid({
  cfg,
  set,
  field,
  readOnly,
  live,
  tune,
  vpd,
  startTune,
  stopTune,
}: {
  cfg: ModuleConfig;
  set: Setter;
  field: FieldFn;
  readOnly: boolean;
  live: {
    T: number | null;
    RH: number | null;
    V: number | null;
    detail: { sp?: number; pv?: number; p?: number; i?: number; d?: number };
    reason: string | null;
    mode: string | null;
  };
  tune: FanTune | null;
  vpd: VpdInfo;
  startTune: () => void;
  stopTune: () => void;
}) {
  const src = (String(cfg.pid_src) as Src) || "hum";
  const unit = src === "temp" ? "°C" : src === "hum" ? "%" : "kPa";
  const digits = src === "vpd" ? 2 : 1;
  const sp = src === "temp" ? Number(cfg.pid_t) : src === "hum" ? Number(cfg.pid_h) : (vpd.min + vpd.max) / 2;
  const pv = src === "temp" ? live.T : src === "hum" ? live.RH : live.V;
  const running = live.mode === "pid";
  const tuneOn = Boolean(cfg.tune);
  const tuneRunning = tune?.state === "run";
  const err = pv != null ? (src === "vpd" ? sp - pv : pv - sp) : null;
  const d = live.detail;

  const bar = (name: string, v: number | undefined, hint: string) => (
    <div className="pid-bar" title={hint}>
      <span>{name}</span>
      <span className="pid-track">
        <i
          className={(v ?? 0) < 0 ? "is-neg" : ""}
          style={{ left: (v ?? 0) < 0 ? `${50 + Math.max(v ?? 0, -50)}%` : "50%", width: `${Math.min(Math.abs(v ?? 0), 50)}%` }}
        />
      </span>
      <em>{running && v != null ? `${nf(v)} %` : "–"}</em>
    </div>
  );

  return (
    <div className="fan-pid">
      <div className="pid-top">
        <div className="field">
          <span className="eyebrow">Regelgröße</span>
          <Segmented
            value={src}
            onChange={(v) => !readOnly && set({ pid_src: v, ...PID_DEFAULTS[v] })}
            options={[
              { value: "temp", label: "Temperatur" },
              { value: "hum", label: "Feuchte" },
              { value: "vpd", label: "VPD" },
            ]}
          />
        </div>
        {src === "temp" && field("pid_t", "Ziel")}
        {src === "hum" && field("pid_h", "Ziel")}
        {src === "vpd" && (
          <div className="pid-vpd">
            {field("vpd_phase", vpd.phaseName ? `Ziel aus Grow-Phase (${vpd.phaseName})` : undefined)}
            {vpd.fromPhase ? (
              <div className="vpd-target">
                <strong>{nf(sp, 2)} kPa</strong>
              </div>
            ) : (
              <div className="fan-fields">
                {field("vpd_min", "Ziel min.")}
                {field("vpd_max", "Ziel max.")}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="pid-live">
        <div className="pid-readout">
          <span className="eyebrow">Ist</span>
          <strong>{pv != null ? nf(pv, digits) : "–"}</strong>
          <small>{unit}</small>
        </div>
        <div className="pid-readout">
          <span className="eyebrow">Soll</span>
          <strong>{nf(sp, digits)}</strong>
          <small>{unit}</small>
        </div>
        <div className={`pid-readout ${err != null && Math.abs(err) > (src === "vpd" ? 0.05 : 1) ? "is-off" : "is-ok"}`}>
          <span className="eyebrow">Abweichung</span>
          <strong>{err != null ? `${err > 0 ? "+" : ""}${nf(err, digits)}` : "–"}</strong>
          <small>{unit}</small>
        </div>
        <div className="pid-bars">
          {bar("P", d.p, "Proportional: reagiert auf die aktuelle Abweichung")}
          {bar("I", d.i, "Integral: gleicht bleibende Abweichung aus (Grundlast)")}
          {bar("D", d.d, "Differential: bremst, wenn sich der Wert schnell ändert")}
        </div>
      </div>

      <div className="fan-fields three">
        {field("kp", `Kp (% je ${unit})`)}
        {field("ti", "Ti – Nachstellzeit")}
        {field("td", "Td – Vorhaltzeit")}
      </div>

      <div className={`tune-card ${tuneRunning ? "is-running" : ""}`}>
        <div>
          <span className="eyebrow">Auto-Tune</span>
          {tuneRunning ? (
            <>
              <p>
                Ermittelt das Optimum: der Lüfter pendelt zwischen {Math.round(Number(cfg.min_pct))} % und{" "}
                {Math.round(Number(cfg.max_pct))} % und misst, wie träge dein Zelt reagiert.
              </p>
              <div className="tune-progress">
                <i style={{ width: `${Math.min((tune?.cycles ?? 0) / 4, 1) * 100}%` }} />
              </div>
              <span className="hint">
                Schwingung {tune?.cycles ?? 0} / 4 · läuft seit {Math.round((tune?.elapsed ?? 0) / 60)} min (meist 30–90 min)
              </span>
            </>
          ) : tune?.state === "done" ? (
            <p>
              Fertig: Kp {nf(tune.kp ?? 0, 2)} · Ti {tune.ti} s · Td {tune.td} s – übernommen. Zelt-Trägheit (Tu){" "}
              {nf((tune.tu ?? 0) / 60)} min.
            </p>
          ) : tune?.state === "fail" ? (
            <p className="danger">Abgebrochen: {tune.msg}</p>
          ) : tuneOn ? (
            <p>Startet, sobald der ESP die Einstellung übernimmt (nächste Messung).</p>
          ) : (
            <p>
              Findet Kp, Ti und Td automatisch (Relais-Methode, ruhige Tyreus-Luyben-Regeln). Ziel und Grenzen vorher
              einstellen, Zelt geschlossen lassen – Dauer meist 30–90 Minuten.
            </p>
          )}
        </div>
        {!readOnly &&
          (tuneOn || tuneRunning ? (
            <button className="btn btn-ghost" onClick={stopTune}>
              Abbrechen
            </button>
          ) : (
            <button className="btn btn-primary" onClick={startTune}>
              Auto-Tune starten
            </button>
          ))}
      </div>

      <p className="hint">
        Der Regler hält {src === "temp" ? "die Temperatur" : src === "hum" ? "die Luftfeuchte" : "den VPD"} auf dem Ziel und
        nutzt dafür den Bereich Start–Maximal.{" "}
        {src === "vpd"
          ? "Zu feucht (VPD zu niedrig) → mehr Abluft. Höher als das Ziel kann er den VPD nur durch weniger Abluft bringen."
          : "Zu hoch → mehr Abluft. Unter das Niveau der Zuluft kommt er natürlich nicht."}
      </p>
    </div>
  );
}
