"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { useDevices } from "@/hooks/useDevices";
import { isOnline } from "@/lib/format";
import { IconDashboard, IconDevices, IconLogs, IconPlus, IconSettings } from "./Icons";

const groups = [
  {
    label: "Übersicht",
    items: [
      { href: "/", label: "Dashboard", icon: IconDashboard },
      { href: "/logs", label: "Logs", icon: IconLogs },
    ],
  },
  {
    label: "Hardware",
    items: [
      { href: "/geraete", label: "Geräte", icon: IconDevices, count: true },
      { href: "/geraete/neu", label: "Gerät hinzufügen", icon: IconPlus },
    ],
  },
  {
    label: "System",
    items: [{ href: "/einstellungen", label: "Einstellungen", icon: IconSettings, disabled: true }],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { devices } = useDevices();
  const online = devices?.filter((d) => isOnline(d.last_seen)).length ?? 0;
  const root = useRef<HTMLElement>(null);

  // Leuchtender Indikator gleitet zum aktiven Reiter
  useGSAP(
    () => {
      const active = root.current?.querySelector<HTMLElement>(".nav-link.is-active");
      const nav = active?.closest(".nav");
      root.current?.querySelectorAll<HTMLElement>(".nav-indicator").forEach((ind) => {
        if (!active || ind.parentElement !== nav) {
          gsap.to(ind, { opacity: 0, duration: 0.25 });
          return;
        }
        const first = gsap.getProperty(ind, "opacity") === 0;
        gsap.to(ind, {
          y: active.offsetTop,
          opacity: 1,
          duration: first ? 0 : 0.6,
          ease: "expo.out",
        });
      });
    },
    { scope: root, dependencies: [pathname] },
  );

  // Einmaliges Einfliegen beim Laden
  useGSAP(
    () => {
      gsap.from(".nav-link", { x: -12, opacity: 0, stagger: 0.05, duration: 0.7, ease: "expo.out", delay: 0.1 });
    },
    { scope: root },
  );

  return (
    <aside className="sidebar glass" ref={root}>
      {groups.map((g) => (
        <div className="nav-group" key={g.label}>
          <div className="eyebrow">{g.label}</div>
          <nav className="nav">
            <span className="nav-indicator" />
            {g.items.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              const cls = `nav-link ${active ? "is-active" : ""}`;
              const inner = (
                <>
                  <Icon />
                  <span>{item.label}</span>
                  {"count" in item && item.count && devices && (
                    <span className="nav-count">
                      {online}/{devices.length}
                    </span>
                  )}
                  {"disabled" in item && item.disabled && <span className="nav-count">bald</span>}
                </>
              );
              return "disabled" in item && item.disabled ? (
                <span key={item.href} className={cls} style={{ cursor: "default", opacity: 0.5 }}>
                  {inner}
                </span>
              ) : (
                <Link key={item.href} href={item.href} className={cls}>
                  {inner}
                </Link>
              );
            })}
          </nav>
        </div>
      ))}
      <div className="sidebar-foot">
        <span>v0.2.0</span>
        <span>{devices ? `${devices.length} Sensor${devices.length === 1 ? "" : "en"}` : "…"}</span>
      </div>
    </aside>
  );
}
