#pragma once
#include "Module.h"

// EC-Luefter (z. B. VEVOR) per PWM steuern – ersetzt den Luefter-Controller.
// Verkabelung am Luefterstecker: GND -> ESP GND, PWM -> ESP GPIO (Standard 25). 24 V NICHT an den ESP!
//
// Config:
// { "type": "fan", "pin": 25, "mode": "auto" | "manual", "speed": 5,
//   "use_temp": true,  "t_min": 24, "t_max": 30,      // Temperatur: ab t_min an, bis t_max hochregeln
//   "use_hum":  true,  "h_min": 65, "h_max": 80,      // Feuchte:    ab h_min an, bis h_max hochregeln
//   "min_speed": 1, "max_speed": 10, "idle_speed": 0 } // Startstufe, Hoechststufe, Stufe ohne Bedarf
//
// Automatik: Jede aktive Regelung (Haken) berechnet ihre Stufe – unter der Startschwelle "kein Bedarf",
// ab der Schwelle min_speed, linear steigend bis max_speed an der Vollgas-Schwelle. Es gilt die hoechste.
// Ohne Bedarf laeuft der Luefter auf idle_speed (0 = aus). Hysterese verhindert staendiges An/Aus.
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
    useTemp_ = cfg["use_temp"] | true;
    useHum_ = cfg["use_hum"] | true;
    tMin_ = cfg["t_min"] | 24.0f;
    tMax_ = cfg["t_max"] | 30.0f;
    hMax_ = cfg["h_max"] | 80.0f;
    hMin_ = cfg["h_min"] | (hMax_ - 10);
    minSpeed_ = clampSpeed(cfg["min_speed"] | 1);
    maxSpeed_ = clampSpeed(cfg["max_speed"] | 10);
    idleSpeed_ = clampSpeed(cfg["idle_speed"] | 0);
    if (tMax_ <= tMin_) tMax_ = tMin_ + 1;
    if (hMax_ <= hMin_) hMax_ = hMin_ + 1;
    if (maxSpeed_ < minSpeed_) maxSpeed_ = minSpeed_;

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
    if (auto_) {
      const char* reason = tempActive_ && humActive_ ? "temp+hum" : tempActive_ ? "temp" : humActive_ ? "hum" : "idle";
      out["fan_reason"] = reason;
    }
  }

 private:
  static const uint8_t CHANNEL = 0;
  static const uint32_t FREQ = 20000;  // wie der Original-Controller (~20 kHz)
  static const uint8_t RES = 8;        // 0..255

  uint8_t pin_ = 25;
  bool auto_ = true;
  uint8_t manualSpeed_ = 5, minSpeed_ = 1, maxSpeed_ = 10, idleSpeed_ = 0, speed_ = 255;
  bool useTemp_ = true, useHum_ = true;
  bool tempActive_ = false, humActive_ = false;  // fuer Hysterese
  float tMin_ = 24, tMax_ = 30, hMin_ = 70, hMax_ = 80;
  static constexpr float T_HYST = 0.5f;  // °C
  static constexpr float H_HYST = 2.0f;  // %
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

  // Stufe fuer einen Messwert: -1 = kein Bedarf, sonst min_speed..max_speed
  float curve(float v, float lo, float hi, bool& active, float hyst) const {
    if (isnan(v)) return -1;
    if (active ? v < lo - hyst : v < lo) {
      active = false;
      return -1;
    }
    active = true;
    if (v >= hi) return maxSpeed_;
    float x = (v - lo) / (hi - lo);
    if (x < 0) x = 0;
    return minSpeed_ + x * (maxSpeed_ - minSpeed_);
  }

  uint8_t autoSpeed() {
    if (g_state.updated == 0) return idleSpeed_ > minSpeed_ ? idleSpeed_ : minSpeed_;  // noch keine Messung
    float s = -1;
    if (useTemp_) {
      float ts = curve(g_state.temperature, tMin_, tMax_, tempActive_, T_HYST);
      if (ts > s) s = ts;
    } else {
      tempActive_ = false;
    }
    if (useHum_) {
      float hs = curve(g_state.humidity, hMin_, hMax_, humActive_, H_HYST);
      if (hs > s) s = hs;
    } else {
      humActive_ = false;
    }
    if (s < idleSpeed_) s = idleSpeed_;
    return clampSpeed((int)lroundf(s));
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
