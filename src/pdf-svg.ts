import { imageToPdfBytes } from "./pdf-images.js";
import type { PdfMargin, PdfOptions, PdfTextRun } from "./pdf-types.js";
import { assertFinitePositive, assertFiniteRasterSize, pdfNumber } from "./pdf-writer.js";

const PDF_MIME_TYPE = "application/pdf";
const DEFAULT_SCALE = 2;
const DEFAULT_BACKGROUND = "white";
const SVG_LENGTH_UNITS = ["px", "pt", "pc", "mm", "cm", "in"] as const;

interface SvgDimensions {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

interface ResolvedMargin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Parse a positive SVG length, ignoring percentages. */
function parseLength(value: string | null): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.endsWith("%")) return undefined;
  let numeric = trimmed;
  for (const unit of SVG_LENGTH_UNITS) {
    if (!trimmed.toLowerCase().endsWith(unit)) continue;
    numeric = trimmed.slice(0, -unit.length);
    break;
  }
  if (!numeric || !isSvgNumber(numeric)) return undefined;
  const number = Number(numeric);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function isAsciiWhitespace(charCode: number): boolean {
  return charCode === 9 || charCode === 10 || charCode === 12 || charCode === 13 || charCode === 32;
}

function readSvgAttribute(tag: string, attribute: string): string | undefined {
  const lowerTag = tag.toLowerCase();
  const name = attribute.toLowerCase();
  let index = 0;
  while (true) {
    index = lowerTag.indexOf(name, index);
    if (index < 0) return undefined;
    const before = index > 0 ? lowerTag.charCodeAt(index - 1) : 0;
    if (
      (before >= 48 && before <= 57) ||
      (before >= 65 && before <= 90) ||
      (before >= 97 && before <= 122) ||
      before === 45 ||
      before === 58 ||
      before === 95
    ) {
      index += name.length;
      continue;
    }
    let cursor = index + name.length;
    while (cursor < tag.length && isAsciiWhitespace(tag.charCodeAt(cursor))) cursor += 1;
    if (cursor >= tag.length || tag[cursor] !== "=") {
      index += name.length;
      continue;
    }
    cursor += 1;
    while (cursor < tag.length && isAsciiWhitespace(tag.charCodeAt(cursor))) cursor += 1;
    if (cursor >= tag.length) return undefined;
    const quote = tag[cursor];
    if (quote !== "'" && quote !== '"') {
      index += name.length;
      continue;
    }
    cursor += 1;
    const end = tag.indexOf(quote, cursor);
    if (end < 0) return undefined;
    return tag.slice(cursor, end);
  }
}

function isWordChar(charCode: number): boolean {
  return (
    (charCode >= 48 && charCode <= 57) ||
    (charCode >= 65 && charCode <= 90) ||
    (charCode >= 97 && charCode <= 122) ||
    charCode === 95
  );
}

function readSvgOpenTag(svg: string): string {
  for (let i = 0; i + 3 < svg.length; i += 1) {
    if (svg[i] !== "<") continue;
    const s = svg.charCodeAt(i + 1) | 32;
    const v = svg.charCodeAt(i + 2) | 32;
    const g = svg.charCodeAt(i + 3) | 32;
    if (s !== 115 || v !== 118 || g !== 103) continue;
    const next = i + 4 < svg.length ? svg.charCodeAt(i + 4) : 0;
    if (next && isWordChar(next)) continue;
    const end = svg.indexOf(">", i + 4);
    if (end < 0) return "";
    return svg.slice(i, end + 1);
  }
  return "";
}

function parseViewBox(value: string | undefined): number[] | undefined {
  if (!value) return undefined;
  const parts: string[] = [];
  let tokenStart = -1;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    const separator = code === 44 || isAsciiWhitespace(code);
    if (separator) {
      if (tokenStart >= 0) {
        parts.push(value.slice(tokenStart, i));
        tokenStart = -1;
      }
      continue;
    }
    if (tokenStart < 0) tokenStart = i;
  }
  if (tokenStart >= 0) parts.push(value.slice(tokenStart));
  if (parts.length !== 4) return undefined;
  const numbers = parts.map(Number);
  return numbers.every(Number.isFinite) ? numbers : undefined;
}

