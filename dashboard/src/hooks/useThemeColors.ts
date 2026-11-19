"use client";

import { useEffect, useState } from "react";
import { currentTheme, onThemeChange, type Theme } from "@/lib/theme";

const KEYS = ["--temp", "--hum", "--vpd", "--accent", "--chart-grid", "--chart-cursor", "--bg"] as const;
export type ThemeColors = Record<(typeof KEYS)[number], string> & { theme: Theme };

function read(): ThemeColors {
  const cs = getComputedStyle(document.documentElement);
  const out = { theme: currentTheme() } as ThemeColors;
  for (const k of KEYS) out[k] = cs.getPropertyValue(k).trim();
  return out;
}

/** Aktuelle Theme-Farben fuer SVG/Recharts (CSS-Variablen gehen dort nicht ueberall) */
export function useThemeColors() {
  const [colors, setColors] = useState<ThemeColors | null>(null);
  useEffect(() => {
    setColors(read());
    return onThemeChange(() => requestAnimationFrame(() => setColors(read())));
  }, []);
  return colors;
}
