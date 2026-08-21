import { compose, type GraphicsState, type Gradient, type GradientStop, type Matrix } from "./eps-graphics.js";

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

function encodeBase64(value: string): string {
  if (typeof btoa !== "function" || typeof TextEncoder === "undefined") return "";
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  const chunkSize = 0x8000;
  for (let start = 0; start < bytes.length; start += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(start, start + chunkSize));
  }
  return btoa(binary);
}

interface CssFont {
  family: string;
  weight?: string;
  style?: string;
}

function toCssFont(font: string): CssFont {
  switch (font) {
    case "Times-Roman":
    case "Times":
    case "TimesNewRoman":
      return { family: "Times New Roman, serif" };
    case "Times-Bold":
    case "TimesNewRoman-Bold":
      return { family: "Times New Roman, serif", weight: "bold" };
    case "Times-Italic":
    case "TimesNewRoman-Italic":
      return { family: "Times New Roman, serif", style: "italic" };
    case "Times-BoldItalic":
    case "TimesNewRoman-BoldItalic":
      return { family: "Times New Roman, serif", weight: "bold", style: "italic" };
    case "Helvetica":
    case "Arial":
    case "ArialMT":
      return { family: "Arial, sans-serif" };
    case "Helvetica-Bold":
    case "Arial-BoldMT":
      return { family: "Arial, sans-serif", weight: "bold" };
    case "Helvetica-Oblique":
    case "Arial-ItalicMT":
      return { family: "Arial, sans-serif", style: "italic" };
    case "Helvetica-BoldOblique":
    case "Arial-BoldItalicMT":
      return { family: "Arial, sans-serif", weight: "bold", style: "italic" };
    case "Courier":
    case "CourierNew":
      return { family: "Courier New, monospace" };
    case "Courier-Bold":
    case "CourierNew-Bold":
      return { family: "Courier New, monospace", weight: "bold" };
    case "Courier-Oblique":
    case "CourierNew-Italic":
      return { family: "Courier New, monospace", style: "italic" };
    case "Courier-BoldOblique":
    case "CourierNew-BoldItalic":
      return { family: "Courier New, monospace", weight: "bold", style: "italic" };
    case "Symbol":
      return { family: "Symbol, serif" };
    case "ZapfDingbats":
      return { family: "Zapf Dingbats, sans-serif" };
    default:
      return { family: font || "sans-serif" };
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
  private pathStarted = false;
  private subpathStarted = false;
  private subpathStartX = 0;
  private subpathStartY = 0;
  private currentX = 0;
  private currentY = 0;

  constructor(
    private readonly llx: number,
    private readonly lly: number,
    private readonly width: number,
    private readonly height: number,
    private readonly formatNumber: (value: number) => string
  ) { }

  get currentPoint(): { x: number; y: number } {
    return { x: this.currentX, y: this.currentY };
  }

  newPath(): void {
    this.pathParts = [];
    this.pathD = "";
    this.pathDirty = false;
    this.pathStarted = false;
    this.subpathStarted = false;
  }

  userPoint(state: GraphicsState): { x: number; y: number } {
    const determinant = state.ctm.a * state.ctm.d - state.ctm.b * state.ctm.c;
    if (determinant === 0) return { x: 0, y: 0 };
    const x = this.currentX - state.ctm.e;
    const y = this.currentY - state.ctm.f;
    return {
      x: (state.ctm.d * x - state.ctm.c * y) / determinant,
      y: (-state.ctm.b * x + state.ctm.a * y) / determinant,
    };
  }

  appendPoint(state: GraphicsState, op: "M" | "L", x: number, y: number): void {
    const { a, b, c, d, e, f } = state.ctm;
    this.currentX = a * x + c * y + e;
    this.currentY = b * x + d * y + f;
    this.pathParts.push(
      `${op}${this.formatNumber(this.currentX - this.llx)},${this.formatNumber(this.height - (this.currentY - this.lly))}`
    );
    this.pathDirty = true;
    this.pathStarted = true;
    if (op === "M") {
      this.subpathStarted = true;
      this.subpathStartX = this.currentX;
      this.subpathStartY = this.currentY;
    }
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
    this.pathStarted = true;
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
    if (radius < 0 || !Number.isFinite(radius)) return;
    const direction = counterClockwise ? 1 : -1;
    let sweep = (endDegrees - startDegrees) * direction;
    if (Math.abs(sweep) < 1e-9) sweep = direction * 360;
    while (sweep > 360) sweep -= 360;
    while (sweep < -360) sweep += 360;
    const segments = Math.max(1, Math.ceil(Math.abs(sweep) / 90));
    const delta = sweep / segments;
    const start = (startDegrees * Math.PI) / 180;
    const startPoint = { x: cx + radius * Math.cos(start), y: cy + radius * Math.sin(start) };
    if (!this.pathStarted) this.appendPoint(state, "M", startPoint.x, startPoint.y);
    else {
      const current = this.userPoint(state);
      if (Math.hypot(current.x - startPoint.x, current.y - startPoint.y) > 1e-7) {
        this.appendPoint(state, "L", startPoint.x, startPoint.y);
      }
    }
    let angle = start;
    for (let index = 0; index < segments; index += 1) {
      const nextAngle = angle + (delta * Math.PI) / 180;
      const factor = (4 / 3) * Math.tan((nextAngle - angle) / 4);
      const p0 = { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
      const p3 = { x: cx + radius * Math.cos(nextAngle), y: cy + radius * Math.sin(nextAngle) };
      const p1 = { x: p0.x - factor * radius * Math.sin(angle), y: p0.y + factor * radius * Math.cos(angle) };
      const p2 = { x: p3.x + factor * radius * Math.sin(nextAngle), y: p3.y - factor * radius * Math.cos(nextAngle) };
      this.appendCurve(state, p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
      angle = nextAngle;
    }
  }

  closePath(): void {
    this.pathParts.push("Z");
    this.pathDirty = true;
    if (this.subpathStarted) {
      this.currentX = this.subpathStartX;
      this.currentY = this.subpathStartY;
    }
  }

  image(state: GraphicsState, width: number, height: number, pixels: string, imageMatrix: Matrix): boolean {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return false;
    if (width * height > 262144 || pixels.length < width * height) return false;
    const rects: string[] = [];
    for (let row = 0; row < height; row += 1) {
      for (let column = 0; column < width; column += 1) {
        const value = pixels.charCodeAt(row * width + column);
        const gray = Math.max(0, Math.min(255, Number.isFinite(value) ? value : 0));
        if (gray === 255) continue;
        rects.push(`<rect x="${column}" y="${row}" width="1" height="1" fill="rgb(${gray},${gray},${gray})"/>`);
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
      f: this.height + this.lly - transformed.f,
    };
    this.elements.push(`<image x="0" y="0" width="${width}" height="${height}" transform="matrix(${this.formatNumber(matrix.a)},${this.formatNumber(matrix.b)},${this.formatNumber(matrix.c)},${this.formatNumber(matrix.d)},${this.formatNumber(matrix.e)},${this.formatNumber(matrix.f)})" href="data:image/svg+xml;base64,${encoded}" opacity="${formatOpacity(state.opacity)}"/>`);
    return true;
  }

  clip(state: GraphicsState, evenodd: boolean): void {
    const id = `asy-clip-${this.clipCounter += 1}`;
    const d = this.pathToD();
    const path = `<path d="${d}"${evenodd ? ' clip-rule="evenodd"' : ""}/>`;
    const content = state.clipId
      ? `<g clip-path="url(#${state.clipId})">${path}</g>`
      : path;
    this.defs.push(
      `<clipPath id="${id}">${content}</clipPath>`
    );
    state.clipId = id;
    this.newPath();
  }

  paint(state: GraphicsState, mode: "fill" | "eofill" | "stroke"): void {
    const d = this.pathToD();
    if (d.length === 0) {
      this.newPath();
      return;
    }
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
    this.newPath();
  }

  show(state: GraphicsState, text: string, adjustments: Array<[number, number]> = []): void {
    const x = this.currentX - this.llx;
    const y = this.height - (this.currentY - this.lly);
    const scale = Math.sqrt(state.ctm.a ** 2 + state.ctm.b ** 2);
    const angle = -(Math.atan2(state.ctm.b, state.ctm.a) * 180) / Math.PI;
    const font = toCssFont(state.fontFamily);
    const transform = angle !== 0
      ? ` transform="rotate(${this.formatNumber(angle)} ${this.formatNumber(x)} ${this.formatNumber(y)})"`
      : "";
    const opacityAttr = state.opacity < 1 ? ` opacity="${formatOpacity(state.opacity)}"` : "";
    const weightAttr = font.weight ? ` font-weight="${font.weight}"` : "";
    const styleAttr = font.style ? ` font-style="${font.style}"` : "";
    const chars = Array.from(text);
    const content = adjustments.length === 0
      ? escapeXml(text)
      : chars.map((char, index) => {
        if (index === 0) return `<tspan>${escapeXml(char)}</tspan>`;
        const [dx, dy] = adjustments[index - 1] ?? [0, 0];
        const tx = state.ctm.a * dx + state.ctm.c * dy;
        const ty = -(state.ctm.b * dx + state.ctm.d * dy);
        return `<tspan dx="${this.formatNumber(tx)}" dy="${this.formatNumber(ty)}">${escapeXml(char)}</tspan>`;
      }).join("");
    this.elements.push(
      `<text x="${this.formatNumber(x)}" y="${this.formatNumber(y)}" fill="${state.fill}" ` +
      `font-family="${escapeXml(font.family)}" font-size="${this.formatNumber(state.fontSize * scale)}"` +
      `${weightAttr}${styleAttr}${transform}${opacityAttr}>${content}</text>`
    );
    const advance = state.fontSize * 0.6 * chars.length;
    const extraX = adjustments.reduce((sum, value) => sum + value[0], 0);
    const extraY = adjustments.reduce((sum, value) => sum + value[1], 0);
    this.currentX += state.ctm.a * (advance + extraX) + state.ctm.c * extraY;
    this.currentY += state.ctm.b * (advance + extraX) + state.ctm.d * extraY;
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
      definition = `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" gradientTransform="matrix(${matrix})" cx="${this.formatNumber(gradient.x2)}" cy="${this.formatNumber(gradient.y2)}" r="${this.formatNumber(gradient.r2)}" fx="${this.formatNumber(gradient.x1)}" fy="${this.formatNumber(gradient.y1)}" fr="${this.formatNumber(gradient.r1)}">${stops}</radialGradient>`;
    }
    this.defs.push(definition);
    return `url(#${id})`;
  }
}
