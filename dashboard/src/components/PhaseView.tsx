"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { usePhase } from "@/hooks/usePhase";
import { useRole } from "@/hooks/useRole";
import { PHASES } from "@/lib/phases";

function days(since: string | null) {
  if (!since) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 86400_000));
}

export default function PhaseView() {
  const { phase, since, setPhase } = usePhase();
  const { isGuest } = useRole();
  const root = useRef<HTMLDivElement>(null);

  // Aktive Karte leicht "aufleuchten" lassen
  useGSAP(
    () => {
      if (!phase) return;
      gsap.fromTo(
        ".phase-card.is-active .phase-orb",
        { scale: 0.6, opacity: 0.4 },
        { scale: 1, opacity: 1, duration: 0.9, ease: "elastic.out(1, 0.5)" },
      );
    },
    { scope: root, dependencies: [phase?.key] },
  );

  const d = days(since);

  return (
    <div ref={root} className="content-stack">
      <div className="page-head reveal">
        <div>
          <div className="eyebrow">Übersicht</div>
          <h1 className="page-title">Grow-Phase</h1>
          <p className="page-sub">
            {phase ? (
              <>
                Aktuell <strong>{phase.name}</strong>
                {d !== null && (d === 0 ? " · seit heute" : ` · seit ${d} ${d === 1 ? "Tag" : "Tagen"}`)}
              </>
            ) : (
              "Lade…"
            )}
          </p>
        </div>
      </div>

      <div className="phase-grid">
        {PHASES.map((p, i) => {
          const active = phase?.key === p.key;
          return (
            <button
              key={p.key}
              className={`phase-card glass float reveal ${active ? "is-active" : ""}`}
              onClick={() => !isGuest && setPhase(p.key)}
              disabled={isGuest && !active}
            >
              <div className="phase-top">
                <span className="phase-orb" />
                <span className="eyebrow">0{i + 1}</span>
              </div>
              <h3>{p.name}</h3>
              <p className="phase-short">{p.short}</p>
              <p className="phase-desc">{p.description}</p>
              <dl className="phase-targets">
                <dt>VPD</dt>
                <dd>
                  {p.vpd[0].toFixed(1)}–{p.vpd[1].toFixed(1)} kPa
                </dd>
                <dt>Temp.</dt>
                <dd>
                  {p.temp[0]}–{p.temp[1]} °C
                </dd>
                <dt>Feuchte</dt>
                <dd>
                  {p.hum[0]}–{p.hum[1]} %
                </dd>
              </dl>
              <span className="phase-cta">{active ? "Aktiv" : isGuest ? "" : "Auswählen"}</span>
            </button>
          );
        })}
      </div>

      <p className="hint reveal">
        Die Richtwerte gelten für die Luft (Luft-VPD) und dienen als Orientierung. Die Phase bestimmt den Zielbereich im
        VPD-Verlauf und die Empfehlungen im Dashboard.
      </p>
    </div>
  );
}
