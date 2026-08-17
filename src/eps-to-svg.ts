/**
 * eps-to-svg.ts — Converts the constrained PostScript dialect emitted by
 * Asymptote's native EPS writer (psfile.cc) into SVG.
 *
 * Asymptote has no native SVG backend: `-f svg` normally shells out to the
 * external `dvisvgm` tool via fork()/exec(), which isn't available in WASM.
 * Since Asymptote's own EPS output only ever uses a small, well-known
 * operator subset (paths, fills, strokes, colors, clipping, transforms —
 * no arbitrary user PostScript), we can interpret it directly in-process.
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

function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
}

type PathSegment =
  | { op: "M" | "L"; x: number; y: number }
  | { op: "C"; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { op: "Z" };

interface GraphicsState {
  ctm: Matrix;
  fill: string;
  stroke: string;
  opacity: number;
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
 * Strip `/name { ... } bind? def` procedure definitions (brace-balanced,
 * since Asymptote's boilerplate contains nested `{ }` in `ifelse` blocks).
 * We never need to execute these bodies — the only one Asymptote emits
 * (`Setlinewidth`) is handled as a builtin alias for `setlinewidth`.
 */
function stripProcDefs(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    if (text[i] === "/") {
      const nameMatch = /^\/[^\s{}/]+/.exec(text.slice(i));
      if (nameMatch) {
        let j = i + nameMatch[0].length;
        while (j < text.length && /\s/.test(text[j])) j += 1;
        if (text[j] === "{") {
          let depth = 0;
          let k = j;
          do {
            if (text[k] === "{") depth += 1;
            else if (text[k] === "}") depth -= 1;
            k += 1;
          } while (k < text.length && depth > 0);
          // Skip trailing "bind" and "def" keywords.
          const rest = /^\s*(bind\s+)?def/.exec(text.slice(k));
          i = rest ? k + rest[0].length : k;
          out += " ";
          continue;
        }
      }
    }
    out += text[i];
    i += 1;
  }
  return out;
}

function stripComments(text: string): string {
  return text.replace(/%[^\n]*/g, "");
}

