// Modul-Katalog fuer das Dashboard. Muss zu firmware/src/modules/registry.h passen.

export type ModuleParam =
  | { key: string; label: string; type: "gpio"; default: number }
  | { key: string; label: string; type: "select"; options: string[]; default: string; labels?: string[] }
  | { key: string; label: string; type: "number"; min: number; max: number; step?: number; unit?: string; default: number }
  | { key: string; label: string; type: "bool"; default: boolean }
  | { key: string; label: string; type: "points"; default: number[] };

/** Werte, die im Einrichtungs-Assistenten nicht gezeigt werden (werden im Dashboard eingestellt) */
export type ParamMeta = { advanced?: boolean };

export type ModuleDef = {
  type: string;
  name: string;
  description: string;
  required?: boolean;
  params: (ModuleParam & ParamMeta)[];
  wiring?: string[];
  /** Alte Configs auf das aktuelle Format bringen */
  migrate?: (raw: Record<string, unknown>) => Record<string, unknown>;
};

export type ConfigValue = string | number | boolean | number[];
export type ModuleConfig = { type: string; [key: string]: ConfigValue };

export const CURVE_SHAPES = ["linear", "in", "out", "inout", "custom"];
export const CURVE_LABELS = ["Linear", "Ease-in", "Ease-out", "S-Kurve", "Eigene"];
const DEFAULT_PTS = [0, 25, 0.5, 60, 1, 100];

/** Tastverhaeltnis der alten VEVOR-Stufen 0–10 in % */
export const STAGE_DUTY = [0, 25, 32, 41, 47, 54, 62, 69, 76, 88, 100];

/** Naechstliegende VEVOR-Stufe zu einem Prozentwert (nur zur Orientierung) */
export function stageFor(pct: number) {
  let best = 0;
  for (let i = 0; i < STAGE_DUTY.length; i++)
    if (Math.abs(STAGE_DUTY[i] - pct) < Math.abs(STAGE_DUTY[best] - pct)) best = i;
  return best;
}

function curveParams(p: string, name: string, lo: [number, number, number, string, number], hi: number) {
  const [min, max, step, unit, def] = lo;
  return [
    { key: `${p}_min`, label: `${name} Start`, type: "number", min, max, step, unit, default: def, advanced: true },
    { key: `${p}_max`, label: `${name} Vollgas`, type: "number", min, max: max + 5, step, unit, default: hi, advanced: true },
    { key: `${p}_shape`, label: "Kurve", type: "select", options: CURVE_SHAPES, labels: CURVE_LABELS, default: "linear", advanced: true },
    { key: `${p}_ease`, label: "Stärke", type: "number", min: 1, max: 5, step: 0.1, default: 2, advanced: true },
    { key: `${p}_pts`, label: "Eigene Kurve", type: "points", default: DEFAULT_PTS, advanced: true },
  ] as (ModuleParam & ParamMeta)[];
}

/** GPIOs, die am ESP32-DevKit gefahrlos als Ein-/Ausgang nutzbar sind */
export const SAFE_GPIOS = [4, 5, 13, 14, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33];

