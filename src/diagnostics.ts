import type { CompilerDiagnostic, DiagnosticSeverity } from "./types.js";

const LOCATION_PATTERN = /^(.*?):\s*(\d+)(?:\.(\d+))?:\s*(.*)$/;
const SEVERITY_PATTERN = /^(warning|error|runtime)\b\s*:?[ \t]*(.*)$/i;
const INFO_PATTERN = /^(info|note)\s*:(.*)$/i;
const CODE_PATTERN = /^\[([^\]]+)\]\s*(.*)$/;

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
      const location = raw.match(LOCATION_PATTERN);
      const sourceFile = location?.[1].trim() || undefined;
      const line = location ? Number(location[2]) : undefined;
      const column = location?.[3] ? Number(location[3]) : undefined;
      const classified = severityFor(
        (location?.[4] ?? raw).replace(/^\s*:\s*/, ""),
        Boolean(location)
      );
      const codeMatch = classified.message.match(CODE_PATTERN);

      return {
        severity: classified.severity,
        message: (codeMatch?.[2] ?? classified.message).replace(/^\s*:\s*/, "").trim(),
        ...(sourceFile ? { sourceFile } : {}),
        ...(line !== undefined ? { line } : {}),
        ...(column !== undefined ? { column } : {}),
        ...(codeMatch ? { code: codeMatch[1] } : {}),
        raw,
      };
    });
}