/** Return whether a string is a valid SVG numeric token in linear time. */
function isSvgNumber(value: string): boolean {
  let i = 0;
  const length = value.length;

  const first = value[i];
  if (first === "+" || first === "-") i += 1;

  let seenDigits = false;
  while (i < length && value.charCodeAt(i) >= 48 && value.charCodeAt(i) <= 57) {
    seenDigits = true;
    i += 1;
  }

  if (i < length && value[i] === ".") {
    i += 1;
    while (i < length && value.charCodeAt(i) >= 48 && value.charCodeAt(i) <= 57) {
      seenDigits = true;
      i += 1;
    }
  }

  if (!seenDigits) return false;
  if (i === length) return true;

  const exponent = value[i];
  if (exponent !== "e" && exponent !== "E") return false;
  i += 1;
  if (i === length) return false;

  const sign = value[i];
  if (sign === "+" || sign === "-") {
    i += 1;
    if (i === length) return false;
  }

  const exponentStart = i;
  while (i < length && value.charCodeAt(i) >= 48 && value.charCodeAt(i) <= 57) i += 1;
  return i === length && i > exponentStart;
}

/** Read SVG dimensions and viewBox coordinates for PDF placement. */
function svgDimensions(svg: string): SvgDimensions {
  const tag = readSvgOpenTag(svg);
  const width = parseLength(readSvgAttribute(tag, "width") ?? null);
  const height = parseLength(readSvgAttribute(tag, "height") ?? null);
  const viewBox = parseViewBox(readSvgAttribute(tag, "viewBox"));
  const viewBoxWidth =
    viewBox?.length === 4 && Number.isFinite(viewBox[2]) && viewBox[2] > 0 ? viewBox[2] : undefined;
  const viewBoxHeight =
    viewBox?.length === 4 && Number.isFinite(viewBox[3]) && viewBox[3] > 0 ? viewBox[3] : undefined;
  return {
    minX: viewBox?.length === 4 && Number.isFinite(viewBox[0]) ? viewBox[0] : 0,
    minY: viewBox?.length === 4 && Number.isFinite(viewBox[1]) ? viewBox[1] : 0,
    width: width ?? viewBoxWidth ?? 100,
    height: height ?? viewBoxHeight ?? 100
  };
}

/** Expand a margin specification into four validated sides. */
function resolveMargin(margin: PdfMargin | undefined): ResolvedMargin {
  if (margin === undefined) return { top: 0, right: 0, bottom: 0, left: 0 };
  if (typeof margin === "number") {
    if (!Number.isFinite(margin) || margin < 0) {
      throw new RangeError("asymptote-web/pdf: margin must be a non-negative finite number");
    }
    return { top: margin, right: margin, bottom: margin, left: margin };
  }
  const resolved = {
    top: margin.top ?? 0,
    right: margin.right ?? 0,
    bottom: margin.bottom ?? 0,
    left: margin.left ?? 0
  };
  for (const [name, value] of Object.entries(resolved)) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(
        `asymptote-web/pdf: margin.${name} must be a non-negative finite number`
      );
    }
  }
  return resolved;
}

/** Return whether any page margin is non-zero. */
function hasMargin(margin: ResolvedMargin): boolean {
  return margin.top > 0 || margin.right > 0 || margin.bottom > 0 || margin.left > 0;
}

/** Wrap SVG content in a translated, margin-expanded viewport. */
function expandSvgViewport(svg: string, dimensions: SvgDimensions, margin: ResolvedMargin): string {
  if (!hasMargin(margin)) return svg;
  const openTag = readSvgOpenTag(svg);
  const openIndex = openTag ? svg.indexOf(openTag) : -1;
  const close = /<\/svg>\s*$/i.exec(svg);
  if (openIndex < 0 || !close) return svg;
  const inner = svg.slice(openIndex + openTag.length, close.index);
  const pageWidth = dimensions.width + margin.left + margin.right;
  const pageHeight = dimensions.height + margin.top + margin.bottom;
  const translateX = margin.left - dimensions.minX;
  const translateY = margin.top - dimensions.minY;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${pdfNumber(pageWidth)}" height="${pdfNumber(pageHeight)}" viewBox="0 0 ${pdfNumber(pageWidth)} ${pdfNumber(pageHeight)}"><g transform="translate(${pdfNumber(translateX)} ${pdfNumber(translateY)})">${inner}</g></svg>`;
}

