import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_DAYS, checkCredentials, createSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const user = typeof body.user === "string" ? body.user.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  const role = await checkCredentials(user, password);
  if (!role) {
    await new Promise((r) => setTimeout(r, 600)); // bremst Durchprobieren
    return NextResponse.json({ error: "Benutzer oder Passwort falsch" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, role });
  res.cookies.set(SESSION_COOKIE, await createSession(user, role), {
    httpOnly: true,
    sameSite: "lax",
    secure: req.headers.get("x-forwarded-proto") === "https" || req.nextUrl.protocol === "https:",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
  return res;
}
