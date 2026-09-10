import type { AsymptoteEngine, RenderOptions, RenderResult } from "./types.js";

const PDF_MIME_TYPE = "application/pdf";
const DEFAULT_SCALE = 2;
const DEFAULT_BACKGROUND = "white";

export interface PdfTextRun {
  /** Text content to expose as real PDF text. */
  text: string;
  /** X coordinate in SVG/user-space units, measured from the left edge. */
  x: number;
  /** Y coordinate in SVG/user-space units, measured from the top edge. */
  y: number;
  /** Font size in SVG/user-space units. Defaults to 12. */
  fontSize?: number;
  /** CSS/SVG font-family hint. Mapped to a built-in PDF font family. */
  fontFamily?: string;
  /** Text color for visible text mode. Defaults to black. */
  color?: string;
  /** Text opacity for visible text mode. Invisible mode ignores this. */
  opacity?: number;
  /** Clockwise rotation in degrees around the text origin. */
  rotate?: number;
}

export interface PdfMetadata {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
}

export interface PdfOptions extends PdfMetadata {
  /** PDF page width. Defaults to the SVG width or viewBox width. */
  width?: number;
  /** PDF page height. Defaults to the SVG height or viewBox height. */
  height?: number;
  /** Rasterization scale used before embedding the image. Defaults to 2. */
  scale?: number;
  /** Canvas background before rasterizing the SVG. Use null for transparent canvas input. */
  background?: string | null;
  /** JPEG quality from 0 to 1. Defaults to the browser canvas default. */
  quality?: number;
  /** How extracted/provided text should be added to the PDF. Defaults to invisible. */
  textMode?: "invisible" | "visible" | "none";
  /** Override or supplement auto-extracted SVG text runs. */
  textRuns?: readonly PdfTextRun[];
}

export interface RenderToPdfOptions extends PdfOptions {
  /** Render options passed to the engine. `format` is forced to `svg`. */
  render?: Omit<RenderOptions, "format">;
}

export interface ImageToPdfOptions extends PdfMetadata {
  imageWidth: number;
  imageHeight: number;
  pageWidth?: number;
  pageHeight?: number;
  textMode?: "invisible" | "visible" | "none";
  textRuns?: readonly PdfTextRun[];
}

interface SvgDimensions {
  width: number;
  height: number;
}

interface PdfObject {
  id: number;
  body: string | Uint8Array;
}

function assertFinitePositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`asymptote-web/pdf: ${name} must be a positive finite number`);
  }
}

function parseLength(value: string | null): number | undefined {
  if (!value || value.endsWith("%")) return undefined;
  const match = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(?:px|pt|pc|mm|cm|in)?\s*$/i.exec(value);
  if (!match) return undefined;
  const number = Number(match[1]);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function svgDimensions(svg: string): SvgDimensions {
  const tag = /<svg\b[^>]*>/i.exec(svg)?.[0] ?? "";
  const width = parseLength(/\bwidth=["']([^"']+)["']/i.exec(tag)?.[1] ?? null);
  const height = parseLength(/\bheight=["']([^"']+)["']/i.exec(tag)?.[1] ?? null);
  const viewBox = /\bviewBox=["']\s*([^"']+?)\s*["']/i.exec(tag)?.[1]
    ?.split(/[\s,]+/)
    .map(Number);
  const viewBoxWidth = viewBox?.length === 4 && Number.isFinite(viewBox[2]) && viewBox[2] > 0
    ? viewBox[2]
    : undefined;
  const viewBoxHeight = viewBox?.length === 4 && Number.isFinite(viewBox[3]) && viewBox[3] > 0
    ? viewBox[3]
    : undefined;
  return {
    width: width ?? viewBoxWidth ?? 100,
    height: height ?? viewBoxHeight ?? 100,
  };
}

function transformRotation(transform: string | null): number | undefined {
  if (!transform) return undefined;
  const rotate = /rotate\(\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\b/i.exec(transform);
  if (rotate) return Number(rotate[1]);
  const matrix = /matrix\(\s*([^)]+)\)/i.exec(transform)?.[1]
    ?.split(/[\s,]+/)
    .map(Number);
  if (matrix?.length === 6 && matrix.every(Number.isFinite)) {
    return (Math.atan2(matrix[1], matrix[0]) * 180) / Math.PI;
  }
  return undefined;
}

function extractSvgTextRuns(svg: string): PdfTextRun[] {
  if (typeof DOMParser === "undefined") return [];
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const runs: PdfTextRun[] = [];
  for (const node of Array.from(doc.querySelectorAll("text"))) {
    const text = node.textContent ?? "";
    if (!text.trim()) continue;
    const x = Number.parseFloat(node.getAttribute("x") ?? "0");
    const y = Number.parseFloat(node.getAttribute("y") ?? "0");
    const fontSize = parseLength(node.getAttribute("font-size"));
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    runs.push({
      text,
      x,
      y,
      fontSize,
      fontFamily: node.getAttribute("font-family") ?? undefined,
      color: node.getAttribute("fill") ?? undefined,
      opacity: Number.parseFloat(node.getAttribute("opacity") ?? "1"),
      rotate: transformRotation(node.getAttribute("transform")),
    });
  }
  return runs;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error ?? new Error("asymptote-web/pdf: failed to read SVG blob")));
    reader.readAsDataURL(blob);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("asymptote-web/pdf: failed to rasterize SVG image"));
    image.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("asymptote-web/pdf: canvas did not produce a JPEG blob"));
    }, "image/jpeg", quality);
  });
}

