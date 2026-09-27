import type { ImageToPdfOptions, ImagesToPdfOptions, PdfImagePage } from "./pdf-types.js";
import {
  assertFinitePositive,
  buildPdf,
  concat,
  metadataObject,
  needsTextOpacity,
  pdfNumber,
  textOperators,
  utf8
} from "./pdf-writer.js";

interface PdfObject {
  id: number;
  body: string | Uint8Array;
}

/**
 * Create a multi-page image-backed PDF from JPEG bytes and optional text overlays.
 * This low-level helper is dependency-free and works in browsers and Node.
 */
export function imagesToPdfBytes(
  pages: readonly PdfImagePage[],
  options: ImagesToPdfOptions = {}
): Uint8Array {
  if (pages.length === 0)
    throw new TypeError("asymptote-web/pdf: at least one image page is required");

  const fontObjectId = 3 + pages.length * 3;
  const pageTextModes = pages.map((page) => page.textMode ?? options.textMode ?? "invisible");
  const gstateCounts = pages.map(
    (page, index) =>
      (page.textRuns ?? []).filter((run) => needsTextOpacity(run, pageTextModes[index])).length
  );
  const gstateStartId = fontObjectId + 3;
  const gstateCount = gstateCounts.reduce((sum, count) => sum + count, 0);
  const pageObjects: number[] = [];
  const objects: PdfObject[] = [{ id: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" }];

  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    if (page.image.length === 0)
      throw new TypeError(`asymptote-web/pdf: image page ${index + 1} must not be empty`);
    assertFinitePositive(page.imageWidth, `pages[${index}].imageWidth`);
    assertFinitePositive(page.imageHeight, `pages[${index}].imageHeight`);
    const pageWidth = page.pageWidth ?? page.imageWidth;
    const pageHeight = page.pageHeight ?? page.imageHeight;
    assertFinitePositive(pageWidth, `pages[${index}].pageWidth`);
    assertFinitePositive(pageHeight, `pages[${index}].pageHeight`);

    const pageObjectId = 3 + index * 3;
    const imageObjectId = pageObjectId + 1;
    const contentObjectId = pageObjectId + 2;
    pageObjects.push(pageObjectId);

    const gstateOffset = gstateCounts.slice(0, index).reduce((sum, count) => sum + count, 0);
    let nextGstate = gstateOffset;
    const gstateIds = (page.textRuns ?? []).map((run) =>
      needsTextOpacity(run, pageTextModes[index]) ? gstateStartId + nextGstate++ : undefined
    );
    const gstates = gstateIds.some((id) => id !== undefined)
      ? ` /ExtGState << ${gstateIds.flatMap((id, runIndex) => (id === undefined ? [] : [`/GS${runIndex} ${id} 0 R`])).join(" ")} >>`
      : "";

    const text = textOperators(
      page.textRuns ?? [],
      pageWidth,
      pageHeight,
      pageWidth,
      pageHeight,
      pageTextModes[index],
      gstateIds
    );
    const imageName = `Im${index}`;
    const content = `q\n${pdfNumber(pageWidth)} 0 0 ${pdfNumber(pageHeight)} 0 0 cm\n/${imageName} Do\nQ\n${text}`;
    const contentBytes = utf8(content);

    objects.push(
      {
        id: pageObjectId,
        body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pdfNumber(pageWidth)} ${pdfNumber(pageHeight)}] /Resources << /XObject << /${imageName} ${imageObjectId} 0 R >> /Font << /F1 ${fontObjectId} 0 R /F2 ${fontObjectId + 1} 0 R /F3 ${fontObjectId + 2} 0 R >>${gstates} >> /Contents ${contentObjectId} 0 R >>`
      },
      {
        id: imageObjectId,
        body: concat([
          utf8(
            `<< /Type /XObject /Subtype /Image /Width ${Math.round(page.imageWidth)} /Height ${Math.round(page.imageHeight)} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.image.length} >>\nstream\n`
          ),
          page.image,
          utf8("\nendstream")
        ])
      },
      {
        id: contentObjectId,
        body: concat([
          utf8(`<< /Length ${contentBytes.length} >>\nstream\n`),
          contentBytes,
          utf8("\nendstream")
        ])
      }
    );
  }

  objects.splice(1, 0, {
    id: 2,
    body: `<< /Type /Pages /Kids [${pageObjects.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjects.length} >>`
  });
  objects.push(
    { id: fontObjectId, body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>" },
    { id: fontObjectId + 1, body: "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>" },
    { id: fontObjectId + 2, body: "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>" }
  );
  for (let index = 0; index < pages.length; index += 1) {
    let nextGstate = gstateCounts.slice(0, index).reduce((sum, count) => sum + count, 0);
    for (const run of pages[index].textRuns ?? []) {
      if (!needsTextOpacity(run, pageTextModes[index])) continue;
      const opacity = Math.max(0, Math.min(1, run.opacity ?? 1));
      objects.push({
        id: gstateStartId + nextGstate++,
        body: `<< /Type /ExtGState /ca ${pdfNumber(opacity)} /CA ${pdfNumber(opacity)} >>`
      });
    }
  }
  const info = metadataObject(options);
  const infoObjectId = info ? gstateStartId + gstateCount : undefined;
  if (infoObjectId && info) objects.push({ id: infoObjectId, body: info });
  return buildPdf(objects, 1, infoObjectId);
}

/**
 * Create a single-page image-backed PDF from JPEG bytes and optional real text overlay.
 * This low-level helper is dependency-free and works in browsers and Node.
 */
export function imageToPdfBytes(image: Uint8Array, options: ImageToPdfOptions): Uint8Array {
  return imagesToPdfBytes(
    [
      {
        image,
        imageWidth: options.imageWidth,
        imageHeight: options.imageHeight,
        pageWidth: options.pageWidth,
        pageHeight: options.pageHeight,
        textMode: options.textMode,
        textRuns: options.textRuns
      }
    ],
    options
  );
}
