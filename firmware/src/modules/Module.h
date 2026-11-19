#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>

// Basisklasse fuer alle Module.
// begin(): Konfiguration uebernehmen (z. B. Pin)
// loop():  laeuft dauerhaft (optional)
// collect(): Messwerte in die Nutzlast schreiben, die an den Server geht
class Module {
 public:
  virtual ~Module() {}
  virtual const char* type() const = 0;
  virtual void begin(JsonObjectConst cfg) {}
  virtual void loop() {}
  virtual void collect(JsonObject out) = 0;
};
