"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import type { Phase } from "@/lib/phases";
import { rhForVpd, tempForVpd, vpd } from "@/lib/vpd";
import { IconClose } from "./Icons";

const SCALE_MAX = 2.0;

export default function VpdModal({
  temperature,
  humidity,
  phase,
  onClose,
}: {
  temperature: number | null;
  humidity: number | null;
  phase: Phase;
  onClose: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useGSAP(
    () => {
      gsap.from(".modal-backdrop", { opacity: 0, duration: 0.4 });
      gsap.from(".modal", {
        y: 24,
        scale: 0.97,
        opacity: 0,
        duration: 0.7,
        ease: "expo.out",
        clearProps: "transform,opacity",
      });
      gsap.from(".vpd-marker", { left: "0%", duration: 1.2, ease: "expo.out", delay: 0.15 });
    },
    { scope: root },
  );

  const has = temperature != null && humidity != null;
  const v = has ? vpd(temperature!, humidity!) : null;
  const [lo, hi] = phase.vpd;
  const target = (lo + hi) / 2;
  const status = v == null ? "unknown" : v < lo ? "low" : v > hi ? "high" : "ok";

  const pct = (x: number) => `${Math.min(100, Math.max(0, (x / SCALE_MAX) * 100))}%`;

  const needRh = has ? rhForVpd(temperature!, target) : null;
  const needT = has ? tempForVpd(humidity!, target) : null;

  return (
    <div className="modal-root" ref={root}>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal glass" role="dialog" aria-label="VPD-Details">
        <button className="modal-close btn btn-ghost" onClick={onClose} aria-label="Schließen">
          <IconClose size={16} />
        </button>

        <div className="eyebrow">Dampfdruckdefizit</div>
        <div className="vpd-hero">
          <span className={`vpd-big is-${status}`}>{v != null ? v.toFixed(2) : "–"}</span>
          <span className="vpd-unit">kPa</span>
          <span className={`vpd-badge is-${status}`}>
            {status === "ok" ? "optimal" : status === "low" ? "zu niedrig" : status === "high" ? "zu hoch" : "keine Daten"}
          </span>
        </div>
        <p className="page-sub">
          Ziel in der Phase <strong>{phase.name}</strong>: {lo.toFixed(1)}–{hi.toFixed(1)} kPa ·{" "}
          <Link href="/phase" onClick={onClose} className="link">
            Phase ändern
          </Link>
        </p>

        <div className="vpd-scale">
          <div className="vpd-track">
            <span className="vpd-zone" style={{ left: pct(lo), width: `calc(${pct(hi)} - ${pct(lo)})` }} />
            {v != null && <span className={`vpd-marker is-${status}`} style={{ left: pct(v) }} />}
          </div>
          <div className="vpd-ticks">
            {[0, 0.4, 0.8, 1.2, 1.6, 2.0].map((t) => (
              <span key={t} style={{ left: pct(t) }}>
                {t.toFixed(1)}
              </span>
            ))}
          </div>
          <div className="vpd-legend">
            <span>feucht · Schimmelgefahr</span>
            <span>trocken · Stress</span>
          </div>
        </div>

        <div className="vpd-now">
          <div>
            <span className="eyebrow">Temperatur</span>
            <strong style={{ color: "var(--temp)" }}>{temperature?.toFixed(1) ?? "–"} °C</strong>
            <span className="hint">
              Ziel {phase.temp[0]}–{phase.temp[1]} °C
            </span>
          </div>
          <div>
            <span className="eyebrow">Luftfeuchte</span>
            <strong style={{ color: "var(--hum)" }}>{humidity?.toFixed(0) ?? "–"} %</strong>
            <span className="hint">
              Ziel {phase.hum[0]}–{phase.hum[1]} %
            </span>
          </div>
        </div>

        <div className="vpd-tips">
          <div className="eyebrow">Was du tun kannst</div>
          {status === "ok" && <p>Alles im grünen Bereich – das Klima passt zur Phase. Einfach so halten.</p>}
          {status === "low" && (
            <ul>
              <li>
                <strong>Luftfeuchte senken</strong> auf etwa <span className="mono">{needRh?.toFixed(0)} %</span> – Lüfter
                eine Stufe höher, Entfeuchter an, weniger offene Wasserflächen.
              </li>
              <li>
                <strong>oder Temperatur erhöhen</strong> auf etwa <span className="mono">{needT?.toFixed(1)} °C</span> –
                Abluft drosseln, Licht etwas näher bzw. heller.
              </li>
              <li>Zu niedriger VPD bremst die Verdunstung – Nährstoffaufnahme stockt, Schimmelrisiko steigt.</li>
            </ul>
          )}
          {status === "high" && (
            <ul>
              <li>
                <strong>Luftfeuchte erhöhen</strong> auf etwa <span className="mono">{needRh?.toFixed(0)} %</span> –
                Luftbefeuchter, Lüfter eine Stufe runter.
              </li>
              <li>
                <strong>oder Temperatur senken</strong> auf etwa <span className="mono">{needT?.toFixed(1)} °C</span> –
                mehr Abluft, Licht dimmen oder höher hängen.
              </li>
              <li>Zu hoher VPD lässt die Pflanze zu stark verdunsten – sie schließt die Spaltöffnungen und wächst langsamer.</li>
            </ul>
          )}
          {status === "unknown" && <p>Sobald ein Sensor Temperatur und Feuchte liefert, erscheinen hier Empfehlungen.</p>}
        </div>

        <p className="hint">Berechnet als Luft-VPD aus Temperatur und relativer Feuchte (Magnus-Formel).</p>
      </div>
    </div>
  );
}
