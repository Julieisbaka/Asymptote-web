import assert from "node:assert/strict";
import test from "node:test";

const { imageToPdfBytes, imagesToPdfBytes } = await import("../dist/pdf.js");

// Minimal 1x1 white JPEG.
const jpeg = Uint8Array.from([
  0xff, 0xd8,
  0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00,
  0xff, 0xdb, 0x00, 0x43, 0x00,
  0x03, 0x02, 0x02, 0x03, 0x02, 0x02, 0x03, 0x03, 0x03, 0x03, 0x04, 0x03, 0x03, 0x04, 0x05, 0x08,
  0x05, 0x05, 0x04, 0x04, 0x05, 0x0a, 0x07, 0x07, 0x06, 0x08, 0x0c, 0x0a, 0x0c, 0x0c, 0x0b, 0x0a,
  0x0b, 0x0b, 0x0d, 0x0e, 0x12, 0x10, 0x0d, 0x0e, 0x11, 0x0e, 0x0b, 0x0b, 0x10, 0x16, 0x10, 0x11,
  0x13, 0x14, 0x15, 0x15, 0x15, 0x0c, 0x0f, 0x17, 0x18, 0x16, 0x14, 0x18, 0x12, 0x14, 0x15, 0x14,
  0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
  0xff, 0xc4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00,
  0xff, 0xc4, 0x00, 0x14, 0x10, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00,
  0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0xd2, 0xcf, 0x20,
  0xff, 0xd9,
]);

function latin1(bytes) {
  return Buffer.from(bytes).toString("latin1");
}

test("imageToPdfBytes embeds a JPEG image and selectable text layer", () => {
  const pdf = imageToPdfBytes(jpeg, {
    imageWidth: 300,
    imageHeight: 150,
    pageWidth: 100,
    pageHeight: 50,
    textMode: "invisible",
    title: "PDF export smoke test",
    textRuns: [
      { text: "Selectable label", x: 10, y: 20, fontSize: 12, fontFamily: "Arial, sans-serif" },
      { text: "Monospace", x: 10, y: 35, fontSize: 10, fontFamily: "Courier New, monospace" },
    ],
  });
  const text = latin1(pdf);

  assert.match(text, /^%PDF-1\.7/);
  assert.match(text, /\/Subtype \/Image/);
  assert.match(text, /\/Filter \/DCTDecode/);
  assert.match(text, /\/BaseFont \/Helvetica/);
  assert.match(text, /\/BaseFont \/Courier/);
  assert.match(text, /3 Tr/);
  assert.match(text, /1 0 0 1 10 30 Tm/);
  assert.match(text, /\(Selectable label\) Tj/);
  assert.match(text, /xref\n0 10/);
  assert.match(text, /%%EOF\n$/);
});

test("imageToPdfBytes rejects invalid dimensions", () => {
  assert.throws(() => imageToPdfBytes(jpeg, { imageWidth: 0, imageHeight: 1 }), /imageWidth/);
});

test("imagesToPdfBytes writes multiple images as separate PDF pages", () => {
  const pdf = imagesToPdfBytes([
    {
      image: jpeg,
      imageWidth: 100,
      imageHeight: 50,
      textRuns: [{ text: "First page", x: 5, y: 10 }],
    },
    {
      image: jpeg,
      imageWidth: 80,
      imageHeight: 80,
      pageWidth: 120,
      pageHeight: 120,
      textMode: "visible",
      textRuns: [{ text: "Second page", x: 8, y: 16 }],
    },
  ], { title: "Two page PDF" });
  const text = latin1(pdf);

  assert.match(text, /\/Count 2/);
  assert.equal((text.match(/\/Subtype \/Image/g) ?? []).length, 2);
  assert.match(text, /\/Im0 Do/);
  assert.match(text, /\/Im1 Do/);
  assert.match(text, /\(First page\) Tj/);
  assert.match(text, /\(Second page\) Tj/);
  assert.match(text, /trailer\n<< \/Size 13 \/Root 1 0 R \/Info 12 0 R >>/);
});

test("imagesToPdfBytes rejects empty page lists", () => {
  assert.throws(() => imagesToPdfBytes([]), /at least one image page/);
});
