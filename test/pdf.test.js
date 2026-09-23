import assert from "node:assert/strict";
import test from "node:test";

const { imageToPdfBytes, imagesToPdfBytes, svgToPdfBytes } = await import("../dist/pdf.js");

// Minimal 1x1 white JPEG.
const jpeg = Uint8Array.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
  0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x03, 0x02, 0x02, 0x03, 0x02, 0x02, 0x03,
  0x03, 0x03, 0x03, 0x04, 0x03, 0x03, 0x04, 0x05, 0x08, 0x05, 0x05, 0x04, 0x04, 0x05, 0x0a, 0x07,
  0x07, 0x06, 0x08, 0x0c, 0x0a, 0x0c, 0x0c, 0x0b, 0x0a, 0x0b, 0x0b, 0x0d, 0x0e, 0x12, 0x10, 0x0d,
  0x0e, 0x11, 0x0e, 0x0b, 0x0b, 0x10, 0x16, 0x10, 0x11, 0x13, 0x14, 0x15, 0x15, 0x15, 0x0c, 0x0f,
  0x17, 0x18, 0x16, 0x14, 0x18, 0x12, 0x14, 0x15, 0x14, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff, 0xc4, 0x00, 0x14, 0x10,
  0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0xd2, 0xcf, 0x20, 0xff, 0xd9,
]);

function latin1(bytes) {
  return Buffer.from(bytes).toString("latin1");
}

function mediaBox(pdfText) {
  const match = /\/MediaBox \[0 0 ([^\s]+) ([^\]]+)\]/.exec(pdfText);
  assert.ok(match, "expected a PDF MediaBox");
  return [Number(match[1]), Number(match[2])];
}

async function withMockSvgEnvironment(run) {
  const originalDocument = globalThis.document;
  const originalFileReader = globalThis.FileReader;
  const originalImage = globalThis.Image;

  class MockFileReader {
    constructor() {
      this.result = null;
      this.error = null;
      this.listeners = { load: [], error: [] };
    }

    addEventListener(type, listener) {
      this.listeners[type]?.push(listener);
    }

    readAsDataURL(blob) {
      blob
        .arrayBuffer()
        .then((buffer) => {
          this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString("base64")}`;
          for (const listener of this.listeners.load) listener();
        })
        .catch((error) => {
          this.error = error;
          for (const listener of this.listeners.error) listener();
        });
    }
  }

  class MockImage {
    set src(_value) {
      queueMicrotask(() => this.onload?.());
    }
  }

  globalThis.document = {
    createElement(tag) {
      assert.equal(tag, "canvas");
      return {
        width: 0,
        height: 0,
        getContext(kind) {
          assert.equal(kind, "2d");
          return {
            fillStyle: "",
            fillRect() {},
            drawImage() {},
          };
        },
        toBlob(callback) {
          callback(new Blob([jpeg], { type: "image/jpeg" }));
        },
      };
    },
  };
  globalThis.FileReader = MockFileReader;
  globalThis.Image = MockImage;

  try {
    return await run();
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
    if (originalFileReader === undefined) delete globalThis.FileReader;
    else globalThis.FileReader = originalFileReader;
    if (originalImage === undefined) delete globalThis.Image;
    else globalThis.Image = originalImage;
  }
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

test("imageToPdfBytes preserves visible text opacity", () => {
  const pdf = imageToPdfBytes(jpeg, {
    imageWidth: 1,
    imageHeight: 1,
    textMode: "visible",
    textRuns: [{ text: "Faded", x: 0, y: 1, opacity: 0.25 }],
  });
  const text = latin1(pdf);
  assert.match(text, /\/ExtGState << \/GS0 \d+ 0 R >>/);
  assert.match(text, /\/GS0 gs/);
  assert.match(text, /\/ca 0\.25 \/CA 0\.25/);
});

test("imagesToPdfBytes writes multiple images as separate PDF pages", () => {
  const pdf = imagesToPdfBytes(
    [
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
    ],
    { title: "Two page PDF" },
  );
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

test("svgToPdfBytes rejects raster dimension multiplication overflow", async () => {
  await assert.rejects(
    () =>
      import("../dist/pdf.js").then(({ svgToPdfBytes }) =>
        svgToPdfBytes('<svg width="1e308" height="1" viewBox="0 0 1e308 1"></svg>', { scale: 2 }),
      ),
    /multiplied by scale must be finite/,
  );
});

test("svgToPdfBytes accepts supported SVG length forms", async () => {
  await withMockSvgEnvironment(async () => {
    for (const [width, expectedWidth] of [
      ["+12.5px", 12.5],
      [".5cm", 0.5],
      ["3.", 3],
      ["1E2pt", 100],
      ["2e+1IN", 20],
    ]) {
      const pdf = latin1(await svgToPdfBytes(`<svg width="${width}" height="7"></svg>`));
      assert.deepEqual(mediaBox(pdf), [expectedWidth, 7]);
    }
  });
});

test("svgToPdfBytes rejects malformed, percentage, non-positive, and non-finite SVG lengths", async () => {
  await withMockSvgEnvironment(async () => {
    for (const width of ["1e", "1.2.3", "50%", "0", "-1", "1e309"]) {
      const pdf = latin1(await svgToPdfBytes(`<svg width="${width}" height="7"></svg>`));
      assert.deepEqual(mediaBox(pdf), [100, 7]);
    }
  });
});

test("svgToPdfBytes falls back to viewBox dimensions for whitespace- and comma-delimited values", async () => {
  await withMockSvgEnvironment(async () => {
    const whitespace = latin1(await svgToPdfBytes('<svg viewBox="10 20 30 40"></svg>'));
    assert.deepEqual(mediaBox(whitespace), [30, 40]);

    const comma = latin1(await svgToPdfBytes('<svg viewBox="10,20,30,40"></svg>'));
    assert.deepEqual(mediaBox(comma), [30, 40]);
  });
});

test("svgToPdfBytes falls back to default dimensions for empty or malformed viewBox attributes", async () => {
  await withMockSvgEnvironment(async () => {
    const empty = latin1(await svgToPdfBytes('<svg viewBox=""></svg>'));
    assert.deepEqual(mediaBox(empty), [100, 100]);

    const malformed = latin1(await svgToPdfBytes('<svg viewBox="0 0 30"></svg>'));
    assert.deepEqual(mediaBox(malformed), [100, 100]);
  });
});
