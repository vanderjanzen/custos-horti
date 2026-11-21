// Entscheidungs-Feed des Luefters: erklaert in Klartext, warum der Luefter gerade so laeuft.
import type { ModuleConfig } from "./modules";
import { CURVE_LABELS, CURVE_SHAPES, MODULES } from "./modules";

export type FanDetail = { t?: number; h?: number; v?: number; x?: number; sp?: number; pv?: number; p?: number; i?: number; d?: number };
export type FanTune = { state: "run" | "done" | "fail"; cycles?: number; elapsed?: number; kp?: number; ti?: number; td?: number; ku?: number; tu?: number; msg?: string };
export type FanState = { detail?: FanDetail; tune?: FanTune };

export type FanEvent = { id: string; kind: string; speed: number | null; reason: string | null; message: string; created_at: string };

const nf = (v: number, d = 1) => v.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: d });
const pct = (v: number) => `${nf(v, 0)} %`;
const shapeName = (s: unknown) => CURVE_LABELS[CURVE_SHAPES.indexOf(String(s))] ?? "Linear";
const SRC_NAME: Record<string, string> = { temp: "Temperatur", hum: "Luftfeuchte", vpd: "VPD" };

export function srcValue(src: string, v: number) {
  return src === "temp" ? `${nf(v)} °C` : src === "hum" ? `${nf(v)} %` : `${nf(v, 2)} kPa`;
}

/** Ein Satz, der die aktuelle Entscheidung beschreibt */
export function describeDecision(
  cfg: ModuleConfig,
  reason: string,
  target: number,
  detail: FanDetail,
  temperature: number | null,
  humidity: number | null,
  vpd: number | null,
): string {
  if (reason === "manual") return `Manuell auf ${pct(target)} gestellt.`;
  if (reason === "tune") return `Auto-Tune: Relais auf ${pct(target)} – ${SRC_NAME[String(cfg.pid_src)] ?? ""} ${
    detail.pv != null ? srcValue(String(cfg.pid_src), detail.pv) : ""
  } bei Ziel ${detail.sp != null ? srcValue(String(cfg.pid_src), detail.sp) : "–"}.`;
  if (reason === "pid") {
    const src = String(cfg.pid_src);
    const pv = detail.pv != null ? srcValue(src, detail.pv) : "–";
    const sp = detail.sp != null ? srcValue(src, detail.sp) : "–";
    const dir =
      detail.pv != null && detail.sp != null
        ? Math.abs(detail.pv - detail.sp) < (src === "vpd" ? 0.02 : 0.3)
          ? "liegt am Ziel"
          : (src === "vpd" ? detail.pv < detail.sp : detail.pv > detail.sp)
            ? src === "vpd" ? "zu niedrig – mehr Abluft" : "zu hoch – mehr Abluft"
            : src === "vpd" ? "zu hoch – weniger Abluft" : "zu niedrig – weniger Abluft"
        : "";
    return `PID: ${SRC_NAME[src]} ${pv} (Ziel ${sp}) ${dir} → ${pct(target)} · P ${nf(detail.p ?? 0)} · I ${nf(detail.i ?? 0)} · D ${nf(detail.d ?? 0)}`;
  }
  if (reason === "idle") {
    const parts: string[] = [];
    if (cfg.use_temp && temperature != null) parts.push(`Temperatur ${nf(temperature)} °C < ${nf(Number(cfg.t_min))} °C`);
    if (cfg.use_vpd && vpd != null) parts.push(`VPD ${nf(vpd, 2)} kPa ≥ Ziel ${nf(Number(cfg.vpd_min), 2)}`);
    else if (cfg.use_hum && humidity != null) parts.push(`Feuchte ${nf(humidity, 0)} % < ${nf(Number(cfg.h_min), 0)} %`);
    return `Kein Bedarf${parts.length ? ` (${parts.join(", ")})` : ""} → Leerlauf ${pct(target)}.`;
  }
  const x = detail.x != null ? ` – ${nf(detail.x * 100, 0)} % des Bereichs` : "";
  const others: string[] = [];
  if (reason !== "temp" && detail.t != null && detail.t >= 0) others.push(`Temperatur will ${pct(detail.t)}`);
  if (reason !== "hum" && detail.h != null && detail.h >= 0) others.push(`Feuchte will ${pct(detail.h)}`);
  if (reason !== "vpd" && detail.v != null && detail.v >= 0) others.push(`VPD will ${pct(detail.v)}`);
  const rest = others.length ? ` (${others.join(", ")})` : "";
  if (reason === "temp")
    return `Temperatur ${temperature != null ? nf(temperature) : "–"} °C → ${pct(target)} · ${shapeName(cfg.t_shape)} ${nf(Number(cfg.t_min))}–${nf(Number(cfg.t_max))} °C${x}${rest}`;
  if (reason === "hum")
    return `Luftfeuchte ${humidity != null ? nf(humidity, 0) : "–"} % → ${pct(target)} · ${shapeName(cfg.h_shape)} ${nf(Number(cfg.h_min), 0)}–${nf(Number(cfg.h_max), 0)} %${x}${rest}`;
  if (reason === "vpd")
    return `VPD ${vpd != null ? nf(vpd, 2) : "–"} kPa unter Ziel ${nf(Number(cfg.vpd_min), 2)} (zu feucht) → ${pct(target)} · ${shapeName(cfg.v_shape)}${x}${rest}`;
  return `Lüfter auf ${pct(target)}.`;
}

