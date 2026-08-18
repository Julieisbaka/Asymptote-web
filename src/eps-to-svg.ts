/**
 * eps-to-svg.ts — Converts the constrained PostScript dialect emitted by
 * Asymptote's native EPS writer (psfile.cc) into SVG.
 *
 * Asymptote has no native SVG backend: `-f svg` normally shells out to the
 * external `dvisvgm` tool via fork()/exec(), which isn't available in WASM.
 * Since Asymptote's own EPS output only ever uses a small, well-known
 * operator subset (paths, fills, strokes, colors, clipping, transforms,
 * opacity, and basic text — no arbitrary user PostScript), we can interpret
 * it directly in-process.
 */

type Matrix = { a: number; b: number; c: number; d: number; e: number; f: number };

const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

function compose(m1: Matrix, m2: Matrix): Matrix {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    f: m1.b * m2.e + m1.d * m2.f + m1.f,
  };
}

interface GraphicsState {
  ctm: Matrix;
  fill: string;
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

function cloneState(s: GraphicsState): GraphicsState {
  return { ...s, dasharray: [...s.dasharray] };
}

function toColor(nums: number[]): string {
  if (nums.length === 1) {
    const v = Math.round(nums[0] * 255);
    return `rgb(${v},${v},${v})`;
  }
  if (nums.length === 3) {
    const [r, g, b] = nums.map((n) => Math.round(n * 255));
    return `rgb(${r},${g},${b})`;
  }
  if (nums.length === 4) {
    const [c, m, y, k] = nums;
    const r = Math.round(255 * (1 - c) * (1 - k));
    const g = Math.round(255 * (1 - m) * (1 - k));
    const b = Math.round(255 * (1 - y) * (1 - k));
    return `rgb(${r},${g},${b})`;
  }
  return "black";
}

const LINECAP = ["butt", "round", "square"];
const LINEJOIN = ["miter", "round", "bevel"];

function formatOpacity(value: number): string {
  return Math.max(0, Math.min(1, value)).toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

/**
 * Reads the constrained PostScript emitted by Asymptote on demand. Comments
 * and `/name { ... } bind? def` boilerplate are skipped rather than copied
 * into intermediate strings or a complete token array.
 */
class PostScriptTokenizer {
  private index = 0;

  constructor(private readonly source: string) {}

  next(): string | null {
    while (this.index < this.source.length) {
      this.skipIgnored();
      if (this.index >= this.source.length) return null;

      const start = this.index;
      const first = this.source[this.index];
      if (first === "[" || first === "]") {
        this.index += 1;
        return first;
      }
      if (first === "(") return this.readString();

      while (
        this.index < this.source.length &&
        !/\s/.test(this.source[this.index]) &&
        this.source[this.index] !== "[" &&
        this.source[this.index] !== "]"
      ) {
        this.index += 1;
      }
      return this.source.slice(start, this.index);
    }
    return null;
  }

  private skipIgnored(): void {
    while (this.index < this.source.length) {
      const char = this.source[this.index];
      if (/\s/.test(char)) {
        this.index += 1;
      } else if (char === "%") {
        while (this.index < this.source.length && this.source[this.index] !== "\n") {
          this.index += 1;
        }
      } else if (char === "/" && this.skipProcedureDefinition()) {
        // Continue to skip whitespace following the procedure definition.
      } else {
        return;
      }
    }
  }

  private skipProcedureDefinition(): boolean {
    const start = this.index;
    let nameEnd = start + 1;
    while (
      nameEnd < this.source.length &&
      !/\s/.test(this.source[nameEnd]) &&
      !"{}/".includes(this.source[nameEnd])
    ) {
      nameEnd += 1;
    }
    if (nameEnd === start + 1) return false;

    let bodyStart = nameEnd;
    while (bodyStart < this.source.length && /\s/.test(this.source[bodyStart])) bodyStart += 1;
    if (this.source[bodyStart] !== "{") return false;

    let depth = 0;
    let bodyEnd = bodyStart;
    do {
      if (this.source[bodyEnd] === "{") depth += 1;
      else if (this.source[bodyEnd] === "}") depth -= 1;
      bodyEnd += 1;
    } while (bodyEnd < this.source.length && depth > 0);

    let suffix = bodyEnd;
    while (suffix < this.source.length && /\s/.test(this.source[suffix])) suffix += 1;
    if (this.source.startsWith("bind", suffix) && /\s/.test(this.source[suffix + 4] ?? "")) {
      suffix += 4;
      while (suffix < this.source.length && /\s/.test(this.source[suffix])) suffix += 1;
    }
    if (this.source.startsWith("def", suffix)) {
      this.index = suffix + 3;
    } else {
      this.index = bodyEnd;
    }
    return true;
  }

  private readString(): string {
    const start = this.index;
    let depth = 0;
    let escaped = false;
    do {
      const char = this.source[this.index];
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === "(") depth += 1;
      else if (char === ")") depth -= 1;
      this.index += 1;
    } while (this.index < this.source.length && depth > 0);
    return this.source.slice(start, this.index);
  }
}

const NUMBER_RE = /^[+-]?(\d+\.?\d*|\.\d+)$/;

/** Options for the in-process EPS/PS-to-SVG converter. */
export interface EpsToSvgOptions {
  /** Number of decimal places used for generated coordinates. Defaults to 3. */
  precision?: number;
}

function unescapePostScriptString(token: string): string {
  const body = token.slice(1, -1);
  return body.replace(/\\([\\()nrtbf])/g, (_, escaped: string) => {
    switch (escaped) {
      case "n": return "\n";
      case "r": return "\r";
      case "t": return "\t";
      case "b": return "\b";
      case "f": return "\f";
      default: return escaped;
    }
  });
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

/**
 * Convert EPS/PS content into an SVG document string, entirely in-process
 * (no external tools, no fork/exec — safe to call in WASM or any browser).
 *
 * This understands the constrained PostScript operator subset Asymptote's
 * own EPS/PS writer emits (paths, fills, strokes, colors, clipping, and
 * `gsave`/`grestore`/`translate`/`scale`/`rotate` transforms). It is not a
 * general-purpose PostScript interpreter: arbitrary PS from other tools,
 * embedded raster images, and PostScript shading/gradients are not
 * supported and are silently ignored rather than throwing.
 *
 * Since this only depends on plain string parsing, it works equally well
 * on EPS/PS files produced outside of this library (e.g. from a prior
 * `asy -f eps` run, or files already on disk) — it does not require an
 * Asymptote engine instance.
 *
 * @param eps - The full text of an EPS or PS file (must include a
 * `%%BoundingBox` or `%%HiResBoundingBox` comment to size the SVG).
 * @returns A standalone `<svg>` document string.
 *
 * @example
 * ```ts
 * import { epsToSvg } from "asymptote-web";
 *
 * const svg = epsToSvg(await (await fetch("drawing.eps")).text());
 * document.querySelector("#output").innerHTML = svg;
 * ```
 */
export function epsToSvg(eps: string, options: EpsToSvgOptions = {}): string {
  const precision = options.precision ?? 3;
  if (!Number.isInteger(precision) || precision < 0 || precision > 12) {
    throw new RangeError("epsToSvg: precision must be an integer from 0 to 12");
  }
  const formatNumber = (value: number): string => value.toFixed(precision);
  const bboxMatch = /%%HiResBoundingBox:\s*([\d.+-]+)\s+([\d.+-]+)\s+([\d.+-]+)\s+([\d.+-]+)/.exec(eps)
    ?? /%%BoundingBox:\s*([\d.+-]+)\s+([\d.+-]+)\s+([\d.+-]+)\s+([\d.+-]+)/.exec(eps);

  const llx = bboxMatch ? parseFloat(bboxMatch[1]) : 0;
  const lly = bboxMatch ? parseFloat(bboxMatch[2]) : 0;
  const urx = bboxMatch ? parseFloat(bboxMatch[3]) : 100;
  const ury = bboxMatch ? parseFloat(bboxMatch[4]) : 100;
  const width = urx - llx;
  const height = ury - lly;

  const tokens = new PostScriptTokenizer(eps);

  let clipCounter = 0;
  const defs: string[] = [];
  const elements: string[] = [];

  let state: GraphicsState = {
    ctm: IDENTITY,
    fill: "black",
    stroke: "black",
    opacity: 1,
    fontFamily: "sans-serif",
    fontSize: 12,
    linewidth: 1,
    linecap: 0,
    linejoin: 0,
    miterlimit: 10,
    dasharray: [],
    dashoffset: 0,
    clipId: null,
  };
  const stateStack: GraphicsState[] = [];

  let pathParts: string[] = [];
  let currentX = 0;
  let currentY = 0;

  const stack: (number | number[] | string)[] = [];
  const popN = (n: number): number[] => {
    const nums: number[] = [];
    for (let i = 0; i < n; i += 1) {
      const v = stack.pop();
      nums.unshift(typeof v === "number" ? v : 0);
    }
    return nums;
  };

  const appendPoint = (op: "M" | "L", x: number, y: number) => {
    const { a, b, c, d, e, f } = state.ctm;
    currentX = a * x + c * y + e;
    currentY = b * x + d * y + f;
    pathParts.push(
      `${op}${formatNumber(currentX - llx)},${formatNumber(height - (currentY - lly))}`
    );
  };

  const appendCurve = (x1: number, y1: number, x2: number, y2: number, x: number, y: number) => {
    const { a, b, c, d, e, f } = state.ctm;
    const ax1 = a * x1 + c * y1 + e;
    const ay1 = b * x1 + d * y1 + f;
    const ax2 = a * x2 + c * y2 + e;
    const ay2 = b * x2 + d * y2 + f;
    currentX = a * x + c * y + e;
    currentY = b * x + d * y + f;
    pathParts.push(
      `C${formatNumber(ax1 - llx)},${formatNumber(height - (ay1 - lly))} ` +
      `${formatNumber(ax2 - llx)},${formatNumber(height - (ay2 - lly))} ` +
      `${formatNumber(currentX - llx)},${formatNumber(height - (currentY - lly))}`
    );
  };

  const pathToD = (): string => pathParts.join(" ");

  const doClip = (evenodd: boolean) => {
    const d = pathToD();
    const id = `asy-clip-${clipCounter += 1}`;
    defs.push(
      `<clipPath id="${id}"><path d="${d}"${evenodd ? ' clip-rule="evenodd"' : ""}/></clipPath>`
    );
    state.clipId = id;
  };

  const doPaint = (mode: "fill" | "eofill" | "stroke") => {
    const d = pathToD();
    if (d.length === 0) return;
    const clipAttr = state.clipId ? ` clip-path="url(#${state.clipId})"` : "";
    const opacityAttr = state.opacity < 1
      ? ` opacity="${formatOpacity(state.opacity)}"`
      : "";
    if (mode === "stroke") {
      const dash = state.dasharray.length > 0
        ? ` stroke-dasharray="${state.dasharray.join(",")}" stroke-dashoffset="${state.dashoffset}"`
        : "";
      elements.push(
        `<path d="${d}" fill="none" stroke="${state.stroke}" stroke-width="${state.linewidth}" ` +
        `stroke-linecap="${LINECAP[state.linecap] ?? "butt"}" stroke-linejoin="${LINEJOIN[state.linejoin] ?? "miter"}" ` +
        `stroke-miterlimit="${state.miterlimit}"${dash}${opacityAttr}${clipAttr}/>`
      );
    } else {
      const rule = mode === "eofill" ? ' fill-rule="evenodd"' : "";
      elements.push(`<path d="${d}" fill="${state.fill}"${rule}${opacityAttr}${clipAttr}/>`);
    }
  };

  const doShow = (text: string) => {
    const x = currentX - llx;
    const y = height - (currentY - lly);
    const scale = Math.sqrt(state.ctm.a ** 2 + state.ctm.b ** 2);
    const angle = -(Math.atan2(state.ctm.b, state.ctm.a) * 180) / Math.PI;
    const transform = angle !== 0
      ? ` transform="rotate(${formatNumber(angle)} ${formatNumber(x)} ${formatNumber(y)})"`
      : "";
    const opacityAttr = state.opacity < 1
      ? ` opacity="${formatOpacity(state.opacity)}"`
      : "";
    elements.push(
      `<text x="${formatNumber(x)}" y="${formatNumber(y)}" fill="${state.fill}" ` +
      `font-family="${escapeXml(toCssFontFamily(state.fontFamily))}" font-size="${formatNumber(state.fontSize * scale)}"` +
      `${transform}${opacityAttr}>${escapeXml(text)}</text>`
    );
  };

  for (let tok = tokens.next(); tok !== null; tok = tokens.next()) {

    if (NUMBER_RE.test(tok)) {
      stack.push(parseFloat(tok));
      continue;
    }
    if (tok.startsWith("(") && tok.endsWith(")")) {
      stack.push(unescapePostScriptString(tok));
      continue;
    }
    if (tok === "[") {
      const arr: number[] = [];
      for (let value = tokens.next(); value !== null && value !== "]"; value = tokens.next()) {
        arr.push(parseFloat(value));
      }
      stack.push(arr);
      continue;
    }
    if (tok.startsWith("/")) {
      stack.push(tok.slice(1));
      continue;
    }

    switch (tok) {
      case "newpath":
        pathParts = [];
        break;
      case "moveto": {
        const [x, y] = popN(2);
        appendPoint("M", x, y);
        break;
      }
      case "lineto": {
        const [x, y] = popN(2);
        appendPoint("L", x, y);
        break;
      }
      case "rmoveto": {
        const [dx, dy] = popN(2);
        appendPoint("M", currentX + dx, currentY + dy);
        break;
      }
      case "rlineto": {
        const [dx, dy] = popN(2);
        appendPoint("L", currentX + dx, currentY + dy);
        break;
      }
      case "curveto": {
        const [x1, y1, x2, y2, x3, y3] = popN(6);
        appendCurve(x1, y1, x2, y2, x3, y3);
        break;
      }
      case "closepath":
        pathParts.push("Z");
        break;
      case "gsave":
        stateStack.push(cloneState(state));
        break;
      case "grestore":
        state = stateStack.pop() ?? state;
        break;
      case "translate": {
        const [tx, ty] = popN(2);
        state.ctm = compose(state.ctm, { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty });
        break;
      }
      case "scale": {
        const [sx, sy] = popN(2);
        state.ctm = compose(state.ctm, { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 });
        break;
      }
      case "rotate": {
        const [deg] = popN(1);
        const r = (deg * Math.PI) / 180;
        state.ctm = compose(state.ctm, { a: Math.cos(r), b: Math.sin(r), c: -Math.sin(r), d: Math.cos(r), e: 0, f: 0 });
        break;
      }
      case "setgray":
        state.fill = state.stroke = toColor(popN(1));
        break;
      case "setrgbcolor":
        state.fill = state.stroke = toColor(popN(3));
        break;
      case "setcmykcolor":
        state.fill = state.stroke = toColor(popN(4));
        break;
      case "findfont": {
        const font = stack.pop();
        if (typeof font === "string") state.fontFamily = font;
        break;
      }
      case "scalefont": {
        const size = stack.pop();
        stack.pop(); // font name/object, retained as state.fontFamily by findfont
        if (typeof size === "number") state.fontSize = size;
        break;
      }
      case "setfont":
        stack.pop();
        break;
      case "setopacityalpha":
      case "setalpha":
      case "setopacity":
        state.opacity = popN(1)[0];
        break;
      case "show": {
        const text = stack.pop();
        if (typeof text === "string") doShow(text);
        break;
      }
      case "setlinewidth":
      case "Setlinewidth":
        state.linewidth = popN(1)[0];
        break;
      case "setlinecap":
        state.linecap = popN(1)[0];
        break;
      case "setlinejoin":
        state.linejoin = popN(1)[0];
        break;
      case "setmiterlimit":
        state.miterlimit = popN(1)[0];
        break;
      case "setdash": {
        const offset = stack.pop();
        const arr = stack.pop();
        state.dasharray = Array.isArray(arr) ? arr : [];
        state.dashoffset = typeof offset === "number" ? offset : 0;
        break;
      }
      case "fill":
        doPaint("fill");
        break;
      case "eofill":
        doPaint("eofill");
        break;
      case "stroke":
        doPaint("stroke");
        break;
      case "clip":
        doClip(false);
        break;
      case "eoclip":
        doClip(true);
        break;
      case "showpage":
      case "grestoreall":
        break;
      default:
        // Unsupported/unknown operator: ignore silently for graceful degradation.
        break;
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}">` +
    (defs.length > 0 ? `<defs>${defs.join("")}</defs>` : "") +
    elements.join("") +
    `</svg>`
  );
}
