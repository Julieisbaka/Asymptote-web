import {
  cloneState,
  compose,
  hsbToColor,
  IDENTITY,
  toColor,
  type Gradient,
  type GraphicsState,
} from "./eps-graphics.js";
import {
  NUMBER_RE,
  isDictionary,
  isMatrix,
  isMatrixArray,
  matrixFromOperand,
  textChars,
  unescapePostScriptString,
} from "./eps-interpreter-operands.js";
import {
  colorComponentCount,
  gradientFromValue,
  parseStops,
  unsupportedShadingMessage,
} from "./eps-interpreter-gradients.js";
import type { Dictionary, Operand } from "./eps-interpreter-types.js";
import { SvgWriter } from "./eps-svg-writer.js";
import { PostScriptTokenizer } from "./eps-tokenizer.js";

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
  private readonly warnings: string[] = [];
  private colorComponentCount: number | null = null;

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

  getWarnings(): string[] {
    return [...this.warnings];
  }

  private warn(message: string): void {
    this.warnings.push(`EPS/PS: ${message}`);
  }

  private warnUnsupportedShading(value: Operand | undefined): void {
    const message = unsupportedShadingMessage(value);
    if (message) this.warn(message);
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
        const point = this.writer.userPoint(this.state);
        this.writer.appendPoint(this.state, "M", point.x + dx, point.y + dy);
        break;
      }
      case "rlineto": {
        const [dx, dy] = this.popN(2);
        const point = this.writer.userPoint(this.state);
        this.writer.appendPoint(this.state, "L", point.x + dx, point.y + dy);
        break;
      }
      case "curveto": {
        const [x1, y1, x2, y2, x3, y3] = this.popN(6);
        this.writer.appendCurve(this.state, x1, y1, x2, y2, x3, y3);
        break;
      }
      case "rcurveto": {
        const [dx1, dy1, dx2, dy2, dx3, dy3] = this.popN(6);
        const point = this.writer.userPoint(this.state);
        this.writer.appendCurve(
          this.state,
          point.x + dx1,
          point.y + dy1,
          point.x + dx1 + dx2,
          point.y + dy1 + dy2,
          point.x + dx1 + dx2 + dx3,
          point.y + dy1 + dy2 + dy3
        );
        break;
      }
      case "arc":
      case "arcn": {
        const [cx, cy, radius, start, end] = this.popN(5);
        this.writer.appendArc(this.state, cx, cy, radius, start, end, tok === "arc");
        break;
      }
      case "arct": {
        const [x1, y1, x2, y2, radius] = this.popN(5);
        this.appendTangentArc(x1, y1, x2, y2, radius);
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
      case "concat": {
        const matrix = matrixFromOperand(this.stack.pop());
        if (isMatrix(matrix)) this.state.ctm = compose(this.state.ctm, matrix);
        else this.warn("ignored malformed concat matrix");
        break;
      }
      case "setmatrix": {
        const matrix = matrixFromOperand(this.stack.pop());
        if (isMatrix(matrix)) this.state.ctm = matrix;
        else this.warn("ignored malformed setmatrix matrix");
        break;
      }
      case "setgray":
        this.state.fill = this.state.stroke = toColor(this.popN(1));
        this.state.gradient = null;
        this.colorComponentCount = 1;
        break;
      case "setrgbcolor":
        this.state.fill = this.state.stroke = toColor(this.popN(3));
        this.state.gradient = null;
        this.colorComponentCount = 3;
        break;
      case "setcmykcolor":
        this.state.fill = this.state.stroke = toColor(this.popN(4));
        this.state.gradient = null;
        this.colorComponentCount = 4;
        break;
      case "sethsbcolor": {
        const [h, s, b] = this.popN(3);
        this.state.fill = this.state.stroke = hsbToColor(h, s, b);
        this.state.gradient = null;
        this.colorComponentCount = 3;
        break;
      }
      case "setcolorspace": {
        const colorspace = this.stack.pop();
        this.colorComponentCount = colorComponentCount(colorspace);
        this.warn(`ignored unsupported color space/operator '${tok}'`);
        break;
      }
      case "setcolor":
        if (this.colorComponentCount === null) {
          while (typeof this.stack[this.stack.length - 1] === "number") this.stack.pop();
        } else {
          this.popN(this.colorComponentCount);
        }
        this.warn(`ignored unsupported color space/operator '${tok}'`);
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
        {
          const opacity = this.popN(1)[0];
          this.state.opacity = Number.isFinite(opacity)
            ? Math.max(0, Math.min(1, opacity))
            : 0;
        }
        break;
      case "show": {
        const text = this.stack.pop();
        if (typeof text === "string") this.writer.show(this.state, text);
        break;
      }
      case "ashow": {
        const text = this.stack.pop();
        const [ax, ay] = this.popN(2);
        if (typeof text === "string") this.writer.show(this.state, text, textChars(text).map(() => [ax, ay]));
        break;
      }
      case "widthshow": {
        const text = this.stack.pop();
        const char = this.popN(1)[0];
        const [cx, cy] = this.popN(2);
        if (typeof text === "string") {
          this.writer.show(this.state, text, textChars(text).map((value) =>
            value === char ? [cx, cy] : [0, 0]));
        }
        break;
      }
      case "awidthshow": {
        const text = this.stack.pop();
        const char = this.popN(1)[0];
        const [cx, cy] = this.popN(2);
        const [ax, ay] = this.popN(2);
        if (typeof text === "string") {
          this.writer.show(this.state, text, textChars(text).map((value) =>
            value === char ? [ax + cx, ay + cy] : [ax, ay]));
        }
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
        const pattern = this.stack.pop();
        const gradient = gradientFromValue(pattern);
        if (gradient) this.state.gradient = gradient;
        else this.warnUnsupportedShading(pattern);
        break;
      }
      case "shfill": {
        const shading = this.stack.pop();
        const gradient = gradientFromValue(shading);
        if (gradient) {
          this.state.gradient = gradient;
          this.writer.paint(this.state, "fill");
        } else this.warnUnsupportedShading(shading);
        break;
      }
      case "image": {
        const data = this.stack.pop();
        const matrix = this.stack.pop();
        const bits = this.stack.pop();
        const height = this.stack.pop();
        const width = this.stack.pop();
        if (typeof data === "string" && bits === 8 && typeof width === "number" && typeof height === "number" && isMatrixArray(matrix) && this.writer.image(this.state, width, height, data, matrixFromOperand(matrix)!)) break;
        this.warn("ignored raster image: only 8-bit grayscale string data is supported");
        break;
      }
      case "colorimage":
      case "imagemask":
        this.warn(`ignored raster image operator '${tok}'`);
        break;
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
        this.warn(`ignored unsupported operator '${tok}'`);
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

  private appendTangentArc(x1: number, y1: number, x2: number, y2: number, radius: number): void {
    const current = this.writer.userPoint(this.state);
    if (radius <= 0 || !Number.isFinite(radius)) {
      this.writer.appendPoint(this.state, "L", x1, y1);
      return;
    }
    const incoming = { x: current.x - x1, y: current.y - y1 };
    const outgoing = { x: x2 - x1, y: y2 - y1 };
    const incomingLength = Math.hypot(incoming.x, incoming.y);
    const outgoingLength = Math.hypot(outgoing.x, outgoing.y);
    if (incomingLength === 0 || outgoingLength === 0) {
      this.writer.appendPoint(this.state, "L", x1, y1);
      return;
    }
    const u = { x: incoming.x / incomingLength, y: incoming.y / incomingLength };
    const v = { x: outgoing.x / outgoingLength, y: outgoing.y / outgoingLength };
    const dot = Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y));
    const halfAngle = Math.acos(dot) / 2;
    const bisectorLength = Math.hypot(u.x + v.x, u.y + v.y);
    if (halfAngle < 1e-7 || bisectorLength < 1e-7 || Math.abs(Math.sin(halfAngle)) < 1e-7) {
      this.writer.appendPoint(this.state, "L", x1, y1);
      return;
    }
    const tangentDistance = radius / Math.tan(halfAngle);
    const tangentStart = { x: x1 + u.x * tangentDistance, y: y1 + u.y * tangentDistance };
    const tangentEnd = { x: x1 + v.x * tangentDistance, y: y1 + v.y * tangentDistance };
    const bisector = { x: (u.x + v.x) / bisectorLength, y: (u.y + v.y) / bisectorLength };
    const centerDistance = radius / Math.sin(halfAngle);
    const center = { x: x1 + bisector.x * centerDistance, y: y1 + bisector.y * centerDistance };
    const startAngle = (Math.atan2(tangentStart.y - center.y, tangentStart.x - center.x) * 180) / Math.PI;
    const endAngle = (Math.atan2(tangentEnd.y - center.y, tangentEnd.x - center.x) * 180) / Math.PI;
    this.writer.appendPoint(this.state, "L", tangentStart.x, tangentStart.y);
    this.writer.appendArc(this.state, center.x, center.y, radius, startAngle, endAngle, u.x * v.y - u.y * v.x > 0);
  }
}
