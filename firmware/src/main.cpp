// Custos Horti – Sensor-Node Firmware
//
// Eine Firmware fuer alle Geraete. Ablauf:
//  1. Im Dashboard unter "Geraet hinzufuegen" Module waehlen und WLAN eintragen.
//  2. Der Browser flasht diese Firmware und schickt danach die Config per USB (Serial).
//  3. Der ESP verbindet sich mit dem WLAN und schickt alle X Sekunden Messwerte.
//  4. Der Server kann die Modul-Config spaeter aendern (kommt mit jeder Antwort mit).
//
// Serial-Protokoll (115200 Baud, eine JSON-Zeile pro Befehl):
//   -> {"cmd":"hello"}
//   <- CUSTOS:{"id":"…","fw":"…","chip":"…","configured":false,"modules":["core","dht"]}
//   -> {"cmd":"provision","wifi":{"ssid":"…","pass":"…"},"server":"…","key":"…",
//       "interval":30,"modules":[{"type":"dht","pin":4,"model":"DHT22"}]}
//   <- CUSTOS:{"ok":true,"id":"…"}   (danach Neustart)
//   -> {"cmd":"reset"}               (alles loeschen)

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <Preferences.h>
#include <ArduinoOTA.h>
#include <ArduinoJson.h>
#include <memory>
#include <vector>
#if __has_include(<esp_mac.h>)
#include <esp_mac.h>
#endif

#include "modules/registry.h"

#ifndef FW_VERSION
#define FW_VERSION "dev"
#endif

constexpr uint8_t BOOT_BUTTON = 0;  // beim Start 3 s halten = Werksreset

// ---- Konfiguration -------------------------------------------------------
struct Config {
  String ssid;
  String pass;
  String server;
  String key;
  uint32_t interval = 30;
  String modules = "[]";  // JSON-Array der aktiven Module
};

Config cfg;
Preferences prefs;
String deviceId;
std::vector<std::unique_ptr<Module>> modules;

uint32_t lastSend = 0;
uint32_t lastWifiTry = 0;
bool otaStarted = false;
String serialBuf;

void loadConfig() {
  prefs.begin("custos", true);
  cfg.ssid = prefs.getString("ssid", "");
  cfg.pass = prefs.getString("pass", "");
  cfg.server = prefs.getString("server", "");
  cfg.key = prefs.getString("key", "");
  cfg.interval = prefs.getUInt("interval", 30);
  cfg.modules = prefs.getString("modules", "[]");
  prefs.end();
  if (cfg.interval < 5) cfg.interval = 5;
}

void saveConfig() {
  prefs.begin("custos", false);
  prefs.putString("ssid", cfg.ssid);
  prefs.putString("pass", cfg.pass);
  prefs.putString("server", cfg.server);
  prefs.putString("key", cfg.key);
  prefs.putUInt("interval", cfg.interval);
  prefs.putString("modules", cfg.modules);
  prefs.end();
}

void clearConfigAndRestart() {
  prefs.begin("custos", false);
  prefs.clear();
  prefs.end();
  Serial.println("[custos] Konfiguration geloescht, Neustart");
  delay(300);
  ESP.restart();
}

String makeDeviceId() {
  uint8_t mac[6] = {0};
  esp_read_mac(mac, ESP_MAC_WIFI_STA);
  char buf[13];
  snprintf(buf, sizeof(buf), "%02x%02x%02x%02x%02x%02x", mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
  return String(buf);
}

// ---- Module --------------------------------------------------------------
void buildModules() {
  modules.clear();
  modules.emplace_back(new CoreModule());

  JsonDocument doc;
  if (deserializeJson(doc, cfg.modules)) {
    Serial.println("[custos] Modul-Config ungueltig, nur Standardmodul aktiv");
    return;
  }
  for (JsonObjectConst m : doc.as<JsonArrayConst>()) {
    const char* type = m["type"] | "";
    Module* mod = createModule(type);
    if (!mod) {
      Serial.printf("[custos] Unbekanntes Modul '%s' uebersprungen\n", type);
      continue;
    }
    mod->begin(m);
    modules.emplace_back(mod);
  }
  Serial.printf("[custos] %u Modul(e) aktiv\n", (unsigned)modules.size());
}

// Vom Server geschickte Config uebernehmen, falls sie sich geaendert hat
void applyServerConfig(JsonVariantConst c) {
  bool changed = false;

  uint32_t interval = c["interval"] | cfg.interval;
  if (interval >= 5 && interval != cfg.interval) {
    cfg.interval = interval;
    changed = true;
  }

  JsonVariantConst mods = c["modules"];
  if (mods.is<JsonArrayConst>()) {
    String s;
    serializeJson(mods, s);
    if (s != cfg.modules) {
      cfg.modules = s;
      buildModules();
      changed = true;
    }
  }

  if (changed) {
    saveConfig();
    Serial.println("[custos] Neue Config vom Server uebernommen");
  }
}

// ---- Serial-Provisioning -------------------------------------------------
void reply(JsonDocument& doc) {
  Serial.print("CUSTOS:");
  serializeJson(doc, Serial);
  Serial.println();
}

void sendHello() {
  JsonDocument out;
  out["id"] = deviceId;
  out["fw"] = FW_VERSION;
  out["chip"] = ESP.getChipModel();
  out["configured"] = cfg.ssid.length() > 0;
  JsonArray a = out["modules"].to<JsonArray>();
  for (const char* m : AVAILABLE_MODULES) a.add(m);
  reply(out);
}

void processLine(const String& line) {
  if (!line.startsWith("{")) return;
  JsonDocument in;
  if (deserializeJson(in, line)) return;
  const char* cmd = in["cmd"] | "";

  if (strcmp(cmd, "hello") == 0) {
    sendHello();
  } else if (strcmp(cmd, "provision") == 0) {
    cfg.ssid = (const char*)(in["wifi"]["ssid"] | "");
    cfg.pass = (const char*)(in["wifi"]["pass"] | "");
    cfg.server = (const char*)(in["server"] | "");
    cfg.key = (const char*)(in["key"] | "");
    cfg.interval = in["interval"] | 30;
    String mods;
    serializeJson(in["modules"], mods);
    cfg.modules = in["modules"].is<JsonArray>() ? mods : String("[]");
    saveConfig();

    JsonDocument out;
    out["ok"] = true;
    out["id"] = deviceId;
    reply(out);
    Serial.flush();
    delay(500);
    ESP.restart();
  } else if (strcmp(cmd, "reset") == 0) {
    clearConfigAndRestart();
  }
}

void handleSerial() {
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\n') {
      processLine(serialBuf);
      serialBuf = "";
    } else if (c != '\r' && serialBuf.length() < 2048) {
      serialBuf += c;
    }
  }
}

