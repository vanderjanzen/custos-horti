#pragma once
#include <vector>
#include "Module.h"

// Tuya-MCU-Protokoll: Der ESP spielt das WLAN-Modul eines Tuya-Geraets
// (z. B. VEVOR-Luefter-Controller) und liest dessen Datenpunkte (DPs) mit.
// Config: { "type": "tuya", "rx": 16, "tx": 17, "baud": 0 }   (baud 0 = automatisch 9600/115200)
//
// Rahmen: 55 AA <ver> <cmd> <lenH> <lenL> <data…> <checksum = Summe aller Bytes & 0xFF>
class TuyaModule : public Module {
 public:
  ~TuyaModule() override { Serial2.end(); }

  const char* type() const override { return "tuya"; }

  void begin(JsonObjectConst cfg) override {
    rx_ = cfg["rx"] | 16;
    tx_ = cfg["tx"] | 17;
    int baud = cfg["baud"] | 0;
    autoBaud_ = baud == 0;
    baud_ = autoBaud_ ? 9600 : baud;
    open();
  }

  void loop() override {
    while (Serial2.available()) feed((uint8_t)Serial2.read());

    uint32_t now = millis();
    // Herzschlag: anfangs alle 3 s (Suche), danach alle 15 s
    if (now - lastHeartbeat_ > (gotFrame_ ? 15000UL : 3000UL)) {
      lastHeartbeat_ = now;
      send(0x00, nullptr, 0);
    }
    // Einrichtungsfolge nach der ersten Antwort, ein Schritt alle 400 ms
    if (initStep_ > 0 && initStep_ < 5 && now - lastInit_ > 400) {
      lastInit_ = now;
      runInitStep();
    }
    // Keine Antwort? Baudrate wechseln
    if (autoBaud_ && !gotFrame_ && now - baudSince_ > 10000) {
      baud_ = baud_ == 9600 ? 115200 : 9600;
      open();
    }
    // Alle 60 s alle DPs neu anfragen
    if (initStep_ >= 5 && now - lastQuery_ > 60000) {
      lastQuery_ = now;
      send(0x08, nullptr, 0);
    }
  }

  void collect(JsonObject out) override {
    out["tuya_baud"] = baud_;
    out["tuya_frames"] = frames_;
    if (product_.length()) out["tuya_product"] = product_;
    JsonObject dps = out["tuya_dp"].to<JsonObject>();
    for (const Dp& d : dps_) {
      String key(d.id);
      if (d.type == 0 || d.type == 3) dps[key] = d.text;
      else dps[key] = d.value;
    }
  }

 private:
  struct Dp {
    uint8_t id;
    uint8_t type;
    int32_t value;
    String text;
  };

  uint8_t rx_ = 16, tx_ = 17;
  uint32_t baud_ = 9600;
  bool autoBaud_ = true;
  bool gotFrame_ = false;
  uint32_t frames_ = 0;
  uint32_t baudSince_ = 0, lastHeartbeat_ = 0, lastInit_ = 0, lastQuery_ = 0;
  uint8_t initStep_ = 0;
  String product_;
  std::vector<Dp> dps_;
  uint8_t buf_[512];
  size_t len_ = 0;

  void open() {
    Serial2.end();
    Serial2.begin(baud_, SERIAL_8N1, rx_, tx_);
    baudSince_ = millis();
    len_ = 0;
    Serial.printf("[tuya] UART RX=GPIO%u TX=GPIO%u, %u Baud\n", rx_, tx_, (unsigned)baud_);
  }

  void send(uint8_t cmd, const uint8_t* data, uint16_t n) {
    uint8_t head[6] = {0x55, 0xAA, 0x00, cmd, (uint8_t)(n >> 8), (uint8_t)(n & 0xFF)};
    uint8_t sum = 0;
    for (uint8_t b : head) sum += b;
    for (uint16_t i = 0; i < n; i++) sum += data[i];
    Serial2.write(head, 6);
    if (n) Serial2.write(data, n);
    Serial2.write(sum);
    if (cmd != 0x00 || gotFrame_) Serial.printf("[tuya] -> cmd 0x%02X (%u Bytes)\n", cmd, n);
  }

