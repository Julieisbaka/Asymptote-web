import type { RenderOptions } from "./types.js";

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

export type PdfMargin =
  | number
  | {
      top?: number;
      right?: number;
      bottom?: number;
      left?: number;
    };

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
  /** Extra page space around the SVG before rasterization. Defaults to 0. */
  margin?: PdfMargin;
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

export interface PdfImagePage {
  /** JPEG bytes for this page's raster image. */
  image: Uint8Array;
  /** Raster image width in pixels. */
  imageWidth: number;
  /** Raster image height in pixels. */
  imageHeight: number;
  /** PDF page width. Defaults to `imageWidth`. */
  pageWidth?: number;
  /** PDF page height. Defaults to `imageHeight`. */
  pageHeight?: number;
  /** Text-layer mode for this page. Defaults to the document option. */
  textMode?: "invisible" | "visible" | "none";
  /** Real PDF text runs for this page. */
  textRuns?: readonly PdfTextRun[];
}

export interface ImagesToPdfOptions extends PdfMetadata {
  /** Default text-layer mode for pages that do not specify one. */
  textMode?: "invisible" | "visible" | "none";
}