function tokenize(text: string): string[] {
  return text
    .replace(/([[\]])/g, " $1 ")
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

const NUMBER_RE = /^[+-]?(\d+\.?\d*|\.\d+)$/;

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
export function epsToSvg(eps: string): string {
  const bboxMatch = /%%HiResBoundingBox:\s*([\d.+-]+)\s+([\d.+-]+)\s+([\d.+-]+)\s+([\d.+-]+)/.exec(eps)
    ?? /%%BoundingBox:\s*([\d.+-]+)\s+([\d.+-]+)\s+([\d.+-]+)\s+([\d.+-]+)/.exec(eps);

  const llx = bboxMatch ? parseFloat(bboxMatch[1]) : 0;
  const lly = bboxMatch ? parseFloat(bboxMatch[2]) : 0;
  const urx = bboxMatch ? parseFloat(bboxMatch[3]) : 100;
  const ury = bboxMatch ? parseFloat(bboxMatch[4]) : 100;
  const width = urx - llx;
  const height = ury - lly;

  const body = stripProcDefs(stripComments(eps));
  const tokens = tokenize(body);

  let clipCounter = 0;
  const defs: string[] = [];
  const paths: string[] = [];

  let state: GraphicsState = {
    ctm: IDENTITY,
    fill: "black",
    stroke: "black",
    opacity: 1,
    linewidth: 1,
    linecap: 0,
    linejoin: 0,
    miterlimit: 10,
    dasharray: [],
    dashoffset: 0,
    clipId: null,
  };
  const stateStack: GraphicsState[] = [];

  let subpaths: PathSegment[][] = [];
  let currentSubpath: PathSegment[] = [];
  let currentPoint: [number, number] = [0, 0];

  const stack: (number | number[])[] = [];
  const popN = (n: number): number[] => {
    const nums: number[] = [];
    for (let i = 0; i < n; i += 1) {
      const v = stack.pop();
      nums.unshift(typeof v === "number" ? v : 0);
    }
    return nums;
  };

  const toAbs = (x: number, y: number): [number, number] => apply(state.ctm, x, y);
  const toSvg = (x: number, y: number): [number, number] => [x - llx, height - (y - lly)];

  const finishSubpath = () => {
    if (currentSubpath.length > 0) {
      subpaths.push(currentSubpath);
      currentSubpath = [];
    }
  };

  const pathToD = (): string => {
    finishSubpath();
    const parts: string[] = [];
    for (const sp of subpaths) {
      for (const seg of sp) {
        if (seg.op === "M" || seg.op === "L") {
          const [sx, sy] = toSvg(seg.x, seg.y);
          parts.push(`${seg.op}${sx.toFixed(3)},${sy.toFixed(3)}`);
        } else if (seg.op === "C") {
          const [x1, y1] = toSvg(seg.x1, seg.y1);
          const [x2, y2] = toSvg(seg.x2, seg.y2);
          const [x, y] = toSvg(seg.x, seg.y);
          parts.push(
            `C${x1.toFixed(3)},${y1.toFixed(3)} ${x2.toFixed(3)},${y2.toFixed(3)} ${x.toFixed(3)},${y.toFixed(3)}`
          );
        } else {
          parts.push("Z");
        }
      }
    }
    return parts.join(" ");
  };

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
      paths.push(
        `<path d="${d}" fill="none" stroke="${state.stroke}" stroke-width="${state.linewidth}" ` +
        `stroke-linecap="${LINECAP[state.linecap] ?? "butt"}" stroke-linejoin="${LINEJOIN[state.linejoin] ?? "miter"}" ` +
        `stroke-miterlimit="${state.miterlimit}"${dash}${opacityAttr}${clipAttr}/>`
      );
    } else {
      const rule = mode === "eofill" ? ' fill-rule="evenodd"' : "";
      paths.push(`<path d="${d}" fill="${state.fill}"${rule}${opacityAttr}${clipAttr}/>`);
    }
  };

  for (let i = 0; i < tokens.length; i += 1) {
    const tok = tokens[i];

    if (NUMBER_RE.test(tok)) {
      stack.push(parseFloat(tok));
      continue;
    }
    if (tok === "[") {
      const arr: number[] = [];
      i += 1;
      while (i < tokens.length && tokens[i] !== "]") {
        arr.push(parseFloat(tokens[i]));
        i += 1;
      }
      stack.push(arr);
      continue;
    }
    if (tok.startsWith("/")) continue; // stray name literal (unused)

    switch (tok) {
      case "newpath":
        subpaths = [];
        currentSubpath = [];
        break;
      case "moveto": {
        const [x, y] = popN(2);
        finishSubpath();
        const [ax, ay] = toAbs(x, y);
        currentSubpath.push({ op: "M", x: ax, y: ay });
        currentPoint = [ax, ay];
        break;
      }
      case "lineto": {
        const [x, y] = popN(2);
        const [ax, ay] = toAbs(x, y);
        currentSubpath.push({ op: "L", x: ax, y: ay });
        currentPoint = [ax, ay];
        break;
      }
      case "rmoveto": {
        const [dx, dy] = popN(2);
        finishSubpath();
        const [ax, ay] = toAbs(currentPoint[0] + dx, currentPoint[1] + dy);
        currentSubpath.push({ op: "M", x: ax, y: ay });
        currentPoint = [ax, ay];
        break;
      }
      case "rlineto": {
        const [dx, dy] = popN(2);
        const [ax, ay] = toAbs(currentPoint[0] + dx, currentPoint[1] + dy);
        currentSubpath.push({ op: "L", x: ax, y: ay });
        currentPoint = [ax, ay];
        break;
      }
      case "curveto": {
        const [x1, y1, x2, y2, x3, y3] = popN(6);
        const [ax1, ay1] = toAbs(x1, y1);
        const [ax2, ay2] = toAbs(x2, y2);
        const [ax3, ay3] = toAbs(x3, y3);
        currentSubpath.push({ op: "C", x1: ax1, y1: ay1, x2: ax2, y2: ay2, x: ax3, y: ay3 });
        currentPoint = [ax3, ay3];
        break;
      }
      case "closepath":
        currentSubpath.push({ op: "Z" });
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
      case "setopacityalpha":
      case "setalpha":
      case "setopacity":
        state.opacity = popN(1)[0];
        break;
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
    paths.join("") +
    `</svg>`
  );
}
