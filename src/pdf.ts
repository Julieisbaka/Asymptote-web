import type { AsymptoteEngine, RenderResult } from "./types.js";
import type { RenderToPdfOptions } from "./pdf-types.js";
import { imageToPdfBytes, imagesToPdfBytes } from "./pdf-images.js";
import { svgToPdfBlob, svgToPdfBytes } from "./pdf-svg.js";

export type {
  ImageToPdfOptions,
  ImagesToPdfOptions,
  PdfImagePage,
  PdfMargin,
  PdfMetadata,
  PdfOptions,
  PdfTextRun,
  RenderToPdfOptions
} from "./pdf-types.js";
export { imageToPdfBytes, imagesToPdfBytes, svgToPdfBlob, svgToPdfBytes };

/** Render Asymptote source to SVG and export it as a selectable-text PDF Blob. */
export async function renderToPdfBlob(
  engine: AsymptoteEngine,
  source: string,
  options: RenderToPdfOptions = {}
): Promise<Blob> {
  const result = await engine.render(source, {
    ...options.render,
    format: "svg"
  });
  return svgToPdfBlob(result.svg, options);
}

/** Render Asymptote source to PDF and trigger a browser download. */
export async function downloadPdf(
  engine: AsymptoteEngine,
  source: string,
  filename = "asymptote.pdf",
  options: RenderToPdfOptions = {}
): Promise<RenderResult> {
  const result = await engine.render(source, {
    ...options.render,
    format: "svg"
  });
  const blob = await svgToPdfBlob(result.svg, options);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return result;
}
