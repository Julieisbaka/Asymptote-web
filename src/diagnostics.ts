import type { CompilerDiagnostic, DiagnosticSeverity } from "./types.js";

const LOCATION_PATTERN = /^(.*?):\s*(\d+)(?:\.(\d+))?:\s*(.*)$/;
const CODE_PATTERN = /^\[([^\]]+)\]\s*(.*)$/;
const SEVERITY_LABELS = ["warning", "error", "runtime"] as const;
const INFO_LABELS = ["info", "note"] as const;

function parseSeverityPrefix(text: string): { label: string; message: string } | null {
  const trimmed = text.trim();
  const lowered = trimmed.toLowerCase();

  for (const label of SEVERITY_LABELS) {
    if (!lowered.startsWith(label)) {
      continue;
    }

    const rest = trimmed.slice(label.length);
    if (!rest) {
      return { label, message: "" };
    }

    const first = rest[0];
    if (first === ":") {
      return { label, message: rest.slice(1).trim() };
    }
    if (first === " " || first === "\t") {
      return { label, message: rest.trim() };
    }
  }

  return null;
}

function parseInfoPrefix(text: string): { label: string; message: string } | null {
  const trimmed = text.trim();
  const lowered = trimmed.toLowerCase();

  for (const label of INFO_LABELS) {
    if (!lowered.startsWith(label)) {
      continue;
    }

    const rest = trimmed.slice(label.length);
    let index = 0;
    while (rest[index] === " " || rest[index] === "\t") {
      index += 1;
    }

    if (rest[index] !== ":") {
      continue;
    }

    return { label, message: rest.slice(index + 1).trim() };
  }

  return null;
}

function severityFor(text: string, hasLocation: boolean): {
  severity: DiagnosticSeverity;
  message: string;
} {
  const severityPrefix = parseSeverityPrefix(text);
  const infoPrefix = severityPrefix ? null : parseInfoPrefix(text);
  if (!severityPrefix && !infoPrefix) {
    return {
      severity: hasLocation ? "error" : "info",
      message: text.trim(),
    };
  }

  const label = severityPrefix?.label ?? infoPrefix!.label;
  return {
    severity: label === "warning"
      ? "warning"
      : label === "error" || label === "runtime" || (label === "note" && hasLocation)
        ? "error"
        : "info",
    message: (severityPrefix?.message ?? infoPrefix!.message).trim(),
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