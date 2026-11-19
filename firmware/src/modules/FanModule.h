#pragma once
#include "Module.h"

// EC-Luefter (z. B. VEVOR) per PWM steuern – ersetzt den Luefter-Controller.
// Verkabelung am Luefterstecker: GND -> ESP GND, PWM -> ESP GPIO (Standard 25). 24 V NICHT an den ESP!
//
// Config:
// { "type": "fan", "pin": 25, "mode": "auto" | "manual", "speed": 5,
//   "t_min": 24, "t_max": 30, "h_max": 70, "min_speed": 1 }
//
// Automatik: Stufe steigt linear von min_speed (bei t_min) bis 10 (bei t_max).
// Zusaetzlich: Feuchte ab h_max-10 % treibt die Stufe hoch, ab h_max volle Stufe.
class FanModule : public Module {
 public:
  ~FanModule() override {
    write(0);
#if ESP_ARDUINO_VERSION_MAJOR >= 3
    ledcDetach(pin_);
#else
    ledcDetachPin(pin_);
#endif
  }

  const char* type() const override { return "fan"; }

  void begin(JsonObjectConst cfg) override {
    pin_ = cfg["pin"] | 25;
    const char* mode = cfg["mode"] | "auto";
    auto_ = strcmp(mode, "manual") != 0;
    manualSpeed_ = clampSpeed(cfg["speed"] | 5);
    tMin_ = cfg["t_min"] | 24.0f;
    tMax_ = cfg["t_max"] | 30.0f;
    hMax_ = cfg["h_max"] | 70.0f;
    minSpeed_ = clampSpeed(cfg["min_speed"] | 1);
    if (tMax_ <= tMin_) tMax_ = tMin_ + 1;

#if ESP_ARDUINO_VERSION_MAJOR >= 3
    ledcAttachChannel(pin_, FREQ, RES, CHANNEL);
#else
    ledcSetup(CHANNEL, FREQ, RES);
    ledcAttachPin(pin_, CHANNEL);
#endif
    Serial.printf("[fan] PWM an GPIO%u, Modus %s\n", pin_, auto_ ? "Automatik" : "manuell");
    update(true);
  }

  void loop() override {
    if (millis() - lastUpdate_ > 2000) update(false);
  }

  void collect(JsonObject out) override {
    out["fan_speed"] = speed_;
    out["fan_mode"] = auto_ ? "auto" : "manual";
  }

 private:
  static const uint8_t CHANNEL = 0;
  static const uint32_t FREQ = 20000;  // wie der Original-Controller (~20 kHz)
  static const uint8_t RES = 8;        // 0..255

  uint8_t pin_ = 25;
  bool auto_ = true;
  uint8_t manualSpeed_ = 5, minSpeed_ = 1, speed_ = 255;
  float tMin_ = 24, tMax_ = 30, hMax_ = 70;
  uint32_t lastUpdate_ = 0;

  void write(uint32_t duty) {
#if ESP_ARDUINO_VERSION_MAJOR >= 3
    ledcWrite(pin_, duty);
#else
    ledcWrite(CHANNEL, duty);
#endif
  }

  static uint8_t clampSpeed(int s) { return s < 0 ? 0 : (s > 10 ? 10 : (uint8_t)s); }

  // Tastverhaeltnis je Stufe in Prozent (gemessen am Original-Controller)
  static uint8_t dutyFor(uint8_t speed) {
    static const uint8_t table[11] = {0, 25, 32, 41, 47, 54, 62, 69, 76, 88, 100};
    return table[speed > 10 ? 10 : speed];
  }

  uint8_t autoSpeed() const {
    float t = g_state.temperature, h = g_state.humidity;
    if (isnan(t)) return 5;  // noch keine Messung -> mittlere Stufe
    float ts;
    if (t <= tMin_) ts = minSpeed_;
    else if (t >= tMax_) ts = 10;
    else ts = minSpeed_ + (t - tMin_) / (tMax_ - tMin_) * (10 - minSpeed_);

    float hs = 0;
    if (!isnan(h)) {
      if (h >= hMax_) hs = 10;
      else if (h > hMax_ - 10) hs = minSpeed_ + (h - (hMax_ - 10)) / 10.0f * (10 - minSpeed_);
    }
    return clampSpeed((int)lroundf(ts > hs ? ts : hs));
  }

  void update(bool force) {
    lastUpdate_ = millis();
    uint8_t target = auto_ ? autoSpeed() : manualSpeed_;
    if (!force && target == speed_) return;
    speed_ = target;
    uint32_t duty = (uint32_t)dutyFor(speed_) * 255 / 100;
    write(duty);
    Serial.printf("[fan] Stufe %u (%u %%)\n", speed_, dutyFor(speed_));
  }
};
