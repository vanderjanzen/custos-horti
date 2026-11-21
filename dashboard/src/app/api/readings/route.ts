import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema, RANGES, RESOLUTIONS, isRange } from "@/lib/db";
import { sanitizeConfig } from "@/lib/modules";
import { getPhase } from "@/lib/phases";
import { vpd as calcVpd } from "@/lib/vpd";
import { describeDecision, describeTune, type FanDetail, type FanTune } from "@/lib/fanEvents";

export const dynamic = "force-dynamic";

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** ESP -> Server: neue Messung speichern */
export async function POST(req: NextRequest) {
  const key = process.env.INGEST_API_KEY;
  if (key && req.headers.get("authorization") !== `Bearer ${key}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const deviceId = typeof body.device_id === "string" ? body.device_id.slice(0, 64) : "";
  const temperature = num(body.temperature);
  const humidity = num(body.humidity);
  if (!deviceId) {
    return NextResponse.json({ error: "device_id required" }, { status: 400 });
  }
  const fw = typeof body.fw === "string" ? body.fw.slice(0, 32) : null;
  const rssi = num(body.rssi);
  const uptime = num(body.uptime);
  const heap = num(body.heap);
  const ip = typeof body.ip === "string" ? body.ip.slice(0, 45) : null;
  const fanSpeed = num(body.fan_speed);
  const fanMode = typeof body.fan_mode === "string" ? body.fan_mode.slice(0, 16) : null;
  const fanReason = typeof body.fan_reason === "string" ? body.fan_reason.slice(0, 16) : null;
  const fanTarget = num(body.fan_target);
  const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);
  const fanDetail = obj(body.fan_detail) as FanDetail | undefined;
  const fanTune = obj(body.fan_tune) as FanTune | undefined;
  const fanState = fanSpeed !== null ? { detail: fanDetail ?? {}, tune: fanTune ?? null } : null;
  const modules = Array.isArray(body.modules)
    ? body.modules.filter((m): m is string => typeof m === "string").slice(0, 20)
    : null;

  await ensureSchema();
  const [device] = await sql<{ config: unknown }[]>`
    INSERT INTO devices (id, fw, rssi, uptime, heap, ip, modules, fan_speed, fan_mode, fan_reason, fan_target, fan_state, last_seen)
    VALUES (${deviceId}, ${fw}, ${rssi}, ${uptime}, ${heap}, ${ip}, ${modules}, ${fanSpeed}, ${fanMode}, ${fanReason},
            ${fanTarget}, ${fanState ? sql.json(fanState) : null}, now())
    ON CONFLICT (id) DO UPDATE
      SET fw = COALESCE(EXCLUDED.fw, devices.fw), rssi = COALESCE(EXCLUDED.rssi, devices.rssi),
          uptime = COALESCE(EXCLUDED.uptime, devices.uptime), heap = COALESCE(EXCLUDED.heap, devices.heap),
          ip = COALESCE(EXCLUDED.ip, devices.ip), modules = COALESCE(EXCLUDED.modules, devices.modules),
          fan_speed = EXCLUDED.fan_speed, fan_mode = EXCLUDED.fan_mode, fan_reason = EXCLUDED.fan_reason,
          fan_target = EXCLUDED.fan_target, fan_state = EXCLUDED.fan_state, last_seen = now()
    RETURNING config`;
  if (temperature !== null || humidity !== null) {
    await sql`
      INSERT INTO readings (device_id, temperature, humidity, fan)
      VALUES (${deviceId}, ${temperature}, ${humidity}, ${fanSpeed})`;
  }

  // Der ESP uebernimmt diese Config, falls sie sich geaendert hat
  // (feste Key-Reihenfolge, damit der ESP nur bei echten Aenderungen neu schreibt)
  const config = device?.config ? sanitizeConfig(device.config) : null;

  const fan = config?.modules.find((m) => m.type === "fan");

  // Auto-Tune beendet -> Ergebnis in die Config uebernehmen (der ESP bekommt sie direkt zurueck)
  if (config && fan && fan.tune === true && fanTune && (fanTune.state === "done" || fanTune.state === "fail")) {
    fan.tune = false;
    if (fanTune.state === "done") {
      if (typeof fanTune.kp === "number") fan.kp = fanTune.kp;
      if (typeof fanTune.ti === "number") fan.ti = fanTune.ti;
      if (typeof fanTune.td === "number") fan.td = fanTune.td;
    }
    const saved = sanitizeConfig(config);
    Object.assign(fan, saved.modules.find((m) => m.type === "fan"));
    await sql`UPDATE devices SET config = ${sql.json(saved)} WHERE id = ${deviceId}`;
    await sql`
      INSERT INTO fan_events (device_id, kind, speed, reason, message)
      VALUES (${deviceId}, 'tune', ${fanSpeed}, ${fanTune.state}, ${describeTune(fanTune)})`;
  }

  // "Ziel aus Grow-Phase": VPD-Zielbereich der aktuellen Phase einsetzen (Kurve und PID)
  if (fan && fan.vpd_phase && (fan.use_vpd || (fan.mode === "pid" && fan.pid_src === "vpd"))) {
    const [row] = await sql<{ value: { phase: string } }[]>`SELECT value FROM settings WHERE key = 'phase'`;
    const phase = getPhase(row?.value.phase);
    fan.vpd_min = phase.vpd[0];
    fan.vpd_max = phase.vpd[1];
  }

  // Entscheidungs-Feed: neuer Eintrag, wenn sich der Grund aendert oder der Sollwert spuerbar springt
  if (fan && fanReason && fanTarget !== null) {
    const [last] = await sql<{ speed: number | null; reason: string | null; created_at: Date }[]>`
      SELECT speed, reason, created_at FROM fan_events
      WHERE device_id = ${deviceId} AND kind = 'decision'
      ORDER BY created_at DESC LIMIT 1`;
    const diff = last?.speed != null ? Math.abs(last.speed - fanTarget) : Infinity;
    const age = last ? Date.now() - new Date(last.created_at).getTime() : Infinity;
    const changed = !last || last.reason !== fanReason || diff >= 10 || (diff >= 3 && age > 60_000) || (diff >= 1 && age > 30 * 60_000);
    if (changed) {
      const v = temperature !== null && humidity !== null ? calcVpd(temperature, humidity) : null;
      const message = describeDecision(fan, fanReason, fanTarget, fanDetail ?? {}, temperature, humidity, v);
      await sql`
        INSERT INTO fan_events (device_id, kind, speed, reason, message)
        VALUES (${deviceId}, 'decision', ${fanTarget}, ${fanReason}, ${message})`;
    }
  }
  return NextResponse.json({ ok: true, config }, { status: 201 });
}

/**
 * Messwerte abfragen.
 *   ?device=<id>            Pflicht
 *   ?range=1h|6h|24h|7d|30d gemittelt fuer Diagramme (Standard 24h)
 *   ?res=raw|1m|5m|15m|1h   Aufloesung ueberschreiben (Standard: passend zum Zeitraum)
 *   ?from=ISO&to=ISO        Rohdaten in einem Zeitraum (statt range)
 *   ?format=csv             als CSV-Download
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const device = p.get("device");
  if (!device) return NextResponse.json({ error: "device required" }, { status: 400 });

  await ensureSchema();

  type Row = { t: Date; temperature: number | null; humidity: number | null; fan: number | null };
  let rows: Row[];

  const from = p.get("from");
  if (from) {
    const to = p.get("to") ?? new Date().toISOString();
    rows = await sql<Row[]>`
      SELECT created_at AS t, temperature, humidity, fan
      FROM readings
      WHERE device_id = ${device} AND created_at BETWEEN ${from} AND ${to}
      ORDER BY created_at
      LIMIT 100000`;
  } else {
    const range = p.get("range");
    const def = RANGES[isRange(range) ? range : "24h"];
    const interval = def.interval;
    const res = p.get("res");
    const bucket = res && res in RESOLUTIONS ? RESOLUTIONS[res] : def.bucket;
    rows = bucket
      ? await sql<Row[]>`
          SELECT date_bin(${bucket}::interval, created_at, TIMESTAMPTZ '2000-01-01') AS t,
                 round(avg(temperature)::numeric, 1)::float8 AS temperature,
                 round(avg(humidity)::numeric, 1)::float8 AS humidity,
                 round(avg(fan)::numeric, 1)::float8 AS fan
          FROM readings
          WHERE device_id = ${device} AND created_at > now() - ${interval}::interval
          GROUP BY 1 ORDER BY 1`
      : await sql<Row[]>`
          SELECT created_at AS t, temperature, humidity, fan
          FROM readings
          WHERE device_id = ${device} AND created_at > now() - ${interval}::interval
          ORDER BY created_at
          LIMIT 50000`;
  }

  if (p.get("format") === "csv") {
    const lines = ["timestamp,temperature,humidity,fan_pct"].concat(
      rows.map((r) => `${new Date(r.t).toISOString()},${r.temperature ?? ""},${r.humidity ?? ""},${r.fan ?? ""}`),
    );
    return new NextResponse(lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="custos-${device}.csv"`,
      },
    });
  }

  return NextResponse.json(rows);
}
