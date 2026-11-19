"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { MODULES, SAFE_GPIOS, defaultConfig, type ModuleConfig } from "@/lib/modules";
import { flashFirmware, provisionDevice, webSerialSupported } from "@/lib/serial";
import type { DeviceSummary } from "@/app/api/devices/route";
import { IconUsb } from "./Icons";

type ProvisionInfo = {
  ingestKey: string;
  server: string;
  firmware: { version: string; file: string; built: string } | null;
};

type Phase = "idle" | "connecting" | "flashing" | "provisioning" | "saving" | "done" | "error";

const STEPS = ["Module", "Netzwerk", "Flashen", "Fertig"];

const PHASE_TEXT: Record<Phase, string> = {
  idle: "",
  connecting: "Verbinde mit dem ESP…",
  flashing: "Firmware wird geschrieben…",
  provisioning: "Einrichtung wird übertragen…",
  saving: "Gerät wird im Dashboard angelegt…",
  done: "Fertig",
  error: "Fehler",
};

export default function AddDeviceWizard() {
  const [step, setStep] = useState(0);
  const [info, setInfo] = useState<ProvisionInfo | null>(null);

  // Schritt 1
  const [name, setName] = useState("");
  const [active, setActive] = useState<Record<string, ModuleConfig>>(() => {
    const dht = MODULES.find((m) => m.type === "dht")!;
    return { dht: defaultConfig(dht) };
  });

  // Schritt 2
  const [ssid, setSsid] = useState("");
  const [pass, setPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [server, setServer] = useState("");
  const [interval, setIntervalSec] = useState(30);

  // Schritt 3
  const [flash, setFlash] = useState(true);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);

  const root = useRef<HTMLDivElement>(null);
  const consoleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSupported(webSerialSupported());
    fetch("/api/provision")
      .then((r) => r.json())
      .then((d: ProvisionInfo) => {
        setInfo(d);
        setServer((s) => s || d.server);
        if (!d.firmware) setFlash(false);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    consoleRef.current?.scrollTo({ top: consoleRef.current.scrollHeight });
  }, [log]);

  // Schrittwechsel weich einblenden
  useGSAP(
    () => {
      gsap.fromTo(
        ".wizard-step",
        { opacity: 0, x: 24, filter: "blur(6px)" },
        { opacity: 1, x: 0, filter: "blur(0px)", duration: 0.6, ease: "expo.out", clearProps: "filter,transform" },
      );
      gsap.to(".stepper-fill", { scaleX: step / (STEPS.length - 1), duration: 0.8, ease: "expo.inOut" });
    },
    { scope: root, dependencies: [step] },
  );

  const addLog = (line: string) => setLog((l) => [...l.slice(-300), line]);
  const busy = phase !== "idle" && phase !== "error" && phase !== "done";

  function toggleModule(type: string) {
    const def = MODULES.find((m) => m.type === type)!;
    if (def.required) return;
    setActive((a) => {
      const next = { ...a };
      if (next[type]) delete next[type];
      else next[type] = defaultConfig(def);
      return next;
    });
  }

  function setParam(type: string, key: string, value: string | number) {
    setActive((a) => ({ ...a, [type]: { ...a[type], [key]: value } }));
  }

  async function run() {
    setError(null);
    setLog([]);
    setProgress(0);
    let port: SerialPort;
    try {
      port = await navigator.serial.requestPort();
    } catch {
      return; // Auswahl abgebrochen
    }

    const modules = Object.values(active);
    try {
      if (flash && info?.firmware) {
        setPhase("connecting");
        addLog(`Lade Firmware ${info.firmware.version}…`);
        const image = new Uint8Array(await (await fetch(info.firmware.file)).arrayBuffer());
        setPhase("flashing");
        await flashFirmware(port, image, setProgress, addLog);
        await new Promise((r) => setTimeout(r, 1500));
      }

      setPhase("provisioning");
      const id = await provisionDevice(
        port,
        {
          wifi: { ssid, pass },
          server,
          key: info?.ingestKey ?? "",
          interval,
          modules,
        },
        addLog,
      );

      setPhase("saving");
      await fetch(`/api/devices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name || null, config: { interval, modules } }),
      });

      setDeviceId(id);
      setPhase("done");
      setStep(3);
    } catch (e) {
      setPhase("error");
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div ref={root} className="wizard">
      <div className="page-head reveal">
        <div>
          <div className="eyebrow">Hardware</div>
          <h1 className="page-title">Gerät hinzufügen</h1>
          <p className="page-sub">Module wählen, WLAN eintragen, direkt aus dem Browser flashen</p>
        </div>
      </div>

      <div className="stepper glass reveal">
        <div className="stepper-track">
          <span className="stepper-fill" />
        </div>
        {STEPS.map((s, i) => (
          <div key={s} className={`stepper-item ${i === step ? "is-active" : ""} ${i < step ? "is-done" : ""}`}>
            <span className="stepper-num">{i < step ? "✓" : `0${i + 1}`}</span>
            <span>{s}</span>
          </div>
        ))}
      </div>

      {step === 0 && (
        <section className="wizard-step panel glass">
          <div className="field" style={{ maxWidth: 420, marginBottom: 22 }}>
            <span className="eyebrow">Gerätename</span>
            <input
              className="input"
              placeholder="z. B. Zelt 80×80"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="eyebrow" style={{ marginBottom: 10 }}>
            Module
          </div>
          <div className="module-list">
            {MODULES.map((m) => {
              const on = m.required || Boolean(active[m.type]);
              const cfg = active[m.type];
              return (
                <div key={m.type} className={`module-card ${on ? "is-on" : ""} ${m.required ? "is-locked" : ""}`}>
                  <button className="module-head" onClick={() => toggleModule(m.type)} type="button">
                    <span className={`check ${on ? "is-on" : ""}`}>{on ? "✓" : ""}</span>
                    <span className="module-text">
                      <span className="module-name">
                        {m.name}
                        {m.required && <span className="tag">immer aktiv</span>}
                      </span>
                      <span className="module-desc">{m.description}</span>
                    </span>
                  </button>

                  {on && cfg && m.params.length > 0 && (
                    <div className="module-params">
                      {m.params.map((p) => (
                        <label className="field" key={p.key}>
                          <span className="eyebrow">{p.label}</span>
                          <select
                            className="select"
                            value={String(cfg[p.key])}
                            onChange={(e) =>
                              setParam(m.type, p.key, p.type === "gpio" ? Number(e.target.value) : e.target.value)
                            }
                          >
                            {p.type === "gpio"
                              ? SAFE_GPIOS.map((g) => (
                                  <option key={g} value={g}>
                                    GPIO{g} (D{g})
                                  </option>
                                ))
                              : p.options.map((o) => (
                                  <option key={o} value={o}>
                                    {o}
                                  </option>
                                ))}
                          </select>
                        </label>
                      ))}
                      {m.wiring && (
                        <div className="wiring">
                          <span className="eyebrow">Verkabelung</span>
                          {m.wiring.map((w) => (
                            <code key={w}>{w.replace("{pin}", String(cfg.pin ?? ""))}</code>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="wizard-actions">
            <span />
            <button className="btn btn-primary" onClick={() => setStep(1)}>
              Weiter
            </button>
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="wizard-step panel glass">
          <div className="form-grid">
            <label className="field">
              <span className="eyebrow">WLAN-Name (SSID)</span>
              <input className="input" value={ssid} onChange={(e) => setSsid(e.target.value)} autoComplete="off" />
            </label>
            <label className="field">
              <span className="eyebrow">WLAN-Passwort</span>
              <div className="input-row">
                <input
                  className="input"
                  type={showPass ? "text" : "password"}
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  autoComplete="new-password"
                />
                <button className="btn btn-ghost" type="button" onClick={() => setShowPass((s) => !s)}>
                  {showPass ? "verbergen" : "zeigen"}
                </button>
              </div>
            </label>
            <label className="field">
              <span className="eyebrow">Server-Adresse für Messwerte</span>
              <input className="input mono" value={server} onChange={(e) => setServer(e.target.value)} />
            </label>
            <label className="field">
              <span className="eyebrow">Messintervall (Sekunden)</span>
              <input
                className="input"
                type="number"
                min={5}
                max={3600}
                value={interval}
                onChange={(e) => setIntervalSec(Number(e.target.value))}
              />
            </label>
          </div>
          <p className="hint" style={{ marginTop: 16 }}>
            Der ESP32 funkt nur im 2,4-GHz-WLAN. Im Heimnetz ist eine lokale Adresse wie
            <code> http://192.168.178.165:3100/api/readings</code> am zuverlässigsten.
          </p>

          <div className="wizard-actions">
            <button className="btn" onClick={() => setStep(0)}>
              Zurück
            </button>
            <button className="btn btn-primary" disabled={!ssid || !server} onClick={() => setStep(2)}>
              Weiter
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="wizard-step panel glass">
          {!supported && (
            <div className="notice warn">
              Flashen aus dem Browser braucht Chrome oder Edge und eine HTTPS-Adresse (oder localhost).
            </div>
          )}

          <div className="flash-grid">
            <div className="flash-summary">
              <div className="eyebrow">Zusammenfassung</div>
              <dl>
                <dt>Gerät</dt>
                <dd>{name || "Unbenannt"}</dd>
                <dt>Module</dt>
                <dd>
                  Standard
                  {Object.values(active).map((m) => {
                    const def = MODULES.find((d) => d.type === m.type);
                    return (
                      <span key={m.type}>
                        {" "}
                        · {def?.name}
                        {m.pin != null && ` (GPIO${m.pin})`}
                      </span>
                    );
                  })}
                </dd>
                <dt>WLAN</dt>
                <dd>{ssid}</dd>
                <dt>Intervall</dt>
                <dd>{interval} s</dd>
                <dt>Firmware</dt>
                <dd>{info?.firmware ? `v${info.firmware.version}` : "nicht verfügbar"}</dd>
              </dl>

              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={flash}
                  disabled={!info?.firmware || busy}
                  onChange={(e) => setFlash(e.target.checked)}
                />
                <span>Firmware neu flashen (löscht den ESP komplett)</span>
              </label>
              <p className="hint">
                Ohne Haken wird nur die Einrichtung an einen ESP geschickt, auf dem Custos schon läuft.
              </p>
            </div>

            <div className="flash-run">
              <div className="flash-status">
                <IconUsb />
                <div style={{ flex: 1 }}>
                  <div>{phase === "idle" ? "ESP per USB anschließen" : PHASE_TEXT[phase]}</div>
                  {phase === "flashing" && (
                    <div className="progress">
                      <span style={{ transform: `scaleX(${progress})` }} />
                    </div>
                  )}
                </div>
                {phase === "flashing" && <span className="mono">{Math.round(progress * 100)} %</span>}
              </div>

              {error && <p className="form-error">{error}</p>}

              <div className="console" ref={consoleRef}>
                {log.length === 0 ? (
                  <span className="console-empty">Ausgabe erscheint hier…</span>
                ) : (
                  log.map((l, i) => <div key={i}>{l}</div>)
                )}
              </div>

              <p className="hint">
                Hängt es bei „Connecting…“? BOOT-Taste am ESP gedrückt halten, bis der Fortschritt startet.
              </p>
            </div>
          </div>

          <div className="wizard-actions">
            <button className="btn" disabled={busy} onClick={() => setStep(1)}>
              Zurück
            </button>
            <button className="btn btn-primary" disabled={busy || !supported} onClick={run}>
              {busy ? PHASE_TEXT[phase] : flash ? "Verbinden & flashen" : "Verbinden & einrichten"}
            </button>
          </div>
        </section>
      )}

      {step === 3 && deviceId && <Finished deviceId={deviceId} name={name} />}
    </div>
  );
}

function Finished({ deviceId, name }: { deviceId: string; name: string }) {
  const [device, setDevice] = useState<DeviceSummary | null>(null);
  const [since] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(async () => {
      const r = await fetch("/api/devices", { cache: "no-store" });
      if (!r.ok) return;
      const list: DeviceSummary[] = await r.json();
      const d = list.find((x) => x.id === deviceId);
      if (d && new Date(d.last_seen).getTime() > since - 5000) setDevice(d);
    }, 3000);
    return () => clearInterval(t);
  }, [deviceId, since]);

  return (
    <section className="wizard-step panel glass finished">
      <i className={`dot ${device ? "is-live" : ""}`} style={{ width: 14, height: 14 }} />
      <h2 className="panel-title" style={{ fontSize: 22 }}>
        {device ? `${name || "Gerät"} ist online` : "Warte auf die erste Messung…"}
      </h2>
      <p className="page-sub">
        {device
          ? `${device.temperature?.toFixed(1) ?? "–"} °C · ${device.humidity?.toFixed(0) ?? "–"} % · ${device.ip ?? ""}`
          : "Der ESP startet neu und verbindet sich mit dem WLAN. Das dauert meist 10–30 Sekunden."}
      </p>
      <p className="device-id">ID {deviceId}</p>
      <div className="wizard-actions" style={{ justifyContent: "center" }}>
        <Link href="/geraete" className="btn">
          Zu den Geräten
        </Link>
        <Link href="/" className="btn btn-primary">
          Zum Dashboard
        </Link>
      </div>
    </section>
  );
}
