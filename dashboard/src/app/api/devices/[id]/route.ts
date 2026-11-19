import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { sanitizeConfig } from "@/lib/modules";

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
  await sql`
    INSERT INTO devices (id, name, config, last_seen)
    VALUES (${id}, ${name}, ${config ? sql.json(config) : null}, to_timestamp(0))
    ON CONFLICT (id) DO UPDATE SET
      name   = CASE WHEN ${hasName} THEN EXCLUDED.name ELSE devices.name END,
      config = COALESCE(EXCLUDED.config, devices.config)`;
  return NextResponse.json({ ok: true, config });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await ensureSchema();
  await sql`DELETE FROM devices WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
