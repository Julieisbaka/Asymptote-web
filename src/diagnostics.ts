import type { CompilerDiagnostic, DiagnosticSeverity } from "./types.js";

const SEVERITY_PATTERN = /^(warning|error|runtime)\b\s*:?[ \t]*(.*)$/i;
const INFO_PATTERN = /^(info|note)\s*:\s*(.*)$/i;

function isDigit(char: string | undefined): boolean {
  return char !== undefined && char >= "0" && char <= "9";
}

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

function rawWhitespace(char: string | undefined): boolean {
  return char === " " || char === "\t" || char === "\n" || char === "\r";
}

function parseCodeLabel(message: string): { code?: string; message: string } {
  if (!message.startsWith("[")) return { message };
  const closing = message.indexOf("]");
  if (closing <= 1) return { message };
  return {
    code: message.slice(1, closing),
    message: message.slice(closing + 1).trimStart(),
  };
}

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