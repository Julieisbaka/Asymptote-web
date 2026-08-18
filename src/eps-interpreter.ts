import {
  cloneState,
  compose,
  IDENTITY,
  toColor,
  type Gradient,
  type GraphicsState,
} from "./eps-graphics.js";
import { SvgWriter } from "./eps-svg-writer.js";
import { PostScriptTokenizer } from "./eps-tokenizer.js";

const NUMBER_RE = /^[+-]?(\d+\.?\d*|\.\d+)$/;

interface Dictionary {
  [key: string]: Operand;
}

type Operand = number | Operand[] | string | Dictionary;

interface ParsedStop {
  offset: number;
  color: string;
  opacity: number;
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

export class PostScriptInterpreter {
  private state: GraphicsState = {
    ctm: IDENTITY,
    fill: "black",
    gradient: null,
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
  private readonly stateStack: GraphicsState[] = [];
  private readonly stack: Operand[] = [];

  constructor(
    private readonly tokens: PostScriptTokenizer,
    private readonly writer: SvgWriter
  ) {}

  run(): void {
    for (let tok = this.tokens.next(); tok !== null; tok = this.tokens.next()) {
      if (NUMBER_RE.test(tok)) {
        this.stack.push(parseFloat(tok));
        continue;
      }
      if (tok.startsWith("(") && tok.endsWith(")")) {
        this.stack.push(unescapePostScriptString(tok));
        continue;
      }
      if (tok === "[") {
        this.stack.push(this.readArray());
        continue;
      }
      if (tok === "<<") {
        this.stack.push(this.readDictionary());
        continue;
      }
      if (tok.startsWith("/")) {
        this.stack.push(tok.slice(1));
        continue;
      }

      this.dispatch(tok);
    }
  }

  private dispatch(tok: string): void {
    switch (tok) {
      case "newpath":
        this.writer.newPath();
        break;
      case "moveto": {
        const [x, y] = this.popN(2);
        this.writer.appendPoint(this.state, "M", x, y);
        break;
      }
      case "lineto": {
        const [x, y] = this.popN(2);
        this.writer.appendPoint(this.state, "L", x, y);
        break;
      }
      case "rmoveto": {
        const [dx, dy] = this.popN(2);
        const point = this.writer.currentPoint;
        this.writer.appendPoint(this.state, "M", point.x + dx, point.y + dy);
        break;
      }
      case "rlineto": {
        const [dx, dy] = this.popN(2);
        const point = this.writer.currentPoint;
        this.writer.appendPoint(this.state, "L", point.x + dx, point.y + dy);
        break;
      }
      case "curveto": {
        const [x1, y1, x2, y2, x3, y3] = this.popN(6);
        this.writer.appendCurve(this.state, x1, y1, x2, y2, x3, y3);
        break;
      }
      case "closepath":
        this.writer.closePath();
        break;
      case "gsave":
        this.stateStack.push(cloneState(this.state));
        break;
      case "grestore":
        this.state = this.stateStack.pop() ?? this.state;
        break;
      case "translate": {
        const [tx, ty] = this.popN(2);
        this.state.ctm = compose(this.state.ctm, { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty });
        break;
      }
      case "scale": {
        const [sx, sy] = this.popN(2);
        this.state.ctm = compose(this.state.ctm, { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 });
        break;
      }
      case "rotate": {
        const [deg] = this.popN(1);
        const r = (deg * Math.PI) / 180;
        this.state.ctm = compose(this.state.ctm, {
          a: Math.cos(r), b: Math.sin(r), c: -Math.sin(r), d: Math.cos(r), e: 0, f: 0,
        });
        break;
      }
      case "setgray":
        this.state.fill = this.state.stroke = toColor(this.popN(1));
        this.state.gradient = null;
        break;
      case "setrgbcolor":
        this.state.fill = this.state.stroke = toColor(this.popN(3));
        this.state.gradient = null;
        break;
      case "setcmykcolor":
        this.state.fill = this.state.stroke = toColor(this.popN(4));
        this.state.gradient = null;
        break;
      case "setlineargradient":
        this.state.gradient = this.makeExplicitGradient("linear");
        break;
      case "setradialgradient":
        this.state.gradient = this.makeExplicitGradient("radial");
        break;
      case "findfont": {
        const font = this.stack.pop();
        if (typeof font === "string") this.state.fontFamily = font;
        break;
      }
      case "scalefont": {
        const size = this.stack.pop();
        this.stack.pop(); // font name/object, retained as state.fontFamily by findfont
        if (typeof size === "number") this.state.fontSize = size;
        break;
      }
      case "setfont":
        this.stack.pop();
        break;
      case "setopacityalpha":
      case "setalpha":
      case "setopacity":
        this.state.opacity = this.popN(1)[0];
        break;
      case "show": {
        const text = this.stack.pop();
        if (typeof text === "string") this.writer.show(this.state, text);
        break;
      }
      case "setlinewidth":
      case "Setlinewidth":
        this.state.linewidth = this.popN(1)[0];
        break;
      case "setlinecap":
        this.state.linecap = this.popN(1)[0];
        break;
      case "setlinejoin":
        this.state.linejoin = this.popN(1)[0];
        break;
      case "setmiterlimit":
        this.state.miterlimit = this.popN(1)[0];
        break;
      case "setdash": {
        const offset = this.stack.pop();
        const arr = this.stack.pop();
        this.state.dasharray = Array.isArray(arr)
          ? arr.filter((value): value is number => typeof value === "number")
          : [];
        this.state.dashoffset = typeof offset === "number" ? offset : 0;
        break;
      }
      case "fill":
        this.writer.paint(this.state, "fill");
        break;
      case "eofill":
        this.writer.paint(this.state, "eofill");
        break;
      case "stroke":
        this.writer.paint(this.state, "stroke");
        break;
      case "makepattern": {
        const matrix = this.stack.pop();
        const pattern = this.stack.pop();
        if (isDictionary(pattern) && (Array.isArray(matrix) || matrix === undefined)) this.stack.push(pattern);
        break;
      }
      case "setpattern": {
        const gradient = gradientFromValue(this.stack.pop());
        if (gradient) this.state.gradient = gradient;
        break;
      }
      case "shfill": {
        const gradient = gradientFromValue(this.stack.pop());
        if (gradient) {
          this.state.gradient = gradient;
          this.writer.paint(this.state, "fill");
        }
        break;
      }
      case "clip":
        this.writer.clip(this.state, false);
        break;
      case "eoclip":
        this.writer.clip(this.state, true);
        break;
      case "showpage":
      case "grestoreall":
        break;
      default:
        // Unsupported/unknown operator: ignore silently for graceful degradation.
        break;
    }
  }

  private popN(n: number): number[] {
    const nums: number[] = [];
    for (let i = 0; i < n; i += 1) {
      const value = this.stack.pop();
      nums.unshift(typeof value === "number" ? value : 0);
    }
    return nums;
  }

  private readArray(): Operand[] {
    const values: Operand[] = [];
    for (let token = this.tokens.next(); token !== null && token !== "]"; token = this.tokens.next()) {
      values.push(this.readValue(token));
    }
    return values;
  }

  private readDictionary(): Dictionary {
    const dictionary: Dictionary = {};
    for (let token = this.tokens.next(); token !== null && token !== ">>";) {
      const key = token.startsWith("/") ? token.slice(1) : token;
      const valueToken = this.tokens.next();
      if (valueToken === null) break;
      dictionary[key] = this.readValue(valueToken);
      token = this.tokens.next() ?? ">>";
    }
    return dictionary;
  }

  private readValue(token: string): Operand {
    if (token === "[") return this.readArray();
    if (token === "<<") return this.readDictionary();
    if (token.startsWith("(") && token.endsWith(")")) return unescapePostScriptString(token);
    if (NUMBER_RE.test(token)) return parseFloat(token);
    return token.startsWith("/") ? token.slice(1) : token;
  }

  private makeExplicitGradient(kind: "linear" | "radial"): Gradient | null {
    const stops = parseStops(this.stack.pop());
    const count = kind === "linear" ? 4 : 6;
    if (this.stack.length < count) return null;
    const values = this.stack.splice(this.stack.length - count, count);
    if (!values.every((value): value is number => typeof value === "number" && Number.isFinite(value))) {
      return null;
    }
    if (!stops) return null;
    return kind === "linear"
      ? { kind, x1: values[0], y1: values[1], x2: values[2], y2: values[3], stops }
      : { kind, x1: values[0], y1: values[1], r1: values[2], x2: values[3], y2: values[4], r2: values[5], stops };
  }
}

function isDictionary(value: Operand | undefined): value is Dictionary {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function numbers(value: Operand | undefined): number[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "number")
    ? value as number[]
    : null;
}

function parseStops(value: Operand | undefined, c1?: Operand, c2?: Operand): ParsedStop[] | null {
  const flat = numbers(value);
  if (flat && flat.length >= 8 && flat.length % 4 === 0) {
    const stops: ParsedStop[] = [];
    for (let i = 0; i < flat.length; i += 4) {
      stops.push({ offset: flat[i], color: toColor(flat.slice(i + 1, i + 4)), opacity: 1 });
    }
    return stops;
  }
  const first = numbers(c1);
  const second = numbers(c2);
  if (first && second && first.length >= 3 && second.length >= 3) {
    return [
      { offset: 0, color: toColor(first.slice(0, 3)), opacity: first[3] ?? 1 },
      { offset: 1, color: toColor(second.slice(0, 3)), opacity: second[3] ?? 1 },
    ];
  }
  return null;
}

function gradientFromValue(value: Operand | undefined): Gradient | null {
  if (!isDictionary(value)) return null;
  if (value.Shading !== undefined) return gradientFromValue(value.Shading);
  const type = value.ShadingType;
  const coords = numbers(value.Coords);
  if (type !== 2 && type !== 3) return null;
  if (!coords || (type === 2 && coords.length < 4) || (type === 3 && coords.length < 6)) return null;
  const stops = parseStops(value.ColorStops, value.C0, value.C1);
  if (!stops) return null;
  return type === 2
    ? { kind: "linear", x1: coords[0], y1: coords[1], x2: coords[2], y2: coords[3], stops }
    : { kind: "radial", x1: coords[0], y1: coords[1], r1: coords[2], x2: coords[3], y2: coords[4], r2: coords[5], stops };
}
