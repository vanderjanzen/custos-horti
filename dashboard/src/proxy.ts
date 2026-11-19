import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, authEnabled, readSession } from "@/lib/session";

// Oeffentlich: Login-Seite/-API und das Einliefern von Messwerten (eigener API-Key)
function isPublic(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/api/auth/")) return true;
  if (pathname === "/api/readings" && req.method === "POST") return true;
  return false;
}

export async function proxy(req: NextRequest) {
  if (!authEnabled() || isPublic(req)) return NextResponse.next();

  const session = await readSession(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();

  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "login required" }, { status: 401 });
  }
  const url = new URL("/login", req.url);
  if (req.nextUrl.pathname !== "/") url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico).*)"],
};
