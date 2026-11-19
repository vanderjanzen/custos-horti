import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

/** Daten fuer den Einrichtungs-Assistenten (nur fuer angemeldete Admins, siehe proxy.ts) */
export async function GET(req: NextRequest) {
  let firmware: { version: string; file: string; built: string } | null = null;
  try {
    const raw = await readFile(path.join(process.cwd(), "public/firmware/manifest.json"), "utf8");
    firmware = JSON.parse(raw);
  } catch {
    firmware = null;
  }

  const origin = req.headers.get("x-forwarded-host")
    ? `${req.headers.get("x-forwarded-proto") ?? "https"}://${req.headers.get("x-forwarded-host")}`
    : req.nextUrl.origin;

  return NextResponse.json({
    ingestKey: process.env.INGEST_API_KEY ?? "",
    server: process.env.INGEST_URL || `${origin}/api/readings`,
    firmware,
  });
}