export function describeTune(t: FanTune): string {
  if (t.state === "fail") return `Auto-Tune abgebrochen: ${t.msg ?? "unbekannter Fehler"}.`;
  const min = t.elapsed ? Math.round(t.elapsed / 60) : 0;
  return `Auto-Tune fertig nach ${t.cycles ?? 0} Schwingungen (${min} min): Ku ${nf(t.ku ?? 0, 2)} · Tu ${nf((t.tu ?? 0) / 60)} min → Kp ${nf(t.kp ?? 0, 2)} · Ti ${t.ti} s · Td ${t.td} s übernommen.`;
}

const FAN = MODULES.find((m) => m.type === "fan")!;
const LABEL: Record<string, string> = {
  mode: "Modus", pct: "Leistung", ramp: "Rampe", use_temp: "Temperatur-Kurve", t_min: "Temp. Start", t_max: "Temp. Vollgas",
  t_shape: "Temp.-Kurve", t_ease: "Temp.-Stärke", t_pts: "eigene Temp.-Kurve", use_hum: "Feuchte-Kurve", h_min: "Feuchte Start",
  h_max: "Feuchte Vollgas", h_shape: "Feuchte-Kurve", h_ease: "Feuchte-Stärke", h_pts: "eigene Feuchte-Kurve",
  use_vpd: "VPD-Optimierung", vpd_span: "VPD-Bereich", v_shape: "VPD-Kurve", v_ease: "VPD-Stärke", v_pts: "eigene VPD-Kurve",
  min_pct: "Start-%", max_pct: "Max-%", idle_pct: "Leerlauf-%", pid_src: "Regelgröße", pid_t: "Ziel-Temperatur",
  pid_h: "Ziel-Feuchte", kp: "Kp", ti: "Ti", td: "Td", tune: "Auto-Tune",
};

function fmtVal(key: string, v: unknown): string {
  const p = FAN.params.find((x) => x.key === key);
  if (typeof v === "boolean") return v ? "an" : "aus";
  if (Array.isArray(v)) return `${v.length / 2} Punkte`;
  if (p?.type === "select") return p.labels?.[p.options.indexOf(String(v))] ?? String(v);
  if (typeof v === "number") return `${nf(v, 2)}${p && "unit" in p && p.unit ? ` ${p.unit}` : ""}`;
  return String(v);
}

/** Kurze Zusammenfassung, was sich an der Luefter-Config geaendert hat */
export function describeConfigChange(before: ModuleConfig | undefined, after: ModuleConfig): string | null {
  if (!before) return "Lüfter-Einstellungen angelegt.";
  const changes: string[] = [];
  for (const key of Object.keys(LABEL)) {
    const a = before[key];
    const b = after[key];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    if (key === "tune") {
      if (b) changes.push("Auto-Tune gestartet");
      else changes.push("Auto-Tune beendet");
      continue;
    }
    changes.push(Array.isArray(b) ? `${LABEL[key]} geändert` : `${LABEL[key]} ${fmtVal(key, a)} → ${fmtVal(key, b)}`);
  }
  if (!changes.length) return null;
  const shown = changes.slice(0, 4).join(" · ");
  return `Einstellungen: ${shown}${changes.length > 4 ? ` · +${changes.length - 4} weitere` : ""}`;
}
