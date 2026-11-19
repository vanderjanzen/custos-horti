"use client";

import { useEffect, useState } from "react";

type Me = { user: string | null; role: "admin" | "guest" | null };
let cache: Promise<Me> | null = null;

/** Rolle des angemeldeten Nutzers – einmal geladen, ueberall geteilt */
export function useRole() {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    cache ??= fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .catch(() => ({ user: null, role: null }));
    let alive = true;
    cache.then((m) => alive && setMe(m));
    return () => {
      alive = false;
    };
  }, []);
  return { user: me?.user ?? null, role: me?.role ?? null, isGuest: me?.role === "guest", ready: me !== null };
}

/** Nach Login/Logout neu laden */
export function resetRole() {
  cache = null;
}
