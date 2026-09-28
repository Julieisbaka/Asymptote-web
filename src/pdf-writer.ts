import type { PdfMetadata, PdfTextRun } from "./pdf-types.js";

interface PdfObject {
  id: number;
  body: string | Uint8Array;
}

/** Require a finite positive PDF dimension or scale. */
export function assertFinitePositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(
      `asymptote-web/pdf: ${name} must be a positive finite number`
    );
  }
}

/** Reject raster dimensions whose multiplication by scale overflows. */
export function assertFiniteRasterSize(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(
      `asymptote-web/pdf: ${name} multiplied by scale must be finite`
    );
  }
}

/** Create a UTF-8 text encoder for PDF serialization. */
function encoder(): TextEncoder {
  return new TextEncoder();
}

/** Encode a string as UTF-8 bytes. */
export function utf8(value: string): Uint8Array {
  return encoder().encode(value);
}

/** Concatenate byte chunks into one contiguous array. */
export function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

/** Format a finite PDF number with bounded decimal precision. */
export function pdfNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return value.toFixed(4).replace(/(?:\.0+|(?:(\.\d*?)0+))$/, "$1");
}

/** Map a CSS font-family hint to one of the PDF Base 14 fonts. */
function pdfName(value: string): "F1" | "F2" | "F3" {
  const normalized = value.toLowerCase();
  if (normalized.includes("courier") || normalized.includes("mono"))
    return "F3";
  if (
    normalized.includes("helvetica") ||
    normalized.includes("arial") ||
    normalized.includes("sans-serif")
  )
    return "F1";
  if (
    normalized.includes("times") ||
    /(?:^|[,\s])serif(?:$|[,\s])/.test(normalized)
  )
    return "F2";
  return "F1";
}

/** Encode metadata text as a PDF UTF-16BE hexadecimal string. */
function hexUtf16(value: string): string {
  const bytes = [0xfe, 0xff];
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    bytes.push((code >> 8) & 0xff, code & 0xff);
  }
  return bytes
    .map((byte) => byte.toString(16).padStart(2, "0").toUpperCase())
    .join("");
}

/** Escape a text run as a PDF literal string. */
function pdfLiteralText(value: string): string {
  let output = "";
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0x3f;
    const byte = code >= 0x20 && code <= 0x7e ? code : 0x3f;
    const current = String.fromCharCode(byte);
    output +=
      current === "(" || current === ")" || current === "\\"
        ? `\\${current}`
        : current;
  }
  return `(${output})`;
}

/** Parse common CSS hex and rgb() colors into normalized RGB components. */
function rgb(color: string | undefined): [number, number, number] {
  if (!color || color === "currentColor" || color === "none") return [0, 0, 0];
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (hex) {
    const value =
      hex[1].length === 3
        ? hex[1]
            .split("")
            .map((char) => char + char)
            .join("")
        : hex[1];
    return [0, 2, 4].map(
      (offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255
    ) as [number, number, number];
  }
  const fn =
    /^rgb\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\)$/i.exec(
      color.trim()
    );
  if (fn) {
    return [Number(fn[1]) / 255, Number(fn[2]) / 255, Number(fn[3]) / 255];
  }
  return [0, 0, 0];
}

/** Generate PDF text operators for selectable or visible text runs. */
export function textOperators(
  runs: readonly PdfTextRun[],
  pageWidth: number,
  pageHeight: number,
  sourceWidth: number,
  sourceHeight: number,
  textMode: "invisible" | "visible" | "none",
  gstateIds: readonly (number | undefined)[] = []
): string {
  if (textMode === "none" || runs.length === 0) return "";
  const scaleX = pageWidth / sourceWidth;
  const scaleY = pageHeight / sourceHeight;
  return runs
    .map((run, index) => {
      const size = (run.fontSize ?? 12) * scaleY;
      const x = run.x * scaleX;
      const y = pageHeight - run.y * scaleY;
      const angle = ((run.rotate ?? 0) * Math.PI) / 180;
      const cos = Math.cos(angle);
      const sin = -Math.sin(angle);
      const [r, g, b] = rgb(run.color);
      const renderingMode = textMode === "invisible" ? "3" : "0";
      return [
        textMode === "visible" && gstateIds[index] !== undefined
          ? `/GS${index} gs`
          : "",
        "BT",
        `/${pdfName(run.fontFamily ?? "")} ${pdfNumber(size)} Tf`,
        `${renderingMode} Tr`,
        `${pdfNumber(r)} ${pdfNumber(g)} ${pdfNumber(b)} rg`,
        `${pdfNumber(cos)} ${pdfNumber(sin)} ${pdfNumber(-sin)} ${pdfNumber(cos)} ${pdfNumber(x)} ${pdfNumber(y)} Tm`,
        `${pdfLiteralText(run.text)} Tj`,
        "ET"
      ].join("\n");
    })
    .join("\n");
}

/** Return whether a visible text run needs an opacity graphics state. */
export function needsTextOpacity(
  run: PdfTextRun,
  textMode: "invisible" | "visible" | "none"
): boolean {
  return (
    textMode === "visible" &&
    run.opacity !== undefined &&
    Number.isFinite(run.opacity) &&
    run.opacity !== 1
  );
}

/** Encode optional PDF document metadata as an indirect object body. */
export function metadataObject(metadata: PdfMetadata): string | undefined {
  const entries = [
    ["Title", metadata.title],
    ["Author", metadata.author],
    ["Subject", metadata.subject],
    ["Keywords", metadata.keywords],
    ["Creator", metadata.creator ?? "asymptote-web/pdf"]
  ].filter(
    (entry): entry is [string, string] =>
      typeof entry[1] === "string" && entry[1].length > 0
  );
  if (entries.length === 0) return undefined;
  return `<< ${entries.map(([key, value]) => `/${key} <${hexUtf16(value)}>`).join(" ")} >>`;
}

/** Serialize numbered PDF objects, cross-reference data, and trailer metadata. */
export function buildPdf(
  objects: PdfObject[],
  rootObjectId: number,
  infoObjectId?: number
): Uint8Array {
  const chunks: Uint8Array[] = [utf8("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n")];
  const offsets = [0];
  let position = chunks[0].length;
  for (const object of objects) {
    offsets[object.id] = position;
    const prefix = utf8(`${object.id} 0 obj\n`);
    const body =
      typeof object.body === "string" ? utf8(object.body) : object.body;
    const suffix = utf8("\nendobj\n");
    chunks.push(prefix, body, suffix);
    position += prefix.length + body.length + suffix.length;
  }
  const xrefOffset = position;
  const size = Math.max(...objects.map((object) => object.id)) + 1;
  let xref = `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let id = 1; id < size; id += 1) {
    xref += `${(offsets[id] ?? 0).toString().padStart(10, "0")} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${size} /Root ${rootObjectId} 0 R${infoObjectId ? ` /Info ${infoObjectId} 0 R` : ""} >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  chunks.push(utf8(xref));
  return concat(chunks);
}