async function rasterizeSvgToJpeg(
  svg: string,
  width: number,
  height: number,
  scale: number,
  background: string | null,
  quality?: number
): Promise<Uint8Array> {
  if (typeof document === "undefined") {
    throw new Error("asymptote-web/pdf: SVG rasterization requires browser DOM and canvas APIs");
  }
  const svgBlob = new Blob([svg], { type: "image/svg+xml" });
  const image = await loadImage(await blobToDataUrl(svgBlob));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("asymptote-web/pdf: 2D canvas context is unavailable");
  if (background !== null) {
    context.fillStyle = background;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Uint8Array(await (await canvasToBlob(canvas, quality)).arrayBuffer());
}

function encoder(): TextEncoder {
  return new TextEncoder();
}

function utf8(value: string): Uint8Array {
  return encoder().encode(value);
}

function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function pdfNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return value.toFixed(4).replace(/(?:\.0+|(?:(\.\d*?)0+))$/, "$1");
}

function pdfName(value: string): "F1" | "F2" | "F3" {
  const normalized = value.toLowerCase();
  if (normalized.includes("courier") || normalized.includes("mono")) return "F3";
  if (normalized.includes("times") || normalized.includes("serif")) return "F2";
  return "F1";
}

function hexUtf16(value: string): string {
  const bytes = [0xfe, 0xff];
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    bytes.push((code >> 8) & 0xff, code & 0xff);
  }
  return bytes.map((byte) => byte.toString(16).padStart(2, "0").toUpperCase()).join("");
}

function pdfLiteralText(value: string): string {
  let output = "";
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0x3f;
    const byte = code >= 0x20 && code <= 0x7e ? code : 0x3f;
    const current = String.fromCharCode(byte);
    output += current === "(" || current === ")" || current === "\\"
      ? `\\${current}`
      : current;
  }
  return `(${output})`;
}

function blobPart(bytes: Uint8Array): BlobPart {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function rgb(color: string | undefined): [number, number, number] {
  if (!color || color === "currentColor" || color === "none") return [0, 0, 0];
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (hex) {
    const value = hex[1].length === 3
      ? hex[1].split("").map((char) => char + char).join("")
      : hex[1];
    return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255) as [number, number, number];
  }
  const fn = /^rgb\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\)$/i.exec(color.trim());
  if (fn) {
    return [Number(fn[1]) / 255, Number(fn[2]) / 255, Number(fn[3]) / 255];
  }
  return [0, 0, 0];
}

function textOperators(
  runs: readonly PdfTextRun[],
  pageWidth: number,
  pageHeight: number,
  sourceWidth: number,
  sourceHeight: number,
  textMode: "invisible" | "visible" | "none"
): string {
  if (textMode === "none" || runs.length === 0) return "";
  const scaleX = pageWidth / sourceWidth;
  const scaleY = pageHeight / sourceHeight;
  return runs.map((run) => {
    const size = (run.fontSize ?? 12) * scaleY;
    const x = run.x * scaleX;
    const y = pageHeight - run.y * scaleY;
    const angle = ((run.rotate ?? 0) * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = -Math.sin(angle);
    const [r, g, b] = rgb(run.color);
    const renderingMode = textMode === "invisible" ? "3" : "0";
    return [
      "BT",
      `/${pdfName(run.fontFamily ?? "")} ${pdfNumber(size)} Tf`,
      `${renderingMode} Tr`,
      `${pdfNumber(r)} ${pdfNumber(g)} ${pdfNumber(b)} rg`,
      `${pdfNumber(cos)} ${pdfNumber(sin)} ${pdfNumber(-sin)} ${pdfNumber(cos)} ${pdfNumber(x)} ${pdfNumber(y)} Tm`,
      `${pdfLiteralText(run.text)} Tj`,
      "ET",
    ].join("\n");
  }).join("\n");
}

function metadataObject(metadata: PdfMetadata): string | undefined {
  const entries = [
    ["Title", metadata.title],
    ["Author", metadata.author],
    ["Subject", metadata.subject],
    ["Keywords", metadata.keywords],
    ["Creator", metadata.creator ?? "asymptote-web/pdf"],
  ].filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0);
  if (entries.length === 0) return undefined;
  return `<< ${entries.map(([key, value]) => `/${key} <${hexUtf16(value)}>`).join(" ")} >>`;
}

