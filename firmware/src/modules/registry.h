#pragma once
#include "CoreModule.h"
#include "DhtModule.h"
#include "TuyaModule.h"

// Neue Module hier eintragen (und im Dashboard in src/lib/modules.ts).
static const char* const AVAILABLE_MODULES[] = {"core", "dht", "tuya"};

inline Module* createModule(const char* type) {
  if (strcmp(type, "dht") == 0) return new DhtModule();
  if (strcmp(type, "tuya") == 0) return new TuyaModule();
  return nullptr;
}
