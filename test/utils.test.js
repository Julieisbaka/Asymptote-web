import assert from "node:assert/strict";
import test from "node:test";
import {
  colorFromComponents,
  composeMatrix,
  hsbToColor,
  identityMatrix,
  parseCompilerDiagnostics,
} from "../dist/utils.js";

const publicUtils = await import("asymptote-web/utils");

test("exports the utility API from the package subpath", () => {
  for (const name of [
    "parseCompilerDiagnostics",
    "identityMatrix",
    "composeMatrix",
    "colorFromComponents",
    "hsbToColor",
  ]) {
    assert.equal(typeof publicUtils[name], "function");
  }
  assert.deepEqual(publicUtils.identityMatrix(), identityMatrix());
});

test("creates and composes affine matrices in PostScript order", () => {
  assert.deepEqual(identityMatrix(), { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
  assert.deepEqual(
    composeMatrix({ a: 2, b: 0, c: 0, d: 3, e: 10, f: 20 }, { a: 1, b: 0, c: 0, d: 1, e: 4, f: 5 }),
    { a: 2, b: 0, c: 0, d: 3, e: 18, f: 35 },
  );
});

test("converts gray, RGB, CMYK, and invalid color component lists", () => {
  assert.equal(colorFromComponents([0.5]), "rgb(128,128,128)");
  assert.equal(colorFromComponents([1, 0, 0]), "rgb(255,0,0)");
  assert.equal(colorFromComponents([0, 1, 1, 0]), "rgb(255,0,0)");
  assert.equal(colorFromComponents([2, -1, Number.NaN]), "rgb(255,0,0)");
  assert.equal(colorFromComponents([]), "black");
});

test("converts normalized HSB colors and wraps hue", () => {
  assert.equal(hsbToColor(0, 1, 1), "rgb(255,0,0)");
  assert.equal(hsbToColor(1 / 3, 1, 1), "rgb(0,255,0)");
  assert.equal(hsbToColor(-1 / 3, 1, 1), "rgb(0,0,255)");
  assert.equal(hsbToColor(0, 0, 0.5), "rgb(128,128,128)");
});

test("parses compiler diagnostics from the utility bundle", () => {
  assert.deepEqual(
    parseCompilerDiagnostics("example.asy: 4.2: warning [scale]: too large\ninfo: done"),
    [
      {
        severity: "warning",
        message: "too large",
        sourceFile: "example.asy",
        line: 4,
        column: 2,
        code: "scale",
        raw: "example.asy: 4.2: warning [scale]: too large",
      },
      { severity: "info", message: "done", raw: "info: done" },
    ],
  );
});

test("preserves diagnostic severity parsing across rewritten branches", () => {
  assert.deepEqual(
    parseCompilerDiagnostics(
      [
        "ERROR  : [syntax] exploded",
        "RuNtImE failed without colon",
        "note: background detail",
        "diagram.asy: 7.9: NoTe : located detail",
        "warningly not a warning",
      ].join("\n"),
    ),
    [
      {
        severity: "error",
        code: "syntax",
        message: "exploded",
        raw: "ERROR  : [syntax] exploded",
      },
      {
        severity: "error",
        message: "failed without colon",
        raw: "RuNtImE failed without colon",
      },
      {
        severity: "info",
        message: "background detail",
        raw: "note: background detail",
      },
      {
        severity: "error",
        message: "located detail",
        sourceFile: "diagram.asy",
        line: 7,
        column: 9,
        raw: "diagram.asy: 7.9: NoTe : located detail",
      },
      {
        severity: "info",
        message: "warningly not a warning",
        raw: "warningly not a warning",
      },
    ],
  );
});
