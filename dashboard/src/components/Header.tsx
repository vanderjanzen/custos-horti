"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDevices } from "@/hooks/useDevices";
import { isOnline } from "@/lib/format";
import { IconLeaf, IconUser } from "./Icons";
import Segmented from "./Segmented";
import { resetRole, useRole } from "@/hooks/useRole";
import { currentTheme, setTheme, type Theme } from "@/lib/theme";

export default function Header() {
  const { devices } = useDevices();
  const online = devices?.filter((d) => isOnline(d.last_seen)).length ?? 0;
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { user, isGuest } = useRole();
  const [theme, setThemeState] = useState<Theme>("dark");
  useEffect(() => setThemeState(currentTheme()), []);

  function changeTheme(t: Theme) {
    setTheme(t);
    setThemeState(t);
  }

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    resetRole();
    router.replace("/login");
    router.refresh();
  }

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
        <div className="menu-anchor" ref={menuRef}>
          <button className="avatar" aria-label="Benutzer" onClick={() => setMenu((m) => !m)}>
            <IconUser />
          </button>
          {menu && (
            <div className="menu glass">
              <div className="menu-head">
                <div>{user ?? "…"}</div>
                <div className="eyebrow">{isGuest ? "Gast · nur lesen" : "Admin"}</div>
              </div>
              <div className="menu-row">
                <span>Darstellung</span>
                <Segmented
                  value={theme}
                  onChange={changeTheme}
                  options={[
                    { value: "dark", label: "Dark" },
                    { value: "light", label: "Light" },
                  ]}
                />
              </div>
              <button className="menu-item" onClick={logout}>
                Abmelden
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
