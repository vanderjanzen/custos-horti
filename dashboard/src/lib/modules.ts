// Modul-Katalog fuer das Dashboard. Muss zu firmware/src/modules/registry.h passen.

export type ModuleParam =
  | { key: string; label: string; type: "gpio"; default: number }
  | { key: string; label: string; type: "select"; options: string[]; default: string };

export type ModuleDef = {
  type: string;
  name: string;
  description: string;
  required?: boolean;
  params: ModuleParam[];
  wiring?: string[];
};

export type ModuleConfig = { type: string; [key: string]: string | number };

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
    const cfg = defaultConfig(def);
    let valid = true;
    for (const p of def.params) {
      const v = (raw as ModuleConfig)[p.key];
      if (v === undefined) continue;
      if (p.type === "gpio" && typeof v === "number" && SAFE_GPIOS.includes(v) && !usedPins.has(v)) cfg[p.key] = v;
      else if (p.type === "select" && typeof v === "string" && p.options.includes(v)) cfg[p.key] = v;
      else valid = false;
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
  const interval = typeof o.interval === "number" ? Math.min(Math.max(Math.round(o.interval), 5), 3600) : 30;
  return { interval, modules: sanitizeModules(o.modules) };
}
