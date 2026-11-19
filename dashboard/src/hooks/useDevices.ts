"use client";

import { useCallback, useEffect, useState } from "react";
import type { DeviceSummary } from "@/app/api/devices/route";

/** Geraeteliste, alle 15 s aktualisiert */
export function useDevices(intervalMs = 15_000) {
  const [devices, setDevices] = useState<DeviceSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/devices", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDevices(await res.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    }
  }, []);

  useEffect(() => {
    reload();
    const t = setInterval(reload, intervalMs);
    return () => clearInterval(t);
  }, [reload, intervalMs]);

  return { devices, error, reload };
}

/** Sekunden-Takt fuer "vor x s"-Anzeigen */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
