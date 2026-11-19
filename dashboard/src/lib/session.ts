// Signierte Session-Cookies (HMAC-SHA256), funktioniert in Proxy und Route Handlern.

export const SESSION_COOKIE = "custos_session";
export const SESSION_DAYS = 30;

export type Session = { user: string; role: "admin"; exp: number };

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

export async function createSession(user: string): Promise<string> {
  const payload: Session = { user, role: "admin", exp: Date.now() + SESSION_DAYS * 86400_000 };
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

/** Passwortvergleich ohne Timing-Leck */
export async function checkCredentials(user: string, password: string) {
  const expectedUser = process.env.ADMIN_USER || "admin";
  const expectedPw = process.env.ADMIN_PASSWORD || "";
  const [a, b] = await Promise.all([hmac(`${user}\n${password}`), hmac(`${expectedUser}\n${expectedPw}`)]);
  return expectedPw.length > 0 && equal(a, b);
}
