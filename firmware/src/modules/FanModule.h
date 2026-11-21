#pragma once
#include "Module.h"

// Ueberlebt den Neuaufbau des Moduls bei Config-Aenderungen (Header wird nur in main.cpp eingebunden)
namespace fanpersist {
static float lastOut = -1;
static bool tuneDone = false;
static float kp = 0, ti = 0, td = 0, ku = 0, tu = 0;
}  // namespace fanpersist

// EC-Luefter (z. B. VEVOR) stufenlos per PWM (0–100 %) steuern – ersetzt den Luefter-Controller.
// Verkabelung am Luefterstecker: GND -> ESP GND, PWM -> ESP GPIO (Standard 25). 24 V NICHT an den ESP!
//
// Modi:
//   manual – fester Wert "pct" (0–100 %)
//   auto   – Kurven: Temperatur / Feuchte / VPD erzeugen je einen Wert, es gilt der hoechste
//   pid    – Regler haelt Temperatur, Feuchte oder VPD auf einem Zielwert (mit Auto-Tune)
//
// Kurven (je Quelle t_, h_, v_):
//   *_shape: linear | in | out | inout | custom
//   *_ease:  Staerke der Kruemmung (1 = linear … 4 = stark)
//   *_pts:   eigene Kurve als [x0,y0,x1,y1,…], x = 0..1 im Bereich Start..Vollgas, y = Luefter in %
// Presets laufen von min_pct (Start) bis max_pct (Vollgas). Unter der Startschwelle: idle_pct.
//
// PID: pid_src temp|hum|vpd, Ziel pid_t / pid_h / VPD-Mitte, kp (%/Einheit), ti/td (Sekunden).
//   tune = true startet ein Relais-Auto-Tune (Aström-Hägglund, Tyreus-Luyben-Regeln).
//   Ergebnis wird als fan_tune gemeldet, der Server uebernimmt es in die Config.
//
// ramp: maximale Aenderung in %/s (0 = sofort) – macht jeden Modus weich.
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
    mode_ = strcmp(mode, "manual") == 0 ? MANUAL : strcmp(mode, "pid") == 0 ? PID : AUTO;
    manual_ = clampPct(cfg["pct"] | 50.0f);
    ramp_ = cfg["ramp"] | 10.0f;
    minPct_ = clampPct(cfg["min_pct"] | 25.0f);
    maxPct_ = clampPct(cfg["max_pct"] | 100.0f);
    idlePct_ = clampPct(cfg["idle_pct"] | 0.0f);
    if (maxPct_ < minPct_) maxPct_ = minPct_;

    loadCurve(temp_, cfg, "t", cfg["use_temp"] | true, cfg["t_min"] | 24.0f, cfg["t_max"] | 30.0f, 0.5f);
    loadCurve(hum_, cfg, "h", cfg["use_hum"] | true, cfg["h_min"] | 65.0f, cfg["h_max"] | 80.0f, 2.0f);
    useVpd_ = cfg["use_vpd"] | false;
    vpdMin_ = cfg["vpd_min"] | 0.8f;
    vpdMax_ = cfg["vpd_max"] | 1.2f;
    float span = cfg["vpd_span"] | 0.4f;
    if (span < 0.05f) span = 0.05f;
    loadCurve(vpd_, cfg, "v", useVpd_, 0.0f, span, 0.05f);  // x = VPD-Defizit (vpd_min - VPD)

    const char* src = cfg["pid_src"] | "hum";
    pidSrc_ = strcmp(src, "temp") == 0 ? 0 : strcmp(src, "vpd") == 0 ? 2 : 1;
    pidSp_ = pidSrc_ == 0 ? (float)(cfg["pid_t"] | 25.0f)
           : pidSrc_ == 1 ? (float)(cfg["pid_h"] | 60.0f)
                          : (vpdMin_ + vpdMax_) / 2;
    kp_ = cfg["kp"] | 4.0f;
    ti_ = cfg["ti"] | 600.0f;
    td_ = cfg["td"] | 0.0f;
    bool tune = cfg["tune"] | false;

#if ESP_ARDUINO_VERSION_MAJOR >= 3
    ledcAttachChannel(pin_, FREQ, RES, CHANNEL);
