// Browser <-> ESP32 ueber Web Serial: Firmware flashen (esptool-js) und einrichten.

export type Log = (line: string) => void;

export function webSerialSupported() {
  return typeof window !== "undefined" && window.isSecureContext && "serial" in navigator;
}

/** Firmware (zusammengefuegtes Image ab 0x0) auf den ESP schreiben */
export async function flashFirmware(
  port: SerialPort,
  image: Uint8Array,
  onProgress: (p: number) => void,
  log: Log,
) {
  const { ESPLoader, Transport } = await import("esptool-js");
  const transport = new Transport(port, false);
  const loader = new ESPLoader({
    transport,
    baudrate: 460800,
    terminal: {
      clean() {},
      writeLine: (d: string) => log(d),
      write: (d: string) => d.trim() && log(d),
    },
  });

  try {
    const chip = await loader.main();
    log(`Chip erkannt: ${chip}`);
    await loader.writeFlash({
      fileArray: [{ data: image, address: 0 }],
      flashMode: "keep",
      flashFreq: "keep",
      flashSize: "keep",
      eraseAll: true,
      compress: true,
      reportProgress: (_i: number, written: number, total: number) => onProgress(written / total),
    });
    log("Flashen abgeschlossen, Neustart…");
    await loader.after("hard_reset");
  } finally {
    await transport.disconnect().catch(() => {});
  }
}

type CustosMsg = Record<string, unknown>;

export type ProvisionPayload = {
  wifi: { ssid: string; pass: string };
  server: string;
  key: string;
  interval: number;
  modules: Record<string, string | number | boolean | number[]>[];
};

/** Mit der laufenden Firmware sprechen und die Einrichtung schicken. Gibt die Geraete-ID zurueck. */
export async function provisionDevice(port: SerialPort, payload: ProvisionPayload, log: Log) {
  await port.open({ baudRate: 115200 });
  // DTR/RTS loslassen, sonst haengt der ESP im Reset/Bootloader
  await port.setSignals({ dataTerminalReady: false, requestToSend: false }).catch(() => {});

  const reader = port.readable!.getReader();
  const writer = port.writable!.getWriter();
  const messages: CustosMsg[] = [];
  const decoder = new TextDecoder();
  let buffer = "";
  let stopped = false;

  const pump = (async () => {
    try {
      while (!stopped) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let i: number;
        while ((i = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, i).replace(/\r$/, "");
          buffer = buffer.slice(i + 1);
          if (!line) continue;
          if (line.startsWith("CUSTOS:")) {
            try {
              messages.push(JSON.parse(line.slice(7)));
            } catch {
              /* unvollstaendige Zeile */
            }
          } else {
            log(line);
          }
        }
      }
    } catch {
      /* Port geschlossen */
    }
  })();

  const send = (obj: unknown) => writer.write(new TextEncoder().encode(JSON.stringify(obj) + "\n"));

  async function waitFor(pred: (m: CustosMsg) => boolean, timeoutMs: number, resend?: () => Promise<void>) {
    const end = Date.now() + timeoutMs;
    let nextResend = 0;
    while (Date.now() < end) {
      const hit = messages.find(pred);
      if (hit) return hit;
      if (resend && Date.now() >= nextResend) {
        await resend();
        nextResend = Date.now() + 1000;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    return null;
  }

  try {
    log("Warte auf Custos-Firmware…");
    const hello = await waitFor((m) => typeof m.id === "string", 20_000, () => send({ cmd: "hello" }));
    if (!hello) throw new Error("Keine Antwort vom ESP. Läuft die Custos-Firmware? (Ggf. 'Firmware flashen' aktivieren)");
    log(`ESP gefunden: ${hello.id} · Firmware ${hello.fw}`);

    await send({ cmd: "provision", ...payload });
    const ok = await waitFor((m) => m.ok === true, 10_000);
    if (!ok) throw new Error("ESP hat die Einrichtung nicht bestätigt.");
    log("Einrichtung gespeichert, ESP startet neu und verbindet sich mit dem WLAN.");
    return String(ok.id ?? hello.id);
  } finally {
    stopped = true;
    await reader.cancel().catch(() => {});
    await pump;
    reader.releaseLock();
    writer.releaseLock();
    await port.close().catch(() => {});
  }
}
