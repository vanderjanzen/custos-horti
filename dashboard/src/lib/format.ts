export const ONLINE_MS = 90_000;

export function isOnline(lastSeen: string, now = Date.now()) {
  return now - new Date(lastSeen).getTime() < ONLINE_MS;
}

export function ago(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `vor ${s} s`;
  if (s < 3600) return `vor ${Math.round(s / 60)} min`;
  if (s < 86400) return `vor ${Math.round(s / 3600)} h`;
  return `vor ${Math.round(s / 86400)} T`;
}

export function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function deviceLabel(d: { id: string; name: string | null }) {
  return d.name ?? `Sensor ${d.id.slice(-6)}`;
}
