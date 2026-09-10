import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { epsToSvg, epsToSvgWithWarnings, psToSvg } from "../dist/asymptote-web.js";

const header = `%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 100 100\n`;

function convert(body, options) {
  return epsToSvg(header + body, options);
}

test("converts a filled path with compact coordinates", () => {
  const svg = convert("newpath 0 0 moveto 10.5000 20.0000 lineto closepath fill");

  assert.match(svg, /<path d="M0,100 L10\.5,80 Z" fill="black"\/>/);
  assert.doesNotMatch(svg, /10\.500|20\.000/);
});

test("adds accessible SVG metadata when requested", () => {
  const svg = convert("newpath 0 0 moveto 10 10 lineto stroke", {
    accessibility: {
      title: "Diagonal line",
      description: "A line from the lower-left to the upper-right.",
    },
  });

  assert.match(svg, /role="img"/);
  assert.match(svg, /aria-labelledby="asy-title-\d+"/);
  assert.match(svg, /aria-describedby="asy-description-\d+"/);
  assert.match(svg, /<title id="asy-title-\d+">Diagonal line<\/title>/);
  assert.match(svg, /<desc id="asy-description-\d+">A line from the lower-left to the upper-right\.<\/desc>/);
});

test("accepts scientific-notation coordinates emitted by Asymptote", () => {
  const result = epsToSvgWithWarnings(
    header + "newpath 10 20 moveto 4.78047431e-15 30 lineto stroke"
  );

  assert.match(result.svg, /<path d="M10,80 L0,70/);
  assert.doesNotMatch(result.warnings.join("\n"), /4\.78047431e-15/);
});

test("accepts scientific-notation bounding boxes", () => {
  const svg = epsToSvg(
    "%!PS-Adobe-3.0 EPSF-3.0\n%%HiResBoundingBox: -1e1 -2e1 1e2 2e2\n"
  );

  assert.match(svg, /width="110" height="220"/);
});

test("normalizes invalid dimensions and tiny negative coordinates", () => {
  const svg = epsToSvg(
    "%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 10 20 0 0\n" +
    "newpath -4e-15 0 moveto 1 1 lineto stroke"
  );

  assert.match(svg, /width="100" height="100"/);
  assert.match(svg, /<path d="M-10,120/);
  assert.doesNotMatch(svg, /-0/);
});

test("converts arc and arcn into cubic SVG curves", () => {
  const svg = convert(
    "newpath 50 50 25 0 90 arc stroke " +
    "newpath 50 50 25 0 90 arcn stroke"
  );

  assert.equal((svg.match(/<path /g) ?? []).length, 2);
  assert.match(svg, /C/);
});

test("supports relative curves and tangent arcs", () => {
  const svg = convert(
    "newpath 10 10 moveto 5 0 5 5 0 5 rcurveto stroke " +
    "newpath 10 50 moveto 20 50 20 70 5 arct stroke"
  );

  assert.equal((svg.match(/<path /g) ?? []).length, 2);
  assert.match(svg, /C/);
});

test("keeps relative paths in user space under transforms", () => {
  const svg = convert(
    "2 2 scale newpath 10 10 moveto 5 0 rlineto 0 5 rlineto stroke"
  );

  assert.match(svg, /<path d="M20,80 L30,80 L30,70/);
});

test("restores currentpoint to the subpath start after closepath", () => {
  const svg = convert(
    "newpath 10 10 moveto 20 10 lineto 20 20 lineto closepath 5 0 rlineto stroke"
  );

  assert.match(svg, /M10,90 L20,90 L20,80 Z L15,90/);
});

test("clears the current path after painting", () => {
  const svg = convert(
    "newpath 0 0 moveto 10 0 lineto stroke 20 20 moveto 30 20 lineto stroke"
  );

  const paths = svg.match(/<path d="([^"]+)" fill="none"/g) ?? [];
  assert.equal(paths.length, 2);
  assert.match(paths[1], /d="M20,80 L30,80"/);
});

test("intersects successive clipping paths", () => {
  const svg = convert(
    "newpath 0 0 moveto 50 0 lineto 50 100 lineto 0 100 lineto closepath clip " +
    "newpath 0 50 moveto 100 50 lineto 100 100 lineto 0 100 lineto closepath clip " +
    "newpath 0 0 moveto 100 0 lineto 100 100 lineto 0 100 lineto closepath fill"
  );

  assert.match(svg, /<clipPath id="asy-clip-2"><g clip-path="url\(#asy-clip-1\)">/);
  assert.match(svg, /clip-path="url\(#asy-clip-2\)"/);
});

test("supports concat and setmatrix", () => {
  const svg = convert(
    "[1 0 0 1 10 20] concat newpath 0 0 moveto 10 0 lineto stroke " +
    "[1 0 0 1 30 40] setmatrix newpath 0 0 moveto 10 0 lineto stroke"
  );

  assert.match(svg, /M10,80 L20,80/);
  assert.match(svg, /M30,60 L40,60/);
});

test("preserves text escaping and standard font mapping", () => {
  const svg = convert("/Helvetica findfont 12 scalefont setfont 10 20 moveto (A & <) show");

  assert.match(svg, /font-family="Arial, sans-serif"/);
  assert.match(svg, />A &amp; &lt;<\/text>/);
});

test("allows custom CSS font mappings", () => {
  const svg = convert(
    "/Helvetica findfont 12 scalefont setfont 10 20 moveto (custom) show " +
    "/MyFont findfont 12 scalefont setfont 10 30 moveto (mapped) show",
    { fonts: { Helvetica: "Inter, sans-serif", MyFont: "My Web Font" } }
  );

  assert.match(svg, /font-family="Inter, sans-serif"/);
  assert.match(svg, /font-family="My Web Font"/);
});

test("deduplicates identical gradient definitions", () => {
  const svg = convert(
    "0 0 100 0 [0 1 0 0 1 0 0 1] setlineargradient " +
    "newpath 0 0 moveto 100 0 lineto 100 100 lineto closepath fill " +
    "newpath 10 10 moveto 90 10 lineto 90 90 lineto closepath fill"
  );

  assert.equal((svg.match(/<linearGradient/g) ?? []).length, 1);
  assert.equal((svg.match(/fill="url\(#asy-gradient-1\)"/g) ?? []).length, 2);
});

test("uses an affine SVG gradient transform", () => {
  const svg = convert(
    "2 0.5 scale 30 rotate " +
    "0 0 100 0 [0 1 0 0 1 0 0 1] setlineargradient " +
    "newpath 0 0 moveto 100 0 lineto 100 100 lineto closepath fill"
  );

  assert.match(svg, /gradientTransform="matrix\([^\)]*\)"/);
  assert.doesNotMatch(svg, /x2="200"/);
});

test("preserves radial gradients and opacity", () => {
  const svg = convert(
    "50 50 0 50 50 50 [0 1 1 1 1 0 0 0] setradialgradient " +
    "0.5 setopacityalpha newpath 0 0 moveto 100 0 lineto 100 100 lineto closepath fill"
  );

  assert.match(svg, /<radialGradient/);
  assert.match(svg, /fr="0"/);
  assert.match(svg, /opacity="0\.5"/);
});

test("converts grayscale and CMYK shading stops", () => {
  const grayscale = convert(
    "newpath 0 0 moveto 100 0 lineto 100 100 lineto 0 100 lineto closepath " +
    "<< /ShadingType 2 /Coords [0 0 100 0] /ColorSpace /DeviceGray /C0 [0] /C1 [1] >> shfill"
  );
  const cmyk = convert(
    "newpath 0 0 moveto 100 0 lineto 100 100 lineto 0 100 lineto closepath " +
    "<< /ShadingType 2 /Coords [0 0 100 0] /ColorSpace /DeviceCMYK /C0 [0 1 1 0] /C1 [1 0 1 0] >> shfill"
  );

  assert.match(grayscale, /stop-color="rgb\(0,0,0\)"/);
  assert.match(grayscale, /stop-color="rgb\(255,255,255\)"/);
  assert.match(cmyk, /stop-color="rgb\(255,0,0\)"/);
  assert.match(cmyk, /stop-color="rgb\(0,255,0\)"/);
});

test("does not erase unrelated operands for unknown setcolor", () => {
  const svg = convert("(keep) /DeviceN setcolorspace 1 setcolor 0 0 moveto (keep) show");

  assert.match(svg, />keep<\/text>/);
});

test("ignores braces inside procedure strings and comments", () => {
  const svg = convert(
    "/foo { (text containing } (nested) brace) % comment with } brace\n } bind def " +
    "newpath 0 0 moveto 10 0 lineto stroke"
  );

  assert.match(svg, /<path d="M0,100 L10,100/);
  assert.doesNotMatch(svg, /unsupported operator.*brace/);
});

test("converts HSB colors to RGB", () => {
  const svg = convert("0 1 1 sethsbcolor newpath 0 0 moveto 10 0 lineto stroke");

  assert.match(svg, /stroke="rgb\(255,0,0\)"/);
});

test("clamps colors and opacity to valid SVG values", () => {
  const svg = convert(
    "2 setgray -1 0 3 setrgbcolor -1 setopacityalpha " +
    "newpath 0 0 moveto 10 0 lineto stroke"
  );

  assert.match(svg, /stroke="rgb\(0,0,255\)"/);
  assert.match(svg, /opacity="0"/);
});

test("converts bounded 8-bit grayscale image data", () => {
  const svg = convert("2 1 8 [2 0 0 -1 0 1] (\x00\xff) image");

  assert.match(svg, /<image /);
  assert.match(svg, /data:image\/svg\+xml;base64,/);
});

test("merges adjacent same-color image pixels into single runs", () => {
  const svg = convert("3 1 8 [3 0 0 -1 0 1] (\x00\x00\x80) image");
  const encoded = svg.match(/base64,([^"]+)/)[1];
  const embedded = Buffer.from(encoded, "base64").toString("utf8");

  assert.match(embedded, /<rect x="0" y="0" width="2" height="1" fill="rgb\(0,0,0\)"\/>/);
  assert.match(embedded, /<rect x="2" y="0" width="1" height="1" fill="rgb\(128,128,128\)"\/>/);
  assert.equal(embedded.match(/<rect /g).length, 2);
});

test("maps styled and symbolic PostScript fonts", () => {
  const svg = convert(
    "/Helvetica-BoldOblique findfont 12 scalefont setfont 10 20 moveto (A) show " +
    "/Symbol findfont 12 scalefont setfont 20 20 moveto (b) show " +
    "/TimesNewRomanPS-BoldItalicMT findfont 12 scalefont setfont 30 20 moveto (c) show " +
    "/CourierNewPS-ItalicMT findfont 12 scalefont setfont 40 20 moveto (d) show " +
    "/Palatino-Bold findfont 12 scalefont setfont 50 20 moveto (e) show " +
    "/AvantGarde-BookOblique findfont 12 scalefont setfont 60 20 moveto (f) show"
  );

  assert.match(svg, /font-family="Arial, sans-serif"[^>]*font-weight="700"[^>]*font-style="oblique"/);
  assert.match(svg, /font-family="Symbol, serif"/);
  assert.match(svg, /font-family="Times New Roman, serif"[^>]*font-weight="700"[^>]*font-style="italic"/);
  assert.match(svg, /font-family="Courier New, monospace"[^>]*font-style="italic"/);
  assert.match(svg, /font-family="Palatino Linotype, Palatino, serif"[^>]*font-weight="700"/);
  assert.match(svg, /font-family="Avant Garde, Century Gothic, sans-serif"[^>]*font-style="oblique"/);
});

test("emits per-character spacing adjustments", () => {
  const svg = convert(
    "10 20 moveto 1 0 (AB) ashow " +
    "10 40 moveto 2 0 32 (A B) widthshow " +
    "10 60 moveto 1 0 2 0 65 (AB) awidthshow"
  );

  assert.match(svg, /<tspan dx="1" dy="0">B<\/tspan>/);
  assert.match(svg, /<tspan dx="2" dy="0">B<\/tspan>/);
  assert.match(svg, /<tspan dx="3" dy="0">B<\/tspan>/);
});

test("reports unsupported content without stopping conversion", () => {
  const result = epsToSvgWithWarnings(
    header +
    "/DeviceN setcolorspace " +
    "image " +
    "<< /ShadingType 4 /Coords [] >> shfill " +
    "futureoperator " +
    "newpath 0 0 moveto 10 0 lineto stroke"
  );

  assert.match(result.svg, /<path d="M0,100 L10,100/);
  assert.equal(result.warnings.length, 4);
  assert.match(result.warnings[0], /unsupported color space/);
  assert.match(result.warnings[1], /raster image/);
  assert.match(result.warnings[2], /mesh shading/);
  assert.match(result.warnings[3], /unsupported operator/);
});

test("rejects invalid precision", () => {
  assert.throws(() => epsToSvg(header, { precision: 13 }), RangeError);
});

test("keeps psToSvg as the public alias", () => {
  assert.equal(psToSvg, epsToSvg);
});

test("native text patch includes lowercase glyphs and proportional advances", async () => {
  const patch = await readFile(new URL("../wasm/patches/native-text-font.py", import.meta.url), "utf8");

  assert.match(patch, /"a": strokes/);
  assert.match(patch, /"z": strokes/);
  assert.match(patch, /"&": strokes/);
  assert.match(patch, /glyphAdvanceTenths/);
  assert.doesNotMatch(patch, /character >= 'a' && character <= 'z'/);
  assert.match(patch, /glyphChars\[gi\] == character/);
});

test("supports rich custom font descriptors with inferred fallback styles", () => {
  const svg = convert(
    "/Helvetica-BoldOblique findfont 12 scalefont setfont 10 20 moveto (A) show " +
    "/UnknownNarrowPS-BoldMT findfont 12 scalefont setfont 20 20 moveto (B) show",
    {
      fonts: {
        Helvetica: { family: "Inter", fallbacks: ["Arial", "sans-serif"], weight: 500 },
      },
    }
  );

  assert.match(svg, /font-family="Inter, Arial, sans-serif"[^>]*font-weight="500"[^>]*font-style="oblique"/);
  assert.match(svg, /font-family="UnknownNarrowPS-BoldMT, sans-serif"[^>]*font-weight="700"[^>]*font-stretch="condensed"/);
});

test("reports unknown fonts once per font name", () => {
  const result = epsToSvgWithWarnings(
    header +
    "/MysterySans findfont 10 scalefont setfont 0 10 moveto (A) show " +
    "/MysterySans findfont 10 scalefont setfont 0 20 moveto (B) show " +
    "/AnotherMystery findfont 10 scalefont setfont 0 30 moveto (C) show"
  );

  const warnings = result.warnings.filter((warning) => /unknown font/.test(warning));
  assert.equal(warnings.length, 2);
});

test("warns for malformed custom font descriptors", () => {
  const result = epsToSvgWithWarnings(
    header + "/BadFont findfont 10 scalefont setfont 0 10 moveto (A) show",
    {
      fonts: {
        BadFont: {},
      },
    }
  );

  assert.match(result.warnings.join("\n"), /malformed custom font descriptor/);
});

test("groups native-label paths and emits semantic metadata", () => {
  const result = epsToSvgWithWarnings(
    header +
    "<< /text (alpha) /font (Helvetica) /size 12 >> asy_label_begin " +
    "newpath 10 10 moveto 20 20 lineto stroke " +
    "asy_label_end"
  );

  assert.match(result.svg, /<g class="asy-native-label"[^>]*data-asy-label-text="alpha"[^>]*>/);
  assert.match(result.svg, /<g class="asy-native-label"[\s\S]*<path /);
  assert.match(result.svg, /<text opacity="0" fill="none" stroke="none" aria-hidden="false">alpha<\/text>/);
});

test("warns on malformed or unmatched native-label markers", () => {
  const result = epsToSvgWithWarnings(
    header +
    "(bad) asy_label_begin " +
    "newpath 0 0 moveto 10 0 lineto stroke " +
    "asy_label_end"
  );

  assert.match(result.warnings.join("\n"), /malformed native-label begin marker/);
  assert.match(result.warnings.join("\n"), /unmatched native-label end marker/);
});

test("native text patch decodes UTF-8 Greek and math aliases", async () => {
  const patch = await readFile(new URL("../wasm/patches/native-text-font.py", import.meta.url), "utf8");

  assert.match(patch, /unsigned int codepoint/);
  assert.match(patch, /case 0x03B1: character='a'/);
  assert.match(patch, /case 0x2264: character='<'/);
  assert.match(patch, /case 0x221E: character='8'/);
});

test("browser TeX fallback includes descender depth", async () => {
  const patch = await readFile(new URL("../wasm/patches/browser-tex-fallback.py", import.meta.url), "utf8");

  assert.match(patch, /\(\*t\)\[2\]=0\.2\*fontsize/);
});

test("native label metadata patch emits begin/end marker operators", async () => {
  const patch = await readFile(new URL("../wasm/patches/native-label-metadata.py", import.meta.url), "utf8");

  assert.match(patch, /asy_label_begin/);
  assert.match(patch, /asy_label_end/);
});
