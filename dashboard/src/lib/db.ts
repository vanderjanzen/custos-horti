import postgres from "postgres";

const globalForDb = globalThis as unknown as {
  sql?: postgres.Sql;
  schemaReady?: Promise<void>;
};

export const sql =
  globalForDb.sql ??
  postgres(process.env.DATABASE_URL ?? "postgres://custos:custos@localhost:5432/custos", {
    max: 5,
  });

if (process.env.NODE_ENV !== "production") globalForDb.sql = sql;

/** Legt die Tabellen beim ersten Zugriff an (idempotent). */
export function ensureSchema(): Promise<void> {
  if (!globalForDb.schemaReady) {
    globalForDb.schemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS devices (
          id          TEXT PRIMARY KEY,
          name        TEXT,
          fw          TEXT,
          rssi        INTEGER,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
          last_seen   TIMESTAMPTZ NOT NULL DEFAULT now()
        )`;
      await sql`
        CREATE TABLE IF NOT EXISTS readings (
          id          BIGSERIAL PRIMARY KEY,
          device_id   TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
          temperature REAL,
          humidity    REAL,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )`;
      // v0.2: Geraete-Config + Zustandsdaten des Standardmoduls
      await sql`
        ALTER TABLE devices
          ADD COLUMN IF NOT EXISTS config  JSONB,
          ADD COLUMN IF NOT EXISTS uptime  INTEGER,
          ADD COLUMN IF NOT EXISTS heap    INTEGER,
          ADD COLUMN IF NOT EXISTS ip      TEXT,
          ADD COLUMN IF NOT EXISTS modules TEXT[]`;
      await sql`
        CREATE INDEX IF NOT EXISTS readings_device_time
        ON readings (device_id, created_at DESC)`;
    })().catch((err) => {
      globalForDb.schemaReady = undefined;
      throw err;
    });
  }
  return globalForDb.schemaReady;
}

export type Range = "1h" | "6h" | "24h" | "7d" | "30d";

/** Zeitraum -> Standard-Aufloesung fuer die Diagramme (Mittelwerte). */
export const RANGES: Record<Range, { interval: string; bucket: string | null }> = {
  "1h": { interval: "1 hour", bucket: null },
  "6h": { interval: "6 hours", bucket: "1 minute" },
  "24h": { interval: "24 hours", bucket: "5 minutes" },
  "7d": { interval: "7 days", bucket: "30 minutes" },
  "30d": { interval: "30 days", bucket: "2 hours" },
};

/** Manuell waehlbare Aufloesungen (?res=) */
export const RESOLUTIONS: Record<string, string | null> = {
  raw: null,
  "1m": "1 minute",
  "5m": "5 minutes",
  "15m": "15 minutes",
  "1h": "1 hour",
};

export function isRange(v: string | null): v is Range {
  return v !== null && v in RANGES;
}
