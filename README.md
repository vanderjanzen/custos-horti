# Custos Horti

Wächter des Gartens – Monitoring & Steuerung für die Growbox.

```
ESP32 (Module: Standard, DHT22, …) ──HTTP POST──▶ Next.js (API + Dashboard) ──▶ PostgreSQL
            ▲                                        │
            └──── USB/Web Serial: flashen + einrichten (Browser, "Gerät hinzufügen")
```

## Struktur
- `firmware/` – eine ESP32-Firmware für alle Geräte (PlatformIO). Module in `src/modules/`.
- `dashboard/` – Next.js: Dashboard, Logs, Geräte, Flash-Assistent, API, Login.
- `docker-compose.yml` – Dashboard + Postgres. Der Docker-Build kompiliert die Firmware mit
  und liefert sie unter `/firmware/custos-esp32.bin` aus.

## Umgebungsvariablen (Dokploy → Environment)
| Variable | Zweck |
|---|---|
| `POSTGRES_PASSWORD` | DB-Passwort (nur beim ersten Start wirksam) |
| `INGEST_API_KEY` | Key, mit dem die ESPs Messwerte schicken |
| `INGEST_URL` | Adresse für die ESPs, z. B. `http://192.168.178.165:3100/api/readings` |
| `ADMIN_USER` / `ADMIN_PASSWORD` | Login fürs Dashboard (ohne Passwort = offen) |
| `SESSION_SECRET` | langer Zufallswert zum Signieren der Login-Cookies |

## Neues Modul hinzufügen
1. `firmware/src/modules/XyzModule.h` (erbt von `Module`) + in `registry.h` eintragen.
2. In `dashboard/src/lib/modules.ts` mit Parametern beschreiben.
3. Pushen → Dokploy baut Firmware + Dashboard neu.

## Serial-Protokoll (115200 Baud)
`{"cmd":"hello"}` → `CUSTOS:{"id":…}` · `{"cmd":"provision",…}` → `CUSTOS:{"ok":true}` · `{"cmd":"reset"}`
