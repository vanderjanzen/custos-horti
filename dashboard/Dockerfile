# Build-Kontext ist der Projekt-Hauptordner (siehe docker-compose.yml),
# damit die ESP-Firmware gleich mitgebaut und im Dashboard ausgeliefert wird.

# --- 1. ESP32-Firmware bauen -------------------------------------------------
FROM python:3.12-slim AS firmware
RUN pip install --no-cache-dir "platformio==6.1.*" "esptool==4.8.1"
WORKDIR /fw
# Erst nur die Projektdatei: Toolchain + Bibliotheken landen im Docker-Cache
COPY firmware/platformio.ini ./
RUN mkdir -p src && echo 'void setup(){} void loop(){}' > src/main.cpp && pio run -e esp32dev && rm -rf src .pio/build
COPY firmware/src ./src
RUN pio run -e esp32dev \
 && B=.pio/build/esp32dev \
 && VERSION=$(grep -oP 'FW_VERSION=\\"\K[^\\"]+' platformio.ini) \
 && mkdir -p /out \
 && python -m esptool --chip esp32 merge_bin -o /out/custos-esp32.bin \
      --flash_mode dio --flash_freq 40m --flash_size 4MB \
      0x1000 $B/bootloader.bin 0x8000 $B/partitions.bin \
      0xe000 /root/.platformio/packages/framework-arduinoespressif32/tools/partitions/boot_app0.bin \
      0x10000 $B/firmware.bin \
 && printf '{"version":"%s","file":"/firmware/custos-esp32.bin","built":"%s"}\n' "$VERSION" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > /out/manifest.json \
 && cat /out/manifest.json

# --- 2. Dashboard ------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY dashboard/package.json dashboard/package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY dashboard/ .
COPY --from=firmware /out ./public/firmware
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