/** Shift text-layer coordinates to account for SVG bounds and margins. */
function shiftTextRuns(
  runs: readonly PdfTextRun[],
  dimensions: SvgDimensions,
  margin: ResolvedMargin
): PdfTextRun[] {
  return runs.map((run) => ({
    ...run,
    x: run.x - dimensions.minX + margin.left,
    y: run.y - dimensions.minY + margin.top
  }));
}

/** Extract a rotation angle from an SVG transform attribute. */
function transformRotation(transform: string | null): number | undefined {
  if (!transform) return undefined;
  const rotate = /rotate\(\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\b/i.exec(transform);
  if (rotate) return Number(rotate[1]);
  const matrix = /matrix\(\s*([^)]+)\)/i
    .exec(transform)?.[1]
    ?.split(/[\s,]+/)
    .map(Number);
  if (matrix?.length === 6 && matrix.every(Number.isFinite)) {
    return (Math.atan2(matrix[1], matrix[0]) * 180) / Math.PI;
  }
  return undefined;
}

/** Extract selectable text runs from SVG text elements when DOMParser exists. */
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
      rotate: transformRotation(node.getAttribute("transform"))
    });
  }
  return runs;
}

/** Read a Blob as a data URL for browser image loading. */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () =>
      reject(reader.error ?? new Error("asymptote-web/pdf: failed to read SVG blob"))
    );
    reader.readAsDataURL(blob);
  });
}

/** Load an image element and reject on browser decoding failure. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("asymptote-web/pdf: failed to rasterize SVG image"));
    image.src = src;
  });
}

/** Convert a canvas to JPEG bytes through the browser canvas API. */
function canvasToBlob(canvas: HTMLCanvasElement, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("asymptote-web/pdf: canvas did not produce a JPEG blob"));
      },
      "image/jpeg",
      quality
    );
  });
}

/** Rasterize SVG markup into JPEG bytes for PDF embedding. */
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

/** Convert a typed byte view into a Blob-compatible ArrayBuffer part. */
function blobPart(bytes: Uint8Array): BlobPart {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** Convert an SVG string to a raster-backed PDF with selectable SVG text runs. */
export async function svgToPdfBytes(svg: string, options: PdfOptions = {}): Promise<Uint8Array> {
  const dimensions = svgDimensions(svg);
  const margin = resolveMargin(options.margin);
  const contentWidth = options.width ?? dimensions.width;
  const contentHeight = options.height ?? dimensions.height;
  const width = contentWidth + margin.left + margin.right;
  const height = contentHeight + margin.top + margin.bottom;
  const scale = options.scale ?? DEFAULT_SCALE;
  assertFinitePositive(width, "width");
  assertFinitePositive(height, "height");
  assertFinitePositive(scale, "scale");
  assertFiniteRasterSize(width * scale, "width");
  assertFiniteRasterSize(height * scale, "height");
  const rasterSvg = expandSvgViewport(
    svg,
    { ...dimensions, width: contentWidth, height: contentHeight },
    margin
  );
  const textRuns = shiftTextRuns(options.textRuns ?? extractSvgTextRuns(svg), dimensions, margin);
  const image = await rasterizeSvgToJpeg(
    rasterSvg,
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
    textRuns
  });
}

/** Convert an SVG string to a PDF Blob. Requires browser DOM and canvas APIs. */
export async function svgToPdfBlob(svg: string, options: PdfOptions = {}): Promise<Blob> {
  return new Blob([blobPart(await svgToPdfBytes(svg, options))], { type: PDF_MIME_TYPE });
}
