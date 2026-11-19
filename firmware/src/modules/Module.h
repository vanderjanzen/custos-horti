#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>

// Gemeinsame Messwerte, damit Module aufeinander reagieren koennen
// (z. B. Luefter-Automatik nutzt Temperatur/Feuchte vom DHT-Modul).
struct SharedState {
  float temperature = NAN;
  float humidity = NAN;
  uint32_t updated = 0;  // millis() der letzten Messung
};
extern SharedState g_state;

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
