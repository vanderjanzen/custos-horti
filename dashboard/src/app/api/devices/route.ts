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
};

/** Alle Geraete mit ihrer letzten Messung */
export async function GET() {
  await ensureSchema();
  const rows = await sql<DeviceSummary[]>`
    SELECT d.id, d.name, d.fw, d.rssi, d.last_seen,
           r.temperature, r.humidity
    FROM devices d
    LEFT JOIN LATERAL (
      SELECT temperature, humidity FROM readings
      WHERE device_id = d.id ORDER BY created_at DESC LIMIT 1
    ) r ON true
    ORDER BY d.last_seen DESC`;
  return NextResponse.json(rows);
}
