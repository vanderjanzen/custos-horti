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
  if (session?.role === "guest") return guestRules(req);
  if (session) return NextResponse.next();

  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "login required" }, { status: 401 });
  }
  const url = new URL("/login", req.url);
  if (req.nextUrl.pathname !== "/") url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

// Gast: nur lesen. Keine Aenderungen, keine Einrichtung, kein Zugriff auf den Geraete-Key.
function guestRules(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");
  const readOnly = req.method === "GET" || req.method === "HEAD";

  if (isApi && (!readOnly || pathname === "/api/provision")) {
    return NextResponse.json({ error: "Gastzugang: nur lesen" }, { status: 403 });
  }
  if (pathname.startsWith("/geraete/neu")) {
    return NextResponse.redirect(new URL("/geraete", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico).*)"],
};
