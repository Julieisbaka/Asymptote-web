import {
  colorFromComponents,
  composeMatrix,
  hsbToColor,
  identityMatrix,
  type Matrix,
} from "./utils.js";

export type { Matrix } from "./utils.js";

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

/** The identity affine transform used as the initial graphics state. */
export const IDENTITY: Matrix = identityMatrix();

/** Compose two affine transforms in PostScript order. */
export const compose = composeMatrix;

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

/** Clone graphics state, including mutable dash and gradient data. */
export function cloneState(s: GraphicsState): GraphicsState {
  return {
    ...s,
    dasharray: [...s.dasharray],
    gradient: s.gradient ? { ...s.gradient, stops: s.gradient.stops.map((stop) => ({ ...stop })) } : null,
  };
}

/** Convert normalized gray, RGB, or CMYK components to an SVG RGB value. */
export const toColor = colorFromComponents;

/** Convert normalized HSB components to an SVG RGB value. */
export { hsbToColor };
