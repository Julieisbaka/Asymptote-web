import assert from "node:assert/strict";
import test from "node:test";
import { epsToSvg, psToSvg } from "../dist/asymptote-web.js";

const header = `%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 100 100\n`;

function convert(body, options) {
  return epsToSvg(header + body, options);
}

test("converts a filled path with compact coordinates", () => {
  const svg = convert("newpath 0 0 moveto 10.5000 20.0000 lineto closepath fill");

  assert.match(svg, /<path d="M0,100 L10\.5,80 Z" fill="black"\/>/);
  assert.doesNotMatch(svg, /10\.500|20\.000/);
});

test("preserves text escaping and standard font mapping", () => {
  const svg = convert("/Helvetica findfont 12 scalefont setfont 10 20 moveto (A & <) show");

  assert.match(svg, /font-family="Arial, sans-serif"/);
  assert.match(svg, />A &amp; &lt;<\/text>/);
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
  assert.match(svg, /opacity="0\.5"/);
});

test("rejects invalid precision", () => {
  assert.throws(() => epsToSvg(header, { precision: 13 }), RangeError);
});

test("keeps psToSvg as the public alias", () => {
  assert.equal(psToSvg, epsToSvg);
});
