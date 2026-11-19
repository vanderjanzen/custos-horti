// Signierte Session-Cookies (HMAC-SHA256), funktioniert in Proxy und Route Handlern.

export const SESSION_COOKIE = "custos_session";
export const SESSION_DAYS = 30;

export type Role = "admin" | "guest";
export type Session = { user: string; role: Role; exp: number };

const enc = new TextEncoder();

function b64url(bytes: Uint8Array) {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string) {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function secret() {
  return process.env.SESSION_SECRET || `custos:${process.env.ADMIN_PASSWORD ?? ""}`;
}

async function hmac(data: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

function equal(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Login ist nur aktiv, wenn ADMIN_PASSWORD gesetzt ist (lokal ohne Passwort = offen). */
export function authEnabled() {
  return Boolean(process.env.ADMIN_PASSWORD);
}

export async function createSession(user: string, role: Role): Promise<string> {
  const payload: Session = { user, role, exp: Date.now() + SESSION_DAYS * 86400_000 };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  return `${body}.${b64url(await hmac(body))}`;
}

export async function readSession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    if (!equal(fromB64url(sig), await hmac(body))) return null;
    const s = JSON.parse(new TextDecoder().decode(fromB64url(body))) as Session;
    return s.exp > Date.now() ? s : null;
  } catch {
    return null;
  }
}

async function matches(user: string, password: string, expectedUser: string, expectedPw: string) {
  const [a, b] = await Promise.all([hmac(`${user}\n${password}`), hmac(`${expectedUser}\n${expectedPw}`)]);
  return expectedPw.length > 0 && equal(a, b);
}

/**
 * Passwortvergleich ohne Timing-Leck. Gibt die Rolle zurueck oder null.
 * Admin: ADMIN_USER / ADMIN_PASSWORD · Gast (nur lesen): GUEST_USER / GUEST_PASSWORD
 */
export async function checkCredentials(user: string, password: string): Promise<Role | null> {
  if (await matches(user, password, process.env.ADMIN_USER || "admin", process.env.ADMIN_PASSWORD || "")) {
    return "admin";
  }
  if (await matches(user, password, process.env.GUEST_USER || "gast", process.env.GUEST_PASSWORD || "")) {
    return "guest";
  }
  return null;
}