#else
    ledcSetup(CHANNEL, FREQ, RES);
    ledcAttachPin(pin_, CHANNEL);
#endif
    // Neustart nach Config-Aenderung: dort weitermachen, wo der Luefter gerade war (kein Ruck)
    out_ = fanpersist::lastOut >= 0 ? fanpersist::lastOut : (mode_ == MANUAL ? manual_ : minPct_);
    integral_ = constrain(out_, minPct_, maxPct_);
    lastSample_ = 0;
    if (mode_ == PID && tune) {
      if (fanpersist::tuneDone) tuneState_ = DONE;  // Ergebnis weiter melden, bis der Server es uebernommen hat
      else startTune();
    } else {
      fanpersist::tuneDone = false;
    }
    target_ = out_;
    write(out_);
    Serial.printf("[fan] PWM an GPIO%u, Modus %s\n", pin_, mode);
  }

  void loop() override {
    uint32_t now = millis();
    // Neue Messung -> Sollwert neu berechnen (PID braucht genau einen Schritt je Messung)
    if (g_state.updated != lastSample_) {
      float dt = lastSample_ ? (g_state.updated - lastSample_) / 1000.0f : 0;
      lastSample_ = g_state.updated;
      compute(dt);
    } else if (mode_ == MANUAL) {
      target_ = manual_;
      reason_ = "manual";
    }
    // Rampe
    if (now - lastStep_ >= 100) {
      float dt = (now - lastStep_) / 1000.0f;
      lastStep_ = now;
      float diff = target_ - out_;
      float maxStep = ramp_ > 0 ? ramp_ * dt : 100;
      if (fabsf(diff) > 0.01f) {
        out_ += diff > maxStep ? maxStep : diff < -maxStep ? -maxStep : diff;
        write(out_);
      }
      fanpersist::lastOut = out_;
    }
  }

  void collect(JsonObject out) override {
    out["fan_speed"] = round1(out_);
    out["fan_target"] = round1(target_);
    out["fan_mode"] = mode_ == MANUAL ? "manual" : mode_ == PID ? "pid" : "auto";
    out["fan_reason"] = reason_;
    JsonObject d = out["fan_detail"].to<JsonObject>();
    if (mode_ == AUTO) {
      if (temp_.on) d["t"] = round1(temp_.last);
      if (hum_.on && !useVpd_) d["h"] = round1(hum_.last);
      if (useVpd_) d["v"] = round1(vpd_.last);
      if (winX_ >= 0) d["x"] = round(winX_ * 100) / 100.0;
    } else if (mode_ == PID) {
      d["sp"] = round(pidSp_ * 100) / 100.0;
      if (!isnan(pv_)) d["pv"] = round(pv_ * 100) / 100.0;
      d["p"] = round1(pTerm_);
      d["i"] = round1(integral_);
      d["d"] = round1(dTerm_);
    }
    if (tuneState_ != IDLE) {
      JsonObject t = out["fan_tune"].to<JsonObject>();
      t["state"] = tuneState_ == RUN ? "run" : tuneState_ == DONE ? "done" : "fail";
      t["cycles"] = cycles_;
      t["elapsed"] = (millis() - tuneStart_) / 1000;
      if (tuneState_ == DONE) {
        t["kp"] = round(fanpersist::kp * 100) / 100.0;
        t["ti"] = lroundf(fanpersist::ti);
        t["td"] = lroundf(fanpersist::td);
        t["ku"] = round(fanpersist::ku * 100) / 100.0;
        t["tu"] = lroundf(fanpersist::tu);
      }
      if (tuneMsg_) t["msg"] = tuneMsg_;
    }
  }

 private:
  enum Mode { MANUAL, AUTO, PID };
  enum Tune { IDLE, RUN, DONE, FAIL };
  enum Shape { LINEAR, EASE_IN, EASE_OUT, EASE_INOUT, CUSTOM };
  static const uint8_t CHANNEL = 0;
  static const uint32_t FREQ = 20000;  // wie der Original-Controller (~20 kHz)
  static const uint8_t RES = 10;       // 0..1023 -> ~0,1 % Aufloesung
  static const uint8_t MAX_PTS = 8;

  struct Curve {
    bool on = false, active = false;
    float lo = 0, hi = 1, hyst = 0, ease = 2;
    Shape shape = LINEAR;
    uint8_t n = 0;
    float px[MAX_PTS], py[MAX_PTS];
    float last = -1;  // letzter Wert in % (-1 = kein Bedarf)
    float lastX = -1;
  };

  uint8_t pin_ = 25;
  Mode mode_ = AUTO;
  float manual_ = 50, ramp_ = 10, minPct_ = 25, maxPct_ = 100, idlePct_ = 0;
  float out_ = 0, target_ = 0;
  uint32_t lastStep_ = 0, lastSample_ = 0;
  const char* reason_ = "idle";

  Curve temp_, hum_, vpd_;
  bool useVpd_ = false;
  float vpdMin_ = 0.8f, vpdMax_ = 1.2f;
  float winX_ = -1;

  // PID
  uint8_t pidSrc_ = 1;
  float pidSp_ = 60, kp_ = 4, ti_ = 600, td_ = 0;
  float integral_ = 0, pTerm_ = 0, dTerm_ = 0, pv_ = NAN, lastPv_ = NAN;

  // Auto-Tune
  Tune tuneState_ = IDLE;
  const char* tuneMsg_ = nullptr;
  bool relayHigh_ = false;
  uint8_t cycles_ = 0;
  uint32_t tuneStart_ = 0, lastSwitch_ = 0, lastRise_ = 0;
  float peakHi_ = -1e9, peakLo_ = 1e9;
  float periods_[8], amps_[8];

  static float clampPct(float v) { return v < 0 ? 0 : v > 100 ? 100 : v; }
  static float round1(float v) { return roundf(v * 10) / 10.0f; }

  void write(float pct) {
    uint32_t duty = (uint32_t)lroundf(clampPct(pct) * 1023 / 100);
#if ESP_ARDUINO_VERSION_MAJOR >= 3
    ledcWrite(pin_, duty);
#else
    ledcWrite(CHANNEL, duty);
#endif
  }

  static Shape parseShape(const char* s) {
    if (!s) return LINEAR;
    if (!strcmp(s, "in")) return EASE_IN;
    if (!strcmp(s, "out")) return EASE_OUT;
    if (!strcmp(s, "inout")) return EASE_INOUT;
    if (!strcmp(s, "custom")) return CUSTOM;
    return LINEAR;
  }

  void loadCurve(Curve& c, JsonObjectConst cfg, const char* p, bool on, float lo, float hi, float hyst) {
    char k[12];
    c.on = on;
    c.lo = lo;
    c.hi = hi > lo ? hi : lo + 1;
    c.hyst = hyst;
    snprintf(k, sizeof k, "%s_shape", p);
    c.shape = parseShape(cfg[k] | "linear");
    snprintf(k, sizeof k, "%s_ease", p);
    c.ease = constrain((float)(cfg[k] | 2.0f), 1.0f, 5.0f);
    snprintf(k, sizeof k, "%s_pts", p);
    JsonArrayConst a = cfg[k].as<JsonArrayConst>();
    c.n = 0;
    for (size_t i = 0; i + 1 < a.size() && c.n < MAX_PTS; i += 2) {
      c.px[c.n] = constrain(a[i].as<float>(), 0.0f, 1.0f);
      c.py[c.n] = clampPct(a[i + 1].as<float>());
      c.n++;
    }
    if (c.shape == CUSTOM && c.n < 2) c.shape = LINEAR;
  }

  float ease(const Curve& c, float x) const {
    float p = c.ease;
    switch (c.shape) {
      case EASE_IN: return powf(x, p);                    // langsam anfangen, spaet kraeftig
      case EASE_OUT: return 1 - powf(1 - x, p);           // schnell reagieren, oben sanft
      case EASE_INOUT:                                    // S-Kurve
        return x < 0.5f ? 0.5f * powf(2 * x, p) : 1 - 0.5f * powf(2 - 2 * x, p);
      default: return x;
    }
  }

  // Monotone kubische Interpolation (Fritsch-Carlson) – wie die Kurve im Dashboard
  static float spline(const Curve& c, float x) {
    if (x <= c.px[0]) return c.py[0];
    if (x >= c.px[c.n - 1]) return c.py[c.n - 1];
    float m[MAX_PTS] = {0}, d[MAX_PTS] = {0};
    for (uint8_t i = 0; i + 1 < c.n; i++) {
      float h = c.px[i + 1] - c.px[i];
      d[i] = h > 1e-6f ? (c.py[i + 1] - c.py[i]) / h : 0;
    }
    m[0] = d[0];
    m[c.n - 1] = d[c.n - 2];
    for (uint8_t i = 1; i + 1 < c.n; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (uint8_t i = 0; i + 1 < c.n; i++) {
      if (d[i] == 0) {
        m[i] = m[i + 1] = 0;
        continue;
      }
      float a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
      if (s > 9) {
        float t = 3 / sqrtf(s);
        m[i] = t * a * d[i];
        m[i + 1] = t * b * d[i];
      }
    }
    uint8_t i = 0;
    while (i + 2 < c.n && x > c.px[i + 1]) i++;
    float h = c.px[i + 1] - c.px[i];
    float t = h > 1e-6f ? (x - c.px[i]) / h : 0, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * c.py[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * c.py[i + 1] +
           (t3 - t2) * h * m[i + 1];
  }

  // Wert der Kurve in %, -1 = unter der Startschwelle (mit Hysterese)
  float evalCurve(Curve& c, float v) {
    c.last = -1;
    c.lastX = -1;
    if (!c.on || isnan(v)) {
      c.active = false;
      return -1;
    }
    if (c.active ? v < c.lo - c.hyst : v < c.lo) {
      c.active = false;
      return -1;
    }
    c.active = true;
    float x = constrain((v - c.lo) / (c.hi - c.lo), 0.0f, 1.0f);
    c.lastX = x;
    c.last = c.shape == CUSTOM ? clampPct(spline(c, x)) : minPct_ + ease(c, x) * (maxPct_ - minPct_);
    return c.last;
  }

  static float calcVpd(float t, float h) {
    if (isnan(t) || isnan(h)) return NAN;
    return 0.6108f * expf((17.27f * t) / (t + 237.3f)) * (1.0f - h / 100.0f);
  }

  void compute(float dt) {
    if (mode_ == MANUAL) {
      target_ = manual_;
      reason_ = "manual";
    } else if (mode_ == AUTO) {
      computeAuto();
    } else {
      computePid(dt);
    }
  }

  void computeAuto() {
    float t = g_state.temperature, h = g_state.humidity;
    float best = -1;
    winX_ = -1;
    const char* why = "idle";
    auto take = [&](Curve& c, float v, const char* name) {
      float s = evalCurve(c, v);
      if (s < 0) return;
      if (s > best) {
        best = s;
        winX_ = c.lastX;
        why = name;
      }
    };
    take(temp_, t, "temp");
    if (useVpd_) {
      hum_.active = false;
      hum_.last = -1;
      float v = calcVpd(t, h);
      take(vpd_, isnan(v) ? NAN : vpdMin_ - v, "vpd");
    } else {
      take(hum_, h, "hum");
    }
    reason_ = why;
    target_ = best < 0 ? idlePct_ : (best < idlePct_ ? idlePct_ : best);
  }

  float processValue() const {
    float t = g_state.temperature, h = g_state.humidity;
    return pidSrc_ == 0 ? t : pidSrc_ == 1 ? h : calcVpd(t, h);
  }

  // Fehler mit Wirkrichtung: positiv = mehr Luft noetig.
  // Temp/Feuchte: zu hoch -> mehr Abluft. VPD: zu niedrig (zu feucht) -> mehr Abluft.
  float error(float pv) const { return pidSrc_ == 2 ? pidSp_ - pv : pv - pidSp_; }

  void computePid(float dt) {
    pv_ = processValue();
    if (isnan(pv_)) return;
    if (tuneState_ == RUN) {
      runTune();
      return;
    }
    reason_ = "pid";
    float e = error(pv_);
    pTerm_ = kp_ * e;
    // D auf den Messwert (kein Sprung bei Sollwertaenderung), leicht gefiltert
    if (dt > 0 && td_ > 0 && !isnan(lastPv_)) {
      float dpv = pidSrc_ == 2 ? -(pv_ - lastPv_) : (pv_ - lastPv_);
      float raw = kp_ * td_ * dpv / dt;
      dTerm_ = 0.7f * dTerm_ + 0.3f * raw;
    } else {
      dTerm_ = 0;
    }
    lastPv_ = pv_;
    // I mit Anti-Windup: nur integrieren, wenn der Ausgang nicht schon am Anschlag haengt
    float u = pTerm_ + integral_ + dTerm_;
    if (dt > 0 && ti_ > 0) {
      float di = kp_ * e * dt / ti_;
      bool satHi = u >= maxPct_ && di > 0, satLo = u <= minPct_ && di < 0;
      if (!satHi && !satLo) integral_ += di;
      integral_ = constrain(integral_, 0.0f, maxPct_);
    }
    u = pTerm_ + integral_ + dTerm_;
    target_ = constrain(u, minPct_, maxPct_);
  }

  // ---- Auto-Tune (Relais-Methode) ----------------------------------------
  float band() const { return pidSrc_ == 0 ? 0.2f : pidSrc_ == 1 ? 1.0f : 0.03f; }

  void startTune() {
    tuneState_ = RUN;
    tuneMsg_ = nullptr;
    cycles_ = 0;
    tuneStart_ = lastSwitch_ = millis();
    lastRise_ = 0;
    relayHigh_ = false;
    peakHi_ = -1e9;
    peakLo_ = 1e9;
    fanpersist::tuneDone = false;
    Serial.println("[fan] Auto-Tune gestartet");
  }

  void failTune(const char* msg) {
    tuneState_ = FAIL;
    tuneMsg_ = msg;
    Serial.printf("[fan] Auto-Tune abgebrochen: %s\n", msg);
  }

  void runTune() {
    reason_ = "tune";
    uint32_t now = millis();
    float e = error(pv_);
    if (pv_ > peakHi_) peakHi_ = pv_;
    if (pv_ < peakLo_) peakLo_ = pv_;
    if (now - tuneStart_ > 3UL * 3600 * 1000) return failTune("Zeitlimit (3 h) erreicht");
    if (now - lastSwitch_ > 60UL * 60 * 1000) return failTune("Ziel wird nicht erreicht – Ziel oder Grenzen anpassen");

    if (!relayHigh_ && e > band()) {
      relayHigh_ = true;
      lastSwitch_ = now;
      if (lastRise_) {  // ein voller Zyklus ist vorbei
        uint8_t i = cycles_ % 8;
        periods_[i] = (now - lastRise_) / 1000.0f;
        amps_[i] = (peakHi_ - peakLo_) / 2;
        cycles_++;
        peakHi_ = -1e9;
        peakLo_ = 1e9;
      }
      lastRise_ = now;
    } else if (relayHigh_ && e < -band()) {
      relayHigh_ = false;
      lastSwitch_ = now;
    }
    target_ = relayHigh_ ? maxPct_ : minPct_;

    if (cycles_ >= 4) {  // die ersten Zyklen einschwingen lassen, letzte zwei mitteln
      float tu = (periods_[(cycles_ - 1) % 8] + periods_[(cycles_ - 2) % 8]) / 2;
      float a = (amps_[(cycles_ - 1) % 8] + amps_[(cycles_ - 2) % 8]) / 2;
      if (a < 1e-3f) return failTune("Keine messbare Schwingung");
      float d = (maxPct_ - minPct_) / 2;
      float ku = 4 * d / (PI * a);
      fanpersist::ku = ku;
      fanpersist::tu = tu;
      fanpersist::kp = ku / 2.2f;   // Tyreus-Luyben: ruhiger als Ziegler-Nichols, gut fuer traege Klimaregelung
      fanpersist::ti = 2.2f * tu;
      fanpersist::td = tu / 6.3f;
      fanpersist::tuneDone = true;
      tuneState_ = DONE;
      kp_ = fanpersist::kp;
      ti_ = fanpersist::ti;
      td_ = fanpersist::td;
      integral_ = constrain(out_, minPct_, maxPct_);
      Serial.printf("[fan] Auto-Tune fertig: Ku=%.2f Tu=%.0fs -> Kp=%.2f Ti=%.0fs Td=%.0fs\n", ku, tu, fanpersist::kp, fanpersist::ti,
                    fanpersist::td);
    }
  }
};