export const MODULES: ModuleDef[] = [
  {
    type: "core",
    name: "Standard",
    description: "WLAN, Online-Status, Signalstärke, Laufzeit, freier Speicher, Updates per WLAN.",
    required: true,
    params: [],
  },
  {
    type: "dht",
    name: "Temperatur & Luftfeuchte",
    description: "DHT22 (AM2302) oder DHT11 – Messung alle X Sekunden.",
    params: [
      { key: "pin", label: "Daten-Pin", type: "gpio", default: 4 },
      { key: "model", label: "Modell", type: "select", options: ["DHT22", "DHT11"], default: "DHT22" },
    ],
    wiring: ["VCC → 3V3", "GND → GND", "DATA → GPIO{pin}"],
  },
  {
    type: "tuya",
    name: "Tuya-Controller (Test)",
    description:
      "Spielt das WLAN-Modul eines Tuya-Geräts (z. B. VEVOR-Lüfter-Controller) und liest dessen Datenpunkte mit. Ausgabe im Serial Monitor.",
    params: [
      { key: "rx", label: "RX (von Controller-TXD)", type: "gpio", default: 16 },
      { key: "tx", label: "TX (zu Controller-RXD)", type: "gpio", default: 17 },
    ],
    wiring: ["Controller TXD → GPIO{rx} (RX2)", "Controller RXD → GPIO{tx} (TX2)", "Controller GND → GND"],
  },
  {
    type: "fan",
    name: "Lüfter (EC/PWM)",
    description:
      "Steuert einen EC-Rohrlüfter (z. B. VEVOR) stufenlos per PWM – manuell, über Kurven nach Temperatur, Feuchte & VPD oder per PID-Regler mit Auto-Tune.",
    params: [
      { key: "pin", label: "PWM-Pin", type: "gpio", default: 25 },
      { key: "mode", label: "Modus", type: "select", options: ["auto", "manual", "pid"], labels: ["Automatik", "Manuell", "PID-Regler"], default: "auto" },
      { key: "pct", label: "Leistung (manuell)", type: "number", min: 0, max: 100, unit: "%", default: 50, advanced: true },
      { key: "ramp", label: "Rampe", type: "number", min: 0, max: 50, step: 0.5, unit: "%/s", default: 10, advanced: true },
      { key: "use_temp", label: "Nach Temperatur", type: "bool", default: true, advanced: true },
      ...curveParams("t", "Temp.", [10, 40, 0.5, "°C", 24], 30),
      { key: "use_hum", label: "Nach Luftfeuchte", type: "bool", default: true, advanced: true },
      ...curveParams("h", "Feuchte", [20, 95, 1, "%", 65], 80),
      { key: "use_vpd", label: "Auf VPD optimieren", type: "bool", default: false, advanced: true },
      { key: "vpd_phase", label: "Ziel aus Grow-Phase", type: "bool", default: true, advanced: true },
      { key: "vpd_min", label: "VPD Ziel min.", type: "number", min: 0.2, max: 2.5, step: 0.05, unit: "kPa", default: 0.8, advanced: true },
      { key: "vpd_max", label: "VPD Ziel max.", type: "number", min: 0.2, max: 2.5, step: 0.05, unit: "kPa", default: 1.2, advanced: true },
      { key: "vpd_span", label: "Regelbereich", type: "number", min: 0.1, max: 1.5, step: 0.05, unit: "kPa", default: 0.4, advanced: true },
      { key: "v_shape", label: "Kurve", type: "select", options: CURVE_SHAPES, labels: CURVE_LABELS, default: "linear", advanced: true },
      { key: "v_ease", label: "Stärke", type: "number", min: 1, max: 5, step: 0.1, default: 2, advanced: true },
      { key: "v_pts", label: "Eigene Kurve", type: "points", default: DEFAULT_PTS, advanced: true },
      { key: "min_pct", label: "Start", type: "number", min: 0, max: 100, unit: "%", default: 25, advanced: true },
      { key: "max_pct", label: "Maximal", type: "number", min: 1, max: 100, unit: "%", default: 100, advanced: true },
      { key: "idle_pct", label: "Leerlauf", type: "number", min: 0, max: 100, unit: "%", default: 0, advanced: true },
      { key: "pid_src", label: "Regelgröße", type: "select", options: ["temp", "hum", "vpd"], labels: ["Temperatur", "Luftfeuchte", "VPD"], default: "hum", advanced: true },
      { key: "pid_t", label: "Ziel", type: "number", min: 15, max: 35, step: 0.5, unit: "°C", default: 25, advanced: true },
      { key: "pid_h", label: "Ziel", type: "number", min: 30, max: 90, step: 1, unit: "%", default: 60, advanced: true },
      { key: "kp", label: "Kp", type: "number", min: 0, max: 500, step: 0.1, default: 4, advanced: true },
      { key: "ti", label: "Ti", type: "number", min: 0, max: 20000, step: 10, unit: "s", default: 600, advanced: true },
      { key: "td", label: "Td", type: "number", min: 0, max: 3000, step: 5, unit: "s", default: 0, advanced: true },
      { key: "tune", label: "Auto-Tune", type: "bool", default: false, advanced: true },
    ],
    // v0.6 (Stufen 0–10) -> v0.7 (Prozent)
    migrate: (raw) => {
      const r = { ...raw };
      const st = (k: string) => (typeof r[k] === "number" ? STAGE_DUTY[Math.min(10, Math.max(0, Math.round(r[k] as number)))] : undefined);
      if (r.pct === undefined && st("speed") !== undefined) r.pct = st("speed");
      if (r.min_pct === undefined && st("min_speed") !== undefined) r.min_pct = st("min_speed");
      if (r.max_pct === undefined && st("max_speed") !== undefined) r.max_pct = st("max_speed");
      if (r.idle_pct === undefined && st("idle_speed") !== undefined) r.idle_pct = st("idle_speed");
      return r;
    },
    wiring: ["Lüfter PWM (Pin unter GND) → GPIO{pin}", "Lüfter GND (oben links) → GND", "Lüfter +24 V → NICHT an den ESP!"],
  },
];

