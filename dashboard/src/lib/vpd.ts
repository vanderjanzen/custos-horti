// Dampfdruckdefizit der Luft (VPD) – Magnus-Formel, Temperatur in °C, Ergebnis in kPa.

export function svp(t: number) {
  return 0.6108 * Math.exp((17.27 * t) / (t + 237.3));
}

export function vpd(t: number, rh: number) {
  return svp(t) * (1 - rh / 100);
}

/** Luftfeuchte, die bei Temperatur t den Ziel-VPD ergibt */
export function rhForVpd(t: number, target: number) {
  return Math.min(100, Math.max(0, 100 * (1 - target / svp(t))));
}

/** Temperatur, die bei Luftfeuchte rh den Ziel-VPD ergibt */
export function tempForVpd(rh: number, target: number) {
  if (rh >= 100) return NaN;
  const s = target / (1 - rh / 100);
  const l = Math.log(s / 0.6108);
  return (237.3 * l) / (17.27 - l);
}
