import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, authEnabled, readSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Wer ist angemeldet? (fuer die Oberflaeche: Admin oder Gast) */
export async function GET(req: NextRequest) {
  if (!authEnabled()) return NextResponse.json({ user: "admin", role: "admin" });
  const s = await readSession(req.cookies.get(SESSION_COOKIE)?.value);
  return NextResponse.json(s ? { user: s.user, role: s.role } : { user: null, role: null });
}
