import type { CompilerDiagnostic, DiagnosticSeverity } from "./types.js";

/** Recognizes severity prefixes emitted by the Asymptote compiler. */
const SEVERITY_PATTERN = /^(warning|error|runtime)\b\s*:?[ \t]*(.*)$/i;
/** Recognizes informational diagnostic prefixes. */
const INFO_PATTERN = /^(info|note)\s*:(.*)$/i;

/** Return whether a character is an ASCII decimal digit. */
function isDigit(char: string | undefined): boolean {
  return char !== undefined && char >= "0" && char <= "9";
}

/** Parse a source filename, line, and optional column from a diagnostic. */
function parseLocation(raw: string): {
  sourceFile: string;
  line: number;
  column?: number;
  message: string;
} | undefined {
  for (let i = 0; i < raw.length; i += 1) {
    if (raw[i] !== ":") continue;
    let cursor = i + 1;
    while (raw[cursor] === " " || raw[cursor] === "\t") cursor += 1;
    const lineStart = cursor;
    while (isDigit(raw[cursor])) cursor += 1;
    if (cursor === lineStart) continue;
    const line = Number(raw.slice(lineStart, cursor));
    let column: number | undefined;
    if (raw[cursor] === ".") {
      cursor += 1;
      const columnStart = cursor;
      while (isDigit(raw[cursor])) cursor += 1;
      if (cursor === columnStart) continue;
      column = Number(raw.slice(columnStart, cursor));
    }
    if (raw[cursor] !== ":") continue;
    const sourceFile = raw.slice(0, i).trim();
    if (!sourceFile) continue;
    return {
      sourceFile,
      line,
      ...(column !== undefined ? { column } : {}),
      message: raw.slice(cursor + 1).trimStart(),
    };
  }
  return undefined;
}

/** Remove the optional separator between a diagnostic prefix and its message. */
function stripLeadingSeparator(text: string): string {
  let cursor = 0;
  while (rawWhitespace(text[cursor])) cursor += 1;
  if (text[cursor] === ":") {
    cursor += 1;
    while (rawWhitespace(text[cursor])) cursor += 1;
    return text.slice(cursor);
  }
  return text;
}

/** Return whether a character is whitespace accepted in compiler output. */
function rawWhitespace(char: string | undefined): boolean {
  return char === " " || char === "\t" || char === "\n" || char === "\r";
}

/** Extract an optional bracketed diagnostic code from a message. */
function parseCodeLabel(message: string): { code?: string; message: string } {
  if (!message.startsWith("[")) return { message };
  const closing = message.indexOf("]");
  if (closing <= 1) return { message };
  return {
    code: message.slice(1, closing),
    message: message.slice(closing + 1).trimStart(),
  };
}

/** Classify a diagnostic message, defaulting located messages to errors. */
function severityFor(text: string, hasLocation: boolean): {
  severity: DiagnosticSeverity;
  message: string;
} {
  const match = text.match(SEVERITY_PATTERN) ?? text.match(INFO_PATTERN);
  if (!match) {
    return {
      severity: hasLocation ? "error" : "info",
      message: text.trim(),
    };
  }

  const label = match[1].toLowerCase();
  return {
    severity: label === "warning"
      ? "warning"
      : label === "error" || label === "runtime" || (label === "note" && hasLocation)
        ? "error"
        : "info",
    message: match[2].trim(),
  };
}

/** Parse Asymptote stderr into editor-friendly diagnostics. */
export function parseCompilerDiagnostics(stderr: string): CompilerDiagnostic[] {
  return stderr
    .split(/\r?\n/)
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw): CompilerDiagnostic => {
      const location = parseLocation(raw);
      const classified = severityFor(
        stripLeadingSeparator(location?.message ?? raw),
        Boolean(location)
      );
      const codeInfo = parseCodeLabel(classified.message);

      return {
        severity: classified.severity,
        message: stripLeadingSeparator(codeInfo.message).trim(),
        ...(location?.sourceFile ? { sourceFile: location.sourceFile } : {}),
        ...(location?.line !== undefined ? { line: location.line } : {}),
        ...(location?.column !== undefined ? { column: location.column } : {}),
        ...(codeInfo.code ? { code: codeInfo.code } : {}),
        raw,
      };
    });
}

/** A six-value affine transform in PostScript/SVG matrix order. */
export type Matrix = { a: number; b: number; c: number; d: number; e: number; f: number };

/** Return a new identity affine transform. */
export function identityMatrix(): Matrix {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

/** Compose two affine transforms in PostScript order. */
export function composeMatrix(m1: Matrix, m2: Matrix): Matrix {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    f: m1.b * m2.e + m1.d * m2.f + m1.f,
  };
}

/** Convert normalized gray, RGB, or CMYK components to an SVG RGB value. */
export function colorFromComponents(nums: number[]): string {
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

/** Convert normalized HSB components to an SVG RGB value. */
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
