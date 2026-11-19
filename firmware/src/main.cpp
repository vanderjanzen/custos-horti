// Custos Horti – Sensor-Node
// ESP32 + DHT22 -> HTTP POST alle 30 s an den Custos-Server.
// Eine Firmware fuer alle Geraete: WLAN, Server-URL und API-Key
// werden beim ersten Start ueber den Hotspot "Custos-XXXXXX" eingetragen.

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiManager.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <Preferences.h>
#include <ArduinoOTA.h>
#include <ArduinoJson.h>
#include <DHT.h>

#ifndef FW_VERSION
#define FW_VERSION "dev"
#endif

// ---- Hardware ----------------------------------------------------------
constexpr uint8_t DHT_PIN = 4;          // D4 am Terminal-Board
constexpr uint8_t BOOT_BUTTON = 0;      // BOOT-Taste: beim Start halten = Reset
constexpr uint32_t SEND_INTERVAL_MS = 30000;

DHT dht(DHT_PIN, DHT22);
Preferences prefs;

// ---- Konfiguration (persistent im Flash) -------------------------------
String deviceId;
String serverUrl;
String apiKey;
bool shouldSaveConfig = false;
uint32_t lastSend = 0;

String makeDeviceId() {
  uint64_t mac = ESP.getEfuseMac();
  char buf[13];
  snprintf(buf, sizeof(buf), "%012llx", mac);
  return String(buf);
}

void loadConfig() {
  prefs.begin("custos", true);
  serverUrl = prefs.getString("url", "");
  apiKey = prefs.getString("key", "");
  prefs.end();
}

void saveConfig() {
  prefs.begin("custos", false);
  prefs.putString("url", serverUrl);
  prefs.putString("key", apiKey);
  prefs.end();
}

void factoryResetIfButtonHeld() {
  pinMode(BOOT_BUTTON, INPUT_PULLUP);
  uint32_t start = millis();
  while (digitalRead(BOOT_BUTTON) == LOW) {
    if (millis() - start > 3000) {
      Serial.println("[custos] Reset: WLAN und Konfiguration geloescht");
      WiFiManager wm;
      wm.resetSettings();
      prefs.begin("custos", false);
      prefs.clear();
      prefs.end();
      delay(500);
      ESP.restart();
    }
    delay(10);
  }
}

void setupWifi() {
  WiFiManager wm;
  WiFiManagerParameter pUrl("url", "Server-URL (z.B. http://192.168.1.50:3000/api/readings)",
                            serverUrl.c_str(), 128);
  WiFiManagerParameter pKey("key", "API-Key", apiKey.c_str(), 64);
  wm.addParameter(&pUrl);
  wm.addParameter(&pKey);
  wm.setSaveParamsCallback([]() { shouldSaveConfig = true; });
  wm.setConfigPortalTimeout(300);

  String apName = "Custos-" + deviceId.substring(6);
  // Ohne Server-URL immer Portal zeigen, sonst nur wenn WLAN fehlt
  bool ok = serverUrl.isEmpty() ? wm.startConfigPortal(apName.c_str())
                                : wm.autoConnect(apName.c_str());
  if (!ok) {
    Serial.println("[custos] Keine WLAN-Verbindung, Neustart");
    ESP.restart();
  }

  if (shouldSaveConfig) {
    serverUrl = pUrl.getValue();
    apiKey = pKey.getValue();
    saveConfig();
  }
  Serial.printf("[custos] WLAN ok, IP %s\n", WiFi.localIP().toString().c_str());
}

void setupOta() {
  String host = "custos-" + deviceId.substring(6);
  ArduinoOTA.setHostname(host.c_str());
  ArduinoOTA.begin();
}

bool sendReading(float t, float h) {
  if (serverUrl.isEmpty()) return false;

  JsonDocument doc;
  doc["device_id"] = deviceId;
  doc["fw"] = FW_VERSION;
  doc["temperature"] = round(t * 10) / 10.0;
  doc["humidity"] = round(h * 10) / 10.0;
  doc["rssi"] = WiFi.RSSI();
  String body;
  serializeJson(doc, body);

  HTTPClient http;
  WiFiClient plain;
  WiFiClientSecure secure;
  if (serverUrl.startsWith("https")) {
    secure.setInsecure();  // TODO: Zertifikat pruefen, sobald Domain feststeht
    http.begin(secure, serverUrl);
  } else {
    http.begin(plain, serverUrl);
  }
  http.addHeader("Content-Type", "application/json");
  if (!apiKey.isEmpty()) http.addHeader("Authorization", "Bearer " + apiKey);
  http.setTimeout(5000);

  int code = http.POST(body);
  http.end();
  Serial.printf("[custos] POST %s -> %d\n", body.c_str(), code);
  return code >= 200 && code < 300;
}

void measureAndSend() {
  float h = dht.readHumidity();
  float t = dht.readTemperature();
  if (isnan(h) || isnan(t)) {  // DHT22 liefert gelegentlich Aussetzer
    delay(2100);
    h = dht.readHumidity();
    t = dht.readTemperature();
  }
  if (isnan(h) || isnan(t)) {
    Serial.println("[custos] DHT22 Lesefehler (Verkabelung pruefen)");
    return;
  }
  sendReading(t, h);
}

void setup() {
  Serial.begin(115200);
  delay(200);
  deviceId = makeDeviceId();
  Serial.printf("\n[custos] Custos Horti Node %s, ID %s\n", FW_VERSION, deviceId.c_str());

  factoryResetIfButtonHeld();
  loadConfig();
  dht.begin();
  setupWifi();
  setupOta();

  lastSend = millis() - SEND_INTERVAL_MS + 3000;  // erste Messung nach 3 s
}

void loop() {
  ArduinoOTA.handle();

  if (WiFi.status() != WL_CONNECTED) {
    WiFi.reconnect();
    delay(1000);
    return;
  }

  if (millis() - lastSend >= SEND_INTERVAL_MS) {
    lastSend = millis();
    measureAndSend();
  }
}
