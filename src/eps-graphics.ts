export type Matrix = { a: number; b: number; c: number; d: number; e: number; f: number };

export interface GradientStop {
  offset: number;
  color: string;
  opacity: number;
}

export interface LinearGradient {
  kind: "linear";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stops: GradientStop[];
}

export interface RadialGradient {
  kind: "radial";
  x1: number;
  y1: number;
  r1: number;
  x2: number;
  y2: number;
  r2: number;
  stops: GradientStop[];
}

export type Gradient = LinearGradient | RadialGradient;

export const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export function compose(m1: Matrix, m2: Matrix): Matrix {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    f: m1.b * m2.e + m1.d * m2.f + m1.f,
  };
}

export interface GraphicsState {
  ctm: Matrix;
  fill: string;
  gradient: Gradient | null;
  stroke: string;
  opacity: number;
  fontFamily: string;
  fontSize: number;
  linewidth: number;
  linecap: number;
  linejoin: number;
  miterlimit: number;
  dasharray: number[];
  dashoffset: number;
  clipId: string | null;
}

export function cloneState(s: GraphicsState): GraphicsState {
  return {
    ...s,
    dasharray: [...s.dasharray],
    gradient: s.gradient ? { ...s.gradient, stops: s.gradient.stops.map((stop) => ({ ...stop })) } : null,
  };
}

export function toColor(nums: number[]): string {
  const clamp = (value: number): number => Math.max(0, Math.min(255, Number.isFinite(value) ? value : 0));
  if (nums.length === 1) {
    const v = Math.round(clamp(nums[0] * 255));
    return `rgb(${v},${v},${v})`;
  }
  if (nums.length === 3) {
    const [r, g, b] = nums.map((n) => Math.round(clamp(n * 255)));
    return `rgb(${r},${g},${b})`;
  }
  if (nums.length === 4) {
    const [c, m, y, k] = nums;
    const r = Math.round(clamp(255 * (1 - c) * (1 - k)));
    const g = Math.round(clamp(255 * (1 - m) * (1 - k)));
    const b = Math.round(clamp(255 * (1 - y) * (1 - k)));
    return `rgb(${r},${g},${b})`;
  }
  return "black";
}

export function hsbToColor(hue: number, saturation: number, brightness: number): string {
  const h = ((hue % 1) + 1) % 1;
  const s = Math.max(0, Math.min(1, saturation));
  const v = Math.max(0, Math.min(1, brightness));
  const sector = h * 6;
  const index = Math.floor(sector);
  const fraction = sector - index;
  const p = v * (1 - s);
  const q = v * (1 - s * fraction);
  const t = v * (1 - s * (1 - fraction));
  const rgb = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][index % 6];
  return `rgb(${rgb.map((value) => Math.round(value * 255)).join(",")})`;
}
