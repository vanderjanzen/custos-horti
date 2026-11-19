// Grow-Phasen mit Richtwerten (Luft-VPD, Temperatur, Luftfeuchte).

export type PhaseKey = "seedling" | "veg" | "flower" | "late";

export type Phase = {
  key: PhaseKey;
  name: string;
  short: string;
  description: string;
  vpd: [number, number]; // kPa
  temp: [number, number]; // °C
  hum: [number, number]; // %
};

export const PHASES: Phase[] = [
  {
    key: "seedling",
    name: "Anzucht",
    short: "Keimlinge & Stecklinge",
    description: "Junge Pflanzen ohne starke Wurzeln – hohe Luftfeuchte, sanftes Klima.",
    vpd: [0.4, 0.8],
    temp: [22, 26],
    hum: [65, 75],
  },
  {
    key: "veg",
    name: "Wachstum",
    short: "Vegetative Phase",
    description: "Kräftiges Blatt- und Wurzelwachstum – moderate Feuchte, warm.",
    vpd: [0.8, 1.2],
    temp: [22, 28],
    hum: [55, 70],
  },
  {
    key: "flower",
    name: "Blüte",
    short: "Blütephase",
    description: "Blütenbildung – trockenere Luft beugt Schimmel vor.",
    vpd: [1.2, 1.5],
    temp: [20, 26],
    hum: [45, 55],
  },
  {
    key: "late",
    name: "Endblüte",
    short: "Späte Blüte & Reife",
    description: "Letzte Wochen – niedrige Feuchte, etwas kühler.",
    vpd: [1.4, 1.6],
    temp: [18, 24],
    hum: [40, 50],
  },
];

export function getPhase(key: string | null | undefined): Phase {
  return PHASES.find((p) => p.key === key) ?? PHASES[1];
}

export function isPhaseKey(v: unknown): v is PhaseKey {
  return typeof v === "string" && PHASES.some((p) => p.key === v);
}