function buildPdf(objects: PdfObject[], rootObjectId: number, infoObjectId?: number): Uint8Array {
  const chunks: Uint8Array[] = [utf8("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n")];
  const offsets = [0];
  let position = chunks[0].length;
  for (const object of objects) {
    offsets[object.id] = position;
    const prefix = utf8(`${object.id} 0 obj\n`);
    const body = typeof object.body === "string" ? utf8(object.body) : object.body;
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

/**
 * Create an image-backed PDF from JPEG bytes and optional real text overlay.
 * This low-level helper is dependency-free and works in browsers and Node.
 */
export function imageToPdfBytes(image: Uint8Array, options: ImageToPdfOptions): Uint8Array {
  if (image.length === 0) throw new TypeError("asymptote-web/pdf: image must not be empty");
  assertFinitePositive(options.imageWidth, "imageWidth");
  assertFinitePositive(options.imageHeight, "imageHeight");
  const pageWidth = options.pageWidth ?? options.imageWidth;
  const pageHeight = options.pageHeight ?? options.imageHeight;
  assertFinitePositive(pageWidth, "pageWidth");
  assertFinitePositive(pageHeight, "pageHeight");

  const text = textOperators(
    options.textRuns ?? [],
    pageWidth,
    pageHeight,
    options.imageWidth,
    options.imageHeight,
    options.textMode ?? "invisible"
  );
  const content = `q\n${pdfNumber(pageWidth)} 0 0 ${pdfNumber(pageHeight)} 0 0 cm\n/Im0 Do\nQ\n${text}`;
  const contentBytes = utf8(content);
  const info = metadataObject(options);
  const objects: PdfObject[] = [
    { id: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
    { id: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
    {
      id: 3,
      body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pdfNumber(pageWidth)} ${pdfNumber(pageHeight)}] /Resources << /XObject << /Im0 4 0 R >> /Font << /F1 6 0 R /F2 7 0 R /F3 8 0 R >> >> /Contents 5 0 R >>`,
    },
    {
      id: 4,
      body: concat([
        utf8(`<< /Type /XObject /Subtype /Image /Width ${Math.round(options.imageWidth)} /Height ${Math.round(options.imageHeight)} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`),
        image,
        utf8("\nendstream"),
      ]),
    },
    { id: 5, body: concat([utf8(`<< /Length ${contentBytes.length} >>\nstream\n`), contentBytes, utf8("\nendstream")]) },
    { id: 6, body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>" },
    { id: 7, body: "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>" },
    { id: 8, body: "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>" },
  ];
  if (info) objects.push({ id: 9, body: info });
  return buildPdf(objects, 1, info ? 9 : undefined);
}

/** Convert an SVG string to a raster-backed PDF with selectable SVG text runs. */
export async function svgToPdfBytes(svg: string, options: PdfOptions = {}): Promise<Uint8Array> {
  const dimensions = svgDimensions(svg);
  const width = options.width ?? dimensions.width;
  const height = options.height ?? dimensions.height;
  const scale = options.scale ?? DEFAULT_SCALE;
  assertFinitePositive(width, "width");
  assertFinitePositive(height, "height");
  assertFinitePositive(scale, "scale");
  const image = await rasterizeSvgToJpeg(
    svg,
    width,
    height,
    scale,
    options.background === undefined ? DEFAULT_BACKGROUND : options.background,
    options.quality
  );
  return imageToPdfBytes(image, {
    ...options,
    imageWidth: Math.round(width * scale),
    imageHeight: Math.round(height * scale),
    pageWidth: width,
    pageHeight: height,
    textRuns: options.textRuns ?? extractSvgTextRuns(svg),
  });
}

/** Convert an SVG string to a PDF Blob. Requires browser DOM and canvas APIs. */
export async function svgToPdfBlob(svg: string, options: PdfOptions = {}): Promise<Blob> {
  return new Blob([blobPart(await svgToPdfBytes(svg, options))], { type: PDF_MIME_TYPE });
}

/** Render Asymptote source to SVG and export it as a selectable-text PDF Blob. */
export async function renderToPdfBlob(
  engine: AsymptoteEngine,
  source: string,
  options: RenderToPdfOptions = {}
): Promise<Blob> {
  const result = await engine.render(source, { ...options.render, format: "svg" });
  return svgToPdfBlob(result.svg, options);
}

/** Render Asymptote source to PDF and trigger a browser download. */
export async function downloadPdf(
  engine: AsymptoteEngine,
  source: string,
  filename = "asymptote.pdf",
  options: RenderToPdfOptions = {}
): Promise<RenderResult> {
  const result = await engine.render(source, { ...options.render, format: "svg" });
  const blob = await svgToPdfBlob(result.svg, options);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return result;
}
