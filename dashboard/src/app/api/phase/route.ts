import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { isPhaseKey } from "@/lib/phases";

export const dynamic = "force-dynamic";

type PhaseValue = { phase: string; since: string };

/** Aktuelle Grow-Phase */
export async function GET() {
  await ensureSchema();
  const [row] = await sql<{ value: PhaseValue }[]>`SELECT value FROM settings WHERE key = 'phase'`;
  return NextResponse.json(row?.value ?? { phase: "veg", since: null });
}

/** Phase setzen: { "phase": "flower" } – "since" wird nur bei echtem Wechsel neu gesetzt */
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (!isPhaseKey(body.phase)) return NextResponse.json({ error: "invalid phase" }, { status: 400 });

  await ensureSchema();
  const [current] = await sql<{ value: PhaseValue }[]>`SELECT value FROM settings WHERE key = 'phase'`;
  const value: PhaseValue =
    current?.value.phase === body.phase ? current.value : { phase: body.phase, since: new Date().toISOString() };

  await sql`
    INSERT INTO settings (key, value) VALUES ('phase', ${sql.json(value)})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
  return NextResponse.json(value);
}
