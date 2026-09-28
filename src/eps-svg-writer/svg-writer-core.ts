import {
  compose,
  type GraphicsState,
  type Gradient,
  type GradientStop,
  type Matrix
} from "../eps-graphics.js";
import { SvgPathBuilder } from "./svg-path-builder.js";
import { encodeBase64, formatOpacity } from "./svg-xml.js";

const LINECAP = ["butt", "round", "square"];
const LINEJOIN = ["miter", "round", "bevel"];

/** Shared path, paint, clipping, image, and gradient implementation. */
export class SvgWriterCore {
  protected clipCounter = 0;
  protected gradientCounter = 0;
  protected readonly defs: string[] = [];
  protected readonly elements: string[] = [];
  protected readonly gradientIds = new Map<string, string>();
  protected readonly path: SvgPathBuilder;

  constructor(
    protected readonly llx: number,
    protected readonly lly: number,
    protected readonly width: number,
    protected readonly height: number,
    protected readonly formatNumber: (value: number) => string
  ) {
    this.path = new SvgPathBuilder(llx, lly, height, formatNumber);
  }

  get currentPoint(): { x: number; y: number } {
    return this.path.currentPoint;
  }

  newPath(): void {
    this.path.newPath();
  }

  userPoint(state: GraphicsState): { x: number; y: number } {
    return this.path.userPoint(state);
  }

  appendPoint(state: GraphicsState, op: "M" | "L", x: number, y: number): void {
    this.path.appendPoint(state, op, x, y);
  }

  appendCurve(
    state: GraphicsState,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x: number,
    y: number
  ): void {
    this.path.appendCurve(state, x1, y1, x2, y2, x, y);
  }

  appendArc(
    state: GraphicsState,
    cx: number,
    cy: number,
    radius: number,
    startDegrees: number,
    endDegrees: number,
    counterClockwise: boolean
  ): void {
    this.path.appendArc(
      state,
      cx,
      cy,
      radius,
      startDegrees,
      endDegrees,
      counterClockwise
    );
  }

  closePath(): void {
    this.path.closePath();
  }

