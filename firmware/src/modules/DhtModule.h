#pragma once
#include <DHT.h>
#include "Module.h"

// Temperatur + Luftfeuchte (DHT22 / DHT11)
// Config: { "type": "dht", "pin": 4, "model": "DHT22" }
class DhtModule : public Module {
 public:
  ~DhtModule() override { delete dht_; }

  const char* type() const override { return "dht"; }

  void begin(JsonObjectConst cfg) override {
    pin_ = cfg["pin"] | 4;
    const char* model = cfg["model"] | "DHT22";
    uint8_t t = strcmp(model, "DHT11") == 0 ? DHT11 : DHT22;
    dht_ = new DHT(pin_, t);
    dht_->begin();
    Serial.printf("[custos] Modul dht: %s an GPIO%u\n", model, pin_);
  }

  void collect(JsonObject out) override {
    float h = dht_->readHumidity();
    float t = dht_->readTemperature();
    if (isnan(h) || isnan(t)) {  // DHT liefert gelegentlich Aussetzer
      delay(2100);
      h = dht_->readHumidity();
      t = dht_->readTemperature();
    }
    if (isnan(h) || isnan(t)) {
      Serial.printf("[custos] dht: Lesefehler an GPIO%u\n", pin_);
      out["dht_error"] = true;
      return;
    }
    g_state.temperature = t;
    g_state.humidity = h;
    g_state.updated = millis();
    out["temperature"] = round(t * 10) / 10.0;
    out["humidity"] = round(h * 10) / 10.0;
  }

 private:
  DHT* dht_ = nullptr;
  uint8_t pin_ = 4;
};
