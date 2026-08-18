import type { GraphicsState, Gradient, GradientStop } from "./eps-graphics.js";

const LINECAP = ["butt", "round", "square"];
const LINEJOIN = ["miter", "round", "bevel"];

function formatOpacity(value: number): string {
  return Math.max(0, Math.min(1, value)).toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toCssFontFamily(font: string): string {
  switch (font) {
    case "Times-Roman":
    case "Times-Bold":
    case "Times-Italic":
    case "Times-BoldItalic":
      return "Times New Roman, serif";
    case "Helvetica":
    case "Helvetica-Bold":
    case "Helvetica-Oblique":
    case "Helvetica-BoldOblique":
      return "Arial, sans-serif";
    case "Courier":
    case "Courier-Bold":
    case "Courier-Oblique":
    case "Courier-BoldOblique":
      return "Courier New, monospace";
    default:
      return font;
  }
}

export class SvgWriter {
  private clipCounter = 0;
  private gradientCounter = 0;
  private readonly defs: string[] = [];
  private readonly elements: string[] = [];
  private readonly gradientIds = new Map<string, string>();
  private pathParts: string[] = [];
  private pathD = "";
  private pathDirty = true;
  private currentX = 0;
  private currentY = 0;

  constructor(
    private readonly llx: number,
    private readonly lly: number,
    private readonly width: number,
    private readonly height: number,
    private readonly formatNumber: (value: number) => string
  ) {}

  get currentPoint(): { x: number; y: number } {
    return { x: this.currentX, y: this.currentY };
  }

  newPath(): void {
    this.pathParts = [];
    this.pathD = "";
    this.pathDirty = false;
  }

  appendPoint(state: GraphicsState, op: "M" | "L", x: number, y: number): void {
    const { a, b, c, d, e, f } = state.ctm;
    this.currentX = a * x + c * y + e;
    this.currentY = b * x + d * y + f;
    this.pathParts.push(
      `${op}${this.formatNumber(this.currentX - this.llx)},${this.formatNumber(this.height - (this.currentY - this.lly))}`
    );
    this.pathDirty = true;
  }

  appendCurve(state: GraphicsState, x1: number, y1: number, x2: number, y2: number, x: number, y: number): void {
    const { a, b, c, d, e, f } = state.ctm;
    const ax1 = a * x1 + c * y1 + e;
    const ay1 = b * x1 + d * y1 + f;
    const ax2 = a * x2 + c * y2 + e;
    const ay2 = b * x2 + d * y2 + f;
    this.currentX = a * x + c * y + e;
    this.currentY = b * x + d * y + f;
    this.pathParts.push(
      `C${this.formatNumber(ax1 - this.llx)},${this.formatNumber(this.height - (ay1 - this.lly))} ` +
      `${this.formatNumber(ax2 - this.llx)},${this.formatNumber(this.height - (ay2 - this.lly))} ` +
      `${this.formatNumber(this.currentX - this.llx)},${this.formatNumber(this.height - (this.currentY - this.lly))}`
    );
    this.pathDirty = true;
  }

  closePath(): void {
    this.pathParts.push("Z");
    this.pathDirty = true;
  }

  clip(state: GraphicsState, evenodd: boolean): void {
    const id = `asy-clip-${this.clipCounter += 1}`;
    this.defs.push(
      `<clipPath id="${id}"><path d="${this.pathToD()}"${evenodd ? ' clip-rule="evenodd"' : ""}/></clipPath>`
    );
    state.clipId = id;
  }

  paint(state: GraphicsState, mode: "fill" | "eofill" | "stroke"): void {
    const d = this.pathToD();
    if (d.length === 0) return;
    const clipAttr = state.clipId ? ` clip-path="url(#${state.clipId})"` : "";
    const opacityAttr = state.opacity < 1 ? ` opacity="${formatOpacity(state.opacity)}"` : "";
    if (mode === "stroke") {
      const dash = state.dasharray.length > 0
        ? ` stroke-dasharray="${state.dasharray.join(",")}" stroke-dashoffset="${state.dashoffset}"`
        : "";
      this.elements.push(
        `<path d="${d}" fill="none" stroke="${state.stroke}" stroke-width="${state.linewidth}" ` +
        `stroke-linecap="${LINECAP[state.linecap] ?? "butt"}" stroke-linejoin="${LINEJOIN[state.linejoin] ?? "miter"}" ` +
        `stroke-miterlimit="${state.miterlimit}"${dash}${opacityAttr}${clipAttr}/>`
      );
    } else {
      const rule = mode === "eofill" ? ' fill-rule="evenodd"' : "";
      const fill = state.gradient ? this.gradientFill(state.gradient, state) : state.fill;
      this.elements.push(`<path d="${d}" fill="${fill}"${rule}${opacityAttr}${clipAttr}/>`);
    }
  }

  show(state: GraphicsState, text: string): void {
    const x = this.currentX - this.llx;
    const y = this.height - (this.currentY - this.lly);
    const scale = Math.sqrt(state.ctm.a ** 2 + state.ctm.b ** 2);
    const angle = -(Math.atan2(state.ctm.b, state.ctm.a) * 180) / Math.PI;
    const transform = angle !== 0
      ? ` transform="rotate(${this.formatNumber(angle)} ${this.formatNumber(x)} ${this.formatNumber(y)})"`
      : "";
    const opacityAttr = state.opacity < 1 ? ` opacity="${formatOpacity(state.opacity)}"` : "";
    this.elements.push(
      `<text x="${this.formatNumber(x)}" y="${this.formatNumber(y)}" fill="${state.fill}" ` +
      `font-family="${escapeXml(toCssFontFamily(state.fontFamily))}" font-size="${this.formatNumber(state.fontSize * scale)}"` +
      `${transform}${opacityAttr}>${escapeXml(text)}</text>`
    );
  }

  serialize(): string {
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${this.width}" height="${this.height}" ` +
      `viewBox="0 0 ${this.width} ${this.height}">` +
      (this.defs.length > 0 ? `<defs>${this.defs.join("")}</defs>` : "") +
      this.elements.join("") +
      `</svg>`
    );
  }

  private pathToD(): string {
    if (this.pathDirty) {
      this.pathD = this.pathParts.join(" ");
      this.pathDirty = false;
    }
    return this.pathD;
  }

  private gradientFill(gradient: Gradient, state: GraphicsState): string {
    const { a, b, c, d, e, f } = state.ctm;
    const transform = [a, -b, c, -d, e - this.llx, this.height + this.lly - f];
    const key = [
      gradient.kind,
      ...Object.entries(gradient)
        .filter(([name]) => name !== "kind" && name !== "stops")
        .flatMap(([, value]) => [String(value)]),
      ...transform.map(String),
      ...gradient.stops.flatMap((stop) => [stop.offset, stop.color, stop.opacity].map(String)),
    ].join("|");
    const existingId = this.gradientIds.get(key);
    if (existingId) return `url(#${existingId})`;

    const id = `asy-gradient-${this.gradientCounter += 1}`;
    this.gradientIds.set(key, id);
    const stops = gradient.stops.map((stop: GradientStop) =>
      `<stop offset="${formatOpacity(stop.offset)}" stop-color="${stop.color}"` +
      `${stop.opacity < 1 ? ` stop-opacity="${formatOpacity(stop.opacity)}"` : ""}/>`
    ).join("");
    let definition: string;
    if (gradient.kind === "linear") {
      const matrix = transform.map((value) => this.formatNumber(value)).join(" ");
      definition = `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" gradientTransform="matrix(${matrix})" x1="${this.formatNumber(gradient.x1)}" y1="${this.formatNumber(gradient.y1)}" x2="${this.formatNumber(gradient.x2)}" y2="${this.formatNumber(gradient.y2)}">${stops}</linearGradient>`;
    } else {
      const matrix = transform.map((value) => this.formatNumber(value)).join(" ");
      definition = `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" gradientTransform="matrix(${matrix})" cx="${this.formatNumber(gradient.x2)}" cy="${this.formatNumber(gradient.y2)}" r="${this.formatNumber(gradient.r2)}" fx="${this.formatNumber(gradient.x1)}" fy="${this.formatNumber(gradient.y1)}">${stops}</radialGradient>`;
    }
    this.defs.push(definition);
    return `url(#${id})`;
  }
}
