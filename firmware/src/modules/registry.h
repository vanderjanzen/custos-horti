#pragma once
#include "CoreModule.h"
#include "DhtModule.h"
#include "TuyaModule.h"
#include "FanModule.h"

// Neue Module hier eintragen (und im Dashboard in src/lib/modules.ts).
static const char* const AVAILABLE_MODULES[] = {"core", "dht", "tuya", "fan"};

inline Module* createModule(const char* type) {
  if (strcmp(type, "dht") == 0) return new DhtModule();
  if (strcmp(type, "tuya") == 0) return new TuyaModule();
  if (strcmp(type, "fan") == 0) return new FanModule();
  return nullptr;
}
