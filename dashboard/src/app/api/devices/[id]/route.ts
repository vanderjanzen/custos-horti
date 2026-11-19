import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";

/** Geraet umbenennen: PATCH { "name": "Zelt links" } */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 64) || null : null;
  await ensureSchema();
  await sql`UPDATE devices SET name = ${name} WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
