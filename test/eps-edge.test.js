import assert from "node:assert/strict";
import test from "node:test";
import { epsToSvg, epsToSvgWithWarnings } from "../dist/asymptote-web.js";

const header = "%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 100 100\n";
const convert = (body) => epsToSvg(header + body);
const convertWithWarnings = (body) => epsToSvgWithWarnings(header + body);

test("handles escaped and nested PostScript strings", () => {
  const svg = convert("10 20 moveto (outer \\(inner\\) text) show");

  assert.match(svg, />outer \(inner\) text<\/text>/);
});

test("supports opacity aliases and even-odd clipping", () => {
  const svg = convert(
    "0.25 setalpha newpath 0 0 moveto 100 0 lineto 100 100 lineto 0 100 lineto closepath eoclip " +
    "newpath 0 0 moveto 100 0 lineto 100 100 lineto 0 100 lineto closepath fill"
  );

  assert.match(svg, /clip-rule="evenodd"/);
  assert.match(svg, /opacity="0\.25"/);
});

test("ignores empty paint operations without emitting paths", () => {
  const result = convertWithWarnings("fill stroke eofill");

  assert.doesNotMatch(result.svg, /<path /);
  assert.deepEqual(result.warnings, []);
});

test("reports unsupported raster image variants", () => {
  const result = convertWithWarnings(
    "1 1 1 [1 0 0 -1 0 1] (\x00) image " +
    "colorimage imagemask " +
    "513 513 8 [513 0 0 -1 0 513] () image"
  );

  assert.equal(result.warnings.length, 4);
  assert.match(result.warnings[0], /only 8-bit grayscale/);
  assert.match(result.warnings[1], /colorimage/);
  assert.match(result.warnings[2], /imagemask/);
  assert.match(result.warnings[3], /only 8-bit grayscale/);
});

test("handles malformed matrices and patterns with warnings", () => {
  const result = convertWithWarnings(
    "[1 2] concat 0 0 10 10 [1 2] makepattern setpattern " +
    "newpath 0 0 moveto 10 10 lineto stroke"
  );

  assert.match(result.svg, /<path /);
  assert.match(result.warnings.join("\n"), /malformed concat matrix|unsupported or malformed shading/);
});

test("handles singular transforms without throwing", () => {
  const svg = convert("[0 0 0 0 0 0] setmatrix newpath 10 10 moveto 20 20 rlineto stroke");

  assert.match(svg, /^<svg/);
});