export function defaultConfig(def: ModuleDef): ModuleConfig {
  const cfg: ModuleConfig = { type: def.type };
  for (const p of def.params) cfg[p.key] = p.default;
  return cfg;
}

/** Nur bekannte Module/Parameter durchlassen */
export function sanitizeModules(input: unknown): ModuleConfig[] {
  if (!Array.isArray(input)) return [];
  const out: ModuleConfig[] = [];
  const usedPins = new Set<number>();
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const def = MODULES.find((m) => m.type === (raw as ModuleConfig).type);
    if (!def || def.required) continue;
    // Feste Reihenfolge (type, dann Parameter) -> der ESP kann Configs per String vergleichen
    const src = def.migrate ? def.migrate(raw as Record<string, unknown>) : (raw as Record<string, unknown>);
    const cfg = defaultConfig(def);
    let valid = true;
    for (const p of def.params) {
      const v = src[p.key];
      if (v === undefined) continue;
      if (p.type === "points") {
        // [x0,y0,x1,y1,…]: x 0..1 aufsteigend, y 0..100, 2–8 Punkte
        if (Array.isArray(v) && v.length >= 4 && v.length <= 16 && v.length % 2 === 0 && v.every((n) => typeof n === "number" && Number.isFinite(n))) {
          const pts: [number, number][] = [];
          for (let i = 0; i < v.length; i += 2)
            pts.push([Math.min(Math.max(v[i], 0), 1), Math.min(Math.max(v[i + 1], 0), 100)]);
          pts.sort((a, b) => a[0] - b[0]);
          cfg[p.key] = pts.flatMap(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 10) / 10]);
        }
        continue; // ungueltige Kurve -> Standard, Modul bleibt gueltig
      }
      if (p.type === "gpio" && typeof v === "number" && SAFE_GPIOS.includes(v) && !usedPins.has(v)) cfg[p.key] = v;
      else if (p.type === "select" && typeof v === "string" && p.options.includes(v)) cfg[p.key] = v;
      else if (p.type === "number" && typeof v === "number" && Number.isFinite(v))
        cfg[p.key] = Math.min(Math.max(v, p.min), p.max);
      else if (p.type === "bool" && typeof v === "boolean") cfg[p.key] = v;
      else if (p.type === "gpio" || p.type === "select") valid = false;
      // falsche Zahl/Bool -> Standardwert behalten statt das ganze Modul zu verwerfen
    }
    if (!valid) continue;
    for (const p of def.params) if (p.type === "gpio") usedPins.add(cfg[p.key] as number);
    out.push(cfg);
  }
  return out;
}

export type DeviceConfig = { interval: number; modules: ModuleConfig[] };

export function sanitizeConfig(input: unknown): DeviceConfig {
  const o = (input ?? {}) as Partial<DeviceConfig>;
  const interval = typeof o.interval === "number" ? Math.min(Math.max(Math.round(o.interval), 10), 3600) : 30;
  return { interval, modules: sanitizeModules(o.modules) };
}