  void runInitStep() {
    static const uint8_t wifiConnected = 0x04;  // "mit Cloud verbunden"
    switch (initStep_) {
      case 1: send(0x01, nullptr, 0); break;             // Produktinfo
      case 2: send(0x02, nullptr, 0); break;             // Arbeitsmodus
      case 3: send(0x03, &wifiConnected, 1); break;      // WLAN-Status melden
      case 4: send(0x08, nullptr, 0); lastQuery_ = millis(); break;  // alle DPs abfragen
    }
    initStep_++;
  }

  void feed(uint8_t b) {
    if (len_ == 0 && b != 0x55) return;
    if (len_ == 1 && b != 0xAA) {
      len_ = b == 0x55 ? 1 : 0;
      return;
    }
    buf_[len_++] = b;
    if (len_ >= 6) {
      uint16_t dl = (buf_[4] << 8) | buf_[5];
      if (dl > sizeof(buf_) - 7) {
        len_ = 0;
        return;
      }
      if (len_ == 7u + dl) {
        handle(dl);
        len_ = 0;
      }
    }
    if (len_ >= sizeof(buf_)) len_ = 0;
  }

  void logFrame(uint16_t total) {
    Serial.print("[tuya] <- ");
    for (uint16_t i = 0; i < total && i < 64; i++) Serial.printf("%02X ", buf_[i]);
    if (total > 64) Serial.print("…");
    Serial.println();
  }

  void handle(uint16_t dl) {
    uint8_t sum = 0;
    for (uint16_t i = 0; i < 6 + dl; i++) sum += buf_[i];
    if (sum != buf_[6 + dl]) {
      Serial.println("[tuya] Pruefsumme falsch, Rahmen verworfen");
      return;
    }
    if (!gotFrame_) Serial.printf("[tuya] Controller antwortet bei %u Baud!\n", (unsigned)baud_);
    gotFrame_ = true;
    frames_++;
    logFrame(7 + dl);

    uint8_t cmd = buf_[3];
    const uint8_t* d = buf_ + 6;

    switch (cmd) {
      case 0x00:  // Herzschlag-Antwort
        if (initStep_ == 0) initStep_ = 1;
        break;
      case 0x01:  // Produktinfo (JSON-Text)
        product_ = "";
        for (uint16_t i = 0; i < dl && i < 200; i++) product_ += (char)d[i];
        Serial.printf("[tuya] Produkt: %s\n", product_.c_str());
        break;
      case 0x02:
        Serial.println("[tuya] Arbeitsmodus bestaetigt");
        break;
      case 0x07:  // DP-Statusmeldung
        parseDps(d, dl);
        break;
      case 0x2B: {  // Controller fragt WLAN-Status
        static const uint8_t ok = 0x04;
        send(0x2B, &ok, 1);
        break;
      }
      default:
        break;
    }
  }

  void parseDps(const uint8_t* d, uint16_t n) {
    static const char* const TYPES[] = {"raw", "bool", "value", "string", "enum", "bitmap"};
    uint16_t i = 0;
    while (i + 4 <= n) {
      uint8_t id = d[i];
      uint8_t type = d[i + 1];
      uint16_t len = (d[i + 2] << 8) | d[i + 3];
      i += 4;
      if (i + len > n) break;

      Dp dp{id, type, 0, String()};
      if (type == 0 || type == 3) {
        for (uint16_t k = 0; k < len; k++) {
          if (type == 3) dp.text += (char)d[i + k];
          else {
            char hex[3];
            snprintf(hex, sizeof(hex), "%02X", d[i + k]);
            dp.text += hex;
          }
        }
      } else {
        int32_t v = 0;
        for (uint16_t k = 0; k < len; k++) v = (v << 8) | d[i + k];
        dp.value = v;
      }
      i += len;

      Serial.printf("[tuya] DP %u (%s) = ", id, type < 6 ? TYPES[type] : "?");
      if (type == 0 || type == 3) Serial.println(dp.text);
      else Serial.println(dp.value);

      bool found = false;
      for (Dp& e : dps_) {
        if (e.id == id) {
          e = dp;
          found = true;
          break;
        }
      }
      if (!found) dps_.push_back(dp);
    }
  }
};
