import type { Dictionary, Operand } from "../eps-interpreter/interpreter-types.js";
import { escapeXml } from "./svg-xml.js";

export interface NativeLabelContext {
  metadata: Dictionary;
  elements: string[];
}

/** Serialize a nested operand for native-label data attributes. */
function operandToDataString(value: Operand): string {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "0";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((entry) => operandToDataString(entry)).join(",");
  if (value && typeof value === "object") {
    return Object.entries(value as Dictionary)
      .map(([key, entry]) => `${key}:${operandToDataString(entry)}`)
      .join(";");
  }
  return "";
}

/** Serialize a grouped native label and its semantic text. */
export function serializeNativeLabel(context: NativeLabelContext): string {
  const attributes = Object.entries(context.metadata)
    .map(([name, value]) => {
      const safeName = name
        .replace(/[^a-zA-Z0-9_-]/g, "-")
        .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
        .toLowerCase();
      const serialized = operandToDataString(value);
      return serialized.length > 0 ? ` data-asy-label-${safeName}="${escapeXml(serialized)}"` : "";
    })
    .join("");
  const labelText = ["text", "label", "string"]
    .map((key) => context.metadata[key])
    .find((value): value is string => typeof value === "string" && value.length > 0);
  const semanticText = labelText
    ? `<text opacity="0" fill="none" stroke="none" aria-hidden="false">${escapeXml(labelText)}</text>`
    : "";
  return `<g class="asy-native-label"${attributes}>${context.elements.join("")}${semanticText}</g>`;
}
