// Kurven-Mathematik der Luefter-Automatik – identisch zu firmware/src/modules/FanModule.h

export type Shape = "linear" | "in" | "out" | "inout" | "custom";

export function ease(shape: Shape, x: number, p: number): number {
  switch (shape) {
    case "in":
      return Math.pow(x, p);
    case "out":
      return 1 - Math.pow(1 - x, p);
    case "inout":
      return x < 0.5 ? 0.5 * Math.pow(2 * x, p) : 1 - 0.5 * Math.pow(2 - 2 * x, p);
    default:
      return x;
  }
}

export type Pt = [number, number]; // x 0..1, y 0..100 %

export function toPts(flat: unknown): Pt[] {
  if (!Array.isArray(flat)) return [];
  const out: Pt[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push([Number(flat[i]), Number(flat[i + 1])]);
  return out.sort((a, b) => a[0] - b[0]);
}

export const flatPts = (pts: Pt[]) =>
  pts.flatMap(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 10) / 10]);

/** Monotone kubische Interpolation (Fritsch-Carlson) – kein Ueberschwingen zwischen den Punkten */
export function spline(pts: Pt[], x: number): number {
  const n = pts.length;
  if (n === 0) return 0;
  if (x <= pts[0][0]) return pts[0][1];
  if (x >= pts[n - 1][0]) return pts[n - 1][1];
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const h = pts[i + 1][0] - pts[i][0];
    d.push(h > 1e-6 ? (pts[i + 1][1] - pts[i][1]) / h : 0);
  }
  const m = new Array(n).fill(0);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  let i = 0;
  while (i < n - 2 && x > pts[i + 1][0]) i++;
  const h = pts[i + 1][0] - pts[i][0];
  const t = h > 1e-6 ? (x - pts[i][0]) / h : 0;
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * pts[i][1] +
    (t3 - 2 * t2 + t) * h * m[i] +
    (-2 * t3 + 3 * t2) * pts[i + 1][1] +
    (t3 - t2) * h * m[i + 1]
  );
}

export type CurveDef = { shape: Shape; ease: number; pts: Pt[]; min: number; max: number };

/** Luefter-% an Position x (0..1) im Bereich Start..Vollgas */
export function curveAt(c: CurveDef, x: number): number {
  const v = c.shape === "custom" ? spline(c.pts, x) : c.min + ease(c.shape, x, c.ease) * (c.max - c.min);
  return Math.min(Math.max(v, 0), 100);
}

/** Preset als Punkte (Startwert fuer "Eigene") */
export function sampleToPts(c: CurveDef, n = 4): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const x = i / (n - 1);
    return [x, Math.round(curveAt({ ...c, shape: c.shape === "custom" ? "linear" : c.shape }, x) * 10) / 10] as Pt;
  });
}
