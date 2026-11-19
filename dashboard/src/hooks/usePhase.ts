"use client";

import { useCallback, useEffect, useState } from "react";
import { getPhase, type PhaseKey } from "@/lib/phases";

type State = { phase: PhaseKey; since: string | null };
const EVENT = "custos-phase";

/** Aktuelle Grow-Phase, synchron in allen Komponenten (Sidebar, Dashboard, Phasen-Seite) */
export function usePhase() {
  const [state, setState] = useState<State | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/phase", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && d && setState({ phase: getPhase(d.phase).key, since: d.since }));
    const onChange = (e: Event) => setState((e as CustomEvent<State>).detail);
    window.addEventListener(EVENT, onChange);
    return () => {
      alive = false;
      window.removeEventListener(EVENT, onChange);
    };
  }, []);

  const update = useCallback(async (phase: PhaseKey) => {
    const r = await fetch("/api/phase", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phase }),
    });
    if (!r.ok) return;
    const d = await r.json();
    const next = { phase: d.phase as PhaseKey, since: d.since as string };
    window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
  }, []);

  return { phase: state ? getPhase(state.phase) : null, since: state?.since ?? null, setPhase: update };
}
