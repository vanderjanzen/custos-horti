import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

export type DeviceSummary = {
  id: string;
  name: string | null;
  fw: string | null;
  rssi: number | null;
  last_seen: string;
  temperature: number | null;
  humidity: number | null;
  uptime: number | null;
  heap: number | null;
  ip: string | null;
  modules: string[] | null;
  config: { interval: number; modules: { type: string; [k: string]: string | number }[] } | null;
};

/** Alle Geraete mit ihrer letzten Messung */
export async function GET() {
  await ensureSchema();
  const rows = await sql<DeviceSummary[]>`
    SELECT d.id, d.name, d.fw, d.rssi, d.last_seen, d.uptime, d.heap, d.ip, d.modules, d.config,
           r.temperature, r.humidity
    FROM devices d
    LEFT JOIN LATERAL (
      SELECT temperature, humidity FROM readings
      WHERE device_id = d.id ORDER BY created_at DESC LIMIT 1
    ) r ON true
    ORDER BY d.last_seen DESC`;
  return NextResponse.json(rows);
}
