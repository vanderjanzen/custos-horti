"use client";

import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { IconLeaf } from "./Icons";
import { resetRole } from "@/hooks/useRole";

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [user, setUser] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const card = useRef<HTMLFormElement>(null);

  useGSAP(() => {
    gsap.from(card.current, { y: 24, opacity: 0, filter: "blur(8px)", duration: 1, ease: "expo.out", clearProps: "all" });
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user, password }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Anmeldung fehlgeschlagen");
      gsap.fromTo(card.current, { x: -8 }, { x: 0, duration: 0.5, ease: "elastic.out(1, 0.3)" });
      return;
    }
    resetRole();
    const next = params.get("next");
    router.replace(next && next.startsWith("/") ? next : "/");
    router.refresh();
  }

  return (
    <form className="login glass" ref={card} onSubmit={submit}>
      <div className="brand">
        <span className="brand-mark">
          <IconLeaf />
        </span>
        <span>
          <div className="brand-name">
            Custos <em>Horti</em>
          </div>
          <div className="brand-tag">Wächter des Gartens</div>
        </span>
      </div>

      <label className="field">
        <span className="eyebrow">Benutzer</span>
        <input className="input" value={user} onChange={(e) => setUser(e.target.value)} autoComplete="username" />
      </label>
      <label className="field">
        <span className="eyebrow">Passwort</span>
        <input
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          autoFocus
        />
      </label>

      {error && <p className="form-error">{error}</p>}

      <button className="btn btn-primary btn-block" disabled={busy || !password}>
        {busy ? "Prüfe…" : "Anmelden"}
      </button>
    </form>
  );
}