// ---- Netzwerk ------------------------------------------------------------
void startWifi() {
  if (cfg.ssid.isEmpty()) return;
  WiFi.mode(WIFI_STA);
  String host = "custos-" + deviceId.substring(6);
  WiFi.setHostname(host.c_str());
  WiFi.begin(cfg.ssid.c_str(), cfg.pass.c_str());
  lastWifiTry = millis();
  Serial.printf("[custos] Verbinde mit WLAN '%s'...\n", cfg.ssid.c_str());
}

void startOta() {
  String host = "custos-" + deviceId.substring(6);
  ArduinoOTA.setHostname(host.c_str());
  ArduinoOTA.begin();
  otaStarted = true;
}

bool sendReadings() {
  if (cfg.server.isEmpty()) return false;

  JsonDocument doc;
  doc["device_id"] = deviceId;
  doc["fw"] = FW_VERSION;
  JsonObject root = doc.as<JsonObject>();
  for (auto& m : modules) m->collect(root);
  JsonArray active = doc["modules"].to<JsonArray>();
  for (auto& m : modules) active.add(m->type());

  String body;
  serializeJson(doc, body);

  HTTPClient http;
  WiFiClient plain;
  WiFiClientSecure secure;
  if (cfg.server.startsWith("https")) {
    secure.setInsecure();  // TODO: Zertifikat pruefen
    http.begin(secure, cfg.server);
  } else {
    http.begin(plain, cfg.server);
  }
  http.addHeader("Content-Type", "application/json");
  if (!cfg.key.isEmpty()) http.addHeader("Authorization", "Bearer " + cfg.key);
  http.setTimeout(5000);

  int code = http.POST(body);
  String resp = code > 0 ? http.getString() : String();
  http.end();
  Serial.printf("[custos] POST %s -> %d\n", body.c_str(), code);

  if (code >= 200 && code < 300 && resp.length()) {
    JsonDocument r;
    if (!deserializeJson(r, resp) && !r["config"].isNull()) applyServerConfig(r["config"]);
  }
  return code >= 200 && code < 300;
}

// ---- Setup & Loop --------------------------------------------------------
void factoryResetIfButtonHeld() {
  pinMode(BOOT_BUTTON, INPUT_PULLUP);
  uint32_t start = millis();
  while (digitalRead(BOOT_BUTTON) == LOW) {
    if (millis() - start > 3000) clearConfigAndRestart();
    delay(10);
  }
}

void setup() {
  Serial.begin(115200);
  delay(200);
  deviceId = makeDeviceId();
  Serial.printf("\n[custos] Custos Horti Node %s, ID %s\n", FW_VERSION, deviceId.c_str());

  factoryResetIfButtonHeld();
  loadConfig();
  buildModules();
  sendHello();

  if (cfg.ssid.isEmpty()) {
    Serial.println("[custos] Nicht eingerichtet - warte auf Einrichtung ueber das Dashboard (USB)");
  } else {
    startWifi();
  }
  lastSend = millis() - cfg.interval * 1000UL + 5000;  // erste Messung ~5 s nach WLAN
}

void loop() {
  handleSerial();
  for (auto& m : modules) m->loop();
  if (cfg.ssid.isEmpty()) return;

  if (WiFi.status() != WL_CONNECTED) {
    if (millis() - lastWifiTry > 15000) {
      Serial.println("[custos] WLAN getrennt, neuer Versuch");
      WiFi.disconnect();
      WiFi.begin(cfg.ssid.c_str(), cfg.pass.c_str());
      lastWifiTry = millis();
    }
    delay(10);
    return;
  }

  if (!otaStarted) {
    Serial.printf("[custos] WLAN ok, IP %s\n", WiFi.localIP().toString().c_str());
    startOta();
  }
  ArduinoOTA.handle();

  if (millis() - lastSend >= cfg.interval * 1000UL) {
    lastSend = millis();
    sendReadings();
  }
}
