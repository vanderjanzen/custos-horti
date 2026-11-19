import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

export type LogEntry = {
  id: string;
  device_id: string;
  device_name: string | null;
  temperature: number | null;
  humidity: number | null;
  created_at: string;
};

/**
 * Rohe Messwerte, neueste zuerst.
 *   ?limit=50 (max 500)   ?before=<id> fuer "mehr laden"   ?device=<id> Filter
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const limit = Math.min(Math.max(Number(p.get("limit")) || 50, 1), 500);
  const before = p.get("before");
  const device = p.get("device");

  await ensureSchema();
  const rows = await sql<LogEntry[]>`
    SELECT r.id::text AS id, r.device_id, d.name AS device_name,
           r.temperature, r.humidity, r.created_at
    FROM readings r
    JOIN devices d ON d.id = r.device_id
    WHERE true
      ${device ? sql`AND r.device_id = ${device}` : sql``}
      ${before ? sql`AND r.id < ${before}` : sql``}
    ORDER BY r.id DESC
    LIMIT ${limit}`;
  return NextResponse.json(rows);
}