  image(
    state: GraphicsState,
    width: number,
    height: number,
    pixels: string,
    imageMatrix: Matrix
  ): boolean {
    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width <= 0 ||
      height <= 0
    )
      return false;
    if (width * height > 262144 || pixels.length < width * height) return false;
    const rects: string[] = [];
    for (let row = 0; row < height; row += 1) {
      let column = 0;
      while (column < width) {
        const value = pixels.charCodeAt(row * width + column);
        const gray = Math.max(
          0,
          Math.min(255, Number.isFinite(value) ? value : 0)
        );
        let end = column + 1;
        while (end < width) {
          const next = pixels.charCodeAt(row * width + end);
          const nextGray = Math.max(
            0,
            Math.min(255, Number.isFinite(next) ? next : 0)
          );
          if (nextGray !== gray) break;
          end += 1;
        }
        if (gray !== 255) {
          rects.push(
            `<rect x="${column}" y="${row}" width="${end - column}" height="1" fill="rgb(${gray},${gray},${gray})"/>`
          );
        }
        column = end;
      }
    }
    const content = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${rects.join("")}</svg>`;
    const encoded = encodeBase64(content);
    if (!encoded) return false;
    const transformed = compose(state.ctm, imageMatrix);
    const matrix = {
      a: transformed.a,
      b: -transformed.b,
      c: transformed.c,
      d: -transformed.d,
      e: transformed.e - this.llx,
      f: this.height + this.lly - transformed.f
    };
    this.pushElement(
      `<image x="0" y="0" width="${width}" height="${height}" transform="matrix(${this.formatNumber(matrix.a)},${this.formatNumber(matrix.b)},${this.formatNumber(matrix.c)},${this.formatNumber(matrix.d)},${this.formatNumber(matrix.e)},${this.formatNumber(matrix.f)})" href="data:image/svg+xml;base64,${encoded}" opacity="${formatOpacity(state.opacity)}"/>`
    );
    return true;
  }

  clip(state: GraphicsState, evenodd: boolean): void {
    const id = `asy-clip-${(this.clipCounter += 1)}`;
    const d = this.path.pathData();
    const path = `<path d="${d}"${evenodd ? ' clip-rule="evenodd"' : ""}/>`;
    const content = state.clipId
      ? `<g clip-path="url(#${state.clipId})">${path}</g>`
      : path;
    this.defs.push(`<clipPath id="${id}">${content}</clipPath>`);
    state.clipId = id;
    this.newPath();
  }

  paint(state: GraphicsState, mode: "fill" | "eofill" | "stroke"): void {
    const d = this.path.pathData();
    if (d.length === 0) {
      this.newPath();
      return;
    }
    const clipAttr = state.clipId ? ` clip-path="url(#${state.clipId})"` : "";
    const opacityAttr =
      state.opacity < 1 ? ` opacity="${formatOpacity(state.opacity)}"` : "";
    if (mode === "stroke") {
      const dash =
        state.dasharray.length > 0
          ? ` stroke-dasharray="${state.dasharray.join(",")}" stroke-dashoffset="${state.dashoffset}"`
          : "";
      this.pushElement(
        `<path d="${d}" fill="none" stroke="${state.stroke}" stroke-width="${state.linewidth}" ` +
          `stroke-linecap="${LINECAP[state.linecap] ?? "butt"}" stroke-linejoin="${LINEJOIN[state.linejoin] ?? "miter"}" ` +
          `stroke-miterlimit="${state.miterlimit}"${dash}${opacityAttr}${clipAttr}/>`
      );
    } else {
      const rule = mode === "eofill" ? ' fill-rule="evenodd"' : "";
      const fill = state.gradient
        ? this.gradientFill(state.gradient, state)
        : state.fill;
      this.pushElement(
        `<path d="${d}" fill="${fill}"${rule}${opacityAttr}${clipAttr}/>`
      );
    }
    this.newPath();
  }

  protected pushElement(element: string): void {
    this.elements.push(element);
  }

  protected gradientFill(gradient: Gradient, state: GraphicsState): string {
    const { a, b, c, d, e, f } = state.ctm;
    const transform = [a, -b, c, -d, e - this.llx, this.height + this.lly - f];
    const key = [
      gradient.kind,
      ...Object.entries(gradient)
        .filter(([name]) => name !== "kind" && name !== "stops")
        .flatMap(([, value]) => [String(value)]),
      ...transform.map(String),
      ...gradient.stops.flatMap((stop) =>
        [stop.offset, stop.color, stop.opacity].map(String)
      )
    ].join("|");
    const existingId = this.gradientIds.get(key);
    if (existingId) return `url(#${existingId})`;

    const id = `asy-gradient-${(this.gradientCounter += 1)}`;
    this.gradientIds.set(key, id);
    const stops = gradient.stops
      .map(
        (stop: GradientStop) =>
          `<stop offset="${formatOpacity(stop.offset)}" stop-color="${stop.color}"` +
          `${stop.opacity < 1 ? ` stop-opacity="${formatOpacity(stop.opacity)}"` : ""}/>`
      )
      .join("");
    const matrix = transform.map((value) => this.formatNumber(value)).join(" ");
    if (gradient.kind === "linear") {
      this.defs.push(
        `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" gradientTransform="matrix(${matrix})" x1="${this.formatNumber(gradient.x1)}" y1="${this.formatNumber(gradient.y1)}" x2="${this.formatNumber(gradient.x2)}" y2="${this.formatNumber(gradient.y2)}">${stops}</linearGradient>`
      );
    } else {
      this.defs.push(
        `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" gradientTransform="matrix(${matrix})" cx="${this.formatNumber(gradient.x2)}" cy="${this.formatNumber(gradient.y2)}" r="${this.formatNumber(gradient.r2)}" fx="${this.formatNumber(gradient.x1)}" fy="${this.formatNumber(gradient.y1)}" fr="${this.formatNumber(gradient.r1)}">${stops}</radialGradient>`
      );
    }
    return `url(#${id})`;
  }
}
