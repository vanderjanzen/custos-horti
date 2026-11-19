#pragma once
#include <WiFi.h>
#include "Module.h"

// Standardmodul: immer aktiv. Meldet Zustand des ESP selbst.
class CoreModule : public Module {
 public:
  const char* type() const override { return "core"; }

  void collect(JsonObject out) override {
    out["rssi"] = WiFi.RSSI();
    out["uptime"] = (uint32_t)(millis() / 1000);
    out["heap"] = ESP.getFreeHeap();
    out["ip"] = WiFi.localIP().toString();
  }
};
