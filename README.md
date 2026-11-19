# Custos Horti

Wächter des Gartens – Monitoring & Steuerung für die Growbox.

```
ESP32 + DHT22 ──HTTP POST alle 30 s──▶ Next.js (API + Dashboard) ──▶ PostgreSQL
```

## Struktur
- `firmware/` – PlatformIO-Projekt (ESP32, Arduino). In CLion öffnen.
- `dashboard/` – Next.js App mit API-Routen und Dashboard (folgt).

## Firmware – Verkabelung (ESP32 30-Pin Terminal-Board)
| DHT22 | ESP32 |
|---|---|
| Gelb (VCC) | 3V3 |
| Weiß (GND) | GND |
| Braun (DATA) | GPIO4 (D4) |
| Grün | frei |

## Firmware – Erste Einrichtung
1. Flashen (`pio run -t upload` oder Upload in CLion).
2. ESP öffnet WLAN-Hotspot **Custos-XXXXXX** → mit Handy verbinden.
3. WLAN, Server-URL (z. B. `http://192.168.1.50:3000/api/readings`) und API-Key eintragen.
4. Neu konfigurieren: BOOT-Taste beim Einschalten 3 s gedrückt halten.

## API (geplant)
`POST /api/readings` – Header `Authorization: Bearer <API_KEY>`
```json
{ "device_id": "a1b2c3d4e5f6", "fw": "0.1.0", "temperature": 24.8, "humidity": 43.2, "rssi": -61 }
```
