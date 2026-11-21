import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import type { FanEvent } from "@/lib/fanEvents";

export const dynamic = "force-dynamic";

/** Entscheidungs-Feed des Luefters: ?device=<id>&limit=60 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const device = p.get("device");
  if (!device) return NextResponse.json({ error: "device required" }, { status: 400 });
  const limit = Math.min(Math.max(Number(p.get("limit")) || 60, 1), 300);
  await ensureSchema();
  const rows = await sql<FanEvent[]>`
    SELECT id::text, kind, speed, reason, message, created_at
    FROM fan_events WHERE device_id = ${device}
    ORDER BY created_at DESC LIMIT ${limit}`;
  return NextResponse.json(rows);
}
