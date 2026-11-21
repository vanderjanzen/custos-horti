import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { sanitizeConfig, type DeviceConfig } from "@/lib/modules";
import { describeConfigChange } from "@/lib/fanEvents";

/**
 * Geraet anlegen/aendern. Body (alles optional):
 *   { "name": "Zelt links", "config": { "interval": 30, "modules": [{ "type": "dht", "pin": 4, "model": "DHT22" }] } }
 * Legt das Geraet an, falls es noch nicht existiert (beim Einrichten ueber USB).
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (id.length > 64) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const hasName = "name" in body;
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 64) || null : null;
  const config = "config" in body ? sanitizeConfig(body.config) : null;

  await ensureSchema();
  const [before] = await sql<{ config: DeviceConfig | null }[]>`SELECT config FROM devices WHERE id = ${id}`;
  await sql`
    INSERT INTO devices (id, name, config, last_seen)
    VALUES (${id}, ${name}, ${config ? sql.json(config) : null}, to_timestamp(0))
    ON CONFLICT (id) DO UPDATE SET
      name   = CASE WHEN ${hasName} THEN EXCLUDED.name ELSE devices.name END,
      config = COALESCE(EXCLUDED.config, devices.config)`;

  // Aenderungen am Luefter im Entscheidungs-Feed vermerken
  const fanAfter = config?.modules.find((m) => m.type === "fan");
  if (fanAfter) {
    const prev = before?.config ? sanitizeConfig(before.config).modules.find((m) => m.type === "fan") : undefined;
    const message = describeConfigChange(prev, fanAfter);
    if (message)
      await sql`INSERT INTO fan_events (device_id, kind, reason, message) VALUES (${id}, 'config', null, ${message})`;
  }
  return NextResponse.json({ ok: true, config });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await ensureSchema();
  await sql`DELETE FROM devices WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
