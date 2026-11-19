"use client";

import Link from "next/link";
import { useDevices } from "@/hooks/useDevices";
import { isOnline } from "@/lib/format";
import { IconLeaf, IconUser } from "./Icons";

export default function Header() {
  const { devices } = useDevices();
  const online = devices?.filter((d) => isOnline(d.last_seen)).length ?? 0;

  return (
    <header className="header glass">
      <Link href="/" className="brand">
        <span className="brand-mark">
          <IconLeaf />
        </span>
        <span>
          <div className="brand-name">
            Custos <em>Horti</em>
          </div>
          <div className="brand-tag">Wächter des Gartens</div>
        </span>
      </Link>

      <div className="header-right">
        <div className="header-status">
          <i className={`dot ${online > 0 ? "is-live" : ""}`} />
          <span>
            {online} / {devices?.length ?? 0} live
          </span>
        </div>
        <button className="avatar" aria-label="Benutzer">
          <IconUser />
        </button>
      </div>
    </header>
  );
}
