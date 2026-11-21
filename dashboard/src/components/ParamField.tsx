"use client";

import { SAFE_GPIOS, type ModuleParam } from "@/lib/modules";

/** Eingabefeld fuer einen Modul-Parameter (GPIO, Auswahl oder Zahl) */
export default function ParamField({
  param: p,
  value,
  onChange,
  label,
}: {
  param: ModuleParam;
  label?: string;
  value: string | number | boolean | undefined;
  onChange: (v: string | number | boolean) => void;
}) {
  if (p.type === "bool") {
    return (
      <label className="checkbox">
        <input type="checkbox" checked={Boolean(value ?? p.default)} onChange={(e) => onChange(e.target.checked)} />
        <span>{label ?? p.label}</span>
      </label>
    );
  }
  return (
    <label className="field">
      <span className="eyebrow">
        {label ?? p.label}
        {p.type === "number" && p.unit ? ` (${p.unit})` : ""}
      </span>
      {p.type === "number" ? (
        <input
          className="input"
          type="number"
          min={p.min}
          max={p.max}
          step={p.step ?? 1}
          value={Number(value ?? p.default)}
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
