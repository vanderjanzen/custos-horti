"use client";

import { SAFE_GPIOS, type ModuleParam } from "@/lib/modules";

/** Eingabefeld fuer einen Modul-Parameter (GPIO, Auswahl oder Zahl) */
export default function ParamField({
  param: p,
  value,
  onChange,
}: {
  param: ModuleParam;
  value: string | number | undefined;
  onChange: (v: string | number) => void;
}) {
  return (
    <label className="field">
      <span className="eyebrow">
        {p.label}
        {p.type === "number" && p.unit ? ` (${p.unit})` : ""}
      </span>
      {p.type === "number" ? (
        <input
          className="input"
          type="number"
          min={p.min}
          max={p.max}
          step={p.step ?? 1}
          value={value ?? p.default}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      ) : (
        <select
          className="select"
          value={String(value ?? p.default)}
          onChange={(e) => onChange(p.type === "gpio" ? Number(e.target.value) : e.target.value)}
        >
          {p.type === "gpio"
            ? SAFE_GPIOS.map((g) => (
                <option key={g} value={g}>
                  GPIO{g} (D{g})
                </option>
              ))
            : p.options.map((o, i) => (
                <option key={o} value={o}>
                  {p.labels?.[i] ?? o}
                </option>
              ))}
        </select>
      )}
    </label>
  );
}
